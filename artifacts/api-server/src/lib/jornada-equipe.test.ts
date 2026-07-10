import { describe, expect, it } from "vitest";

import {
  calcularJornadaEquipe,
  ehMarcoManual,
  MARCOS_JORNADA,
  MARCOS_MANUAIS,
  ROTULO_AGUARDANDO,
} from "./jornada-equipe";

/**
 * Derivação do funil interno da equipe (9 marcos). O 1º marco ("Contrato &
 * Pagamento") é paralelo e TRAVA o funil: enquanto o contrato não está assinado,
 * `marcoAtual` não passa dele, mesmo que link/termo/48h já valham. Depois do
 * contrato assinado, a posição é o marco de maior índice atingido.
 * `marcosConcluidos` lista cada marco cumprido de forma honesta. Datas usam um
 * `agora` explícito para serem determinísticas.
 */

type Sinais = Parameters<typeof calcularJornadaEquipe>[0];

// Longe da cirurgia (≈7 meses) → nenhum marco por data liga.
const AGORA_LONGE = new Date(2026, 0, 1);
const DATA_CIRURGIA = "2026-08-20";

function base(over: Partial<Sinais> = {}): Sinais {
  return {
    contratoStatus: "pendente",
    contratoAssinadoEm: null,
    valorSinal: "0",
    linkEnviadoEm: null,
    termoStatus: "pendente",
    termoAssinadoEm: null,
    dataCirurgia: DATA_CIRURGIA,
    retiradaPontosEm: null,
    retorno1Em: null,
    retorno2Em: null,
    retorno3Em: null,
    ...over,
  };
}

/** Base com o contrato já assinado (destrava o funil para testar os marcos seguintes). */
function assinado(over: Partial<Sinais> = {}): Sinais {
  return base({ contratoStatus: "assinado", ...over });
}

const CARIMBO = "2026-02-10T12:00:00.000Z";
// Versão Date para as colunas timestamptz tipadas como Date (as mais novas:
// link_enviado_em e os carimbos pós-op). As antigas (contrato/termo) são string.
const CARIMBO_D = new Date(CARIMBO);

describe("MARCOS_JORNADA (fonte única)", () => {
  it("tem 9 marcos, 5 automáticos e 4 manuais na ordem canônica", () => {
    expect(MARCOS_JORNADA).toHaveLength(9);
    expect(MARCOS_JORNADA.filter((m) => m.automatico)).toHaveLength(5);
    expect(MARCOS_JORNADA.filter((m) => !m.automatico)).toHaveLength(4);
    expect(MARCOS_JORNADA.map((m) => m.chave)).toEqual([
      "contrato_pagamento",
      "link_enviado",
      "termo_assinado",
      "menos_48h_cirurgia",
      "cirurgia",
      "retirada_pontos",
      "retorno_1",
      "retorno_2",
      "retorno_3",
    ]);
  });

  it("ehMarcoManual reconhece só os pós-operatórios", () => {
    for (const chave of MARCOS_MANUAIS) expect(ehMarcoManual(chave)).toBe(true);
    expect(ehMarcoManual("contrato_pagamento")).toBe(false);
    expect(ehMarcoManual("cirurgia")).toBe(false);
    expect(ehMarcoManual("inexistente")).toBe(false);
  });
});

describe("calcularJornadaEquipe — baseline", () => {
  it("sem nenhum sinal fica em 'Aguardando contrato' (índice 0, marcoAtual null)", () => {
    const j = calcularJornadaEquipe(base(), AGORA_LONGE);
    expect(j.marcoAtual).toBeNull();
    expect(j.marcoAtualIndice).toBe(0);
    expect(j.marcoAtualRotulo).toBe(ROTULO_AGUARDANDO);
    expect(j.marcosConcluidos).toEqual([]);
    expect(j.contratoAssinado).toBe(false);
    expect(j.pago).toBe(false);
  });
});

describe("calcularJornadaEquipe — 1º marco Contrato & Pagamento (paralelo + trava)", () => {
  it("contrato assinado conclui o 1º marco (índice 1)", () => {
    const j = calcularJornadaEquipe(base({ contratoStatus: "assinado" }), AGORA_LONGE);
    expect(j.marcoAtual).toBe("contrato_pagamento");
    expect(j.marcoAtualIndice).toBe(1);
    expect(j.marcoAtualRotulo).toBe("Contrato & Pagamento");
    expect(j.contratoAssinado).toBe(true);
    expect(j.marcosConcluidos).toContain("contrato_pagamento");
  });

  it("contrato via contratoAssinadoEm (status ainda não sincronizado)", () => {
    const j = calcularJornadaEquipe(base({ contratoAssinadoEm: CARIMBO }), AGORA_LONGE);
    expect(j.contratoAssinado).toBe(true);
    expect(j.marcoAtual).toBe("contrato_pagamento");
  });

  it("PAGAMENTO sozinho NÃO passa do 1º marco e não esconde o contrato pendente", () => {
    const j = calcularJornadaEquipe(base({ valorSinal: "1500.50" }), AGORA_LONGE);
    expect(j.pago).toBe(true);
    expect(j.contratoAssinado).toBe(false);
    // Fica em "Contrato & Pagamento" em andamento (não avança, não conclui).
    expect(j.marcoAtual).toBe("contrato_pagamento");
    expect(j.marcoAtualIndice).toBe(1);
    expect(j.marcosConcluidos).not.toContain("contrato_pagamento");
  });

  it("contrato assinado libera mesmo sem pagamento (pago é só sub-check)", () => {
    const j = calcularJornadaEquipe(
      assinado({ linkEnviadoEm: CARIMBO_D }),
      AGORA_LONGE,
    );
    expect(j.pago).toBe(false);
    expect(j.contratoAssinado).toBe(true);
    expect(j.marcoAtual).toBe("link_enviado");
    expect(j.marcoAtualIndice).toBe(2);
  });
});

describe("calcularJornadaEquipe — TRAVA: nada avança sem contrato assinado", () => {
  it("link enviado sem contrato fica preso no 1º marco e NÃO pinta nada adiante", () => {
    const j = calcularJornadaEquipe(base({ linkEnviadoEm: CARIMBO_D }), AGORA_LONGE);
    expect(j.marcoAtual).toBe("contrato_pagamento");
    expect(j.marcoAtualIndice).toBe(1);
    // A trava limita o que pinta: o sinal cru do link NÃO conta como concluído.
    expect(j.marcosConcluidos).not.toContain("link_enviado");
    expect(j.marcosConcluidos).not.toContain("contrato_pagamento");
    expect(j.marcosConcluidos).toEqual([]);
  });

  it("termo assinado sem contrato também fica preso no 1º marco (nada pintado adiante)", () => {
    const j = calcularJornadaEquipe(base({ termoStatus: "assinado" }), AGORA_LONGE);
    expect(j.marcoAtual).toBe("contrato_pagamento");
    expect(j.marcoAtualIndice).toBe(1);
    expect(j.marcosConcluidos).toEqual([]);
  });

  it("dia da cirurgia sem contrato fica preso no 1º marco (cirurgia não pinta)", () => {
    const j = calcularJornadaEquipe(base(), new Date(2026, 7, 20)); // 0 dias
    expect(j.marcoAtual).toBe("contrato_pagamento");
    expect(j.marcoAtualIndice).toBe(1);
    expect(j.marcosConcluidos).not.toContain("cirurgia");
    expect(j.marcosConcluidos).toEqual([]);
  });
});

describe("calcularJornadaEquipe — marcos automáticos (contrato já assinado)", () => {
  it("termo_assinado via status ou carimbo", () => {
    expect(
      calcularJornadaEquipe(assinado({ termoStatus: "assinado" }), AGORA_LONGE).marcoAtual,
    ).toBe("termo_assinado");
    expect(
      calcularJornadaEquipe(assinado({ termoAssinadoEm: CARIMBO }), AGORA_LONGE).marcoAtual,
    ).toBe("termo_assinado");
  });

  it("menos_48h_cirurgia liga em 1 e 2 dias, não em 3", () => {
    expect(calcularJornadaEquipe(assinado(), new Date(2026, 7, 18)).marcoAtual).toBe("menos_48h_cirurgia"); // 2 dias
    expect(calcularJornadaEquipe(assinado(), new Date(2026, 7, 19)).marcoAtual).toBe("menos_48h_cirurgia"); // 1 dia
    // 3 dias: nenhum marco por data; só o contrato concluído.
    expect(calcularJornadaEquipe(assinado(), new Date(2026, 7, 17)).marcoAtual).toBe("contrato_pagamento");
  });

  it("cirurgia liga no dia (0) e depois (<0); menos_48h não conta no dia", () => {
    const noDia = calcularJornadaEquipe(assinado(), new Date(2026, 7, 20)); // 0 dias
    expect(noDia.marcoAtual).toBe("cirurgia");
    expect(noDia.marcoAtualIndice).toBe(5);

    const depois = calcularJornadaEquipe(assinado(), new Date(2026, 7, 21)); // -1 dia
    expect(depois.marcoAtual).toBe("cirurgia");
  });

  it("sem data de cirurgia nenhum marco por data liga", () => {
    const j = calcularJornadaEquipe(assinado({ dataCirurgia: "" }), new Date(2026, 7, 20));
    expect(j.marcosConcluidos).not.toContain("menos_48h_cirurgia");
    expect(j.marcosConcluidos).not.toContain("cirurgia");
  });
});

describe("calcularJornadaEquipe — marcos manuais (pós-op)", () => {
  it("retirada_pontos pelo carimbo (índice 6)", () => {
    const j = calcularJornadaEquipe(assinado({ retiradaPontosEm: CARIMBO_D }), AGORA_LONGE);
    expect(j.marcoAtual).toBe("retirada_pontos");
    expect(j.marcoAtualIndice).toBe(6);
  });

  it("retorno_3 é o último marco (índice 9)", () => {
    const j = calcularJornadaEquipe(assinado({ retorno3Em: CARIMBO_D }), AGORA_LONGE);
    expect(j.marcoAtual).toBe("retorno_3");
    expect(j.marcoAtualIndice).toBe(9);
    expect(j.marcoAtualRotulo).toBe("3º retorno");
  });
});

describe("calcularJornadaEquipe — posição = maior marco atingido (com contrato)", () => {
  it("com lacunas, marcoAtual é o de maior índice e marcosConcluidos lista só os cumpridos", () => {
    const j = calcularJornadaEquipe(
      assinado({ retorno3Em: CARIMBO_D }),
      AGORA_LONGE,
    );
    expect(j.marcoAtual).toBe("retorno_3");
    expect(j.marcoAtualIndice).toBe(9);
    expect(j.marcosConcluidos).toEqual(["contrato_pagamento", "retorno_3"]);
  });

  it("processo completo conclui os 8 marcos aplicáveis (todos menos menos_48h)", () => {
    const j = calcularJornadaEquipe(
      assinado({
        valorSinal: "1000",
        linkEnviadoEm: CARIMBO_D,
        termoStatus: "assinado",
        retiradaPontosEm: CARIMBO_D,
        retorno1Em: CARIMBO_D,
        retorno2Em: CARIMBO_D,
        retorno3Em: CARIMBO_D,
      }),
      new Date(2026, 7, 21), // cirurgia já passou → cirurgia liga; menos_48h não
    );
    expect(j.marcoAtual).toBe("retorno_3");
    expect(j.marcoAtualIndice).toBe(9);
    expect(j.contratoAssinado).toBe(true);
    expect(j.pago).toBe(true);
    expect(j.marcosConcluidos).toHaveLength(8); // todos menos menos_48h_cirurgia
    expect(j.marcosConcluidos).not.toContain("menos_48h_cirurgia");
  });
});
