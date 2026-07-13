import type {
  Paciente,
  AlteracaoCampo,
  SecaoConteudo,
  DocumentoPaciente,
  PedidoExamesPaciente,
  ReceitaPreparoPelePaciente,
  ReceituarioPosopPaciente,
} from "@workspace/db";
import {
  perfilLocalDoPaciente,
  localTexto,
  A_PREENCHER,
} from "./protocolo";
import { resolverSecoes } from "./conteudo-padrao";
import { calcularPrazoAssinatura } from "./prazos";
import { calcularJornadaEquipe } from "./jornada-equipe";

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

const HONORIFICOS = new Set(["dr.", "dr", "dra.", "dra"]);

/**
 * Forma curta do nome da médica para referências informais ("Dra. Karla").
 * Mantém o pronome de tratamento (Dr./Dra.) quando presente e acrescenta o
 * primeiro nome; sem honorífico, devolve apenas o primeiro nome.
 */
function nomeCurtoMedica(medica: string): string {
  const partes = medica.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return medica;
  const primeiro = partes[0]!;
  if (HONORIFICOS.has(primeiro.toLowerCase()) && partes[1]) {
    return `${primeiro} ${partes[1]}`;
  }
  return primeiro;
}

function formatarData(isoDate: string): string {
  const [ano, mes, dia] = isoDate.split("-");
  if (!ano || !mes || !dia) return isoDate;
  return `${dia}/${mes}/${ano}`;
}

function formatarValor(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
}

/** Host absoluto do app (produção tem prioridade sobre o dev). */
function hostApp(): string | null {
  // Em produção o Replit injeta REPLIT_DOMAINS (lista separada por vírgula);
  // em desenvolvimento, REPLIT_DEV_DOMAIN. Sempre montamos URL absoluta para
  // que o link seja compartilhável fora do contexto da origem.
  const producao = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  const dev = process.env.REPLIT_DEV_DOMAIN;
  return producao || dev || null;
}

export function montarLinkPublico(token: string): string {
  const host = hostApp();
  return host ? `https://${host}/p/${token}` : `/p/${token}`;
}

/**
 * Link absoluto para a página da paciente no Console (web, servido na raiz `/`).
 * Usado em avisos à equipe para que o destinatário abra direto o processo.
 */
export function montarLinkConsolePaciente(id: number): string {
  const host = hostApp();
  return host ? `https://${host}/paciente/${id}` : `/paciente/${id}`;
}

/** Paciente → DTO da API (numeric → number, Date → ISO string). */
export function pacienteParaDTO(
  p: Paciente & { vendedoraNome?: string | null },
  opts: { diasAntes: number },
) {
  // Link de assinatura efetivo: o override manual da secretária vence o cache
  // automático da Autentique. O frontend decide exibir só quando faz sentido
  // (status pendente).
  const linkAssinatura =
    p.contratoLinkAssinaturaManual ?? p.contratoLinkAssinatura ?? null;
  // Prazo já calculado (override por paciente, senão dataCirurgia − diasAntes).
  const contratoPrazo = calcularPrazoAssinatura({
    dataCirurgia: p.dataCirurgia,
    contratoPrazoOverride: p.contratoPrazoOverride ?? null,
    diasAntes: opts.diasAntes,
  });
  // Termo de consentimento: mesma lógica de link efetivo e prazo.
  const termoLinkAssinatura =
    p.termoLinkAssinaturaManual ?? p.termoLinkAssinatura ?? null;
  const termoPrazo = calcularPrazoAssinatura({
    dataCirurgia: p.dataCirurgia,
    contratoPrazoOverride: p.termoPrazoOverride ?? null,
    diasAntes: opts.diasAntes,
  });
  // Funil interno da equipe: posição derivada dos sinais do processo (não usa
  // o `estagio` legado). Os carimbos crus seguem no DTO para a UI mostrar datas.
  const jornada = calcularJornadaEquipe(p);
  return {
    id: p.id,
    nome: p.nome,
    cpf: p.cpf,
    telefone: p.telefone,
    email: p.email ?? null,
    twentyContactId: p.twentyContactId ?? null,
    rg: p.rg ?? null,
    nascimento: p.nascimento ?? null,
    endereco: p.endereco ?? null,
    procedimentos: p.procedimentos,
    dataCirurgia: p.dataCirurgia,
    horario: p.horario,
    valorSinal: Number(p.valorSinal),
    valorPendente: Number(p.valorPendente),
    dataPagamentoPendente: p.dataPagamentoPendente ?? null,
    laser: p.laser,
    medica: p.medica,
    crm: p.crm,
    rqe: p.rqe,
    clinica: p.clinica,
    local: p.local,
    localEndereco: p.localEndereco ?? null,
    localId: p.localId ?? null,
    equipeAnestesia: p.equipeAnestesia,
    equipeAnestesiaTelefone: p.equipeAnestesiaTelefone ?? null,
    estagio: p.estagio as "Fechamento" | "Enviado" | "Véspera" | "Cirurgia",
    vendedoraId: p.vendedoraId ?? null,
    vendedoraNome: p.vendedoraNome ?? null,
    arquivado: p.arquivado,
    tokenPublico: p.tokenPublico,
    contratoAutentiqueId: p.contratoAutentiqueId ?? null,
    contratoStatus:
      (p.contratoStatus as
        | "assinado"
        | "pendente"
        | "recusado"
        | "indisponivel"
        | null) ?? null,
    contratoAssinadoEm: p.contratoAssinadoEm ?? null,
    contratoVerificadoEm: p.contratoVerificadoEm
      ? p.contratoVerificadoEm.toISOString()
      : null,
    medicoId: p.medicoId ?? null,
    contratoLinkAssinatura: linkAssinatura,
    contratoLinkAssinaturaManual: p.contratoLinkAssinaturaManual ?? null,
    contratoPrazoOverride: p.contratoPrazoOverride ?? null,
    contratoPrazo,
    // Termo de consentimento
    termoAutentiqueId: p.termoAutentiqueId ?? null,
    termoStatus:
      (p.termoStatus as
        | "assinado"
        | "pendente"
        | "recusado"
        | "indisponivel"
        | null) ?? null,
    termoAssinadoEm: p.termoAssinadoEm ?? null,
    termoVerificadoEm: p.termoVerificadoEm
      ? p.termoVerificadoEm.toISOString()
      : null,
    termoLinkAssinatura,
    termoLinkAssinaturaManual: p.termoLinkAssinaturaManual ?? null,
    termoPrazoOverride: p.termoPrazoOverride ?? null,
    termoPrazo,
    codigoPublico: p.codigoPublico,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    tema: (p.tema as "light" | "dark" | null) ?? null,
    // Jornada interna da equipe (funil de 10 marcos derivado no servidor).
    marcoAtual: jornada.marcoAtual,
    marcoAtualRotulo: jornada.marcoAtualRotulo,
    marcoAtualIndice: jornada.marcoAtualIndice,
    marcosConcluidos: jornada.marcosConcluidos,
    linkEnviadoEm: p.linkEnviadoEm ? p.linkEnviadoEm.toISOString() : null,
    retiradaPontosEm: p.retiradaPontosEm
      ? p.retiradaPontosEm.toISOString()
      : null,
    retorno1Em: p.retorno1Em ? p.retorno1Em.toISOString() : null,
    retorno2Em: p.retorno2Em ? p.retorno2Em.toISOString() : null,
    retorno3Em: p.retorno3Em ? p.retorno3Em.toISOString() : null,
    // Sinais da interação da paciente na página pública, exibidos no dashboard.
    leituraConfirmadaEm: p.leituraConfirmadaEm
      ? p.leituraConfirmadaEm.toISOString()
      : null,
    preparoConcluido: p.preparoConcluido ?? {},
  };
}

function fmtCpfAudit(valor: string): string {
  const c = valor.replace(/\D/g, "");
  return c.length === 11
    ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`
    : valor || "—";
}

function fmtTelefoneAudit(valor: string): string {
  const t = valor.replace(/\D/g, "");
  if (t.length === 11) return `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}`;
  if (t.length === 10) return `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6)}`;
  return valor || "—";
}

/** Campos editáveis e como renderizá-los na trilha de auditoria. */
const CAMPOS_EDITAVEIS: {
  campo: keyof Paciente;
  rotulo: string;
  formatar: (p: Paciente) => string;
}[] = [
  { campo: "nome", rotulo: "Nome", formatar: (p) => p.nome },
  { campo: "cpf", rotulo: "CPF", formatar: (p) => fmtCpfAudit(p.cpf) },
  {
    campo: "telefone",
    rotulo: "Telefone",
    formatar: (p) => fmtTelefoneAudit(p.telefone),
  },
  {
    campo: "procedimentos",
    rotulo: "Procedimentos",
    formatar: (p) => p.procedimentos.join(", "),
  },
  {
    campo: "dataCirurgia",
    rotulo: "Data da cirurgia",
    formatar: (p) => formatarData(p.dataCirurgia),
  },
  { campo: "horario", rotulo: "Horário", formatar: (p) => p.horario },
  {
    campo: "valorSinal",
    rotulo: "Valor pago",
    formatar: (p) => `R$ ${formatarValor(Number(p.valorSinal))}`,
  },
  {
    campo: "valorPendente",
    rotulo: "Valor pendente",
    formatar: (p) =>
      Number(p.valorPendente) > 0
        ? `R$ ${formatarValor(Number(p.valorPendente))}`
        : "—",
  },
  {
    campo: "dataPagamentoPendente",
    rotulo: "Data do pagamento pendente",
    formatar: (p) =>
      p.dataPagamentoPendente ? formatarData(p.dataPagamentoPendente) : "—",
  },
  {
    campo: "laser",
    rotulo: "Laser CO₂",
    formatar: (p) => (p.laser ? "Sim" : "Não"),
  },
  { campo: "local", rotulo: "Local", formatar: (p) => p.local },
  {
    campo: "localEndereco",
    rotulo: "Endereço do local",
    formatar: (p) => p.localEndereco ?? "",
  },
  { campo: "medica", rotulo: "Médica", formatar: (p) => p.medica },
  { campo: "crm", rotulo: "CRM", formatar: (p) => p.crm },
  { campo: "rqe", rotulo: "RQE", formatar: (p) => p.rqe },
  { campo: "clinica", rotulo: "Clínica", formatar: (p) => p.clinica },
];

/** Compara dois estados do paciente e devolve apenas os campos que mudaram. */
export function diffPaciente(
  anterior: Paciente,
  atual: Paciente,
): AlteracaoCampo[] {
  const alteracoes: AlteracaoCampo[] = [];
  for (const { campo, rotulo, formatar } of CAMPOS_EDITAVEIS) {
    // Compara o valor renderizado — robusto para arrays (procedimentos) e
    // numéricos, que mudam de referência a cada leitura do banco.
    const de = formatar(anterior);
    const para = formatar(atual);
    if (de !== para) {
      alteracoes.push({ campo, rotulo, de, para });
    }
  }
  return alteracoes;
}

interface ItemChecklist {
  titulo: string;
  sempre: boolean;
  incluido: boolean;
}

/** Checklist de PDFs do Medx. A receita pré-laser só entra quando laser = true. */
function checklistMedx(laser: boolean): ItemChecklist[] {
  return [
    { titulo: "Pedido de exames pré-operatórios", sempre: true, incluido: true },
    {
      titulo: "Lista de suspensão de medicamentos (conforme a anestesia)",
      sempre: true,
      incluido: true,
    },
    {
      titulo: "Receita de pós-operatório (antecipada)",
      sempre: true,
      incluido: true,
    },
    { titulo: "Receita pré-laser CO₂", sempre: false, incluido: laser },
  ];
}

/** Saídas geradas para o Console (textos verbatim + blocos operacionais). */
export function montarSaidas(p: Paciente) {
  const link = montarLinkPublico(p.codigoPublico);
  const nome = p.nome;
  const pNome = primeiroNome(nome);
  const data = formatarData(p.dataCirurgia);
  const pago = formatarValor(Number(p.valorSinal));
  const pendenteNum = Number(p.valorPendente);
  const temPendente = pendenteNum > 0;
  const pendente = formatarValor(pendenteNum);
  const dataPgto = p.dataPagamentoPendente
    ? formatarData(p.dataPagamentoPendente)
    : null;
  const procedimentosTexto = p.procedimentos.join(", ");
  const prazoDocumentos = `Lembrando: todos os documentos precisam estar assinados${
    temPendente ? " e os valores quitados" : ""
  } até 48h antes da cirurgia.`;
  const hospital = perfilLocalDoPaciente(p.local, p.localEndereco, p.localSnapshot);
  const equipeNome = p.equipeAnestesia;
  const equipeTelefone = p.equipeAnestesiaTelefone ?? "";
  // "Nome (telefone)" quando há telefone; só o nome caso contrário.
  const equipeComTelefone = equipeTelefone
    ? `${equipeNome} (${equipeTelefone})`
    : equipeNome;
  const local = localTexto(hospital);
  const chegada =
    hospital.instrucoesChegada && hospital.instrucoesChegada !== A_PREENCHER
      ? hospital.instrucoesChegada
      : "confirmar a janela de chegada com a equipe.";

  const medicaNome = p.medica;
  const medicaCurto = nomeCurtoMedica(p.medica);

  // Mensagem única — voz contida, SEM emoji (verbatim).
  const mensagemUnica = `Olá, ${pNome}. Sua cirurgia com a ${medicaNome} está confirmada para ${data} às ${p.horario}, no ${hospital.nomeCompleto}. Reunimos tudo o que você precisa — orientações, documentos e contatos — em um só lugar, com calma: ${link}. Qualquer dúvida, é só responder por aqui.`;

  // A6 — Confirmação de reserva. Fala do valor pago e, quando há saldo em
  // aberto, do valor pendente (+ data prevista). Acrescenta o prazo de 48h.
  const pagamentoFrase = temPendente
    ? `Recebemos o pagamento de R$ ${pago} referente aos honorários da ${medicaCurto}. Ainda há um valor pendente de R$ ${pendente}${
        dataPgto ? `, com pagamento previsto para ${dataPgto}` : ""
      }.`
    : `Recebemos o pagamento de R$ ${pago} referente aos honorários da ${medicaCurto}.`;
  const a6 = `Olá, ${nome}. Tudo bem? ✅ Confirmação de Reserva: ${pagamentoFrase} Com isso, sua cirurgia está oficialmente confirmada para: Data: ${data} · Horário: ${p.horario} · Local: 📍 ${local}. ${prazoDocumentos}`;

  // A7 — Pré-operatório (verbatim, mantém emojis do original).
  const a7 = `(Pré-Operatório) A seguir, enviaremos todos os PDFs: pedidos de exames e avaliações; lista de suspensão de medicações (conforme a anestesia); receita de pós-operatório (antecipada). 🗓️ Um dia antes da cirurgia: contato para a cobrança do valor final dos honorários. 💳 Taxas de terceiros (CC e Anestesia): o Centro Cirúrgico e a ${equipeComTelefone} entram em contato 7–10 dias antes.`;

  // A8 — Política de remarcação (verbatim). Referência ao valor TOTAL da cirurgia.
  const a8 = `>14 dias → sem custo · 7–14 dias → retém 50% do valor total da cirurgia · <7 dias ou não comparecimento → retém 100% do valor total da cirurgia. Cobre custos de reserva de CC e equipe já alocados. Emergência médica comprovada → avaliação individual.`;

  // A4 — Bloco operacional para o Centro Cirúrgico.
  const a4 = `Centro Cirúrgico — disponibilidade\nPaciente: ${nome}\nProcedimentos: ${procedimentosTexto}\nData: ${data} · Horário: ${p.horario}\nLocal: ${local}\nCirurgiã: ${medicaNome}\nContato CC: ${hospital.contatoCCNome} ${hospital.contatoCCTelefone}`;

  // A5 — Bloco operacional para a anestesia.
  const a5 = `Anestesia — ${equipeComTelefone}\nPaciente: ${nome}\nProcedimentos: ${procedimentosTexto}\nData: ${data} · Horário: ${p.horario}\nLocal: ${local}\nObservação: ${chegada}`;

  const avisoOperacional = `Confirme a disponibilidade com ${hospital.contatoCCNome} (Centro Cirúrgico) antes de qualquer envio.`;

  return {
    link,
    mensagemUnica,
    a6,
    a7,
    a8,
    a4,
    a5,
    avisoOperacional,
    checklistMedx: checklistMedx(p.laser),
  };
}

/** Tipos de evento aceitos na página pública da paciente. */
export const TIPOS_EVENTO = [
  "abertura",
  "calendario",
  "mapa",
  "resumo",
  "whatsapp",
  "ligacao",
  "preparo",
  "documento",
  "politica",
] as const;

export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export function ehTipoEvento(v: string): v is TipoEvento {
  return (TIPOS_EVENTO as readonly string[]).includes(v);
}

/** Descrição legível de um evento, para a linha do tempo do Console. */
export function descreverEvento(tipo: string, rotulo?: string | null): string {
  const r = rotulo?.trim();
  switch (tipo) {
    case "abertura":
      return "Abriu o link";
    case "calendario":
      return "Adicionou a cirurgia ao calendário";
    case "mapa":
      return "Abriu o endereço no mapa";
    case "resumo":
      return "Baixou o resumo (PDF)";
    case "whatsapp":
      return "Abriu a conversa no WhatsApp";
    case "ligacao":
      return r ? `Iniciou uma ligação — ${r}` : "Iniciou uma ligação";
    case "preparo":
      return r ? `Marcou no preparo: ${r}` : "Marcou um item de preparo";
    case "documento":
      return r ? `Marcou documento: ${r}` : "Marcou um documento";
    case "politica":
      return "Abriu a Política de Remarcação";
    default:
      return r ? `Interação: ${r}` : "Interação";
  }
}

/**
 * Página pública da paciente (território Dra. Karla, dados por token).
 *
 * A logística (data, horário, local, endereço, laser) continua automática. O
 * conteúdo editável vem em `secoes`: usa o override da paciente quando existir,
 * senão o padrão global recebido em `secoesPadrao`. As variáveis e as datas da
 * linha do tempo são resolvidas aqui.
 */
export function montarPaginaPaciente(
  p: Paciente,
  secoesPadrao: SecaoConteudo[],
  temaPadrao: "light" | "dark" = "light",
  documentos: DocumentoPaciente[] = [],
  extra: {
    medicoFotoUrl: string | null;
    medicoLogoUrl: string | null;
    contratoLinkAssinatura: string | null;
    contratoPrazo: string | null;
    termoLinkAssinatura: string | null;
    termoPrazo: string | null;
    pedidoExames?: PedidoExamesPaciente | null;
    receitaPreparoPele?: ReceitaPreparoPelePaciente | null;
    receituarioPosop?: ReceituarioPosopPaciente | null;
  } = {
    medicoFotoUrl: null,
    medicoLogoUrl: null,
    contratoLinkAssinatura: null,
    contratoPrazo: null,
    termoLinkAssinatura: null,
    termoPrazo: null,
    pedidoExames: null,
    receitaPreparoPele: null,
    receituarioPosop: null,
  },
) {
  const hospital = perfilLocalDoPaciente(p.local, p.localEndereco, p.localSnapshot);
  const pendenteNum = Number(p.valorPendente);
    const pagamento = {
      valorPago: Number(p.valorSinal),
      valorPendente: pendenteNum,
      dataPagamentoPendente: p.dataPagamentoPendente ?? null,
      quitado: pendenteNum <= 0,
    };
    const prazoDocumentos = `Todos os documentos precisam estar assinados${
      pendenteNum > 0 ? " e os valores quitados" : ""
    } até 48 horas antes da cirurgia.`;

    const secoesBase = p.conteudoPagina ?? secoesPadrao;
    const secoes = resolverSecoes(secoesBase, p);

  return {
    primeiroNome: primeiroNome(p.nome),
    nome: p.nome,
    medica: p.medica,
    crm: p.crm,
    rqe: p.rqe,
    clinica: p.clinica,
    especialidade: "Oftalmologia",
    procedimentos: p.procedimentos,
    dataCirurgia: p.dataCirurgia,
    horario: p.horario,
    local: hospital.nomeCompleto,
    enderecoLocal: hospital.endereco,
    laser: p.laser,
    pagamento,
    prazoDocumentos,
    secoes,
    documentos: documentos.map((d) => ({
      // Apenas o token opaco vai para o cliente — nunca o id interno nem o
      // caminho do objeto no armazenamento.
      token: d.tokenPublico,
      rotulo: d.rotulo,
      nomeArquivo: d.nomeArquivo,
      tamanho: d.tamanho,
    })),
    // Pedido de exames (um por paciente), exibido na seção de procedimentos
    // pré-operatórios. Só o token opaco vai para o cliente. null quando não há.
    pedidoExames: extra.pedidoExames
      ? {
          token: extra.pedidoExames.tokenPublico,
          nomeArquivo: extra.pedidoExames.nomeArquivo,
          tamanho: extra.pedidoExames.tamanho,
        }
      : null,
    // Receita de preparo da pele (uma por paciente), exibida na seção de preparo
    // da pele. Só o token opaco vai para o cliente. null quando não há.
    receitaPreparoPele: extra.receitaPreparoPele
      ? {
          token: extra.receitaPreparoPele.tokenPublico,
          nomeArquivo: extra.receitaPreparoPele.nomeArquivo,
          tamanho: extra.receitaPreparoPele.tamanho,
        }
      : null,
    // Receituário pós-operatório (um por paciente). Só o token opaco vai ao cliente.
    receituarioPosop: extra.receituarioPosop
      ? {
          token: extra.receituarioPosop.tokenPublico,
          nomeArquivo: extra.receituarioPosop.nomeArquivo,
          tamanho: extra.receituarioPosop.tamanho,
        }
      : null,
    contratoStatus:
      (p.contratoStatus as
        | "assinado"
        | "pendente"
        | "recusado"
        | "indisponivel"
        | null) ?? null,
    contratoAssinadoEm: p.contratoAssinadoEm ?? null,
    medicoFotoUrl: extra.medicoFotoUrl,
    medicoLogoUrl: extra.medicoLogoUrl,
    contratoLinkAssinatura: extra.contratoLinkAssinatura,
    contratoPrazo: extra.contratoPrazo,
    // Termo de consentimento na página pública
    termoStatus:
      (p.termoStatus as
        | "assinado"
        | "pendente"
        | "recusado"
        | "indisponivel"
        | null) ?? null,
    termoAssinadoEm: p.termoAssinadoEm ?? null,
    termoLinkAssinatura: extra.termoLinkAssinatura,
    termoPrazo: extra.termoPrazo,
    tema: (p.tema as "light" | "dark" | null) ?? null,
    temaPadrao,
    equipeAnestesia: p.equipeAnestesia ?? null,
    equipeAnestesiaTelefone: p.equipeAnestesiaTelefone ?? null,
    // Checklist de preparo já marcado (mapa chave→true) e confirmação de
    // leitura — para a página hidratar a done-list do servidor e refletir o
    // estado do "Li e estou ciente".
    preparoConcluido: p.preparoConcluido ?? {},
    leituraConfirmadaEm: p.leituraConfirmadaEm
      ? p.leituraConfirmadaEm.toISOString()
      : null,
  };
}
