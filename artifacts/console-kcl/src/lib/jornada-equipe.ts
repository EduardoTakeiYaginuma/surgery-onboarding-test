/**
 * Apoio de UI para a jornada interna da equipe (9 marcos). A ORDEM, os RÓTULOS
 * e quais marcos são manuais vêm SEMPRE do servidor (GET /config → jornadaEquipe
 * e GET /pacientes/resumo → porMarco). Aqui ficam só os enfeites que não cabem
 * na API: a cor do badge por fase e os textos de ajuda de cada marco.
 *
 * O 1º marco ("Contrato & Pagamento") é paralelo: contrato e pagamento chegam em
 * qualquer ordem e a UI mostra os dois sub-checks. O funil só passa dele quando o
 * contrato está assinado por todas as partes (o pagamento é informativo).
 *
 * NÃO tem relação com a "Sua jornada" da página pública da paciente.
 */

/** Rótulo do baseline (nenhum marco atingido ainda). */
export const AGUARDANDO_CONTRATO_ROTULO = "Aguardando contrato";

/** Chave usada para indexar a ajuda do baseline. */
export const MARCO_BASELINE = "__baseline__";

/** Chaves dos marcos pós-operatórios (registrados manualmente pela equipe). */
export const MARCOS_MANUAIS = [
  "retirada_pontos",
  "retorno_1",
  "retorno_2",
  "retorno_3",
] as const;

export type MarcoManual = (typeof MARCOS_MANUAIS)[number];

export function ehMarcoManual(chave: string): chave is MarcoManual {
  return (MARCOS_MANUAIS as readonly string[]).includes(chave);
}

/** Classe Tailwind do badge conforme a fase do marco atual. */
export function corDoMarco(chave: string | null | undefined): string {
  switch (chave) {
    case "contrato_pagamento":
    case "link_enviado":
    case "termo_assinado":
      return "bg-card text-accent border-accent/30";
    case "menos_48h_cirurgia":
      return "bg-accent/20 text-accent border-accent/50";
    case "cirurgia":
      return "bg-primary text-primary-foreground border-primary";
    case "retirada_pontos":
    case "retorno_1":
    case "retorno_2":
    case "retorno_3":
      return "bg-card text-foreground border-accent/40";
    default:
      // baseline "Aguardando contrato"
      return "bg-card text-muted-foreground border-muted-foreground/30";
  }
}

/** Rótulo do marco atual, com fallback para o baseline. */
export function rotuloDoMarco(rotulo: string | null | undefined): string {
  return rotulo ?? AGUARDANDO_CONTRATO_ROTULO;
}

/** Ajuda em linguagem simples de cada marco (e do baseline), para tooltips. */
export const MARCOS_AJUDA: Record<string, { resumo: string; detalhe: string }> = {
  [MARCO_BASELINE]: {
    resumo: "Aguardando contrato",
    detalhe:
      "A paciente foi cadastrada, mas ainda não atingiu nenhum marco. O primeiro é Contrato & Pagamento.",
  },
  contrato_pagamento: {
    resumo: "Contrato & Pagamento",
    detalhe:
      "Contrato e link de pagamento são enviados juntos e podem chegar em qualquer ordem. O funil só avança quando o contrato está assinado por todas as partes; o pagamento é acompanhado à parte.",
  },
  link_enviado: {
    resumo: "Link entregue à paciente",
    detalhe:
      "O handoff foi aprovado e o link da paciente já pode ser enviado. Acompanhe até a cirurgia.",
  },
  termo_assinado: {
    resumo: "Termo assinado",
    detalhe: "O termo de consentimento (TCLE) foi assinado.",
  },
  menos_48h_cirurgia: {
    resumo: "Menos de 48h da cirurgia",
    detalhe:
      "Faltam até dois dias para a cirurgia. Confirme com a paciente os preparos e o horário de chegada.",
  },
  cirurgia: {
    resumo: "Dia da cirurgia",
    detalhe:
      "É hoje (ou já passou). A paciente está em preparo ou já realizou o procedimento.",
  },
  retirada_pontos: {
    resumo: "Retirada de pontos",
    detalhe: "Marco pós-operatório registrado manualmente pela equipe.",
  },
  retorno_1: {
    resumo: "1º retorno",
    detalhe: "Primeiro retorno pós-operatório, registrado manualmente.",
  },
  retorno_2: {
    resumo: "2º retorno",
    detalhe: "Segundo retorno pós-operatório, registrado manualmente.",
  },
  retorno_3: {
    resumo: "3º retorno",
    detalhe: "Terceiro retorno pós-operatório, registrado manualmente.",
  },
};

/** Ajuda de um marco (ou do baseline quando `chave` é nula). */
export function ajudaDoMarco(
  chave: string | null | undefined,
): { resumo: string; detalhe: string } {
  return MARCOS_AJUDA[chave ?? MARCO_BASELINE] ?? MARCOS_AJUDA[MARCO_BASELINE]!;
}
