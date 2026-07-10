/**
 * Test-data helpers that talk directly to the shared API server (not through the
 * browser), so each test owns an isolated patient and cleans up after itself.
 */

const apiDomain = process.env.REPLIT_DEV_DOMAIN;

export const API_BASE = `https://${apiDomain}/api`;

// A valid phone shape accepted by the API's validation.
const TELEFONE_VALIDO = "11987654321";

/**
 * Generates a fresh, checksum-valid Brazilian CPF for every created patient.
 * The API's create-time dedup rejects a CPF that already belongs to another
 * patient (archived patients still count), so a fixed CPF collides across runs
 * once a previous test's patient lingers — a random valid CPF avoids that.
 */
export function gerarCpfValido(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const digito = (nums: number[], pesoInicial: number): number => {
    let soma = 0;
    for (let i = 0; i < nums.length; i++) soma += nums[i] * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = digito(base, 10);
  const d2 = digito([...base, d1], 11);
  return [...base, d1, d2].join("");
}

export interface CreatedPaciente {
  id: number;
  nome: string;
  /** Opaque public share code used to reach the public page payload. */
  token: string;
  /** The (checksum-valid) CPF the patient was created with — needed by the
   * duplicate-CPF e2e to retype the exact same value into the novo wizard. */
  cpf: string;
}

export interface CriarPacienteOpcoes {
  /** CPF a usar (apenas dígitos). Omitido = um CPF válido aleatório. */
  cpf?: string;
  /** Médico vinculado (id). Omitido = médico padrão (snapshot da Dra. Karla). */
  medicoId?: number;
  /** Saldo em aberto (R$). > 0 deixa os honorários pendentes. Omitido = 0. */
  valorPendente?: number;
  /** Vencimento do saldo (YYYY-MM-DD). Obrigatório quando há saldo em aberto. */
  dataPagamentoPendente?: string;
  /** Data da cirurgia (YYYY-MM-DD). Omitido = uma data fixa distante. */
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
      nome: `ZZ Teste E2E ${sufixo}`,
      cpf,
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: opcoes.dataCirurgia ?? "2026-08-15",
      valorSinal: 3000,
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

/**
 * Aprova o handoff da paciente (POST /pacientes/:id/aprovar) — o mesmo caminho
 * que a equipe usa para enviar o link. É condição necessária para a paciente
 * entrar no alerta "Não abriu" (ignorado enquanto ela ainda está em Fechamento).
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
 * Creates a test patient that already has a positive pending balance and a due
 * date, so the payment-edit section in the detail screen can be exercised
 * against a realistic starting state.
 */
export async function criarPacienteComPendente(opts?: {
  valorPendente?: number;
  dataPagamentoPendente?: string;
}): Promise<CreatedPaciente> {
  const sufixo = Math.random().toString(36).slice(2, 8);
  const cpf = gerarCpfValido();
  const res = await fetch(`${API_BASE}/pacientes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      nome: `ZZ Pendente E2E ${sufixo}`,
      cpf,
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-10-15",
      valorSinal: 3000,
      valorPendente: opts?.valorPendente ?? 2000,
      dataPagamentoPendente: opts?.dataPagamentoPendente ?? "2026-10-10",
    }),
  });
  if (res.status !== 201) {
    throw new Error(
      `Falha ao criar paciente de teste com pendente (${res.status}): ${await res.text()}`,
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

/**
 * Persists the patient's saved light/dark register (the cross-device `tema`
 * preference). This is the value the mobile + Console previews must mirror,
 * independent of the team's ambient Console theme.
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

/** Team contract-alert config — webhook destination + the mute switch. Singleton. */
export interface ConfigNotificacao {
  webhookUrl: string | null;
  silenciada: boolean;
}

/** Reads the current alert config straight from the API (not the browser). */
export async function obterConfigNotificacao(): Promise<ConfigNotificacao> {
  const res = await fetch(`${API_BASE}/config/notificacoes`);
  if (!res.ok) {
    throw new Error(
      `Falha ao ler a config de avisos (${res.status}): ${await res.text()}`,
    );
  }
  const body = (await res.json()) as ConfigNotificacao;
  return { webhookUrl: body.webhookUrl ?? null, silenciada: body.silenciada };
}

/**
 * Writes the alert config via the API. Used to seed a known baseline before a
 * test and to restore the original singleton afterwards (it's shared with the
 * demo, so tests must leave it as they found it).
 */
export async function definirConfigNotificacao(
  config: ConfigNotificacao,
): Promise<ConfigNotificacao> {
  const res = await fetch(`${API_BASE}/config/notificacoes`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    throw new Error(
      `Falha ao salvar a config de avisos (${res.status}): ${await res.text()}`,
    );
  }
  const body = (await res.json()) as ConfigNotificacao;
  return { webhookUrl: body.webhookUrl ?? null, silenciada: body.silenciada };
}

/**
 * Saídas geradas pelo servidor para um paciente (textos verbatim do handoff). É
 * onde os valores em R$ realmente aparecem — a página pública só mostra o estado
 * (quitado / vencimento), enquanto a mensagem de confirmação (`a6`) cita o valor
 * pago, o valor pendente e a data prevista.
 */
export interface SaidasPaciente {
  /** Mensagem A6 — "Confirmação de Reserva" com os valores de honorários. */
  a6: string;
  /** Mensagem única de abertura (link da página). */
  mensagemUnica: string;
  /** Link público absoluto da paciente. */
  link: string;
}

/**
 * Lê as saídas do servidor para um paciente (GET /pacientes/:id → `saidas`).
 * Usado para conferir que a mensagem de handoff reflete os valores de pagamento
 * recém-editados na tela mobile.
 */
export async function obterSaidas(id: number): Promise<SaidasPaciente> {
  const res = await fetch(`${API_BASE}/pacientes/${id}`);
  if (!res.ok) {
    throw new Error(
      `Falha ao obter saídas do paciente (${res.status}): ${await res.text()}`,
    );
  }
  const body = (await res.json()) as { saidas: SaidasPaciente };
  return body.saidas;
}

/** Modelo-base de contrato/termo, como devolvido por `/contrato-modelos`. */
export interface ContratoModeloE2E {
  id: number;
  tipo: "contrato" | "termo";
  procedimento: string;
  titulo: string;
  corpo: string;
  versao: number;
  vigente: boolean;
  observacoes: string | null;
}

/** Lê os modelos-base cadastrados (a lista que a tela mobile mostra). */
export async function obterContratoModelos(): Promise<ContratoModeloE2E[]> {
  const res = await fetch(`${API_BASE}/contrato-modelos`);
  if (!res.ok) {
    throw new Error(
      `Falha ao listar modelos (${res.status}): ${await res.text()}`,
    );
  }
  return (await res.json()) as ContratoModeloE2E[];
}

/**
 * Cria um modelo-base manual via API (POST /contrato-modelos). Um procedimento
 * inédito não tem par de fábrica, então a restauração devolve 422 ("semPadrao")
 * — exatamente o caminho de erro amigável que a tela mobile precisa cobrir.
 * Retorna o modelo criado para que o teste possa removê-lo no fim.
 */
export async function criarContratoModelo(data: {
  tipo: "contrato" | "termo";
  procedimento: string;
  titulo: string;
  corpo: string;
  vigente?: boolean;
  observacoes?: string | null;
}): Promise<ContratoModeloE2E> {
  const res = await fetch(`${API_BASE}/contrato-modelos`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tipo: data.tipo,
      procedimento: data.procedimento,
      titulo: data.titulo,
      corpo: data.corpo,
      vigente: data.vigente ?? false,
      observacoes: data.observacoes ?? null,
    }),
  });
  if (res.status !== 201) {
    throw new Error(
      `Falha ao criar modelo de teste (${res.status}): ${await res.text()}`,
    );
  }
  return (await res.json()) as ContratoModeloE2E;
}

/** Remove um modelo via API (DELETE /contrato-modelos/:id). Cleanup de teste. */
export async function removerContratoModelo(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/contrato-modelos/${id}`, {
    method: "DELETE",
  });
  if (res.status !== 204 && res.status !== 404) {
    throw new Error(
      `Falha ao remover modelo de teste (${res.status}): ${await res.text()}`,
    );
  }
}

/**
 * Atualiza um modelo via API. Usado para restaurar o estado compartilhado depois
 * de um teste (ex.: remarcar como vigente após exercitar a restauração na UI).
 */
export async function atualizarContratoModelo(
  id: number,
  data: {
    tipo: "contrato" | "termo";
    procedimento: string;
    titulo: string;
    corpo: string;
    vigente: boolean;
    observacoes: string | null;
  },
): Promise<ContratoModeloE2E> {
  const res = await fetch(`${API_BASE}/contrato-modelos/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(
      `Falha ao atualizar modelo (${res.status}): ${await res.text()}`,
    );
  }
  return (await res.json()) as ContratoModeloE2E;
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
 * Lê o cadastro de médicos (`/medicos`) — a fonte de onde a prévia mobile
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
