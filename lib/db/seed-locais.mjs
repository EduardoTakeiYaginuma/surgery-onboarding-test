import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Locais de cirurgia padrão. Espelham a antiga constante HOSPITAIS
// (api-server/src/lib/protocolo.ts) para que nada se perca ao migrar a lista
// fixa do código para a tabela `locais`. Idempotente por `nome`.
const LOCAIS = [
  {
    nome: "Avant Moema",
    nomeCompleto: "Avant Moema Day Hospital",
    endereco: "Av. Copacabana, 112, 3º andar (Edif. Medic Life)",
    contatoCcNome: "Alana",
    contatoCcTelefone: "(11) 94215-3780",
    sinalSugerido: null,
    instrucoesChegada: "Confirme a janela de chegada (2h ou 3h antes).",
  },
  {
    nome: "Vila Nova Star",
    nomeCompleto: "Hospital Vila Nova Star",
    endereco:
      "Rua Dr. Alceu de Campos Rodrigues, 165 — Vila Nova Conceição, São Paulo - SP, CEP 04544-000",
    contatoCcNome: "Central de Atendimento Rede D'Or",
    contatoCcTelefone: "(11) 3457-1000",
    sinalSugerido: null,
    instrucoesChegada:
      "Chegue 2h antes do horário marcado. Use a internação prévia digital pelo celular quando disponível e confirme o jejum com a equipe do cirurgião.",
  },
  {
    nome: "São Luiz Itaim",
    nomeCompleto: "Hospital São Luiz — Unidade Itaim",
    endereco:
      "Rua Dr. Alceu de Campos Rodrigues, 95 — Vila Nova Conceição, São Paulo - SP, CEP 04544-000",
    contatoCcNome: "Central de Atendimento Rede D'Or São Luiz",
    contatoCcTelefone: "(11) 3040-1100",
    sinalSugerido: null,
    instrucoesChegada:
      "Chegue 2h antes do horário marcado e confirme o tempo de jejum com a equipe do cirurgião.",
  },
  {
    nome: "Albert Einstein",
    nomeCompleto: "Hospital Israelita Albert Einstein",
    endereco:
      "Av. Albert Einstein, 627/701 — Morumbi, São Paulo - SP, CEP 05652-900 (admissão no Bloco A1, intermediário 2)",
    contatoCcNome: "Central de Atendimento Einstein",
    contatoCcTelefone: "(11) 2151-1233",
    sinalSugerido: null,
    instrucoesChegada:
      "Chegue de 1h30 a 2h antes do horário marcado; a recepção admissional é concluída no quarto. Confirme o jejum (em geral 8h) com o cirurgião.",
  },
];

/** Monta o snapshot (formato LocalSnapshot / HospitalProfile) de uma linha de `locais`. */
function snapshotDeLocal(row) {
  return {
    chave: row.nome,
    nome: row.nome,
    nomeCompleto: row.nome_completo || row.nome,
    endereco: row.endereco || "",
    contatoCCNome: row.contato_cc_nome || "",
    contatoCCTelefone: row.contato_cc_telefone || "",
    sinalSugerido: row.sinal_sugerido != null ? Number(row.sinal_sugerido) : null,
    instrucoesChegada: row.instrucoes_chegada || "",
  };
}

/** Snapshot de um paciente sem local casado (texto livre): sem campos ricos. */
function snapshotLivre(local, localEndereco) {
  const nome = (local || "").trim();
  return {
    chave: nome,
    nome,
    nomeCompleto: nome,
    endereco: (localEndereco || "").trim(),
    contatoCCNome: "",
    contatoCCTelefone: "",
    sinalSugerido: null,
    instrucoesChegada: "",
  };
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // 1) Garante os locais padrão cadastrados (idempotente por nome).
    const porNome = new Map();
    for (const l of LOCAIS) {
      const existente = await pool.query(
        `SELECT * FROM locais WHERE nome = $1 LIMIT 1`,
        [l.nome],
      );
      let row;
      if (existente.rowCount > 0) {
        row = existente.rows[0];
        console.log(`Local já cadastrado: "${l.nome}" (id=${row.id}).`);
      } else {
        const ins = await pool.query(
          `INSERT INTO locais
             (nome, nome_completo, endereco, contato_cc_nome, contato_cc_telefone,
              instrucoes_chegada, sinal_sugerido, ativo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true)
           RETURNING *`,
          [
            l.nome,
            l.nomeCompleto,
            l.endereco,
            l.contatoCcNome,
            l.contatoCcTelefone,
            l.instrucoesChegada,
            l.sinalSugerido,
          ],
        );
        row = ins.rows[0];
        console.log(`Local cadastrado: "${l.nome}" (id=${row.id}).`);
      }
      porNome.set(row.nome, row);
    }

    // 2) Backfill dos pacientes sem vínculo: casa `local` (texto) com um local
    // por nome; quando não casa, guarda um snapshot do texto livre. Assim as
    // mensagens/página continuam idênticas para os cadastros antigos.
    const pendentes = await pool.query(
      `SELECT id, local, local_endereco FROM pacientes WHERE local_id IS NULL`,
    );
    let casados = 0;
    let livres = 0;
    for (const p of pendentes.rows) {
      const localRow = porNome.get((p.local || "").trim());
      if (localRow) {
        await pool.query(
          `UPDATE pacientes SET local_id = $1, local_snapshot = $2 WHERE id = $3`,
          [localRow.id, JSON.stringify(snapshotDeLocal(localRow)), p.id],
        );
        casados++;
      } else {
        await pool.query(
          `UPDATE pacientes SET local_snapshot = $1 WHERE id = $2 AND local_snapshot IS NULL`,
          [JSON.stringify(snapshotLivre(p.local, p.local_endereco)), p.id],
        );
        livres++;
      }
    }
    console.log(
      `Backfill pacientes: ${casados} vinculado(s) a local padrão, ${livres} com snapshot de texto livre.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Falha ao semear locais:", err);
  process.exit(1);
});
