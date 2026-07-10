import type { Paciente } from "@workspace/db";

/**
 * Jornada da equipe (funil interno do Console) — 9 marcos ordenados, do
 * "Contrato & Pagamento" ao 3º retorno pós-operatório. Esta é a FONTE ÚNICA de
 * ordem, rótulos e de quais marcos são automáticos (derivados dos sinais já
 * existentes do processo) vs. manuais (a equipe marca/desmarca no pós-op). Os
 * frontends devem ler isto via GET /config → jornadaEquipe, nunca hardcodar.
 *
 * O 1º marco é ÚNICO e PARALELO: contrato e pagamento são enviados juntos ao
 * paciente e podem chegar em qualquer ordem. O funil só AVANÇA além dele quando
 * o contrato está assinado por TODAS as partes (`contratoStatus === "assinado"`);
 * o pagamento é um sub-check informativo e NÃO trava o avanço. Ver `contratoAssinado`
 * / `pago` em JornadaEquipe para o estado de cada sub-check.
 *
 * IMPORTANTE: nada aqui mexe na jornada PÚBLICA da paciente ("Sua jornada");
 * este é só o funil interno da equipe. O `estagio` legado continua no banco,
 * mas nenhuma UI de equipe o usa mais para o funil.
 */
export type MarcoJornada =
  | "contrato_pagamento"
  | "link_enviado"
  | "termo_assinado"
  | "menos_48h_cirurgia"
  | "cirurgia"
  | "retirada_pontos"
  | "retorno_1"
  | "retorno_2"
  | "retorno_3";

export interface MarcoJornadaInfo {
  chave: MarcoJornada;
  rotulo: string;
  automatico: boolean;
}

/** Ordem canônica dos marcos. A posição (1-based) define o lugar no funil. */
export const MARCOS_JORNADA: readonly MarcoJornadaInfo[] = [
  {
    chave: "contrato_pagamento",
    rotulo: "Contrato & Pagamento",
    automatico: true,
  },
  { chave: "link_enviado", rotulo: "Link enviado", automatico: true },
  { chave: "termo_assinado", rotulo: "Termo assinado", automatico: true },
  {
    chave: "menos_48h_cirurgia",
    rotulo: "Menos de 48h da cirurgia",
    automatico: true,
  },
  { chave: "cirurgia", rotulo: "Cirurgia", automatico: true },
  { chave: "retirada_pontos", rotulo: "Retirada de pontos", automatico: false },
  { chave: "retorno_1", rotulo: "1º retorno", automatico: false },
  { chave: "retorno_2", rotulo: "2º retorno", automatico: false },
  { chave: "retorno_3", rotulo: "3º retorno", automatico: false },
] as const;

/** Rótulo do baseline (nenhum marco atingido) — não é um 11º marco. */
export const ROTULO_AGUARDANDO = "Aguardando contrato";

/** Marcos que a equipe marca/desmarca manualmente (pós-operatório). */
export const MARCOS_MANUAIS = [
  "retirada_pontos",
  "retorno_1",
  "retorno_2",
  "retorno_3",
] as const satisfies readonly MarcoJornada[];

export type MarcoManual = (typeof MARCOS_MANUAIS)[number];

export function ehMarcoManual(v: string): v is MarcoManual {
  return (MARCOS_MANUAIS as readonly string[]).includes(v);
}

export interface JornadaEquipe {
  marcoAtual: MarcoJornada | null;
  marcoAtualRotulo: string;
  /** 0 = baseline (aguardando contrato); 1..9 = posição do marco atingido. */
  marcoAtualIndice: number;
  marcosConcluidos: MarcoJornada[];
  /**
   * Sub-checks do 1º marco ("Contrato & Pagamento"), expostos separadamente
   * porque são paralelos: a UI mostra cada um, e só `contratoAssinado` libera o
   * avanço do funil (o `pago` é informativo).
   */
  contratoAssinado: boolean;
  pago: boolean;
}

/**
 * Dias inteiros entre hoje e a data da cirurgia (YYYY-MM-DD), no horário local
 * do servidor. >0 = faltam N dias; 0 = hoje; <0 = já passou. null sem data.
 */
function diasAteCirurgia(
  dataCirurgia: string | null,
  agora: Date,
): number | null {
  if (!dataCirurgia) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataCirurgia);
  if (!m) return null;
  const alvo = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const MS_DIA = 24 * 60 * 60 * 1000;
  return Math.round((alvo.getTime() - hoje.getTime()) / MS_DIA);
}

type SinaisPaciente = Pick<
  Paciente,
  | "contratoStatus"
  | "contratoAssinadoEm"
  | "valorSinal"
  | "linkEnviadoEm"
  | "termoStatus"
  | "termoAssinadoEm"
  | "dataCirurgia"
  | "retiradaPontosEm"
  | "retorno1Em"
  | "retorno2Em"
  | "retorno3Em"
>;

/**
 * Deriva a posição do funil a partir dos sinais já persistidos do processo.
 *
 * `contratoAssinado`/`pago` = sub-checks do 1º marco (paralelos).
 * `marcosConcluidos` = todos os marcos individualmente cumpridos (para um render
 * honesto de cada nó, já que marcos automáticos podem ficar "em falha" — ex.: o
 * link é enviado antes do contrato assinar).
 * `marcoAtual` = o marco de MAIOR índice cumprido, com a TRAVA: enquanto o
 * contrato não estiver assinado por todas as partes, o funil NÃO passa do 1º
 * marco ("Contrato & Pagamento"), mesmo que link/termo/48h já valham. Assim o
 * contrato pendente nunca some atrás de um sinal posterior.
 */
export function calcularJornadaEquipe(
  p: SinaisPaciente,
  agora: Date = new Date(),
): JornadaEquipe {
  const dias = diasAteCirurgia(p.dataCirurgia, agora);
  const contratoAssinado =
    p.contratoStatus === "assinado" || p.contratoAssinadoEm != null;
  const pago = Number(p.valorSinal) > 0;
  const condicoes: Record<MarcoJornada, boolean> = {
    // 1º marco conclui só com o contrato assinado (o pagamento é sub-check).
    contrato_pagamento: contratoAssinado,
    link_enviado: p.linkEnviadoEm != null,
    termo_assinado: p.termoStatus === "assinado" || p.termoAssinadoEm != null,
    menos_48h_cirurgia: dias != null && dias > 0 && dias <= 2,
    cirurgia: dias != null && dias <= 0,
    retirada_pontos: p.retiradaPontosEm != null,
    retorno_1: p.retorno1Em != null,
    retorno_2: p.retorno2Em != null,
    retorno_3: p.retorno3Em != null,
  };

  let marcoAtualIndice: number;
  if (contratoAssinado) {
    // Contrato ok: marco atual = maior índice cumprido.
    marcoAtualIndice = MARCOS_JORNADA.reduce(
      (acc, m, i) => (condicoes[m.chave] ? i + 1 : acc),
      0,
    );
  } else {
    // Trava: preso no 1º marco. Mostra "Contrato & Pagamento" em andamento se
    // já houve QUALQUER sinal (pagamento ou algo adiante); senão baseline.
    const algumSinal = pago || Object.values(condicoes).some(Boolean);
    marcoAtualIndice = algumSinal ? 1 : 0;
  }
  const marcoAtual =
    marcoAtualIndice > 0 ? MARCOS_JORNADA[marcoAtualIndice - 1].chave : null;

  // marcosConcluidos respeita a TRAVA: só pinta o que está ATÉ a posição atual do
  // funil. Um sinal cru que exista fora de ordem (ex.: link enviado antes de o
  // contrato assinar) NÃO conta como concluído — senão a barra pinta um marco
  // adiante da fase real. Depois do contrato assinado, `marcoAtualIndice` é o
  // maior índice cumprido, então lacunas legítimas (ex.: cirurgia sem termo)
  // seguem visíveis.
  const marcosConcluidos = MARCOS_JORNADA.filter(
    (m, i) => condicoes[m.chave] && i + 1 <= marcoAtualIndice,
  ).map((m) => m.chave);

  return {
    marcoAtual,
    marcoAtualRotulo:
      marcoAtualIndice > 0
        ? MARCOS_JORNADA[marcoAtualIndice - 1].rotulo
        : ROTULO_AGUARDANDO,
    marcoAtualIndice,
    marcosConcluidos,
    contratoAssinado,
    pago,
  };
}
