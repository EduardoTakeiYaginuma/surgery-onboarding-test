import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { db, pacientesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Mockamos o SERVIÇO de IA (não o OpenAI real): exercita a fiação da rota
// (persistência, guardas, status) sem chamar o ChatGPT. DocumentoIaError fica
// real para o `instanceof` do handler funcionar (→ 502).
vi.mock("../lib/documento-ia-geracao", async () => {
  const real = await vi.importActual<
    typeof import("../lib/documento-ia-geracao")
  >("../lib/documento-ia-geracao");
  return {
    ...real,
    gerarDocumentoIA: vi.fn(),
    refinarDocumentoIA: vi.fn(),
  };
});

import app from "../app";
import {
  gerarDocumentoIA,
  refinarDocumentoIA,
  DocumentoIaError,
} from "../lib/documento-ia-geracao";

const mockGerar = vi.mocked(gerarDocumentoIA);
const mockRefinar = vi.mocked(refinarDocumentoIA);

function gerarCpf(seed: number): string {
  const d = Array.from({ length: 9 }, (_, i) => Math.floor(seed / 10 ** (8 - i)) % 10);
  const s1 = d.reduce((acc, v, i) => acc + v * (10 - i), 0);
  const d1 = s1 % 11 < 2 ? 0 : 11 - (s1 % 11);
  const s2 = d.reduce((acc, v, i) => acc + v * (11 - i), 0) + d1 * 2;
  const d2 = s2 % 11 < 2 ? 0 : 11 - (s2 % 11);
  const cpf = `${d.join("")}${d1}${d2}`;
  if (/^(\d)\1{10}$/.test(cpf)) return gerarCpf(seed + 1);
  return cpf;
}
let _seed = 200000000 + Math.floor(Math.random() * 700000000);

async function criarPaciente(): Promise<number> {
  const res = await request(app)
    .post("/api/pacientes")
    .send({
      nome: "Paciente IA",
      cpf: gerarCpf(_seed++),
      telefone: "11987654321",
      procedimentos: ["Blefaroplastia Superior"],
      dataCirurgia: "2026-09-10",
      valorSinal: 3000,
    });
  expect(res.status).toBe(201);
  return res.body.paciente.id as number;
}

const FORM = {
  nome: "Paciente IA",
  genero: "feminino" as const,
  medica: "Dra. Karla Caetano Lobo",
  procedimentos: ["Blefaroplastia Superior"],
  condicoesComerciais: "À vista via PIX.",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /pacientes/:id/contratos/gerar-ia", () => {
  it("cria rascunho origem 'ia' com o corpo da IA e persiste o formulário", async () => {
    mockGerar.mockResolvedValue({
      titulo: "Contrato — Paciente IA",
      corpo: "<h1>Contrato</h1><p>corpo</p>",
    });
    const pacienteId = await criarPaciente();
    const res = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/gerar-ia`)
      .send({ tipo: "contrato", formulario: FORM });
    expect(res.status).toBe(201);
    expect(res.body.origem).toBe("ia");
    expect(res.body.status).toBe("rascunho");
    expect(res.body.corpo).toContain("<h1>Contrato</h1>");
    expect(res.body.formularioIa.nome).toBe("Paciente IA");
    expect(res.body.arquivoObjectPath).toBeNull();
    expect(mockGerar).toHaveBeenCalledOnce();
  });

  it("persiste identidade (cpf/email/rg/nascimento/endereco) de volta no paciente", async () => {
    mockGerar.mockResolvedValue({
      titulo: "Contrato — Paciente IA",
      corpo: "<h1>Contrato</h1>",
    });
    const pacienteId = await criarPaciente();
    const res = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/gerar-ia`)
      .send({
        tipo: "contrato",
        formulario: {
          ...FORM,
          cpf: "123.456.789-01", // 11 dígitos após normalizar
          email: "paciente@ex.com",
          rg: "12.345.678-9",
          nascimento: "15/05/1981",
          endereco: "Rua X, 10, São Paulo/SP",
        },
      });
    expect(res.status).toBe(201);
    const [p] = await db
      .select()
      .from(pacientesTable)
      .where(eq(pacientesTable.id, pacienteId));
    expect(p.cpf).toBe("12345678901");
    expect(p.email).toBe("paciente@ex.com");
    expect(p.rg).toBe("12.345.678-9");
    expect(p.nascimento).toBe("15/05/1981");
    expect(p.endereco).toBe("Rua X, 10, São Paulo/SP");
  });

  it("não persiste CPF do formulário quando não tem 11 dígitos", async () => {
    mockGerar.mockResolvedValue({ titulo: "t", corpo: "<h1>t</h1>" });
    const pacienteId = await criarPaciente();
    const [antes] = await db
      .select()
      .from(pacientesTable)
      .where(eq(pacientesTable.id, pacienteId));
    const res = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/gerar-ia`)
      .send({ tipo: "contrato", formulario: { ...FORM, cpf: "123" } });
    expect(res.status).toBe(201);
    const [depois] = await db
      .select()
      .from(pacientesTable)
      .where(eq(pacientesTable.id, pacienteId));
    expect(depois.cpf).toBe(antes.cpf); // inalterado
  });

  it("devolve 502 quando a IA falha", async () => {
    mockGerar.mockRejectedValue(new DocumentoIaError("indisponível"));
    const pacienteId = await criarPaciente();
    const res = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/gerar-ia`)
      .send({ tipo: "termo", formulario: { ...FORM, autorizaImagem: true } });
    expect(res.status).toBe(502);
  });
});

describe("POST /contratos/:id/refinar-ia", () => {
  async function criarGeracaoIa(): Promise<number> {
    mockGerar.mockResolvedValue({
      titulo: "Contrato — Paciente IA",
      corpo: "<h1>Contrato</h1><p>original</p>",
    });
    const pacienteId = await criarPaciente();
    const res = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/gerar-ia`)
      .send({ tipo: "contrato", formulario: FORM });
    expect(res.status).toBe(201);
    return res.body.id as number;
  }

  it("aplica o refino, troca o corpo e registra a instrução na conversa", async () => {
    const id = await criarGeracaoIa();
    mockRefinar.mockResolvedValue({ corpo: "<h1>Contrato</h1><p>refinado</p>" });
    const res = await request(app)
      .post(`/api/contratos/${id}/refinar-ia`)
      .send({ instrucao: "troque o Foro para Campinas" });
    expect(res.status).toBe(200);
    expect(res.body.corpo).toContain("refinado");
    expect(res.body.conversaIa).toHaveLength(1);
    expect(res.body.conversaIa[0].instrucao).toBe("troque o Foro para Campinas");
    expect(mockRefinar).toHaveBeenCalledOnce();
  });

  it("recusa refino em documento que não é de IA", async () => {
    // Cria um upload (origem != ia) e tenta refinar.
    const pacienteId = await criarPaciente();
    const up = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/upload`)
      .send({
        tipo: "contrato",
        objectPath: "/objects/uploads/x.pdf",
        nomeArquivo: "x.pdf",
        contentType: "application/pdf",
        tamanho: 1000,
      });
    expect(up.status).toBe(201);
    const res = await request(app)
      .post(`/api/contratos/${up.body.id}/refinar-ia`)
      .send({ instrucao: "muda algo" });
    expect(res.status).toBe(400);
    expect(mockRefinar).not.toHaveBeenCalled();
  });

  it("devolve 502 quando o refino por IA falha", async () => {
    const id = await criarGeracaoIa();
    mockRefinar.mockRejectedValue(new DocumentoIaError("indisponível"));
    const res = await request(app)
      .post(`/api/contratos/${id}/refinar-ia`)
      .send({ instrucao: "qualquer" });
    expect(res.status).toBe(502);
  });
});
