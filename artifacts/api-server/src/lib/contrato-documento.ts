/**
 * Conversor do formato canônico (HTML) dos documentos jurídicos para um modelo
 * de blocos simples, consumido pelo renderizador do PDF (`contrato-pdf.ts`).
 *
 * O HTML produzido pelo editor WYSIWYG (ou o texto puro legado, normalizado
 * antes) é transformado em uma lista de blocos — parágrafos, títulos e listas —
 * com "runs" de texto que carregam o estilo inline (negrito/itálico/sublinhado)
 * e o alinhamento do bloco. O PDF é desenhado a partir desse modelo, garantindo
 * que a formatação do editor se reflita no documento enviado à Autentique.
 */
import { parse, type HTMLElement, type Node } from "node-html-parser";
import { normalizarParaHtml } from "@workspace/secoes";

export type Alinhamento = "left" | "center" | "right" | "justify";

export interface RunTexto {
  texto: string;
  negrito: boolean;
  italico: boolean;
  sublinhado: boolean;
  /** Quebra de linha forçada (`<br>`) — `texto` é ignorado quando true. */
  quebra?: boolean;
}

export interface BlocoParagrafo {
  tipo: "paragrafo";
  /** 0 = corpo; 1–3 = nível de título (h1–h3+). */
  nivel: 0 | 1 | 2 | 3;
  alinhamento: Alinhamento;
  runs: RunTexto[];
}

export interface BlocoLista {
  tipo: "lista";
  ordenada: boolean;
  alinhamento: Alinhamento;
  itens: RunTexto[][];
}

export type Bloco = BlocoParagrafo | BlocoLista;

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

function tag(no: Node): string {
  return ((no as HTMLElement).rawTagName ?? "").toLowerCase();
}

function alinhamentoDe(el: HTMLElement, herdado: Alinhamento): Alinhamento {
  const style = el.getAttribute("style") ?? "";
  const m = style.match(/text-align\s*:\s*(left|right|center|justify)/i);
  if (m) return m[1].toLowerCase() as Alinhamento;
  const classe = el.getAttribute("class") ?? "";
  const mc = classe.match(/\b(?:ql-align-|align-|text-)(left|right|center|justify)\b/i);
  if (mc) return mc[1].toLowerCase() as Alinhamento;
  return herdado;
}

function coletarRuns(
  no: Node,
  estado: { negrito: boolean; italico: boolean; sublinhado: boolean },
  acc: RunTexto[],
): void {
  for (const filho of no.childNodes) {
    if (filho.nodeType === TEXT_NODE) {
      const texto = (filho as unknown as { text: string }).text;
      if (texto) {
        acc.push({
          texto,
          negrito: estado.negrito,
          italico: estado.italico,
          sublinhado: estado.sublinhado,
        });
      }
      continue;
    }
    if (filho.nodeType !== ELEMENT_NODE) continue;
    const t = tag(filho);
    if (t === "br") {
      acc.push({
        texto: "",
        negrito: estado.negrito,
        italico: estado.italico,
        sublinhado: estado.sublinhado,
        quebra: true,
      });
      continue;
    }
    coletarRuns(
      filho,
      {
        negrito: estado.negrito || t === "strong" || t === "b",
        italico: estado.italico || t === "em" || t === "i",
        sublinhado: estado.sublinhado || t === "u",
      },
      acc,
    );
  }
}

const ESTADO_INICIAL = { negrito: false, italico: false, sublinhado: false };

function nivelTitulo(t: string): 1 | 2 | 3 {
  if (t === "h1") return 1;
  if (t === "h2") return 2;
  return 3;
}

function temTextoVisivel(runs: RunTexto[]): boolean {
  return runs.some((r) => !r.quebra && r.texto.trim() !== "");
}

function percorrer(
  no: Node,
  blocos: Bloco[],
  alinhamentoHerdado: Alinhamento,
): void {
  for (const filho of no.childNodes) {
    if (filho.nodeType === TEXT_NODE) {
      const texto = (filho as unknown as { text: string }).text;
      if (texto && texto.trim() !== "") {
        blocos.push({
          tipo: "paragrafo",
          nivel: 0,
          alinhamento: alinhamentoHerdado,
          runs: [
            { texto, negrito: false, italico: false, sublinhado: false },
          ],
        });
      }
      continue;
    }
    if (filho.nodeType !== ELEMENT_NODE) continue;
    const el = filho as HTMLElement;
    const t = tag(el);
    const alinhamento = alinhamentoDe(el, alinhamentoHerdado);

    if (t === "ul" || t === "ol") {
      const itens: RunTexto[][] = [];
      for (const li of el.childNodes) {
        if (li.nodeType === ELEMENT_NODE && tag(li) === "li") {
          const runs: RunTexto[] = [];
          coletarRuns(li, ESTADO_INICIAL, runs);
          if (temTextoVisivel(runs)) itens.push(runs);
        }
      }
      if (itens.length) {
        blocos.push({ tipo: "lista", ordenada: t === "ol", alinhamento, itens });
      }
      continue;
    }

    if (
      t === "p" ||
      t === "h1" ||
      t === "h2" ||
      t === "h3" ||
      t === "h4" ||
      t === "h5" ||
      t === "h6"
    ) {
      const runs: RunTexto[] = [];
      coletarRuns(el, ESTADO_INICIAL, runs);
      if (temTextoVisivel(runs)) {
        blocos.push({
          tipo: "paragrafo",
          nivel: t === "p" ? 0 : nivelTitulo(t),
          alinhamento,
          runs,
        });
      }
      continue;
    }

    // Contêineres genéricos (div/section/article/…) — desce um nível.
    if (el.childNodes.length) {
      percorrer(el, blocos, alinhamento);
    }
  }
}

/** Converte HTML (ou texto puro legado) em uma lista de blocos para o PDF. */
export function htmlParaBlocos(conteudo: string): Bloco[] {
  const html = normalizarParaHtml(conteudo);
  const root = parse(html, {
    lowerCaseTagName: false,
    comment: false,
  });
  const blocos: Bloco[] = [];
  percorrer(root, blocos, "left");
  return blocos;
}
