import { describe, it, expect } from "vitest";
import { etapaAtual, contagemRegressiva } from "./patient-tools";

describe("etapaAtual", () => {
  it("acima de 10 dias → reserva confirmada (0)", () => {
    expect(etapaAtual(30)).toBe(0);
    expect(etapaAtual(11)).toBe(0);
  });

  it("exatamente 10 dias → 7-10 dias antes (1)", () => {
    expect(etapaAtual(10)).toBe(1);
  });

  it("entre 10 e 2 dias → 7-10 dias antes (1)", () => {
    expect(etapaAtual(7)).toBe(1);
    expect(etapaAtual(2)).toBe(1);
  });

  it("véspera (1 dia) → véspera (2)", () => {
    expect(etapaAtual(1)).toBe(2);
  });

  it("dia da cirurgia (0) → dia da cirurgia (3)", () => {
    expect(etapaAtual(0)).toBe(3);
  });

  it("dias negativos → pós-operatório (4)", () => {
    expect(etapaAtual(-1)).toBe(4);
    expect(etapaAtual(-30)).toBe(4);
  });
});

describe("contagemRegressiva", () => {
  it("dias negativos → procedimento realizado", () => {
    expect(contagemRegressiva(-1)).toBe("Procedimento realizado");
    expect(contagemRegressiva(-10)).toBe("Procedimento realizado");
  });

  it("dia 0 → é hoje", () => {
    expect(contagemRegressiva(0)).toBe("É hoje");
  });

  it("1 dia → é amanhã", () => {
    expect(contagemRegressiva(1)).toBe("É amanhã");
  });

  it("muitos dias → faltam N dias", () => {
    expect(contagemRegressiva(2)).toBe("Faltam 2 dias");
    expect(contagemRegressiva(30)).toBe("Faltam 30 dias");
  });
});

describe("etapaAtual e contagemRegressiva concordam nas fronteiras", () => {
  it("o dia da cirurgia (0) nunca soa como pós-operatório", () => {
    expect(etapaAtual(0)).toBe(3);
    expect(contagemRegressiva(0)).toBe("É hoje");
  });

  it("o primeiro dia de pós (-1) bate com a etapa pós-operatória", () => {
    expect(etapaAtual(-1)).toBe(4);
    expect(contagemRegressiva(-1)).toBe("Procedimento realizado");
  });
});
