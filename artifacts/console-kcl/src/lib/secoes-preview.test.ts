import { describe, it, expect } from "vitest";
import {
  CHAVES_VARIAVEIS,
  VARIAVEIS_DISPONIVEIS,
  CAMPOS_IDENTIDADE_MEDICA,
  iniciaisMedica,
} from "@workspace/secoes";
import {
  DADOS_PREVIEW_EXEMPLO,
  montarContexto,
  identidadeDePreview,
} from "./secoes-preview";

/**
 * Guarda contra deriva entre a prévia do Console, a do app móvel e a página
 * pública. O contexto de variáveis (`{{...}}`) é montado por uma fonte única
 * (`montarContextoCompleto` em `@workspace/secoes`), à qual o `montarContexto`
 * do Console delega. Se alguém acrescentar uma variável no catálogo sem
 * propagar — ou montar um contexto fora do catálogo — estes testes falham.
 */
describe("montarContexto (Console) — sem deriva", () => {
  it("resolve exatamente as chaves do catálogo — nem a mais, nem a menos", () => {
    const chaves = Object.keys(montarContexto(DADOS_PREVIEW_EXEMPLO)).sort();
    expect(chaves).toEqual([...CHAVES_VARIAVEIS].sort());
  });

  it("toda chave anunciada produz um valor não vazio para o exemplo padrão", () => {
    const ctx = montarContexto(DADOS_PREVIEW_EXEMPLO);
    for (const chave of CHAVES_VARIAVEIS) {
      expect(ctx[chave]).toBeTruthy();
    }
  });
});

describe("cabeçalho de identidade da médica (Console) — sem deriva", () => {
  it("a prévia projeta exatamente os campos do catálogo do cabeçalho", () => {
    // O cabeçalho (foto/logo/clínica/médica/CRM/RQE) é renderizado à mão, fora
    // do motor de `{{...}}`, então a prévia e a página pública derivavam em
    // silêncio. `identidadeDePreview` projeta no contrato único
    // (`IdentidadeMedica`); aqui garantimos que produz exatamente as chaves do
    // catálogo. O lado do api-server faz a asserção espelhada contra o MESMO
    // catálogo, provando a equivalência por transitividade.
    const chaves = Object.keys(
      identidadeDePreview(DADOS_PREVIEW_EXEMPLO),
    ).sort();
    expect(chaves).toEqual([...CAMPOS_IDENTIDADE_MEDICA].sort());
  });

  it("deriva as iniciais da médica (fonte única) removendo o prefixo Dr./Dra.", () => {
    expect(iniciaisMedica("Dra. Karla Caetano Lobo")).toBe("KCL");
    expect(iniciaisMedica("Dr. Ana Paula Souza")).toBe("APS");
    expect(iniciaisMedica("Dra.")).toBe("KCL");
  });
});

describe('chips "Variáveis disponíveis" (Console) derivam do catálogo', () => {
  it("um chip por variável do catálogo, na mesma ordem", () => {
    // Espelha a derivação do editor (`secoes-editor.tsx`): o chip não deve ser
    // declarado localmente, senão uma variável nova fica de fora da lista.
    const tokens = VARIAVEIS_DISPONIVEIS.map((v) => `{{${v.chave}}}`);
    const esperado = CHAVES_VARIAVEIS.map((c) => `{{${c}}}`);
    expect(tokens).toEqual(esperado);
  });
});
