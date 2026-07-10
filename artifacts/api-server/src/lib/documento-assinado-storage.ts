import { randomUUID } from "crypto";
import { ObjectStorageService } from "./objectStorage";
import { obterArquivoAssinado } from "./autentique";
import { logger } from "./logger";

/**
 * Arquivamento DURÁVEL do PDF final assinado.
 *
 * A Autentique continua sendo a fonte da verdade da assinatura; este módulo só
 * guarda uma CÓPIA do PDF no bucket privado `documentos-assinados`
 * (SUPABASE_STORAGE_BUCKET_ASSINADOS) para o caso da URL temporária da
 * Autentique expirar ou o documento sair de lá. Contratos ficam sob `contratos/`
 * e termos sob `termos/`.
 *
 * Desenho deliberado:
 * - NUNCA lança. Em qualquer falha (bucket não configurado, Autentique fora,
 *   download/upload com erro) devolve `null` e loga. O arquivamento é um efeito
 *   colateral do refresh de status — não pode derrubar o fluxo principal.
 * - Idempotente para o chamador: só chame quando o objectPath ainda for null.
 *   Como a chave inclui um UUID, uma eventual chamada dupla não sobrescreve nem
 *   corrompe — no pior caso gera uma cópia órfã (aceitável, o banco só guarda a
 *   última).
 */

const TIMEOUT_MS = 30_000;

export type TipoDocumentoAssinado = "contrato" | "termo";

function bucketAssinados(): string | null {
  return process.env.SUPABASE_STORAGE_BUCKET_ASSINADOS?.trim() || null;
}

/** true quando o arquivamento está configurado (bucket definido no ambiente). */
export function arquivamentoAssinadosAtivo(): boolean {
  return Boolean(bucketAssinados());
}

/**
 * Baixa o PDF assinado da Autentique e o grava no bucket. Retorna o
 * `objectPath` (`/objects/<chave>`) em sucesso, ou `null` em qualquer falha
 * (sem lançar). `documentoId` é o ID do documento na Autentique
 * (contratoAutentiqueId / termoAutentiqueId).
 */
export async function arquivarDocumentoAssinado(opts: {
  tipo: TipoDocumentoAssinado;
  documentoId: string;
  pacienteId: number;
}): Promise<string | null> {
  const bucket = bucketAssinados();
  if (!bucket) return null; // arquivamento desativado — sem bucket configurado

  try {
    const { status, url } = await obterArquivoAssinado(opts.documentoId);
    if (status !== "assinado" || !url) return null;

    const resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!resp.ok || !resp.body) {
      logger.warn(
        { status: resp.status, tipo: opts.tipo, pacienteId: opts.pacienteId },
        "Falha ao baixar PDF assinado da Autentique para arquivamento",
      );
      return null;
    }

    const buffer = Buffer.from(await resp.arrayBuffer());
    const chave = `${opts.tipo}s/${opts.pacienteId}-${randomUUID()}.pdf`;
    const storage = new ObjectStorageService(bucket);
    const objectPath = await storage.uploadObject(
      chave,
      buffer,
      "application/pdf",
    );
    logger.info(
      { tipo: opts.tipo, pacienteId: opts.pacienteId, objectPath },
      "PDF assinado arquivado no bucket de documentos assinados",
    );
    return objectPath;
  } catch (err) {
    logger.warn(
      { err, tipo: opts.tipo, pacienteId: opts.pacienteId },
      "Falha ao arquivar PDF assinado",
    );
    return null;
  }
}

/**
 * Lê a CÓPIA arquivada do bucket e devolve o PDF em memória. Retorna `null` em
 * qualquer falha (bucket não configurado, objeto ausente, erro de rede) — sem
 * lançar — para o chamador cair no fallback (stream ao vivo da Autentique).
 */
export async function baixarDocumentoAssinadoArquivado(
  objectPath: string,
): Promise<Buffer | null> {
  const bucket = bucketAssinados();
  if (!bucket) return null;

  try {
    const storage = new ObjectStorageService(bucket);
    const resp = await storage.fetchObject(objectPath);
    return Buffer.from(await resp.arrayBuffer());
  } catch (err) {
    logger.warn({ err, objectPath }, "Falha ao ler PDF assinado arquivado");
    return null;
  }
}
