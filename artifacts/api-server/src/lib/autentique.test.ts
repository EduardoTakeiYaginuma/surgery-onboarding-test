import { describe, expect, it } from "vitest";

import { derivarStatus } from "./autentique";

/**
 * `derivarStatus` colapsa as assinaturas de um documento da Autentique num
 * status único. Regra central: só entram na conta os ASSINANTES OBRIGATÓRIOS
 * (com `action`); o emissor/dono do documento aparece em `signatures` com
 * `action = null` e NÃO precisa assinar — contá-lo deixava o contrato eterno-
 * pendente mesmo com todas as partes reais já tendo assinado.
 */

const assinou = { created_at: "2026-07-08T17:08:28.000Z" };

describe("derivarStatus — emissor (action null) não é assinante obrigatório", () => {
  it("todas as partes com action=SIGN assinaram e o emissor não → assinado", () => {
    const status = derivarStatus([
      { action: null, signed: null }, // emissor/dono — não assina
      { action: { name: "SIGN" }, signed: assinou },
      { action: { name: "SIGN" }, signed: assinou },
    ]);
    expect(status.status).toBe("assinado");
    expect(status.assinadoEm).toBe(assinou.created_at);
  });

  it("um assinante obrigatório (action=SIGN) ainda não assinou → pendente", () => {
    const status = derivarStatus([
      { action: null, signed: null },
      { action: { name: "SIGN" }, signed: assinou },
      { action: { name: "SIGN" }, signed: null, link: { short_link: "abc" } },
    ]);
    expect(status.status).toBe("pendente");
    expect(status.linkAssinatura).toBe("abc");
  });

  it("recusa de um assinante obrigatório → recusado", () => {
    const status = derivarStatus([
      { action: { name: "SIGN" }, rejected: { created_at: assinou.created_at } },
      { action: { name: "SIGN" }, signed: assinou },
    ]);
    expect(status.status).toBe("recusado");
  });
});

describe("derivarStatus — fallback sem action (dado ausente/query antiga)", () => {
  it("sem nenhum action, todos assinados → assinado (comportamento anterior)", () => {
    const status = derivarStatus([
      { signed: assinou },
      { signed: assinou },
    ]);
    expect(status.status).toBe("assinado");
  });

  it("sem nenhum action, um não assinou → pendente", () => {
    const status = derivarStatus([
      { signed: assinou },
      { signed: null },
    ]);
    expect(status.status).toBe("pendente");
  });
});
