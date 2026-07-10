import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DIAS_ALERTA_ABERTURA,
  linkLembreteWhatsApp,
  montarLinkPublicoCliente,
  precisaAlertaAbertura,
} from "./patient-tools";

/**
 * Guarda contra deriva entre o lembrete WhatsApp do app móvel e o do Console
 * web (`artifacts/console-kcl/src/lib/patient-tools.ts`): mesma mensagem, mesmo
 * link público e mesma regra de "ainda não abriu".
 */

const ANTES = process.env.EXPO_PUBLIC_DOMAIN;

beforeEach(() => {
  process.env.EXPO_PUBLIC_DOMAIN = "exemplo.replit.dev";
});

afterEach(() => {
  if (ANTES === undefined) delete process.env.EXPO_PUBLIC_DOMAIN;
  else process.env.EXPO_PUBLIC_DOMAIN = ANTES;
  vi.useRealTimers();
});

describe("montarLinkPublicoCliente", () => {
  it("monta o link público absoluto no formato /p/{codigo}", () => {
    expect(montarLinkPublicoCliente("ABC123")).toBe(
      "https://exemplo.replit.dev/p/ABC123",
    );
  });
});

describe("linkLembreteWhatsApp", () => {
  it("usa o DDI 55, o primeiro nome, a data dd/MM/yyyy e o link público", () => {
    const url = linkLembreteWhatsApp({
      telefone: "(11) 95080-2525",
      nome: "Maria Silva",
      codigoPublico: "ABC123",
      dataCirurgia: "2026-08-20",
      horario: "06:00",
    });

    expect(url.startsWith("https://wa.me/5511950802525?text=")).toBe(true);

    const texto = decodeURIComponent(url.split("?text=")[1]!);
    expect(texto).toBe(
      "Olá, Maria. Passando para lembrar da sua cirurgia em 20/08/2026 às 06:00. " +
        "Reunimos todas as orientações, documentos e contatos em um só lugar, com calma: " +
        "https://exemplo.replit.dev/p/ABC123. " +
        "Quando puder, dê uma olhada — qualquer dúvida, é só responder por aqui.",
    );
  });

  it("não duplica o DDI quando o telefone já começa com 55", () => {
    const url = linkLembreteWhatsApp({
      telefone: "5511950802525",
      nome: "Ana",
      codigoPublico: "X",
      dataCirurgia: "2026-08-20",
      horario: "07:00",
    });
    expect(url.startsWith("https://wa.me/5511950802525?text=")).toBe(true);
  });
});

describe("precisaAlertaAbertura", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T09:00:00"));
  });

  const base = {
    abriu: false as boolean | undefined,
    linkEnviadoEm: "2026-08-10T12:00:00Z" as string | null,
    dataCirurgia: "2026-08-20",
  };

  it("alerta quando não abriu e a cirurgia está dentro da janela", () => {
    expect(precisaAlertaAbertura(base)).toBe(true);
  });

  it("não alerta quando abriu", () => {
    expect(precisaAlertaAbertura({ ...base, abriu: true })).toBe(false);
  });

  it("não alerta quando abriu é desconhecido (undefined)", () => {
    expect(precisaAlertaAbertura({ ...base, abriu: undefined })).toBe(false);
  });

  it("não alerta quando o link ainda não foi enviado", () => {
    expect(precisaAlertaAbertura({ ...base, linkEnviadoEm: null })).toBe(false);
  });

  it("não alerta quando a cirurgia já passou", () => {
    expect(precisaAlertaAbertura({ ...base, dataCirurgia: "2026-08-14" })).toBe(false);
  });

  it("não alerta quando a cirurgia está além da janela", () => {
    expect(
      precisaAlertaAbertura({ ...base, dataCirurgia: "2026-08-25" }),
    ).toBe(false);
  });

  it("alerta no limite exato da janela", () => {
    const limite = `2026-08-${String(15 + DIAS_ALERTA_ABERTURA).padStart(2, "0")}`;
    expect(precisaAlertaAbertura({ ...base, dataCirurgia: limite })).toBe(true);
  });
});
