// Migration aditiva: adiciona as colunas de contrato por UPLOAD em
// contrato_geracoes. Não-destrutiva e idempotente (IF NOT EXISTS).
//
// Uso (a partir de surgery-onboarding/lib/db):
//   node --env-file=../../.env migrate-contrato-upload.mjs
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

await pool.query(`
  ALTER TABLE contrato_geracoes
    ADD COLUMN IF NOT EXISTS arquivo_object_path text,
    ADD COLUMN IF NOT EXISTS arquivo_nome text,
    ADD COLUMN IF NOT EXISTS signatarios jsonb;
`);

const { rows } = await pool.query(
  `select column_name, data_type, is_nullable
   from information_schema.columns
   where table_name = 'contrato_geracoes'
     and column_name in ('arquivo_object_path','arquivo_nome','signatarios')
   order by column_name`,
);

console.log("Colunas aplicadas:");
for (const r of rows) {
  console.log(`  ${r.column_name} (${r.data_type}, nullable=${r.is_nullable})`);
}
await pool.end();
