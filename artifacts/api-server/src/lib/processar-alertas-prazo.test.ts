import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pacientesTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

// Mocka os avisos à equipe para capturar quais prazos foram disparados sem
// depender de webhook real. Por padrão respondem "enviado".
vi.mock("./notificacoes", () => ({
  notificarPrazoContrato: vi.fn(async () => "enviado"),
  notificarPrazoTermo: vi.fn(async () => "enviado"),
  // Demais exports usados por contrato.ts no carregamento do módulo.
  notificarTransicaoContrato: vi.fn(async () => false),
}));

import {
  notificarPrazoContrato,
  notificarPrazoTermo,
} from "./notificacoes";
import { processarAlertasPrazo } from "./contrato";
import { pacientesRepo } from "./pacientes-repo";

const mockPrazoContrato = vi.mocked(notificarPrazoContrato);
const mockPrazoTermo = vi.mocked(notificarPrazoTermo);

const pacientesCriados: number[] = [];

// Data de cirurgia bem no passado → o prazo de assinatura já venceu,
// independentemente da janela configurada (config_contrato.diasAntes).
const CIRURGIA_PASSADA = "2020-01-15";

async function criarComTermo(
  status: string | null,
  extra: Record<string, unknown> = {},
) {
  const p = await pacientesRepo.criar({
    nome: `Termo Prazo ${crypto.randomUUID().slice(0, 8)}`,
    procedimentos: ["Blefaroplastia"],
    dataCirurgia: CIRURGIA_PASSADA,
    valorSinal: "3000",
  });
  pacientesCriados.push(p.id);
  await pacientesRepo.atualizar(p.id, {
    termoAutentiqueId: crypto.randomUUID(),
    termoStatus: status,
    ...extra,
  });
  return p.id;
}

beforeEach(() => {
  mockPrazoContrato.mockClear();
  mockPrazoTermo.mockClear();
});

afterEach(async () => {
  if (pacientesCriados.length > 0) {
    await db
      .delete(pacientesTable)
      .where(inArray(pacientesTable.id, pacientesCriados));
    pacientesCriados.length = 0;
  }
});

describe("processarAlertasPrazo — prazo do termo de consentimento", () => {
  it("avisa a equipe quando o prazo do termo venceu e marca o carimbo", async () => {
    const id = await criarComTermo("pendente");

    await processarAlertasPrazo();

    const avisado = mockPrazoTermo.mock.calls.some(
      ([pac]) => (pac as { nome: string }).nome.startsWith("Termo Prazo"),
    );
    expect(avisado).toBe(true);

    const p = await pacientesRepo.obterPorId(id);
    expect(p?.termoPrazoAlertadoEm).not.toBeNull();
  });

  it("não avisa duas vezes para o mesmo prazo (dedup)", async () => {
    await criarComTermo("pendente");

    await processarAlertasPrazo();
    const primeira = mockPrazoTermo.mock.calls.length;
    expect(primeira).toBeGreaterThan(0);

    mockPrazoTermo.mockClear();
    await processarAlertasPrazo();
    expect(mockPrazoTermo).not.toHaveBeenCalled();
  });

  it("não avisa quando o termo já foi assinado ou recusado", async () => {
    await criarComTermo("assinado");
    await criarComTermo("recusado");

    await processarAlertasPrazo();

    const avisadosTermo = mockPrazoTermo.mock.calls.filter(([pac]) =>
      (pac as { nome: string }).nome.startsWith("Termo Prazo"),
    );
    expect(avisadosTermo).toHaveLength(0);
  });

  it("não avisa quando não há termo vinculado (sem doc nem link manual)", async () => {
    const p = await pacientesRepo.criar({
      nome: `Sem Termo ${crypto.randomUUID().slice(0, 8)}`,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: CIRURGIA_PASSADA,
      valorSinal: "3000",
    });
    pacientesCriados.push(p.id);
    await pacientesRepo.atualizar(p.id, { termoStatus: "pendente" });

    await processarAlertasPrazo();

    const avisado = mockPrazoTermo.mock.calls.some(([pac]) =>
      (pac as { nome: string }).nome.startsWith("Sem Termo"),
    );
    expect(avisado).toBe(false);
  });
});
