import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { db, pacientesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

// Mocka SOMENTE a consulta de status da Autentique (a "reconsulta ao vivo"),
// preservando os demais exports reais (ex.: extrairDocumentoId, usado pelo
// router de pacientes ao carregar o app). Assim controlamos qual status o
// webhook "vê" ao reconsultar, sem depender da API real.
vi.mock("../lib/autentique", async () => {
  const real =
    await vi.importActual<typeof import("../lib/autentique")>(
      "../lib/autentique",
    );
  return { ...real, consultarStatusContrato: vi.fn() };
});

import { consultarStatusContrato } from "../lib/autentique";
import app from "../app";

const mockConsultar = vi.mocked(consultarStatusContrato);

const SEGREDO = "segredo-de-teste-do-webhook";
const WEBHOOK_EQUIPE = "https://exemplo.test/avisos-da-equipe";

const TELEFONE_VALIDO = "11987654321";

const pacientesCriados: number[] = [];

// Espião do fetch global: o aviso à equipe (notificarTransicaoContrato) faz um
// POST via fetch. Supertest usa o http do Node diretamente, então este stub só
// captura o envio do aviso — nunca interfere nas requisições ao app.
const fetchSpy = vi.fn();

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

async function criarPacienteComContrato(opts: {
  docId: string;
  statusInicial: string;
}): Promise<number> {
  const create = await request(app).post("/api/pacientes").send({
    nome: "Paciente Webhook",
    cpf: cpfUnico(),
    telefone: TELEFONE_VALIDO,
    procedimentos: ["Blefaroplastia"],
    dataCirurgia: "2026-08-15",
    valorSinal: 3000,
  });
  expect(create.status).toBe(201);
  const id = create.body.paciente.id as number;
  pacientesCriados.push(id);

  await db
    .update(pacientesTable)
    .set({
      contratoAutentiqueId: opts.docId,
      contratoStatus: opts.statusInicial,
    })
    .where(inArray(pacientesTable.id, [id]));

  return id;
}

function dispararWebhook(docId: string) {
  return request(app)
    .post(`/api/webhooks/autentique?secret=${SEGREDO}`)
    .send({ event: "document.finished", document: { id: docId } });
}

beforeEach(() => {
  mockConsultar.mockReset();
  fetchSpy.mockReset();
  fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchSpy);
  process.env.AUTENTIQUE_WEBHOOK_SECRET = SEGREDO;
  process.env.EQUIPE_NOTIFICACAO_WEBHOOK = WEBHOOK_EQUIPE;
  delete process.env.EQUIPE_NOTIFICACAO_SILENCIADA;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AUTENTIQUE_WEBHOOK_SECRET;
  delete process.env.EQUIPE_NOTIFICACAO_WEBHOOK;
  delete process.env.EQUIPE_NOTIFICACAO_SILENCIADA;
});

afterAll(async () => {
  if (pacientesCriados.length > 0) {
    await db
      .delete(pacientesTable)
      .where(inArray(pacientesTable.id, pacientesCriados));
  }
});

// Caminho completo de ponta a ponta: evento da Autentique → reconsulta ao vivo
// (stub) → transição de status em refrescarStatusContrato → UM único aviso à
// equipe, e somente numa transição real.
describe("POST /webhooks/autentique — aviso à equipe de ponta a ponta", () => {
  it("dispara exatamente um aviso quando o contrato passa a assinado", async () => {
    const docId = "11111111-2222-4333-8444-aaaaaaaaaaaa";
    await criarPacienteComContrato({ docId, statusInicial: "pendente" });
    mockConsultar.mockResolvedValue({
      status: "assinado",
      assinadoEm: "2026-06-26T10:00:00.000Z",
      linkAssinatura: null,
    });

    const res = await dispararWebhook(docId);
    expect(res.status).toBe(200);
    expect(res.body.atualizados).toBe(1);

    // A reconsulta ao vivo aconteceu uma vez, para o documento do evento.
    expect(mockConsultar).toHaveBeenCalledTimes(1);
    expect(mockConsultar).toHaveBeenCalledWith(docId);

    // E o aviso à equipe saiu UMA única vez, com nome e status corretos.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(WEBHOOK_EQUIPE);
    const corpo = JSON.parse((init as RequestInit).body as string);
    expect(corpo.paciente).toBe("Paciente Webhook");
    expect(corpo.status).toBe("assinado");
    expect(corpo.text).toContain("assinou o contrato");
  });

  it("dispara exatamente um aviso quando o contrato é recusado", async () => {
    const docId = "22222222-3333-4444-8555-bbbbbbbbbbbb";
    await criarPacienteComContrato({ docId, statusInicial: "pendente" });
    mockConsultar.mockResolvedValue({
      status: "recusado",
      assinadoEm: null,
      linkAssinatura: null,
    });

    const res = await dispararWebhook(docId);
    expect(res.status).toBe(200);
    expect(res.body.atualizados).toBe(1);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const corpo = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(corpo.status).toBe("recusado");
    expect(corpo.text).toContain("recusou o contrato");
  });

  it("não dispara aviso quando o status não muda (sem spam a cada reconsulta)", async () => {
    const docId = "33333333-4444-4555-8666-cccccccccccc";
    await criarPacienteComContrato({ docId, statusInicial: "assinado" });
    // A reconsulta devolve o MESMO status já gravado: nenhuma transição real.
    mockConsultar.mockResolvedValue({
      status: "assinado",
      assinadoEm: "2026-06-26T10:00:00.000Z",
      linkAssinatura: null,
    });

    const res = await dispararWebhook(docId);
    expect(res.status).toBe(200);
    expect(res.body.atualizados).toBe(1);

    // Reconsultou, mas como o status é igual ao anterior, nenhum aviso sai.
    expect(mockConsultar).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("não dispara aviso quando a Autentique fica indisponível na reconsulta", async () => {
    const docId = "44444444-5555-4666-8777-dddddddddddd";
    await criarPacienteComContrato({ docId, statusInicial: "pendente" });
    // Autentique fora do ar: o webhook preserva o status conhecido e não avisa.
    mockConsultar.mockResolvedValue({
      status: "indisponivel",
      assinadoEm: null,
      linkAssinatura: null,
    });

    const res = await dispararWebhook(docId);
    expect(res.status).toBe(200);
    expect(res.body.atualizados).toBe(1);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

async function lerPaciente(id: number) {
  const [row] = await db
    .select()
    .from(pacientesTable)
    .where(eq(pacientesTable.id, id));
  return row;
}

// Dedup DURÁVEL: o aviso de transição não pode sair duas vezes para a mesma
// assinatura. Antes a garantia dependia só da comparação em memória do status
// anterior vs. novo; agora há um marcador persistido (contratoAlertaStatus /
// contratoAlertaEnviadoEm) que segura o aviso mesmo se o cache de status se
// perder ou duas entregas do mesmo evento correrem juntas.
describe("POST /webhooks/autentique — dedup durável do aviso", () => {
  it("registra o marcador de aviso na transição para assinado", async () => {
    const docId = "55555555-6666-4777-8888-eeeeeeeeeeee";
    const id = await criarPacienteComContrato({ docId, statusInicial: "pendente" });
    mockConsultar.mockResolvedValue({
      status: "assinado",
      assinadoEm: "2026-06-26T10:00:00.000Z",
      linkAssinatura: null,
    });

    await dispararWebhook(docId);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const p = await lerPaciente(id);
    expect(p?.contratoAlertaStatus).toBe("assinado");
    expect(p?.contratoAlertaEnviadoEm).not.toBeNull();
  });

  it("não avisa duas vezes numa entrega de webhook duplicada", async () => {
    const docId = "66666666-7777-4888-8999-ffffffffffff";
    await criarPacienteComContrato({ docId, statusInicial: "pendente" });
    mockConsultar.mockResolvedValue({
      status: "assinado",
      assinadoEm: "2026-06-26T10:00:00.000Z",
      linkAssinatura: null,
    });

    // Primeira entrega: transição real → um aviso.
    await dispararWebhook(docId);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Segunda entrega (duplicata do mesmo evento): nenhum aviso novo.
    await dispararWebhook(docId);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("não reavisa mesmo se o cache de status se perder (marcador durável)", async () => {
    const docId = "77777777-8888-4999-8aaa-111111111111";
    const id = await criarPacienteComContrato({ docId, statusInicial: "pendente" });
    mockConsultar.mockResolvedValue({
      status: "assinado",
      assinadoEm: "2026-06-26T10:00:00.000Z",
      linkAssinatura: null,
    });

    // Primeira entrega: avisa e carimba o marcador.
    await dispararWebhook(docId);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Simula a janela de corrida / cache perdido: o status volta a "pendente",
    // mas o marcador durável continua gravado. A próxima reconsulta vê uma
    // "transição" pendente→assinado de novo, e ainda assim NÃO reavisa.
    await db
      .update(pacientesTable)
      .set({ contratoStatus: "pendente" })
      .where(eq(pacientesTable.id, id));

    await dispararWebhook(docId);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("não avisa duas vezes em entregas concorrentes do mesmo evento", async () => {
    const docId = "88888888-9999-4aaa-8bbb-222222222222";
    await criarPacienteComContrato({ docId, statusInicial: "pendente" });
    mockConsultar.mockResolvedValue({
      status: "assinado",
      assinadoEm: "2026-06-26T10:00:00.000Z",
      linkAssinatura: null,
    });

    // Duas entregas do MESMO evento chegam em paralelo (corrida real). A
    // reivindicação atômica garante que só uma ganha e dispara o aviso.
    const [r1, r2] = await Promise.all([
      dispararWebhook(docId),
      dispararWebhook(docId),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
