import type { Response } from "express";
import { Readable } from "stream";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "./objectStorage";
import type { DocumentoPaciente } from "@workspace/db";
import { logger } from "./logger";

/** Único tipo aceito: PDF. */
export const TIPO_PDF = "application/pdf";

/** Limite de tamanho por arquivo (20 MB). */
export const TAMANHO_MAXIMO = 20 * 1024 * 1024;

const objectStorageService = new ObjectStorageService();

/**
 * Faz o stream do PDF anexado de volta ao cliente, buscando o objeto pelo
 * `objectPath` interno guardado no banco. O caminho do objeto e as credenciais
 * ficam SOMENTE no servidor — o frontend recebe apenas o PDF (ou um erro
 * tratável). `?download=1` força o download como anexo; senão abre embutido.
 */
export async function servirDocumento(
  documento: DocumentoPaciente,
  res: Response,
  opts: { download?: boolean } = {},
): Promise<void> {
  try {
    const resposta = await objectStorageService.fetchObject(
      documento.objectPath,
    );

    const disposicao = opts.download ? "attachment" : "inline";
    const nomeOriginal = documento.nomeArquivo?.trim() || "documento.pdf";
    const nomeAscii = sanitizarNomeArquivo(nomeOriginal);
    const tamanho = resposta.headers.get("content-length");

    res.setHeader("Content-Type", documento.contentType || TIPO_PDF);
    if (tamanho) {
      res.setHeader("Content-Length", tamanho);
    }
    // filename= (ASCII, compatível com tudo) + filename*= (UTF-8, preserva
    // acentos nos navegadores modernos). Sem isso, um nome acentuado quebra o
    // header (ERR_INVALID_CHAR) e o download falha com 502.
    res.setHeader(
      "Content-Disposition",
      `${disposicao}; filename="${nomeAscii}"; filename*=UTF-8''${encodeRFC5987(nomeOriginal)}`,
    );
    // Documento sensível: nunca cachear em proxies compartilhados.
    res.setHeader("Cache-Control", "private, no-store");

    if (!resposta.body) {
      res.status(502).json({
        message: "Documento indisponível no momento. Tente novamente.",
      });
      return;
    }

    const nodeStream = Readable.fromWeb(
      resposta.body as ReadableStream<Uint8Array>,
    );
    nodeStream.on("error", (err) => {
      logger.warn({ err }, "Falha ao ler PDF do armazenamento");
      if (!res.headersSent) {
        res
          .status(502)
          .json({ message: "Documento indisponível no momento. Tente novamente." });
      } else {
        res.destroy();
      }
    });
    nodeStream.pipe(res);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ message: "Documento não encontrado." });
      return;
    }
    logger.warn({ err }, "Falha ao servir documento da paciente");
    res
      .status(502)
      .json({ message: "Documento indisponível no momento. Tente novamente." });
  }
}

/** Apaga o objeto do armazenamento, tolerando ausência (idempotente). */
export async function apagarObjetoDocumento(objectPath: string): Promise<void> {
  try {
    await objectStorageService.deleteObjectEntity(objectPath);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return;
    logger.warn({ err }, "Falha ao apagar objeto do documento");
  }
}

/**
 * Fallback ASCII para o parâmetro `filename=` do Content-Disposition. Remove
 * acentos (via NFKD) e qualquer caractere não-ASCII ou de controle, que são
 * inválidos num header HTTP. O nome real (com acentos) vai no `filename*=`.
 */
export function sanitizarNomeArquivo(nome: string): string {
  // NFKD separa o acento da letra (í -> i + ´); em seguida removemos tudo que
  // não é ASCII imprimível — sobra "i". Aspas/barra quebrariam o header.
  const limpo = nome
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/["\\]/g, "")
    .trim()
    .slice(0, 120);
  if (!limpo) return "documento.pdf";
  return limpo.toLowerCase().endsWith(".pdf") ? limpo : `${limpo}.pdf`;
}

/**
 * Codifica o nome em UTF-8 percent-encoding para o parâmetro `filename*=`
 * (RFC 5987), preservando acentos nos navegadores modernos.
 */
export function encodeRFC5987(nome: string): string {
  return encodeURIComponent(nome.slice(0, 120)).replace(
    /['()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}
