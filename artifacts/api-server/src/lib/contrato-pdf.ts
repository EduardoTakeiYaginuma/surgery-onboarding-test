import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import {
  htmlParaBlocos,
  type Alinhamento,
  type Bloco,
  type RunTexto,
} from "./contrato-documento";

const A4: [number, number] = [595.28, 841.89];
const MARGEM = 56;
const TAMANHO_CORPO = 11;
const TAMANHO_TITULO = 15;
const ENTRELINHA = 1.45;
const COR = rgb(0.1, 0.1, 0.1);
const INDENT_LISTA = 16;

/** Tamanho da fonte por tipo de bloco (0 = corpo; 1–3 = títulos). */
function tamanhoPorNivel(nivel: 0 | 1 | 2 | 3): number {
  switch (nivel) {
    case 1:
      return TAMANHO_TITULO;
    case 2:
      return 13;
    case 3:
      return 12;
    default:
      return TAMANHO_CORPO;
  }
}

/** Espaçamento depois do bloco, por nível. */
function espacoPorNivel(nivel: 0 | 1 | 2 | 3): number {
  switch (nivel) {
    case 1:
      return 14;
    case 2:
      return 10;
    case 3:
      return 8;
    default:
      return 6;
  }
}

/**
 * Normaliza o texto para o conjunto de caracteres das fontes-padrão do PDF
 * (WinAnsi). Substitui tipografia comum (travessões, aspas curvas, subscritos) e
 * remove qualquer glifo fora do conjunto, evitando que a geração falhe por um
 * caractere isolado.
 */
function sanitizar(texto: string): string {
  const mapa: Record<string, string> = {
    "\u2014": "-",
    "\u2013": "-",
    "\u2010": "-",
    "\u2022": "-",
    "\u00b7": "-",
    "\u2019": "'",
    "\u2018": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2082": "2",
    "\u00ba": "o",
    "\u00aa": "a",
    "\u00a0": " ",
  };
  return texto
    .replace(/[\u2014\u2013\u2010\u2022\u00b7\u2019\u2018\u201c\u201d\u2082\u00ba\u00aa\u00a0]/g, (c) => mapa[c] ?? c)
    .replace(/[^\u0000-\u00ff]/g, "");
}

/**
 * Quebra um token único que, mesmo sozinho, não cabe na largura disponível
 * (ex.: nome/e-mail/URL/token colado sem espaços). Fatia caractere a caractere
 * até o limite, garantindo que nenhum pedaço ultrapasse a margem direita.
 */
function quebrarTokenLongo(
  palavra: string,
  font: PDFFont,
  tamanho: number,
  larguraMax: number,
): string[] {
  const pedacos: string[] = [];
  let atual = "";
  for (const ch of palavra) {
    const tentativa = atual + ch;
    if (font.widthOfTextAtSize(tentativa, tamanho) > larguraMax && atual) {
      pedacos.push(atual);
      atual = ch;
    } else {
      atual = tentativa;
    }
  }
  if (atual) pedacos.push(atual);
  return pedacos;
}

interface Fontes {
  normal: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

interface PalavraEstilo {
  texto: string;
  negrito: boolean;
  italico: boolean;
  sublinhado: boolean;
}

type Palavra = { quebra: true } | PalavraEstilo;

/** Achata os runs em palavras (separadas por espaço), preservando o estilo. */
function runsParaPalavras(runs: RunTexto[], negritoForcado: boolean): Palavra[] {
  const palavras: Palavra[] = [];
  for (const run of runs) {
    if (run.quebra) {
      palavras.push({ quebra: true });
      continue;
    }
    for (const w of run.texto.split(/\s+/)) {
      if (w === "") continue;
      palavras.push({
        texto: w,
        negrito: run.negrito || negritoForcado,
        italico: run.italico,
        sublinhado: run.sublinhado,
      });
    }
  }
  return palavras;
}

function escolherFonte(p: PalavraEstilo, fontes: Fontes): PDFFont {
  if (p.negrito && p.italico) return fontes.boldItalic;
  if (p.negrito) return fontes.bold;
  if (p.italico) return fontes.italic;
  return fontes.normal;
}

interface PalavraMedida {
  texto: string;
  font: PDFFont;
  largura: number;
  sublinhado: boolean;
}

/**
 * Gera o PDF do documento a partir do título e do corpo (HTML canônico — ou
 * texto puro legado, normalizado antes). Layout A4/Helvetica com quebra de
 * linha, alinhamento (incl. justificado), listas, estilos inline
 * (negrito/itálico/sublinhado) e paginação automáticas. O conteúdo é exatamente
 * o texto aprovado pela equipe; a formatação do editor se reflete aqui.
 */
export async function gerarPdfContrato(
  titulo: string,
  corpo: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fontes: Fontes = {
    normal: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
  };

  const larguraUtil = A4[0] - MARGEM * 2;
  let page = doc.addPage(A4);
  let y = A4[1] - MARGEM;

  const novaPagina = () => {
    page = doc.addPage(A4);
    y = A4[1] - MARGEM;
  };

  /**
   * Desenha uma sequência de palavras (com estilo) como um parágrafo: quebra em
   * linhas, aplica alinhamento e desenha PALAVRA A PALAVRA (cada palavra é um
   * `Tj`), de modo que o justificado funcione e nenhuma linha estoure a margem.
   */
  const desenharParagrafo = (
    runs: RunTexto[],
    opts: {
      tamanho: number;
      alinhamento: Alinhamento;
      negritoForcado?: boolean;
      indent?: number;
      marcador?: string;
    },
  ) => {
    const { tamanho, alinhamento } = opts;
    const indent = opts.indent ?? 0;
    const esquerda = MARGEM + indent;
    const larguraDisp = larguraUtil - indent;
    const espacoW = fontes.normal.widthOfTextAtSize(" ", tamanho);
    const palavras = runsParaPalavras(runs, opts.negritoForcado ?? false);

    // Quebra em linhas medindo cada palavra com a sua própria fonte.
    const linhas: PalavraMedida[][] = [];
    let atual: PalavraMedida[] = [];
    const larguraLinha = (ws: PalavraMedida[]) =>
      ws.reduce((s, w) => s + w.largura, 0) +
      espacoW * Math.max(0, ws.length - 1);

    for (const p of palavras) {
      if ("quebra" in p) {
        linhas.push(atual);
        atual = [];
        continue;
      }
      const font = escolherFonte(p, fontes);
      const texto = sanitizar(p.texto);
      if (texto === "") continue;
      const largura = font.widthOfTextAtSize(texto, tamanho);
      if (largura > larguraDisp) {
        // Token que não cabe nem sozinho: fatia em pedaços de largura máxima.
        if (atual.length) {
          linhas.push(atual);
          atual = [];
        }
        const pedacos = quebrarTokenLongo(texto, font, tamanho, larguraDisp);
        for (let k = 0; k < pedacos.length - 1; k++) {
          linhas.push([
            {
              texto: pedacos[k],
              font,
              largura: font.widthOfTextAtSize(pedacos[k], tamanho),
              sublinhado: p.sublinhado,
            },
          ]);
        }
        const ultimo = pedacos[pedacos.length - 1];
        atual.push({
          texto: ultimo,
          font,
          largura: font.widthOfTextAtSize(ultimo, tamanho),
          sublinhado: p.sublinhado,
        });
        continue;
      }
      const w: PalavraMedida = { texto, font, largura, sublinhado: p.sublinhado };
      if (atual.length && larguraLinha([...atual, w]) > larguraDisp) {
        linhas.push(atual);
        atual = [w];
      } else {
        atual.push(w);
      }
    }
    if (atual.length) linhas.push(atual);
    if (linhas.length === 0) linhas.push([]);

    const alturaLinha = tamanho * ENTRELINHA;
    for (let li = 0; li < linhas.length; li++) {
      const linha = linhas[li];
      if (y - alturaLinha < MARGEM) novaPagina();

      // Marcador da lista (bullet/número) na primeira linha, em "hanging indent".
      if (opts.marcador && li === 0) {
        page.drawText(sanitizar(opts.marcador), {
          x: MARGEM,
          y: y - tamanho,
          size: tamanho,
          font: fontes.normal,
          color: COR,
        });
      }

      if (linha.length === 0) {
        y -= alturaLinha;
        continue;
      }

      const totalPalavras = linha.reduce((s, w) => s + w.largura, 0);
      const n = linha.length;
      const ultima = li === linhas.length - 1;
      let x = esquerda;
      let gap = espacoW;
      if (alinhamento === "center") {
        x = esquerda + (larguraDisp - (totalPalavras + espacoW * (n - 1))) / 2;
      } else if (alinhamento === "right") {
        x = esquerda + (larguraDisp - (totalPalavras + espacoW * (n - 1)));
      } else if (alinhamento === "justify" && !ultima && n > 1) {
        gap = (larguraDisp - totalPalavras) / (n - 1);
      }
      if (x < esquerda) x = esquerda;

      for (const w of linha) {
        page.drawText(w.texto, {
          x,
          y: y - tamanho,
          size: tamanho,
          font: w.font,
          color: COR,
        });
        if (w.sublinhado) {
          const uy = y - tamanho - 1.5;
          page.drawLine({
            start: { x, y: uy },
            end: { x: x + w.largura, y: uy },
            thickness: 0.6,
            color: COR,
          });
        }
        x += w.largura + gap;
      }
      y -= alturaLinha;
    }
  };

  const desenharBloco = (bloco: Bloco) => {
    if (bloco.tipo === "lista") {
      bloco.itens.forEach((runs, i) => {
        const marcador = bloco.ordenada ? `${i + 1}.` : "\u2022";
        desenharParagrafo(runs, {
          tamanho: TAMANHO_CORPO,
          alinhamento: bloco.alinhamento === "justify" ? "left" : bloco.alinhamento,
          indent: INDENT_LISTA,
          marcador,
        });
        y -= 3;
      });
      y -= 6;
      return;
    }

    const textoBloco = bloco.runs
      .map((r) => r.texto)
      .join("")
      .trimStart()
      .toUpperCase();
    const jaNegrito = bloco.runs.some((r) => !r.quebra && r.negrito);
    const negritoForcado =
      bloco.nivel > 0 || (!jaNegrito && textoBloco.startsWith("ATEN\u00c7\u00c3O"));

    desenharParagrafo(bloco.runs, {
      tamanho: tamanhoPorNivel(bloco.nivel),
      alinhamento: bloco.alinhamento,
      negritoForcado,
    });
    y -= espacoPorNivel(bloco.nivel);
  };

  // Título (recebido à parte do corpo) — sempre em negrito, como cabeçalho.
  desenharParagrafo([{ texto: titulo, negrito: true, italico: false, sublinhado: false }], {
    tamanho: TAMANHO_TITULO,
    alinhamento: "left",
    negritoForcado: true,
  });
  y -= 14;

  for (const bloco of htmlParaBlocos(corpo)) {
    desenharBloco(bloco);
  }

  return doc.save();
}
