import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Readable } from "stream";
import { db, pacientesTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import app from "../app";
import { ObjectStorageService } from "../lib/objectStorage";

// IDs criados durante os testes; limpos no afterAll (cascade remove os documentos
// e a linha do tempo).
const pacientesCriados: number[] = [];

// CPF/telefone que passam pela validação de formato da API (apenas dígitos).
const TELEFONE_VALIDO = "11987654321";

// Bytes de um PDF fake — o armazenamento é mockado, então o conteúdo é livre.
const PDF_BYTES = Buffer.from("%PDF-1.4\n teste documento anexado\n%%EOF");

// Caminho interno do objeto: SOMENTE servidor, NUNCA pode aparecer ao cliente.
const OBJECT_PATH = "/objects/uploads/segredo-interno-123";

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

async function criarPaciente(
  overrides: Record<string, unknown> = {},
): Promise<{ id: number; token: string }> {
  const res = await request(app)
    .post("/api/pacientes")
    .send({
      nome: "Paciente Documento",
      cpf: cpfUnico(),
      telefone: TELEFONE_VALIDO,
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-08-15",
      valorSinal: 3000,
      ...overrides,
    });
  expect(res.status).toBe(201);
  const id = res.body.paciente.id as number;
  const token = res.body.paciente.tokenPublico as string;
  pacientesCriados.push(id);
  return { id, token };
}

// Anexa um PDF (já "enviado" ao armazenamento) e devolve o id interno do registro.
async function anexarDocumento(
  pacienteId: number,
  overrides: Record<string, unknown> = {},
): Promise<{ id: number }> {
  const res = await request(app)
    .post(`/api/pacientes/${pacienteId}/documentos`)
    .send({
      objectPath: OBJECT_PATH,
      rotulo: "Pedido médico",
      nomeArquivo: "pedido-medico.pdf",
      contentType: "application/pdf",
      tamanho: PDF_BYTES.length,
      ...overrides,
    });
  expect(res.status).toBe(201);
  return { id: res.body.id as number };
}

// Response fake do object storage: o que fetchObject devolve a servirDocumento.
function arquivoFake(bytes: Buffer): Response {
  return new Response(bytes, {
    headers: {
      "content-length": String(bytes.length),
      "content-type": "application/pdf",
    },
  });
}

function mockArmazenamento() {
  vi.spyOn(
    ObjectStorageService.prototype,
    "fetchObject",
  ).mockResolvedValue(arquivoFake(PDF_BYTES));
  vi.spyOn(
    ObjectStorageService.prototype,
    "deleteObjectEntity",
  ).mockResolvedValue(undefined);
}

function timeline(id: number) {
  return request(app).get(`/api/pacientes/${id}/timeline`);
}

afterAll(async () => {
  if (pacientesCriados.length > 0) {
    await db
      .delete(pacientesTable)
      .where(inArray(pacientesTable.id, pacientesCriados));
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /pacientes/:id/documentos — registro", () => {
  it("registra um PDF válido e devolve os metadados (201)", async () => {
    const { id } = await criarPaciente();

    const res = await request(app)
      .post(`/api/pacientes/${id}/documentos`)
      .send({
        objectPath: OBJECT_PATH,
        rotulo: "Pedido médico",
        nomeArquivo: "pedido-medico.pdf",
        contentType: "application/pdf",
        tamanho: PDF_BYTES.length,
      });

    expect(res.status).toBe(201);
    expect(res.body.rotulo).toBe("Pedido médico");
    expect(res.body.nomeArquivo).toBe("pedido-medico.pdf");
    expect(res.body.contentType).toBe("application/pdf");
    expect(res.body.tamanho).toBe(PDF_BYTES.length);
    // O caminho interno do objeto NUNCA é devolvido ao cliente.
    expect(JSON.stringify(res.body)).not.toContain(OBJECT_PATH);
  });

  it("rejeita um arquivo que não é PDF (400)", async () => {
    const { id } = await criarPaciente();

    const res = await request(app)
      .post(`/api/pacientes/${id}/documentos`)
      .send({
        objectPath: OBJECT_PATH,
        rotulo: "Foto",
        nomeArquivo: "foto.png",
        contentType: "image/png",
        tamanho: 1024,
      });

    expect(res.status).toBe(400);
  });

  it("rejeita um arquivo acima do limite de 20 MB (400)", async () => {
    const { id } = await criarPaciente();

    const res = await request(app)
      .post(`/api/pacientes/${id}/documentos`)
      .send({
        objectPath: OBJECT_PATH,
        rotulo: "Exame grande",
        nomeArquivo: "exame.pdf",
        contentType: "application/pdf",
        tamanho: 20 * 1024 * 1024 + 1,
      });

    expect(res.status).toBe(400);
  });

  it("rejeita um caminho de objeto fora de /objects/ (400)", async () => {
    const { id } = await criarPaciente();

    const res = await request(app)
      .post(`/api/pacientes/${id}/documentos`)
      .send({
        objectPath: "https://evil.example/arquivo.pdf",
        rotulo: "Pedido",
        nomeArquivo: "pedido.pdf",
        contentType: "application/pdf",
        tamanho: 1024,
      });

    expect(res.status).toBe(400);
  });

  it("devolve 404 ao anexar em um paciente inexistente", async () => {
    const res = await request(app)
      .post(`/api/pacientes/99999999/documentos`)
      .send({
        objectPath: OBJECT_PATH,
        rotulo: "Pedido",
        nomeArquivo: "pedido.pdf",
        contentType: "application/pdf",
        tamanho: 1024,
      });

    expect(res.status).toBe(404);
  });
});

describe("GET /pacientes/:id/documentos — listagem", () => {
  it("lista apenas campos seguros (nunca o caminho do objeto)", async () => {
    const { id } = await criarPaciente();
    await anexarDocumento(id);

    const res = await request(app).get(`/api/pacientes/${id}/documentos`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const doc = res.body[0];
    expect(doc).toHaveProperty("id");
    expect(doc).toHaveProperty("rotulo", "Pedido médico");
    expect(doc).toHaveProperty("nomeArquivo", "pedido-medico.pdf");
    expect(doc).toHaveProperty("tamanho", PDF_BYTES.length);
    expect(doc).not.toHaveProperty("objectPath");
    // Defesa em profundidade: o caminho não vaza em nenhum campo.
    expect(JSON.stringify(res.body)).not.toContain(OBJECT_PATH);
  });
});

describe("GET /publico/:token — documentos na página da paciente", () => {
  it("expõe token/rotulo/nomeArquivo/tamanho e nunca o id interno nem o objeto", async () => {
    const { id, token } = await criarPaciente();
    const { id: documentoId } = await anexarDocumento(id);

    const res = await request(app).get(`/api/publico/${token}`);

    expect(res.status).toBe(200);
    expect(res.body.documentos).toHaveLength(1);
    const doc = res.body.documentos[0];
    // Token opaco (uuid) usado no download público — não o id sequencial.
    expect(doc.token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(doc.rotulo).toBe("Pedido médico");
    expect(doc.nomeArquivo).toBe("pedido-medico.pdf");
    expect(doc.tamanho).toBe(PDF_BYTES.length);
    expect(doc).not.toHaveProperty("id");
    expect(doc).not.toHaveProperty("objectPath");
    // Nem o id interno do documento nem o caminho do objeto podem vazar.
    expect(JSON.stringify(res.body.documentos)).not.toContain(OBJECT_PATH);
    expect(JSON.stringify(res.body.documentos)).not.toContain(
      `"${documentoId}"`,
    );
  });
});

describe("GET /pacientes/:id/documentos/:documentoId/download — Console", () => {
  it("devolve 200 application/pdf inline por padrão", async () => {
    mockArmazenamento();
    const { id } = await criarPaciente();
    const { id: documentoId } = await anexarDocumento(id);

    const res = await request(app).get(
      `/api/pacientes/${id}/documentos/${documentoId}/download`,
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain("inline");
    expect(res.headers["content-disposition"]).toContain(".pdf");
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(Buffer.from(res.body).equals(PDF_BYTES)).toBe(true);
    // O caminho interno do objeto não aparece em nenhum cabeçalho.
    expect(JSON.stringify(res.headers)).not.toContain(OBJECT_PATH);
  });

  it("devolve attachment quando ?download=1", async () => {
    mockArmazenamento();
    const { id } = await criarPaciente();
    const { id: documentoId } = await anexarDocumento(id);

    const res = await request(app).get(
      `/api/pacientes/${id}/documentos/${documentoId}/download?download=1`,
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain("attachment");
  });

  it("devolve 404 para um documento inexistente", async () => {
    const { id } = await criarPaciente();
    const res = await request(app).get(
      `/api/pacientes/${id}/documentos/99999999/download`,
    );
    expect(res.status).toBe(404);
  });

  it("devolve 404 quando o documento é de outra paciente (ACL)", async () => {
    const { id: idA } = await criarPaciente({ nome: "Paciente A" });
    const { id: documentoId } = await anexarDocumento(idA);
    const { id: idB } = await criarPaciente({ nome: "Paciente B" });

    // Tentar baixar o documento da paciente A pela rota da paciente B → 404.
    const res = await request(app).get(
      `/api/pacientes/${idB}/documentos/${documentoId}/download`,
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /publico/:token/documentos/:documentoToken/download — link público", () => {
  it("devolve attachment por padrão usando o token opaco do documento", async () => {
    mockArmazenamento();
    const { id, token } = await criarPaciente();
    await anexarDocumento(id);

    const pagina = await request(app).get(`/api/publico/${token}`);
    const documentoToken = pagina.body.documentos[0].token as string;

    const res = await request(app).get(
      `/api/publico/${token}/documentos/${documentoToken}/download?download=1`,
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(Buffer.from(res.body).equals(PDF_BYTES)).toBe(true);
    expect(JSON.stringify(res.headers)).not.toContain(OBJECT_PATH);
  });

  it("devolve 404 quando o token do documento não pertence à paciente do link (ACL)", async () => {
    mockArmazenamento();
    const { id: idA } = await criarPaciente({ nome: "Pública A" });
    await anexarDocumento(idA);
    const paginaA = await request(app).get(
      `/api/publico/${(await obterTokenPublico(idA))}`,
    );
    const documentoTokenA = paginaA.body.documentos[0].token as string;

    const { token: tokenB } = await criarPaciente({ nome: "Pública B" });

    // O token do documento da paciente A não vale no link da paciente B.
    const res = await request(app).get(
      `/api/publico/${tokenB}/documentos/${documentoTokenA}/download`,
    );
    expect(res.status).toBe(404);
  });

  it("devolve 404 quando o token do link é desconhecido", async () => {
    const res = await request(app).get(
      `/api/publico/token-inexistente/documentos/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/download`,
    );
    expect(res.status).toBe(404);
  });
});

// Helper: lê o tokenPublico da paciente direto do banco (a página pública só
// expõe o token do documento, não o da paciente).
async function obterTokenPublico(pacienteId: number): Promise<string> {
  const [row] = await db
    .select({ tokenPublico: pacientesTable.tokenPublico })
    .from(pacientesTable)
    .where(inArray(pacientesTable.id, [pacienteId]));
  return row.tokenPublico;
}

describe("DELETE /pacientes/:id/documentos/:documentoId — remoção", () => {
  it("remove o documento (204) e ele passa a dar 404 no download", async () => {
    mockArmazenamento();
    const { id } = await criarPaciente();
    const { id: documentoId } = await anexarDocumento(id);

    const del = await request(app).delete(
      `/api/pacientes/${id}/documentos/${documentoId}`,
    );
    expect(del.status).toBe(204);

    // A listagem fica vazia e o download passa a 404.
    const lista = await request(app).get(`/api/pacientes/${id}/documentos`);
    expect(lista.body).toHaveLength(0);

    const download = await request(app).get(
      `/api/pacientes/${id}/documentos/${documentoId}/download`,
    );
    expect(download.status).toBe(404);
  });

  it("devolve 404 ao remover um documento inexistente", async () => {
    const { id } = await criarPaciente();
    const res = await request(app).delete(
      `/api/pacientes/${id}/documentos/99999999`,
    );
    expect(res.status).toBe(404);
  });
});

describe("linha do tempo — auditoria de documentos", () => {
  it("registra 'Documento anexado' ao anexar e 'Documento removido' ao remover", async () => {
    mockArmazenamento();
    const { id } = await criarPaciente();
    const { id: documentoId } = await anexarDocumento(id, {
      rotulo: "Receita",
      nomeArquivo: "receita.pdf",
    });

    const aposAnexar = await timeline(id);
    expect(aposAnexar.status).toBe(200);
    const anexado = aposAnexar.body.find(
      (e: { titulo: string }) => e.titulo === "Documento anexado",
    );
    expect(anexado).toBeDefined();
    expect(anexado.tipo).toBe("documento");
    expect(anexado.automatico).toBe(true);
    expect(anexado.descricao).toContain("Receita");
    expect(anexado.descricao).toContain("receita.pdf");

    const del = await request(app).delete(
      `/api/pacientes/${id}/documentos/${documentoId}`,
    );
    expect(del.status).toBe(204);

    const aposRemover = await timeline(id);
    const removido = aposRemover.body.find(
      (e: { titulo: string }) => e.titulo === "Documento removido",
    );
    expect(removido).toBeDefined();
    expect(removido.tipo).toBe("documento");
    expect(removido.descricao).toContain("Receita");
    expect(removido.descricao).toContain("receita.pdf");
  });
});
