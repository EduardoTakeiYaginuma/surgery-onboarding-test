import type { Response as ExpressResponse } from "express";
import { randomUUID } from "crypto";
import { Readable } from "stream";
import { ObjectNotFoundError } from "./objectStorage";
import { StorageIndisponivelError } from "./fotos-storage";
import {
  TIPO_PDF,
  sanitizarNomeArquivo,
  encodeRFC5987,
} from "./documentos-arquivo";
import { logger } from "./logger";

/**
 * Armazenamento do PDF único da **lista completa de suspensão de medicamentos**
 * da clínica, em Object Storage PRIVADO do **Supabase Storage**, num bucket
 * PRÓPRIO — separado dos documentos gerais, das fotos e dos pedidos de exames:
 *
 * - `SUPABASE_STORAGE_BUCKET_LISTAS` (obrigatório; nome do bucket privado)
 *
 * Ao contrário do pedido de exames (um por paciente), este arquivo é ÚNICO e
 * global — faz parte do conteúdo padrão (seção `suspensao_medicamentos`). Por
 * isso a chave do objeto é só o `token` opaco (`<token>.pdf`), sem prefixo de
 * paciente. O token é gerado no upload e guardado em `secao.arquivo.token`; o
 * download público valida o token da paciente e o token do arquivo, sem nunca
 * expor a chave crua.
 *
 * Reusa as credenciais globais (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`).
 * Fail-closed: sem storage configurado ou falha no upload → `StorageIndisponivelError`.
 */

interface StorageConfig {
  baseUrl: string;
  key: string;
  bucket: string;
}

function config(): StorageConfig | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET_LISTAS?.trim();
  if (!url || !key || !bucket) return null;
  return { baseUrl: url.endsWith("/") ? url.slice(0, -1) : url, key, bucket };
}

/** true quando SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY estão configurados. */
export function storageListasConfigurado(): boolean {
  return config() !== null;
}

function authHeaders(key: string): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function chaveDoToken(token: string): string {
  return `${token}.pdf`;
}

/**
 * Sobe o PDF da lista de medicamentos e devolve o `token` opaco (que também é a
 * chave `<token>.pdf` no bucket) para gravar em `secao.arquivo.token`.
 */
export async function uploadListaMedicamentos(params: {
  buffer: Buffer;
}): Promise<string> {
  const cfg = config();
  if (!cfg) throw new StorageIndisponivelError();

  const token = randomUUID();
  try {
    const resp = await fetch(
      `${cfg.baseUrl}/storage/v1/object/${cfg.bucket}/${chaveDoToken(token)}`,
      {
        method: "POST",
        headers: {
          ...authHeaders(cfg.key),
          "Content-Type": TIPO_PDF,
          "x-upsert": "true",
        },
        body: params.buffer,
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!resp.ok) {
      const detalhe = await resp.text().catch(() => "");
      logger.warn(
        { status: resp.status, detalhe },
        "Falha ao subir lista de medicamentos para o Supabase Storage",
      );
      throw new StorageIndisponivelError();
    }
    return token;
  } catch (err) {
    if (err instanceof StorageIndisponivelError) throw err;
    logger.warn({ err }, "Erro ao subir lista de medicamentos para o Supabase");
    throw new StorageIndisponivelError(err);
  }
}

/** Busca o objeto no bucket de listas; lança ObjectNotFoundError em 404. */
async function fetchListaMedicamentos(token: string): Promise<Response> {
  const cfg = config();
  if (!cfg) throw new ObjectNotFoundError();
  const resp = await fetch(
    `${cfg.baseUrl}/storage/v1/object/authenticated/${cfg.bucket}/${chaveDoToken(token)}`,
    { headers: authHeaders(cfg.key), signal: AbortSignal.timeout(30_000) },
  );
  if (resp.status === 404) throw new ObjectNotFoundError();
  if (!resp.ok) {
    throw new Error(
      `Falha ao baixar lista de medicamentos do Supabase (${resp.status}).`,
    );
  }
  return resp;
}

/** Apaga o objeto do bucket de listas, tolerando ausência (idempotente). */
export async function apagarListaMedicamentosObjeto(
  token: string,
): Promise<void> {
  const cfg = config();
  if (!cfg) return;
  try {
    const resp = await fetch(
      `${cfg.baseUrl}/storage/v1/object/${cfg.bucket}/${chaveDoToken(token)}`,
      {
        method: "DELETE",
        headers: authHeaders(cfg.key),
        signal: AbortSignal.timeout(30_000),
      },
    );
    // 404 = já não existe: tratamos como sucesso (idempotente).
    if (!resp.ok && resp.status !== 404) {
      const detalhe = await resp.text().catch(() => "");
      logger.warn(
        { status: resp.status, detalhe },
        "Falha ao apagar objeto da lista de medicamentos",
      );
    }
  } catch (err) {
    logger.warn({ err }, "Erro ao apagar objeto da lista de medicamentos");
  }
}

/**
 * Faz o stream do PDF da lista de medicamentos de volta ao cliente. Espelha
 * `servirPedidoExames`, mas lê do bucket de listas. `?download=1` força o
 * download como anexo; senão abre embutido.
 */
export async function servirListaMedicamentos(
  arquivo: { token: string; nomeArquivo: string },
  res: ExpressResponse,
  opts: { download?: boolean } = {},
): Promise<void> {
  try {
    const resposta = await fetchListaMedicamentos(arquivo.token);

    const disposicao = opts.download ? "attachment" : "inline";
    const nomeOriginal =
      arquivo.nomeArquivo?.trim() || "lista-de-medicamentos.pdf";
    const nomeAscii = sanitizarNomeArquivo(nomeOriginal);
    const tamanho = resposta.headers.get("content-length");

    res.setHeader("Content-Type", TIPO_PDF);
    if (tamanho) res.setHeader("Content-Length", tamanho);
    res.setHeader(
      "Content-Disposition",
      `${disposicao}; filename="${nomeAscii}"; filename*=UTF-8''${encodeRFC5987(nomeOriginal)}`,
    );
    res.setHeader("Cache-Control", "private, no-store");

    if (!resposta.body) {
      res.status(502).json({
        message:
          "Lista de medicamentos indisponível no momento. Tente novamente.",
      });
      return;
    }

    const nodeStream = Readable.fromWeb(
      resposta.body as ReadableStream<Uint8Array>,
    );
    nodeStream.on("error", (err) => {
      logger.warn({ err }, "Falha ao ler lista de medicamentos do armazenamento");
      if (!res.headersSent) {
        res.status(502).json({
          message:
            "Lista de medicamentos indisponível no momento. Tente novamente.",
        });
      } else {
        res.destroy();
      }
    });
    nodeStream.pipe(res);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ message: "Lista de medicamentos não encontrada." });
      return;
    }
    logger.warn({ err }, "Falha ao servir lista de medicamentos");
    res.status(502).json({
      message: "Lista de medicamentos indisponível no momento. Tente novamente.",
    });
  }
}
