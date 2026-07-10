import { describe, it, expect } from "vitest";
import { CAMPOS_IDENTIDADE_MEDICA, CHAVES_VARIAVEIS } from "@workspace/secoes";
import type { Medico, Paciente } from "@workspace/api-client-react";
import {
  IDENTIDADE_PREVIEW_EXEMPLO,
  identidadeDaPaciente,
  identidadeDoMedico,
  montarContexto,
  VARIAVEIS_PREVIEW,
  type DadosPreview,
} from "./secoes-preview";

/**
 * Guarda contra deriva entre a prévia do app móvel, a do Console e a página
 * pública. O contexto de variáveis (`{{...}}`) é montado por uma fonte única
 * (`montarContextoCompleto` em `@workspace/secoes`), à qual o `montarContexto`
 * do app delega; os chips derivam de `VARIAVEIS_DISPONIVEIS`. Se alguém
 * acrescentar uma variável no catálogo sem propagar, estes testes falham.
 */

const DADOS: DadosPreview = {
  nome: "Maria Silva",
  dataCirurgia: "2026-08-20",
  horario: "06:00",
  hospital: "Avant Moema Day Hospital",
  local: "Avant Moema Day Hospital — Av. Copacabana, 112",
  medica: "Dra. Karla Caetano Lobo",
  equipe: "Zenicare",
  equipeTelefone: "(11) 95080-2525",
  instrucoesChegada: "Confirme a janela de chegada (2h ou 3h antes).",
  valorPago: 3400,
  valorPendente: 0,
  dataPagamentoPendente: null,
};

describe("montarContexto (app móvel) — sem deriva", () => {
  it("resolve exatamente as chaves do catálogo — nem a mais, nem a menos", () => {
    const chaves = Object.keys(montarContexto(DADOS)).sort();
    expect(chaves).toEqual([...CHAVES_VARIAVEIS].sort());
  });

  it("toda chave anunciada produz um valor não vazio", () => {
    const ctx = montarContexto(DADOS);
    for (const chave of CHAVES_VARIAVEIS) {
      expect(ctx[chave]).toBeTruthy();
    }
  });
});

describe('chips "Variáveis disponíveis" (app móvel) derivam do catálogo', () => {
  it("um chip por variável do catálogo, na mesma ordem", () => {
    const tokens = VARIAVEIS_PREVIEW.map((v) => v.token);
    const esperado = CHAVES_VARIAVEIS.map((c) => `{{${c}}}`);
    expect(tokens).toEqual(esperado);
  });
});

/**
 * Guarda contra deriva no cabeçalho de identidade (foto/logo, clínica, nome,
 * CRM/RQE) entre a prévia do app móvel, a do Console e a página pública. O
 * CONJUNTO de campos é a fonte única `CAMPOS_IDENTIDADE_MEDICA`; os helpers do
 * app projetam exatamente essas chaves. Se alguém acrescentar um campo de
 * identidade sem propagar, estes testes falham.
 */
describe("identidade do cabeçalho (app móvel) — sem deriva", () => {
  const paciente = {
    medica: "Dra. Ana Souza",
    crm: "111111",
    rqe: "22222",
    clinica: "Clínica Souza",
    medicoId: 7,
  } as Paciente;

  const medico = {
    id: 7,
    nome: "Dra. Ana Souza",
    crm: "111111",
    rqe: "22222",
    clinica: "Clínica Souza",
    fotoUrl: "https://exemplo/foto.png",
    logoUrl: "https://exemplo/logo.png",
  } as Medico;

  it("identidadeDaPaciente projeta exatamente os campos do catálogo", () => {
    const chaves = Object.keys(identidadeDaPaciente(paciente, medico)).sort();
    expect(chaves).toEqual([...CAMPOS_IDENTIDADE_MEDICA].sort());
  });

  it("identidadeDoMedico projeta exatamente os campos do catálogo", () => {
    const chaves = Object.keys(identidadeDoMedico(medico)).sort();
    expect(chaves).toEqual([...CAMPOS_IDENTIDADE_MEDICA].sort());
  });

  it("identidadeDaPaciente: texto vem da paciente; foto/logo vêm do médico", () => {
    expect(identidadeDaPaciente(paciente, medico)).toEqual({
      medica: "Dra. Ana Souza",
      crm: "111111",
      rqe: "22222",
      clinica: "Clínica Souza",
      medicoFotoUrl: "https://exemplo/foto.png",
      medicoLogoUrl: "https://exemplo/logo.png",
    });
  });

  it("identidadeDaPaciente sem médico zera só as URLs (cai nos fallbacks)", () => {
    const id = identidadeDaPaciente(paciente);
    expect(id.medicoFotoUrl).toBeNull();
    expect(id.medicoLogoUrl).toBeNull();
    expect(id.medica).toBe("Dra. Ana Souza");
  });

  it("identidadeDoMedico sem médico cai no exemplo", () => {
    expect(identidadeDoMedico()).toEqual(IDENTIDADE_PREVIEW_EXEMPLO);
    expect(identidadeDoMedico(undefined)).toEqual(IDENTIDADE_PREVIEW_EXEMPLO);
  });
});
