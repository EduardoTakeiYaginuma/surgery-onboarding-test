import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Placeholder gravado em pacientes antigos antes de os defaults reais entrarem
// no schema (ver lib/db/src/schema/pacientes.ts e
// artifacts/api-server/src/lib/protocolo.ts:A_PREENCHER).
const A_PREENCHER = "{a preencher}";

// Backfill idempotente: para cada credencial/dado da clínica ainda com o
// placeholder, aplica o DEFAULT da coluna. Usar `= DEFAULT` mantém o valor em
// sincronia com o schema (fonte única), sem duplicar literais aqui.
const COLUNAS = ["medica", "crm", "rqe", "clinica"];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    let total = 0;
    for (const coluna of COLUNAS) {
      const res = await pool.query(
        `UPDATE pacientes SET ${coluna} = DEFAULT WHERE ${coluna} = $1`,
        [A_PREENCHER],
      );
      if (res.rowCount > 0) {
        console.log(`Backfill ${coluna}: ${res.rowCount} paciente(s).`);
        total += res.rowCount;
      }
    }
    if (total === 0) {
      console.log("Nenhuma credencial pendente; nada a preencher.");
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Falha ao preencher credenciais:", err);
  process.exit(1);
});
