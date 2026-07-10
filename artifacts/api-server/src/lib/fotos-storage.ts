import { logger } from "./logger";

/**
 * Camada mínima de armazenamento das fotos (check-in pós-op, foto e logo de
 * médico) em Object Storage PRIVADO do **Supabase Storage**.
 *
 * As fotos nunca ficam públicas: gravamos apenas o caminho do objeto (relativo
 * ao bucket) na coluna correspondente e, na hora de exibir, geramos uma URL
 * assinada de leitura com validade curta (`urlAssinadaFoto`). O Console e a
 * página pública mostram a miniatura por essa URL temporária.
 *
 * Configuração por ambiente (todas no backend, nunca no frontend):
 * - `SUPABASE_URL`               — ex.: https://<ref>.supabase.co
 * - `SUPABASE_SERVICE_ROLE_KEY`  — chave secreta (bypassa RLS); só no servidor
 * - `SUPABASE_STORAGE_BUCKET`    — obrigatório; nome do bucket privado
 *
 * Fail-closed: se o storage não estiver configurado ou o upload/assinatura
 * falhar, lançamos `StorageIndisponivelError` — os endpoints respondem 503 com
 * mensagem clara, sem vazar detalhes internos.
 */

export class StorageIndisponivelError extends Error {
  constructor(causa?: unknown) {
    super("Object Storage indisponível");
    this.name = "StorageIndisponivelError";
    if (causa) (this as { cause?: unknown }).cause = causa;
    Object.setPrototypeOf(this, StorageIndisponivelError.prototype);
  }
}

/** Tipos MIME aceitos no upload de foto. */
export const TIPOS_FOTO_ACEITOS = ["image/jpeg", "image/png"] as const;
export type TipoFotoAceito = (typeof TIPOS_FOTO_ACEITOS)[number];

export function ehTipoFotoAceito(mime: string): mime is TipoFotoAceito {
  return (TIPOS_FOTO_ACEITOS as readonly string[]).includes(mime);
}

interface StorageConfig {
  baseUrl: string;
  key: string;
  bucket: string;
}

/** Lê e valida a config do Supabase Storage; null quando incompleta. */
function config(): StorageConfig | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();
  if (!url || !key || !bucket) return null;
  return { baseUrl: url.endsWith("/") ? url.slice(0, -1) : url, key, bucket };
}

/** true quando SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e o bucket estão configurados. */
export function storageConfigurado(): boolean {
  return config() !== null;
}

function extensaoDe(mime: TipoFotoAceito): string {
  return mime === "image/png" ? "png" : "jpg";
}

/**
 * Sobe um objeto ao bucket privado e devolve a chave (relativa ao bucket) para
 * gravar na coluna. Fail-closed: qualquer falha vira `StorageIndisponivelError`.
 */
async function subirObjeto(
  objectKey: string,
  buffer: Buffer,
  contentType: TipoFotoAceito,
): Promise<string> {
  const cfg = config();
  if (!cfg) throw new StorageIndisponivelError();

  try {
    const resp = await fetch(
      `${cfg.baseUrl}/storage/v1/object/${cfg.bucket}/${objectKey}`,
      {
        method: "POST",
        headers: {
          apikey: cfg.key,
          Authorization: `Bearer ${cfg.key}`,
          "Content-Type": contentType,
          // Idempotente: sobrescreve se o mesmo caminho já existir.
          "x-upsert": "true",
        },
        body: buffer,
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!resp.ok) {
      const detalhe = await resp.text().catch(() => "");
      logger.warn(
        { status: resp.status, detalhe },
        "Falha ao subir foto para o Supabase Storage",
      );
      throw new StorageIndisponivelError();
    }
    return objectKey;
  } catch (err) {
    if (err instanceof StorageIndisponivelError) throw err;
    logger.warn({ err }, "Erro ao subir foto para o Supabase Storage");
    throw new StorageIndisponivelError(err);
  }
}

/**
 * Sobe a foto de um check-in e devolve o caminho do objeto (relativo ao bucket)
 * para gravar em `checkins.foto_url`.
 *
 * Caminho: `fotos/${pacienteId}/${checkinId}-${ts}.{ext}`.
 */
export async function uploadFotoCheckin(params: {
  pacienteId: number;
  checkinId: number;
  buffer: Buffer;
  contentType: TipoFotoAceito;
}): Promise<string> {
  const { pacienteId, checkinId, buffer, contentType } = params;
  const ext = extensaoDe(contentType);
  const relativo = `fotos/${pacienteId}/${checkinId}-${Date.now()}.${ext}`;
  return subirObjeto(relativo, buffer, contentType);
}

/**
 * Sobe a foto de um médico e devolve o caminho do objeto (relativo ao bucket)
 * para gravar em `medicos.foto`.
 *
 * Caminho: `medicos/${medicoId}-${ts}.{ext}`.
 */
export async function uploadFotoMedico(params: {
  medicoId: number;
  buffer: Buffer;
  contentType: TipoFotoAceito;
}): Promise<string> {
  const { medicoId, buffer, contentType } = params;
  const ext = extensaoDe(contentType);
  const relativo = `medicos/${medicoId}-${Date.now()}.${ext}`;
  return subirObjeto(relativo, buffer, contentType);
}

/**
 * Sobe o logo de um médico e devolve o caminho do objeto (relativo ao bucket)
 * para gravar em `medicos.logo`.
 *
 * Caminho: `medicos/logo-${medicoId}-${ts}.{ext}`.
 */
export async function uploadLogoMedico(params: {
  medicoId: number;
  buffer: Buffer;
  contentType: TipoFotoAceito;
}): Promise<string> {
  const { medicoId, buffer, contentType } = params;
  const ext = extensaoDe(contentType);
  const relativo = `medicos/logo-${medicoId}-${Date.now()}.${ext}`;
  return subirObjeto(relativo, buffer, contentType);
}

/**
 * Gera uma URL assinada de leitura (GET) válida por `ttlSec` para a chave
 * relativa gravada na coluna. Retorna null em qualquer falha — exibir a
 * miniatura é best-effort e nunca pode derrubar a listagem.
 */
export async function urlAssinadaFoto(
  relativo: string | null | undefined,
  ttlSec = 3600,
): Promise<string | null> {
  const cfg = config();
  if (!relativo || !cfg) return null;
  try {
    const resp = await fetch(
      `${cfg.baseUrl}/storage/v1/object/sign/${cfg.bucket}/${relativo}`,
      {
        method: "POST",
        headers: {
          apikey: cfg.key,
          Authorization: `Bearer ${cfg.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn: ttlSec }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!resp.ok) {
      logger.warn(
        { status: resp.status },
        "Falha ao assinar URL da foto no Supabase Storage",
      );
      return null;
    }
    const { signedURL } = (await resp.json()) as { signedURL: string };
    // A API devolve um caminho relativo (/object/sign/...); prefixamos a base.
    return `${cfg.baseUrl}/storage/v1${signedURL}`;
  } catch (err) {
    logger.warn({ err }, "Erro ao gerar URL assinada da foto no Supabase");
    return null;
  }
}
