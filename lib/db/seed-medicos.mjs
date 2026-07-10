import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Médico padrão da clínica. Os valores espelham os defaults do schema
// (lib/db/src/schema/pacientes.ts) para que o snapshot de pacientes antigos
// continue batendo com o cadastro.
const KARLA = {
  nome: "Dra. Karla Caetano Lobo",
  crm: "SP 254200",
  rqe: "124750",
  clinica: "KCL",
};

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // 1) Garante a Dra. Karla cadastrada e marcada como padrão (idempotente).
    const existente = await pool.query(
      `SELECT id FROM medicos WHERE nome = $1 LIMIT 1`,
      [KARLA.nome],
    );
    let karlaId;
    if (existente.rowCount > 0) {
      karlaId = existente.rows[0].id;
      await pool.query(`UPDATE medicos SET padrao = true WHERE id = $1`, [
        karlaId,
      ]);
      console.log(`Dra. Karla já cadastrada (id=${karlaId}); marcada padrão.`);
    } else {
      const ins = await pool.query(
        `INSERT INTO medicos (nome, crm, rqe, clinica, padrao, ativo)
         VALUES ($1, $2, $3, $4, true, true)
         RETURNING id`,
        [KARLA.nome, KARLA.crm, KARLA.rqe, KARLA.clinica],
      );
      karlaId = ins.rows[0].id;
      console.log(`Dra. Karla cadastrada: id=${karlaId}.`);
    }

    // 2) No máximo um padrão.
    await pool.query(`UPDATE medicos SET padrao = false WHERE id <> $1`, [
      karlaId,
    ]);

    // 3) Backfill: pacientes sem médico passam a apontar para a Dra. Karla.
    // O snapshot plano (medica/crm/rqe/clinica) já bate com os defaults dela.
    const back = await pool.query(
      `UPDATE pacientes SET medico_id = $1 WHERE medico_id IS NULL`,
      [karlaId],
    );
    if (back.rowCount > 0) {
      console.log(`Backfill medico_id: ${back.rowCount} paciente(s).`);
    } else {
      console.log("Nenhum paciente sem médico; nada a vincular.");
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Falha ao semear médicos:", err);
  process.exit(1);
});
