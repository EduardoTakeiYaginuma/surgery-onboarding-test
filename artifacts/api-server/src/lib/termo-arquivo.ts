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
  res.setHeader("Cache-Control", "private, no-store");
  res.status(200).end(buffer);
}

/**
 * Faz o proxy/stream do PDF do termo de consentimento ASSINADO de volta ao
 * cliente. Espelha `servirContratoAssinado` mas usa `termoAutentiqueId`.
 *
 * O token da Autentique e a URL temporária do arquivo ficam SOMENTE no servidor
 * — o frontend recebe apenas o PDF (ou um erro tratável). Nunca vaza detalhes
 * técnicos.
 */
export async function servirTermoAssinado(
  paciente: PacienteComVendedora,
  res: Response,
  opts: { download?: boolean; nomeArquivo: string } = { nomeArquivo: "termo-assinado" },
): Promise<void> {
  const documentoId = paciente.termoAutentiqueId;
  if (!documentoId) {
    res
      .status(404)
      .json({ message: "Nenhum termo vinculado a este processo." });
    return;
  }

  // Cópia arquivada primeiro (durável, sem depender da Autentique). Só cai no
  // stream ao vivo quando ainda não há cópia ou a leitura do bucket falhou.
  if (paciente.termoAssinadoObjectPath) {
    const arquivado = await baixarDocumentoAssinadoArquivado(
      paciente.termoAssinadoObjectPath,
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
      .json({ message: "Termo indisponível no momento. Tente novamente em instantes." });
    return;
  }

  if (status !== "assinado" || !url) {
    res
      .status(409)
      .json({ message: "O termo ainda não está assinado." });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const arquivo = await fetch(url, { signal: controller.signal });
    if (!arquivo.ok || !arquivo.body) {
      res
        .status(502)
        .json({ message: "Termo indisponível no momento. Tente novamente em instantes." });
      return;
    }

    const buffer = Buffer.from(await arquivo.arrayBuffer());
    responderPdf(res, buffer, opts);
  } catch (err) {
    logger.warn({ err }, "Falha ao baixar PDF assinado do termo na Autentique");
    res
      .status(502)
      .json({ message: "Termo indisponível no momento. Tente novamente em instantes." });
  } finally {
    clearTimeout(timer);
  }
}

/** Slug simples e seguro para nome de arquivo a partir do nome da paciente. */
export function slugNomeTermo(nome: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base ? `termo-${base}` : "termo-assinado";
}
