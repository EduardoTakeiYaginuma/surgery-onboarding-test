import { describe, it, expect } from "vitest";
import { htmlParaBlocos } from "./contrato-documento";
import {
  ehHtml,
  textoParaHtml,
  normalizarParaHtml,
  htmlParaTexto,
  htmlVazio,
  escapeHtml,
} from "@workspace/secoes";

describe("helpers de formato HTML (@workspace/secoes)", () => {
  it("escapeHtml escapa os caracteres especiais", () => {
    expect(escapeHtml('a & b < c > "d" \'e\'')).toBe(
      "a &amp; b &lt; c &gt; &quot;d&quot; &#39;e&#39;",
    );
  });

  it("ehHtml distingue HTML de texto puro", () => {
    expect(ehHtml("<p>oi</p>")).toBe(true);
    expect(ehHtml("texto puro com {{nome}}")).toBe(false);
    expect(ehHtml("1 < 2 e 3 > 2")).toBe(false);
  });

  it("textoParaHtml agrupa bullets e destaca ATENÇÃO, preservando variáveis", () => {
    const html = textoParaHtml(
      "T\u00edtulo\n\nATEN\u00c7\u00c3O: cuidado\n\n\u2022 um\n\u2022 dois\nFinal {{nome}}.",
    );
    expect(html).toContain("<ul><li>um</li><li>dois</li></ul>");
    expect(html).toContain("<strong>ATEN\u00c7\u00c3O: cuidado</strong>");
    expect(html).toContain("{{nome}}");
  });

  it("normalizarParaHtml é idempotente em HTML e converte texto", () => {
    const html = "<p>oi</p>";
    expect(normalizarParaHtml(html)).toBe(html);
    expect(normalizarParaHtml("oi")).toBe("<p>oi</p>");
  });

  it("htmlParaTexto extrai texto legível para a IA", () => {
    const txt = htmlParaTexto(
      "<h1>T\u00edtulo</h1><p>Par\u00e1grafo <strong>um</strong>.</p><ul><li>a</li><li>b</li></ul>",
    );
    expect(txt).toContain("T\u00edtulo");
    expect(txt).toContain("Par\u00e1grafo um.");
    expect(txt).toContain("\u2022 a");
    expect(txt).not.toContain("<");
  });

  it("htmlVazio detecta conteúdo sem texto visível", () => {
    expect(htmlVazio("<p></p>")).toBe(true);
    expect(htmlVazio("<p>\u00a0</p>")).toBe(true);
    expect(htmlVazio("<p>oi</p>")).toBe(false);
  });
});

describe("htmlParaBlocos", () => {
  it("converte títulos, parágrafos com runs e listas", () => {
    const blocos = htmlParaBlocos(
      '<h1 style="text-align:center"><strong>CONTRATO</strong></h1>' +
        '<p style="text-align:justify">Texto <strong>negrito</strong> e <em>it\u00e1lico</em> {{nome}}.</p>' +
        "<ul><li>Honor\u00e1rios m\u00e9dicos</li><li>Taxa de centro cir\u00fargico</li></ul>",
    );
    expect(blocos).toHaveLength(3);

    const titulo = blocos[0];
    expect(titulo.tipo).toBe("paragrafo");
    if (titulo.tipo === "paragrafo") {
      expect(titulo.nivel).toBe(1);
      expect(titulo.alinhamento).toBe("center");
      expect(titulo.runs[0]).toMatchObject({ texto: "CONTRATO", negrito: true });
    }

    const par = blocos[1];
    expect(par.tipo).toBe("paragrafo");
    if (par.tipo === "paragrafo") {
      expect(par.alinhamento).toBe("justify");
      expect(par.runs.some((r) => r.negrito && r.texto.includes("negrito"))).toBe(
        true,
      );
      expect(par.runs.some((r) => r.italico)).toBe(true);
      expect(par.runs.map((r) => r.texto).join("")).toContain("{{nome}}");
    }

    const lista = blocos[2];
    expect(lista.tipo).toBe("lista");
    if (lista.tipo === "lista") {
      expect(lista.ordenada).toBe(false);
      expect(lista.itens).toHaveLength(2);
    }
  });

  it("normaliza texto puro legado para blocos", () => {
    const blocos = htmlParaBlocos(
      "CONTRATO\n\nATEN\u00c7\u00c3O: cuidado\n\n\u2022 item um\n\u2022 item dois",
    );
    expect(blocos.some((b) => b.tipo === "lista")).toBe(true);
    const atencao = blocos.find(
      (b) =>
        b.tipo === "paragrafo" &&
        b.runs.some((r) => r.texto.includes("ATEN\u00c7\u00c3O")),
    );
    expect(atencao).toBeDefined();
    if (atencao && atencao.tipo === "paragrafo") {
      expect(atencao.runs.every((r) => r.negrito)).toBe(true);
    }
  });
});
