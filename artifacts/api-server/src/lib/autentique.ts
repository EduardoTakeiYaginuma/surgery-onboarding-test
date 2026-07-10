/**
 * Cliente Autentique — SOMENTE LEITURA.
 *
 * Consulta o status de assinatura de um documento na Autentique via GraphQL.
 * Nenhuma mutation é usada: nada de criar, enviar ou assinar documentos.
 *
 * A chave de API fica no secret AUTENTIQUE_API_TOKEN e nunca vai ao frontend
 * nem aos logs. Qualquer falha (sem token, link inválido, documento removido,
 * timeout, erro da API) degrada para "indisponivel" — nunca lança exceção, para
 * que o carregamento do paciente jamais quebre por causa do contrato.
 */

const ENDPOINT = "https://api.autentique.com.br/v2/graphql";
const TIMEOUT_MS = 8000;

export type ContratoStatus =
  | "assinado"
  | "pendente"
  | "recusado"
  | "indisponivel";

export interface StatusContrato {
  status: ContratoStatus;
  /** Data ISO da assinatura mais recente quando assinado; senão null. */
  assinadoEm: string | null;
  /**
   * Link público curto de assinatura do primeiro signatário que ainda não
   * assinou (nem recusou). Só vem quando pendente; null caso contrário. Usado
   * como CTA "Assinar o contrato" na página do paciente e no Console.
   */
  linkAssinatura: string | null;
}

const UUID_REGEX =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Extrai o ID do documento da Autentique a partir do que a secretária colar:
 * aceita a URL do painel (ex.: .../documentos/<uuid>) ou o ID puro.
 * Retorna null quando a entrada está vazia.
 */
export function extrairDocumentoId(entrada: string): string | null {
  const txt = entrada.trim();
  if (!txt) return null;

  // Caso mais comum: a URL/ID contém um UUID — é o identificador do documento.
  const uuid = txt.match(UUID_REGEX);
  if (uuid) return uuid[0];

  // ID puro (sem barras nem espaços) → usa como veio.
  if (!txt.includes("/") && !/\s/.test(txt)) return txt;

  // Caso contrário, tenta o último segmento do caminho da URL.
  const semQuery = txt.split(/[?#]/)[0] ?? txt;
  const segmento = semQuery.split("/").filter(Boolean).pop();
  return segmento ?? null;
}

interface AssinaturaApi {
  signed?: { created_at?: string | null } | null;
  rejected?: { created_at?: string | null } | null;
  link?: { short_link?: string | null } | null;
  /**
   * Ação atribuída ao signatário na Autentique (ex.: { name: "SIGN" }). O
   * EMISSOR/dono do documento aparece em `signatures` com `action = null` — ele
   * não precisa assinar. Só entradas com ação contam como assinantes obrigatórios.
   */
  action?: { name?: string | null } | null;
}

interface RespostaApi {
  data?: {
    document?: {
      signatures?: (AssinaturaApi | null)[] | null;
    } | null;
  } | null;
  errors?: unknown;
}

/**
 * Deriva o status único do paciente a partir das assinaturas do documento:
 * - Recusado: algum ASSINANTE OBRIGATÓRIO com `rejected`.
 * - Assinado: todos os assinantes obrigatórios com `signed` (data mais recente).
 * - Pendente: o restante (inclui documento sem assinaturas ainda concluídas).
 *
 * "Assinante obrigatório" = entrada com `action` definida. O EMISSOR/dono do
 * documento aparece em `signatures` com `action = null` e NÃO precisa assinar —
 * contá-lo deixava o contrato eternamente "pendente" mesmo com todas as partes
 * reais já tendo assinado. Fallback: se nenhuma entrada trouxer `action` (query
 * antiga/dado ausente), considera todas, preservando o comportamento anterior.
 */
export function derivarStatus(
  signatures: (AssinaturaApi | null)[],
): StatusContrato {
  const reais = signatures.filter((s): s is AssinaturaApi => s != null);
  const comAcao = reais.filter((s) => s.action != null);
  const obrigatorios = comAcao.length > 0 ? comAcao : reais;

  if (obrigatorios.some((s) => s.rejected)) {
    return { status: "recusado", assinadoEm: null, linkAssinatura: null };
  }

  if (obrigatorios.length > 0 && obrigatorios.every((s) => s.signed)) {
    const datas = obrigatorios
      .map((s) => s.signed?.created_at)
      .filter((d): d is string => !!d)
      .sort();
    return {
      status: "assinado",
      assinadoEm: datas.at(-1) ?? null,
      linkAssinatura: null,
    };
  }

  // Pendente: oferece o link público do primeiro signatário obrigatório que
  // ainda não assinou nem recusou (short_link é o link curto da Autentique).
  const pendente = obrigatorios.find((s) => !s.signed && !s.rejected);
  return {
    status: "pendente",
    assinadoEm: null,
    linkAssinatura: pendente?.link?.short_link ?? null,
  };
}

/** Resultado da busca do arquivo assinado. */
export interface ArquivoAssinado {
  status: ContratoStatus;
  /** URL temporária do PDF assinado na Autentique; só vem quando assinado. */
  url: string | null;
}

interface RespostaArquivoApi {
  data?: {
    document?: {
      files?: { signed?: string | null } | null;
      signatures?: (AssinaturaApi | null)[] | null;
    } | null;
  } | null;
  errors?: unknown;
}

/**
 * Busca a URL do PDF ASSINADO de um documento na Autentique (somente leitura).
 * Só devolve a URL quando o status derivado é "assinado"; em qualquer outro caso
 * (pendente, recusado, sem token, timeout, documento removido) devolve url=null
 * com o status correspondente. Nunca lança — a URL/token nunca chegam ao
 * frontend; quem chama faz o proxy do conteúdo.
 */
export async function obterArquivoAssinado(
  documentoId: string,
): Promise<ArquivoAssinado> {
  const token = process.env.AUTENTIQUE_API_TOKEN;
  if (!token) {
    return { status: "indisponivel", url: null };
  }

  const query = `query ObterArquivoAssinado($id: UUID!) {
    document(id: $id) {
      files { signed }
      signatures {
        action { name }
        signed { created_at }
        rejected { created_at }
      }
    }
  }`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables: { id: documentoId } }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      return { status: "indisponivel", url: null };
    }

    const json = (await resp.json()) as RespostaArquivoApi;
    if (json.errors || !json.data?.document) {
      return { status: "indisponivel", url: null };
    }

    const { status } = derivarStatus(json.data.document.signatures ?? []);
    const signed = json.data.document.files?.signed ?? null;
    // O arquivo assinado só faz sentido quando o documento está assinado.
    if (status !== "assinado" || !signed) {
      return { status, url: null };
    }
    return { status, url: signed };
  } catch {
    return { status: "indisponivel", url: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Consulta o status do contrato na Autentique. Nunca lança — em qualquer falha
 * retorna "indisponivel".
 */
export async function consultarStatusContrato(
  documentoId: string,
): Promise<StatusContrato> {
  const token = process.env.AUTENTIQUE_API_TOKEN;
  if (!token) {
    return { status: "indisponivel", assinadoEm: null, linkAssinatura: null };
  }

  const query = `query ConsultarDocumento($id: UUID!) {
    document(id: $id) {
      signatures {
        action { name }
        signed { created_at }
        rejected { created_at }
        link { short_link }
      }
    }
  }`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables: { id: documentoId } }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      return { status: "indisponivel", assinadoEm: null, linkAssinatura: null };
    }

    const json = (await resp.json()) as RespostaApi;
    if (json.errors || !json.data?.document) {
      return { status: "indisponivel", assinadoEm: null, linkAssinatura: null };
    }

    return derivarStatus(json.data.document.signatures ?? []);
  } catch {
    // Timeout, rede, JSON inválido — degrada silenciosamente.
    return { status: "indisponivel", assinadoEm: null, linkAssinatura: null };
  } finally {
    clearTimeout(timer);
  }
}

/** Situação de um signatário individual do documento na Autentique. */
export interface AssinaturaDetalhe {
  /** Nome do signatário informado na criação (pode vir vazio). */
  nome: string | null;
  /** E-mail do signatário quando a entrega é por e-mail; null quando por link. */
  email: string | null;
  status: "assinado" | "recusado" | "pendente";
  /** Data ISO do ato (assinatura ou recusa); null quando ainda pendente. */
  em: string | null;
}

export interface ListaAssinaturas {
  /**
   * false quando a Autentique está ilegível (sem token, timeout, documento
   * removido, erro da API). Distingue "documento sem signatários" (disponivel:
   * true, lista vazia) de "não consegui ler" (disponivel: false).
   */
  disponivel: boolean;
  assinaturas: AssinaturaDetalhe[];
}

interface AssinaturaListaApi {
  name?: string | null;
  email?: string | null;
  signed?: { created_at?: string | null } | null;
  rejected?: { created_at?: string | null } | null;
  /** Ação do signatário; entradas sem ação são o emissor/dono (não assinam). */
  action?: { name?: string | null } | null;
}

interface RespostaAssinaturasApi {
  data?: {
    document?: { signatures?: (AssinaturaListaApi | null)[] | null } | null;
  } | null;
  errors?: unknown;
}

/**
 * Lista os signatários do documento e a situação de cada um (somente leitura).
 * Diferente de `consultarStatusContrato` (que colapsa tudo num status único),
 * aqui devolvemos um item por signatário para mostrar "por quem já foi assinado".
 * Nunca lança — qualquer falha vira `{ disponivel: false, assinaturas: [] }`.
 */
export async function listarAssinaturasContrato(
  documentoId: string,
): Promise<ListaAssinaturas> {
  const token = process.env.AUTENTIQUE_API_TOKEN;
  if (!token) return { disponivel: false, assinaturas: [] };

  const query = `query ListarAssinaturas($id: UUID!) {
    document(id: $id) {
      signatures {
        name
        email
        action { name }
        signed { created_at }
        rejected { created_at }
      }
    }
  }`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables: { id: documentoId } }),
      signal: controller.signal,
    });

    if (!resp.ok) return { disponivel: false, assinaturas: [] };

    const json = (await resp.json()) as RespostaAssinaturasApi;
    if (json.errors || !json.data?.document) {
      return { disponivel: false, assinaturas: [] };
    }

    const naoNulos = (json.data.document.signatures ?? []).filter(
      (s): s is AssinaturaListaApi => s != null,
    );
    // Só assinantes obrigatórios (com ação); o emissor (action null) não entra.
    // Fallback: se nenhum trouxer ação, mostra todos (comportamento anterior).
    const comAcao = naoNulos.filter((s) => s.action != null);
    const assinaturas: AssinaturaDetalhe[] = (
      comAcao.length > 0 ? comAcao : naoNulos
    )
      .map((s) => {
        const nome = s.name?.trim() || null;
        const email = s.email?.trim() || null;
        if (s.rejected) {
          return { nome, email, status: "recusado", em: s.rejected.created_at ?? null };
        }
        if (s.signed) {
          return { nome, email, status: "assinado", em: s.signed.created_at ?? null };
        }
        return { nome, email, status: "pendente", em: null };
      });

    return { disponivel: true, assinaturas };
  } catch {
    return { disponivel: false, assinaturas: [] };
  } finally {
    clearTimeout(timer);
  }
}
