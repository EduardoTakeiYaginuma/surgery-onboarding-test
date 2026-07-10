import { describe, expect, it } from "vitest";
import type { Paciente } from "@workspace/db";
import {
  variaveisNaoResolvidas,
  VARIAVEIS_CONTRATO,
  VARIAVEIS_ESSENCIAIS,
  CHAVES_HTML_CONTRATO,
  montarContextoContrato,
  montarPreviewDocumento,
  preencherCorpo,
} from "./contrato-geracao";
import { CONTEUDO_GENERICO } from "./documento-procedimento-conteudo";

function pacienteFixture(over: Partial<Paciente> = {}): Paciente {
  return {
    nome: "Maria Antônia de Assunção",
    cpf: "39053344705",
    dataCirurgia: "2026-09-15",
    horario: "06:00",
    local: "avant-moema",
    medica: "Dra. Karla Caetano Lobo",
    crm: "123456",
    rqe: "65432",
    clinica: "KCL",
    procedimentos: ["Blefaroplastia", "Lipo de papada"],
    laser: false,
    valorSinal: "3000",
    valorPendente: "2000",
    dataPagamentoPendente: "2026-09-10",
    equipeAnestesia: "zenicare",
    ...over,
  } as unknown as Paciente;
}

describe("montarPreviewDocumento", () => {
  it("agrupa Paciente, Procedimento e Valores com os campos resolvidos", () => {
    const grupos = montarPreviewDocumento(pacienteFixture());
    expect(grupos.map((g) => g.chave)).toEqual([
      "paciente",
      "procedimento",
      "valores",
    ]);

    const campo = (chave: string, rotulo: string) =>
      grupos
        .find((g) => g.chave === chave)
        ?.campos.find((c) => c.rotulo === rotulo)?.valor;

    // CPF formatado (nunca o cru) e múltiplos procedimentos unidos.
    expect(campo("paciente", "CPF")).toBe("390.533.447-05");
    expect(campo("procedimento", "Procedimento(s)")).toBe(
      "Blefaroplastia, Lipo de papada",
    );
    // Registro combina CRM · RQE; data e valores formatados.
    expect(campo("procedimento", "Registro")).toContain("123456");
    expect(campo("procedimento", "Registro")).toContain("65432");
    expect(campo("valores", "Valor pago")).toContain("3.000,00");
    expect(campo("valores", "Saldo em aberto")).toContain("2.000,00");
    expect(campo("valores", "Vencimento do saldo")).toBe("10/09/2026");
  });

  it("normaliza campos vazios para — (travessão)", () => {
    const grupos = montarPreviewDocumento(
      pacienteFixture({
        cpf: "",
        crm: "",
        rqe: "",
        valorPendente: "0",
        dataPagamentoPendente: null,
      } as Partial<Paciente>),
    );
    const campo = (chave: string, rotulo: string) =>
      grupos
        .find((g) => g.chave === chave)
        ?.campos.find((c) => c.rotulo === rotulo)?.valor;

    expect(campo("paciente", "CPF")).toBe("—");
    expect(campo("valores", "Vencimento do saldo")).toBe("—");
  });
});

describe("variaveisNaoResolvidas", () => {
  it("encontra todas as variáveis {{...}} restantes, sem duplicar", () => {
    const texto = "Olá {{nome}}, CPF {{cpf}}. Confirme, {{nome}}.";
    expect(variaveisNaoResolvidas(texto).sort()).toEqual(["cpf", "nome"]);
  });

  it("tolera espaços internos nas chaves", () => {
    expect(variaveisNaoResolvidas("Saldo: {{ valorPendente }}")).toEqual([
      "valorPendente",
    ]);
  });

  it("retorna lista vazia quando tudo foi resolvido", () => {
    expect(variaveisNaoResolvidas("Texto sem variáveis.")).toEqual([]);
  });
});

describe("VARIAVEIS_CONTRATO", () => {
  it("inclui os campos sensíveis próprios do contrato", () => {
    const chaves = VARIAVEIS_CONTRATO.map((v) => v.chave);
    for (const c of ["cpf", "valorPago", "valorPendente", "procedimentos"]) {
      expect(chaves).toContain(c);
    }
  });

  it("publica as quatro variáveis clínicas combinadas (HTML, não escapadas)", () => {
    const chaves = VARIAVEIS_CONTRATO.map((v) => v.chave);
    for (const c of [
      "naturezaProcedimentos",
      "riscosProcedimentos",
      "cuidadosProcedimentos",
      "alternativasProcedimentos",
    ]) {
      expect(chaves).toContain(c);
      // Toda chave clínica combinada é HTML pronto — fica fora do escape geral.
      expect(CHAVES_HTML_CONTRATO.has(c)).toBe(true);
    }
  });

  it("toda variável carrega essencialPara (mesmo que vazio)", () => {
    for (const v of VARIAVEIS_CONTRATO) {
      expect(Array.isArray(v.essencialPara)).toBe(true);
    }
  });

  it("marca como essenciais do CONTRATO o nome, o procedimento, as credenciais da médica e os valores", () => {
    const essenciais = (tipo: "contrato" | "termo") =>
      VARIAVEIS_CONTRATO.filter((v) => v.essencialPara.includes(tipo)).map(
        (v) => v.chave,
      );
    expect(essenciais("contrato").sort()).toEqual(
      ["crm", "medica", "nome", "procedimentos", "rqe", "valorPago", "valorPendente"].sort(),
    );
  });

  it("o TERMO só exige nome e procedimento (sem valores nem credenciais)", () => {
    const essenciaisTermo = VARIAVEIS_CONTRATO.filter((v) =>
      v.essencialPara.includes("termo"),
    ).map((v) => v.chave);
    expect(essenciaisTermo.sort()).toEqual(["nome", "procedimentos"].sort());
    // Valores e credenciais não são essenciais num termo de consentimento.
    for (const c of ["valorPago", "valorPendente", "crm", "rqe"]) {
      expect(essenciaisTermo).not.toContain(c);
    }
  });

  it("essencialPara reflete VARIAVEIS_ESSENCIAIS (fonte única)", () => {
    for (const v of VARIAVEIS_CONTRATO) {
      for (const tipo of ["contrato", "termo"] as const) {
        expect(v.essencialPara.includes(tipo)).toBe(
          (VARIAVEIS_ESSENCIAIS[tipo] as readonly string[]).includes(v.chave),
        );
      }
    }
  });
});

describe("cláusulas clínicas combinadas (montarContextoContrato)", () => {
  it("um único procedimento: bloco plano, sem cabeçalho de nome", () => {
    const ctx = montarContextoContrato(
      pacienteFixture({ procedimentos: ["Blefaroplastia"] } as Partial<Paciente>),
    );
    // Natureza vira um parágrafo simples; sem <strong> de cabeçalho.
    expect(ctx.naturezaProcedimentos).toContain("<p>");
    expect(ctx.naturezaProcedimentos).not.toContain("<strong>");
    expect(ctx.naturezaProcedimentos).toMatch(/Cirurgia das pálpebras/);
    // Riscos viram lista; itens específicos da blefaroplastia presentes.
    expect(ctx.riscosProcedimentos).toContain("<ul>");
    expect(ctx.riscosProcedimentos).toContain("<li>");
    expect(ctx.riscosProcedimentos).toMatch(/retrobulbar/i);
  });

  it("vários procedimentos: cada um ganha cabeçalho com o nome", () => {
    const ctx = montarContextoContrato(
      pacienteFixture({
        procedimentos: ["Blefaroplastia", "Lipo de papada"],
      } as Partial<Paciente>),
    );
    expect(ctx.naturezaProcedimentos).toContain(
      "<p><strong>Blefaroplastia</strong></p>",
    );
    expect(ctx.naturezaProcedimentos).toContain(
      "<p><strong>Lipo de papada</strong></p>",
    );
  });

  it("procedimento fora do catálogo cai no conteúdo genérico", () => {
    const ctx = montarContextoContrato(
      pacienteFixture({
        procedimentos: ["Procedimento Inexistente XYZ"],
      } as Partial<Paciente>),
    );
    expect(ctx.naturezaProcedimentos).toContain(CONTEUDO_GENERICO.natureza);
  });

  it("o HTML combinado entra no corpo sem reescape (tags preservadas)", () => {
    const corpo = preencherCorpo(
      "<section>{{riscosProcedimentos}}</section>",
      pacienteFixture({ procedimentos: ["Blefaroplastia"] } as Partial<Paciente>),
    );
    // As tags da lista chegam cruas (<ul>/<li>), nunca escapadas (&lt;ul&gt;).
    expect(corpo).toContain("<ul>");
    expect(corpo).toContain("<li>");
    expect(corpo).not.toContain("&lt;ul&gt;");
  });
});
