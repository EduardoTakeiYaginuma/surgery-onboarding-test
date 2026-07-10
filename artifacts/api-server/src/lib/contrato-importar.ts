import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { normalizarParaHtml, htmlVazio } from "@workspace/secoes";
import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";

/** Tipos de arquivo aceitos ao importar um modelo próprio da clínica. */
export const TIPO_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const TIPO_PDF = "application/pdf";

/** Limite de tamanho do arquivo importado (20 MB) — alinhado aos PDFs anexados. */
export const TAMANHO_MAXIMO_IMPORT = 20 * 1024 * 1024;

/** Formato de origem resolvido a partir do tipo MIME / extensão do arquivo. */
export type FormatoImport = "docx" | "pdf";

/**
 * Falha de importação tratável (arquivo não suportado, vazio ou ilegível). É
 * convertida em 422 pela rota — nunca derruba o servidor com um 500 opaco.
 */
export class ImportacaoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportacaoError";
    Object.setPrototypeOf(this, ImportacaoError.prototype);
  }
}

/**
 * Resolve o formato a partir do contentType (preferencial) e, como fallback, da
 * extensão do nome do arquivo. Retorna null quando não é Word (.docx) nem PDF.
 */
export function resolverFormato(
  contentType: string | undefined,
  nomeArquivo: string,
): FormatoImport | null {
  const ct = (contentType ?? "").toLowerCase();
  if (ct === TIPO_DOCX) return "docx";
  if (ct === TIPO_PDF) return "pdf";
  const nome = nomeArquivo.toLowerCase();
  if (nome.endsWith(".docx")) return "docx";
  if (nome.endsWith(".pdf")) return "pdf";
  return null;
}

/** Deriva um título inicial a partir do nome do arquivo (sem extensão). */
export function tituloAPartirDoNome(nomeArquivo: string): string {
  return nomeArquivo
    .replace(/\.(docx|pdf)$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

/**
 * Converte um arquivo Word (.docx) em HTML usando mammoth. O HTML resultante
 * (parágrafos, títulos, negrito/itálico, listas) é compatível com o editor
 * WYSIWYG e o restante do pipeline (geração → revisão → PDF). As eventuais
 * `{{variáveis}}` digitadas no Word são preservadas como texto literal.
 */
async function converterDocx(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.convertToHtml({ buffer });
  return value;
}

/**
 * Extrai o texto de um PDF e o converte em HTML canônico (cada bloco vira um
 * parágrafo). A extração de PDF é só de texto — formatação rica do PDF não é
 * preservada; a equipe revisa/ajusta no editor antes de marcar como vigente.
 */
async function converterPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const { text } = await parser.getText();
    // pdf-parse insere separadores de página no formato "-- 1 of 3 --";
    // são ruído de extração, não conteúdo do contrato — removemos antes do HTML.
    const limpo = (text ?? "").replace(/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/gim, "");
    return normalizarParaHtml(limpo);
  } finally {
    await parser.destroy();
  }
}

/**
 * Converte o buffer de um arquivo (.docx/.pdf) em HTML pronto para virar o corpo
 * de um modelo-base. Lança `ImportacaoError` quando o resultado não tem texto
 * legível (arquivo vazio, só imagens/escaneado, ou ilegível).
 */
export async function converterParaHtml(
  buffer: Buffer,
  formato: FormatoImport,
): Promise<string> {
  let html: string;
  try {
    html = formato === "docx"
      ? await converterDocx(buffer)
      : await converterPdf(buffer);
  } catch (err) {
    logger.warn({ err: (err as Error)?.message, formato }, "Falha ao converter modelo importado");
    throw new ImportacaoError(
      "Não foi possível ler o arquivo. Confira se é um Word (.docx) ou PDF válido e não protegido.",
    );
  }
  if (htmlVazio(html)) {
    throw new ImportacaoError(
      formato === "pdf"
        ? "Não encontramos texto neste PDF. PDFs escaneados (imagem) não têm texto para importar."
        : "Não encontramos texto neste documento.",
    );
  }
  return html;
}

/**
 * Baixa o arquivo já enviado ao armazenamento (via URL pré-assinada) e o
 * converte em HTML. O caminho do objeto e as credenciais ficam SOMENTE no
 * servidor. Retorna o corpo (HTML) e um título sugerido a partir do nome.
 */
export async function importarModeloDoArmazenamento(params: {
  objectPath: string;
  nomeArquivo: string;
  contentType?: string;
}): Promise<{ titulo: string; corpo: string }> {
  const formato = resolverFormato(params.contentType, params.nomeArquivo);
  if (!formato) {
    throw new ImportacaoError(
      "Formato não suportado. Envie um arquivo Word (.docx) ou PDF.",
    );
  }

  const storage = new ObjectStorageService();
  const resposta = await storage.fetchObject(params.objectPath);
  const buffer = Buffer.from(await resposta.arrayBuffer());

  const corpo = await converterParaHtml(buffer, formato);
  const titulo = tituloAPartirDoNome(params.nomeArquivo);

  // O arquivo-fonte foi só um veículo para os bytes — o modelo-base passa a
  // viver como HTML versionado no banco. Remove o objeto temporário para não
  // acumular originais órfãos no armazenamento (falha de limpeza não é fatal).
  try {
    await storage.deleteObjectEntity(params.objectPath);
  } catch (err) {
    logger.warn(
      { err: (err as Error)?.message, objectPath: params.objectPath },
      "Falha ao remover arquivo temporário de importação",
    );
  }

  return { titulo, corpo };
}
