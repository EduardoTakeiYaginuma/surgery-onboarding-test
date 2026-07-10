import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { db, pacientesTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import app from "../app";
import * as autentique from "../lib/autentique";

// IDs criados durante os testes; limpos no afterAll (cascade remove o histórico).
const pacientesCriados: number[] = [];

// CPF/telefone que passam pela validação de formato da API (apenas dígitos).
const TELEFONE_VALIDO = "11987654321";

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
      nome: "Paciente Termo",
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

afterAll(async () => {
  if (pacientesCriados.length > 0) {
    await db
      .delete(pacientesTable)
      .where(inArray(pacientesTable.id, pacientesCriados));
  }
});

describe("PATCH /pacientes/:id — campos do termo de consentimento", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("vincula o termo a partir do termoLink (extrai o id do documento da Autentique)", async () => {
    // Ao vincular, a rota consulta a Autentique ao vivo. Mockamos para devolver
    // um status determinístico sem depender da API real.
    vi.spyOn(autentique, "consultarStatusContrato").mockResolvedValue({
      status: "pendente",
      assinadoEm: null,
      linkAssinatura: "https://assinatura.autentique.com.br/abc",
    });
    const { id } = await criarPaciente();

    const DOC_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const res = await request(app)
      .patch(`/api/pacientes/${id}`)
      .send({ termoLink: `https://painel.autentique.com.br/documentos/${DOC_ID}` });

    expect(res.status).toBe(200);
    expect(res.body.paciente.termoAutentiqueId).toBe(DOC_ID);
    expect(res.body.paciente.termoStatus).toBe("pendente");
  });

  it("limpa o vínculo do termo quando termoLink vem vazio", async () => {
    const { id } = await criarPaciente();
    // Começa com um documento vinculado direto no banco.
    await db
      .update(pacientesTable)
      .set({ termoAutentiqueId: "cccccccc-dddd-4eee-8fff-999999999999" })
      .where(inArray(pacientesTable.id, [id]));

    const res = await request(app)
      .patch(`/api/pacientes/${id}`)
      .send({ termoLink: "" });

    expect(res.status).toBe(200);
    expect(res.body.paciente.termoAutentiqueId).toBeNull();
    expect(res.body.paciente.termoStatus).toBeNull();
  });

  it("salva o override manual do link de assinatura do termo", async () => {
    const { id } = await criarPaciente();
    const link = "https://assinatura.autentique.com.br/manual-termo";

    const res = await request(app)
      .patch(`/api/pacientes/${id}`)
      .send({ termoLinkAssinaturaManual: link });

    expect(res.status).toBe(200);
    expect(res.body.paciente.termoLinkAssinaturaManual).toBe(link);
  });

  it("limpa o override manual quando termoLinkAssinaturaManual vem vazio", async () => {
    const { id } = await criarPaciente();
    await db
      .update(pacientesTable)
      .set({ termoLinkAssinaturaManual: "https://exemplo/antigo" })
      .where(inArray(pacientesTable.id, [id]));

    const res = await request(app)
      .patch(`/api/pacientes/${id}`)
      .send({ termoLinkAssinaturaManual: "" });

    expect(res.status).toBe(200);
    expect(res.body.paciente.termoLinkAssinaturaManual).toBeNull();
  });

  it("salva o override de prazo do termo (YYYY-MM-DD)", async () => {
    const { id } = await criarPaciente();

    const res = await request(app)
      .patch(`/api/pacientes/${id}`)
      .send({ termoPrazoOverride: "2026-08-10" });

    expect(res.status).toBe(200);
    expect(res.body.paciente.termoPrazoOverride).toBe("2026-08-10");
  });

  it("limpa o override de prazo quando termoPrazoOverride vem vazio", async () => {
    const { id } = await criarPaciente();
    await db
      .update(pacientesTable)
      .set({ termoPrazoOverride: "2026-08-10" })
      .where(inArray(pacientesTable.id, [id]));

    const res = await request(app)
      .patch(`/api/pacientes/${id}`)
      .send({ termoPrazoOverride: "" });

    expect(res.status).toBe(200);
    expect(res.body.paciente.termoPrazoOverride).toBeNull();
  });

  it("devolve 400 quando um campo do termo tem o tipo errado", async () => {
    const { id } = await criarPaciente();

    const res = await request(app)
      .patch(`/api/pacientes/${id}`)
      // termoPrazoOverride deve ser string|null — um número é inválido.
      .send({ termoPrazoOverride: 12345 });

    expect(res.status).toBe(400);
  });

  it("devolve 404 ao tentar atualizar o termo de um id inexistente", async () => {
    const res = await request(app)
      .patch("/api/pacientes/99999999")
      .send({ termoPrazoOverride: "2026-08-10" });
    expect(res.status).toBe(404);
  });
});

describe("download do termo assinado", () => {
  // UUID interno do documento na Autentique: NUNCA pode aparecer na resposta.
  const DOC_ID = "11111111-2222-4333-8444-555555555555";
  // URL temporária do PDF na Autentique: SOMENTE servidor, nunca vaza ao cliente.
  const URL_INTERNA =
    "https://storage.autentique.com.br/segredo/termo-assinado.pdf";
  const PDF_BYTES = Buffer.from("%PDF-1.4\n teste termo assinado\n%%EOF");

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Cria um paciente já com o documento do termo vinculado e devolve tanto o id
  // interno (rota do Console) quanto o token público (link da paciente).
  async function criarPacienteComTermo(): Promise<{
    id: number;
    token: string;
  }> {
    const { id, token } = await criarPaciente({ nome: "Paciente Termo Doc" });
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

  describe("GET /pacientes/:id/termo/download (Console)", () => {
    it("devolve 404 quando o paciente não tem termo vinculado", async () => {
      const espia = vi.spyOn(autentique, "obterArquivoAssinado");
      const { id } = await criarPaciente({ nome: "Sem Termo" });

      const res = await request(app).get(`/api/pacientes/${id}/termo/download`);

      expect(res.status).toBe(404);
      // Nem chega a consultar a Autentique: não há documento vinculado.
      expect(espia).not.toHaveBeenCalled();
      naoVazaSegredos(JSON.stringify(res.body));
    });

    it("devolve 404 quando o paciente não existe", async () => {
      const res = await request(app).get(
        `/api/pacientes/99999999/termo/download`,
      );
      expect(res.status).toBe(404);
    });

    it("devolve 409 quando o termo ainda não está assinado", async () => {
      vi.spyOn(autentique, "obterArquivoAssinado").mockResolvedValue({
        status: "pendente",
        url: null,
      });
      const { id } = await criarPacienteComTermo();

      const res = await request(app).get(`/api/pacientes/${id}/termo/download`);

      expect(res.status).toBe(409);
      naoVazaSegredos(JSON.stringify(res.body));
    });

    it("devolve 502 quando a Autentique está indisponível", async () => {
      vi.spyOn(autentique, "obterArquivoAssinado").mockResolvedValue({
        status: "indisponivel",
        url: null,
      });
      const { id } = await criarPacienteComTermo();

      const res = await request(app).get(`/api/pacientes/${id}/termo/download`);

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
      const { id } = await criarPacienteComTermo();

      const res = await request(app).get(`/api/pacientes/${id}/termo/download`);

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
      const { id } = await criarPacienteComTermo();

      const res = await request(app).get(
        `/api/pacientes/${id}/termo/download?download=1`,
      );

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/pdf");
      expect(res.headers["content-disposition"]).toContain("attachment");
      expect(res.headers["content-disposition"]).toContain(".pdf");
    });
  });

  describe("GET /publico/:token/termo/download (link público)", () => {
    it("devolve 404 quando o paciente não tem termo vinculado", async () => {
      const espia = vi.spyOn(autentique, "obterArquivoAssinado");
      const { token } = await criarPaciente({ nome: "Pública Sem Termo" });

      const res = await request(app).get(
        `/api/publico/${token}/termo/download`,
      );

      expect(res.status).toBe(404);
      expect(espia).not.toHaveBeenCalled();
      naoVazaSegredos(JSON.stringify(res.body));
    });

    it("devolve 404 quando o token não existe", async () => {
      const res = await request(app).get(
        `/api/publico/token-inexistente/termo/download`,
      );
      expect(res.status).toBe(404);
    });

    it("devolve 409 quando o termo ainda não está assinado", async () => {
      vi.spyOn(autentique, "obterArquivoAssinado").mockResolvedValue({
        status: "pendente",
        url: null,
      });
      const { token } = await criarPacienteComTermo();

      const res = await request(app).get(
        `/api/publico/${token}/termo/download`,
      );

      expect(res.status).toBe(409);
      naoVazaSegredos(JSON.stringify(res.body));
    });

    it("devolve 502 quando a Autentique está indisponível", async () => {
      vi.spyOn(autentique, "obterArquivoAssinado").mockResolvedValue({
        status: "indisponivel",
        url: null,
      });
      const { token } = await criarPacienteComTermo();

      const res = await request(app).get(
        `/api/publico/${token}/termo/download`,
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
      const { token } = await criarPacienteComTermo();

      const res = await request(app).get(
        `/api/publico/${token}/termo/download`,
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
});

describe("GET /pacientes/:id — refresh do status do termo ao abrir", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("consulta a Autentique ao vivo e atualiza o cache de status do termo", async () => {
    const { id } = await criarPaciente({ nome: "Refresh Termo" });
    await db
      .update(pacientesTable)
      .set({ termoAutentiqueId: "77777777-8888-4999-8aaa-bbbbbbbbbbbb", termoStatus: "pendente" })
      .where(inArray(pacientesTable.id, [id]));

    const espia = vi
      .spyOn(autentique, "consultarStatusContrato")
      .mockResolvedValue({
        status: "assinado",
        assinadoEm: "2026-06-26T10:00:00.000Z",
        linkAssinatura: null,
      });

    const res = await request(app).get(`/api/pacientes/${id}`);

    expect(res.status).toBe(200);
    expect(espia).toHaveBeenCalled();
    expect(res.body.paciente.termoStatus).toBe("assinado");
  });

  it("não consulta a Autentique quando não há termo vinculado", async () => {
    const { id } = await criarPaciente({ nome: "Sem Termo Refresh" });
    const espia = vi.spyOn(autentique, "consultarStatusContrato");

    const res = await request(app).get(`/api/pacientes/${id}`);

    expect(res.status).toBe(200);
    // Sem termoAutentiqueId, refrescarStatusTermo devolve cedo sem consultar.
    expect(espia).not.toHaveBeenCalled();
  });
});
