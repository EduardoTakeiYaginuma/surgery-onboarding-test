import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { __setTestDb } from "./index";

/**
 * SÓ PARA TESTES. Cria um Postgres embarcado em memória (PGlite), aplica o
 * schema nele e o injeta como o `db` global — nada toca um banco real. Este
 * módulo importa PGlite e drizzle-kit, então NÃO deve ser importado por código
 * de produção; apenas o setup do vitest (`USE_PGLITE=1`) o carrega, mantendo o
 * bundle do api-server livre dessas dependências de desenvolvimento.
 */
export async function initTestDb(): Promise<void> {
  // `drizzle-kit/api` empurra o schema (CREATE TABLE …) direto para a instância
  // Drizzle, sem precisar de arquivos de migração. Não publica tipos.
  const { pushSchema } = (await import("drizzle-kit/api")) as unknown as {
    pushSchema: (
      schemaImports: Record<string, unknown>,
      drizzleInstance: unknown,
    ) => Promise<{ apply: () => Promise<void> }>;
  };

  const client = new PGlite();
  const pgliteDb = drizzle(client, { schema });
  const { apply } = await pushSchema(schema as Record<string, unknown>, pgliteDb);
  await apply();
  __setTestDb(pgliteDb as unknown as NodePgDatabase<typeof schema>);
}
