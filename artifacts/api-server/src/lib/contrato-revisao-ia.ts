import type {
  DocumentoTipo,
  Paciente,
  RelatorioRevisao,
  RevisaoFrente,
  RevisaoItem,
} from "@workspace/db";
import { logger } from "./logger";
import { formatarCpf } from "@workspace/br-validacao";
import { formatarData, htmlParaTexto, normalizarParaHtml } from "@workspace/secoes";

// Modelo da revisão de IA. Configurável por env para apontar para um modelo que
// exista no endpoint provisionado (`AI_INTEGRATIONS_OPENAI_BASE_URL`); cai em
// `gpt-5.4` (o gateway padrão) quando não definido.
const MODELO_IA = process.env.CONTRATO_REVISAO_MODELO ?? "gpt-5.4";

/** Erro de revisão de IA — sinaliza que o relatório não pôde ser produzido. */
export class RevisaoIaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RevisaoIaError";
  }
}

const CHAVES_FRENTE = ["clausulas", "consistencia", "conformidade"] as const;

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Valida e normaliza um item da revisão; descarta entradas malformadas. */
function validarItem(v: unknown): RevisaoItem | null {
  if (!ehObjeto(v)) return null;
  const status = v.status === "atencao" ? "atencao" : "ok";
  if (typeof v.rotulo !== "string" || typeof v.observacao !== "string") {
    return null;
  }
  return {
    rotulo: v.rotulo,
    status,
    observacao: v.observacao,
    ...(typeof v.sugestao === "string" ? { sugestao: v.sugestao } : {}),
  };
}

/** Valida e normaliza uma frente; retorna null quando inválida. */
function validarFrente(v: unknown): RevisaoFrente | null {
  if (!ehObjeto(v)) return null;
  const chave = CHAVES_FRENTE.find((c) => c === v.chave);
  if (
    !chave ||
    typeof v.titulo !== "string" ||
    typeof v.resumo !== "string" ||
    !Array.isArray(v.itens)
  ) {
    return null;
  }
  const itens = v.itens
    .map(validarItem)
    .filter((i): i is RevisaoItem => i !== null);
  return { chave, titulo: v.titulo, resumo: v.resumo, itens };
}

const FORMATO_RESPOSTA = `Use status "ok" quando estiver conforme e "atencao" quando precisar de revisão humana. Inclua "sugestao" com um ajuste concreto sempre que marcar "atencao". Responda SOMENTE com JSON válido no formato:
{"resumoGeral": string, "frentes": [{"chave": "clausulas"|"consistencia"|"conformidade", "titulo": string, "resumo": string, "itens": [{"rotulo": string, "status": "ok"|"atencao", "observacao": string, "sugestao"?: string}]}]}`;

/**
 * ESCOPO ATUAL (temporário): a revisão de IA valida SOMENTE formatação,
 * preenchimento e regras de escrita — NÃO avalia mérito jurídico, cláusulas
 * obrigatórias nem conformidade legal. As três frentes do relatório
 * (clausulas/consistencia/conformidade) foram reaproveitadas com estes novos
 * significados: Formatação / Preenchimento / Regras de escrita. Quando o time
 * quiser reativar a revisão jurídica, ampliar este prompt.
 */
function promptSistema(tipo: DocumentoTipo): string {
  const doc =
    tipo === "termo"
      ? "TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO (TCLE)"
      : "CONTRATO de prestação de serviços médicos";
  return `Você é um revisor de TEXTO de documentos jurídicos de uma clínica médica no Brasil. NESTA ETAPA você revisa APENAS a qualidade do texto — formatação, preenchimento e regras de escrita. NÃO avalie mérito jurídico, presença de cláusulas obrigatórias nem conformidade legal (isso fica para outra etapa). Você NÃO aprova o documento — apenas produz um relatório para um humano decidir. Seja objetivo e prático.

Revise o ${doc} em TRÊS frentes, retornando um item por verificação relevante (se uma frente estiver 100% ok, retorne um único item "ok"):
1. "consistencia" (use titulo "Preenchimento") — Garanta que NADA ficou por preencher. Procure: variáveis não substituídas ("{{...}}"), lacunas ("____", "[ ]", "[a inserir]", "XXXX"), um travessão "—" ou um "N"/"X" solto onde deveria haver um valor, campos vazios, e datas/valores/nomes/locais ausentes. Considere também caixas de seleção "( )" que aparentam que deveriam estar marcadas. Cada pendência vira um item "atencao".
2. "conformidade" (use titulo "Regras de escrita") — Verifique ortografia, gramática, pontuação, acentuação, concordância (INCLUSIVE de gênero — ex.: "a CONTRATANTE" vs "o CONTRATANTE", "operada" vs "operado", "portadora" vs "portador"), uso de maiúsculas/minúsculas, e repetições/redundâncias. Aponte cada problema com a correção sugerida.
3. "clausulas" (use titulo "Formatação") — Verifique a estrutura do texto: numeração de cláusulas e subitens em sequência correta, sem saltos nem duplicatas; títulos e seções consistentes; listas bem formadas; espaçamento e quebras de parágrafo; e ausência de artefatos de marcação. Aponte cada problema com o ajuste sugerido.

COMO ESCREVER A "sugestao" (obrigatório em todo item "atencao"): a sugestão precisa dizer AO OPERADOR ONDE resolver o problema, porque há dois lugares distintos de correção. Decida entre eles assim:

A) CORRIGIR NO CADASTRO DA PACIENTE — quando a lacuna corresponde a um DADO da paciente que alimenta o documento automaticamente. Esses dados são: nome, CPF, procedimentos, data e horário da cirurgia, valores (valor já pago e saldo em aberto), vencimento do saldo, e médica/CRM/RQE. Se um desses aparece como lacuna no texto (travessão, "____", campo vazio) E está marcado como "(vazio)" no bloco DADOS DA PACIENTE, o valor NÃO deve ser digitado no texto — ele será preenchido sozinho quando o cadastro for corrigido. A sugestão DEVE instruir a editar o cadastro da paciente. Ex.: "O CPF da paciente não está cadastrado. Edite os dados da paciente e preencha o CPF — ele será inserido automaticamente nos dois pontos do documento. Não digite o número direto no texto." Quando a mesma lacuna aparece em vários pontos, trate como UM item só e diga que corrigir o cadastro resolve todos.

B) CORRIGIR NA EDIÇÃO DO TEXTO — quando a lacuna ou problema é conteúdo do PRÓPRIO documento, sem vínculo com um campo do cadastro acima: marcadores como "[a inserir]", referências/links/datas/políticas do texto (ex.: nome e link da Política de Privacidade da clínica), cláusulas incompletas, além de TODOS os itens de "Regras de escrita" e "Formatação". A sugestão DEVE instruir a corrigir na etapa de edição do texto e dizer, de forma concreta, o que escrever ou ajustar. Ex.: "Substitua 'Política de Privacidade da clínica [a inserir]' pela identificação completa da política, com link e data, na edição do texto."

Na dúvida entre A e B, verifique o bloco DADOS DA PACIENTE: se o valor faltante é um daqueles campos e está "(vazio)", use A; caso contrário, use B.

${FORMATO_RESPOSTA}`;
}

function dadosPaciente(p: Paciente): string {
  return [
    `Nome: ${p.nome}`,
    `CPF: ${p.cpf ? formatarCpf(p.cpf) : "(vazio)"}`,
    `Procedimentos: ${p.procedimentos.join(", ") || "(vazio)"}`,
    `Data da cirurgia: ${formatarData(p.dataCirurgia)}`,
    `Horário: ${p.horario}`,
    `Valor já pago: R$ ${p.valorSinal}`,
    `Saldo em aberto: R$ ${p.valorPendente}`,
    `Vencimento do saldo: ${
      p.dataPagamentoPendente ? formatarData(p.dataPagamentoPendente) : "(sem saldo)"
    }`,
    `Médica: ${p.medica} (CRM ${p.crm} · RQE ${p.rqe})`,
  ].join("\n");
}

/**
 * Roda a revisão jurídica assistida por IA sobre o texto do contrato já
 * preenchido. Retorna um relatório estruturado de APOIO À DECISÃO — nunca uma
 * aprovação. Lança `RevisaoIaError` em qualquer falha (API/parse), para que a
 * rota degrade de forma clara sem corromper o estado da geração.
 */
export async function revisarContrato(args: {
  titulo: string;
  corpo: string;
  paciente: Paciente;
  tipo?: DocumentoTipo;
}): Promise<RelatorioRevisao> {
  const { titulo, paciente, tipo = "contrato" } = args;
  // O corpo canônico é HTML; a IA precisa de texto legível (sem marcação). Texto
  // puro legado passa intacto. As `{{...}}` não resolvidas continuam visíveis.
  const corpo = htmlParaTexto(normalizarParaHtml(args.corpo));
  const rotuloDoc = tipo === "termo" ? "TERMO (TCLE)" : "CONTRATO";

  let conteudo: string;
  try {
    // Carrega o cliente de IA SOB DEMANDA: o pacote da integração lança já no
    // import quando as variáveis não estão provisionadas. Importar aqui (e não
    // no topo do módulo) faz a falta de configuração degradar como erro de
    // revisão (502) em vez de derrubar o boot da API inteira.
    const { openai } = await import(
      "@workspace/integrations-openai-ai-server"
    );
    const resposta = await openai.chat.completions.create({
      model: MODELO_IA,
      max_completion_tokens: 8192,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: promptSistema(tipo) },
        {
          role: "user",
          content: `DADOS DA PACIENTE (fonte da verdade para a frente de consistência):\n${dadosPaciente(
            paciente,
          )}\n\nTÍTULO DO ${rotuloDoc}:\n${titulo}\n\nTEXTO DO ${rotuloDoc}:\n${corpo}`,
        },
      ],
    });
    conteudo = resposta.choices[0]?.message?.content ?? "";
  } catch (err) {
    // Não logamos o conteúdo do contrato (PII). Apenas o erro técnico.
    logger.warn({ err: (err as Error)?.message }, "Falha na chamada de IA da revisão de contrato");
    throw new RevisaoIaError(
      "Não foi possível concluir a revisão por IA agora. Tente novamente.",
    );
  }

  if (!conteudo.trim()) {
    throw new RevisaoIaError("A revisão por IA voltou vazia. Tente novamente.");
  }

  let bruto: unknown;
  try {
    bruto = JSON.parse(conteudo);
  } catch {
    throw new RevisaoIaError(
      "A revisão por IA voltou em formato inesperado. Tente novamente.",
    );
  }

  if (
    !ehObjeto(bruto) ||
    typeof bruto.resumoGeral !== "string" ||
    !Array.isArray(bruto.frentes)
  ) {
    throw new RevisaoIaError(
      "A revisão por IA voltou incompleta. Tente novamente.",
    );
  }

  const frentes = bruto.frentes
    .map(validarFrente)
    .filter((f): f is RevisaoFrente => f !== null);
  if (frentes.length === 0) {
    throw new RevisaoIaError(
      "A revisão por IA voltou incompleta. Tente novamente.",
    );
  }

  const alertas = frentes.reduce(
    (acc, f) => acc + f.itens.filter((i) => i.status === "atencao").length,
    0,
  );

  return {
    geradoEm: new Date().toISOString(),
    modelo: MODELO_IA,
    alertas,
    resumoGeral: bruto.resumoGeral,
    frentes,
  };
}
