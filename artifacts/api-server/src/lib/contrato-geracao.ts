import type { Paciente, DecisaoRegiao } from "@workspace/db";
import {
  type Contexto,
  VARIAVEIS_DISPONIVEIS,
  resolverVariaveis,
  formatarData,
  ehHtml,
  escapeHtml,
} from "@workspace/secoes";
import { formatarCpf } from "@workspace/br-validacao";
import { montarContexto } from "./conteudo-padrao";
import {
  type ConteudoProcedimento,
  obterConteudoProcedimento,
} from "./documento-procedimento-conteudo";
import {
  TOKENS_GENERO,
  CHAVES_GENERO,
  generoDe,
  resolverModelo,
} from "./contrato-regioes";

/** Tipos de documento que um modelo-base pode ter. */
export type TipoDocumento = "contrato" | "termo";

const TIPOS_DOCUMENTO = [
  "contrato",
  "termo",
] as const satisfies readonly TipoDocumento[];

/**
 * Variáveis ESSENCIAIS por tipo de documento. Sem qualquer uma delas no corpo, o
 * documento gerado sai genérico de um jeito que compromete a validade jurídica —
 * sem o nome da paciente, o(s) procedimento(s), as credenciais da médica ou os
 * valores. É a base do "freio" ao marcar um modelo como vigente: diferente do
 * aviso consultivo (que lista TODAS as variáveis ausentes), só estas exigem uma
 * confirmação explícita. Manter enxuto — apenas o que de fato não pode faltar.
 */
export const VARIAVEIS_ESSENCIAIS = {
  contrato: [
    "nome",
    "procedimentos",
    "medica",
    "crm",
    "rqe",
    "valorPago",
    "valorPendente",
  ],
  termo: ["nome", "procedimentos"],
} as const satisfies Record<TipoDocumento, readonly string[]>;

/** Tipos de documento para os quais a variável `chave` é essencial. */
function essencialPara(chave: string): TipoDocumento[] {
  return TIPOS_DOCUMENTO.filter((tipo) =>
    (VARIAVEIS_ESSENCIAIS[tipo] as readonly string[]).includes(chave),
  );
}

/**
 * Catálogo das variáveis disponíveis nos MODELOS DE CONTRATO. Estende o catálogo
 * público (`{{nome}}`, `{{data}}`, ...) com campos próprios do contrato —
 * inclusive dados sensíveis (CPF) e financeiros que NUNCA entram no contexto da
 * página pública. Este contexto é usado apenas no documento jurídico interno.
 * Cada item carrega `essencialPara`: os tipos de documento em que a variável é
 * imprescindível (alimenta o freio do Console ao marcar um modelo como vigente).
 */
const CATALOGO_BASE = [
  ...VARIAVEIS_DISPONIVEIS,
  { chave: "cpf", descricao: "CPF da paciente (formatado)" },
  { chave: "email", descricao: "E-mail da paciente" },
  { chave: "telefone", descricao: "Telefone/WhatsApp da paciente" },
  { chave: "procedimentos", descricao: "Procedimento(s) contratado(s)" },
  { chave: "valorPago", descricao: "Valor já pago (R$)" },
  { chave: "valorPendente", descricao: "Saldo em aberto (R$)" },
  { chave: "dataPagamento", descricao: "Vencimento do saldo (dd/mm/aaaa)" },
  { chave: "clinica", descricao: "Clínica" },
  { chave: "crm", descricao: "CRM da médica" },
  { chave: "rqe", descricao: "RQE da médica" },
  {
    chave: "naturezaProcedimentos",
    descricao:
      "Natureza/objetivo de TODOS os procedimentos selecionados, combinada e identificada por procedimento",
  },
  {
    chave: "riscosProcedimentos",
    descricao:
      "Riscos de TODOS os procedimentos selecionados, combinados e identificados por procedimento",
  },
  {
    chave: "cuidadosProcedimentos",
    descricao:
      "Cuidados pré e pós-operatórios de TODOS os procedimentos selecionados, combinados e identificados por procedimento",
  },
  {
    chave: "alternativasProcedimentos",
    descricao:
      "Alternativas de tratamento de TODOS os procedimentos selecionados, combinadas e identificadas por procedimento",
  },
  // Concordância de gênero (resolvida pela decisão de gênero da geração).
  { chave: "contratante", descricao: "a/o CONTRATANTE (concordância de gênero)" },
  { chave: "da", descricao: "da/do paciente (concordância de gênero)" },
  { chave: "ao", descricao: "à/ao paciente (concordância de gênero)" },
  { chave: "operada", descricao: "operada/operado (concordância de gênero)" },
  { chave: "portador", descricao: "portadora/portador (concordância de gênero)" },
  {
    chave: "domiciliada",
    descricao: "domiciliada/domiciliado (concordância de gênero)",
  },
  { chave: "ela", descricao: "ela/ele (concordância de gênero)" },
] as const satisfies readonly { chave: string; descricao: string }[];

export const VARIAVEIS_CONTRATO = CATALOGO_BASE.map((v) => ({
  chave: v.chave,
  descricao: v.descricao,
  essencialPara: essencialPara(v.chave),
})) satisfies readonly {
  chave: string;
  descricao: string;
  essencialPara: TipoDocumento[];
}[];

/**
 * Chaves do contexto cujo VALOR já é HTML pronto: os blocos clínicos combinados
 * (natureza/riscos/cuidados/alternativas) de TODOS os procedimentos da paciente.
 * Diferente das demais variáveis — que entram como texto e precisam ser escapadas
 * para não quebrar a marcação —, estas são montadas aqui como HTML canônico
 * (parágrafos/listas), com o conteúdo dinâmico já escapado internamente. Por isso
 * ficam de fora do escape geral em `escaparContexto`.
 */
export const CHAVES_HTML_CONTRATO: ReadonlySet<string> = new Set([
  "naturezaProcedimentos",
  "riscosProcedimentos",
  "cuidadosProcedimentos",
  "alternativasProcedimentos",
]);

/** Parágrafo de cabeçalho com o nome do procedimento (negrito), no modo multi. */
function cabecalhoProcedimento(nome: string): string {
  return `<p><strong>${escapeHtml(nome)}</strong></p>`;
}

/** Parágrafo com texto já escapado. */
function paragrafoHtml(texto: string): string {
  return `<p>${escapeHtml(texto)}</p>`;
}

/** Lista não ordenada com itens já escapados. */
function listaHtml(itens: string[]): string {
  return `<ul>${itens.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

/**
 * Combina um aspecto clínico (natureza/riscos/cuidados/alternativas) de TODOS os
 * procedimentos da paciente num único bloco HTML. Com um único procedimento, o
 * bloco é "plano" (sem cabeçalho). Com vários, cada procedimento ganha um
 * cabeçalho com o nome para identificar a que ele se refere. Procedimentos fora
 * do catálogo caem no conteúdo genérico (`obterConteudoProcedimento`). O retorno
 * é HTML pronto — entra no documento sem reescape (ver `CHAVES_HTML_CONTRATO`).
 */
function combinarProcedimentos(
  procedimentos: string[],
  render: (c: ConteudoProcedimento) => string,
): string {
  const nomes = procedimentos.length > 0 ? procedimentos : ["o procedimento"];
  const multi = nomes.length > 1;
  return nomes
    .map((nome) => {
      const bloco = render(obterConteudoProcedimento(nome));
      return multi ? `${cabecalhoProcedimento(nome)}${bloco}` : bloco;
    })
    .join("");
}

/** Formata um valor numérico em string para Reais (R$ 1.234,56). */
function formatarReais(valor: string): string {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return valor;
  return numero.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Monta o dicionário de variáveis do CONTRATO a partir da paciente: reusa o
 * contexto público (fonte única em `@workspace/secoes`) e acrescenta os campos
 * próprios do contrato. CPF e valores ficam SOMENTE aqui — nunca no contexto da
 * página pública.
 */
export function montarContextoContrato(
  p: Paciente,
  decisoes?: DecisaoRegiao[],
): Contexto {
  // Tokens de concordância de gênero ({{contratante}}, {{operada}}, …) a partir
  // da decisão de gênero (default: heurística pelo nome).
  const genero = TOKENS_GENERO[generoDe(decisoes, p.nome ?? "")];
  return {
    ...montarContexto(p),
    ...genero,
    cpf: p.cpf ? formatarCpf(p.cpf) : "—",
    email: p.email?.trim() ? p.email.trim() : "—",
    telefone: p.telefone?.trim() ? p.telefone.trim() : "—",
    procedimentos: p.procedimentos.join(", "),
    valorPago: formatarReais(p.valorSinal),
    valorPendente: formatarReais(p.valorPendente),
    dataPagamento: p.dataPagamentoPendente
      ? formatarData(p.dataPagamentoPendente)
      : "—",
    clinica: p.clinica,
    crm: p.crm,
    rqe: p.rqe,
    naturezaProcedimentos: combinarProcedimentos(p.procedimentos, (c) =>
      paragrafoHtml(c.natureza),
    ),
    riscosProcedimentos: combinarProcedimentos(p.procedimentos, (c) =>
      listaHtml(c.riscos),
    ),
    cuidadosProcedimentos: combinarProcedimentos(p.procedimentos, (c) =>
      listaHtml(c.cuidados),
    ),
    alternativasProcedimentos: combinarProcedimentos(p.procedimentos, (c) =>
      listaHtml(c.alternativas),
    ),
  };
}

/**
 * Gera o rascunho do contrato preenchendo o modelo-base com os dados da
 * paciente. A lógica de substituição vive em `@workspace/secoes` (fonte única),
 * a mesma usada pela página pública — garantindo consistência.
 */
export function gerarRascunhoContrato(
  modelo: { titulo: string; corpo: string },
  p: Paciente,
  decisoesPrevias?: DecisaoRegiao[],
): { titulo: string; corpo: string; decisoes: DecisaoRegiao[] } {
  // 1) Motor de cláusulas: resolve variantes/opcionais e renumera (o corpo sai
  //    com as `{{variáveis}}` ainda intactas). Decisões prévias confirmadas têm
  //    precedência sobre a inferência.
  const { corpo: resolvido, decisoes } = resolverModelo(
    modelo.corpo,
    p,
    decisoesPrevias,
  );
  // 2) Substituição de variáveis (inclui os tokens de gênero das decisões).
  const ctx = montarContextoContrato(p, decisoes);
  return {
    titulo: resolverVariaveis(modelo.titulo, ctx),
    corpo: preencherCorpo(resolvido, p, decisoes),
    decisoes,
  };
}

/**
 * Versão da geração usada SÓ na prévia ao vivo: além de resolver tudo como o
 * rascunho, envolve cada valor de variável escalar num marcador
 * `<span data-var="chave">valor</span>`. Isso permite à prévia (renderizada como
 * HTML estático) localizar, rolar até e destacar o trecho quando o operador foca
 * o campo correspondente na ficha. Os blocos clínicos (HTML pronto) NÃO são
 * envolvidos — um `<span>` não pode conter parágrafos/listas. Não é usado no
 * documento persistido (o rascunho editável segue sem marcadores).
 */
export function gerarPreviaContrato(
  modelo: { titulo: string; corpo: string },
  p: Paciente,
  decisoesPrevias?: DecisaoRegiao[],
): { titulo: string; corpo: string; decisoes: DecisaoRegiao[] } {
  const { corpo: resolvido, decisoes } = resolverModelo(
    modelo.corpo,
    p,
    decisoesPrevias,
  );
  const ctx = montarContextoContrato(p, decisoes);
  return {
    titulo: resolverVariaveis(modelo.titulo, ctx),
    corpo: preencherCorpoMarcado(resolvido, p, decisoes),
    decisoes,
  };
}

/** Preenche o corpo envolvendo cada variável escalar num `<span data-var>`. */
function preencherCorpoMarcado(
  corpo: string,
  p: Paciente,
  decisoes: DecisaoRegiao[],
): string {
  const ctx = montarContextoContrato(p, decisoes);
  const ctxCorpo = ehHtml(corpo) ? escaparContexto(ctx) : ctx;
  return corpo.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (original, chave: string) => {
    const valor = ctxCorpo[chave];
    if (valor === undefined) return original;
    // Blocos clínicos são HTML pronto — não podem ir dentro de um <span>.
    if (CHAVES_HTML_CONTRATO.has(chave)) return valor;
    return `<span data-var="${chave}">${valor}</span>`;
  });
}

/**
 * Preenche as `{{variáveis}}` de um CORPO de documento com os dados da paciente.
 * É a mesma substituição usada na geração do rascunho — exposta à parte para que
 * a edição manual do rascunho (PUT) também resolva variáveis recém-inseridas no
 * editor, mantendo o backend como fonte única da substituição.
 *
 * Idempotente para corpos já preenchidos: sem `{{...}}` restantes, devolve o
 * texto intacto (e valores já escapados não são reescapados, pois não há token).
 *
 * Quando o corpo é HTML (formato canônico), os valores da paciente entram em nós
 * de texto e precisam ser escapados — um nome com "&" ou "<" quebraria a
 * marcação. Conteúdo legado em texto puro usa o contexto cru (nada a escapar).
 */
export function preencherCorpo(
  corpo: string,
  p: Paciente,
  decisoes?: DecisaoRegiao[],
): string {
  const ctx = montarContextoContrato(p, decisoes);
  const ctxCorpo = ehHtml(corpo) ? escaparContexto(ctx) : ctx;
  return resolverVariaveis(corpo, ctxCorpo);
}

/** Aplica `escapeHtml` em todos os valores de um contexto de variáveis. */
function escaparContexto(ctx: Contexto): Contexto {
  const saida: Contexto = {};
  for (const [chave, valor] of Object.entries(ctx)) {
    saida[chave] =
      typeof valor === "string" && !CHAVES_HTML_CONTRATO.has(chave)
        ? escapeHtml(valor)
        : valor;
  }
  return saida;
}

/** Retorna as variáveis `{{...}}` que ficaram sem valor no texto resolvido. */
export function variaveisNaoResolvidas(texto: string): string[] {
  const achadas = new Set<string>();
  const re = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) achadas.add(m[1]);
  return [...achadas];
}

/** Um campo (rótulo + valor já formatado) da ficha de inputs do documento. */
export type DocumentoContextoCampo = { rotulo: string; valor: string };

/** Grupo de campos da ficha de inputs (Paciente, Procedimento, Valores). */
export type DocumentoContextoGrupo = {
  chave: "paciente" | "procedimento" | "valores";
  titulo: string;
  campos: DocumentoContextoCampo[];
};

/**
 * Monta a "ficha de inputs" do documento: os dados que vão preencher o modelo,
 * JÁ resolvidos e formatados exatamente como entram no texto (nome do hospital,
 * CPF formatado, valores em R$, datas dd/mm/aaaa). Reusa `montarContextoContrato`
 * — a mesma fonte do documento gerado — então a ficha nunca diverge do PDF.
 *
 * Sempre devolve os três grupos (Paciente / Procedimento / Valores). O grupo de
 * Valores só faz sentido no contrato; o termo (TCLE) não trata de pagamento,
 * então o consumidor o oculta quando `tipo === "termo"` (filtro de apresentação).
 */
export function montarPreviewDocumento(
  p: Paciente,
): DocumentoContextoGrupo[] {
  const ctx = montarContextoContrato(p);
  const norm = (v: string | undefined): string => {
    const t = (v ?? "").trim();
    return t === "" ? "—" : t;
  };
  const campo = (rotulo: string, chave: string): DocumentoContextoCampo => ({
    rotulo,
    valor: norm(ctx[chave]),
  });

  const crm = (ctx.crm ?? "").trim();
  const rqe = (ctx.rqe ?? "").trim();
  const registro =
    [crm && `CRM ${crm}`, rqe && `RQE ${rqe}`].filter(Boolean).join(" · ") ||
    "—";

  const grupos: DocumentoContextoGrupo[] = [
    {
      chave: "paciente",
      titulo: "Paciente",
      campos: [campo("Nome", "nome"), campo("CPF", "cpf")],
    },
    {
      chave: "procedimento",
      titulo: "Procedimento",
      campos: [
        campo("Procedimento(s)", "procedimentos"),
        campo("Data", "data"),
        campo("Horário", "horario"),
        campo("Local", "local"),
        campo("Médica", "medica"),
        { rotulo: "Registro", valor: registro },
        campo("Clínica", "clinica"),
        campo("Equipe de anestesia", "equipe"),
      ],
    },
  ];

  grupos.push({
    chave: "valores",
    titulo: "Valores",
    campos: [
      campo("Valor pago", "valorPago"),
      campo("Saldo em aberto", "valorPendente"),
      campo("Vencimento do saldo", "dataPagamento"),
    ],
  });

  return grupos;
}
