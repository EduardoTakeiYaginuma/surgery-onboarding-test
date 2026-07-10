import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  notificarTransicaoContrato,
  notificarPrazoTermo,
  notificarFotoCheckin,
} from "./notificacoes";
import type { ConfigNotificacao } from "./notificacao-config-repo";

const WEBHOOK = "https://exemplo.test/avisos";

// Config persistida controlável por teste. Por padrão, neutra (sem destino
// salvo, não silenciada) — assim os testes de fallback por env continuam valendo.
let configPersistida: ConfigNotificacao = { webhookUrl: null, silenciada: false };

vi.mock("./notificacao-config-repo", () => ({
  notificacaoConfigRepo: {
    obter: async () => configPersistida,
    salvar: async (c: ConfigNotificacao) => c,
  },
}));

describe("notificarTransicaoContrato", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    configPersistida = { webhookUrl: null, silenciada: false };
    delete process.env.EQUIPE_NOTIFICACAO_WEBHOOK;
    delete process.env.EQUIPE_NOTIFICACAO_SILENCIADA;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.EQUIPE_NOTIFICACAO_WEBHOOK;
    delete process.env.EQUIPE_NOTIFICACAO_SILENCIADA;
  });

  it("não envia quando não há webhook configurado", async () => {
    const enviado = await notificarTransicaoContrato(
      { nome: "Ana" },
      "assinado",
    );
    expect(enviado).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("não envia quando silenciado, mesmo com webhook", async () => {
    process.env.EQUIPE_NOTIFICACAO_WEBHOOK = WEBHOOK;
    process.env.EQUIPE_NOTIFICACAO_SILENCIADA = "true";
    const enviado = await notificarTransicaoContrato(
      { nome: "Ana" },
      "assinado",
    );
    expect(enviado).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ignora status que não são assinado/recusado", async () => {
    process.env.EQUIPE_NOTIFICACAO_WEBHOOK = WEBHOOK;
    expect(await notificarTransicaoContrato({ nome: "Ana" }, "pendente")).toBe(
      false,
    );
    expect(
      await notificarTransicaoContrato({ nome: "Ana" }, "indisponivel"),
    ).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("envia o aviso de assinatura com nome e status", async () => {
    process.env.EQUIPE_NOTIFICACAO_WEBHOOK = WEBHOOK;
    const enviado = await notificarTransicaoContrato(
      { nome: "Ana Silva" },
      "assinado",
    );
    expect(enviado).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(WEBHOOK);
    const corpo = JSON.parse((init as RequestInit).body as string);
    expect(corpo.paciente).toBe("Ana Silva");
    expect(corpo.status).toBe("assinado");
    expect(corpo.text).toContain("Ana Silva");
    expect(corpo.text).toContain("assinou o contrato");
  });

  it("envia o aviso de recusa", async () => {
    process.env.EQUIPE_NOTIFICACAO_WEBHOOK = WEBHOOK;
    const enviado = await notificarTransicaoContrato(
      { nome: "Bia" },
      "recusado",
    );
    expect(enviado).toBe(true);
    const corpo = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(corpo.text).toContain("recusou o contrato");
  });

  it("não lança quando o webhook responde com erro", async () => {
    process.env.EQUIPE_NOTIFICACAO_WEBHOOK = WEBHOOK;
    fetchSpy.mockResolvedValue(new Response(null, { status: 500 }));
    const enviado = await notificarTransicaoContrato(
      { nome: "Ana" },
      "assinado",
    );
    expect(enviado).toBe(false);
  });

  it("não lança quando o fetch falha (rede/timeout)", async () => {
    process.env.EQUIPE_NOTIFICACAO_WEBHOOK = WEBHOOK;
    fetchSpy.mockRejectedValue(new Error("rede caiu"));
    const enviado = await notificarTransicaoContrato(
      { nome: "Ana" },
      "assinado",
    );
    expect(enviado).toBe(false);
  });

  it("usa o destino salvo no Console (sem env)", async () => {
    const salvo = "https://salvo.test/avisos";
    configPersistida = { webhookUrl: salvo, silenciada: false };
    const enviado = await notificarTransicaoContrato(
      { nome: "Ana" },
      "assinado",
    );
    expect(enviado).toBe(true);
    expect(fetchSpy.mock.calls[0][0]).toBe(salvo);
  });

  it("o destino salvo tem prioridade sobre o env", async () => {
    process.env.EQUIPE_NOTIFICACAO_WEBHOOK = WEBHOOK;
    const salvo = "https://salvo.test/avisos";
    configPersistida = { webhookUrl: salvo, silenciada: false };
    await notificarTransicaoContrato({ nome: "Ana" }, "assinado");
    expect(fetchSpy.mock.calls[0][0]).toBe(salvo);
  });

  it("o toggle do Console silencia mesmo com destino salvo", async () => {
    configPersistida = { webhookUrl: WEBHOOK, silenciada: true };
    const enviado = await notificarTransicaoContrato(
      { nome: "Ana" },
      "assinado",
    );
    expect(enviado).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("notificarPrazoTermo", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    configPersistida = { webhookUrl: null, silenciada: false };
    delete process.env.EQUIPE_NOTIFICACAO_WEBHOOK;
    delete process.env.EQUIPE_NOTIFICACAO_SILENCIADA;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.EQUIPE_NOTIFICACAO_WEBHOOK;
    delete process.env.EQUIPE_NOTIFICACAO_SILENCIADA;
  });

  it("envia o aviso de prazo do termo com nome, tipo e prazo", async () => {
    process.env.EQUIPE_NOTIFICACAO_WEBHOOK = WEBHOOK;
    const resultado = await notificarPrazoTermo(
      { nome: "Ana Silva" },
      { prazo: "2026-01-10" },
    );
    expect(resultado).toBe("enviado");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const corpo = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(corpo.paciente).toBe("Ana Silva");
    expect(corpo.tipo).toBe("prazo_termo");
    expect(corpo.prazo).toBe("2026-01-10");
    expect(corpo.text).toContain("Termo de consentimento");
    expect(corpo.text).toContain("venceu em 10/01/2026");
  });

  it("não envia quando não há webhook configurado", async () => {
    const resultado = await notificarPrazoTermo(
      { nome: "Ana" },
      { prazo: "2026-01-10" },
    );
    expect(resultado).toBe("sem-webhook");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("não marca em falha de entrega (retorna falha)", async () => {
    process.env.EQUIPE_NOTIFICACAO_WEBHOOK = WEBHOOK;
    fetchSpy.mockRejectedValue(new Error("rede caiu"));
    const resultado = await notificarPrazoTermo(
      { nome: "Ana" },
      { prazo: "2026-01-10" },
    );
    expect(resultado).toBe("falha");
  });
});

describe("notificarFotoCheckin", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    configPersistida = { webhookUrl: null, silenciada: false };
    delete process.env.EQUIPE_NOTIFICACAO_WEBHOOK;
    delete process.env.EQUIPE_NOTIFICACAO_SILENCIADA;
    process.env.REPLIT_DEV_DOMAIN = "exemplo.dev";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.EQUIPE_NOTIFICACAO_WEBHOOK;
    delete process.env.EQUIPE_NOTIFICACAO_SILENCIADA;
    delete process.env.REPLIT_DEV_DOMAIN;
    delete process.env.REPLIT_DOMAINS;
  });

  it("não envia quando não há webhook configurado", async () => {
    const enviado = await notificarFotoCheckin(
      { nome: "Ana", id: 7 },
      { dia: 1 },
    );
    expect(enviado).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("não envia quando silenciado", async () => {
    process.env.EQUIPE_NOTIFICACAO_WEBHOOK = WEBHOOK;
    process.env.EQUIPE_NOTIFICACAO_SILENCIADA = "true";
    const enviado = await notificarFotoCheckin(
      { nome: "Ana", id: 7 },
      { dia: 1 },
    );
    expect(enviado).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("envia com nome, dia e link para o Console", async () => {
    process.env.EQUIPE_NOTIFICACAO_WEBHOOK = WEBHOOK;
    const enviado = await notificarFotoCheckin(
      { nome: "Ana Silva", id: 42 },
      { dia: 7 },
    );
    expect(enviado).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(WEBHOOK);
    const corpo = JSON.parse((init as RequestInit).body as string);
    expect(corpo.paciente).toBe("Ana Silva");
    expect(corpo.tipo).toBe("foto_checkin");
    expect(corpo.dia).toBe(7);
    expect(corpo.link).toBe("https://exemplo.dev/paciente/42");
    expect(corpo.text).toContain("Ana Silva");
    expect(corpo.text).toContain("D+7");
    expect(corpo.text).toContain("https://exemplo.dev/paciente/42");
  });

  it("usa o domínio de produção quando disponível", async () => {
    process.env.EQUIPE_NOTIFICACAO_WEBHOOK = WEBHOOK;
    process.env.REPLIT_DOMAINS = "prod.exemplo.com,outro.exemplo.com";
    await notificarFotoCheckin({ nome: "Bia", id: 9 }, { dia: 1 });
    const corpo = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(corpo.link).toBe("https://prod.exemplo.com/paciente/9");
  });

  it("não lança quando o fetch falha (rede/timeout)", async () => {
    process.env.EQUIPE_NOTIFICACAO_WEBHOOK = WEBHOOK;
    fetchSpy.mockRejectedValue(new Error("rede caiu"));
    const enviado = await notificarFotoCheckin(
      { nome: "Ana", id: 7 },
      { dia: 1 },
    );
    expect(enviado).toBe(false);
  });
});
