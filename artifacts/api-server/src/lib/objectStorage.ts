import { randomUUID } from "crypto";

/**
 * Armazenamento de objetos genéricos (PDFs de documentos da paciente, contratos
 * gerados) em **Supabase Storage** — bucket PRIVADO.
 *
 * Fluxo de upload em duas etapas (upload direto do navegador):
 *  1. o cliente pede uma URL assinada de upload (`getObjectEntityUploadURL`);
 *  2. o cliente faz `PUT` do arquivo direto nessa URL;
 *  3. o `objectPath` normalizado (`/objects/<chave>`) é registrado no banco.
 *
 * Download e remoção passam SEMPRE pelo servidor (com a service key), nunca
 * expondo o caminho real nem a chave ao frontend.
 *
 * Config por ambiente (só no backend):
 * - `SUPABASE_URL`
 * - `SUPABASE_SERVICE_ROLE_KEY`
 * - `SUPABASE_OBJECT_BUCKET` (obrigatório; nome do bucket privado)
 */

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

interface StorageConfig {
  baseUrl: string;
  key: string;
  bucket: string;
}

function config(bucketOverride?: string): StorageConfig {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = (bucketOverride ?? process.env.SUPABASE_OBJECT_BUCKET)?.trim();
  if (!url || !key || !bucket) {
    throw new Error(
      "Supabase Storage não configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / bucket ausentes).",
    );
  }
  return {
    baseUrl: url.endsWith("/") ? url.slice(0, -1) : url,
    key,
    bucket,
  };
}

function authHeaders(key: string): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

/** `/objects/<chave>` → `<chave>` (a chave crua dentro do bucket). */
function chaveDeObjectPath(objectPath: string): string {
  if (!objectPath.startsWith("/objects/")) {
    throw new ObjectNotFoundError();
  }
  const chave = objectPath.slice("/objects/".length);
  if (!chave) throw new ObjectNotFoundError();
  return chave;
}

export class ObjectStorageService {
  /**
   * `bucketOverride` seleciona um bucket diferente do padrão
   * (`SUPABASE_OBJECT_BUCKET`) — ex.: `documentos-assinados` para os PDFs
   * finais assinados. Sem override, mantém o comportamento original.
   */
  constructor(private readonly bucketOverride?: string) {}

  private cfg(): StorageConfig {
    return config(this.bucketOverride);
  }

  /**
   * Sobe um objeto direto do servidor (o corpo já está em memória — ex.: PDF
   * assinado baixado da Autentique). `upsert` sobrescreve se a chave já existir.
   * Devolve o `objectPath` normalizado (`/objects/<chave>`). Diferente do fluxo
   * de URL assinada, aqui NÃO passa pelo navegador.
   */
  async uploadObject(
    chave: string,
    corpo: Buffer,
    contentType = "application/pdf",
  ): Promise<string> {
    const cfg = this.cfg();
    const resp = await fetch(
      `${cfg.baseUrl}/storage/v1/object/${cfg.bucket}/${chave}`,
      {
        method: "POST",
        headers: {
          ...authHeaders(cfg.key),
          "Content-Type": contentType,
          "x-upsert": "true",
        },
        body: corpo,
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!resp.ok) {
      const detalhe = await resp.text().catch(() => "");
      throw new Error(
        `Falha ao subir objeto para o Supabase (${resp.status}): ${detalhe}`,
      );
    }
    return `/objects/${chave}`;
  }

  /**
   * Gera uma URL assinada de upload (validade curta). O cliente faz `PUT` do
   * arquivo direto nela. A chave é aleatória sob `uploads/`.
   */
  async getObjectEntityUploadURL(): Promise<string> {
    const cfg = this.cfg();
    const chave = `uploads/${randomUUID()}`;
    const resp = await fetch(
      `${cfg.baseUrl}/storage/v1/object/upload/sign/${cfg.bucket}/${chave}`,
      {
        method: "POST",
        headers: { ...authHeaders(cfg.key), "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!resp.ok) {
      const detalhe = await resp.text().catch(() => "");
      throw new Error(
        `Falha ao gerar URL de upload no Supabase (${resp.status}): ${detalhe}`,
      );
    }
    const { url } = (await resp.json()) as { url: string };
    // A API devolve caminho relativo com o token; prefixamos a base.
    return `${cfg.baseUrl}/storage/v1${url}`;
  }

  /**
   * Extrai o `objectPath` interno (`/objects/<chave>`) a partir da URL assinada
   * de upload. Idempotente para caminhos já normalizados.
   */
  normalizeObjectEntityPath(rawPath: string): string {
    let cfg: StorageConfig;
    try {
      cfg = this.cfg();
    } catch {
      return rawPath;
    }
    try {
      const u = new URL(rawPath);
      const marcador = `/storage/v1/object/upload/sign/${cfg.bucket}/`;
      const idx = u.pathname.indexOf(marcador);
      if (idx === -1) return rawPath;
      const chave = u.pathname.slice(idx + marcador.length);
      return `/objects/${chave}`;
    } catch {
      return rawPath;
    }
  }

  /**
   * Busca o objeto no Supabase e devolve a `Response` (web) com o corpo em
   * stream, para o chamador repassar ao cliente. Lança `ObjectNotFoundError`
   * quando o objeto não existe.
   */
  async fetchObject(objectPath: string): Promise<Response> {
    const cfg = this.cfg();
    const chave = chaveDeObjectPath(objectPath);
    const resp = await fetch(
      `${cfg.baseUrl}/storage/v1/object/authenticated/${cfg.bucket}/${chave}`,
      { headers: authHeaders(cfg.key), signal: AbortSignal.timeout(30_000) },
    );
    if (resp.status === 404) throw new ObjectNotFoundError();
    if (!resp.ok) {
      throw new Error(`Falha ao baixar objeto do Supabase (${resp.status}).`);
    }
    return resp;
  }

  /** Alias semântico usado pelas rotas genéricas de serviço de objeto. */
  async downloadObject(objectPath: string): Promise<Response> {
    return this.fetchObject(objectPath);
  }

  /** Remove o objeto (idempotente para o chamador: 404 vira ObjectNotFound). */
  async deleteObjectEntity(objectPath: string): Promise<void> {
    const cfg = this.cfg();
    const chave = chaveDeObjectPath(objectPath);
    const resp = await fetch(
      `${cfg.baseUrl}/storage/v1/object/${cfg.bucket}/${chave}`,
      { method: "DELETE", headers: authHeaders(cfg.key), signal: AbortSignal.timeout(30_000) },
    );
    if (resp.status === 404) throw new ObjectNotFoundError();
    if (!resp.ok) {
      const detalhe = await resp.text().catch(() => "");
      throw new Error(
        `Falha ao remover objeto do Supabase (${resp.status}): ${detalhe}`,
      );
    }
  }

  /**
   * Não há bucket público nesta configuração — objetos são sempre servidos pelo
   * servidor. Mantido por compatibilidade com a rota de objetos públicos.
   */
  async searchPublicObject(_filePath: string): Promise<null> {
    return null;
  }
}
