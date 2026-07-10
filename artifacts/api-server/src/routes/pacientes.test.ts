import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Readable } from "stream";
import type { File } from "@google-cloud/storage";
import {
  db,
  pacientesTable,
  pacientesDocumentosTable,
  configContratoTable,
} from "@workspace/db";
import { inArray } from "drizzle-orm";
import app from "../app";
import * as autentique from "../lib/autentique";
import { ObjectStorageService } from "../lib/objectStorage";
import { MARCOS_JORNADA } from "../lib/jornada-equipe";

// IDs criados durante os testes; limpos no afterAll (cascade remove o histórico).
const pacientesCriados: number[] = [];

// CPF/telefone que passam pela validação de formato da API (apenas dígitos).
// CPF_VALIDO é usado SOMENTE em testes de validação de formato (não criam paciente).
const CPF_VALIDO = "11144477735";
const TELEFONE_VALIDO = "11987654321";

/**
 * Gera um CPF matematicamente válido a partir de um seed inteiro de 9 dígitos.
 * Calcula os dois dígitos verificadores e rejeita sequências repetidas (inválidas
 * pela regra da Receita Federal).
 */
function gerarCpf(seed: number): string {
  const base = String(seed).padStart(9, "0").slice(-9);
  const digits = base.split("").map(Number);

  const sum1 = digits.reduce((acc, d, i) => acc + d * (10 - i), 0);
  const d1 = sum1 % 11 < 2 ? 0 : 11 - (sum1 % 11);
  digits.push(d1);

  const sum2 = digits.reduce((acc, d, i) => acc + d * (11 - i), 0);
  const d2 = sum2 % 11 < 2 ? 0 : 11 - (sum2 % 11);
  digits.push(d2);

  const cpf = digits.join("");
  // CPFs com todos os dígitos iguais são inválidos por regra.
  if (/^(\d)\1{10}$/.test(cpf)) return gerarCpf(seed + 1);
  return cpf;
}

// Seed aleatório: garante que cada execução — e cada arquivo de teste rodando
// em paralelo — use sequências de CPF distintas, sem colidir com pacientes
// remanescentes de runs anteriores no banco compartilhado de testes.
let _cpfSeed = 100000000 + Math.floor(Math.random() * 800000000);
/** Retorna um novo CPF válido a cada chamada (garante unicidade na sessão de testes). */
function cpfUnico(): string {
  return gerarCpf(_cpfSeed++);
}

async function criarPaciente(
  overrides: Record<string, unknown> = {},
): Promise<number> {
  const res = await request(app)
    .post("/api/pacientes")
    .send({
      nome: "Paciente Teste",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-08-15",
      valorSinal: 3000,
      ...overrides,
    });
  expect(res.status).toBe(201);
  const id = res.body.paciente.id as number;
  pacientesCriados.push(id);
  return id;
}

function historico(id: number) {
  return request(app).get(`/api/pacientes/${id}/historico`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterAll(async () => {
  if (pacientesCriados.length > 0) {
    await db
      .delete(pacientesTable)
      .where(inArray(pacientesTable.id, pacientesCriados));
  }
});

describe("PATCH /pacientes/:id", () => {
  it("atualiza os campos e devolve o paciente atualizado", async () => {
    const id = await criarPaciente({ horario: "06:00" });

    const res = await request(app)
      .patch(`/api/pacientes/${id}`)
      .send({ nome: "Maria Atualizada", horario: "08:30", valorSinal: 4500 });

    expect(res.status).toBe(200);
    expect(res.body.paciente.id).toBe(id);
    expect(res.body.paciente.nome).toBe("Maria Atualizada");
    expect(res.body.paciente.horario).toBe("08:30");
    expect(res.body.paciente.valorSinal).toBe(4500);
    // As saídas devem ser remontadas a partir dos novos dados.
    expect(res.body.saidas).toBeDefined();
  });

  it("devolve 404 para um id inexistente", async () => {
    const res = await request(app)
      .patch("/api/pacientes/99999999")
      .send({ nome: "Não existe" });
    expect(res.status).toBe(404);
  });

  it("rejeita atualização de CPF para um já cadastrado (409)", async () => {
    // CPF diferente do CPF_VALIDO padrão.
    const CPF_OUTRO = "52998224725";
    const idA = await criarPaciente({ cpf: CPF_OUTRO, dataCirurgia: "2026-10-01" });
    const idB = await criarPaciente({ dataCirurgia: "2026-10-02" });

    const res = await request(app)
      .patch(`/api/pacientes/${idB}`)
      .send({ cpf: CPF_OUTRO });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/cpf.*cadastrado/i);

    // Garantia: atualizar para o próprio CPF não é conflito.
    const resOk = await request(app)
      .patch(`/api/pacientes/${idA}`)
      .send({ cpf: CPF_OUTRO });
    expect(resOk.status).toBe(200);
  });

  it("devolve 400 quando o corpo não traz campos para atualizar", async () => {
    const id = await criarPaciente();
    const res = await request(app).patch(`/api/pacientes/${id}`).send({});
    expect(res.status).toBe(400);
  });
});

describe("trilha de histórico ao editar", () => {
  it("registra uma linha com campo/rotulo/de/para quando há mudança real", async () => {
    const id = await criarPaciente({ horario: "06:00", valorSinal: 3000 });

    const res = await request(app)
      .patch(`/api/pacientes/${id}`)
      .send({ horario: "09:15", valorSinal: 5000 });
    expect(res.status).toBe(200);

    const hist = await historico(id);
    expect(hist.status).toBe(200);
    expect(hist.body).toHaveLength(1);

    const { alteracoes } = hist.body[0];
    expect(alteracoes).toHaveLength(2);

    const porCampo = Object.fromEntries(
      alteracoes.map((a: { campo: string }) => [a.campo, a]),
    );

    expect(porCampo.horario).toEqual({
      campo: "horario",
      rotulo: "Horário",
      de: "06:00",
      para: "09:15",
    });
    expect(porCampo.valorSinal).toEqual({
      campo: "valorSinal",
      rotulo: "Valor pago",
      de: "R$ 3.000,00",
      para: "R$ 5.000,00",
    });
  });

  it("não registra histórico quando a edição é um no-op", async () => {
    const id = await criarPaciente({ nome: "Sem Mudança", horario: "07:00" });

    // Reenvia exatamente os mesmos valores: o diff deve ficar vazio.
    const res = await request(app)
      .patch(`/api/pacientes/${id}`)
      .send({ nome: "Sem Mudança", horario: "07:00" });
    expect(res.status).toBe(200);

    const hist = await historico(id);
    expect(hist.status).toBe(200);
    expect(hist.body).toHaveLength(0);
  });
});

describe("GET /pacientes/:id/historico", () => {
  it("retorna as edições da mais recente para a mais antiga", async () => {
    const id = await criarPaciente({ nome: "Ordem Teste" });

    await request(app).patch(`/api/pacientes/${id}`).send({ nome: "Primeira" });
    await sleep(15);
    await request(app).patch(`/api/pacientes/${id}`).send({ nome: "Segunda" });

    const hist = await historico(id);
    expect(hist.status).toBe(200);
    expect(hist.body).toHaveLength(2);

    // Mais recente primeiro: a edição "Segunda" deve aparecer no topo.
    const [maisRecente, maisAntigo] = hist.body;
    expect(maisRecente.alteracoes[0].para).toBe("Segunda");
    expect(maisAntigo.alteracoes[0].para).toBe("Primeira");
    expect(
      new Date(maisRecente.createdAt).getTime(),
    ).toBeGreaterThanOrEqual(new Date(maisAntigo.createdAt).getTime());
  });

  it("devolve 404 para um paciente inexistente", async () => {
    const res = await historico(99999999);
    expect(res.status).toBe(404);
  });
});

describe("POST /pacientes/:id/lembrete", () => {
  it("credita o autor informado no evento e o expõe na listagem", async () => {
    const id = await criarPaciente({ nome: "Lembrete Com Autor" });

    const res = await request(app)
      .post(`/api/pacientes/${id}/lembrete`)
      .send({ autor: "Ana" });
    expect(res.status).toBe(201);
    expect(res.body.autor).toBe("Ana");
    expect(res.body.tipo).toBe("lembrete_whatsapp");
    expect(res.body.descricao).toContain("Ana");

    // A listagem agrega o último lembrete: quem (lembradoPor) e quando.
    const lista = await request(app).get("/api/pacientes");
    expect(lista.status).toBe(200);
    const card = lista.body.find((p: { id: number }) => p.id === id);
    expect(card.lembradoPor).toBe("Ana");
    expect(card.lembreteEnviadoEm).toBeTruthy();

    // A timeline guarda o evento com o autor.
    const timeline = await request(app).get(`/api/pacientes/${id}/timeline`);
    const lembrete = timeline.body.find(
      (e: { tipo: string }) => e.tipo === "lembrete_whatsapp",
    );
    expect(lembrete.autor).toBe("Ana");
  });

  it("aceita corpo vazio e credita a equipe (sem autor)", async () => {
    const id = await criarPaciente({ nome: "Lembrete Sem Autor" });

    const res = await request(app).post(`/api/pacientes/${id}/lembrete`).send();
    expect(res.status).toBe(201);
    expect(res.body.autor).toBeNull();
    expect(res.body.descricao).toContain("A equipe");

    const lista = await request(app).get("/api/pacientes");
    const card = lista.body.find((p: { id: number }) => p.id === id);
    expect(card.lembradoPor).toBeNull();
    expect(card.lembreteEnviadoEm).toBeTruthy();
  });

  it("usa o autor do último lembrete quando há mais de um", async () => {
    const id = await criarPaciente({ nome: "Lembrete Dois Autores" });

    await request(app)
      .post(`/api/pacientes/${id}/lembrete`)
      .send({ autor: "Ana" });
    await sleep(15);
    await request(app)
      .post(`/api/pacientes/${id}/lembrete`)
      .send({ autor: "Bruna" });

    const lista = await request(app).get("/api/pacientes");
    const card = lista.body.find((p: { id: number }) => p.id === id);
    expect(card.lembradoPor).toBe("Bruna");
  });

  it("devolve 404 para um paciente inexistente", async () => {
    const res = await request(app)
      .post("/api/pacientes/99999999/lembrete")
      .send({ autor: "Ana" });
    expect(res.status).toBe(404);
  });
});

describe("POST /pacientes", () => {
  it("cria o paciente e devolve as saídas geradas", async () => {
    const res = await request(app).post("/api/pacientes").send({
      nome: "Joana Criada",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-09-10",
      horario: "06:00",
      valorSinal: 3500,
    });

    expect(res.status).toBe(201);
    pacientesCriados.push(res.body.paciente.id as number);

    expect(res.body.paciente.id).toBeTypeOf("number");
    expect(res.body.paciente.nome).toBe("Joana Criada");
    expect(res.body.paciente.tokenPublico).toBeTruthy();

    // Saídas: mensagem, blocos operacionais e checklist devem estar presentes.
    const { saidas } = res.body;
    expect(saidas.link).toContain(res.body.paciente.codigoPublico);
    expect(saidas.mensagemUnica).toContain("Joana");
    expect(saidas.a6).toBeTruthy();
    expect(saidas.a4).toBeTruthy();
    expect(saidas.a5).toBeTruthy();
    expect(Array.isArray(saidas.checklistMedx)).toBe(true);
  });

  it("sem laser: a receita pré-laser fica fora do checklist", async () => {
    const res = await request(app).post("/api/pacientes").send({
      nome: "Sem Laser",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-09-11",
      valorSinal: 3000,
      laser: false,
    });
    expect(res.status).toBe(201);
    pacientesCriados.push(res.body.paciente.id as number);

    const preLaser = res.body.saidas.checklistMedx.find(
      (i: { titulo: string }) => i.titulo === "Receita pré-laser CO₂",
    );
    expect(preLaser.incluido).toBe(false);
  });

  it("com laser: a receita pré-laser entra no checklist", async () => {
    const res = await request(app).post("/api/pacientes").send({
      nome: "Com Laser",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-09-12",
      valorSinal: 3000,
      laser: true,
    });
    expect(res.status).toBe(201);
    pacientesCriados.push(res.body.paciente.id as number);

    const preLaser = res.body.saidas.checklistMedx.find(
      (i: { titulo: string }) => i.titulo === "Receita pré-laser CO₂",
    );
    expect(preLaser.incluido).toBe(true);
  });

  it("devolve 400 quando o corpo é inválido", async () => {
    const res = await request(app).post("/api/pacientes").send({ nome: "" });
    expect(res.status).toBe(400);
  });

  it("rejeita CPF/telefone fora do formato (não-dígitos ou tamanho errado)", async () => {
    const res = await request(app).post("/api/pacientes").send({
      nome: "Formato Ruim",
      cpf: "123",
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-09-20",
      valorSinal: 1000,
    });
    expect(res.status).toBe(400);
  });

  it("rejeita CPF com dígito verificador inválido (11 dígitos)", async () => {
    const res = await request(app).post("/api/pacientes").send({
      nome: "CPF Checksum",
      cpf: "12345678900",
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-09-22",
      valorSinal: 1000,
    });
    expect(res.status).toBe(400);
  });

  it("rejeita telefone com formato inválido (11 dígitos sem o 9)", async () => {
    const res = await request(app).post("/api/pacientes").send({
      nome: "Telefone Ruim",
      cpf: cpfUnico(),
      telefone: "11812345678",
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-09-23",
      valorSinal: 1000,
    });
    expect(res.status).toBe(400);
  });

  it("rejeita CPF duplicado com 409 e mensagem clara", async () => {
    const cpfDuplicar = cpfUnico();

    // Cria a primeira paciente com o CPF.
    const primeiro = await request(app).post("/api/pacientes").send({
      nome: "Maria Original",
      cpf: cpfDuplicar,
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-09-24",
      valorSinal: 2000,
    });
    expect(primeiro.status).toBe(201);
    pacientesCriados.push(primeiro.body.paciente.id as number);

    // Tenta criar outra paciente com o mesmo CPF.
    const segundo = await request(app).post("/api/pacientes").send({
      nome: "Maria Duplicada",
      cpf: cpfDuplicar,
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Rinoplastia"],
      dataCirurgia: "2026-09-25",
      valorSinal: 3000,
    });
    expect(segundo.status).toBe(409);
    expect(segundo.body.message).toMatch(/cpf.*cadastrado/i);
    expect(segundo.body.codigo).toBe("cpf_ativo");
  });

  it("oferece restauração quando o CPF pertence a um cadastro arquivado", async () => {
    const cpf = cpfUnico();

    // Cria e arquiva a paciente original.
    const original = await request(app).post("/api/pacientes").send({
      nome: "Maria Voltou",
      cpf,
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-09-24",
      valorSinal: 2000,
    });
    expect(original.status).toBe(201);
    const idOriginal = original.body.paciente.id as number;
    pacientesCriados.push(idOriginal);
    await request(app).post(`/api/pacientes/${idOriginal}/arquivar`).expect(200);

    // Recadastrar com o mesmo CPF não dá 409 genérico: devolve o resumo do
    // arquivado para o Console oferecer a restauração.
    const conflito = await request(app).post("/api/pacientes").send({
      nome: "Maria Voltou",
      cpf,
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Rinoplastia"],
      dataCirurgia: "2026-10-10",
      valorSinal: 3000,
    });
    expect(conflito.status).toBe(409);
    expect(conflito.body.codigo).toBe("cpf_arquivado");
    expect(conflito.body.pacienteArquivado.id).toBe(idOriginal);
    expect(conflito.body.pacienteArquivado.nome).toBe("Maria Voltou");
  });

  it("permite criar um novo cadastro com permitirCpfArquivado quando só há arquivado", async () => {
    const cpf = cpfUnico();

    const original = await request(app).post("/api/pacientes").send({
      nome: "Ana Retorno",
      cpf,
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-09-24",
      valorSinal: 2000,
    });
    expect(original.status).toBe(201);
    const idOriginal = original.body.paciente.id as number;
    pacientesCriados.push(idOriginal);
    await request(app).post(`/api/pacientes/${idOriginal}/arquivar`).expect(200);

    const novo = await request(app).post("/api/pacientes").send({
      nome: "Ana Retorno",
      cpf,
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Rinoplastia"],
      dataCirurgia: "2026-10-10",
      valorSinal: 3000,
      permitirCpfArquivado: true,
    });
    expect(novo.status).toBe(201);
    expect(novo.body.paciente.id).not.toBe(idOriginal);
    pacientesCriados.push(novo.body.paciente.id as number);
  });

  it("ainda bloqueia quando há um cadastro ATIVO mesmo com permitirCpfArquivado", async () => {
    const cpf = cpfUnico();

    const ativo = await request(app).post("/api/pacientes").send({
      nome: "Clara Ativa",
      cpf,
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-09-24",
      valorSinal: 2000,
    });
    expect(ativo.status).toBe(201);
    pacientesCriados.push(ativo.body.paciente.id as number);

    const conflito = await request(app).post("/api/pacientes").send({
      nome: "Clara Duplicada",
      cpf,
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Rinoplastia"],
      dataCirurgia: "2026-10-10",
      valorSinal: 3000,
      permitirCpfArquivado: true,
    });
    expect(conflito.status).toBe(409);
    expect(conflito.body.codigo).toBe("cpf_ativo");
  });

  it("rejeita data da cirurgia no passado", async () => {
    const res = await request(app).post("/api/pacientes").send({
      nome: "Cirurgia Passada",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2020-01-01",
      valorSinal: 1000,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/passado/i);
  });

  it("rejeita data da cirurgia em formato inválido", async () => {
    const res = await request(app).post("/api/pacientes").send({
      nome: "Cirurgia Data Ruim",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-13-40",
      valorSinal: 1000,
    });
    expect(res.status).toBe(400);
  });

  it("rejeita data do pagamento pendente no passado", async () => {
    const res = await request(app).post("/api/pacientes").send({
      nome: "Saldo Passado",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-09-14",
      valorSinal: 1000,
      valorPendente: 2000,
      dataPagamentoPendente: "2020-05-05",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/passado/i);
  });

  it("aceita data da cirurgia igual a hoje", async () => {
    const hoje = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const res = await request(app).post("/api/pacientes").send({
      nome: "Cirurgia Hoje",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: hoje,
      valorSinal: 1000,
    });
    expect(res.status).toBe(201);
    pacientesCriados.push(res.body.paciente.id as number);
  });

  it("guarda e devolve CPF e telefone apenas com dígitos", async () => {
    const meuCpf = cpfUnico();
    const res = await request(app).post("/api/pacientes").send({
      nome: "Com Documentos",
      cpf: meuCpf,
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-09-21",
      valorSinal: 1000,
    });
    expect(res.status).toBe(201);
    pacientesCriados.push(res.body.paciente.id as number);
    expect(res.body.paciente.cpf).toBe(meuCpf);
    expect(res.body.paciente.telefone).toBe(TELEFONE_VALIDO);
  });

  it("preenche vencimento automaticamente (2 dias úteis) quando há saldo e a data não foi informada", async () => {
    // 2026-09-14 (segunda) → 2 dias úteis antes = 2026-09-10 (quinta)
    const res = await request(app).post("/api/pacientes").send({
      nome: "Vencimento Auto",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-09-14",
      valorSinal: 3000,
      valorPendente: 2000,
    });
    expect(res.status).toBe(201);
    pacientesCriados.push(res.body.paciente.id as number);
    expect(res.body.paciente.dataPagamentoPendente).toBe("2026-09-10");
  });

  it("pula fins de semana ao calcular o vencimento automático", async () => {
    // 2026-09-07 (segunda) → 2 dias úteis antes:
    //   recua 1 → 2026-09-06 (dom) — pula; recua 2 → 2026-09-05 (sáb) — pula;
    //   recua 3 → 2026-09-04 (sex) — conta 1; recua 4 → 2026-09-03 (qui) — conta 2 ✓
    const res = await request(app).post("/api/pacientes").send({
      nome: "Vencimento Fim de Semana",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-09-07",
      valorSinal: 1000,
      valorPendente: 500,
    });
    expect(res.status).toBe(201);
    pacientesCriados.push(res.body.paciente.id as number);
    expect(res.body.paciente.dataPagamentoPendente).toBe("2026-09-03");
  });

  it("pula feriados ao calcular o vencimento automático", async () => {
    // 2026-07-13 (segunda) → 2 dias úteis antes:
    //   recua 1 → 2026-07-12 (dom) — pula; recua 2 → 2026-07-11 (sáb) — pula;
    //   recua 3 → 2026-07-10 (sex) — conta 1;
    //   recua 4 → 2026-07-09 (qui, Revolução Constitucionalista/SP) — feriado, pula;
    //   recua 5 → 2026-07-08 (qua) — conta 2 ✓
    const res = await request(app).post("/api/pacientes").send({
      nome: "Vencimento Feriado",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-07-13",
      valorSinal: 1000,
      valorPendente: 500,
    });
    expect(res.status).toBe(201);
    pacientesCriados.push(res.body.paciente.id as number);
    expect(res.body.paciente.dataPagamentoPendente).toBe("2026-07-08");
  });

  it("respeita a data de vencimento informada pela equipe (não sobrescreve)", async () => {
    const res = await request(app).post("/api/pacientes").send({
      nome: "Vencimento Manual",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-09-14",
      valorSinal: 3000,
      valorPendente: 2000,
      dataPagamentoPendente: "2026-09-01",
    });
    expect(res.status).toBe(201);
    pacientesCriados.push(res.body.paciente.id as number);
    expect(res.body.paciente.dataPagamentoPendente).toBe("2026-09-01");
  });

  it("não preenche vencimento quando não há saldo pendente", async () => {
    const res = await request(app).post("/api/pacientes").send({
      nome: "Sem Saldo",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-09-14",
      valorSinal: 5000,
      valorPendente: 0,
    });
    expect(res.status).toBe(201);
    pacientesCriados.push(res.body.paciente.id as number);
    expect(res.body.paciente.dataPagamentoPendente).toBeNull();
  });
});

describe("vencimento do saldo: default 2 dias úteis no PATCH", () => {
  it("preenche vencimento automaticamente ao adicionar saldo numa paciente sem data", async () => {
    // Cria sem saldo, depois adiciona saldo via PATCH sem informar vencimento.
    const id = await criarPaciente({ valorSinal: 5000, dataCirurgia: "2026-09-14" });

    const res = await request(app)
      .patch(`/api/pacientes/${id}`)
      .send({ valorPendente: 2000 });

    expect(res.status).toBe(200);
    expect(res.body.paciente.dataPagamentoPendente).toBe("2026-09-10");
  });

  it("não sobrescreve vencimento já salvo ao editar outros campos", async () => {
    const id = await criarPaciente({
      dataCirurgia: "2026-09-14",
      valorSinal: 3000,
      valorPendente: 2000,
      dataPagamentoPendente: "2026-08-20",
    });

    const res = await request(app)
      .patch(`/api/pacientes/${id}`)
      .send({ nome: "Nome Editado" });

    expect(res.status).toBe(200);
    expect(res.body.paciente.dataPagamentoPendente).toBe("2026-08-20");
  });
});

describe("vencimento do saldo: usa o lead time configurado pela equipe", () => {
  // O singleton de config é compartilhado; restaura para o padrão (linha
  // removida → default 1) após cada caso para não vazar estado entre testes.
  afterEach(async () => {
    await db.delete(configContratoTable);
  });

  it("PUT /config/contrato salva o lead time e o GET /config o reflete", async () => {
    const put = await request(app)
      .put("/api/config/contrato")
      .send({ prazoAssinaturaDiasAntes: 2, vencimentoSaldoDiasUteisAntes: 4 });
    expect(put.status).toBe(200);
    expect(put.body.vencimentoSaldoDiasUteisAntes).toBe(4);

    const cfg = await request(app).get("/api/config");
    expect(cfg.status).toBe(200);
    expect(cfg.body.vencimentoSaldoDiasUteisAntes).toBe(4);
  });

  it("rejeita um prazo acima de 60 (sem salvar) com 400", async () => {
    const put = await request(app)
      .put("/api/config/contrato")
      .send({ prazoAssinaturaDiasAntes: 99, vencimentoSaldoDiasUteisAntes: 4 });
    expect(put.status).toBe(400);

    // Nada foi persistido: o GET volta para o padrão (1 = ≈24h/D-1), não 99/60.
    const cfg = await request(app).get("/api/config/contrato");
    expect(cfg.status).toBe(200);
    expect(cfg.body.prazoAssinaturaDiasAntes).toBe(1);
  });

  it("rejeita um prazo negativo com 400", async () => {
    const put = await request(app)
      .put("/api/config/contrato")
      .send({ prazoAssinaturaDiasAntes: 2, vencimentoSaldoDiasUteisAntes: -1 });
    expect(put.status).toBe(400);
  });

  it("rejeita um prazo não inteiro com 400", async () => {
    const put = await request(app)
      .put("/api/config/contrato")
      .send({ prazoAssinaturaDiasAntes: 2.5, vencimentoSaldoDiasUteisAntes: 4 });
    expect(put.status).toBe(400);
  });

  it("aplica o lead time configurado (não o padrão 2) ao pré-preencher no POST", async () => {
    // Configura 4 dias úteis antes. Com cirurgia em 2026-09-14 (segunda):
    //   recua dom/sáb (pula); sex 09-11 (1); qui 09-10 (2); qua 09-09 (3);
    //   ter 09-08 (4) ✓ — comprova que o valor da equipe é usado, não o 2 fixo.
    await request(app)
      .put("/api/config/contrato")
      .send({ prazoAssinaturaDiasAntes: 2, vencimentoSaldoDiasUteisAntes: 4 });

    const res = await request(app).post("/api/pacientes").send({
      nome: "Lead Time Configurado",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-09-14",
      valorSinal: 3000,
      valorPendente: 2000,
    });
    expect(res.status).toBe(201);
    pacientesCriados.push(res.body.paciente.id as number);
    expect(res.body.paciente.dataPagamentoPendente).toBe("2026-09-08");
  });

  it("aplica o lead time configurado também no PATCH", async () => {
    await request(app)
      .put("/api/config/contrato")
      .send({ prazoAssinaturaDiasAntes: 2, vencimentoSaldoDiasUteisAntes: 4 });

    const id = await criarPaciente({ valorSinal: 5000, dataCirurgia: "2026-09-14" });
    const res = await request(app)
      .patch(`/api/pacientes/${id}`)
      .send({ valorPendente: 2000 });

    expect(res.status).toBe(200);
    expect(res.body.paciente.dataPagamentoPendente).toBe("2026-09-08");
  });
});

describe("GET /publico/:token", () => {
  it("devolve a página pública para um token válido", async () => {
    const create = await request(app).post("/api/pacientes").send({
      nome: "Paciente Pública",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-10-01",
      horario: "07:30",
      valorSinal: 3000,
    });
    expect(create.status).toBe(201);
    pacientesCriados.push(create.body.paciente.id as number);
    const token = create.body.paciente.tokenPublico as string;

    const res = await request(app).get(`/api/publico/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.nome).toBe("Paciente Pública");
    expect(res.body.primeiroNome).toBe("Paciente");
    expect(res.body.horario).toBe("07:30");
    expect(res.body.cpf).toBeUndefined();
    expect(res.body.telefone).toBeUndefined();
    expect(Array.isArray(res.body.secoes)).toBe(true);
    expect(res.body.secoes.length).toBeGreaterThan(0);
    // A política de remarcação referencia o valor TOTAL da cirurgia (não "sinal").
    const politica = res.body.secoes.find(
      (s: { tipo: string }) => s.tipo === "politica",
    );
    expect(politica.corpo).toContain("valor total da cirurgia");
    expect(politica.corpo).not.toContain("do sinal");
    // Variáveis resolvidas server-side e datas da linha do tempo calculadas.
    const linha = res.body.secoes.find(
      (s: { tipo: string }) => s.tipo === "linha_do_tempo",
    );
    expect(linha.etapas[0].data).toBe("01/10/2026");
    const corpoTudo = JSON.stringify(res.body.secoes);
    expect(corpoTudo).not.toContain("{{");
  });

  it("devolve 404 para um token desconhecido (mas válido como UUID)", async () => {
    const res = await request(app).get(
      "/api/publico/00000000-0000-4000-8000-000000000000",
    );
    expect(res.status).toBe(404);
  });

  it("devolve 404 para um token malformado (não-UUID)", async () => {
    const res = await request(app).get("/api/publico/nao-e-uuid");
    expect(res.status).toBe(404);
  });
});

describe("PUT /publico/:token/tema", () => {
  it("começa null, persiste a escolha e a devolve na página", async () => {
    const create = await request(app).post("/api/pacientes").send({
      nome: "Paciente Tema",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-11-02",
      horario: "08:00",
      valorSinal: 2500,
    });
    expect(create.status).toBe(201);
    pacientesCriados.push(create.body.paciente.id as number);
    const token = create.body.paciente.tokenPublico as string;

    // Primeira abertura: nenhum tema escolhido ainda (cai no padrão claro).
    const antes = await request(app).get(`/api/publico/${token}`);
    expect(antes.status).toBe(200);
    expect(antes.body.tema).toBeNull();

    // A paciente escolhe escuro.
    const salvar = await request(app)
      .put(`/api/publico/${token}/tema`)
      .send({ tema: "dark" });
    expect(salvar.status).toBe(200);
    expect(salvar.body.tema).toBe("dark");

    // A escolha acompanha o token em qualquer dispositivo.
    const depois = await request(app).get(`/api/publico/${token}`);
    expect(depois.status).toBe(200);
    expect(depois.body.tema).toBe("dark");
  });

  it("rejeita um valor de tema inválido", async () => {
    const create = await request(app).post("/api/pacientes").send({
      nome: "Paciente Tema Invalido",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-11-03",
      horario: "08:00",
      valorSinal: 2500,
    });
    expect(create.status).toBe(201);
    pacientesCriados.push(create.body.paciente.id as number);
    const token = create.body.paciente.tokenPublico as string;

    const res = await request(app)
      .put(`/api/publico/${token}/tema`)
      .send({ tema: "sepia" });
    expect(res.status).toBe(400);
  });

  it("devolve 404 para um token desconhecido", async () => {
    const res = await request(app)
      .put("/api/publico/00000000-0000-4000-8000-000000000000/tema")
      .send({ tema: "dark" });
    expect(res.status).toBe(404);
  });
});

describe("POST /pacientes/:id/aprovar", () => {
  it("move o estágio para Enviado", async () => {
    const id = await criarPaciente({ nome: "Para Aprovar" });

    const res = await request(app).post(`/api/pacientes/${id}/aprovar`).send();
    expect(res.status).toBe(200);
    expect(res.body.paciente.id).toBe(id);
    expect(res.body.paciente.estagio).toBe("Enviado");
    expect(res.body.saidas).toBeDefined();
  });

  it("devolve 404 para um id inexistente", async () => {
    const res = await request(app)
      .post("/api/pacientes/99999999/aprovar")
      .send();
    expect(res.status).toBe(404);
  });
});

describe("GET /pacientes", () => {
  it("devolve os pacientes criados como DTOs com o formato e tipos corretos", async () => {
    const id = await criarPaciente({
      nome: "Listagem Teste",
      dataCirurgia: "2026-11-05",
      horario: "07:00",
      valorSinal: 4200,
      laser: true,
    });

    const res = await request(app).get("/api/pacientes");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const paciente = res.body.find(
      (p: { id: number }) => p.id === id,
    );
    expect(paciente).toBeDefined();

    // Formato e tipos do DTO.
    expect(paciente.id).toBeTypeOf("number");
    expect(paciente.nome).toBe("Listagem Teste");
    expect(Array.isArray(paciente.procedimentos)).toBe(true);
    expect(paciente.dataCirurgia).toBe("2026-11-05");
    expect(paciente.horario).toBe("07:00");
    expect(paciente.valorSinal).toBe(4200);
    expect(paciente.valorSinal).toBeTypeOf("number");
    expect(paciente.laser).toBe(true);
    expect(paciente.medica).toBeTypeOf("string");
    expect(paciente.crm).toBeTypeOf("string");
    expect(paciente.rqe).toBeTypeOf("string");
    expect(paciente.clinica).toBeTypeOf("string");
    expect(paciente.local).toBeTypeOf("string");
    expect(paciente.equipeAnestesia).toBeTypeOf("string");
    expect(["Fechamento", "Enviado", "Véspera", "Cirurgia"]).toContain(
      paciente.estagio,
    );
    expect(paciente.tokenPublico).toBeTruthy();
    expect(paciente.createdAt).toBeTypeOf("string");
    expect(paciente.updatedAt).toBeTypeOf("string");
  });

  it("agrega o campo abriu: false sem aberturas, true após registrar uma", async () => {
    // Paciente A: nenhuma abertura registrada.
    const idSemAbertura = await criarPaciente({ nome: "Sem Abertura" });

    // Paciente B: cria, descobre o token público e registra uma abertura.
    const createRes = await request(app).post("/api/pacientes").send({
      nome: "Com Abertura",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-09-20",
      valorSinal: 3000,
    });
    expect(createRes.status).toBe(201);
    const idComAbertura = createRes.body.paciente.id as number;
    pacientesCriados.push(idComAbertura);
    const token = createRes.body.paciente.tokenPublico as string;

    const evento = await request(app)
      .post(`/api/publico/${token}/eventos`)
      .send({ tipo: "abertura" });
    expect(evento.status).toBe(204);

    const res = await request(app).get("/api/pacientes");
    expect(res.status).toBe(200);

    const semAbertura = res.body.find(
      (p: { id: number }) => p.id === idSemAbertura,
    );
    const comAbertura = res.body.find(
      (p: { id: number }) => p.id === idComAbertura,
    );
    expect(semAbertura.abriu).toBe(false);
    expect(comAbertura.abriu).toBe(true);
  });

  it("devolve os pacientes ordenados de forma crescente por dataCirurgia", async () => {
    // Cria pacientes fora de ordem de propósito.
    const idMeio = await criarPaciente({
      nome: "Ordem Meio",
      dataCirurgia: "2027-03-15",
    });
    const idCedo = await criarPaciente({
      nome: "Ordem Cedo",
      dataCirurgia: "2027-01-10",
    });
    const idTarde = await criarPaciente({
      nome: "Ordem Tarde",
      dataCirurgia: "2027-05-20",
    });

    const res = await request(app).get("/api/pacientes");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const ids = res.body.map((p: { id: number }) => p.id) as number[];
    const posCedo = ids.indexOf(idCedo);
    const posMeio = ids.indexOf(idMeio);
    const posTarde = ids.indexOf(idTarde);

    // Todos devem aparecer na lista.
    expect(posCedo).toBeGreaterThanOrEqual(0);
    expect(posMeio).toBeGreaterThanOrEqual(0);
    expect(posTarde).toBeGreaterThanOrEqual(0);

    // E na ordem crescente de dataCirurgia.
    expect(posCedo).toBeLessThan(posMeio);
    expect(posMeio).toBeLessThan(posTarde);

    // A lista inteira deve estar em ordem não-decrescente de dataCirurgia.
    const datas = res.body.map(
      (p: { dataCirurgia: string }) => p.dataCirurgia,
    ) as string[];
    const ordenadas = [...datas].sort();
    expect(datas).toEqual(ordenadas);
  });
});

describe("GET /pacientes/resumo", () => {
  it("devolve porMarco + aguardandoContrato + total no novo formato (delta sobre a base)", async () => {
    function totalDoMarco(
      body: { porMarco: { chave: string; total: number }[] },
      chave: string,
    ): number {
      return body.porMarco.find((m) => m.chave === chave)?.total ?? 0;
    }

    // A base pode conter outros pacientes; medimos o delta dos que criamos.
    const antes = await request(app).get("/api/pacientes/resumo");
    expect(antes.status).toBe(200);
    const base = antes.body as {
      total: number;
      aguardandoContrato: number;
      porMarco: { chave: string; rotulo: string; total: number }[];
    };

    // Formato do novo resumo: os 10 marcos na ordem canônica, cada um com total.
    expect(base.total).toBeTypeOf("number");
    expect(base.aguardandoContrato).toBeTypeOf("number");
    expect(Array.isArray(base.porMarco)).toBe(true);
    expect(base.porMarco).toHaveLength(MARCOS_JORNADA.length);
    expect(base.porMarco.map((m) => m.chave)).toEqual(
      MARCOS_JORNADA.map((m) => m.chave),
    );
    for (const m of base.porMarco) {
      expect(m.rotulo).toBeTypeOf("string");
      expect(m.total).toBeTypeOf("number");
    }

    const baseAguardando = base.aguardandoContrato;
    const basePagamento = totalDoMarco(base, "pagamento");
    const baseContrato = totalDoMarco(base, "contrato_assinado");

    // p1: sem nenhum sinal → baseline "Aguardando contrato".
    const idAguardando = await criarPaciente({
      nome: "Resumo Aguardando",
      valorSinal: 0,
    });
    // p2: com valor pago (helper usa valorSinal 3000) → marco "pagamento".
    const idPagamento = await criarPaciente({ nome: "Resumo Pagamento" });
    // p3: contrato assinado, sem pagamento → marco "contrato_assinado".
    const idContrato = await criarPaciente({
      nome: "Resumo Contrato",
      valorSinal: 0,
    });
    await db
      .update(pacientesTable)
      .set({ contratoStatus: "assinado" })
      .where(inArray(pacientesTable.id, [idContrato]));

    const depois = await request(app).get("/api/pacientes/resumo");
    expect(depois.status).toBe(200);
    const r = depois.body as {
      total: number;
      aguardandoContrato: number;
      porMarco: { chave: string; total: number }[];
    };

    expect(r.total).toBe(base.total + 3);
    expect(r.aguardandoContrato).toBe(baseAguardando + 1);
    expect(totalDoMarco(r, "pagamento")).toBe(basePagamento + 1);
    expect(totalDoMarco(r, "contrato_assinado")).toBe(baseContrato + 1);

    // Evita variáveis não utilizadas.
    expect(idAguardando).toBeTypeOf("number");
    expect(idPagamento).toBeTypeOf("number");
  });
});

describe("POST /pacientes/:id/marco-manual", () => {
  it("marca e desmarca um marco pós-operatório (carimbo ↔ null)", async () => {
    // Helper cria com valorSinal 3000 e cirurgia distante → marco "pagamento".
    const id = await criarPaciente({ nome: "Marco Manual" });

    // Marca a retirada de pontos: carimba a data e avança o funil até ela.
    const marcado = await request(app)
      .post(`/api/pacientes/${id}/marco-manual`)
      .send({ marco: "retirada_pontos", concluido: true });
    expect(marcado.status).toBe(200);
    expect(marcado.body.paciente.retiradaPontosEm).not.toBeNull();
    expect(marcado.body.paciente.marcoAtual).toBe("retirada_pontos");
    expect(marcado.body.paciente.marcoAtualIndice).toBe(7);

    // Desmarca: limpa o carimbo e o funil recua para o marco automático
    // anterior ("pagamento", pois valorSinal > 0).
    const desmarcado = await request(app)
      .post(`/api/pacientes/${id}/marco-manual`)
      .send({ marco: "retirada_pontos", concluido: false });
    expect(desmarcado.status).toBe(200);
    expect(desmarcado.body.paciente.retiradaPontosEm).toBeNull();
    expect(desmarcado.body.paciente.marcoAtual).toBe("pagamento");
  });

  it("rejeita marco automático (apenas marcos manuais são aceitos)", async () => {
    const id = await criarPaciente({ nome: "Marco Inválido" });
    const res = await request(app)
      .post(`/api/pacientes/${id}/marco-manual`)
      .send({ marco: "cirurgia", concluido: true });
    expect(res.status).toBe(400);
  });

  it("devolve 404 para paciente inexistente", async () => {
    const res = await request(app)
      .post(`/api/pacientes/999999999/marco-manual`)
      .send({ marco: "retorno_1", concluido: true });
    expect(res.status).toBe(404);
  });
});

describe("procedimentos múltiplos e pagamento", () => {
  it("guarda vários procedimentos e os reflete nas saídas e na página", async () => {
    const create = await request(app).post("/api/pacientes").send({
      nome: "Multi Proc",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia", "Lifting de sobrancelha"],
      dataCirurgia: "2026-12-01",
      horario: "07:30",
      valorSinal: 3000,
      valorPendente: 2000,
      dataPagamentoPendente: "2026-11-29",
    });
    expect(create.status).toBe(201);
    const { paciente, saidas } = create.body;
    pacientesCriados.push(paciente.id as number);

    expect(paciente.procedimentos).toEqual([
      "Blefaroplastia",
      "Lifting de sobrancelha",
    ]);
    expect(paciente.valorPendente).toBe(2000);
    expect(paciente.dataPagamentoPendente).toBe("2026-11-29");
    expect(saidas.a4).toContain("Blefaroplastia, Lifting de sobrancelha");
    expect(saidas.a5).toContain("Blefaroplastia, Lifting de sobrancelha");

    const pagina = await request(app).get(
      `/api/publico/${paciente.tokenPublico}`,
    );
    expect(pagina.status).toBe(200);
    expect(pagina.body.procedimentos).toHaveLength(2);
    expect(pagina.body.pagamento).toMatchObject({
      valorPago: 3000,
      valorPendente: 2000,
      dataPagamentoPendente: "2026-11-29",
      quitado: false,
    });
  });

  it("com saldo em aberto: a6 cita o valor pendente e exige valores quitados em 48h", async () => {
    const create = await request(app).post("/api/pacientes").send({
      nome: "Com Saldo",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-12-02",
      valorSinal: 1000,
      valorPendente: 4000,
      dataPagamentoPendente: "2026-11-30",
    });
    expect(create.status).toBe(201);
    pacientesCriados.push(create.body.paciente.id as number);
    const { a6 } = create.body.saidas;
    expect(a6).toContain("valor pendente de R$ 4.000,00");
    expect(a6).toContain("previsto para 30/11/2026");
    expect(a6).toContain("e os valores quitados");
  });

  it("quitado: a6 não cita valor pendente nem exige quitação", async () => {
    const create = await request(app).post("/api/pacientes").send({
      nome: "Quitado",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-12-03",
      valorSinal: 5000,
      valorPendente: 0,
    });
    expect(create.status).toBe(201);
    pacientesCriados.push(create.body.paciente.id as number);
    const { a6 } = create.body.saidas;
    expect(a6).not.toContain("valor pendente");
    expect(a6).not.toContain("e os valores quitados");
    expect(a6).toContain("Recebemos o pagamento de R$ 5.000,00");
  });

  it("auditoria: editar procedimentos registra rótulo 'Procedimentos'", async () => {
    const id = await criarPaciente({
      nome: "Edita Proc",
      procedimentos: ["Blefaroplastia"],
    });
    const res = await request(app)
      .patch(`/api/pacientes/${id}`)
      .send({ procedimentos: ["Blefaroplastia", "Ptose"] });
    expect(res.status).toBe(200);
    const hist = await historico(id);
    const alt = hist.body[0].alteracoes.find(
      (a: { campo: string }) => a.campo === "procedimentos",
    );
    expect(alt).toMatchObject({
      campo: "procedimentos",
      rotulo: "Procedimentos",
      de: "Blefaroplastia",
      para: "Blefaroplastia, Ptose",
    });
  });
});

describe("POST /webhooks/autentique", () => {
  const SEGREDO = "segredo-de-teste-do-webhook";

  it("rejeita com 401 quando o segredo está ausente", async () => {
    const res = await request(app)
      .post("/api/webhooks/autentique")
      .send({ document: { id: "00000000-0000-4000-8000-000000000001" } });
    expect(res.status).toBe(401);
  });

  it("rejeita com 401 quando o segredo está errado", async () => {
    process.env.AUTENTIQUE_WEBHOOK_SECRET = SEGREDO;
    const res = await request(app)
      .post("/api/webhooks/autentique?secret=errado")
      .send({ document: { id: "00000000-0000-4000-8000-000000000001" } });
    expect(res.status).toBe(401);
    delete process.env.AUTENTIQUE_WEBHOOK_SECRET;
  });

  it("aceita o segredo via querystring e responde 200 mesmo sem casar paciente", async () => {
    process.env.AUTENTIQUE_WEBHOOK_SECRET = SEGREDO;
    const res = await request(app)
      .post(`/api/webhooks/autentique?secret=${SEGREDO}`)
      .send({ document: { id: "00000000-0000-4000-8000-000000000099" } });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.atualizados).toBe(0);
    delete process.env.AUTENTIQUE_WEBHOOK_SECRET;
  });

  it("aceita o segredo via Authorization: Bearer (modo do painel da Autentique)", async () => {
    process.env.AUTENTIQUE_WEBHOOK_SECRET = SEGREDO;
    const res = await request(app)
      .post("/api/webhooks/autentique")
      .set("Authorization", `Bearer ${SEGREDO}`)
      .send({ event: "signature.accepted", document: { id: "naoeuuid" } });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    delete process.env.AUTENTIQUE_WEBHOOK_SECRET;
  });

  it("rejeita com 401 quando o Bearer está errado", async () => {
    process.env.AUTENTIQUE_WEBHOOK_SECRET = SEGREDO;
    const res = await request(app)
      .post("/api/webhooks/autentique")
      .set("Authorization", "Bearer token-errado")
      .send({ document: { id: "00000000-0000-4000-8000-000000000001" } });
    expect(res.status).toBe(401);
    delete process.env.AUTENTIQUE_WEBHOOK_SECRET;
  });

  it("aceita o segredo via header x-autentique-secret", async () => {
    process.env.AUTENTIQUE_WEBHOOK_SECRET = SEGREDO;
    const res = await request(app)
      .post("/api/webhooks/autentique")
      .set("x-autentique-secret", SEGREDO)
      .send({ evento: "assinatura", document: { id: "naoeuuid" } });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    delete process.env.AUTENTIQUE_WEBHOOK_SECRET;
  });

  it("casa o documento pelo contratoAutentiqueId e atualiza o paciente", async () => {
    process.env.AUTENTIQUE_WEBHOOK_SECRET = SEGREDO;
    const docId = "11111111-2222-4333-8444-555555555555";
    const id = await criarPaciente({ nome: "Com Contrato" });
    await db
      .update(pacientesTable)
      .set({ contratoAutentiqueId: docId, contratoStatus: "pendente" })
      .where(inArray(pacientesTable.id, [id]));

    const res = await request(app)
      .post(`/api/webhooks/autentique?secret=${SEGREDO}`)
      .send({ event: "document.signed", document: { id: docId } });

    expect(res.status).toBe(200);
    expect(res.body.atualizados).toBe(1);
    delete process.env.AUTENTIQUE_WEBHOOK_SECRET;
  });
});

describe("GET /config", () => {
  it("devolve as opções de hospital", async () => {
    const res = await request(app).get("/api/config");
    expect(res.status).toBe(200);

    expect(Array.isArray(res.body.hospitais)).toBe(true);
    expect(res.body.hospitais.length).toBeGreaterThan(0);
    expect(res.body.hospitais[0]).toHaveProperty("chave");
    expect(res.body.hospitais[0]).toHaveProperty("nome");
    expect(typeof res.body.hospitais[0].nomeCompleto).toBe("string");
    expect(res.body.hospitais[0].nomeCompleto.length).toBeGreaterThan(0);
    expect(typeof res.body.hospitais[0].local).toBe("string");
    expect(res.body.hospitais[0].local.length).toBeGreaterThan(0);

    // Equipe de anestesia deixou de ser catálogo: agora é texto livre por
    // paciente (nome + telefone), então a config não expõe mais essa lista.
    expect(res.body.equipesAnestesia).toBeUndefined();

    // Lead time padrão do vencimento do saldo (config operacional).
    expect(res.body.vencimentoSaldoDiasUteisAntes).toBe(2);
  });

  it("expõe o local (nome completo + endereço) igual ao da página pública", async () => {
    const res = await request(app).get("/api/config");
    expect(res.status).toBe(200);

    const avant = res.body.hospitais.find(
      (h: { chave: string }) => h.chave === "Avant Moema",
    );
    expect(avant.nomeCompleto).toBe("Avant Moema Day Hospital");
    expect(avant.local).toContain("Avant Moema Day Hospital");
    expect(avant.local).toContain("Av. Copacabana, 112");
  });

  it("expõe as instruções de chegada/jejum específicas de cada hospital", async () => {
    const res = await request(app).get("/api/config");
    expect(res.status).toBe(200);

    for (const h of res.body.hospitais) {
      expect(typeof h.instrucoesChegada).toBe("string");
      expect(h.instrucoesChegada.length).toBeGreaterThan(0);
    }

    const einstein = res.body.hospitais.find(
      (h: { chave: string }) => h.chave === "Albert Einstein",
    );
    expect(einstein.instrucoesChegada).toContain("1h30");

    const vila = res.body.hospitais.find(
      (h: { chave: string }) => h.chave === "Vila Nova Star",
    );
    expect(vila.instrucoesChegada).toContain("2h");
    // Cada hospital traz a sua própria orientação (não um texto genérico único).
    expect(einstein.instrucoesChegada).not.toBe(vila.instrucoesChegada);
  });
});

describe("Avisos de contrato à equipe (config/notificacoes)", () => {
  afterEach(async () => {
    // Restaura o estado neutro para não vazar entre testes.
    await request(app)
      .put("/api/config/notificacoes")
      .send({ webhookUrl: null, silenciada: false });
  });

  it("GET devolve a config (neutra por padrão)", async () => {
    const res = await request(app).get("/api/config/notificacoes");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("webhookUrl");
    expect(res.body).toHaveProperty("silenciada");
  });

  it("PUT salva o destino e o liga/desliga e persiste", async () => {
    const dest = "https://hooks.exemplo.test/equipe";
    const put = await request(app)
      .put("/api/config/notificacoes")
      .send({ webhookUrl: dest, silenciada: true });
    expect(put.status).toBe(200);
    expect(put.body.webhookUrl).toBe(dest);
    expect(put.body.silenciada).toBe(true);

    const get = await request(app).get("/api/config/notificacoes");
    expect(get.body.webhookUrl).toBe(dest);
    expect(get.body.silenciada).toBe(true);
  });

  it("silenciar não perde o destino salvo", async () => {
    const dest = "https://hooks.exemplo.test/equipe";
    await request(app)
      .put("/api/config/notificacoes")
      .send({ webhookUrl: dest, silenciada: false });
    const put = await request(app)
      .put("/api/config/notificacoes")
      .send({ webhookUrl: dest, silenciada: true });
    expect(put.body.webhookUrl).toBe(dest);
    expect(put.body.silenciada).toBe(true);
  });

  it("destino vazio limpa o webhook salvo", async () => {
    await request(app)
      .put("/api/config/notificacoes")
      .send({ webhookUrl: "https://hooks.exemplo.test/equipe", silenciada: false });
    const put = await request(app)
      .put("/api/config/notificacoes")
      .send({ webhookUrl: "   ", silenciada: false });
    expect(put.status).toBe(200);
    expect(put.body.webhookUrl).toBeNull();
  });

  it("rejeita um destino que não é URL http(s)", async () => {
    const res = await request(app)
      .put("/api/config/notificacoes")
      .send({ webhookUrl: "não-é-url", silenciada: false });
    expect(res.status).toBe(400);
  });
});

describe("Conteúdo padrão global", () => {
  it("GET devolve as seções padrão (seed) com a política do valor total", async () => {
    const res = await request(app).get("/api/conteudo-padrao");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.secoes)).toBe(true);
    const politica = res.body.secoes.find(
      (s: { tipo: string }) => s.tipo === "politica",
    );
    expect(politica.corpo).toContain("valor total da cirurgia");
  });

  it("PUT substitui e persiste o conteúdo padrão (depois restaura)", async () => {
    const original = (await request(app).get("/api/conteudo-padrao")).body;

    const modificado = {
      secoes: [
        ...original.secoes,
        { id: "extra-teste", tipo: "texto", titulo: "Bloco de teste", corpo: "Olá" },
      ],
    };
    const put = await request(app).put("/api/conteudo-padrao").send(modificado);
    expect(put.status).toBe(200);
    expect(
      put.body.secoes.some((s: { id: string }) => s.id === "extra-teste"),
    ).toBe(true);

    const depois = await request(app).get("/api/conteudo-padrao");
    expect(
      depois.body.secoes.some((s: { id: string }) => s.id === "extra-teste"),
    ).toBe(true);

    // Restaura o padrão para não afetar os outros testes.
    const restore = await request(app)
      .put("/api/conteudo-padrao")
      .send({ secoes: original.secoes });
    expect(restore.status).toBe(200);
  });
});

describe("Conteúdo por paciente (override)", () => {
  it("herda o padrão, salva override e reverte", async () => {
    const id = await criarPaciente({ nome: "Override Teste" });

    // Sem override: herda o padrão global.
    const herdado = await request(app).get(`/api/pacientes/${id}/conteudo`);
    expect(herdado.status).toBe(200);
    expect(herdado.body.personalizado).toBe(false);
    expect(Array.isArray(herdado.body.secoes)).toBe(true);

    // Salva um override personalizado.
    const custom = {
      secoes: [
        { id: "so-texto", tipo: "texto", titulo: "Personalizado", corpo: "Conteúdo só desta paciente" },
      ],
    };
    const salvo = await request(app)
      .put(`/api/pacientes/${id}/conteudo`)
      .send(custom);
    expect(salvo.status).toBe(200);
    expect(salvo.body.personalizado).toBe(true);
    expect(salvo.body.secoes).toHaveLength(1);
    expect(salvo.body.secoes[0].id).toBe("so-texto");

    // GET agora reflete o override.
    const apos = await request(app).get(`/api/pacientes/${id}/conteudo`);
    expect(apos.body.personalizado).toBe(true);
    expect(apos.body.secoes[0].id).toBe("so-texto");

    // Reverte ao padrão global.
    const revertido = await request(app).delete(
      `/api/pacientes/${id}/conteudo`,
    );
    expect(revertido.status).toBe(200);
    expect(revertido.body.personalizado).toBe(false);
    expect(
      revertido.body.secoes.some((s: { id: string }) => s.id === "so-texto"),
    ).toBe(false);
  });

  it("devolve 404 para um id inexistente", async () => {
    const res = await request(app).get("/api/pacientes/99999999/conteudo");
    expect(res.status).toBe(404);
  });
});

describe("check-ins pós-op (staff)", () => {
  it("semeia o conjunto padrão e lista ordenado por dia", async () => {
    const id = await criarPaciente();
    const seed = await request(app).post(
      `/api/pacientes/${id}/checkins/seed-padrao`,
    );
    expect(seed.status).toBe(201);
    expect(seed.body).toHaveLength(4);

    const list = await request(app).get(`/api/pacientes/${id}/checkins`);
    expect(list.status).toBe(200);
    expect(list.body.map((c: { dia: number }) => c.dia)).toEqual([1, 7, 7, 30]);
    expect(
      list.body.every((c: { status: string }) => c.status === "pendente"),
    ).toBe(true);
    // DTO do staff expõe os campos internos.
    expect(list.body[0]).toHaveProperty("nota");
    expect(list.body[0]).toHaveProperty("sinalAtencao");
    expect(list.body[0]).toHaveProperty("fotoUrl", null);
  });

  it("cria um check-in manual", async () => {
    const id = await criarPaciente();
    const res = await request(app)
      .post(`/api/pacientes/${id}/checkins`)
      .send({ dia: 14, tipo: "foto", nota: "evolução" });
    expect(res.status).toBe(201);
    expect(res.body.dia).toBe(14);
    expect(res.body.tipo).toBe("foto");
    expect(res.body.status).toBe("pendente");
    expect(res.body.nota).toBe("evolução");
  });

  it("atualiza status, nota e sinal de atenção", async () => {
    const id = await criarPaciente();
    const create = await request(app)
      .post(`/api/pacientes/${id}/checkins`)
      .send({ dia: 7, tipo: "retorno" });
    const checkinId = create.body.id as number;

    const res = await request(app)
      .patch(`/api/pacientes/${id}/checkins/${checkinId}`)
      .send({ status: "concluido", nota: "tudo certo", sinalAtencao: true });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("concluido");
    expect(res.body.nota).toBe("tudo certo");
    expect(res.body.sinalAtencao).toBe(true);
  });

  it("devolve 404 ao listar check-ins de paciente inexistente", async () => {
    const res = await request(app).get("/api/pacientes/99999999/checkins");
    expect(res.status).toBe(404);
  });

  it("devolve 404 ao atualizar check-in de outro paciente", async () => {
    const idA = await criarPaciente();
    const idB = await criarPaciente();
    const create = await request(app)
      .post(`/api/pacientes/${idA}/checkins`)
      .send({ dia: 1, tipo: "foto" });
    const checkinId = create.body.id as number;

    const res = await request(app)
      .patch(`/api/pacientes/${idB}/checkins/${checkinId}`)
      .send({ status: "concluido" });
    expect(res.status).toBe(404);
  });

  it("devolve 400 ao atualizar sem nenhum campo", async () => {
    const id = await criarPaciente();
    const create = await request(app)
      .post(`/api/pacientes/${id}/checkins`)
      .send({ dia: 1, tipo: "foto" });
    const res = await request(app)
      .patch(`/api/pacientes/${id}/checkins/${create.body.id}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe("check-ins pós-op (público por token)", () => {
  async function criarComToken(): Promise<{ id: number; token: string }> {
    const create = await request(app).post("/api/pacientes").send({
      nome: "Paciente Pós-op",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-12-01",
      valorSinal: 3000,
    });
    expect(create.status).toBe(201);
    const id = create.body.paciente.id as number;
    pacientesCriados.push(id);
    return { id, token: create.body.paciente.tokenPublico as string };
  }

  it("lista check-ins sem expor campos internos", async () => {
    const { id, token } = await criarComToken();
    await request(app).post(`/api/pacientes/${id}/checkins/seed-padrao`);
    const staff = await request(app).get(`/api/pacientes/${id}/checkins`);
    await request(app)
      .patch(`/api/pacientes/${id}/checkins/${staff.body[0].id}`)
      .send({ nota: "anotação interna", sinalAtencao: true });

    const pub = await request(app).get(`/api/publico/${token}/checkins`);
    expect(pub.status).toBe(200);
    expect(pub.body).toHaveLength(4);
    expect(pub.body[0]).not.toHaveProperty("nota");
    expect(pub.body[0]).not.toHaveProperty("sinalAtencao");
    expect(pub.body[0]).not.toHaveProperty("pacienteId");
    expect(pub.body[0]).toHaveProperty("fotoUrl", null);
  });

  it("devolve 404 para token desconhecido", async () => {
    const res = await request(app).get(
      "/api/publico/00000000-0000-4000-8000-000000000000/checkins",
    );
    expect(res.status).toBe(404);
  });

  it("devolve 404 para token malformado", async () => {
    const res = await request(app).get("/api/publico/nao-e-uuid/checkins");
    expect(res.status).toBe(404);
  });

  describe("upload de foto", () => {
    it("recusa (400) check-in que não é do tipo foto", async () => {
      const { id, token } = await criarComToken();
      const create = await request(app)
        .post(`/api/pacientes/${id}/checkins`)
        .send({ dia: 7, tipo: "retorno" });
      const res = await request(app)
        .post(`/api/publico/${token}/checkins/${create.body.id}/foto`)
        .attach("foto", Buffer.from([0xff, 0xd8, 0xff]), {
          filename: "evolucao.jpg",
          contentType: "image/jpeg",
        });
      expect(res.status).toBe(400);
    });

    it("recusa (400) tipo de arquivo não aceito", async () => {
      const { id, token } = await criarComToken();
      const create = await request(app)
        .post(`/api/pacientes/${id}/checkins`)
        .send({ dia: 1, tipo: "foto" });
      const res = await request(app)
        .post(`/api/publico/${token}/checkins/${create.body.id}/foto`)
        .attach("foto", Buffer.from("não é imagem"), {
          filename: "nota.txt",
          contentType: "text/plain",
        });
      expect(res.status).toBe(400);
    });

    it("devolve 404 para token inválido", async () => {
      const res = await request(app)
        .post("/api/publico/nao-e-uuid/checkins/1/foto")
        .attach("foto", Buffer.from([0xff, 0xd8, 0xff]), {
          filename: "evolucao.jpg",
          contentType: "image/jpeg",
        });
      expect(res.status).toBe(404);
    });
  });
});

describe("GET /pacientes/:id/contrato/assinaturas (por quem já foi assinado)", () => {
  const DOC_ID_ASS = "dddddddd-eeee-4fff-8aaa-bbbbbbbbbbbb";

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function criarPacienteComDoc(): Promise<number> {
    const id = await criarPaciente({ nome: "Paciente Assinaturas" });
    await db
      .update(pacientesTable)
      .set({ contratoAutentiqueId: DOC_ID_ASS })
      .where(inArray(pacientesTable.id, [id]));
    return id;
  }

  it("devolve 404 quando o paciente não existe", async () => {
    const res = await request(app).get(
      "/api/pacientes/99999999/contrato/assinaturas",
    );
    expect(res.status).toBe(404);
  });

  it("devolve disponivel:false sem consultar a Autentique quando não há contrato vinculado", async () => {
    const espia = vi.spyOn(autentique, "listarAssinaturasContrato");
    const id = await criarPaciente({ nome: "Sem Doc" });

    const res = await request(app).get(
      `/api/pacientes/${id}/contrato/assinaturas`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ disponivel: false, assinaturas: [] });
    expect(espia).not.toHaveBeenCalled();
  });

  it("lista os signatários e a situação de cada um", async () => {
    vi.spyOn(autentique, "listarAssinaturasContrato").mockResolvedValue({
      disponivel: true,
      assinaturas: [
        {
          nome: "Maria Paciente",
          email: "maria@ex.com",
          status: "assinado",
          em: "2026-07-01T10:00:00Z",
        },
        { nome: "Dra. Karla", email: null, status: "pendente", em: null },
      ],
    });
    const id = await criarPacienteComDoc();

    const res = await request(app).get(
      `/api/pacientes/${id}/contrato/assinaturas`,
    );

    expect(res.status).toBe(200);
    expect(res.body.disponivel).toBe(true);
    expect(res.body.assinaturas).toHaveLength(2);
    expect(res.body.assinaturas[0]).toMatchObject({
      nome: "Maria Paciente",
      status: "assinado",
    });
    expect(res.body.assinaturas[1]).toMatchObject({
      nome: "Dra. Karla",
      status: "pendente",
    });
  });
});

describe("download do contrato assinado", () => {
  // UUID interno do documento na Autentique: NUNCA pode aparecer na resposta.
  const DOC_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  // URL temporária do PDF na Autentique: SOMENTE servidor, nunca vaza ao cliente.
  const URL_INTERNA =
    "https://storage.autentique.com.br/segredo/contrato-assinado.pdf";
  const PDF_BYTES = Buffer.from("%PDF-1.4\n teste contrato assinado\n%%EOF");

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Cria um paciente já com o documento da Autentique vinculado e devolve
  // tanto o id interno (rota do Console) quanto o token público (link da paciente).
  async function criarPacienteComContrato(): Promise<{
    id: number;
    token: string;
  }> {
    const create = await request(app).post("/api/pacientes").send({
      nome: "Paciente Contrato",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-12-01",
      valorSinal: 3000,
    });
    expect(create.status).toBe(201);
    const id = create.body.paciente.id as number;
    const token = create.body.paciente.tokenPublico as string;
    pacientesCriados.push(id);
    await db
      .update(pacientesTable)
      .set({ contratoAutentiqueId: DOC_ID, contratoStatus: "assinado" })
      .where(inArray(pacientesTable.id, [id]));
    return { id, token };
  }

  // Garante que nem o token/URL interna da Autentique nem o id do documento
  // apareçam no corpo de uma resposta de erro (JSON).
  function naoVazaSegredos(corpo: string) {
    expect(corpo).not.toContain(DOC_ID);
    expect(corpo).not.toContain(URL_INTERNA);
    expect(corpo).not.toContain("autentique");
  }

  describe("GET /pacientes/:id/contrato/download (Console)", () => {
    it("devolve 404 quando o paciente não tem contrato vinculado", async () => {
      const espia = vi.spyOn(autentique, "obterArquivoAssinado");
      const id = await criarPaciente({ nome: "Sem Contrato" });

      const res = await request(app).get(`/api/pacientes/${id}/contrato/download`);

      expect(res.status).toBe(404);
      // Nem chega a consultar a Autentique: não há documento vinculado.
      expect(espia).not.toHaveBeenCalled();
      naoVazaSegredos(JSON.stringify(res.body));
    });

    it("devolve 409 quando o contrato ainda não está assinado", async () => {
      vi.spyOn(autentique, "obterArquivoAssinado").mockResolvedValue({
        status: "pendente",
        url: null,
      });
      const { id } = await criarPacienteComContrato();

      const res = await request(app).get(`/api/pacientes/${id}/contrato/download`);

      expect(res.status).toBe(409);
      naoVazaSegredos(JSON.stringify(res.body));
    });

    it("devolve 502 quando a Autentique está indisponível", async () => {
      vi.spyOn(autentique, "obterArquivoAssinado").mockResolvedValue({
        status: "indisponivel",
        url: null,
      });
      const { id } = await criarPacienteComContrato();

      const res = await request(app).get(`/api/pacientes/${id}/contrato/download`);

      expect(res.status).toBe(502);
      naoVazaSegredos(JSON.stringify(res.body));
    });

    it("devolve 200 application/pdf inline (visualização) quando assinado", async () => {
      vi.spyOn(autentique, "obterArquivoAssinado").mockResolvedValue({
        status: "assinado",
        url: URL_INTERNA,
      });
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(PDF_BYTES));
      const { id } = await criarPacienteComContrato();

      const res = await request(app).get(`/api/pacientes/${id}/contrato/download`);

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/pdf");
      expect(res.headers["content-disposition"]).toContain("inline");
      // O servidor faz o proxy do PDF a partir da URL interna da Autentique.
      expect(fetchSpy).toHaveBeenCalledWith(URL_INTERNA, expect.anything());
      expect(Buffer.from(res.body).equals(PDF_BYTES)).toBe(true);
      // Cabeçalhos não podem conter o id do documento nem a URL interna.
      expect(JSON.stringify(res.headers)).not.toContain(DOC_ID);
      expect(JSON.stringify(res.headers)).not.toContain(URL_INTERNA);
    });

    it("devolve 200 com Content-Disposition attachment quando ?download=1", async () => {
      vi.spyOn(autentique, "obterArquivoAssinado").mockResolvedValue({
        status: "assinado",
        url: URL_INTERNA,
      });
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(PDF_BYTES));
      const { id } = await criarPacienteComContrato();

      const res = await request(app).get(
        `/api/pacientes/${id}/contrato/download?download=1`,
      );

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/pdf");
      expect(res.headers["content-disposition"]).toContain("attachment");
      expect(res.headers["content-disposition"]).toContain(".pdf");
    });
  });

  describe("GET /publico/:token/contrato/download (link público)", () => {
    it("devolve 404 quando o paciente não tem contrato vinculado", async () => {
      const espia = vi.spyOn(autentique, "obterArquivoAssinado");
      const create = await request(app).post("/api/pacientes").send({
        nome: "Pública Sem Contrato",
        cpf: cpfUnico(),
        telefone: TELEFONE_VALIDO,
        procedimentos: ["Blefaroplastia"],
        dataCirurgia: "2026-12-02",
        valorSinal: 3000,
      });
      expect(create.status).toBe(201);
      pacientesCriados.push(create.body.paciente.id as number);
      const token = create.body.paciente.tokenPublico as string;

      const res = await request(app).get(
        `/api/publico/${token}/contrato/download`,
      );

      expect(res.status).toBe(404);
      expect(espia).not.toHaveBeenCalled();
      naoVazaSegredos(JSON.stringify(res.body));
    });

    it("devolve 409 quando o contrato ainda não está assinado", async () => {
      vi.spyOn(autentique, "obterArquivoAssinado").mockResolvedValue({
        status: "pendente",
        url: null,
      });
      const { token } = await criarPacienteComContrato();

      const res = await request(app).get(
        `/api/publico/${token}/contrato/download`,
      );

      expect(res.status).toBe(409);
      naoVazaSegredos(JSON.stringify(res.body));
    });

    it("devolve 502 quando a Autentique está indisponível", async () => {
      vi.spyOn(autentique, "obterArquivoAssinado").mockResolvedValue({
        status: "indisponivel",
        url: null,
      });
      const { token } = await criarPacienteComContrato();

      const res = await request(app).get(
        `/api/publico/${token}/contrato/download`,
      );

      expect(res.status).toBe(502);
      naoVazaSegredos(JSON.stringify(res.body));
    });

    it("devolve 200 application/pdf inline quando assinado", async () => {
      vi.spyOn(autentique, "obterArquivoAssinado").mockResolvedValue({
        status: "assinado",
        url: URL_INTERNA,
      });
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(PDF_BYTES));
      const { token } = await criarPacienteComContrato();

      const res = await request(app).get(
        `/api/publico/${token}/contrato/download`,
      );

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/pdf");
      expect(res.headers["content-disposition"]).toContain("inline");
      expect(Buffer.from(res.body).equals(PDF_BYTES)).toBe(true);
      expect(JSON.stringify(res.headers)).not.toContain(DOC_ID);
      expect(JSON.stringify(res.headers)).not.toContain(URL_INTERNA);
    });

    it("devolve 200 com Content-Disposition attachment quando ?download=1", async () => {
      vi.spyOn(autentique, "obterArquivoAssinado").mockResolvedValue({
        status: "assinado",
        url: URL_INTERNA,
      });
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(PDF_BYTES));
      const { token } = await criarPacienteComContrato();

      const res = await request(app).get(
        `/api/publico/${token}/contrato/download?download=1`,
      );

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/pdf");
      expect(res.headers["content-disposition"]).toContain("attachment");
      expect(res.headers["content-disposition"]).toContain(".pdf");
    });
  });
});

describe("download de documento anexado (link público)", () => {
  // Caminho interno do objeto no armazenamento: SOMENTE servidor, NUNCA pode
  // aparecer na resposta (corpo ou cabeçalhos).
  const OBJECT_PATH_INTERNO = "/objects/uploads/segredo-interno-do-documento";
  const PDF_BYTES = Buffer.from("%PDF-1.4\n teste documento anexado\n%%EOF");
  // UUID válido em formato, mas que não corresponde a nenhuma paciente/documento.
  const UUID_INEXISTENTE = "11111111-2222-4333-8444-555555555555";

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Fabrica uma Response falsa (a que fetchObject devolve) que entrega os bytes
  // do PDF sem tocar no armazenamento real.
  function fakeStorageFile(bytes: Buffer): Response {
    return new Response(bytes, {
      headers: {
        "content-length": String(bytes.length),
        "content-type": "application/pdf",
      },
    });
  }

  async function criarPacienteToken(
    nome: string,
  ): Promise<{ id: number; token: string }> {
    const create = await request(app).post("/api/pacientes").send({
      nome,
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-12-05",
      valorSinal: 3000,
    });
    expect(create.status).toBe(201);
    const id = create.body.paciente.id as number;
    pacientesCriados.push(id);
    return { id, token: create.body.paciente.tokenPublico as string };
  }

  // Insere um documento direto no banco (com objectPath interno) e devolve o
  // token público opaco usado no link da paciente.
  async function criarDocumento(
    pacienteId: number,
    objectPath = OBJECT_PATH_INTERNO,
  ): Promise<string> {
    const [row] = await db
      .insert(pacientesDocumentosTable)
      .values({
        pacienteId,
        rotulo: "Pedido médico",
        nomeArquivo: "pedido-medico.pdf",
        objectPath,
        contentType: "application/pdf",
        tamanho: PDF_BYTES.length,
      })
      .returning();
    return row.tokenPublico;
  }

  // Garante que o caminho interno do objeto nunca apareça num texto (corpo/headers).
  function naoVazaCaminho(texto: string) {
    expect(texto).not.toContain(OBJECT_PATH_INTERNO);
    expect(texto).not.toContain("/objects/");
  }

  it("devolve 404 para token de paciente desconhecido", async () => {
    const espia = vi.spyOn(
      ObjectStorageService.prototype,
      "fetchObject",
    );

    const res = await request(app).get(
      `/api/publico/${UUID_INEXISTENTE}/documentos/${UUID_INEXISTENTE}/download`,
    );

    expect(res.status).toBe(404);
    // Sem paciente, nem chega a tocar no armazenamento.
    expect(espia).not.toHaveBeenCalled();
    naoVazaCaminho(JSON.stringify(res.body));
  });

  it("devolve 404 para token de documento desconhecido", async () => {
    const espia = vi.spyOn(
      ObjectStorageService.prototype,
      "fetchObject",
    );
    const { token } = await criarPacienteToken("Doc Desconhecido");

    const res = await request(app).get(
      `/api/publico/${token}/documentos/${UUID_INEXISTENTE}/download`,
    );

    expect(res.status).toBe(404);
    expect(espia).not.toHaveBeenCalled();
    naoVazaCaminho(JSON.stringify(res.body));
  });

  it("devolve 404 quando o documento pertence a outra paciente", async () => {
    const espia = vi.spyOn(
      ObjectStorageService.prototype,
      "fetchObject",
    );
    const dona = await criarPacienteToken("Dona do Documento");
    const outra = await criarPacienteToken("Outra Paciente");
    const docToken = await criarDocumento(dona.id);

    // Token do documento válido, mas usado no link público de OUTRA paciente.
    const res = await request(app).get(
      `/api/publico/${outra.token}/documentos/${docToken}/download`,
    );

    expect(res.status).toBe(404);
    expect(espia).not.toHaveBeenCalled();
    naoVazaCaminho(JSON.stringify(res.body));
  });

  it("devolve 200 application/pdf inline para documento válido", async () => {
    const espia = vi
      .spyOn(ObjectStorageService.prototype, "fetchObject")
      .mockResolvedValue(fakeStorageFile(PDF_BYTES));
    const { id, token } = await criarPacienteToken("Doc Válido");
    const docToken = await criarDocumento(id);

    const res = await request(app).get(
      `/api/publico/${token}/documentos/${docToken}/download`,
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain("inline");
    expect(Buffer.from(res.body).equals(PDF_BYTES)).toBe(true);
    // O servidor busca o objeto pelo caminho interno...
    expect(espia).toHaveBeenCalledWith(OBJECT_PATH_INTERNO);
    // ...mas esse caminho jamais aparece nos cabeçalhos enviados ao cliente.
    naoVazaCaminho(JSON.stringify(res.headers));
  });

  it("devolve 200 com Content-Disposition attachment quando ?download=1", async () => {
    vi.spyOn(
      ObjectStorageService.prototype,
      "fetchObject",
    ).mockResolvedValue(fakeStorageFile(PDF_BYTES));
    const { id, token } = await criarPacienteToken("Doc Download");
    const docToken = await criarDocumento(id);

    const res = await request(app).get(
      `/api/publico/${token}/documentos/${docToken}/download?download=1`,
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.headers["content-disposition"]).toContain(".pdf");
    naoVazaCaminho(JSON.stringify(res.headers));
  });
});

describe("download de documento anexado (Console por id interno)", () => {
  // Caminho interno do objeto no armazenamento: SOMENTE servidor, NUNCA pode
  // aparecer na resposta (corpo ou cabeçalhos).
  const OBJECT_PATH_INTERNO = "/objects/uploads/segredo-doc-console";
  const PDF_BYTES = Buffer.from("%PDF-1.4\n teste documento console\n%%EOF");
  // id numérico que não corresponde a nenhuma paciente/documento.
  const ID_INEXISTENTE = 99999999;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Fabrica uma Response falsa (a que fetchObject devolve) que entrega os bytes
  // do PDF sem tocar no armazenamento real.
  function fakeStorageFile(bytes: Buffer): Response {
    return new Response(bytes, {
      headers: {
        "content-length": String(bytes.length),
        "content-type": "application/pdf",
      },
    });
  }

  // Insere um documento direto no banco (com objectPath interno) e devolve o
  // id numérico usado na rota do Console.
  async function criarDocumento(
    pacienteId: number,
    objectPath = OBJECT_PATH_INTERNO,
  ): Promise<number> {
    const [row] = await db
      .insert(pacientesDocumentosTable)
      .values({
        pacienteId,
        rotulo: "Pedido médico",
        nomeArquivo: "pedido-medico.pdf",
        objectPath,
        contentType: "application/pdf",
        tamanho: PDF_BYTES.length,
      })
      .returning();
    return row.id;
  }

  // Garante que o caminho interno do objeto nunca apareça num texto (corpo/headers).
  function naoVazaCaminho(texto: string) {
    expect(texto).not.toContain(OBJECT_PATH_INTERNO);
    expect(texto).not.toContain("/objects/");
  }

  it("devolve 404 para paciente desconhecido", async () => {
    const espia = vi.spyOn(
      ObjectStorageService.prototype,
      "fetchObject",
    );

    const res = await request(app).get(
      `/api/pacientes/${ID_INEXISTENTE}/documentos/${ID_INEXISTENTE}/download`,
    );

    expect(res.status).toBe(404);
    // Sem documento, nem chega a tocar no armazenamento.
    expect(espia).not.toHaveBeenCalled();
    naoVazaCaminho(JSON.stringify(res.body));
  });

  it("devolve 404 para documento desconhecido", async () => {
    const espia = vi.spyOn(
      ObjectStorageService.prototype,
      "fetchObject",
    );
    const id = await criarPaciente({ nome: "Doc Console Desconhecido" });

    const res = await request(app).get(
      `/api/pacientes/${id}/documentos/${ID_INEXISTENTE}/download`,
    );

    expect(res.status).toBe(404);
    expect(espia).not.toHaveBeenCalled();
    naoVazaCaminho(JSON.stringify(res.body));
  });

  it("devolve 404 quando o documento pertence a outra paciente", async () => {
    const espia = vi.spyOn(
      ObjectStorageService.prototype,
      "fetchObject",
    );
    const dona = await criarPaciente({ nome: "Dona do Doc Console" });
    const outra = await criarPaciente({ nome: "Outra Paciente Console" });
    const documentoId = await criarDocumento(dona);

    // Documento existe, mas é requisitado pelo id interno de OUTRA paciente —
    // impede acessar documentos cruzando ids.
    const res = await request(app).get(
      `/api/pacientes/${outra}/documentos/${documentoId}/download`,
    );

    expect(res.status).toBe(404);
    expect(espia).not.toHaveBeenCalled();
    naoVazaCaminho(JSON.stringify(res.body));
  });

  it("devolve 200 application/pdf inline para documento válido", async () => {
    const espia = vi
      .spyOn(ObjectStorageService.prototype, "fetchObject")
      .mockResolvedValue(fakeStorageFile(PDF_BYTES));
    const id = await criarPaciente({ nome: "Doc Console Válido" });
    const documentoId = await criarDocumento(id);

    const res = await request(app).get(
      `/api/pacientes/${id}/documentos/${documentoId}/download`,
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain("inline");
    expect(Buffer.from(res.body).equals(PDF_BYTES)).toBe(true);
    // O servidor busca o objeto pelo caminho interno...
    expect(espia).toHaveBeenCalledWith(OBJECT_PATH_INTERNO);
    // ...mas esse caminho jamais aparece nos cabeçalhos enviados ao cliente.
    naoVazaCaminho(JSON.stringify(res.headers));
  });

  it("devolve 200 com Content-Disposition attachment quando ?download=1", async () => {
    vi.spyOn(
      ObjectStorageService.prototype,
      "fetchObject",
    ).mockResolvedValue(fakeStorageFile(PDF_BYTES));
    const id = await criarPaciente({ nome: "Doc Console Download" });
    const documentoId = await criarDocumento(id);

    const res = await request(app).get(
      `/api/pacientes/${id}/documentos/${documentoId}/download?download=1`,
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.headers["content-disposition"]).toContain(".pdf");
    naoVazaCaminho(JSON.stringify(res.headers));
  });
});

describe("download do termo assinado (link público)", () => {
  // UUID interno do documento na Autentique: NUNCA pode aparecer na resposta.
  const DOC_ID = "cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa";
  // URL temporária do PDF na Autentique: SOMENTE servidor, nunca vaza ao cliente.
  const URL_INTERNA =
    "https://storage.autentique.com.br/segredo/termo-assinado.pdf";
  const PDF_BYTES = Buffer.from("%PDF-1.4\n teste termo assinado\n%%EOF");
  // UUID válido em formato, mas que não corresponde a nenhuma paciente.
  const UUID_INEXISTENTE = "11111111-2222-4333-8444-555555555555";

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Cria um paciente já com o termo da Autentique vinculado e assinado, e
  // devolve o token público usado no link da paciente.
  async function criarPacienteComTermo(): Promise<{
    id: number;
    token: string;
  }> {
    const create = await request(app).post("/api/pacientes").send({
      nome: "Paciente Termo",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-12-08",
      valorSinal: 3000,
    });
    expect(create.status).toBe(201);
    const id = create.body.paciente.id as number;
    const token = create.body.paciente.tokenPublico as string;
    pacientesCriados.push(id);
    await db
      .update(pacientesTable)
      .set({ termoAutentiqueId: DOC_ID, termoStatus: "assinado" })
      .where(inArray(pacientesTable.id, [id]));
    return { id, token };
  }

  // Garante que nem o token/URL interna da Autentique nem o id do documento
  // apareçam no corpo de uma resposta de erro (JSON).
  function naoVazaSegredos(corpo: string) {
    expect(corpo).not.toContain(DOC_ID);
    expect(corpo).not.toContain(URL_INTERNA);
    expect(corpo).not.toContain("autentique");
  }

  it("devolve 404 quando o token da paciente é desconhecido", async () => {
    const espia = vi.spyOn(autentique, "obterArquivoAssinado");

    const res = await request(app).get(
      `/api/publico/${UUID_INEXISTENTE}/termo/download`,
    );

    expect(res.status).toBe(404);
    // Sem paciente, nem chega a consultar a Autentique.
    expect(espia).not.toHaveBeenCalled();
    naoVazaSegredos(JSON.stringify(res.body));
  });

  it("devolve 404 quando o paciente não tem termo vinculado", async () => {
    const espia = vi.spyOn(autentique, "obterArquivoAssinado");
    const create = await request(app).post("/api/pacientes").send({
      nome: "Pública Sem Termo",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-12-09",
      valorSinal: 3000,
    });
    expect(create.status).toBe(201);
    pacientesCriados.push(create.body.paciente.id as number);
    const token = create.body.paciente.tokenPublico as string;

    const res = await request(app).get(`/api/publico/${token}/termo/download`);

    expect(res.status).toBe(404);
    // Sem documento vinculado, nem chega a consultar a Autentique.
    expect(espia).not.toHaveBeenCalled();
    naoVazaSegredos(JSON.stringify(res.body));
  });

  it("devolve 409 quando o termo ainda não está assinado", async () => {
    vi.spyOn(autentique, "obterArquivoAssinado").mockResolvedValue({
      status: "pendente",
      url: null,
    });
    const { token } = await criarPacienteComTermo();

    const res = await request(app).get(`/api/publico/${token}/termo/download`);

    expect(res.status).toBe(409);
    naoVazaSegredos(JSON.stringify(res.body));
  });

  it("devolve 502 quando a Autentique está indisponível", async () => {
    vi.spyOn(autentique, "obterArquivoAssinado").mockResolvedValue({
      status: "indisponivel",
      url: null,
    });
    const { token } = await criarPacienteComTermo();

    const res = await request(app).get(`/api/publico/${token}/termo/download`);

    expect(res.status).toBe(502);
    naoVazaSegredos(JSON.stringify(res.body));
  });

  it("devolve 200 application/pdf inline quando assinado", async () => {
    vi.spyOn(autentique, "obterArquivoAssinado").mockResolvedValue({
      status: "assinado",
      url: URL_INTERNA,
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(PDF_BYTES));
    const { token } = await criarPacienteComTermo();

    const res = await request(app).get(`/api/publico/${token}/termo/download`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain("inline");
    // O servidor faz o proxy do PDF a partir da URL interna da Autentique.
    expect(fetchSpy).toHaveBeenCalledWith(URL_INTERNA, expect.anything());
    expect(Buffer.from(res.body).equals(PDF_BYTES)).toBe(true);
    // Cabeçalhos não podem conter o id do documento nem a URL interna.
    expect(JSON.stringify(res.headers)).not.toContain(DOC_ID);
    expect(JSON.stringify(res.headers)).not.toContain(URL_INTERNA);
  });

  it("devolve 200 com Content-Disposition attachment quando ?download=1", async () => {
    vi.spyOn(autentique, "obterArquivoAssinado").mockResolvedValue({
      status: "assinado",
      url: URL_INTERNA,
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(PDF_BYTES));
    const { token } = await criarPacienteComTermo();

    const res = await request(app).get(
      `/api/publico/${token}/termo/download?download=1`,
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.headers["content-disposition"]).toContain(".pdf");
  });
});
