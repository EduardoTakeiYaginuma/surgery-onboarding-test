import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { Paciente } from "@workspace/db";
import { gerarPdfContrato } from "./contrato-pdf";
import {
  MODELOS_PADRAO,
  PROCEDIMENTO_BASE,
  type ModeloPadrao,
} from "./contrato-modelo-padrao";
import { gerarRascunhoContrato, variaveisNaoResolvidas } from "./contrato-geracao";

// Mesmos parâmetros de layout do módulo gerador (A4, margem de 56pt, corpo 11pt).
const LARGURA_A4 = 595.28;
const MARGEM = 56;
const LARGURA_UTIL = LARGURA_A4 - MARGEM * 2;
const TAMANHO_CORPO = 11;

/**
 * Extrai o texto visível de um PDF gerado pelo `pdf-lib`. Os fluxos de conteúdo
 * vêm comprimidos com Flate e o texto é desenhado como strings HEX (`<...> Tj`).
 * Inflamos cada fluxo, decodificamos os operandos de texto (hex `<...>` e
 * literais `(...)`) em latin1 (o mesmo conjunto WinAnsi usado pelas fontes-padrão)
 * e juntamos tudo. Assim conseguimos afirmar o que de fato chega ao documento
 * final — inclusive se acentos sobreviveram à sanitização.
 */
function extrairTextoPdf(bytes: Uint8Array): string {
  return extrairLinhasPdf(bytes).join(" ").replace(/\s+/g, " ");
}

/**
 * Igual ao extrator acima, mas devolve cada operando de texto separadamente.
 * Cada linha desenhada vira um `Tj`, então o array reflete as linhas como
 * realmente saíram para o documento — útil para medir a largura de cada uma.
 */
function extrairLinhasPdf(bytes: Uint8Array): string[] {
  const buf = Buffer.from(bytes);
  const pedacos: string[] = [];
  let i = 0;
  while (i < buf.length) {
    const idx = buf.indexOf("stream", i);
    if (idx === -1) break;
    // Ignora ocorrências dentro de "endstream".
    if (buf.subarray(idx - 3, idx + 6).toString("latin1") === "endstream") {
      i = idx + 6;
      continue;
    }
    let inicio = idx + 6;
    if (buf[inicio] === 0x0d) inicio++;
    if (buf[inicio] === 0x0a) inicio++;
    const fim = buf.indexOf("endstream", inicio);
    if (fim === -1) break;
    const bruto = buf.subarray(inicio, fim);
    let conteudo = "";
    try {
      conteudo = inflateSync(bruto).toString("latin1");
    } catch {
      conteudo = bruto.toString("latin1");
    }
    // Strings HEX: <4154...> -> bytes -> latin1.
    for (const m of conteudo.matchAll(/<([0-9A-Fa-f\s]+)>\s*Tj/g)) {
      const hex = m[1].replace(/\s+/g, "");
      if (hex.length % 2 === 0) {
        pedacos.push(Buffer.from(hex, "hex").toString("latin1"));
      }
    }
    // Strings literais: (texto) Tj.
    for (const m of conteudo.matchAll(/\(((?:\\.|[^()\\])*)\)\s*Tj/g)) {
      pedacos.push(m[1].replace(/\\([()\\])/g, "$1"));
    }
    i = fim + 9;
  }
  return pedacos;
}

/** Fixture de paciente completa o bastante para não deixar variáveis sem valor. */
function pacienteFixture(): Paciente {
  return {
    nome: "Maria Antônia de Assunção",
    cpf: "39053344705",
    dataCirurgia: "2026-09-15",
    horario: "06:00",
    local: "avant-moema",
    medica: "Dra. Karla Caetano Lobo",
    crm: "123456",
    rqe: "65432",
    clinica: "KCL",
    procedimentos: ["Blefaroplastia"],
    laser: false,
    valorSinal: "3000",
    valorPendente: "2000",
    dataPagamentoPendente: "2026-09-10",
    equipeAnestesia: "zenicare",
  } as unknown as Paciente;
}

function modelo(tipo: "contrato" | "termo", procedimento: string): ModeloPadrao {
  const m = MODELOS_PADRAO.find(
    (x) => x.tipo === tipo && x.procedimento === procedimento,
  );
  expect(m, `modelo de ${tipo} para "${procedimento}"`).toBeTruthy();
  return m!;
}

async function pdfTextoDe(tipo: "contrato" | "termo"): Promise<string> {
  const rascunho = gerarRascunhoContrato(modelo(tipo, PROCEDIMENTO_BASE), pacienteFixture());
  // O rascunho deve estar totalmente preenchido antes de virar PDF.
  expect(variaveisNaoResolvidas(rascunho.corpo)).toEqual([]);
  const bytes = await gerarPdfContrato(rascunho.titulo, rascunho.corpo);
  // Cabeçalho de PDF válido.
  expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
  return extrairTextoPdf(bytes);
}

describe("gerarPdfContrato — contrato de blefaroplastia", () => {
  it("preserva a acentuação intacta (não some na sanitização)", async () => {
    const texto = await pdfTextoDe("contrato");
    // Ç/Ã/Á estão no WinAnsi e devem sobreviver inteiros.
    expect(texto).toContain("PRESTAÇÃO DE SERVIÇOS");
    expect(texto).toContain("NÃO REEMBOLSÁVEL");
    expect(texto).not.toContain("REEMBOLSVEL");
  });

  it("mantém a OBRIGAÇÃO DE MEIO em caixa-alta acentuada", async () => {
    const texto = await pdfTextoDe("contrato");
    expect(texto).toContain("OBRIGA\u00c7\u00c3O DE MEIO");
  });

  it("renderiza a política de cancelamento (taxa administrativa e No-Show)", async () => {
    const texto = await pdfTextoDe("contrato");
    expect(texto).toMatch(/taxa administrativa/i);
    expect(texto).toMatch(/NÃO REEMBOLSÁVEL/);
    expect(texto).toMatch(/No-Show/i);
    expect(texto).toMatch(/40% sobre o valor total/i);
  });

  it("discrimina os custos de terceiros (hospital, anestesia, pós-operatório)", async () => {
    const texto = await pdfTextoDe("contrato");
    expect(texto).toMatch(/custos de terceiros/i);
    expect(texto).toMatch(/Hospital\/Clínica Dia/i);
    expect(texto).toMatch(/Anestesiologia/i);
    expect(texto).toMatch(/Pós-operatório/i);
  });

  it("inclui a assinatura eletrônica e a identificação das partes", async () => {
    const texto = await pdfTextoDe("contrato");
    expect(texto).toMatch(/eletronicamente/i);
    expect(texto).toMatch(/validade jurídica/i);
    expect(texto).toMatch(/2\.200-2/);
    expect(texto).toContain("KCL CLINIC LTDA");
    expect(texto).toContain("Maria Antônia de Assunção");
    expect(texto).toContain("Dra. Karla Caetano Lobo");
  });
});

describe("gerarPdfContrato — quebra de tokens longos", () => {
  it("quebra um token único enorme para nenhuma linha estourar a margem direita", async () => {
    // Caractere "W" é o mais largo da Helvetica: ~250 deles formam um único
    // "token" muito mais largo que a área útil (~483pt), simulando um nome,
    // e-mail, URL ou token colado num campo da paciente.
    const tokenEnorme = "W".repeat(250);
    const corpo = [
      "Paragrafo normal antes do token.",
      tokenEnorme,
      `Frase com um valor colado no meio ${"a".repeat(180)}@exemplo.com seguido de texto.`,
    ].join("\n");

    const bytes = await gerarPdfContrato("Contrato", corpo);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");

    // Mede cada linha desenhada com a MESMA fonte/medida do gerador.
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const linhas = extrairLinhasPdf(bytes);
    expect(linhas.length).toBeGreaterThan(0);

    for (const linha of linhas) {
      expect(
        font.widthOfTextAtSize(linha, TAMANHO_CORPO),
        `linha estourou a largura util: "${linha.slice(0, 40)}..."`,
      ).toBeLessThanOrEqual(LARGURA_UTIL);
    }

    // O token enorme não pode ter sido descartado: os "W" continuam presentes.
    expect(extrairTextoPdf(bytes)).toContain("WWWWWWWWWW");
  });
});

describe("gerarPdfContrato — TCLE de blefaroplastia", () => {
  it("renderiza os campos de dúvidas com o aviso ATENÇÃO de invalidação", async () => {
    const texto = await pdfTextoDe("termo");
    expect(texto).toMatch(/D\u00daVIDAS E ESCLARECIMENTOS|d\u00favidas/i);
    expect(texto).toMatch(/ATEN\u00c7\u00c3O: Os campos acima devem ser preenchidos/);
    expect(texto).toMatch(/inv\u00e1lido/i);
  });

  it("renderiza o bloco de rubrica e data por página", async () => {
    const texto = await pdfTextoDe("termo");
    expect(texto).toMatch(/RUBRICA E DATA POR P\u00c1GINA|rubrica/i);
    expect(texto).toContain("Rubrica:");
    expect(texto).toMatch(/Data: ____\/____\/______/);
  });

  it("preserva os riscos acentuados específicos da blefaroplastia", async () => {
    const texto = await pdfTextoDe("termo");
    expect(texto).toMatch(/retrobulbar/i);
    expect(texto).toMatch(/Ep\u00edfora/);
    expect(texto).toMatch(/Lagoftalmo/);
  });

  it("inclui o bloco de assinatura final com paciente e médica", async () => {
    const texto = await pdfTextoDe("termo");
    expect(texto).toContain("Maria Ant\u00f4nia de Assun\u00e7\u00e3o");
    expect(texto).toContain("Dra. Karla Caetano Lobo");
  });
});
