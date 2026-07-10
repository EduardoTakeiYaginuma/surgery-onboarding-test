/**
 * Cliente Autentique — CAMINHO DE ESCRITA (criação de documento).
 *
 * Separado do `autentique.ts` (somente leitura) de propósito: a leitura degrada
 * para "indisponivel" e nunca lança; a CRIAÇÃO, ao contrário, LANÇA em qualquer
 * falha — para que a rota marque a geração como `falha_envio` e NÃO toque no
 * estado do contrato da paciente (que continua governado pelo fluxo de leitura).
 *
 * Nada aqui roda sem aprovação humana: a rota só chama esta função depois de
 * registrar a aprovação. A chave de API (AUTENTIQUE_API_TOKEN) nunca vai ao
 * frontend nem aos logs.
 */

const ENDPOINT = "https://api.autentique.com.br/v2/graphql";
const TIMEOUT_MS = 30000;

/** Erro do caminho de criação — mensagem segura para a equipe (sem segredos). */
export class CriarContratoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CriarContratoError";
  }
}

export interface DocumentoCriado {
  id: string;
  /** Link curto de assinatura do signatário, quando a Autentique já devolve. */
  linkAssinatura: string | null;
}

interface RespostaCriar {
  data?: {
    createDocument?: {
      id?: string | null;
      signatures?:
        | ({ link?: { short_link?: string | null } | null } | null)[]
        | null;
    } | null;
  } | null;
  errors?: { message?: string }[] | null;
}

const MUTATION = `mutation CriarDocumento($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {
  createDocument(document: $document, signers: $signers, file: $file) {
    id
    signatures { link { short_link } }
  }
}`;

/**
 * Cria um documento na Autentique a partir do PDF aprovado, com UM OU MAIS
 * signatários (contrato: paciente + representante legal; termo: paciente +
 * médico). Para cada signatário: com e-mail, entrega por e-mail; sem e-mail,
 * entrega por LINK (o link curto é devolvido e reaproveitado pelo fluxo de
 * status). Exige ao menos um signatário.
 */
export async function criarDocumentoContrato(args: {
  pdf: Uint8Array;
  nomeDocumento: string;
  signatarios: { nome: string; email?: string | null }[];
}): Promise<DocumentoCriado> {
  const token = process.env.AUTENTIQUE_API_TOKEN;
  if (!token) {
    throw new CriarContratoError(
      "Integração com a Autentique não configurada (token ausente). Configure para enviar contratos.",
    );
  }

  if (!args.signatarios || args.signatarios.length === 0) {
    throw new CriarContratoError(
      "É preciso informar ao menos um signatário para enviar à Autentique.",
    );
  }

  const signers = args.signatarios.map((s) => {
    const email = s.email?.trim();
    return email
      ? { name: s.nome, email, action: "SIGN" }
      : {
          name: s.nome,
          action: "SIGN",
          delivery_method: "DELIVERY_METHOD_LINK",
        };
  });

  const operations = JSON.stringify({
    query: MUTATION,
    variables: {
      document: { name: args.nomeDocumento },
      signers,
      file: null,
    },
  });

  const form = new FormData();
  form.append("operations", operations);
  form.append("map", JSON.stringify({ "0": ["variables.file"] }));
  form.append(
    "0",
    new Blob([Buffer.from(args.pdf)], { type: "application/pdf" }),
    "contrato.pdf",
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let json: RespostaCriar;
  try {
    const resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: controller.signal,
    });
    if (!resp.ok) {
      throw new CriarContratoError(
        `A Autentique recusou a criação (HTTP ${resp.status}). Tente novamente.`,
      );
    }
    json = (await resp.json()) as RespostaCriar;
  } catch (err) {
    if (err instanceof CriarContratoError) throw err;
    throw new CriarContratoError(
      "Não foi possível falar com a Autentique agora. Tente novamente.",
    );
  } finally {
    clearTimeout(timer);
  }

  if (json.errors?.length) {
    const msg = json.errors[0]?.message;
    throw new CriarContratoError(
      msg
        ? `A Autentique rejeitou o documento: ${msg}`
        : "A Autentique rejeitou o documento. Verifique os dados e tente novamente.",
    );
  }

  const criado = json.data?.createDocument;
  if (!criado?.id) {
    throw new CriarContratoError(
      "A Autentique não devolveu o documento criado. Tente novamente.",
    );
  }

  const linkAssinatura =
    criado.signatures?.find((s) => s?.link?.short_link)?.link?.short_link ??
    null;

  return { id: criado.id, linkAssinatura };
}
