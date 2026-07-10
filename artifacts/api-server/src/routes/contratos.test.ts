import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { db, pacientesTable, contratoModelosTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

// A revisão de IA e a criação na Autentique são mockadas: queremos exercitar as
// transições de estado e os invariantes da rota, não as integrações reais.
vi.mock("../lib/contrato-revisao-ia", async () => {
  const real = await vi.importActual<typeof import("../lib/contrato-revisao-ia")>(
    "../lib/contrato-revisao-ia",
  );
  return { ...real, revisarContrato: vi.fn() };
});

vi.mock("../lib/autentique-criar", () => {
  class CriarContratoError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "CriarContratoError";
    }
  }
  return {
    CriarContratoError,
    criarDocumentoContrato: vi.fn(),
  };
});

// O fluxo de status (leitura) é chamado após o envio; isola da Autentique real.
vi.mock("../lib/contrato", () => ({
  refrescarStatusContrato: vi.fn(async (p) => p),
}));

// Espelho de status do TERMO: mesma isolação do contrato, para o caminho TCLE.
vi.mock("../lib/termo", () => ({
  refrescarStatusTermo: vi.fn(async (p) => p),
}));

// Armazenamento de objetos: no upload, a rota baixa o PDF do storage. Mockamos
// para controlar o conteúdo/falha sem depender do Supabase real.
vi.mock("../lib/objectStorage", () => {
  class ObjectNotFoundError extends Error {
    constructor() {
      super("Object not found");
      this.name = "ObjectNotFoundError";
    }
  }
  const fetchObject = vi.fn();
  class ObjectStorageService {
    fetchObject = fetchObject;
    async downloadObject(p: string) {
      return fetchObject(p);
    }
    async getObjectEntityUploadURL() {
      return "https://storage.test/upload";
    }
    normalizeObjectEntityPath() {
      return "/objects/uploads/mock";
    }
    async deleteObjectEntity() {}
  }
  return { ObjectStorageService, ObjectNotFoundError, __fetchObject: fetchObject };
});

// Status por signatário: mockado para exercitar o endpoint por-parte sem a
// Autentique real. O resto do módulo (extrairDocumentoId etc.) fica intacto.
vi.mock("../lib/autentique", async () => {
  const real =
    await vi.importActual<typeof import("../lib/autentique")>("../lib/autentique");
  return { ...real, listarAssinaturasContrato: vi.fn() };
});

import app from "../app";
import * as objectStorageMock from "../lib/objectStorage";
import { listarAssinaturasContrato } from "../lib/autentique";
import {
  obterModeloPadrao,
  PROCEDIMENTO_BASE,
} from "../lib/contrato-modelo-padrao";
import { revisarContrato } from "../lib/contrato-revisao-ia";
import {
  criarDocumentoContrato,
  CriarContratoError,
} from "../lib/autentique-criar";
import { refrescarStatusContrato } from "../lib/contrato";
import { refrescarStatusTermo } from "../lib/termo";
import type { RelatorioRevisao } from "@workspace/db";

const mockRevisar = vi.mocked(revisarContrato);
const mockCriarDoc = vi.mocked(criarDocumentoContrato);
const mockFetchObject = (
  objectStorageMock as unknown as { __fetchObject: ReturnType<typeof vi.fn> }
).__fetchObject;
const mockListarAssinaturas = vi.mocked(listarAssinaturasContrato);
const mockRefrescarContrato = vi.mocked(refrescarStatusContrato);
const mockRefrescarTermo = vi.mocked(refrescarStatusTermo);

const pacientesCriados: number[] = [];
const modelosCriados: number[] = [];

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
function cpfUnico(): string {
  return gerarCpf(_cpfSeed++);
}

async function criarPaciente(): Promise<number> {
  const res = await request(app)
    .post("/api/pacientes")
    .send({
      nome: "Paciente Contrato Gerado",
      cpf: cpfUnico(),
      telefone: "11987654321",
      procedimentos: ["Blefaroplastia"],
      dataCirurgia: "2026-08-15",
      valorSinal: 3000,
    });
  expect(res.status).toBe(201);
  pacientesCriados.push(res.body.paciente.id);
  return res.body.paciente.id as number;
}

async function criarModelo(
  vigente = true,
  tipo: "contrato" | "termo" = "contrato",
): Promise<number> {
  const sufixo = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const res = await request(app)
    .post("/api/contrato-modelos")
    .send({
      tipo,
      procedimento: `Proc ${sufixo}`,
      titulo: "Documento — {{nome}}",
      corpo: "CONTRATANTE: {{nome}}, CPF {{cpf}}. Procedimentos: {{procedimentos}}.",
      vigente,
    });
  expect(res.status).toBe(201);
  modelosCriados.push(res.body.id);
  return res.body.id;
}

// A geração não recebe mais um modelo escolhido pela vendedora: o servidor
// resolve o ÚNICO modelo-base vigente do tipo. Aqui garantimos esse modelo-base
// (semeado por garantirPadrao via GET) e ajustamos sua vigência. Há uma única
// linha-base por tipo (constraint tipo+procedimento), então os testes a
// compartilham — cada teste que gera ajusta a vigência que precisa antes.
async function prepararBase(
  vigente = true,
  tipo: "contrato" | "termo" = "contrato",
): Promise<number> {
  // GET dispara garantirPadrao (cria o modelo-base, NÃO vigente, se faltar).
  const lista = await request(app).get(`/api/contrato-modelos?tipo=${tipo}`);
  expect(lista.status).toBe(200);
  const base = (
    lista.body as { id: number; procedimento: string }[]
  ).find((m) => m.procedimento === PROCEDIMENTO_BASE);
  expect(base, `modelo-base de ${tipo}`).toBeTruthy();
  const patch = await request(app)
    .put(`/api/contrato-modelos/${base!.id}`)
    .send({ vigente });
  expect(patch.status).toBe(200);
  return base!.id;
}

const RELATORIO: RelatorioRevisao = {
  geradoEm: new Date().toISOString(),
  modelo: "gpt-5.4",
  alertas: 1,
  resumoGeral: "Resumo de teste.",
  frentes: [
    {
      chave: "clausulas",
      titulo: "Cláusulas",
      resumo: "ok",
      itens: [{ rotulo: "Objeto", status: "atencao", observacao: "vago" }],
    },
  ],
};

beforeEach(() => {
  mockRevisar.mockReset();
  mockCriarDoc.mockReset();
  mockFetchObject.mockReset();
  mockListarAssinaturas.mockReset();
  // Os espelhos de status mantêm a implementação (async (p) => p); só zeramos o
  // histórico de chamadas para afirmar QUAL espelho cada tipo de envio dispara.
  mockRefrescarContrato.mockClear();
  mockRefrescarTermo.mockClear();
});

afterAll(async () => {
  if (pacientesCriados.length > 0) {
    await db.delete(pacientesTable).where(inArray(pacientesTable.id, pacientesCriados));
  }
  for (const id of modelosCriados) {
    await db.delete(contratoModelosTable).where(eq(contratoModelosTable.id, id));
  }
});

describe("GET /pacientes/:id/documento-contexto", () => {
  it("devolve a ficha agrupada com os valores já resolvidos", async () => {
    const pacienteId = await criarPaciente();

    const res = await request(app).get(
      `/api/pacientes/${pacienteId}/documento-contexto`,
    );

    expect(res.status).toBe(200);
    const grupos = res.body as Array<{
      chave: string;
      titulo: string;
      campos: Array<{ rotulo: string; valor: string }>;
    }>;
    // Sempre os três grupos, nesta ordem; o cliente é quem oculta Valores no termo.
    expect(grupos.map((g) => g.chave)).toEqual([
      "paciente",
      "procedimento",
      "valores",
    ]);

    const paciente = grupos.find((g) => g.chave === "paciente");
    expect(paciente?.campos.find((c) => c.rotulo === "Nome")?.valor).toBe(
      "Paciente Contrato Gerado",
    );
    // CPF resolvido e formatado (não vazio), nunca o cru.
    expect(paciente?.campos.find((c) => c.rotulo === "CPF")?.valor).not.toBe(
      "—",
    );

    const procedimento = grupos.find((g) => g.chave === "procedimento");
    expect(
      procedimento?.campos.find((c) => c.rotulo === "Procedimento(s)")?.valor,
    ).toBe("Blefaroplastia");
    expect(procedimento?.campos.find((c) => c.rotulo === "Data")?.valor).toBe(
      "15/08/2026",
    );

    // Valor formatado em R$ — comparamos só a parte numérica para não depender
    // do espaço (NBSP/narrow) que o Intl insere depois de "R$".
    const valores = grupos.find((g) => g.chave === "valores");
    expect(
      valores?.campos.find((c) => c.rotulo === "Valor pago")?.valor,
    ).toContain("3.000,00");
  });

  it("responde 404 quando a paciente não existe", async () => {
    const res = await request(app).get(
      "/api/pacientes/99999999/documento-contexto",
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /pacientes/:id/contratos/gerar", () => {
  it("gera um rascunho com as variáveis resolvidas", async () => {
    const pacienteId = await criarPaciente();
    await prepararBase(true);

    const res = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/gerar`)
      .send({ tipo: "contrato" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("rascunho");
    expect(res.body.tipo).toBe("contrato");
    expect(res.body.corpo).toContain("Paciente Contrato Gerado");
    expect(res.body.corpo).not.toContain("{{nome}}");
    expect(res.body.corpo).toContain("Blefaroplastia");
  }, 30000);

  it("recusa gerar quando não há modelo-base vigente do tipo", async () => {
    const pacienteId = await criarPaciente();
    await prepararBase(false);

    const res = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/gerar`)
      .send({ tipo: "contrato" });

    expect(res.status).toBe(400);
  }, 30000);
});

describe("GET /contratos/:id/pdf (baixar)", () => {
  async function gerarRascunho(
    tipo: "contrato" | "termo" = "contrato",
  ): Promise<number> {
    const pacienteId = await criarPaciente();
    await prepararBase(true, tipo);
    const gerar = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/gerar`)
      .send({ tipo });
    return gerar.body.id as number;
  }

  it("baixa o PDF do rascunho como anexo, sem cache e com assinatura %PDF", async () => {
    const geracaoId = await gerarRascunho("contrato");

    const res = await request(app).get(`/api/contratos/${geracaoId}/pdf`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.headers["content-disposition"]).toContain(
      `contrato-${geracaoId}.pdf`,
    );
    expect(res.headers["cache-control"]).toContain("no-store");
    const pdf = Buffer.from(res.body);
    expect(pdf.length).toBeGreaterThan(0);
    // Assinatura de arquivo PDF.
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30000);

  it("usa o prefixo termo-consentimento no nome para o TCLE", async () => {
    const geracaoId = await gerarRascunho("termo");

    const res = await request(app).get(`/api/contratos/${geracaoId}/pdf`);

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain(
      `termo-consentimento-${geracaoId}.pdf`,
    );
  }, 30000);

  it("responde 404 quando a geração não existe", async () => {
    const res = await request(app).get("/api/contratos/99999999/pdf");
    expect(res.status).toBe(404);
  });
});

describe("PUT /contratos/:id (editar rascunho)", () => {
  async function gerarRascunho(): Promise<number> {
    const pacienteId = await criarPaciente();
    await prepararBase(true);
    const gerar = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/gerar`)
      .send({ tipo: "contrato" });
    return gerar.body.id as number;
  }

  it("preenche variáveis recém-inseridas ({{...}}) ao salvar a edição", async () => {
    const geracaoId = await gerarRascunho();

    // O editor insere a variável literal; o save deve resolvê-la com os dados
    // da paciente (o corpo é HTML, então o valor entra escapado em nó de texto).
    const res = await request(app)
      .put(`/api/contratos/${geracaoId}`)
      .send({ corpo: "<p>CONTRATANTE: {{nome}} — CPF {{cpf}}</p>" });

    expect(res.status).toBe(200);
    expect(res.body.corpo).toContain("Paciente Contrato Gerado");
    expect(res.body.corpo).not.toContain("{{nome}}");
    expect(res.body.corpo).not.toContain("{{cpf}}");
  }, 30000);

  it("é idempotente para corpo já resolvido (sem tokens preserva o texto)", async () => {
    const geracaoId = await gerarRascunho();

    const corpo = "<p>Texto final sem variaveis, ja resolvido.</p>";
    const res = await request(app)
      .put(`/api/contratos/${geracaoId}`)
      .send({ corpo });

    expect(res.status).toBe(200);
    expect(res.body.corpo).toBe(corpo);
  }, 30000);
});

describe("POST /contratos/:id/revisar", () => {
  it("salva o relatório quando a IA responde", async () => {
    const pacienteId = await criarPaciente();
    await prepararBase(true);
    const gerar = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/gerar`)
      .send({ tipo: "contrato" });
    const geracaoId = gerar.body.id;

    mockRevisar.mockResolvedValue(RELATORIO);
    const res = await request(app).post(`/api/contratos/${geracaoId}/revisar`);

    expect(res.status).toBe(200);
    expect(res.body.relatorioIa.alertas).toBe(1);
    expect(res.body.iaRevisadoEm).not.toBeNull();
    expect(res.body.status).toBe("rascunho");
  }, 30000);

  it("degrada para 502 sem corromper o rascunho quando a IA falha", async () => {
    const pacienteId = await criarPaciente();
    await prepararBase(true);
    const gerar = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/gerar`)
      .send({ tipo: "contrato" });
    const geracaoId = gerar.body.id;

    const { RevisaoIaError } = await vi.importActual<
      typeof import("../lib/contrato-revisao-ia")
    >("../lib/contrato-revisao-ia");
    mockRevisar.mockRejectedValue(new RevisaoIaError("IA indisponível"));

    const res = await request(app).post(`/api/contratos/${geracaoId}/revisar`);
    expect(res.status).toBe(502);

    const lista = await request(app).get(`/api/pacientes/${pacienteId}/contratos`);
    const g = lista.body.find((x: { id: number }) => x.id === geracaoId);
    expect(g.status).toBe("rascunho");
    expect(g.relatorioIa).toBeNull();
  }, 30000);
});

describe("POST /contratos/:id/aprovar-e-enviar", () => {
  it("exige o nome de quem aprova", async () => {
    const pacienteId = await criarPaciente();
    await prepararBase(true);
    const gerar = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/gerar`)
      .send({ tipo: "contrato" });

    const res = await request(app)
      .post(`/api/contratos/${gerar.body.id}/aprovar-e-enviar`)
      .send({ aprovadoPor: "" });
    expect(res.status).toBe(400);
  }, 30000);

  it("aprova, cria na Autentique e vincula à paciente", async () => {
    const pacienteId = await criarPaciente();
    await prepararBase(true);
    const gerar = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/gerar`)
      .send({ tipo: "contrato" });
    const geracaoId = gerar.body.id;

    mockCriarDoc.mockResolvedValue({ id: "doc-autentique-123", linkAssinatura: "https://autentique.test/sign/123" });

    // Zera o histórico imediatamente antes do envio: o que for contado a seguir
    // veio do envio, não do preparo (a leitura do paciente adiante espelha AMBOS
    // os status e contaminaria a contagem do ramo).
    mockRefrescarContrato.mockClear();
    mockRefrescarTermo.mockClear();

    const res = await request(app)
      .post(`/api/contratos/${geracaoId}/aprovar-e-enviar`)
      .send({ aprovadoPor: "Karla" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("enviado");
    expect(res.body.autentiqueId).toBe("doc-autentique-123");
    expect(res.body.aprovadoPor).toBe("Karla");
    expect(mockCriarDoc).toHaveBeenCalledOnce();
    // O envio de CONTRATO espelha o status do contrato — nunca o do termo.
    expect(mockRefrescarContrato).toHaveBeenCalled();
    expect(mockRefrescarTermo).not.toHaveBeenCalled();

    const paciente = await request(app).get(`/api/pacientes/${pacienteId}`);
    expect(paciente.body.paciente.contratoAutentiqueId).toBe("doc-autentique-123");
  }, 30000);

  it("preserva a aprovação e não vincula a paciente quando a Autentique falha", async () => {
    const pacienteId = await criarPaciente();
    await prepararBase(true);
    const gerar = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/gerar`)
      .send({ tipo: "contrato" });
    const geracaoId = gerar.body.id;

    mockCriarDoc.mockRejectedValue(new CriarContratoError("Autentique fora do ar"));

    const res = await request(app)
      .post(`/api/contratos/${geracaoId}/aprovar-e-enviar`)
      .send({ aprovadoPor: "Karla" });

    expect(res.status).toBe(502);

    const lista = await request(app).get(`/api/pacientes/${pacienteId}/contratos`);
    const g = lista.body.find((x: { id: number }) => x.id === geracaoId);
    expect(g.status).toBe("falha_envio");
    expect(g.aprovadoPor).toBe("Karla"); // aprovação preservada
    expect(g.aprovadoEm).not.toBeNull();
    expect(g.erroEnvio).toContain("Autentique");

    const paciente = await request(app).get(`/api/pacientes/${pacienteId}`);
    expect(paciente.body.paciente.contratoAutentiqueId).toBeNull();
  }, 30000);

  it("recusa reenviar um contrato já enviado", async () => {
    const pacienteId = await criarPaciente();
    await prepararBase(true);
    const gerar = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/gerar`)
      .send({ tipo: "contrato" });
    const geracaoId = gerar.body.id;

    mockCriarDoc.mockResolvedValue({ id: "doc-xyz", linkAssinatura: "https://autentique.test/sign/xyz" });
    await request(app)
      .post(`/api/contratos/${geracaoId}/aprovar-e-enviar`)
      .send({ aprovadoPor: "Karla" });

    const reenvio = await request(app)
      .post(`/api/contratos/${geracaoId}/aprovar-e-enviar`)
      .send({ aprovadoPor: "Karla" });
    expect(reenvio.status).toBe(400);
  }, 30000);
});

// ---------------------------------------------------------------------------
// Upload de contrato PRONTO (PDF por fora): pula a pré-geração e vai direto
// para aprovação/envio, reusando o mesmo caminho da Autentique.
// ---------------------------------------------------------------------------
describe("POST /pacientes/:id/contratos/upload", () => {
  const OBJECT_PATH = "/objects/uploads/contrato-pronto-123";

  it("cria uma geração de upload em rascunho, sem corpo nem modelo", async () => {
    const pacienteId = await criarPaciente();
    const res = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/upload`)
      .send({
        tipo: "contrato",
        objectPath: OBJECT_PATH,
        nomeArquivo: "Contrato_Assinado_Final.pdf",
        contentType: "application/pdf",
        tamanho: 12345,
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("rascunho");
    expect(res.body.arquivoObjectPath).toBe(OBJECT_PATH);
    expect(res.body.arquivoNome).toBe("Contrato_Assinado_Final.pdf");
    expect(res.body.corpo).toBe("");
    expect(res.body.modeloId).toBeNull();
    // Título derivado do nome do arquivo (sem extensão, separadores → espaço).
    expect(res.body.titulo).toBe("Contrato Assinado Final");
  }, 30000);

  it("rejeita arquivo que não é PDF", async () => {
    const pacienteId = await criarPaciente();
    const res = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/upload`)
      .send({
        tipo: "contrato",
        objectPath: OBJECT_PATH,
        nomeArquivo: "contrato.docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        tamanho: 5000,
      });
    expect(res.status).toBe(400);
  }, 30000);

  it("rejeita caminho de objeto fora do armazenamento", async () => {
    const pacienteId = await criarPaciente();
    const res = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/upload`)
      .send({
        tipo: "contrato",
        objectPath: "https://evil.example/arquivo.pdf",
        nomeArquivo: "contrato.pdf",
        contentType: "application/pdf",
        tamanho: 5000,
      });
    expect(res.status).toBe(400);
  }, 30000);

  it("não permite editar o texto de um contrato de upload", async () => {
    const pacienteId = await criarPaciente();
    const up = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/upload`)
      .send({
        tipo: "contrato",
        objectPath: OBJECT_PATH,
        nomeArquivo: "contrato.pdf",
        contentType: "application/pdf",
        tamanho: 5000,
      });
    const editar = await request(app)
      .put(`/api/contratos/${up.body.id}`)
      .send({ corpo: "<p>tentativa de edição</p>" });
    expect(editar.status).toBe(400);
  }, 30000);

  it("aprova e envia o PDF baixado do armazenamento à Autentique", async () => {
    const pacienteId = await criarPaciente();
    const up = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/upload`)
      .send({
        tipo: "contrato",
        objectPath: OBJECT_PATH,
        nomeArquivo: "contrato.pdf",
        contentType: "application/pdf",
        tamanho: 5000,
      });
    const geracaoId = up.body.id;

    // %PDF... — bytes de um PDF fictício vindos do "armazenamento".
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    mockFetchObject.mockResolvedValue({
      arrayBuffer: async () => pdfBytes.buffer,
    });
    mockCriarDoc.mockResolvedValue({
      id: "doc-upload-1",
      linkAssinatura: "https://autentique.test/sign/upload-1",
    });

    const res = await request(app)
      .post(`/api/contratos/${geracaoId}/aprovar-e-enviar`)
      .send({ aprovadoPor: "Karla" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("enviado");
    expect(res.body.autentiqueId).toBe("doc-upload-1");
    expect(mockFetchObject).toHaveBeenCalledWith(OBJECT_PATH);
    expect(mockCriarDoc).toHaveBeenCalledOnce();
  }, 30000);

  it("marca falha de envio quando o PDF não está no armazenamento", async () => {
    const pacienteId = await criarPaciente();
    const up = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/upload`)
      .send({
        tipo: "contrato",
        objectPath: OBJECT_PATH,
        nomeArquivo: "contrato.pdf",
        contentType: "application/pdf",
        tamanho: 5000,
      });
    const geracaoId = up.body.id;

    mockFetchObject.mockRejectedValue(
      new objectStorageMock.ObjectNotFoundError(),
    );

    const res = await request(app)
      .post(`/api/contratos/${geracaoId}/aprovar-e-enviar`)
      .send({ aprovadoPor: "Karla" });

    expect(res.status).toBe(502);
    expect(mockCriarDoc).not.toHaveBeenCalled();

    const lista = await request(app).get(
      `/api/pacientes/${pacienteId}/contratos`,
    );
    const g = lista.body.find((x: { id: number }) => x.id === geracaoId);
    expect(g.status).toBe("falha_envio");
    expect(g.aprovadoPor).toBe("Karla"); // aprovação preservada
  }, 30000);
});

// ---------------------------------------------------------------------------
// Multi-signatário + status por parte (contrato: paciente + representante).
// ---------------------------------------------------------------------------
describe("Signatários múltiplos e status por parte", () => {
  it("envia com paciente + representante e persiste os signatários", async () => {
    const pacienteId = await criarPaciente();
    await prepararBase(true);
    const gerar = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/gerar`)
      .send({ tipo: "contrato" });
    const geracaoId = gerar.body.id;

    mockCriarDoc.mockResolvedValue({ id: "doc-multi-1", linkAssinatura: null });

    const res = await request(app)
      .post(`/api/contratos/${geracaoId}/aprovar-e-enviar`)
      .send({
        aprovadoPor: "Karla",
        signatarios: [
          { papel: "paciente", nome: "Fulana", email: "fulana@ex.com" },
          { papel: "representante", nome: "Rep Legal", email: "rep@empresa.com" },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("enviado");
    expect(res.body.signatarios).toHaveLength(2);
    expect(res.body.signatarios[1]).toMatchObject({
      papel: "representante",
      email: "rep@empresa.com",
    });
    // A Autentique recebeu os DOIS signatários.
    expect(mockCriarDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        signatarios: expect.arrayContaining([
          expect.objectContaining({ email: "fulana@ex.com" }),
          expect.objectContaining({ email: "rep@empresa.com" }),
        ]),
      }),
    );
  }, 30000);

  it("GET /contratos/:id/assinaturas devolve status por parte com papéis", async () => {
    const pacienteId = await criarPaciente();
    await prepararBase(true);
    const gerar = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/gerar`)
      .send({ tipo: "contrato" });
    const geracaoId = gerar.body.id;

    mockCriarDoc.mockResolvedValue({ id: "doc-parte-1", linkAssinatura: null });
    await request(app)
      .post(`/api/contratos/${geracaoId}/aprovar-e-enviar`)
      .send({
        aprovadoPor: "Karla",
        signatarios: [
          { papel: "paciente", nome: "Fulana", email: "fulana@ex.com" },
          { papel: "representante", nome: "Rep Legal", email: "rep@empresa.com" },
        ],
      });

    // A paciente já assinou; o representante ainda não.
    mockListarAssinaturas.mockResolvedValue({
      disponivel: true,
      assinaturas: [
        { nome: "Fulana", email: "fulana@ex.com", status: "assinado", em: "2026-07-07T10:00:00Z" },
        { nome: "Rep Legal", email: "rep@empresa.com", status: "pendente", em: null },
      ],
    });

    const res = await request(app).get(`/api/contratos/${geracaoId}/assinaturas`);
    expect(res.status).toBe(200);
    expect(res.body.enviado).toBe(true);
    expect(res.body.partes).toHaveLength(2);
    const paciente = res.body.partes.find(
      (p: { papel: string }) => p.papel === "paciente",
    );
    expect(paciente.status).toBe("assinado");
    const rep = res.body.partes.find(
      (p: { papel: string }) => p.papel === "representante",
    );
    expect(rep.status).toBe("pendente");
  }, 30000);

  it("assinaturas: enviado=false quando ainda não foi à Autentique", async () => {
    const pacienteId = await criarPaciente();
    await prepararBase(true);
    const gerar = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/gerar`)
      .send({ tipo: "contrato" });

    const res = await request(app).get(
      `/api/contratos/${gerar.body.id}/assinaturas`,
    );
    expect(res.status).toBe(200);
    expect(res.body.enviado).toBe(false);
    expect(res.body.partes).toEqual([]);
    expect(mockListarAssinaturas).not.toHaveBeenCalled();
  }, 30000);
});

// ---------------------------------------------------------------------------
// Fluxo de TERMO (TCLE): mesma pipeline do contrato, com vínculo próprio.
// ---------------------------------------------------------------------------
describe("Fluxo de TERMO (TCLE) — mesma pipeline, vínculo próprio", () => {
  it("gera um rascunho de termo com tipo='termo'", async () => {
    const pacienteId = await criarPaciente();
    await prepararBase(true, "termo");

    const res = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/gerar`)
      .send({ tipo: "termo" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("rascunho");
    expect(res.body.tipo).toBe("termo");
    expect(res.body.corpo).toContain("Paciente Contrato Gerado");
    expect(res.body.corpo).not.toContain("{{nome}}");
  }, 30000);

  it("revisa o termo com a frente de TCLE (tipo='termo')", async () => {
    const pacienteId = await criarPaciente();
    await prepararBase(true, "termo");
    const gerar = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/gerar`)
      .send({ tipo: "termo" });
    const geracaoId = gerar.body.id;

    mockRevisar.mockResolvedValue(RELATORIO);
    const res = await request(app).post(`/api/contratos/${geracaoId}/revisar`);

    expect(res.status).toBe(200);
    expect(res.body.relatorioIa.alertas).toBe(1);
    expect(res.body.iaRevisadoEm).not.toBeNull();
    // A revisão recebe o tipo correto — a IA usa a frente de TCLE, não a de contrato.
    expect(mockRevisar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "termo" }),
    );
  }, 30000);

  it("aprova, cria na Autentique e vincula termoAutentiqueId (sem tocar no contrato)", async () => {
    const pacienteId = await criarPaciente();
    await prepararBase(true, "termo");
    const gerar = await request(app)
      .post(`/api/pacientes/${pacienteId}/contratos/gerar`)
      .send({ tipo: "termo" });
    const geracaoId = gerar.body.id;

    mockCriarDoc.mockResolvedValue({
      id: "termo-autentique-789",
      linkAssinatura: "https://autentique.test/sign/789",
    });

    // Zera o histórico imediatamente antes do envio (a leitura do paciente
    // adiante espelha AMBOS os status e contaminaria a contagem do ramo).
    mockRefrescarContrato.mockClear();
    mockRefrescarTermo.mockClear();

    const res = await request(app)
      .post(`/api/contratos/${geracaoId}/aprovar-e-enviar`)
      .send({ aprovadoPor: "Karla" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("enviado");
    expect(res.body.autentiqueId).toBe("termo-autentique-789");
    // O envio de TERMO espelha o status do termo — nunca o do contrato.
    expect(mockRefrescarTermo).toHaveBeenCalled();
    expect(mockRefrescarContrato).not.toHaveBeenCalled();

    const paciente = await request(app).get(`/api/pacientes/${pacienteId}`);
    // O termo vincula termoAutentiqueId e NÃO contamina o contratoAutentiqueId.
    expect(paciente.body.paciente.termoAutentiqueId).toBe(
      "termo-autentique-789",
    );
    expect(paciente.body.paciente.contratoAutentiqueId).toBeNull();
  }, 30000);
});

// ---------------------------------------------------------------------------
// Semeadura dos modelos de fábrica: idempotente e não-sobrescritiva.
// ---------------------------------------------------------------------------
describe("garantirPadrao — semeadura não-sobrescritiva", () => {
  it("não sobrescreve nem duplica um modelo de fábrica já revisado pela equipe", async () => {
    // Único par de fábrica semeado (modelo-base por tipo), para exercitar de
    // fato o caminho de conflito (tipo, procedimento).
    const PROC = PROCEDIMENTO_BASE;

    // GET dispara garantirPadrao (semeia os modelos de fábrica faltantes).
    await request(app).get("/api/contrato-modelos");

    const termos = await request(app).get("/api/contrato-modelos?tipo=termo");
    expect(termos.status).toBe(200);
    const seed = (termos.body as { id: number; procedimento: string }[]).find(
      (m) => m.procedimento === PROC,
    );
    expect(seed, `modelo de termo de fábrica para "${PROC}"`).toBeTruthy();
    const seedId = seed!.id;

    // Estado original COMPLETO da linha de fábrica, restaurado via DB no finally
    // (sem passar pela rota) para não deixar resíduo de versão/auditoria.
    const [original] = await db
      .select()
      .from(contratoModelosTable)
      .where(eq(contratoModelosTable.id, seedId));

    try {
      // A equipe revisa o modelo-base: edita o corpo e marca como vigente.
      const corpoEditado = `REVISADO PELA EQUIPE ${Date.now()} — {{nome}}`;
      const edit = await request(app)
        .put(`/api/contrato-modelos/${seedId}`)
        .send({ corpo: corpoEditado, vigente: true });
      expect(edit.status).toBe(200);

      // Re-dispara a semeadura: deve ser inofensiva (onConflictDoNothing).
      await request(app).get("/api/contrato-modelos");

      const depois = await request(app).get(
        "/api/contrato-modelos?tipo=termo",
      );
      const mesmos = (
        depois.body as {
          id: number;
          procedimento: string;
          corpo: string;
          vigente: boolean;
        }[]
      ).filter((m) => m.procedimento === PROC);

      expect(mesmos).toHaveLength(1); // não duplicou
      expect(mesmos[0].id).toBe(seedId); // mesma linha
      expect(mesmos[0].corpo).toBe(corpoEditado); // texto preservado
      expect(mesmos[0].vigente).toBe(true); // vigência preservada
    } finally {
      // Restaura o estado original EXATO (corpo/título/versão/vigência/notas/
      // timestamp) para não poluir o ambiente compartilhado.
      await db
        .update(contratoModelosTable)
        .set({
          corpo: original.corpo,
          titulo: original.titulo,
          versao: original.versao,
          vigente: original.vigente,
          observacoes: original.observacoes,
          updatedAt: original.updatedAt,
        })
        .where(eq(contratoModelosTable.id, seedId));
    }
  }, 30000);
});

// ---------------------------------------------------------------------------
// Limpeza dos modelos-base por procedimento legados (deriva da semeadura antiga).
// ---------------------------------------------------------------------------
describe("desativarBasesObsoletas — rebaixa modelos por procedimento legados", () => {
  it("rebaixa os por procedimento vigentes e preserva só o modelo-base único", async () => {
    // Modelo por procedimento legado, criado JÁ vigente (resíduo do esquema
    // antigo). A geração nunca o usa — resolve só o modelo-base único.
    const legadoId = await criarModelo(true);
    // Garante o modelo-base único vigente do mesmo tipo (contrato).
    const baseId = await prepararBase(true, "contrato");

    // GET dispara garantirPadrao + desativarBasesObsoletas.
    const lista = await request(app).get("/api/contrato-modelos?tipo=contrato");
    expect(lista.status).toBe(200);
    const modelos = lista.body as {
      id: number;
      procedimento: string;
      vigente: boolean;
    }[];

    // O legado por procedimento foi rebaixado (não apagado), e o modelo-base
    // único continua vigente.
    const legado = modelos.find((m) => m.id === legadoId);
    expect(legado, "modelo legado ainda presente").toBeTruthy();
    expect(legado!.vigente).toBe(false);

    const base = modelos.find((m) => m.id === baseId);
    expect(base?.procedimento).toBe(PROCEDIMENTO_BASE);
    expect(base?.vigente).toBe(true);

    // Há exatamente um modelo vigente por tipo, e é o modelo-base único.
    const vigentes = modelos.filter((m) => m.vigente);
    expect(vigentes).toHaveLength(1);
    expect(vigentes[0].procedimento).toBe(PROCEDIMENTO_BASE);
  }, 30000);
});

describe("POST /contrato-modelos/:id/restaurar-padrao", () => {
  const PROC = PROCEDIMENTO_BASE;

  /** Localiza o modelo de fábrica semeado para PROC do tipo pedido. */
  async function modeloDeFabrica(
    tipo: "contrato" | "termo",
  ): Promise<{ id: number; corpo: string; titulo: string }> {
    await request(app).get("/api/contrato-modelos");
    const lista = await request(app).get(`/api/contrato-modelos?tipo=${tipo}`);
    const m = (
      lista.body as { id: number; procedimento: string; corpo: string; titulo: string }[]
    ).find((x) => x.procedimento === PROC);
    expect(m, `modelo de fábrica (${tipo}) para "${PROC}"`).toBeTruthy();
    return m!;
  }

  it("404 quando o modelo não existe", async () => {
    const res = await request(app)
      .post("/api/contrato-modelos/99999999/restaurar-padrao")
      .send({});
    expect(res.status).toBe(404);
  });

  it("422 para modelo sem texto de fábrica (criado manualmente)", async () => {
    const id = await criarModelo(true);
    const res = await request(app)
      .post(`/api/contrato-modelos/${id}/restaurar-padrao`)
      .send({ confirmar: true });
    expect(res.status).toBe(422);
  });

  it("exige confirmação e restaura ao texto de fábrica ATUAL, NÃO vigente", async () => {
    const fabrica = await modeloDeFabrica("contrato");
    const padrao = obterModeloPadrao("contrato", PROC);
    expect(padrao, `texto de fábrica para "${PROC}"`).toBeTruthy();
    const [original] = await db
      .select()
      .from(contratoModelosTable)
      .where(eq(contratoModelosTable.id, fabrica.id));

    try {
      // A equipe edita o corpo e marca como vigente.
      const corpoEditado = `EDITADO PELA EQUIPE ${Date.now()} — {{nome}}`;
      const edit = await request(app)
        .put(`/api/contrato-modelos/${fabrica.id}`)
        .send({ corpo: corpoEditado, vigente: true });
      expect(edit.status).toBe(200);

      // Sem confirmar: 409, e o texto editado permanece intacto.
      const semConfirmar = await request(app)
        .post(`/api/contrato-modelos/${fabrica.id}/restaurar-padrao`)
        .send({});
      expect(semConfirmar.status).toBe(409);
      const aindaEditado = await request(app).get(
        `/api/contrato-modelos?tipo=contrato`,
      );
      expect(
        (aindaEditado.body as { id: number; corpo: string }[]).find(
          (x) => x.id === fabrica.id,
        )?.corpo,
      ).toBe(corpoEditado);

      // Com confirmar: restaura o texto de fábrica ATUAL e zera a vigência.
      const ok = await request(app)
        .post(`/api/contrato-modelos/${fabrica.id}/restaurar-padrao`)
        .send({ confirmar: true });
      expect(ok.status).toBe(200);
      expect(ok.body.corpo).toBe(padrao!.corpo);
      expect(ok.body.titulo).toBe(padrao!.titulo);
      expect(ok.body.vigente).toBe(false);
    } finally {
      await db
        .update(contratoModelosTable)
        .set({
          corpo: original.corpo,
          titulo: original.titulo,
          versao: original.versao,
          vigente: original.vigente,
          observacoes: original.observacoes,
          updatedAt: original.updatedAt,
        })
        .where(eq(contratoModelosTable.id, fabrica.id));
    }
  }, 30000);

  it("restaura sem confirmação um modelo já idêntico à fábrica (no-op idempotente)", async () => {
    const fabrica = await modeloDeFabrica("termo");
    const padrao = obterModeloPadrao("termo", PROC);
    expect(padrao, `texto de fábrica (termo) para "${PROC}"`).toBeTruthy();
    const [original] = await db
      .select()
      .from(contratoModelosTable)
      .where(eq(contratoModelosTable.id, fabrica.id));

    try {
      // Deixa o modelo EXATAMENTE igual à fábrica e não vigente (estado
      // "intocado"), seja qual for o texto semeado neste ambiente.
      const alinhar = await request(app)
        .put(`/api/contrato-modelos/${fabrica.id}`)
        .send({ corpo: padrao!.corpo, titulo: padrao!.titulo, vigente: false });
      expect(alinhar.status).toBe(200);
      const versaoAlinhada = alinhar.body.versao as number;

      // Restaurar agora é no-op: não precisa confirmar e a versão não muda.
      const res = await request(app)
        .post(`/api/contrato-modelos/${fabrica.id}/restaurar-padrao`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.corpo).toBe(padrao!.corpo);
      expect(res.body.vigente).toBe(false);
      expect(res.body.versao).toBe(versaoAlinhada);
    } finally {
      await db
        .update(contratoModelosTable)
        .set({
          corpo: original.corpo,
          titulo: original.titulo,
          versao: original.versao,
          vigente: original.vigente,
          observacoes: original.observacoes,
          updatedAt: original.updatedAt,
        })
        .where(eq(contratoModelosTable.id, fabrica.id));
    }
  }, 30000);
});
