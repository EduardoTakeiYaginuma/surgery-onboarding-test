import type { Paciente, SecaoConteudo } from "@workspace/db";
import {
  type ContextoCompleto,
  VARIAVEIS_DISPONIVEIS,
  montarContextoCompleto,
  resolverVariaveis,
  resolverSecoesComContexto,
} from "@workspace/secoes";
import {
  perfilLocalDoPaciente,
  localTexto,
  A_PREENCHER,
  type HospitalProfile,
} from "./protocolo";

/**
 * Conteúdo editável da página pública — padrão de fábrica (seed).
 *
 * Espelha exatamente o que `montarPaginaPaciente` produzia de forma fixa, agora
 * como seções editáveis. Os textos usam variáveis no formato `{{chave}}`,
 * resolvidas por paciente em `resolverSecoes`. A linha do tempo guarda apenas o
 * deslocamento em dias (`offsetDias`) relativo à data da cirurgia — a data real
 * é calculada na hora de exibir, mantendo a logística automática.
 *
 * As variáveis disponíveis vêm do catálogo único em `@workspace/secoes`
 * (`VARIAVEIS_DISPONIVEIS`), re-exportado aqui por conveniência dos consumidores
 * do api-server. Não declare a lista localmente — acrescente a chave no catálogo.
 */
export { VARIAVEIS_DISPONIVEIS };

export const CONTEUDO_PADRAO_SEED: SecaoConteudo[] = [
  {
    id: "como-se-preparar",
    tipo: "lista",
    titulo: "Como se preparar",
    itens: [
      "Realize os exames e as avaliações solicitados antes da data da cirurgia.",
      "Siga a lista de suspensão de medicamentos conforme a orientação da anestesia.",
      "No dia, leve um acompanhante.",
      "Chegue ao {{hospital}} no horário combinado: {{horario}}. {{instrucoesChegada}}",
    ],
  },
  {
    id: "confirmacao-reserva",
    tipo: "texto",
    titulo: "Confirmação da Reserva",
    // Texto pré-preenchido e editável (como as demais seções de Conteúdo). O valor
    // pago (`{{valorReserva}}`) e a situação dos honorários (`{{statusHonorarios}}`)
    // são resolvidos por paciente na fonte única — `statusHonorarios` já varia entre
    // "integralmente quitado" e "resta um saldo…", então o texto reflete o pagamento
    // real sem precisar de duas versões manuais.
    corpo:
      "Recebemos o pagamento de {{valorReserva}} referente à reserva dos honorários médicos. Sua cirurgia está oficialmente agendada. {{statusHonorarios}}",
  },
  {
    id: "linha-do-tempo",
    tipo: "linha_do_tempo",
    titulo: "Sua jornada",
    etapas: [
      {
        quando: "Reserva confirmada",
        titulo: "Sua cirurgia está confirmada",
        descricao:
          "Reunimos aqui tudo o que você precisa — orientações, documentos e contatos — para chegar tranquila ao dia da cirurgia.",
        offsetDias: 0,
      },
      {
        quando: "Taxas de terceiros",
        titulo: "Contato do Centro Cirúrgico e da anestesia",
        descricao:
          "O Centro Cirúrgico e a {{equipe}} (anestesia) entram em contato para tratar das taxas de terceiros.",
        offsetDias: -10,
      },
      {
        quando: "Um dia antes",
        titulo: "Valor final dos honorários",
        descricao:
          "Entramos em contato para a cobrança do valor final dos honorários da {{medica}}.",
        offsetDias: -1,
      },
      {
        quando: "{{horario}}",
        titulo: "{{hospital}}",
        descricao: "Compareça ao {{local}}.",
        offsetDias: 0,
      },
      {
        quando: "Recuperação",
        titulo: "Orientações de pós-operatório",
        descricao:
          "Você recebe as orientações e a receita de pós-operatório, enviadas de forma antecipada.",
        offsetDias: null,
      },
    ],
  },
  {
    id: "exames-pre-operatorios",
    tipo: "preparo",
    titulo: "Exames Pré-Operatórios",
    // Seção exibida como bloco recolhível na página da paciente: uma descrição
    // (`corpo`) + a lista de exames (`itens`, marcáveis) que a paciente deve
    // realizar. O PDF com o pedido de todos os exames é anexado por paciente
    // (tabela `pacientes_pedido_exames`) e baixável dentro da seção. Este é o
    // modelo inicial; a equipe ajusta a lista por paciente quando necessário.
    corpo:
      "Realize os exames abaixo o mais breve possível e nos envie os resultados para anexarmos ao seu prontuário.",
    itens: [
      "Hemograma completo",
      "Coagulograma",
      "Hemoglobina glicada",
      "Glicemia de jejum",
      "Sódio",
      "Creatinina",
      "Ureia",
      "HIV 1 e 2",
      "TGO / TGP",
      "Anti-HIV 1 e 2",
      "Ag HBs, Ag HBe, Anti HBc",
      "Anti HCV",
      "VDRL",
    ],
  },
  {
    id: "suspensao-medicamentos",
    tipo: "suspensao_medicamentos",
    titulo: "Suspensão de Medicamentos",
    // Subtítulo (editável) exibido logo abaixo do título.
    corpo:
      "Se você utiliza algum dos medicamentos abaixo, suspenda-o com a antecedência indicada. Caso não use nenhum deles, desconsidere esta seção.",
    // Callout de rodapé (editável).
    aviso:
      "Se você toma medicamentos de uso contínuo que não estão nesta lista, mantenha o uso normal conforme orientação do seu médico. Caso tenha dúvida sobre algum medicamento específico, entre em contato conosco.",
    // Modelo inicial com alguns exemplos do protocolo — a equipe personaliza por
    // janela e adiciona/remove medicamentos pelo editor. A data-limite ("ATÉ
    // dd/mm") de cada janela é calculada a partir do `offsetDias` na hora de
    // exibir, relativa à data da cirurgia da paciente.
    grupos: [
      {
        quando: "21 dias antes",
        offsetDias: -21,
        medicamentos: [
          { marca: "Ozempic, Wegovy, Rybelsus", principio: "Semaglutida" },
        ],
      },
      {
        quando: "7 dias antes",
        offsetDias: -7,
        medicamentos: [
          { marca: "Marevan, Coumadin, Jantoven", principio: "Varfarina" },
          { marca: "Plavix, Iscover", principio: "Clopidogrel" },
        ],
      },
      {
        quando: "3 dias antes (72h)",
        offsetDias: -3,
        medicamentos: [
          { marca: "Xarelto", principio: "Rivaroxabana" },
          { marca: "Eliquis", principio: "Apixabana" },
        ],
      },
    ],
  },
  {
    id: "preparo-pele",
    tipo: "preparo_pele",
    titulo: "Preparo da Pele",
    // Subtítulo (editável) exibido abaixo do título.
    corpo:
      "Inicie o uso dos produtos abaixo conforme orientação. Eles ajudam a preparar sua pele para o melhor resultado cirúrgico.",
    // Modelo inicial com os produtos do protocolo — a equipe personaliza por
    // paciente. A receita (PDF) com a prescrição completa é anexada por paciente
    // e baixável na seção.
    produtos: [
      {
        nome: "Blancy TX — Mantecorp",
        instrucao: "Aplicar 1 camada na pele à noite, todos os dias, até o dia da cirurgia.",
        inicio: "Iniciar 10 dias antes da cirurgia.",
        tag: "1 frasco · Uso tópico noturno",
      },
      {
        nome: "Cicaplast Baume B5 — La Roche-Posay",
        instrucao: "Aplicar 1 camada sobre a pele para hidratação. Uso diário.",
        inicio: "Iniciar 10 dias antes da cirurgia e continuar por mais 10 dias após.",
        tag: "1 frasco · Uso tópico diário",
      },
    ],
  },
  {
    id: "receituario-posop",
    tipo: "receituario_posop",
    titulo: "Receituário Pós-Operatório",
    // Descrição (editável) exibida abaixo do título.
    corpo:
      "Medicações que serão utilizadas após o procedimento. Já deixe tudo separado para o dia da cirurgia.",
    // Callout de rodapé (editável).
    aviso:
      "Indicações de protetor solar:\nFPS 60 ISDIN Fusion — mais fluido, líquido.\nFPS 50 Bioderma Photoderm Cover Touch — mais base, cremoso, com cobertura.",
    // Modelo inicial com as medicações do protocolo — a equipe personaliza por
    // paciente. O receituário (PDF) completo é anexado por paciente e baixável na seção.
    medicacoes: [
      {
        nome: "Cefalexina 500mg",
        instrucao: "Tomar 1 comprimido de 6/6 horas por 7 dias.",
        via: "Via oral",
      },
      {
        nome: "Dipirona 500mg ou Paracetamol 750mg",
        instrucao: "Tomar 1 comprimido de 8/8 horas, se dor.",
        via: "Via oral",
      },
      {
        nome: "Predsin 40mg",
        instrucao: "Tomar 1 comprimido 1x ao dia, por 3 dias.",
        via: "Via oral",
      },
      {
        nome: "Maxflox D — Colírio",
        instrucao: "Aplicar 1 gota em cada olho 4x ao dia, por 1 semana.",
        via: "Uso ocular",
      },
      {
        nome: "Kelo-cote UV FPS 30",
        instrucao:
          "Após remoção de pontos: aplicar uma fina camada na cicatriz 2x ao dia por 3 meses.",
        via: "Uso tópico",
      },
    ],
  },
  {
    id: "documentos",
    tipo: "documentos",
    titulo: "No Dia da Cirurgia",
    // Subtítulo (editável) exibido acima do card "Levar no dia". `{{data}}` é a
    // data da cirurgia, resolvida por paciente na fonte única.
    corpo:
      "Orientações do que fazer e levar em {{data}} para sua cirurgia. Siga cada item para garantir sua segurança e o melhor resultado.",
    itens: [
      "Pedido de exames pré-operatórios",
      "Lista de suspensão de medicamentos (conforme a anestesia)",
      "Receita de pós-operatório (antecipada)",
    ],
  },
  {
    id: "politica-remarcacao",
    tipo: "politica",
    titulo: "Política de Remarcação",
    // Estruturado por faixa de prazo (a `politica` renderiza `corpo` com
    // `whitespace-pre-line`, então as quebras de linha aparecem na página).
    corpo:
      "Mais de 14 dias de antecedência\nSem custo.\n\nEntre 7 e 14 dias\nRetenção de 50% do valor total da cirurgia.\n\nMenos de 7 dias ou não comparecimento\nRetenção de 100% do valor total da cirurgia.\n\nA retenção cobre os custos de reserva do centro cirúrgico e da equipe já alocados. Em caso de emergência médica comprovada, a situação é avaliada individualmente.",
  },
  {
    id: "contatos",
    tipo: "contatos",
    titulo: "Precisa falar conosco?",
    contatos: [
      { rotulo: "Secretaria KCL (WhatsApp)", valor: "(11) 5295-0348" },
      { rotulo: "Anestesia — {{equipe}}", valor: "{{equipeTelefone}}" },
    ],
  },
];

/**
 * Texto de chegada/jejum específico do hospital, com um fallback genérico para
 * quando o protocolo ainda não tem a instrução cadastrada ({a preencher}). Assim
 * a página da paciente nunca exibe o placeholder cru.
 */
export function instrucoesChegadaTexto(h: HospitalProfile): string {
  return h.instrucoesChegada && h.instrucoesChegada !== A_PREENCHER
    ? h.instrucoesChegada
    : "Confirme a janela de chegada e o tempo de jejum com a equipe.";
}

/** Monta o dicionário de variáveis a partir do paciente e do protocolo. */
export function montarContexto(p: Paciente): ContextoCompleto {
  const hospital = perfilLocalDoPaciente(p.local, p.localEndereco);
  return montarContextoCompleto({
    nome: p.nome,
    dataCirurgia: p.dataCirurgia,
    horario: p.horario,
    hospital: hospital.nomeCompleto,
    local: localTexto(hospital),
    medica: p.medica,
    equipe: p.equipeAnestesia,
    equipeTelefone: p.equipeAnestesiaTelefone ?? "",
    instrucoesChegada: instrucoesChegadaTexto(hospital),
    valorPago: Number(p.valorSinal),
    valorPendente: Number(p.valorPendente),
    dataPagamentoPendente: p.dataPagamentoPendente ?? null,
  });
}

/**
 * Resolve as seções para uma paciente: troca variáveis em todos os textos e
 * calcula as datas da linha do tempo. Não altera a estrutura nem a ordem. A
 * lógica de substituição vive em `@workspace/secoes` — fonte única partilhada
 * com a pré-visualização do Console.
 */
export function resolverSecoes(
  secoes: SecaoConteudo[],
  p: Paciente,
): SecaoConteudo[] {
  return resolverSecoesComContexto(secoes, montarContexto(p), p.dataCirurgia);
}
