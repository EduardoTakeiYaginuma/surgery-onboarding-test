import { describe, it, expect } from "vitest";
import { CASOS_CPF, CASOS_TELEFONE } from "@workspace/br-validacao";
import {
  contatoTelefoneIncompleto,
  validarTelefone,
  validarCpf,
} from "./br-validacao";

// Corpus compartilhado: o Console (reexportando @workspace/br-validacao) precisa
// concordar com o mesmo conjunto de decisões que o app e o api-server testam.
// Se alguém recriar uma cópia local divergente, ou mudar uma regra sem atualizar
// o corpus, este bloco falha.
describe("br-validacao: corpus compartilhado (Console)", () => {
  it.each(CASOS_CPF)("validarCpf($entrada) === $valido ($nota)", (caso) => {
    expect(validarCpf(caso.entrada)).toBe(caso.valido);
  });

  it.each(CASOS_TELEFONE)(
    "validarTelefone($entrada) === $valido ($nota)",
    (caso) => {
      expect(validarTelefone(caso.entrada)).toBe(caso.valido);
    },
  );
});

describe("contatoTelefoneIncompleto", () => {
  it("nunca avisa para tokens de template (resolvem em runtime)", () => {
    expect(
      contatoTelefoneIncompleto({
        rotulo: "WhatsApp",
        valor: "{{equipeTelefone}}",
      }),
    ).toBe(false);
  });

  it("avisa para valor vazio com rótulo que indica telefone", () => {
    expect(
      contatoTelefoneIncompleto({ rotulo: "WhatsApp", valor: "" }),
    ).toBe(true);
  });

  it("não avisa para valor vazio com rótulo que não é telefone", () => {
    expect(
      contatoTelefoneIncompleto({ rotulo: "Endereço", valor: "" }),
    ).toBe(false);
  });

  it("ignora endereços (não parecem telefone)", () => {
    expect(
      contatoTelefoneIncompleto({
        rotulo: "Endereço",
        valor: "Rua das Flores, 123",
      }),
    ).toBe(false);
  });

  it("ignora e-mails (não parecem telefone)", () => {
    expect(
      contatoTelefoneIncompleto({
        rotulo: "Contato",
        valor: "contato@exemplo.com",
      }),
    ).toBe(false);
  });

  it("avisa para número incompleto que parece telefone", () => {
    expect(
      contatoTelefoneIncompleto({ rotulo: "WhatsApp", valor: "1199" }),
    ).toBe(true);
  });

  it("não avisa para número de celular BR válido", () => {
    expect(
      contatoTelefoneIncompleto({
        rotulo: "WhatsApp",
        valor: "(11) 99999-9999",
      }),
    ).toBe(false);
  });
});

describe("validarTelefone", () => {
  it("aceita fixo com 10 dígitos e DDD válido", () => {
    expect(validarTelefone("1133334444")).toBe(true);
  });

  it("aceita celular com 11 dígitos e 9 como terceiro dígito", () => {
    expect(validarTelefone("11999998888")).toBe(true);
  });

  it("rejeita números com menos de 10 dígitos", () => {
    expect(validarTelefone("119999")).toBe(false);
  });

  it("rejeita números com mais de 11 dígitos", () => {
    expect(validarTelefone("119999988887")).toBe(false);
  });

  it("rejeita DDD menor que 11", () => {
    expect(validarTelefone("1099998888")).toBe(false);
  });

  it("rejeita 11 dígitos sem o 9 como terceiro dígito", () => {
    expect(validarTelefone("11899998888")).toBe(false);
  });

  it("aceita valor com máscara de formatação", () => {
    expect(validarTelefone("(11) 99999-8888")).toBe(true);
  });
});

describe("validarCpf", () => {
  it("aceita um CPF válido", () => {
    expect(validarCpf("529.982.247-25")).toBe(true);
  });

  it("rejeita CPF com dígito verificador incorreto", () => {
    expect(validarCpf("529.982.247-24")).toBe(false);
  });

  it("rejeita CPF com sequência de dígitos repetidos", () => {
    expect(validarCpf("111.111.111-11")).toBe(false);
  });

  it("rejeita CPF com quantidade de dígitos errada", () => {
    expect(validarCpf("529.982.247-2")).toBe(false);
  });
});
