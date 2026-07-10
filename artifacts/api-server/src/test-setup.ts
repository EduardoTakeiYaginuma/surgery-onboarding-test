import { beforeAll } from "vitest";
import { initTestDb } from "@workspace/db/test-pglite";

// Antes de cada arquivo de teste, cria um Postgres em memória (PGlite) novo e
// aplica o schema nele. Como `isolate` está ligado (padrão do vitest), cada
// arquivo tem seu próprio módulo `@workspace/db` — logo, um banco limpo por
// arquivo. Nenhum teste toca o banco real (não há DATABASE_URL no modo teste).
beforeAll(async () => {
  await initTestDb();
});
