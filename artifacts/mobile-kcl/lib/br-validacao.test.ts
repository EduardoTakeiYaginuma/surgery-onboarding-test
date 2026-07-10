import { describe, it, expect } from "vitest";
import { CASOS_CPF, CASOS_TELEFONE } from "@workspace/br-validacao";
import { isValidCpf, isValidTelefone } from "./format";

// Corpus compartilhado: o app (reexportando @workspace/br-validacao) precisa
// concordar com o mesmo conjunto de decisões que o Console e o api-server
// testam. Se alguém recriar uma cópia local divergente, ou mudar uma regra sem
// atualizar o corpus, este bloco falha.
describe("br-validacao: corpus compartilhado (mobile)", () => {
  it.each(CASOS_CPF)("isValidCpf($entrada) === $valido ($nota)", (caso) => {
    expect(isValidCpf(caso.entrada)).toBe(caso.valido);
  });

  it.each(CASOS_TELEFONE)(
    "isValidTelefone($entrada) === $valido ($nota)",
    (caso) => {
      expect(isValidTelefone(caso.entrada)).toBe(caso.valido);
    },
  );
});
