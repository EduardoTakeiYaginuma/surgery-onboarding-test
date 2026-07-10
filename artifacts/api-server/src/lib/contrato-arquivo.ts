import type { Response } from "express";
import { obterArquivoAssinado } from "./autentique";
import { baixarDocumentoAssinadoArquivado } from "./documento-assinado-storage";
import type { PacienteComVendedora } from "./pacientes-repo";
import { logger } from "./logger";

const TIMEOUT_MS = 12000;

/** Escreve o PDF (em memória) na resposta com os headers corretos. */
function responderPdf(
  res: Response,
  buffer: Buffer,
  opts: { download?: boolean; nomeArquivo: string },
): void {
  const disposicao = opts.download ? "attachment" : "inline";
  const nome = `${opts.nomeArquivo}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", buffer.length);
  res.setHeader("Content-Disposition", `${disposicao}; filename="${nome}"`);
  // Documento sensível: nunca cachear em proxies compartilhados.
  res.setHeader("Cache-Control", "private, no-store");
  res.status(200).end(buffer);
}

/**
 * Faz o proxy/stream do PDF do contrato ASSINADO de volta ao cliente.
 *
 * Centraliza a lógica usada pelo endpoint do Console (por id) e pelo endpoint
 * público (por token). O token da Autentique e a URL temporária do arquivo
 * ficam SOMENTE no servidor — o frontend recebe apenas o PDF (ou um erro
 * tratável). Em qualquer falha responde com JSON amigável e nunca vaza detalhes
 * técnicos (URL interna, token, id do documento).
 *
 * Resultados possíveis:
 * - 404 quando não há contrato vinculado ao processo.
 * - 409 quando o contrato existe mas ainda não está assinado.
 * - 502 quando a Autentique está indisponível no momento.
 * - 200 + application/pdf no caminho feliz.
 */
export async function servirContratoAssinado(
  paciente: PacienteComVendedora,
  res: Response,
  opts: { download?: boolean; nomeArquivo: string } = { nomeArquivo: "contrato-assinado" },
): Promise<void> {
  const documentoId = paciente.contratoAutentiqueId;
  if (!documentoId) {
    res
      .status(404)
      .json({ message: "Nenhum contrato vinculado a este processo." });
    return;
  }

  // Cópia arquivada (durável) primeiro: quando já temos o PDF no bucket,
  // servimos dele — não depende da Autentique estar no ar, é mais rápido e é
  // byte-a-byte o mesmo documento assinado. Só cai no stream ao vivo abaixo
  // quando ainda não há cópia (ou a leitura do bucket falhou).
  if (paciente.contratoAssinadoObjectPath) {
    const arquivado = await baixarDocumentoAssinadoArquivado(
      paciente.contratoAssinadoObjectPath,
    );
    if (arquivado) {
      responderPdf(res, arquivado, opts);
      return;
    }
  }

  const { status, url } = await obterArquivoAssinado(documentoId);

  if (status === "indisponivel") {
    res
      .status(502)
      .json({ message: "Contrato indisponível no momento. Tente novamente em instantes." });
    return;
  }

  if (status !== "assinado" || !url) {
    res
      .status(409)
      .json({ message: "O contrato ainda não está assinado." });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const arquivo = await fetch(url, { signal: controller.signal });
    if (!arquivo.ok || !arquivo.body) {
      res
        .status(502)
        .json({ message: "Contrato indisponível no momento. Tente novamente em instantes." });
      return;
    }

    const buffer = Buffer.from(await arquivo.arrayBuffer());
    responderPdf(res, buffer, opts);
  } catch (err) {
    logger.warn({ err }, "Falha ao baixar PDF assinado da Autentique");
    res
      .status(502)
      .json({ message: "Contrato indisponível no momento. Tente novamente em instantes." });
  } finally {
    clearTimeout(timer);
  }
}

/** Slug simples e seguro para nome de arquivo a partir do nome da paciente. */
export function slugNome(nome: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base ? `contrato-${base}` : "contrato-assinado";
}
