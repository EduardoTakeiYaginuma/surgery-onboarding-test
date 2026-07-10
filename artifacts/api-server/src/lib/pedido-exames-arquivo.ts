import type { Response as ExpressResponse } from "express";
import { randomUUID } from "crypto";
import { Readable } from "stream";
import type { PedidoExamesPaciente } from "@workspace/db";
import { ObjectNotFoundError } from "./objectStorage";
import { StorageIndisponivelError } from "./fotos-storage";
import {
  TIPO_PDF,
  sanitizarNomeArquivo,
  encodeRFC5987,
} from "./documentos-arquivo";
import { logger } from "./logger";

/**
 * Armazenamento do PDF de **pedido de exames** da paciente, em Object Storage
 * PRIVADO do **Supabase Storage**, num bucket PRÓPRIO — separado dos documentos
 * gerais (`documentos`) e das fotos (`fotos`) — para organizar melhor:
 *
 * - `SUPABASE_STORAGE_BUCKET_EXAMES` (obrigatório; nome do bucket privado)
 *
 * Reusa as credenciais globais (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`).
 * O upload é server-side (a equipe manda o arquivo via multipart ao Console, que
 * repassa ao backend); download e remoção passam SEMPRE pelo servidor, nunca
 * expondo a chave do objeto. `objectPath` guardado no banco é a chave crua
 * relativa ao bucket (ex.: `123/uuid.pdf`).
 *
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
  const bucket = process.env.SUPABASE_STORAGE_BUCKET_EXAMES?.trim();
  if (!url || !key || !bucket) return null;
  return { baseUrl: url.endsWith("/") ? url.slice(0, -1) : url, key, bucket };
}

/** true quando SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY estão configurados. */
export function storageExamesConfigurado(): boolean {
  return config() !== null;
}

function authHeaders(key: string): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

/**
 * Sobe o PDF do pedido de exames e devolve a chave (relativa ao bucket) para
 * gravar em `pacientes_pedido_exames.object_path`.
 *
 * Caminho: `${pacienteId}/${uuid}.pdf`.
 */
export async function uploadPedidoExames(params: {
  pacienteId: number;
  buffer: Buffer;
}): Promise<string> {
  const cfg = config();
  if (!cfg) throw new StorageIndisponivelError();

  const chave = `${params.pacienteId}/${randomUUID()}.pdf`;
  try {
    const resp = await fetch(
      `${cfg.baseUrl}/storage/v1/object/${cfg.bucket}/${chave}`,
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
        "Falha ao subir pedido de exames para o Supabase Storage",
      );
      throw new StorageIndisponivelError();
    }
    return chave;
  } catch (err) {
    if (err instanceof StorageIndisponivelError) throw err;
    logger.warn({ err }, "Erro ao subir pedido de exames para o Supabase");
    throw new StorageIndisponivelError(err);
  }
}

/** Busca o objeto no bucket de exames; lança ObjectNotFoundError em 404. */
async function fetchPedidoExames(objectKey: string): Promise<Response> {
  const cfg = config();
  if (!cfg) throw new ObjectNotFoundError();
  const resp = await fetch(
    `${cfg.baseUrl}/storage/v1/object/authenticated/${cfg.bucket}/${objectKey}`,
    { headers: authHeaders(cfg.key), signal: AbortSignal.timeout(30_000) },
  );
  if (resp.status === 404) throw new ObjectNotFoundError();
  if (!resp.ok) {
    throw new Error(`Falha ao baixar pedido de exames do Supabase (${resp.status}).`);
  }
  return resp;
}

/** Apaga o objeto do bucket de exames, tolerando ausência (idempotente). */
export async function apagarPedidoExamesObjeto(objectKey: string): Promise<void> {
  const cfg = config();
  if (!cfg) return;
  try {
    const resp = await fetch(
      `${cfg.baseUrl}/storage/v1/object/${cfg.bucket}/${objectKey}`,
      { method: "DELETE", headers: authHeaders(cfg.key), signal: AbortSignal.timeout(30_000) },
    );
    // 404 = já não existe: tratamos como sucesso (idempotente).
    if (!resp.ok && resp.status !== 404) {
      const detalhe = await resp.text().catch(() => "");
      logger.warn(
        { status: resp.status, detalhe },
        "Falha ao apagar objeto do pedido de exames",
      );
    }
  } catch (err) {
    logger.warn({ err }, "Erro ao apagar objeto do pedido de exames");
  }
}

/**
 * Faz o stream do PDF de pedido de exames de volta ao cliente. Espelha
 * `servirDocumento`, mas lê do bucket de exames. `?download=1` força o download
 * como anexo; senão abre embutido.
 */
export async function servirPedidoExames(
  pedido: Pick<PedidoExamesPaciente, "objectPath" | "nomeArquivo" | "contentType">,
  res: ExpressResponse,
  opts: { download?: boolean } = {},
): Promise<void> {
  try {
    const resposta = await fetchPedidoExames(pedido.objectPath);

    const disposicao = opts.download ? "attachment" : "inline";
    const nomeOriginal = pedido.nomeArquivo?.trim() || "pedido-de-exames.pdf";
    const nomeAscii = sanitizarNomeArquivo(nomeOriginal);
    const tamanho = resposta.headers.get("content-length");

    res.setHeader("Content-Type", pedido.contentType || TIPO_PDF);
    if (tamanho) res.setHeader("Content-Length", tamanho);
    res.setHeader(
      "Content-Disposition",
      `${disposicao}; filename="${nomeAscii}"; filename*=UTF-8''${encodeRFC5987(nomeOriginal)}`,
    );
    res.setHeader("Cache-Control", "private, no-store");

    if (!resposta.body) {
      res.status(502).json({
        message: "Pedido de exames indisponível no momento. Tente novamente.",
      });
      return;
    }

    const nodeStream = Readable.fromWeb(
      resposta.body as ReadableStream<Uint8Array>,
    );
    nodeStream.on("error", (err) => {
      logger.warn({ err }, "Falha ao ler pedido de exames do armazenamento");
      if (!res.headersSent) {
        res.status(502).json({
          message: "Pedido de exames indisponível no momento. Tente novamente.",
        });
      } else {
        res.destroy();
      }
    });
    nodeStream.pipe(res);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ message: "Pedido de exames não encontrado." });
      return;
    }
    logger.warn({ err }, "Falha ao servir pedido de exames da paciente");
    res.status(502).json({
      message: "Pedido de exames indisponível no momento. Tente novamente.",
    });
  }
}
