/*
 * Fixed content for the Console patient-detail layout exploration. Grounded in
 * the real console-patient.tsx data shape and copy. This is the CONTENT that is
 * held constant across all 3 layout variants — only the spatial organization
 * changes. Do not edit per-variant.
 */

export type DocStatus = "assinado" | "pendente" | "indisponivel" | "ausente";

export interface Vendedora {
  id: number;
  nome: string;
}

export interface TimelineEvento {
  id: number;
  automatico: boolean;
  titulo: string;
  descricao?: string;
  createdAt: string;
}

export interface AtividadeEvento {
  id: number;
  descricao: string;
  createdAt: string;
}

export interface ChecklistItem {
  titulo: string;
  incluido: boolean;
  sempre: boolean;
}

export interface Documento {
  id: number;
  nome: string;
  tipo: string;
  data: string;
  tamanho: string;
}

export interface HistoricoEntry {
  id: number;
  acao: string;
  autor: string;
  createdAt: string;
}

export interface PosOpItem {
  id: number;
  quando: string;
  titulo: string;
  descricao: string;
}

export const PACIENTE = {
  nome: "Mateus Apolinario Ribeiro",
  procedimentos: ["Blefaroplastia"],
  laser: true,
  dataCirurgia: "2026-07-16",
  horario: "06:30",
  cpf: "498.221.330-77",
  telefone: "(11) 98876-5521",
  estagio: "Enviado",
  diasRestantes: 19,
  arquivado: false,
};

export const ATIVIDADE = {
  abriu: true,
  primeiraAbertura: "2026-06-25T14:32:00",
  totalAberturas: 3,
  eventos: [
    { id: 1, descricao: "Abriu o link da página de preparo", createdAt: "2026-06-25T14:32:00" },
    { id: 2, descricao: "Marcou \"Li as orientações de jejum\"", createdAt: "2026-06-25T14:40:00" },
    { id: 3, descricao: "Baixou o PDF do termo de consentimento", createdAt: "2026-06-26T20:11:00" },
  ] as AtividadeEvento[],
};

export const LINK_PACIENTE = "https://app.kcl.med.br/p/mateus-9fa3c2";

export const VENDEDORAS: Vendedora[] = [
  { id: 1, nome: "Camila Furlan" },
  { id: 2, nome: "Beatriz Nunes" },
  { id: 3, nome: "Larissa Pádua" },
];
export const VENDEDORA_ATUAL_ID = 1;

export const HANDOFF_APROVADO = true;

export const ENTREGA = {
  passoAPasso: [
    "Copie a mensagem da Entrega Principal (o link já vem junto) e cole no WhatsApp da paciente.",
    "Envie os blocos dos Envios Operacionais aos grupos do centro cirúrgico e da anestesia.",
    "Use o Fallback Manual só se o link não abrir para a paciente.",
  ],
  mensagemUnica:
    "Oi, Mateus! Aqui é da equipe da Dra. Karla Caetano Lobo. Sua cirurgia está confirmada para 16/07, às 06:30, no Avant Moema Day Hospital. Preparei uma página com todas as orientações de preparo, jejum e chegada — é só abrir o link abaixo e seguir o passo a passo. Qualquer dúvida, fala com a gente por aqui. 💛",
  fallback: {
    a6: "Bloco A6 — Orientações de jejum: jejum absoluto de 8 horas para sólidos e 2 horas para líquidos claros. Nada de água, bala ou chiclete na janela final.",
    a7: "Bloco A7 — Chegada e documentos: chegue 2h antes do horário marcado. Traga documento com foto, exames pré-operatórios e a nota fiscal impressa.",
    a8: "Bloco A8 — Acompanhante: é obrigatório um acompanhante maior de idade para alta. Ele precisa permanecer no hospital durante todo o procedimento.",
    checklistMedx: [
      { titulo: "Confirmar jejum de 8 horas", incluido: true, sempre: true },
      { titulo: "Risco cirúrgico liberado", incluido: true, sempre: true },
      { titulo: "Suspender anti-inflamatórios (Laser CO₂)", incluido: true, sempre: false },
      { titulo: "Levar óculos escuros para o pós", incluido: true, sempre: false },
    ] as ChecklistItem[],
  },
  avisoOperacional:
    "Caso com Laser CO₂ — confirmar disponibilidade do equipamento e do oftalmologista de apoio.",
  centroCirurgico:
    "CC · 16/07 06:30 · Mateus A. Ribeiro\nBlefaroplastia + Laser CO₂ periorbital\nDra. Karla Caetano Lobo\nMaterial: kit blefaro + caneta laser CO₂",
  anestesia:
    "ANEST · 16/07 06:30 · Mateus A. Ribeiro, 41a\nSedação + local · ASA I\nJejum confirmado · Sem alergias relatadas",
};

export const TIMELINE: TimelineEvento[] = [
  {
    id: 1,
    automatico: true,
    titulo: "Link aprovado e enviado",
    descricao: "Handoff aprovado por Camila Furlan. Mensagem de Entrega Principal liberada.",
    createdAt: "2026-06-24T11:05:00",
  },
  {
    id: 2,
    automatico: false,
    titulo: "Paciente confirmou exames",
    descricao: "Mateus enviou os exames pré-operatórios pelo WhatsApp. Encaminhados ao risco cirúrgico.",
    createdAt: "2026-06-25T16:20:00",
  },
  {
    id: 3,
    automatico: true,
    titulo: "Contrato assinado",
    descricao: "Assinatura registrada na Autentique.",
    createdAt: "2026-06-24T18:42:00",
  },
  {
    id: 4,
    automatico: false,
    titulo: "Reforço de jejum agendado",
    descricao: "Lembrete manual para enviar o reforço de jejum na véspera (15/07).",
    createdAt: "2026-06-26T09:15:00",
  },
];

export const CONTRATO = {
  status: "assinado" as DocStatus,
  assinadoEm: "2026-06-24",
  linkAssinatura: "https://painel.autentique.com.br/documentos/assinar/8f2a-contrato",
  prazo: "2026-07-14",
  autentiqueId: "8f2a-7c11-contrato",
  verificadoEm: "2026-06-27T09:12:00",
};

export const TERMO = {
  status: "pendente" as DocStatus,
  assinadoEm: null as string | null,
  linkAssinatura: "https://painel.autentique.com.br/documentos/assinar/3b9d-tcle",
  prazo: "2026-07-14",
  autentiqueId: "3b9d-44e0-tcle",
  verificadoEm: "2026-06-27T09:12:00",
};

export const DOCUMENTOS: Documento[] = [
  { id: 1, nome: "NF-2841 — Honorários médicos.pdf", tipo: "Nota Fiscal", data: "2026-06-24", tamanho: "184 KB" },
  { id: 2, nome: "Risco cirúrgico — liberado.pdf", tipo: "Laudo", data: "2026-06-26", tamanho: "92 KB" },
  { id: 3, nome: "Exames laboratoriais.pdf", tipo: "Exames", data: "2026-06-25", tamanho: "1.2 MB" },
  { id: 4, nome: "Contrato assinado — Autentique.pdf", tipo: "Contrato", data: "2026-06-24", tamanho: "240 KB" },
];

export const HISTORICO: HistoricoEntry[] = [
  { id: 1, acao: "Prazo de assinatura do termo definido para 14/07/2026", autor: "Camila Furlan", createdAt: "2026-06-26T09:18:00" },
  { id: 2, acao: "Dados da paciente atualizados (telefone)", autor: "Beatriz Nunes", createdAt: "2026-06-25T10:02:00" },
  { id: 3, acao: "Vendedora responsável definida como Camila Furlan", autor: "Sistema", createdAt: "2026-06-24T11:06:00" },
  { id: 4, acao: "Handoff aprovado e link enviado", autor: "Camila Furlan", createdAt: "2026-06-24T11:05:00" },
];

export const POSOP: PosOpItem[] = [
  { id: 1, quando: "+1 dia", titulo: "Compressa fria periorbital", descricao: "Aplicar a cada 2 horas nas primeiras 48h para reduzir o edema." },
  { id: 2, quando: "+7 dias", titulo: "Retorno para retirada de pontos", descricao: "Consulta de retorno agendada na clínica com a Dra. Karla." },
  { id: 3, quando: "+30 dias", titulo: "Reavaliação do Laser CO₂", descricao: "Avaliar a renovação da pele e liberar exposição solar com proteção." },
];

/* Conteúdo da prévia — o que a paciente vê na página pública (tema editorial claro). */
export const PHONE = {
  clinica: "KCL",
  medica: "Dra. Karla Caetano Lobo",
  crm: "CRM-SP 145.879",
  rqe: "RQE 78.221",
  saudacao: "Mateus",
  diasRestantes: 19,
  dataCirurgia: "16 de julho",
  horario: "06:30",
  hospital: "Avant Moema Day Hospital",
  local: "Av. Copacabana, 112 · 3º andar (Edif. Medic Life)",
  equipe: "Zenicare",
  equipeTelefone: "(11) 95080-2525",
  instrucoesChegada: "Confirme a janela de chegada (2h ou 3h antes).",
  procedimentos: ["Blefaroplastia", "Laser CO₂"],
  confirmacoes: [
    { rotulo: "Data e horário", valor: "16/07 às 06:30", ok: true },
    { rotulo: "Local", valor: "Avant Moema Day Hospital", ok: true },
    { rotulo: "Contrato", valor: "Assinado", ok: true },
    { rotulo: "Termo de consentimento", valor: "Assinar até 14/07", ok: false },
  ],
};
