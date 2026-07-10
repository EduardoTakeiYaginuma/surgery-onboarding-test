import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Modo teste: quando USE_PGLITE=1, o `db` NÃO conecta em nenhum Postgres real.
// O setup do vitest importa `./test-pglite` (initTestDb), que cria um Postgres
// embarcado em memória (PGlite) e o injeta aqui via `__setTestDb`. Esse módulo
// de produção NÃO importa PGlite nem drizzle-kit — só `./test-pglite` importa,
// e a produção nunca o carrega (então o bundle do api-server fica limpo).
const modoTeste = process.env.USE_PGLITE === "1";

/** Pool do Postgres real. `undefined` no modo teste (PGlite não usa pool `pg`). */
export let pool: pg.Pool | undefined;

/**
 * Instância Drizzle usada por TODOS os repos (import vivo — reatribuir aqui
 * atualiza quem importou `{ db }`). Em produção aponta para o Postgres real; no
 * modo teste é trocada por um PGlite em memória via `__setTestDb`.
 */
export let db: NodePgDatabase<typeof schema>;

if (!modoTeste) {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }

  pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Conexões ociosas com o pooler do Supabase às vezes caem por rede
  // (ETIMEDOUT / EADDRNOTAVAIL / ECONNRESET). Sem este handler, o `pg` emite um
  // evento 'error' não tratado no pool e o processo inteiro morre. Aqui só
  // registramos — o pool descarta a conexão ruim e abre outra na próxima query.
  pool.on("error", (err) => {
    console.error("[db] erro em conexão ociosa do pool (descartada):", err.message);
  });

  db = drizzle(pool, { schema });
}

/**
 * SÓ PARA TESTES. Injeta uma instância Drizzle alternativa (o PGlite em memória
 * montado em `./test-pglite`) no lugar do `db`. Mantido aqui — e não em
 * `./test-pglite` — para que a reatribuição do `let db` seja no mesmo módulo.
 */
export function __setTestDb(instancia: NodePgDatabase<typeof schema>): void {
  db = instancia;
}

export * from "./schema";
