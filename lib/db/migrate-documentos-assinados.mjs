// Migration aditiva: adiciona as colunas que guardam o objectPath da CÓPIA
// durável do PDF final assinado (contrato e termo) no bucket
// `documentos-assinados`. Não-destrutiva e idempotente (IF NOT EXISTS).
//
// Uso (a partir de surgery-onboarding/lib/db):
//   node --env-file=../../.env migrate-documentos-assinados.mjs
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

await pool.query(`
  ALTER TABLE pacientes
    ADD COLUMN IF NOT EXISTS contrato_assinado_object_path text,
    ADD COLUMN IF NOT EXISTS termo_assinado_object_path text;
`);

const { rows } = await pool.query(
  `select column_name, data_type, is_nullable
   from information_schema.columns
   where table_name = 'pacientes'
     and column_name in ('contrato_assinado_object_path','termo_assinado_object_path')
   order by column_name`,
);

console.log("Colunas aplicadas:");
for (const r of rows) {
  console.log(`  ${r.column_name} (${r.data_type}, nullable=${r.is_nullable})`);
}
await pool.end();
