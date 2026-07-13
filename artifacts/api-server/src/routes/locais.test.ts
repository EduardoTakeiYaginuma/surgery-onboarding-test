import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { db, pacientesTable, locaisTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import app from "../app";

const pacientesCriados: number[] = [];
const locaisCriados: number[] = [];
const TELEFONE_VALIDO = "11987654321";

/** CPF válido determinístico a partir de um seed de 9 dígitos. */
function gerarCpf(seed: number): string {
  const base = String(seed).padStart(9, "0").slice(-9);
  const digits = base.split("").map(Number);
  const s1 = digits.reduce((a, d, i) => a + d * (10 - i), 0);
  digits.push(s1 % 11 < 2 ? 0 : 11 - (s1 % 11));
  const s2 = digits.reduce((a, d, i) => a + d * (11 - i), 0);
  digits.push(s2 % 11 < 2 ? 0 : 11 - (s2 % 11));
  const cpf = digits.join("");
  return /^(\d)\1{10}$/.test(cpf) ? gerarCpf(seed + 1) : cpf;
}
let _seed = 200000000 + Math.floor(Math.random() * 500000000);
const cpfUnico = () => gerarCpf(_seed++);

async function criarPaciente(overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/pacientes")
    .send({
      nome: "Paciente Local",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-08-15",
      valorSinal: 3000,
      ...overrides,
    });
  if (res.status === 201) pacientesCriados.push(res.body.paciente.id);
  return res;
}

afterAll(async () => {
  if (pacientesCriados.length > 0) {
    await db
      .delete(pacientesTable)
      .where(inArray(pacientesTable.id, pacientesCriados));
  }
  if (locaisCriados.length > 0) {
    await db.delete(locaisTable).where(inArray(locaisTable.id, locaisCriados));
  }
});

describe("GET /locais", () => {
  it("devolve os locais padrão semeados (com id)", async () => {
    const res = await request(app).get("/api/locais");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const avant = res.body.find((l: { nome: string }) => l.nome === "Avant Moema");
    expect(avant).toBeTruthy();
    expect(typeof avant.id).toBe("number");
    expect(avant.nomeCompleto).toBe("Avant Moema Day Hospital");
    expect(avant.instrucoesChegada.length).toBeGreaterThan(0);
  });
});

describe("CRUD /locais", () => {
  it("cria, edita e remove um local", async () => {
    const nomeUnico = `Clínica Teste ${_seed}`;
    const criado = await request(app)
      .post("/api/locais")
      .send({
        nome: nomeUnico,
        nomeCompleto: "Clínica Teste Completa",
        endereco: "Rua X, 1",
        contatoCcNome: "Fulana",
        contatoCcTelefone: "(11) 90000-0000",
        instrucoesChegada: "Chegue 1h antes.",
      });
    expect(criado.status).toBe(201);
    const id = criado.body.id as number;
    locaisCriados.push(id);
    expect(criado.body.nome).toBe(nomeUnico);

    // Nome duplicado → 409.
    const dup = await request(app).post("/api/locais").send({ nome: nomeUnico });
    expect(dup.status).toBe(409);

    // Edita.
    const patch = await request(app)
      .patch(`/api/locais/${id}`)
      .send({ endereco: "Rua Y, 2", ativo: false });
    expect(patch.status).toBe(200);
    expect(patch.body.endereco).toBe("Rua Y, 2");
    expect(patch.body.ativo).toBe(false);

    // Some da lista de ativos, mas aparece com incluirInativos.
    const ativos = await request(app).get("/api/locais");
    expect(ativos.body.find((l: { id: number }) => l.id === id)).toBeFalsy();
    const todos = await request(app).get("/api/locais?incluirInativos=true");
    expect(todos.body.find((l: { id: number }) => l.id === id)).toBeTruthy();

    // Remove.
    const del = await request(app).delete(`/api/locais/${id}`);
    expect(del.status).toBe(204);
    const del404 = await request(app).delete(`/api/locais/${id}`);
    expect(del404.status).toBe(404);
  });
});

describe("POST /pacientes — vínculo de local", () => {
  it("vincula por localId e grava o snapshot (mensagens usam o local)", async () => {
    const locais = await request(app).get("/api/locais");
    const einstein = locais.body.find(
      (l: { nome: string }) => l.nome === "Albert Einstein",
    );
    const res = await criarPaciente({ localId: einstein.id, local: "ignorado" });
    expect(res.status).toBe(201);
    expect(res.body.paciente.localId).toBe(einstein.id);
    // O texto do local no cadastro passa a ser o do local escolhido, não o enviado.
    expect(res.body.paciente.local).toBe("Albert Einstein");
    // A saída operacional traz o contato do CC do local escolhido.
    expect(res.body.saidas.a4).toContain("Einstein");
  });

  it("texto livre sem localId cria um novo local e vincula", async () => {
    const nome = `Hospital Novo ${_seed}`;
    const res = await criarPaciente({
      local: nome,
      localEndereco: "Av. Nova, 100",
    });
    expect(res.status).toBe(201);
    expect(typeof res.body.paciente.localId).toBe("number");
    // O novo local aparece na lista configurável.
    const locais = await request(app).get("/api/locais?incluirInativos=true");
    const novo = locais.body.find((l: { nome: string }) => l.nome === nome);
    expect(novo).toBeTruthy();
    if (novo) locaisCriados.push(novo.id);
    expect(novo.endereco).toBe("Av. Nova, 100");
  });
});

describe("POST /pacientes — CPF obrigatório", () => {
  it("rejeita cadastro sem CPF", async () => {
    const res = await request(app)
      .post("/api/pacientes")
      .send({
        nome: "Sem CPF",
        telefone: TELEFONE_VALIDO,
        procedimentos: ["Blefaroplastia"],
        dataCirurgia: "2026-08-15",
        valorSinal: 3000,
      });
    expect(res.status).toBe(400);
  });
});
