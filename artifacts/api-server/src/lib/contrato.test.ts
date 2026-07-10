import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pacientesTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

// Mocka a Autentique (somente leitura) para controlar o status devolvido sem
// depender da API real — assim conseguimos exercitar as transições de status.
vi.mock("./autentique", () => ({
  consultarStatusContrato: vi.fn(),
}));

import { consultarStatusContrato } from "./autentique";
import { refrescarStatusContrato } from "./contrato";
import { pacientesRepo } from "./pacientes-repo";
import { timelineRepo } from "./timeline-repo";

const mockConsultar = vi.mocked(consultarStatusContrato);

const pacientesCriados: number[] = [];

async function criarComContrato(statusInicial: string | null) {
  const docId = crypto.randomUUID();
  const p = await pacientesRepo.criar({
    nome: "Paciente Contrato",
    procedimentos: ["Blefaroplastia"],
    dataCirurgia: "2026-08-15",
    valorSinal: "3000",
  });
  pacientesCriados.push(p.id);
  const atualizado = await pacientesRepo.atualizarContrato(p.id, {
    contratoAutentiqueId: docId,
    contratoStatus: statusInicial,
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

describe("refrescarStatusContrato — trilha de histórico", () => {
  it("grava uma linha quando o contrato passa de pendente para assinado", async () => {
    const paciente = await criarComContrato("pendente");
    mockConsultar.mockResolvedValue({
      status: "assinado",
      assinadoEm: "2026-06-26T10:00:00.000Z",
      linkAssinatura: null,
    });

    await refrescarStatusContrato(paciente);

    const hist = await pacientesRepo.listarHistorico(paciente.id);
    expect(hist).toHaveLength(1);
    expect(hist[0].alteracoes).toEqual([
      {
        campo: "contratoStatus",
        rotulo: "Status do contrato",
        de: "Pendente",
        para: "Assinado",
      },
    ]);

    const timeline = await timelineRepo.listarPorPaciente(paciente.id);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      tipo: "contrato_assinado",
      titulo: "Contrato assinado",
      automatico: true,
    });
  });

  it("grava uma linha quando o contrato é recusado", async () => {
    const paciente = await criarComContrato("pendente");
    mockConsultar.mockResolvedValue({
      status: "recusado",
      assinadoEm: null,
      linkAssinatura: null,
    });

    await refrescarStatusContrato(paciente);

    const hist = await pacientesRepo.listarHistorico(paciente.id);
    expect(hist).toHaveLength(1);
    expect(hist[0].alteracoes[0]).toMatchObject({
      campo: "contratoStatus",
      de: "Pendente",
      para: "Recusado",
    });

    const timeline = await timelineRepo.listarPorPaciente(paciente.id);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      tipo: "contrato_recusado",
      titulo: "Contrato recusado",
      automatico: true,
    });
  });

  it("não grava histórico nem marco quando o status não muda (no-op)", async () => {
    const paciente = await criarComContrato("assinado");
    mockConsultar.mockResolvedValue({
      status: "assinado",
      assinadoEm: "2026-06-26T10:00:00.000Z",
      linkAssinatura: null,
    });

    await refrescarStatusContrato(paciente);

    const hist = await pacientesRepo.listarHistorico(paciente.id);
    expect(hist).toHaveLength(0);

    const timeline = await timelineRepo.listarPorPaciente(paciente.id);
    expect(timeline).toHaveLength(0);
  });

  it("não grava histórico quando a Autentique fica indisponível", async () => {
    const paciente = await criarComContrato("pendente");
    mockConsultar.mockResolvedValue({
      status: "indisponivel",
      assinadoEm: null,
      linkAssinatura: null,
    });

    await refrescarStatusContrato(paciente);

    const hist = await pacientesRepo.listarHistorico(paciente.id);
    expect(hist).toHaveLength(0);
  });
});
