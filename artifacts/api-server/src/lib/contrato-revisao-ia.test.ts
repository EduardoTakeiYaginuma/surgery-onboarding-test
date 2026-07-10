import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pacientesTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

// Mocka o cliente de IA para controlar a resposta sem chamar a API real.
vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create: vi.fn() } } },
}));

import { openai } from "@workspace/integrations-openai-ai-server";
import { revisarContrato, RevisaoIaError } from "./contrato-revisao-ia";
import { pacientesRepo } from "./pacientes-repo";

const mockCreate = vi.mocked(openai.chat.completions.create);

const pacientesCriados: number[] = [];

async function criarPaciente() {
  const p = await pacientesRepo.criar({
    nome: "Paciente Revisão",
    procedimentos: ["Blefaroplastia"],
    dataCirurgia: "2026-08-15",
    valorSinal: "3000",
  });
  pacientesCriados.push(p.id);
  return p;
}

function respostaIa(conteudo: string) {
  return { choices: [{ message: { content: conteudo } }] } as never;
}

beforeEach(() => {
  mockCreate.mockReset();
});

afterAll(async () => {
  if (pacientesCriados.length > 0) {
    await db.delete(pacientesTable).where(inArray(pacientesTable.id, pacientesCriados));
  }
});

describe("revisarContrato", () => {
  it("monta o relatório estruturado e conta os alertas", async () => {
    const paciente = await criarPaciente();
    mockCreate.mockResolvedValue(
      respostaIa(
        JSON.stringify({
          resumoGeral: "Contrato sólido, com poucos ajustes.",
          frentes: [
            {
              chave: "clausulas",
              titulo: "Cláusulas",
              resumo: "Cláusulas presentes.",
              itens: [
                { rotulo: "Objeto", status: "ok", observacao: "Definido." },
                {
                  rotulo: "Cancelamento",
                  status: "atencao",
                  observacao: "Política vaga.",
                  sugestao: "Detalhar prazos.",
                },
              ],
            },
            {
              chave: "conformidade",
              titulo: "Conformidade",
              resumo: "Atenção à LGPD.",
              itens: [
                {
                  rotulo: "LGPD",
                  status: "atencao",
                  observacao: "Falta base legal.",
                },
              ],
            },
          ],
        }),
      ),
    );

    const rel = await revisarContrato({
      titulo: "Contrato",
      corpo: "Texto",
      paciente,
    });

    expect(rel.modelo).toBe("gpt-5.4");
    expect(rel.frentes).toHaveLength(2);
    expect(rel.alertas).toBe(2);
    expect(rel.resumoGeral).toContain("Contrato sólido");
  });

  it("descarta frentes e itens malformados sem quebrar", async () => {
    const paciente = await criarPaciente();
    mockCreate.mockResolvedValue(
      respostaIa(
        JSON.stringify({
          resumoGeral: "Resumo",
          frentes: [
            { chave: "frente-invalida", titulo: "x", resumo: "y", itens: [] },
            {
              chave: "clausulas",
              titulo: "Cláusulas",
              resumo: "ok",
              itens: [
                { rotulo: "Bom", status: "ok", observacao: "ok" },
                { status: "ok" }, // sem rotulo/observacao → descartado
              ],
            },
          ],
        }),
      ),
    );

    const rel = await revisarContrato({ titulo: "C", corpo: "T", paciente });
    expect(rel.frentes).toHaveLength(1);
    expect(rel.frentes[0].chave).toBe("clausulas");
    expect(rel.frentes[0].itens).toHaveLength(1);
    expect(rel.alertas).toBe(0);
  });

  it("lança RevisaoIaError quando a chamada de IA falha", async () => {
    const paciente = await criarPaciente();
    mockCreate.mockRejectedValue(new Error("rede caiu"));
    await expect(
      revisarContrato({ titulo: "C", corpo: "T", paciente }),
    ).rejects.toBeInstanceOf(RevisaoIaError);
  });

  it("lança RevisaoIaError quando a resposta vem vazia", async () => {
    const paciente = await criarPaciente();
    mockCreate.mockResolvedValue(respostaIa(""));
    await expect(
      revisarContrato({ titulo: "C", corpo: "T", paciente }),
    ).rejects.toBeInstanceOf(RevisaoIaError);
  });

  it("lança RevisaoIaError quando o JSON é inválido", async () => {
    const paciente = await criarPaciente();
    mockCreate.mockResolvedValue(respostaIa("isto não é json"));
    await expect(
      revisarContrato({ titulo: "C", corpo: "T", paciente }),
    ).rejects.toBeInstanceOf(RevisaoIaError);
  });

  it("lança RevisaoIaError quando não há frentes válidas", async () => {
    const paciente = await criarPaciente();
    mockCreate.mockResolvedValue(
      respostaIa(JSON.stringify({ resumoGeral: "x", frentes: [] })),
    );
    await expect(
      revisarContrato({ titulo: "C", corpo: "T", paciente }),
    ).rejects.toBeInstanceOf(RevisaoIaError);
  });
});

describe("frente de conformidade — restrições do parecer", () => {
  const RELATORIO_OK = JSON.stringify({
    resumoGeral: "ok",
    frentes: [
      { chave: "conformidade", titulo: "Conformidade", resumo: "ok", itens: [] },
    ],
  });

  function promptSistemaEnviado(): string {
    const call = mockCreate.mock.calls[0]?.[0] as
      | { messages: { role: string; content: string }[] }
      | undefined;
    const sistema = call?.messages.find((m) => m.role === "system");
    return sistema?.content ?? "";
  }

  it("contrato: escopo atual é só formatação/preenchimento/escrita (sem mérito jurídico)", async () => {
    const paciente = await criarPaciente();
    mockCreate.mockResolvedValue(respostaIa(RELATORIO_OK));

    await revisarContrato({ titulo: "C", corpo: "T", paciente, tipo: "contrato" });

    const prompt = promptSistemaEnviado();
    expect(prompt).toMatch(/CONTRATO/);
    // Não avalia mérito jurídico nesta etapa.
    expect(prompt).toMatch(/N[ÃA]O avalie/i);
    // As três frentes de texto.
    expect(prompt).toMatch(/preenchimento/i);
    expect(prompt).toMatch(/regras de escrita/i);
    expect(prompt).toMatch(/formata/i);
    // Detecta variável não substituída e concordância de gênero.
    expect(prompt).toMatch(/\{\{/);
    expect(prompt).toMatch(/concord/i);
  });

  it("termo: mesma revisão de texto, com o rótulo do TCLE", async () => {
    const paciente = await criarPaciente();
    mockCreate.mockResolvedValue(respostaIa(RELATORIO_OK));

    await revisarContrato({ titulo: "T", corpo: "T", paciente, tipo: "termo" });

    const prompt = promptSistemaEnviado();
    expect(prompt).toMatch(/TERMO DE CONSENTIMENTO/);
    expect(prompt).toMatch(/preenchimento/i);
    expect(prompt).toMatch(/regras de escrita/i);
    expect(prompt).toMatch(/formata/i);
    expect(prompt).toMatch(/N[ÃA]O avalie/i);
  });
});
