import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { htmlParaTexto } from "@workspace/secoes";
import {
  ImportacaoError,
  TIPO_DOCX,
  TIPO_PDF,
  converterParaHtml,
  resolverFormato,
  tituloAPartirDoNome,
} from "./contrato-importar";

/** Monta um PDF real (pdf-lib) com uma linha de texto por item. */
async function montarPdf(linhas: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const pagina = doc.addPage([595.28, 841.89]);
  let y = 780;
  for (const linha of linhas) {
    pagina.drawText(linha, { x: 56, y, size: 12, font: fonte });
    y -= 20;
  }
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

describe("resolverFormato", () => {
  it("prioriza o contentType quando reconhecido", () => {
    expect(resolverFormato(TIPO_DOCX, "qualquer.bin")).toBe("docx");
    expect(resolverFormato(TIPO_PDF, "qualquer.bin")).toBe("pdf");
  });

  it("cai para a extensão do nome quando o contentType é genérico", () => {
    expect(resolverFormato("application/octet-stream", "Contrato.DOCX")).toBe(
      "docx",
    );
    expect(resolverFormato(undefined, "Termo.pdf")).toBe("pdf");
  });

  it("retorna null para formatos não suportados", () => {
    expect(resolverFormato("text/plain", "contrato.txt")).toBeNull();
    expect(resolverFormato(undefined, "imagem.png")).toBeNull();
  });
});

describe("tituloAPartirDoNome", () => {
  it("remove a extensão e normaliza separadores", () => {
    expect(tituloAPartirDoNome("Contrato_Blefaroplastia-2024.docx")).toBe(
      "Contrato Blefaroplastia 2024",
    );
    expect(tituloAPartirDoNome("TERMO.PDF")).toBe("TERMO");
  });
});

describe("converterParaHtml (docx)", () => {
  it("transforma um buffer ilegível em ImportacaoError (nunca 500)", async () => {
    const lixo = Buffer.from("isto não é um docx", "utf8");
    await expect(converterParaHtml(lixo, "docx")).rejects.toBeInstanceOf(
      ImportacaoError,
    );
  });
});

describe("converterParaHtml (pdf)", () => {
  it("extrai o texto do PDF, mantém {{variáveis}} e remove separadores de página", async () => {
    const buffer = await montarPdf([
      "Termo de consentimento livre e esclarecido.",
      "-- 1 of 2 --",
      "Responsável: {{nomePaciente}}.",
    ]);
    const html = await converterParaHtml(buffer, "pdf");
    const texto = htmlParaTexto(html);
    expect(texto).toContain("Termo de consentimento livre e esclarecido.");
    expect(texto).toContain("{{nomePaciente}}");
    expect(texto).not.toMatch(/--\s*1\s+of\s+2\s*--/);
  });

  it("rejeita PDF sem texto (escaneado/imagem) com ImportacaoError", async () => {
    const buffer = await montarPdf([]);
    await expect(converterParaHtml(buffer, "pdf")).rejects.toBeInstanceOf(
      ImportacaoError,
    );
  });

  it("transforma um buffer ilegível em ImportacaoError (nunca 500)", async () => {
    const lixo = Buffer.from("%PDF-quebrado", "utf8");
    await expect(converterParaHtml(lixo, "pdf")).rejects.toBeInstanceOf(
      ImportacaoError,
    );
  });
});
