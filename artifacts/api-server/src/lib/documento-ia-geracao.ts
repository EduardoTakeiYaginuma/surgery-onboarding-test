import type { DocumentoTipo, FormularioDocumentoIa } from "@workspace/db";
import { normalizarParaHtml } from "@workspace/secoes";
import { logger } from "./logger";
import {
  renderPromptContrato,
  renderPromptTermo,
  renderPromptRefino,
} from "./documento-ia-modelo";
import { documentoPromptConfigRepo } from "./documento-prompt-config-repo";

// Modelo da geração por IA. Reaproveita a mesma família do revisor; env própria
// permite apontar para outro modelo sem afetar a revisão de texto.
const MODELO_IA =
  process.env.DOCUMENTO_IA_MODELO ??
  process.env.CONTRATO_REVISAO_MODELO ??
  "gpt-5.4";

/** Erro de geração por IA — sinaliza que o documento não pôde ser produzido. */
export class DocumentoIaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentoIaError";
  }
}

/** Título padrão do documento gerado. */
function tituloDocumento(tipo: DocumentoTipo, nome: string): string {
  const base =
    tipo === "termo"
      ? "Termo de Consentimento (TCLE)"
      : "Contrato de Prestação de Serviços";
  const limpo = nome.trim();
  return limpo ? `${base} — ${limpo}` : base;
}

/**
 * Limpa a resposta do modelo: remove cercas de código markdown e texto fora do
 * HTML, e garante que o corpo seja HTML (via `normalizarParaHtml` como rede de
 * segurança quando o modelo devolve texto puro).
 */
function limparHtml(bruto: string): string {
  let s = bruto.trim();
  // Remove cercas ```html ... ``` ou ``` ... ```.
  const cerca = s.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  if (cerca) s = cerca[1].trim();
  // Se não parece HTML, converte texto puro em parágrafos HTML.
  if (!s.includes("<")) return normalizarParaHtml(s);
  return s;
}

/**
 * Faz a chamada ao ChatGPT (carregado sob demanda para não derrubar o boot quando
 * a integração não está provisionada) e devolve o conteúdo textual da resposta.
 */
async function chamarIa(system: string, user: string): Promise<string> {
  try {
    const { openai } = await import("@workspace/integrations-openai-ai-server");
    const resposta = await openai.chat.completions.create({
      model: MODELO_IA,
      max_completion_tokens: 16384,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return resposta.choices[0]?.message?.content ?? "";
  } catch (err) {
    // Não logamos o conteúdo do documento (PII). Apenas o erro técnico.
    logger.warn(
      { err: (err as Error)?.message },
      "Falha na chamada de IA da geração de documento",
    );
    throw new DocumentoIaError(
      "Não foi possível gerar o documento por IA agora. Tente novamente.",
    );
  }
}

/**
 * Gera um documento (contrato ou termo) redigido por IA a partir do formulário,
 * seguindo fielmente o padrão dos documentos-exemplo da clínica. Devolve o título
 * e o corpo HTML pronto para renderização/PDF. Lança `DocumentoIaError` em falha.
 */
export async function gerarDocumentoIA(args: {
  tipo: DocumentoTipo;
  formulario: FormularioDocumentoIa;
}): Promise<{ titulo: string; corpo: string }> {
  const { tipo, formulario } = args;
  // Usa o template configurado pela equipe na tela de admin (ou o padrão de
  // código quando ninguém customizou). Os tokens são resolvidos aqui.
  const template = await documentoPromptConfigRepo.obterTexto(tipo);
  const system =
    tipo === "termo"
      ? renderPromptTermo(template, formulario)
      : renderPromptContrato(template, formulario);
  const bruto = await chamarIa(
    system,
    "Redija o documento completo agora, seguindo TODAS as regras acima.",
  );
  const corpo = limparHtml(bruto);
  if (!corpo.trim() || !corpo.includes("<")) {
    throw new DocumentoIaError(
      "A geração por IA voltou vazia ou em formato inesperado. Tente novamente.",
    );
  }
  return { titulo: tituloDocumento(tipo, formulario.nome), corpo };
}

/**
 * Aplica um refino por IA: recebe o corpo atual e uma instrução de mudança, e
 * devolve o corpo revisado (documento inteiro). Lança `DocumentoIaError` em falha.
 */
export async function refinarDocumentoIA(args: {
  tipo: DocumentoTipo;
  corpoAtual: string;
  instrucao: string;
}): Promise<{ corpo: string }> {
  const { tipo, corpoAtual, instrucao } = args;
  const template = await documentoPromptConfigRepo.obterTexto("refino");
  const system = renderPromptRefino(
    template,
    tipo === "termo" ? "termo" : "contrato",
  );
  const bruto = await chamarIa(
    system,
    `INSTRUÇÃO DE ALTERAÇÃO:\n${instrucao}\n\nHTML ATUAL DO DOCUMENTO:\n${corpoAtual}`,
  );
  const corpo = limparHtml(bruto);
  if (!corpo.trim() || !corpo.includes("<")) {
    throw new DocumentoIaError(
      "O refino por IA voltou vazio ou em formato inesperado. Tente novamente.",
    );
  }
  return { corpo };
}
