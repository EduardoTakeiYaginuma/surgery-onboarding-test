/**
 * Test-data helpers that talk directly to the shared API server (not through the
 * browser), so each test owns an isolated patient and cleans up after itself.
 */

import { cpfValido } from "@workspace/br-validacao";

const apiDomain = process.env.REPLIT_DEV_DOMAIN;

export const API_BASE = `https://${apiDomain}/api`;

// A valid Brazilian phone shape accepted by the API's validation.
const TELEFONE_VALIDO = "11987654321";

/**
 * Computes a CPF check digit using the same weighted-sum rule as the API's
 * validation (`@workspace/br-validacao` `cpfValido`): the source of truth for
 * what the POST /pacientes route will accept.
 */
function digitoVerificadorCpf(base: string, pesoInicial: number): number {
  let soma = 0;
  for (let i = 0; i < base.length; i++) {
    soma += Number(base[i]) * (pesoInicial - i);
  }
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

/**
 * Generates a fresh, checksum-valid CPF so every test patient is unique. The
 * create-time CPF-uniqueness check (`obterPorCpf`) does NOT exclude archived
 * patients, so reusing one hardcoded CPF made the 2nd+ tests fail with HTTP 409
 * once a prior test's patient was archived. A unique CPF per patient lets the
 * whole suite run back-to-back. The result is asserted against the shared
 * `cpfValido` so it always passes the same checksum the API enforces.
 */
export function gerarCpfValido(): string {
  for (let tentativa = 0; tentativa < 100; tentativa++) {
    let base = "";
    for (let i = 0; i < 9; i++) base += Math.floor(Math.random() * 10);
    // Rejected by cpfValido as a repeated sequence — regenerate.
    if (/^(\d)\1{8}$/.test(base)) continue;
    const d1 = digitoVerificadorCpf(base, 10);
    const comD1 = base + d1;
    const d2 = digitoVerificadorCpf(comD1, 11);
    const cpf = comD1 + d2;
    if (cpfValido(cpf)) return cpf;
  }
  throw new Error("Não foi possível gerar um CPF válido para o teste");
}

export interface CreatedPaciente {
  id: number;
  nome: string;
  /** Opaque public share code used to reach the patient page at /p/:token. */
  token: string;
  /** The (checksum-valid) CPF the patient was created with — needed by the
   * duplicate-CPF e2e to retype the exact same value into the novo-paciente form. */
  cpf: string;
}

export interface CriarPacienteOpcoes {
  /** CPF a usar (apenas dígitos). Omitido = um CPF válido aleatório. */
  cpf?: string;
  /** Chave do hospital (paciente.local), ex.: "Vila Nova Star". Omitido = padrão. */
  local?: string;
  /** Nome da equipe de anestesia (texto livre), ex.: "Zenicare". Omitido = padrão. */
  equipeAnestesia?: string;
  /** Telefone da equipe de anestesia (texto livre). Omitido = não informado. */
  equipeAnestesiaTelefone?: string;
  /** Médico vinculado (id). Omitido = médico padrão (snapshot da Dra. Karla). */
  medicoId?: number;
  /** Saldo em aberto (R$). > 0 deixa os honorários pendentes. Omitido = 0. */
  valorPendente?: number;
  /** Vencimento do saldo (YYYY-MM-DD). Obrigatório quando há saldo em aberto. */
  dataPagamentoPendente?: string;
  /** Data da cirurgia (YYYY-MM-DD). Omitido = data padrão distante. */
  dataCirurgia?: string;
}

export async function criarPacienteTeste(
  opcoes: CriarPacienteOpcoes = {},
): Promise<CreatedPaciente> {
  const sufixo = Math.random().toString(36).slice(2, 8);
  const cpf = opcoes.cpf ?? gerarCpfValido();
  const res = await fetch(`${API_BASE}/pacientes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      nome: `ZZ Teste Tema ${sufixo}`,
      cpf,
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: opcoes.dataCirurgia ?? "2026-08-15",
      valorSinal: 3000,
      ...(opcoes.local ? { local: opcoes.local } : {}),
      ...(opcoes.equipeAnestesia
        ? { equipeAnestesia: opcoes.equipeAnestesia }
        : {}),
      ...(opcoes.equipeAnestesiaTelefone
        ? { equipeAnestesiaTelefone: opcoes.equipeAnestesiaTelefone }
        : {}),
      ...(opcoes.medicoId != null ? { medicoId: opcoes.medicoId } : {}),
      ...(opcoes.valorPendente != null
        ? { valorPendente: opcoes.valorPendente }
        : {}),
      ...(opcoes.dataPagamentoPendente
        ? { dataPagamentoPendente: opcoes.dataPagamentoPendente }
        : {}),
    }),
  });
  if (res.status !== 201) {
    throw new Error(
      `Falha ao criar paciente de teste (${res.status}): ${await res.text()}`,
    );
  }
  const body = (await res.json()) as {
    paciente: { id: number; nome: string; codigoPublico: string };
  };
  return {
    id: body.paciente.id,
    nome: body.paciente.nome,
    token: body.paciente.codigoPublico,
    cpf,
  };
}

/** Cleanup: archives the patient so it stays out of the active demo list. */
export async function arquivarPaciente(id: number): Promise<void> {
  await fetch(`${API_BASE}/pacientes/${id}/arquivar`, { method: "POST" });
}

export interface CreatedMedico {
  id: number;
  nome: string;
}

/**
 * Cria um médico descartável para os testes de upload de foto/logo. Como não há
 * rota de exclusão de médico, a limpeza apenas o DESATIVA (`desativarMedico`),
 * o equivalente ao "arquivar" da paciente — ele some dos seletores ativos mas
 * permanece na lista `incluirInativos`. Nome com sufixo único para que o teste
 * localize exatamente a sua linha no diálogo de Médicos.
 */
export async function criarMedicoTeste(): Promise<CreatedMedico> {
  const sufixo = Math.random().toString(36).slice(2, 8);
  const res = await fetch(`${API_BASE}/medicos`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      nome: `ZZ Teste Foto ${sufixo}`,
      crm: "CRM-SP 000000",
      rqe: "RQE 00000",
      clinica: "Clínica Teste",
      padrao: false,
    }),
  });
  if (res.status !== 201) {
    throw new Error(
      `Falha ao criar médico de teste (${res.status}): ${await res.text()}`,
    );
  }
  const body = (await res.json()) as { id: number; nome: string };
  return { id: body.id, nome: body.nome };
}

/** Limpeza: desativa um médico de teste (não há exclusão de médico). */
export async function desativarMedico(id: number): Promise<void> {
  await fetch(`${API_BASE}/medicos/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ativo: false }),
  });
}

/**
 * Aprova o handoff da paciente (POST /pacientes/:id/aprovar) — o mesmo caminho
 * que a equipe usa para enviar o link. Move o estágio de "Fechamento" para
 * "Enviado", condição necessária para a paciente entrar no alerta "Não abriu"
 * (que é ignorado enquanto a paciente ainda está em Fechamento).
 */
export async function aprovarPaciente(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/pacientes/${id}/aprovar`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(
      `Falha ao aprovar paciente (${res.status}): ${await res.text()}`,
    );
  }
}

/**
 * Persists the patient's saved light/dark register (the cross-device `tema`
 * preference). This is the value the Console + mobile previews must mirror,
 * independent of the secretary's ambient Console theme.
 */
export async function definirTemaPaciente(
  token: string,
  tema: "light" | "dark",
): Promise<void> {
  const res = await fetch(`${API_BASE}/publico/${token}/tema`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tema }),
  });
  if (!res.ok) {
    throw new Error(
      `Falha ao salvar tema da paciente (${res.status}): ${await res.text()}`,
    );
  }
}

export interface ConfigNotificacao {
  webhookUrl: string | null;
  silenciada: boolean;
}

export interface ConfigContrato {
  prazoAssinaturaDiasAntes: number;
  vencimentoSaldoDiasUteisAntes: number;
}

/** Reads the team-alert (notification) config singleton straight from the API. */
export async function obterConfigNotificacao(): Promise<ConfigNotificacao> {
  const res = await fetch(`${API_BASE}/config/notificacoes`);
  if (!res.ok) {
    throw new Error(
      `Falha ao ler config de notificação (${res.status}): ${await res.text()}`,
    );
  }
  return (await res.json()) as ConfigNotificacao;
}

/** Restores the notification config (used to undo what a test changed). */
export async function definirConfigNotificacao(
  config: ConfigNotificacao,
): Promise<void> {
  const res = await fetch(`${API_BASE}/config/notificacoes`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    throw new Error(
      `Falha ao salvar config de notificação (${res.status}): ${await res.text()}`,
    );
  }
}

/** Reads the contract-deadline config singleton straight from the API. */
export async function obterConfigContrato(): Promise<ConfigContrato> {
  const res = await fetch(`${API_BASE}/config/contrato`);
  if (!res.ok) {
    throw new Error(
      `Falha ao ler config de contrato (${res.status}): ${await res.text()}`,
    );
  }
  return (await res.json()) as ConfigContrato;
}

/** Restores the contract config (used to undo what a test changed). */
export async function definirConfigContrato(
  config: ConfigContrato,
): Promise<void> {
  const res = await fetch(`${API_BASE}/config/contrato`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    throw new Error(
      `Falha ao salvar config de contrato (${res.status}): ${await res.text()}`,
    );
  }
}

export interface HospitalConfig {
  chave: string;
  nome: string;
  nomeCompleto: string;
  /** "Nome Completo — Endereço" resolvido (igual ao que a página pública mostra). */
  local: string;
}

export interface ConfigOperacional {
  hospitais: HospitalConfig[];
}

/**
 * Lê a configuração operacional (`/config`) — a MESMA fonte que a prévia do
 * Console usa para resolver hospital/endereço/telefone, e que o resolvedor da
 * página pública espelha no servidor.
 */
export async function obterConfig(): Promise<ConfigOperacional> {
  const res = await fetch(`${API_BASE}/config`);
  if (!res.ok) {
    throw new Error(`Falha ao obter /config (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as ConfigOperacional;
}

export interface MedicoConfig {
  id: number;
  /** Nome da médica (vira `medica` no snapshot da paciente). */
  nome: string;
  crm: string;
  rqe: string;
  clinica: string;
  padrao: boolean;
  ativo: boolean;
  /** URL assinada da foto (null quando não há foto cadastrada). */
  fotoUrl: string | null;
  /** URL assinada do logo (null quando não há logo cadastrado). */
  logoUrl: string | null;
}

/**
 * Lê o cadastro de médicos (`/medicos`) — a fonte de onde a prévia do Console
 * resolve foto/logo (via `useListarMedicos`) e de onde o servidor monta as
 * mesmas URLs assinadas para a página pública. `incluirInativos` espelha a
 * consulta da prévia.
 */
export async function obterMedicos(): Promise<MedicoConfig[]> {
  const res = await fetch(`${API_BASE}/medicos?incluirInativos=true`);
  if (!res.ok) {
    throw new Error(`Falha ao obter /medicos (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as MedicoConfig[];
}

/**
 * Marca um médico como ativo/inativo via o mesmo PATCH /medicos/:id que o Console
 * usa ao desativar um cadastro. Os testes desativam um médico VINCULADO a uma
 * paciente para provar que foto/logo continuam resolvendo (via `incluirInativos`),
 * e reativam na limpeza para não vazar estado no banco compartilhado.
 */
export async function definirMedicoAtivo(id: number, ativo: boolean): Promise<void> {
  const res = await fetch(`${API_BASE}/medicos/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ativo }),
  });
  if (!res.ok) {
    throw new Error(
      `Falha ao ${ativo ? "reativar" : "inativar"} médico (${res.status}): ${await res.text()}`,
    );
  }
}

/** Desativa um médico (atalho de `definirMedicoAtivo(id, false)`). */
export async function inativarMedico(id: number): Promise<void> {
  await definirMedicoAtivo(id, false);
}

/** Reativa um médico (atalho de `definirMedicoAtivo(id, true)`), usado na limpeza. */
export async function reativarMedico(id: number): Promise<void> {
  await definirMedicoAtivo(id, true);
}

export interface PacienteDocStatus {
  id: number;
  contratoStatus: string | null;
  contratoAssinadoEm: string | null;
  contratoPrazo: string | null;
  termoStatus: string | null;
  termoAssinadoEm: string | null;
  termoPrazo: string | null;
}

/**
 * Lê os campos de status de contrato/termo de um paciente (inclui `contratoPrazo`
 * e `termoPrazo` já calculados pelo servidor) — usado nos testes de equivalência
 * para obter o prazo computado após seeder o status.
 */
export async function obterPacienteDocStatus(id: number): Promise<PacienteDocStatus> {
  const res = await fetch(`${API_BASE}/pacientes/${id}`);
  if (!res.ok) {
    throw new Error(`Falha ao obter paciente ${id} (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { paciente: PacienteDocStatus };
  return body.paciente;
}

/**
 * Define o override manual do prazo de assinatura (contrato e/ou termo) via o
 * mesmo PATCH que a secretária usa no Console. O override vence o prazo default
 * (dataCirurgia − diasAntes), então é o caminho que a prévia e a página pública
 * precisam refletir de forma idêntica.
 */
export async function definirPrazoOverride(
  id: number,
  campos: {
    contratoPrazoOverride?: string | null;
    termoPrazoOverride?: string | null;
  },
): Promise<void> {
  const res = await fetch(`${API_BASE}/pacientes/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(campos),
  });
  if (!res.ok) {
    throw new Error(
      `Falha ao definir prazo override (${res.status}): ${await res.text()}`,
    );
  }
}

/**
 * Dev/test-only: define o status de contrato/termo diretamente no banco, sem
 * passar pela integração Autentique. Disponível apenas fora de produção —
 * retorna erro se o endpoint não existir (NODE_ENV === "production").
 */
export async function definirStatusDocumentos(
  id: number,
  campos: {
    contratoStatus?: "assinado" | "pendente" | "recusado" | "indisponivel" | null;
    contratoAssinadoEm?: string | null;
    termoStatus?: "assinado" | "pendente" | "recusado" | "indisponivel" | null;
    termoAssinadoEm?: string | null;
  },
): Promise<void> {
  const res = await fetch(`${API_BASE}/pacientes/${id}/_dev/status`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(campos),
  });
  if (!res.ok) {
    throw new Error(
      `Falha ao definir status de documentos (${res.status}): ${await res.text()}`,
    );
  }
}

/**
 * Cria um MODELO DE CONTRATO vigente direto na API, para os testes que precisam
 * de um modelo determinístico (independente das seeds de fábrica). Retorna o id.
 */
export async function criarModeloContrato(opcoes: {
  tipo?: "contrato" | "termo";
  titulo: string;
  corpo: string;
  procedimento?: string;
  vigente?: boolean;
}): Promise<number> {
  const sufixo = Math.random().toString(36).slice(2, 8);
  const res = await fetch(`${API_BASE}/contrato-modelos`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tipo: opcoes.tipo ?? "contrato",
      procedimento: opcoes.procedimento ?? `Proc E2E ${sufixo}`,
      titulo: opcoes.titulo,
      corpo: opcoes.corpo,
      vigente: opcoes.vigente ?? true,
    }),
  });
  if (res.status !== 201) {
    throw new Error(
      `Falha ao criar modelo de contrato (${res.status}): ${await res.text()}`,
    );
  }
  const body = (await res.json()) as { id: number };
  return body.id;
}

/** Remove um modelo de contrato criado por um teste. */
export async function removerModeloContrato(id: number): Promise<void> {
  await fetch(`${API_BASE}/contrato-modelos/${id}`, { method: "DELETE" });
}

/**
 * Chama a rota de RESTAURAR AO MODELO DE FÁBRICA direto na API e devolve só o
 * status HTTP — usado pelo teste que prova que um modelo criado manualmente (sem
 * par de fábrica) é REJEITADO (422), garantia que a UI não consegue exercitar
 * porque ela nem mostra o botão "Restaurar" nesses casos. `confirmar` espelha o
 * gating de confirmação da própria rota.
 */
export async function restaurarModeloPadrao(
  id: number,
  confirmar = true,
): Promise<number> {
  const res = await fetch(
    `${API_BASE}/contrato-modelos/${id}/restaurar-padrao`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmar }),
    },
  );
  return res.status;
}

export interface ModeloContrato {
  id: number;
  tipo: "contrato" | "termo";
  procedimento: string;
  titulo: string;
  corpo: string;
  versao: number;
  vigente: boolean;
  observacoes: string | null;
  /**
   * Como o texto se compara ao modelo de fábrica: "igual"/"desatualizado", ou
   * `null` quando o modelo foi criado manualmente (sem par de fábrica). Só os
   * modelos com par de fábrica (statusFabrica != null) podem ser restaurados.
   */
  statusFabrica: "igual" | "desatualizado" | null;
}

/** Lista todos os modelos-base (contrato + termo) direto da API. */
export async function listarModelosContrato(): Promise<ModeloContrato[]> {
  const res = await fetch(`${API_BASE}/contrato-modelos`);
  if (!res.ok) {
    throw new Error(
      `Falha ao listar modelos de contrato (${res.status}): ${await res.text()}`,
    );
  }
  return (await res.json()) as ModeloContrato[];
}

/**
 * Atualiza um modelo-base via o mesmo PUT que o Console usa — usado pelos testes
 * para preparar o estado (ex.: marcar como vigente) e restaurar o original na
 * limpeza, sem depender da UI.
 */
export async function atualizarModeloContrato(
  id: number,
  campos: Partial<{
    procedimento: string;
    titulo: string;
    corpo: string;
    vigente: boolean;
    observacoes: string | null;
  }>,
): Promise<void> {
  const res = await fetch(`${API_BASE}/contrato-modelos/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(campos),
  });
  if (!res.ok) {
    throw new Error(
      `Falha ao atualizar modelo de contrato (${res.status}): ${await res.text()}`,
    );
  }
}

/**
 * Procedimento do MODELO-BASE único que a geração resolve (`obterBaseVigente`):
 * a rota `/pacientes/:id/contratos/gerar` ignora qualquer seleção de modelo e
 * usa sempre o par (PROCEDIMENTO_BASE, tipo, vigente). Manter em sincronia com
 * `PROCEDIMENTO_BASE` em `contrato-modelo-padrao.ts`.
 */
const PROCEDIMENTO_BASE = "Todos os procedimentos";

export interface ModeloBaseVigente {
  /** id do modelo-base ativado (para referência/limpeza). */
  id: number;
  /** Restaura o estado de `vigente` original do modelo-base. */
  restaurar: () => Promise<void>;
}

/**
 * Garante que o modelo-base de CONTRATO ("Todos os procedimentos") esteja
 * vigente — pré-condição para a geração funcionar (`obterBaseVigente`). Como o
 * par (tipo, procedimento) é único no banco, NÃO cria um segundo: ativa o
 * existente e devolve um `restaurar()` que recoloca o `vigente` original (no-op
 * quando já estava vigente), para o teste não vazar estado no banco compartilhado.
 */
async function garantirModeloBaseVigente(
  tipo: "contrato" | "termo",
): Promise<ModeloBaseVigente> {
  const modelos = await listarModelosContrato();
  const base = modelos.find(
    (m) => m.tipo === tipo && m.procedimento === PROCEDIMENTO_BASE,
  );
  if (!base) {
    throw new Error(
      `Modelo-base de ${tipo} ("${PROCEDIMENTO_BASE}") não encontrado — ` +
        "ele deveria ser semeado no boot da API (garantirPadrao).",
    );
  }
  if (base.vigente) {
    return { id: base.id, restaurar: async () => {} };
  }
  await atualizarModeloContrato(base.id, { vigente: true });
  return {
    id: base.id,
    restaurar: () => atualizarModeloContrato(base.id, { vigente: false }),
  };
}

export async function garantirModeloBaseContratoVigente(): Promise<ModeloBaseVigente> {
  return garantirModeloBaseVigente("contrato");
}

/**
 * Garante que o modelo-base de TERMO (TCLE — "Todos os procedimentos") esteja
 * vigente. Igual ao de contrato: o par (tipo, procedimento) é único, então
 * ativa o existente (semeado NÃO vigente pela fábrica) e devolve um `restaurar()`
 * que recoloca o `vigente` original, sem vazar estado no banco compartilhado.
 */
export async function garantirModeloBaseTermoVigente(): Promise<ModeloBaseVigente> {
  return garantirModeloBaseVigente("termo");
}

/**
 * Uma geração (rascunho/aprovado/enviado) como o servidor a devolve. Inclui o
 * VÍNCULO autoritativo — `pacienteId` e `tipo` — que prova a qual paciente e a
 * qual tipo de documento o rascunho pertence. Os testes de vínculo leem isto
 * direto da API (fora do navegador) para garantir que um rascunho gerado nunca
 * "vaza" para o documento da paciente errada.
 */
export interface GeracaoResumo {
  id: number;
  pacienteId: number;
  tipo: "contrato" | "termo";
  status: string;
  titulo: string;
  corpo: string;
  modeloProcedimento: string;
  modeloVersao: number;
  relatorioIa: unknown | null;
  iaRevisadoEm: string | null;
  createdAt: string;
  updatedAt: string;
  [campo: string]: unknown;
}

/**
 * Lista, via API, as gerações de documento (contrato + termo) de uma paciente —
 * a MESMA rota que o Console usa. Devolve os objetos completos para que os
 * testes confiram o vínculo (`pacienteId`/`tipo`) e possam reservir a lista num
 * mock (ex.: anexando um relatório de IA simulado).
 */
export async function listarGeracoesPaciente(
  pacienteId: number,
): Promise<GeracaoResumo[]> {
  const res = await fetch(`${API_BASE}/pacientes/${pacienteId}/contratos`);
  if (!res.ok) {
    throw new Error(
      `Falha ao listar gerações da paciente (${res.status}): ${await res.text()}`,
    );
  }
  return (await res.json()) as GeracaoResumo[];
}

/**
 * Gera (via API) um rascunho de contrato para a paciente e devolve o id da
 * geração — usado para deixar o editor já com um rascunho ao abrir a aba
 * Contrato, sem depender da UI de geração. A rota resolve sozinha o modelo-base
 * único e vigente do tipo pedido (ignora qualquer seleção de modelo); o corpo só
 * precisa do `tipo`. Pré-requisito: o modelo-base do tipo deve estar vigente
 * (use `garantirModeloBaseContratoVigente`).
 */
export async function gerarRascunhoContratoPaciente(
  pacienteId: number,
): Promise<number> {
  const res = await fetch(
    `${API_BASE}/pacientes/${pacienteId}/contratos/gerar`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tipo: "contrato" }),
    },
  );
  if (res.status !== 201) {
    throw new Error(
      `Falha ao gerar rascunho de contrato (${res.status}): ${await res.text()}`,
    );
  }
  const body = (await res.json()) as { id: number };
  return body.id;
}

/**
 * Aprova (e tenta enviar à Autentique) uma geração via a MESMA rota do Console
 * (POST /contratos/:id/aprovar-e-enviar) — usado para tirar um rascunho do
 * status "rascunho" de forma determinística, sem depender da UI de confirmação.
 *
 * A rota grava a aprovação ANTES de tocar na Autentique, então o resultado é
 * sempre não-rascunho: `enviado` (200) quando a Autentique está configurada e
 * responde, ou `falha_envio` (502) quando não — em ambos os casos a geração
 * deixa de ser editável (o editor renderiza em somente-leitura, sem barra). Por
 * isso aceitamos 200 OU 502; qualquer outro status é um erro real do teste.
 */
export async function aprovarEEnviarContratoGeracao(
  geracaoId: number,
  aprovadoPor = "Equipe E2E",
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/contratos/${geracaoId}/aprovar-e-enviar`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ aprovadoPor }),
    },
  );
  if (res.status !== 200 && res.status !== 502) {
    throw new Error(
      `Falha ao aprovar/enviar geração (${res.status}): ${await res.text()}`,
    );
  }
}
