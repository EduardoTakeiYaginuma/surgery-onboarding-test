import { describe, expect, it } from "vitest";
import type { FormularioDocumentoIa } from "@workspace/db";
import {
  promptContrato,
  promptTermo,
  promptRefino,
  PROCEDIMENTOS_CATALOGO,
  RISCOS_POR_PROCEDIMENTO,
} from "./documento-ia-modelo";

const baseContrato: FormularioDocumentoIa = {
  nome: "Fulana de Tal",
  genero: "feminino",
  medica: "Dra. Karla Caetano Lobo",
  crm: "SP 254.200",
  rqe: "124.750",
  procedimentos: ["Blefaroplastia Superior"],
  condicoesComerciais: "À vista via PIX com 5% de desconto.",
  foro: "São Paulo/SP",
};

describe("promptContrato", () => {
  it("inclui as 8 seções na ordem, sem omitir tópicos", () => {
    const p = promptContrato(baseContrato);
    for (const sec of [
      "I. IDENTIFICAÇÃO DAS PARTES",
      "II. DO OBJETO",
      "III. DO PREÇO E FORMA DE PAGAMENTO",
      "IV. DA NATUREZA DA OBRIGAÇÃO",
      "V. DEVERES DE CONDUTA",
      'VI. POLÍTICA DE AGENDAMENTO, CANCELAMENTO E "NO-SHOW"',
      "VII. POLÍTICA DE REFINAMENTOS",
      "VIII. DISPOSIÇÕES GERAIS, LGPD E FORO",
    ]) {
      expect(p).toContain(sec);
    }
  });

  it("embute o texto fixo verbatim das cláusulas invariantes", () => {
    const p = promptContrato(baseContrato);
    expect(p).toContain("A Medicina não é uma ciência exata");
    expect(p).toContain("CLÁUSULA 7ª (Assinatura Digital)");
    expect(p).toContain("Título Executivo Extrajudicial (Art. 784, III, CPC)");
  });

  it("resolve concordância de gênero", () => {
    expect(promptContrato(baseContrato)).toContain("gênero FEMININO");
    expect(
      promptContrato({ ...baseContrato, genero: "masculino" }),
    ).toContain("gênero MASCULINO");
  });

  it("passa as condições comerciais em texto livre para a Seção III", () => {
    expect(promptContrato(baseContrato)).toContain(
      "À vista via PIX com 5% de desconto.",
    );
  });

  it("lista o catálogo de procedimentos no objeto", () => {
    const p = promptContrato(baseContrato);
    for (const proc of PROCEDIMENTOS_CATALOGO) expect(p).toContain(proc);
  });
});

describe("promptTermo", () => {
  const baseTermo: FormularioDocumentoIa = {
    nome: "Fulana de Tal",
    genero: "feminino",
    medica: "Dra. Karla Caetano Lobo",
    procedimentos: ["Blefaroplastia Superior", "Laser de CO2 Fracionado (Resurfacing)"],
    autorizaImagem: true,
  };

  it("inclui as 6 seções do TCLE", () => {
    const p = promptTermo(baseTermo);
    for (const sec of [
      "1. DECLARAÇÃO DE CIÊNCIA E REALIDADE BIOLÓGICA",
      "2. DECLARAÇÃO DE VERACIDADE",
      "3. MAPA DE RISCOS ESPECÍFICOS",
      "4. PROTOCOLO DE SEGURANÇA E RESPONSABILIDADE",
      "5. RISCOS GERAIS, SISTÊMICOS E IMPREVISIBILIDADE BIOLÓGICA",
      "6. USO DE IMAGEM (LGPD)",
    ]) {
      expect(p).toContain(sec);
    }
  });

  it("inclui apenas os blocos de risco dos procedimentos selecionados", () => {
    const p = promptTermo(baseTermo);
    expect(p).toContain(RISCOS_POR_PROCEDIMENTO["Blefaroplastia Superior"]);
    expect(p).toContain(
      RISCOS_POR_PROCEDIMENTO["Laser de CO2 Fracionado (Resurfacing)"],
    );
    // Não seleccionado → não deve aparecer o bloco canônico de Temporal Lifting.
    expect(p).not.toContain(RISCOS_POR_PROCEDIMENTO["Temporal Lifting (Brow Lift)"]);
  });

  it("alterna a seção 6 conforme autorização de imagem", () => {
    expect(promptTermo({ ...baseTermo, autorizaImagem: true })).toContain(
      "AUTORIZO a captura e uso",
    );
    expect(promptTermo({ ...baseTermo, autorizaImagem: false })).toContain(
      "NÃO AUTORIZO",
    );
  });

  it("instrui a IA a redigir bloco fiel para procedimento sem bloco canônico", () => {
    const p = promptTermo({ ...baseTermo, procedimentos: ["Procedimento Exótico"] });
    expect(p).toContain("NÃO há bloco canônico");
    expect(p).toContain("Procedimento Exótico");
  });
});

describe("promptRefino", () => {
  it("proíbe reescrever o documento inteiro e exige HTML completo", () => {
    const p = promptRefino("contrato");
    expect(p).toContain("SOMENTE a alteração pedida");
    expect(p).toContain("HTML COMPLETO");
  });
});

describe("linha da médica (CRM/RQE) resiliente a campos ausentes", () => {
  it("contrato: CRM e RQE presentes → parênteses balanceados com separador |", () => {
    expect(promptContrato(baseContrato)).toContain(
      "Médica: Dra. Karla Caetano Lobo (CRM SP 254.200 | RQE 124.750)",
    );
  });

  it("termo: CRM e RQE presentes → separador — e parênteses balanceados", () => {
    const termo: FormularioDocumentoIa = {
      nome: "Fulana de Tal",
      genero: "feminino",
      medica: "Dra. Karla Caetano Lobo",
      crm: "SP 254.200",
      rqe: "124.750",
      procedimentos: ["Blefaroplastia Superior"],
      autorizaImagem: true,
    };
    expect(promptTermo(termo)).toContain(
      "Médica: Dra. Karla Caetano Lobo (CRM SP 254.200 — RQE 124.750)",
    );
  });

  it("só RQE (sem CRM) → sem parêntese solto nem separador órfão", () => {
    const p = promptContrato({ ...baseContrato, crm: undefined });
    expect(p).toContain("Médica: Dra. Karla Caetano Lobo (RQE 124.750)");
    expect(p).not.toContain("| RQE");
    expect(p).not.toContain("(CRM");
  });

  it("só CRM (sem RQE) → parênteses fechados só com o CRM", () => {
    expect(promptContrato({ ...baseContrato, rqe: undefined })).toContain(
      "Médica: Dra. Karla Caetano Lobo (CRM SP 254.200)",
    );
  });

  it("sem CRM nem RQE → só o nome, sem parênteses", () => {
    const p = promptContrato({ ...baseContrato, crm: undefined, rqe: undefined });
    expect(p).toContain("Médica: Dra. Karla Caetano Lobo\n");
    expect(p).not.toContain("Dra. Karla Caetano Lobo (");
  });
});
