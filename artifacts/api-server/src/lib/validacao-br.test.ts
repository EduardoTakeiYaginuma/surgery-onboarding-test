import { describe, it, expect } from "vitest";
import { CASOS_CPF, CASOS_TELEFONE } from "@workspace/br-validacao";
import { cpfValido, telefoneValido } from "./validacao-br";

// Corpus compartilhado: o api-server (reexportando @workspace/br-validacao)
// precisa concordar com o mesmo conjunto de decisões que o Console e o app
// testam. Se alguém recriar uma cópia local divergente, ou mudar uma regra sem
// atualizar o corpus, este bloco falha — garantindo que dados gravados via API
// direta sigam exatamente as mesmas regras da interface.
describe("br-validacao: corpus compartilhado (api-server)", () => {
  it.each(CASOS_CPF)("cpfValido($entrada) === $valido ($nota)", (caso) => {
    expect(cpfValido(caso.entrada)).toBe(caso.valido);
  });

  it.each(CASOS_TELEFONE)(
    "telefoneValido($entrada) === $valido ($nota)",
    (caso) => {
      expect(telefoneValido(caso.entrada)).toBe(caso.valido);
    },
  );
});
