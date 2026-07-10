import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pacientesTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

// Mocka a Autentique (somente leitura) para controlar o status devolvido sem
// depender da API real — assim conseguimos exercitar as transições de status.
// `refrescarStatusTermo` reaproveita `consultarStatusContrato`.
vi.mock("./autentique", () => ({
  consultarStatusContrato: vi.fn(),
}));

import { consultarStatusContrato } from "./autentique";
import { refrescarStatusTermo } from "./termo";
import { pacientesRepo } from "./pacientes-repo";
import { timelineRepo } from "./timeline-repo";

const mockConsultar = vi.mocked(consultarStatusContrato);

const pacientesCriados: number[] = [];

async function criarComTermo(statusInicial: string | null) {
  const docId = crypto.randomUUID();
  const p = await pacientesRepo.criar({
    nome: "Paciente Termo",
    procedimentos: ["Blefaroplastia"],
    dataCirurgia: "2026-08-15",
    valorSinal: "3000",
  });
  pacientesCriados.push(p.id);
  const atualizado = await pacientesRepo.atualizarTermo(p.id, {
    termoAutentiqueId: docId,
    termoStatus: statusInicial,
  });
  return atualizado!;
}

beforeEach(() => {
  mockConsultar.mockReset();
});

afterAll(async () => {
  if (pacientesCriados.length > 0) {
    await db
      .delete(pacientesTable)
      .where(inArray(pacientesTable.id, pacientesCriados));
  }
});

describe("refrescarStatusTermo — trilha de histórico", () => {
  it("grava uma linha quando o termo passa de pendente para assinado", async () => {
    const paciente = await criarComTermo("pendente");
    mockConsultar.mockResolvedValue({
      status: "assinado",
      assinadoEm: "2026-06-26T10:00:00.000Z",
      linkAssinatura: null,
    });

    await refrescarStatusTermo(paciente);

    const hist = await pacientesRepo.listarHistorico(paciente.id);
    expect(hist).toHaveLength(1);
    expect(hist[0].alteracoes).toEqual([
      {
        campo: "termoStatus",
        rotulo: "Status do termo de consentimento",
        de: "Pendente",
        para: "Assinado",
      },
    ]);

    const timeline = await timelineRepo.listarPorPaciente(paciente.id);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      tipo: "termo_assinado",
      titulo: "Termo de consentimento assinado",
      automatico: true,
    });
  });

  it("grava uma linha quando o termo é recusado", async () => {
    const paciente = await criarComTermo("pendente");
    mockConsultar.mockResolvedValue({
      status: "recusado",
      assinadoEm: null,
      linkAssinatura: null,
    });

    await refrescarStatusTermo(paciente);

    const hist = await pacientesRepo.listarHistorico(paciente.id);
    expect(hist).toHaveLength(1);
    expect(hist[0].alteracoes[0]).toMatchObject({
      campo: "termoStatus",
      de: "Pendente",
      para: "Recusado",
    });

    const timeline = await timelineRepo.listarPorPaciente(paciente.id);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      tipo: "termo_recusado",
      titulo: "Termo de consentimento recusado",
      automatico: true,
    });
  });

  it("não grava histórico nem marco quando o status não muda (no-op)", async () => {
    const paciente = await criarComTermo("assinado");
    mockConsultar.mockResolvedValue({
      status: "assinado",
      assinadoEm: "2026-06-26T10:00:00.000Z",
      linkAssinatura: null,
    });

    await refrescarStatusTermo(paciente);

    const hist = await pacientesRepo.listarHistorico(paciente.id);
    expect(hist).toHaveLength(0);

    const timeline = await timelineRepo.listarPorPaciente(paciente.id);
    expect(timeline).toHaveLength(0);
  });

  it("não grava histórico quando a Autentique fica indisponível", async () => {
    const paciente = await criarComTermo("pendente");
    mockConsultar.mockResolvedValue({
      status: "indisponivel",
      assinadoEm: null,
      linkAssinatura: null,
    });

    await refrescarStatusTermo(paciente);

    const hist = await pacientesRepo.listarHistorico(paciente.id);
    expect(hist).toHaveLength(0);

    const timeline = await timelineRepo.listarPorPaciente(paciente.id);
    expect(timeline).toHaveLength(0);
  });

  it("preserva o status real e não grava histórico no caminho do webhook (preservarSeIndisponivel)", async () => {
    const paciente = await criarComTermo("assinado");
    mockConsultar.mockResolvedValue({
      status: "indisponivel",
      assinadoEm: null,
      linkAssinatura: null,
    });

    const resultado = await refrescarStatusTermo(paciente, {
      preservarSeIndisponivel: true,
    });

    // Não sobrescreve o status real já conhecido.
    expect(resultado.termoStatus).toBe("assinado");

    const hist = await pacientesRepo.listarHistorico(paciente.id);
    expect(hist).toHaveLength(0);

    const timeline = await timelineRepo.listarPorPaciente(paciente.id);
    expect(timeline).toHaveLength(0);
  });
});
