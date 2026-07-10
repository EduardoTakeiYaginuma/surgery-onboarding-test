import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const EXEMPLO = {
  nome: "Mariana Alves de Souza",
  procedimento: "Blefaroplastia",
  dataCirurgia: "2026-07-15",
  horario: "06:00",
  valorSinal: "5000.00",
  laser: false,
  tokenPublico: "93226e9d-9ae6-4a93-9380-c7a7e601db71",
};

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const res = await pool.query(
      `INSERT INTO pacientes
         (nome, procedimento, data_cirurgia, horario, valor_sinal, laser, token_publico)
       SELECT $1, $2, $3, $4, $5, $6, $7
       WHERE NOT EXISTS (
         SELECT 1 FROM pacientes WHERE token_publico = $7
       )
       RETURNING id, token_publico`,
      [
        EXEMPLO.nome,
        EXEMPLO.procedimento,
        EXEMPLO.dataCirurgia,
        EXEMPLO.horario,
        EXEMPLO.valorSinal,
        EXEMPLO.laser,
        EXEMPLO.tokenPublico,
      ],
    );

    if (res.rowCount > 0) {
      console.log(
        `Paciente de exemplo criada: id=${res.rows[0].id}, token=${res.rows[0].token_publico}`,
      );
    } else {
      console.log(
        `Paciente de exemplo já existe (token=${EXEMPLO.tokenPublico}); nada a fazer.`,
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Falha ao popular o banco:", err);
  process.exit(1);
});
