/**
 * Cliente do lumexa-core (backend principal da empresa) — SOMENTE LEITURA.
 *
 * Hoje serve para puxar dois cadastros: médicos (`GET /api/admin/doctors`) e
 * vendedoras/salesreps (`GET /api/admin/salesreps`), usados para semear/atualizar
 * as tabelas `medicos` e `vendedoras` locais.
 * O token de acesso (bearer) fica no secret `TOKEN_LUMEXA` e nunca vai ao
 * frontend nem aos logs; a URL base é configurável por `LUMEXA_CORE_URL`.
 *
 * Diferente do cliente de leitura da Autentique (que degrada em silêncio para
 * não quebrar o carregamento do paciente), aqui a falha LANÇA — o import de
 * médicos é uma ação explícita e deve reportar o erro a quem disparou.
 */

const BASE_URL = process.env.LUMEXA_CORE_URL ?? "https://core-api.camada.ai";
const TIMEOUT_MS = 15000;

/** Erro do cliente do core — mensagem segura para a equipe (sem segredos). */
export class LumexaCoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LumexaCoreError";
  }
}

/** Médico como o core o expõe em /api/admin/doctors. */
export interface CoreDoctor {
  id: string;
  first_name: string;
  last_name: string | null;
  specialty: string | null;
  email: string | null;
  is_active: boolean;
  custom_attributes: Record<string, unknown> | null;
}

/**
 * Vendedora/salesrep como o core a expõe em /api/admin/salesreps.
 */
export interface CoreSalesrep {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  chatwoot_agent_id: number | null;
  is_active: boolean;
  custom_attributes: Record<string, unknown> | null;
}

/**
 * GET de uma lista JSON no core, com bearer, timeout e tratamento de erro
 * uniforme. Lança `LumexaCoreError` em qualquer falha. `contexto` entra na
 * mensagem de erro (ex.: "listar médicos").
 */
async function buscarListaCore<T>(path: string, contexto: string): Promise<T[]> {
  const token = process.env.TOKEN_LUMEXA;
  if (!token) {
    throw new LumexaCoreError(
      "Integração com o lumexa-core não configurada (TOKEN_LUMEXA ausente).",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(`${BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!resp.ok) {
      throw new LumexaCoreError(
        `lumexa-core respondeu ${resp.status} ao ${contexto}.`,
      );
    }

    const json: unknown = await resp.json();
    if (!Array.isArray(json)) {
      throw new LumexaCoreError(
        `Resposta inesperada do lumexa-core ao ${contexto} (esperava uma lista).`,
      );
    }
    return json as T[];
  } catch (err) {
    if (err instanceof LumexaCoreError) throw err;
    const motivo = err instanceof Error ? err.message : String(err);
    throw new LumexaCoreError(`Falha ao contatar o lumexa-core: ${motivo}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Lista os médicos cadastrados no lumexa-core. Lança `LumexaCoreError` em
 * qualquer falha (token ausente, timeout, status !=2xx, resposta inesperada).
 */
export function listarMedicosCore(): Promise<CoreDoctor[]> {
  return buscarListaCore<CoreDoctor>("/api/admin/doctors", "listar médicos");
}

/**
 * Lista as vendedoras (salesreps) cadastradas no lumexa-core. Mesmas garantias
 * de erro que {@link listarMedicosCore}.
 */
export function listarVendedorasCore(): Promise<CoreSalesrep[]> {
  return buscarListaCore<CoreSalesrep>(
    "/api/admin/salesreps",
    "listar vendedoras",
  );
}

/** Contato (People do Twenty) já achatado para o que o cadastro de paciente usa. */
export interface ContatoTwenty {
  /** id do contato no Twenty — vínculo com a pessoa real (guardado no paciente). */
  twentyContactId: string;
  nome: string;
  /** Telefone só com dígitos (ou vazio). */
  telefone: string;
  email: string;
  /** CPF só com dígitos (ou vazio — muitas vezes não preenchido no Twenty). */
  cpf: string;
  cidade: string;
}

/** Forma crua do contato como o proxy /api/twenty/contacts devolve. */
interface PeopleApi {
  id: string;
  name?: { firstName?: string | null; lastName?: string | null } | null;
  phones?: { primaryPhoneNumber?: string | null } | null;
  emails?: { primaryEmail?: string | null } | null;
  cpf?: string | null;
  city?: string | null;
}

interface RespostaContatos {
  data?: { people?: (PeopleApi | null)[] | null } | null;
}

function soDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

/**
 * Busca contatos (pacientes) no Twenty via proxy do core, por nome e/ou telefone.
 * Serve para o cadastro achar a pessoa REAL e puxar telefone/email/CPF. Lança
 * `LumexaCoreError` em qualquer falha. Sem `nome` nem `telefone`, não busca
 * (evita listar os 15k contatos por engano) e devolve lista vazia.
 */
export async function buscarContatosTwenty(params: {
  nome?: string;
  telefone?: string;
}): Promise<ContatoTwenty[]> {
  const nome = params.nome?.trim();
  const telefone = soDigitos(params.telefone);
  if (!nome && !telefone) return [];

  const token = process.env.TOKEN_LUMEXA;
  if (!token) {
    throw new LumexaCoreError(
      "Integração com o lumexa-core não configurada (TOKEN_LUMEXA ausente).",
    );
  }

  const qs = new URLSearchParams();
  // Telefone é mais preciso; quando houver, prioriza. Senão, busca por nome.
  if (telefone) qs.set("phone", telefone);
  else if (nome) qs.set("name", nome);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`${BASE_URL}/api/twenty/contacts?${qs}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!resp.ok) {
      throw new LumexaCoreError(
        `lumexa-core respondeu ${resp.status} ao buscar contatos.`,
      );
    }
    const json = (await resp.json()) as RespostaContatos;
    const people = (json.data?.people ?? []).filter(
      (p): p is PeopleApi => p != null,
    );
    return people.map((p) => ({
      twentyContactId: p.id,
      nome: [p.name?.firstName, p.name?.lastName]
        .map((s) => (s ?? "").trim())
        .filter(Boolean)
        .join(" "),
      telefone: soDigitos(p.phones?.primaryPhoneNumber),
      email: (p.emails?.primaryEmail ?? "").trim(),
      cpf: soDigitos(p.cpf),
      cidade: (p.city ?? "").trim(),
    }));
  } catch (err) {
    if (err instanceof LumexaCoreError) throw err;
    const motivo = err instanceof Error ? err.message : String(err);
    throw new LumexaCoreError(`Falha ao contatar o lumexa-core: ${motivo}`);
  } finally {
    clearTimeout(timer);
  }
}
