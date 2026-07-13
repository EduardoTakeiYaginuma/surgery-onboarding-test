/**
 * Protocolo operacional da KCL — fonte única da verdade para hospitais e
 * equipes de anestesia. O Console (web), o app móvel e os blocos de mensagem
 * (saidas.ts) consomem estas listas para não divergirem.
 *
 * Campos com "{a preencher}" aguardam os dados reais da clínica; o restante já
 * reflete o protocolo conhecido (Avant Moema / Zenicare).
 */

import type { Local, LocalSnapshot } from "@workspace/db";

export const A_PREENCHER = "{a preencher}";

/**
 * Quantos dias úteis antes da cirurgia o saldo pendente vence por padrão. O
 * Console usa este valor para pré-preencher o vencimento do saldo (e exibir a
 * dica). Centralizado aqui como configuração operacional para que cada equipe
 * possa ajustar a política de cobrança sem caçar o número espalhado no código.
 */
export const VENCIMENTO_SALDO_DIAS_UTEIS_ANTES = 2;

export interface HospitalProfile {
  /** Chave estável persistida em paciente.local e usada nos seletores. */
  chave: string;
  /** Nome curto para exibição (lista, seletor). */
  nome: string;
  /** Nome completo da instituição para mensagens e página da paciente. */
  nomeCompleto: string;
  /** Endereço completo. */
  endereco: string;
  /** Contato do Centro Cirúrgico. */
  contatoCCNome: string;
  contatoCCTelefone: string;
  /** Valor de sinal sugerido para pré-preencher o formulário (null = sem sugestão). */
  sinalSugerido: number | null;
  /** Instruções/janela de chegada específicas do hospital. */
  instrucoesChegada: string;
}

export interface ProcedimentoTemplate {
  /** Chave estável usada no seletor. */
  chave: string;
  /** Nome do procedimento — vai para paciente.procedimento. */
  nome: string;
  /** Explicação curta em PT-BR para a secretária. */
  descricao: string;
  /** Horário sugerido (HH:mm) para pré-preencher o formulário (null = sem sugestão). */
  horarioSugerido: string | null;
  /** Se o procedimento normalmente usa laser CO₂ no dia. */
  laserSugerido: boolean;
  /** Valor de sinal sugerido (null = sem sugestão; o hospital pode sugerir). */
  sinalSugerido: number | null;
}

export const HOSPITAIS: HospitalProfile[] = [
  {
    chave: "Avant Moema",
    nome: "Avant Moema",
    nomeCompleto: "Avant Moema Day Hospital",
    endereco: "Av. Copacabana, 112, 3º andar (Edif. Medic Life)",
    contatoCCNome: "Alana",
    contatoCCTelefone: "(11) 94215-3780",
    sinalSugerido: null,
    instrucoesChegada: "Confirme a janela de chegada (2h ou 3h antes).",
  },
  {
    chave: "Vila Nova Star",
    nome: "Vila Nova Star",
    nomeCompleto: "Hospital Vila Nova Star",
    endereco:
      "Rua Dr. Alceu de Campos Rodrigues, 165 — Vila Nova Conceição, São Paulo - SP, CEP 04544-000",
    contatoCCNome: "Central de Atendimento Rede D'Or",
    contatoCCTelefone: "(11) 3457-1000",
    sinalSugerido: null,
    instrucoesChegada:
      "Chegue 2h antes do horário marcado. Use a internação prévia digital pelo celular quando disponível e confirme o jejum com a equipe do cirurgião.",
  },
  {
    chave: "São Luiz Itaim",
    nome: "São Luiz Itaim",
    nomeCompleto: "Hospital São Luiz — Unidade Itaim",
    endereco:
      "Rua Dr. Alceu de Campos Rodrigues, 95 — Vila Nova Conceição, São Paulo - SP, CEP 04544-000",
    contatoCCNome: "Central de Atendimento Rede D'Or São Luiz",
    contatoCCTelefone: "(11) 3040-1100",
    sinalSugerido: null,
    instrucoesChegada:
      "Chegue 2h antes do horário marcado e confirme o tempo de jejum com a equipe do cirurgião.",
  },
  {
    chave: "Albert Einstein",
    nome: "Albert Einstein",
    nomeCompleto: "Hospital Israelita Albert Einstein",
    endereco:
      "Av. Albert Einstein, 627/701 — Morumbi, São Paulo - SP, CEP 05652-900 (admissão no Bloco A1, intermediário 2)",
    contatoCCNome: "Central de Atendimento Einstein",
    contatoCCTelefone: "(11) 2151-1233",
    sinalSugerido: null,
    instrucoesChegada:
      "Chegue de 1h30 a 2h antes do horário marcado; a recepção admissional é concluída no quarto. Confirme o jejum (em geral 8h) com o cirurgião.",
  },
];

/**
 * Atalhos de procedimento no cadastro. Vazio por opção: a secretária digita o
 * procedimento no campo de texto livre ("Outro procedimento") no Console. Para
 * reativar sugestões, basta adicionar itens aqui — cada template pré-preenche
 * horário e laser sugeridos, que a secretária ainda confirma antes de salvar.
 */
export const PROCEDIMENTO_TEMPLATES: ProcedimentoTemplate[] = [];

export const HOSPITAL_PADRAO: HospitalProfile = HOSPITAIS[0];

export function obterHospital(chave: string | null | undefined): HospitalProfile {
  return HOSPITAIS.find((h) => h.chave === chave) ?? HOSPITAL_PADRAO;
}

/** "Nome Completo — Endereço", omitindo o endereço quando ainda é placeholder. */
export function localTexto(h: HospitalProfile): string {
  return h.endereco && h.endereco !== A_PREENCHER
    ? `${h.nomeCompleto} — ${h.endereco}`
    : h.nomeCompleto;
}

/** Hospital do catálogo por correspondência EXATA de chave; undefined se não há. */
export function obterHospitalExato(
  chave: string | null | undefined,
): HospitalProfile | undefined {
  const c = (chave ?? "").trim();
  return c ? HOSPITAIS.find((h) => h.chave === c) : undefined;
}

/**
 * Monta o perfil do local a partir dos campos LIVRES do paciente (hospital e
 * endereço digitados no cadastro). O nome e o endereço vêm do que a equipe
 * digitou; o contato do Centro Cirúrgico e as instruções de chegada só existem
 * quando o nome digitado casa exatamente com um hospital do catálogo — para
 * texto livre não dá para inferir, então ficam em branco.
 */
export function perfilLocalDoPaciente(
  local: string | null | undefined,
  endereco: string | null | undefined,
  snapshot?: LocalSnapshot | null,
): HospitalProfile {
  // Fonte primária: o SNAPSHOT gravado no cadastro (perfil do local escolhido no
  // momento em que a ficha foi salva). Preserva as mensagens mesmo que o local
  // seja editado/desativado depois — mesma filosofia dos snapshots de médico.
  if (snapshot) return snapshot;
  // Fallback (cadastros antigos sem snapshot / testes): resolve os campos ricos
  // casando o nome livre com o catálogo padrão em memória.
  const nome = (local ?? "").trim();
  const end = (endereco ?? "").trim();
  const conhecido = obterHospitalExato(nome);
  return {
    chave: nome,
    nome,
    nomeCompleto: nome,
    endereco: end || conhecido?.endereco || A_PREENCHER,
    contatoCCNome: conhecido?.contatoCCNome ?? "",
    contatoCCTelefone: conhecido?.contatoCCTelefone ?? "",
    sinalSugerido: conhecido?.sinalSugerido ?? null,
    instrucoesChegada: conhecido?.instrucoesChegada ?? A_PREENCHER,
  };
}

/**
 * Perfil (para mensagens/página e para gravar como snapshot no paciente) a
 * partir de uma linha da tabela configurável `locais`. Converte o casing das
 * colunas (contatoCc*) para o do perfil (contatoCC*) e o numeric do sinal.
 */
export function perfilDeLocal(row: Local): HospitalProfile {
  return {
    chave: row.nome,
    nome: row.nome,
    nomeCompleto: row.nomeCompleto || row.nome,
    endereco: row.endereco || "",
    contatoCCNome: row.contatoCcNome || "",
    contatoCCTelefone: row.contatoCcTelefone || "",
    sinalSugerido: row.sinalSugerido != null ? Number(row.sinalSugerido) : null,
    instrucoesChegada: row.instrucoesChegada || "",
  };
}
