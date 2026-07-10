import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { criarDocumentoContrato } from "./autentique-criar";

/**
 * Sandbox da Autentique (AUTENTIQUE_SANDBOX=true): o documento é criado em modo
 * teste E — como o sandbox da Autentique não suprime e-mail — a entrega é
 * forçada para link em TODOS os signatários, para não notificar paciente real.
 * Em produção, mantém a regra: com e-mail → e-mail; sem e-mail → link.
 */

const PDF = new Uint8Array([1, 2, 3]);

/** Mocka o fetch da Autentique com uma resposta de sucesso. */
function mockFetchOk() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      data: {
        createDocument: {
          id: "doc-1",
          signatures: [{ link: { short_link: "https://autentique/abc" } }],
        },
      },
    }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Extrai o payload GraphQL (variables) do FormData enviado ao fetch. */
function variaveisEnviadas(fetchMock: ReturnType<typeof mockFetchOk>) {
  const body = fetchMock.mock.calls[0]![1]!.body as FormData;
  const operations = JSON.parse(body.get("operations") as string);
  return operations.variables as {
    sandbox: boolean;
    signers: { name: string; email?: string; delivery_method?: string }[];
  };
}

beforeEach(() => {
  process.env.AUTENTIQUE_API_TOKEN = "token-de-teste";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.AUTENTIQUE_SANDBOX;
});

describe("criarDocumentoContrato — sandbox", () => {
  it("SANDBOX on: envia sandbox=true e força link (suprime e-mail)", async () => {
    process.env.AUTENTIQUE_SANDBOX = "true";
    const fetchMock = mockFetchOk();

    await criarDocumentoContrato({
      pdf: PDF,
      nomeDocumento: "Contrato",
      signatarios: [{ nome: "Paciente", email: "paciente@real.com" }],
    });

    const { sandbox, signers } = variaveisEnviadas(fetchMock);
    expect(sandbox).toBe(true);
    expect(signers[0]!.email).toBeUndefined();
    expect(signers[0]!.delivery_method).toBe("DELIVERY_METHOD_LINK");
  });

  it("PRODUÇÃO (default): envia sandbox=false e mantém a entrega por e-mail", async () => {
    const fetchMock = mockFetchOk();

    await criarDocumentoContrato({
      pdf: PDF,
      nomeDocumento: "Contrato",
      signatarios: [{ nome: "Paciente", email: "paciente@real.com" }],
    });

    const { sandbox, signers } = variaveisEnviadas(fetchMock);
    expect(sandbox).toBe(false);
    expect(signers[0]!.email).toBe("paciente@real.com");
    expect(signers[0]!.delivery_method).toBeUndefined();
  });

  it("PRODUÇÃO sem e-mail: entrega por link", async () => {
    const fetchMock = mockFetchOk();

    await criarDocumentoContrato({
      pdf: PDF,
      nomeDocumento: "Termo",
      signatarios: [{ nome: "Paciente" }],
    });

    const { signers } = variaveisEnviadas(fetchMock);
    expect(signers[0]!.email).toBeUndefined();
    expect(signers[0]!.delivery_method).toBe("DELIVERY_METHOD_LINK");
  });
});
