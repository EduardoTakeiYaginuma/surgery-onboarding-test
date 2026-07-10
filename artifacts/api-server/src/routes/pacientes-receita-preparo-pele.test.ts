import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { db, pacientesTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

// Mocka o storage do bucket de pedidos de exames — os testes exercitam as rotas
// e a persistência (repo real via PGlite), não o Supabase. `uploadReceitaPreparoPele`
// devolve uma chave fake; `servirReceitaPreparoPele` responde um PDF fake.
vi.mock("../lib/receita-preparo-pele-arquivo", () => ({
  storageReceitasPeleConfigurado: () => true,
  uploadReceitaPreparoPele: vi.fn(async () => "42/objeto-fake.pdf"),
  apagarReceitaPreparoPeleObjeto: vi.fn(async () => {}),
  servirReceitaPreparoPele: vi.fn(async (_pedido, res, opts) => {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `${opts?.download ? "attachment" : "inline"}; filename="pedido.pdf"`,
    );
    res.status(200).send(Buffer.from("%PDF-1.4 fake\n%%EOF"));
  }),
}));

import app from "../app";

const pacientesCriados: number[] = [];
const TELEFONE_VALIDO = "11987654321";
const PDF_BYTES = Buffer.from("%PDF-1.4\n receita de preparo da pele\n%%EOF");

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
let _cpfSeed = 100000000 + Math.floor(Math.random() * 800000000);
function cpfUnico(): string { return gerarCpf(_cpfSeed++); }

async function criarPaciente(): Promise<{ id: number; token: string }> {
  const res = await request(app)
    .post("/api/pacientes")
    .send({
      nome: "Paciente Pedido Exames",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-08-15",
      valorSinal: 3000,
    });
  expect(res.status).toBe(201);
  const id = res.body.paciente.id as number;
  const token = res.body.paciente.tokenPublico as string;
  pacientesCriados.push(id);
  return { id, token };
}

function anexar(pacienteId: number, nome = "meus-exames.pdf") {
  return request(app)
    .post(`/api/pacientes/${pacienteId}/receita-preparo-pele`)
    .attach("arquivo", PDF_BYTES, { filename: nome, contentType: "application/pdf" });
}

afterAll(async () => {
  if (pacientesCriados.length > 0) {
    await db.delete(pacientesTable).where(inArray(pacientesTable.id, pacientesCriados));
  }
});
afterEach(() => vi.clearAllMocks());

describe("Receita de preparo da pele — CRUD (Console)", () => {
  it("GET devolve null quando não há pedido", async () => {
    const { id } = await criarPaciente();
    const res = await request(app).get(`/api/pacientes/${id}/receita-preparo-pele`);
    expect(res.status).toBe(200);
    expect(res.body.receitaPreparoPele).toBeNull();
  });

  it("POST multipart anexa o PDF e devolve os metadados (201)", async () => {
    const { id } = await criarPaciente();
    const res = await anexar(id, "exames-joana.pdf");
    expect(res.status).toBe(201);
    expect(res.body.receitaPreparoPele.nomeArquivo).toBe("exames-joana.pdf");
    expect(res.body.receitaPreparoPele.tamanho).toBe(PDF_BYTES.length);

    const get = await request(app).get(`/api/pacientes/${id}/receita-preparo-pele`);
    expect(get.body.receitaPreparoPele.nomeArquivo).toBe("exames-joana.pdf");
  });

  it("POST substitui o pedido anterior (um por paciente)", async () => {
    const { id } = await criarPaciente();
    await anexar(id, "primeiro.pdf");
    await anexar(id, "segundo.pdf");
    const get = await request(app).get(`/api/pacientes/${id}/receita-preparo-pele`);
    expect(get.body.receitaPreparoPele.nomeArquivo).toBe("segundo.pdf");
  });

  it("POST sem arquivo devolve 400", async () => {
    const { id } = await criarPaciente();
    const res = await request(app).post(`/api/pacientes/${id}/receita-preparo-pele`);
    expect(res.status).toBe(400);
  });

  it("POST de não-PDF devolve 400", async () => {
    const { id } = await criarPaciente();
    const res = await request(app)
      .post(`/api/pacientes/${id}/receita-preparo-pele`)
      .attach("arquivo", Buffer.from("oi"), { filename: "x.txt", contentType: "text/plain" });
    expect(res.status).toBe(400);
  });

  it("DELETE remove o pedido (204) e o GET volta a null", async () => {
    const { id } = await criarPaciente();
    await anexar(id);
    const del = await request(app).delete(`/api/pacientes/${id}/receita-preparo-pele`);
    expect(del.status).toBe(204);
    const get = await request(app).get(`/api/pacientes/${id}/receita-preparo-pele`);
    expect(get.body.receitaPreparoPele).toBeNull();
  });

  it("POST em paciente inexistente devolve 404", async () => {
    const res = await anexar(99999999);
    expect(res.status).toBe(404);
  });
});

describe("Receita de preparo da pele — página pública", () => {
  it("expõe o pedido com token opaco (nunca o caminho do objeto)", async () => {
    const { id, token } = await criarPaciente();
    await anexar(id, "exames.pdf");

    const pagina = await request(app).get(`/api/publico/${token}`);
    expect(pagina.status).toBe(200);
    expect(pagina.body.receitaPreparoPele).not.toBeNull();
    expect(pagina.body.receitaPreparoPele.nomeArquivo).toBe("exames.pdf");
    expect(typeof pagina.body.receitaPreparoPele.token).toBe("string");
    // Nunca vaza o caminho interno do objeto.
    expect(JSON.stringify(pagina.body.receitaPreparoPele)).not.toContain("objeto-fake");
  });

  it("baixa via token público da paciente (stream de PDF)", async () => {
    const { id, token } = await criarPaciente();
    await anexar(id);
    const pagina = await request(app).get(`/api/publico/${token}`);
    const receitaToken = pagina.body.receitaPreparoPele.token as string;

    const dl = await request(app).get(
      `/api/publico/${token}/receita-preparo-pele/${receitaToken}/download`,
    );
    expect(dl.status).toBe(200);
    expect(dl.headers["content-type"]).toContain("application/pdf");
  });

  it("recusa token de pedido que não pertence à paciente do link (404)", async () => {
    const a = await criarPaciente();
    const b = await criarPaciente();
    await anexar(a.id);
    const paginaA = await request(app).get(`/api/publico/${a.token}`);
    const tokenDeA = paginaA.body.receitaPreparoPele.token as string;

    // Usa o token do pedido de A, mas o link (token) de B → 404.
    const dl = await request(app).get(
      `/api/publico/${b.token}/receita-preparo-pele/${tokenDeA}/download`,
    );
    expect(dl.status).toBe(404);
  });

  it("página sem pedido devolve receitaPreparoPele = null", async () => {
    const { token } = await criarPaciente();
    const pagina = await request(app).get(`/api/publico/${token}`);
    expect(pagina.body.receitaPreparoPele).toBeNull();
  });
});
