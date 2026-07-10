/**
 * Motor de cláusulas tipadas — resolução DETERMINÍSTICA de um modelo de contrato
 * com regiões marcadas em regiões concretas para uma paciente.
 *
 * O modelo-base é HTML canônico (o mesmo formato do editor/PDF) enriquecido com
 * marcadores `<div data-regiao>`:
 *
 *   - `variante`  — escolher 1 de N blocos filhos `[data-opcao]` (ex.: Foro
 *                   São Paulo ↔ Campinas; a Cláusula 5.1 em suas 3 versões).
 *   - `opcional`  — incluir ou omitir um bloco inteiro (ex.: cláusula de exames
 *                   pré-operatórios; flexibilidade de reagendamento).
 *   - `livre`/`fixo` — passam intactos (a UI os trata; aqui só preservamos).
 *
 * Cada `variante`/`opcional` traz uma regra de inferência (`data-inferir`) que
 * PROPÕE a decisão a partir dos dados da paciente; decisões já CONFIRMADAS pelo
 * operador têm precedência. A saída preserva wrappers leves (`data-decidido`,
 * `data-incluido`) para a UI destacar as regiões — e, como o conversor de PDF
 * desce em divs genéricas ignorando atributos desconhecidos, os marcadores
 * somem no documento final.
 *
 * A numeração da Seção III (e adiante) é COMPUTADA aqui: `<span data-num>` é
 * preenchido com a numeração hierárquica correta DEPOIS que variantes/opcionais
 * foram resolvidos, então nenhum número desanda quando um bloco entra ou sai.
 * Referências cruzadas (`<span data-ref="idDaRegiao">`) apontam para o número
 * computado da região citada, evitando o "a Cláusula 2.4 não é a mesma coisa".
 *
 * IMPORTANTE: tudo aqui roda ANTES da substituição de `{{variáveis}}` — os
 * tokens de texto (inclusive gênero) continuam intactos e são resolvidos por
 * `preencherCorpo` (fonte única em `contrato-geracao.ts`).
 */
import { parse, type HTMLElement } from "node-html-parser";
import type { Paciente, DecisaoRegiao } from "@workspace/db";

// ===========================================================================
// Gênero (concordância) — token dedicado, não variante espalhada pelo texto.
// ===========================================================================

export type Genero = "f" | "m";

/** Tokens de concordância disponíveis no corpo: `{{contratante}}`, etc. */
export const TOKENS_GENERO = {
  f: {
    contratante: "a CONTRATANTE",
    da: "da paciente",
    ao: "à paciente",
    operada: "operada",
    portador: "portadora",
    domiciliada: "domiciliada",
    ela: "ela",
  },
  m: {
    contratante: "o CONTRATANTE",
    da: "do paciente",
    ao: "ao paciente",
    operada: "operado",
    portador: "portador",
    domiciliada: "domiciliado",
    ela: "ele",
  },
} as const satisfies Record<Genero, Record<string, string>>;

/** Chaves de token de gênero (para detectar se o corpo usa concordância). */
export const CHAVES_GENERO: readonly string[] = Object.keys(TOKENS_GENERO.f);

/** O corpo usa algum token de concordância de gênero? */
export function usaGenero(corpo: string): boolean {
  return CHAVES_GENERO.some((k) => corpo.includes(`{{${k}}}`));
}

/**
 * Heurística de gênero a partir do primeiro nome (não há campo `sexo` no
 * cadastro). É uma SUGESTÃO de baixa confiança — a decisão de gênero sempre
 * entra como "pendente" para o operador confirmar, já que nomes terminados em
 * "a" nem sempre são femininos e vice-versa.
 */
export function inferirGenero(nome: string): Genero {
  const primeiro = (nome ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  // Terminações masculinas comuns mesmo terminando em vogal átona.
  if (/(a)$/.test(primeiro)) {
    // Exceções masculinas frequentes terminadas em "a".
    if (/^(luca|joshua|isra|garcia|nicola|jeremias|elias|tobias|dima)$/.test(primeiro))
      return "m";
    return "f";
  }
  return "m";
}

// ===========================================================================
// Contexto e regras de inferência
// ===========================================================================

/** Sinais derivados da paciente que as regras de inferência consultam. */
export interface ContextoDecisao {
  nome: string;
  medica: string;
  clinica: string;
  local: string;
  localEndereco: string;
  procedimentos: string[];
  laser: boolean;
  /** Há saldo em aberto (pagamento escalonado) vs. quitação à vista. */
  temSaldo: boolean;
}

export function montarContextoDecisao(p: Paciente): ContextoDecisao {
  const pendente = Number(p.valorPendente ?? "0");
  return {
    nome: p.nome ?? "",
    medica: p.medica ?? "",
    clinica: p.clinica ?? "",
    local: p.local ?? "",
    localEndereco: p.localEndereco ?? "",
    procedimentos: p.procedimentos ?? [],
    laser: !!p.laser,
    temSaldo: Number.isFinite(pendente) && pendente > 0,
  };
}

/** Resultado de uma regra: a sugestão + o porquê (auditável) + a confiança. */
export interface Sugestao {
  /** variante: chave da opção. */
  valor?: string;
  /** opcional: incluir o bloco. */
  incluido?: boolean;
  origem: string;
  /** `alta` ⇒ pré-confirmada; `baixa` ⇒ entra como pendente para o operador. */
  confianca: "alta" | "baixa";
}

/**
 * Uma regra recebe o contexto da paciente e as decisões JÁ tomadas (em ordem de
 * documento) — a `taxaAdmin51`, por exemplo, depende de a cláusula de exames ou
 * a de flexibilidade terem entrado.
 */
export type RegraInferencia = (
  ctx: ContextoDecisao,
  decisoes: Map<string, DecisaoRegiao>,
) => Sugestao;

const norm = (s: string) => (s ?? "").toLowerCase();

/** Registry: `data-inferir` do modelo → função pura. */
export const REGRAS_INFERENCIA: Record<string, RegraInferencia> = {
  /** Foro pela médica/clínica/local (Karla→SP; Lívia/Signorelli→Campinas). */
  foroPorMedica(ctx) {
    const alvo = `${norm(ctx.medica)} ${norm(ctx.clinica)} ${norm(ctx.local)} ${norm(ctx.localEndereco)}`;
    if (/(lanzoni|l[íi]via|signorelli|campinas)/.test(alvo)) {
      return {
        valor: "campinas",
        origem: `Médica/local: ${ctx.medica || ctx.local} → Comarca de Campinas`,
        confianca: "alta",
      };
    }
    return {
      valor: "sao-paulo",
      origem: `Médica/local: ${ctx.medica || "clínica principal"} → Comarca de São Paulo`,
      confianca: "alta",
    };
  },

  /** Cronograma: escalonado (sinal+saldo) vs. quitação integral à vista. */
  pagamentoParceladoVsVista(ctx) {
    return ctx.temSaldo
      ? {
          valor: "escalonado",
          origem: "Pagamento: há saldo em aberto → cronograma escalonado (sinal + saldo)",
          confianca: "alta",
        }
      : {
          valor: "vista",
          origem: "Pagamento: sem saldo em aberto → quitação integral à vista",
          confianca: "alta",
        };
  },

  /**
   * Cláusula 5.1 (taxa administrativa) — encadeada: se a cláusula de exames
   * entrou, a ressalva é de inaptidão clínica; se a de flexibilidade de saúde
   * entrou, é cancelamento definitivo por saúde; senão, sem ressalva (retida no
   * sinal). Sempre `baixa` — vale uma conferência humana explícita.
   */
  taxaAdmin51(_ctx, decisoes) {
    if (decisoes.get("exames")?.incluido) {
      return {
        valor: "inaptidao",
        origem: "Exames pré-operatórios incluídos → ressalva de inaptidão clínica (2.3.2)",
        confianca: "baixa",
      };
    }
    if (decisoes.get("flexReagendamento")?.incluido) {
      return {
        valor: "saude",
        origem: "Flexibilidade por saúde incluída → cancelamento definitivo por motivo de saúde",
        confianca: "baixa",
      };
    }
    return {
      valor: "sem-ressalva",
      origem: "Sem exames nem flexibilidade → sem ressalva, taxa retida no sinal",
      confianca: "baixa",
    };
  },

  /** Cláusula de exames pré-operatórios — cláusula de segurança padrão (on). */
  examesPadrao() {
    return {
      incluido: true,
      origem: "Cláusula de segurança padrão do procedimento",
      confianca: "alta",
    };
  },

  /** Flexibilidade de reagendamento — sem sinal comercial no cadastro (off). */
  flexPadraoOff() {
    return {
      incluido: false,
      origem: "Sem indicação de flexibilidade especial no cadastro",
      confianca: "alta",
    };
  },

  /** Desconto exclusivo personalíssimo — off por padrão (não há dado de deal). */
  descontoExclusivo() {
    return {
      incluido: false,
      origem: "Sem desconto extraordinário registrado no cadastro",
      confianca: "baixa",
    };
  },
};

// ===========================================================================
// Resolução do modelo
// ===========================================================================

const OPCOES_PARSE = { lowerCaseTagName: false, comment: false } as const;

/** Decisão já confirmada pelo operador para uma região (precedência). */
function decisaoPrevia(
  previas: DecisaoRegiao[] | undefined,
  id: string,
): DecisaoRegiao | undefined {
  return previas?.find((d) => d.id === id && d.confirmado);
}

/** Roda a regra de inferência nomeada (ou um default seguro se ausente). */
function inferir(
  nomeRegra: string | undefined,
  tipo: "variante" | "opcional",
  el: HTMLElement,
  ctx: ContextoDecisao,
  mapa: Map<string, DecisaoRegiao>,
): Sugestao {
  const regra = nomeRegra ? REGRAS_INFERENCIA[nomeRegra] : undefined;
  if (regra) return regra(ctx, mapa);
  // Sem regra: variante cai na 1ª opção; opcional respeita `data-padrao`.
  if (tipo === "variante") {
    const primeira = el.querySelector("[data-opcao]")?.getAttribute("data-valor");
    return {
      valor: primeira ?? "",
      origem: "Sem regra de inferência — primeira opção como padrão",
      confianca: "baixa",
    };
  }
  return {
    incluido: el.getAttribute("data-padrao") !== "off",
    origem: "Sem regra de inferência — padrão do modelo",
    confianca: "baixa",
  };
}

/**
 * Passo 1: decide cada região (variante/opcional) em ordem de documento,
 * combinando decisões prévias confirmadas (precedência) com a inferência.
 * Não muta o DOM — só lê atributos e acumula as decisões.
 */
function decidirRegioes(
  root: HTMLElement,
  ctx: ContextoDecisao,
  previas: DecisaoRegiao[] | undefined,
): { lista: DecisaoRegiao[]; mapa: Map<string, DecisaoRegiao> } {
  const lista: DecisaoRegiao[] = [];
  const mapa = new Map<string, DecisaoRegiao>();

  for (const el of root.querySelectorAll("[data-regiao]")) {
    const tipoAttr = el.getAttribute("data-regiao");
    if (tipoAttr !== "variante" && tipoAttr !== "opcional") continue;
    const id = el.getAttribute("data-id");
    if (!id) continue;
    const rotulo = el.getAttribute("data-rotulo") ?? id;
    const sug = inferir(el.getAttribute("data-inferir"), tipoAttr, el, ctx, mapa);
    const previa = decisaoPrevia(previas, id);

    let decisao: DecisaoRegiao;
    if (tipoAttr === "variante") {
      const inferido = sug.valor ?? "";
      const valor = previa?.valor ?? inferido;
      const opcoes = el.querySelectorAll("[data-opcao]").map((o) => ({
        valor: o.getAttribute("data-valor") ?? "",
        label: o.getAttribute("data-label") ?? o.getAttribute("data-valor") ?? "",
      }));
      decisao = {
        id,
        tipo: "variante",
        rotulo,
        valor,
        opcoes,
        inferido,
        confirmado: previa ? true : sug.confianca === "alta",
        editado: !!previa && previa.valor !== inferido,
        origem: sug.origem,
      };
    } else {
      const inferido = sug.incluido ?? false;
      const incluido = previa?.incluido ?? inferido;
      decisao = {
        id,
        tipo: "opcional",
        rotulo,
        incluido,
        inferido,
        confirmado: previa ? true : sug.confianca === "alta",
        editado: !!previa && previa.incluido !== inferido,
        origem: sug.origem,
      };
    }
    lista.push(decisao);
    mapa.set(id, decisao);
  }
  return { lista, mapa };
}

/**
 * Passo 2: aplica as decisões ao DOM. Re-consulta a árvore a cada iteração
 * (robusto a regiões aninhadas e a referências invalidadas por reparse):
 * variante → substitui o wrapper pelo conteúdo da opção escolhida; opcional
 * omitido → remove; opcional incluído → mantém, marcando o wrapper.
 */
function aplicarDecisoes(root: HTMLElement, mapa: Map<string, DecisaoRegiao>): void {
  for (let guarda = 0; guarda < 1000; guarda++) {
    const pendente = root
      .querySelectorAll("[data-regiao]")
      .find((el) => {
        const t = el.getAttribute("data-regiao");
        if (t === "variante") return !el.hasAttribute("data-decidido");
        if (t === "opcional") return !el.hasAttribute("data-incluido");
        return false;
      });
    if (!pendente) break;

    const tipo = pendente.getAttribute("data-regiao");
    const id = pendente.getAttribute("data-id") ?? "";
    const d = mapa.get(id);

    if (tipo === "variante") {
      const escolhida =
        pendente.querySelector(`[data-opcao][data-valor="${d?.valor}"]`) ??
        pendente.querySelector("[data-opcao]");
      const inner = escolhida?.innerHTML ?? "";
      pendente.setAttribute("data-decidido", d?.valor ?? "");
      pendente.setAttribute("data-editado", String(!!d?.editado));
      // Remove os marcadores de menu que não devem sobrar no documento.
      pendente.removeAttribute("data-inferir");
      pendente.set_content(inner);
    } else {
      if (d?.incluido) {
        pendente.setAttribute("data-incluido", "true");
        pendente.setAttribute("data-editado", String(!!d?.editado));
        pendente.removeAttribute("data-inferir");
      } else {
        pendente.remove();
      }
    }
  }
}

const ROMANOS = [
  "", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV",
];
function romano(n: number): string {
  return ROMANOS[n] ?? String(n);
}

/**
 * Passo 3: numeração hierárquica. Percorre os `<span data-num>` em ordem de
 * documento mantendo contadores (seção romana, cláusula, subitem, subsubitem) e
 * escreve o rótulo computado. Registra o 1º número de cada região (por
 * `data-id`) para resolver as referências cruzadas `<span data-ref>`.
 */
function renumerar(root: HTMLElement): void {
  let secao = 0;
  let clausula = 0;
  let sub = 0;
  let subsub = 0;
  const numeroDaRegiao = new Map<string, string>();

  for (const span of root.querySelectorAll("[data-num]")) {
    const nivel = span.getAttribute("data-num");
    let texto: string;
    if (nivel === "secao") {
      secao += 1;
      texto = romano(secao);
    } else if (nivel === "clausula") {
      clausula += 1;
      sub = 0;
      subsub = 0;
      texto = String(clausula);
    } else if (nivel === "sub") {
      sub += 1;
      subsub = 0;
      texto = `${clausula}.${sub}`;
    } else if (nivel === "subsub") {
      subsub += 1;
      texto = `${clausula}.${sub}.${subsub}`;
    } else {
      continue;
    }
    span.set_content(texto);

    // Primeiro número visto dentro de uma região nomeada → alvo de referência.
    const regiao = span.closest("[data-regiao][data-id]");
    const rid = regiao?.getAttribute("data-id");
    if (rid && !numeroDaRegiao.has(rid)) numeroDaRegiao.set(rid, texto);
  }

  for (const span of root.querySelectorAll("[data-ref]")) {
    const alvo = span.getAttribute("data-ref") ?? "";
    span.set_content(numeroDaRegiao.get(alvo) ?? "—");
  }
}

/** O corpo contém regiões tipadas ou numeração/gênero computados? */
export function contemRegioes(corpo: string): boolean {
  return (
    /data-regiao=|data-num=|data-ref=/.test(corpo ?? "") || usaGenero(corpo ?? "")
  );
}

export interface ResultadoResolucao {
  /** HTML resolvido (variantes podadas, opcionais aplicados, numeração pronta),
   *  com `{{variáveis}}` ainda intactas para o preenchimento posterior. */
  corpo: string;
  /** Snapshot das decisões (para persistir e alimentar a UI de confirmação). */
  decisoes: DecisaoRegiao[];
}

/**
 * Resolve o modelo para uma paciente: infere/aplica variantes e opcionais,
 * renumera e devolve o corpo + as decisões. Determinístico e idempotente para
 * corpos legados (sem marcadores): devolve o corpo intacto e nenhuma decisão.
 *
 * `decisoesPrevias` (as já confirmadas pelo operador) têm precedência sobre a
 * inferência — é o que sustenta o fluxo "auto-inferir + confirmar" ao regenerar.
 */
export function resolverModelo(
  modeloCorpo: string,
  p: Paciente,
  decisoesPrevias?: DecisaoRegiao[],
): ResultadoResolucao {
  const decisoes: DecisaoRegiao[] = [];

  // Gênero: decisão implícita (token, não região no DOM). Só entra quando o
  // corpo de fato usa concordância — assim modelos legados não ganham ruído.
  if (usaGenero(modeloCorpo)) {
    const inferido = inferirGenero(p.nome ?? "");
    const previa = decisaoPrevia(decisoesPrevias, "genero");
    const valor = (previa?.valor as Genero) ?? inferido;
    decisoes.push({
      id: "genero",
      tipo: "genero",
      rotulo: "Gênero da paciente",
      valor,
      opcoes: [
        { valor: "f", label: "Feminino" },
        { valor: "m", label: "Masculino" },
      ],
      inferido,
      confirmado: !!previa, // heurística de nome → sempre confirmar quando novo
      editado: !!previa && previa.valor !== inferido,
      origem: `Heurística pelo nome “${(p.nome ?? "").trim().split(/\s+/)[0] ?? ""}” — confirme`,
    });
  }

  if (!/data-regiao=|data-num=|data-ref=/.test(modeloCorpo ?? "")) {
    return { corpo: modeloCorpo, decisoes };
  }

  const root = parse(modeloCorpo, OPCOES_PARSE);
  const ctx = montarContextoDecisao(p);
  const { lista, mapa } = decidirRegioes(root, ctx, decisoesPrevias);
  aplicarDecisoes(root, mapa);
  renumerar(root);

  return { corpo: root.toString(), decisoes: [...decisoes, ...lista] };
}

/** Valor de gênero efetivo a partir das decisões (default: inferir do nome). */
export function generoDe(
  decisoes: DecisaoRegiao[] | undefined,
  nome: string,
): Genero {
  const d = decisoes?.find((x) => x.id === "genero");
  return (d?.valor as Genero) ?? inferirGenero(nome);
}
