import { eq } from "drizzle-orm";
import {
  db,
  locaisTable,
  type Local,
  type InsertLocal,
} from "@workspace/db";
import { HOSPITAIS } from "./protocolo";

/**
 * Camada de dados dos locais de cirurgia (hospitais) configuráveis.
 *
 * Auto-semeadura: na primeira leitura de uma base vazia, insere os locais
 * padrão (a antiga constante `HOSPITAIS`) de forma idempotente (ON CONFLICT por
 * nome). Assim testes, dev e um deploy novo nunca ficam com a lista vazia — e o
 * seed de produção (`lib/db/seed-locais.mjs`) apenas confirma o que já existe.
 */
export interface LocaisRepository {
  listar(incluirInativos?: boolean): Promise<Local[]>;
  obterPorId(id: number): Promise<Local | undefined>;
  obterPorNome(nome: string): Promise<Local | undefined>;
  criar(dados: InsertLocal): Promise<Local>;
  atualizar(
    id: number,
    dados: Partial<InsertLocal>,
  ): Promise<Local | undefined>;
  remover(id: number): Promise<boolean>;
}

/** Converte um local padrão (perfil em memória) para uma linha inserível. */
function padraoParaInsert(h: (typeof HOSPITAIS)[number]): InsertLocal {
  return {
    nome: h.nome,
    nomeCompleto: h.nomeCompleto,
    endereco: h.endereco,
    contatoCcNome: h.contatoCCNome,
    contatoCcTelefone: h.contatoCCTelefone,
    instrucoesChegada: h.instrucoesChegada,
    sinalSugerido: h.sinalSugerido != null ? String(h.sinalSugerido) : null,
  };
}

class DrizzleLocaisRepository implements LocaisRepository {
  private padroesGarantidos = false;

  /** Insere os locais padrão se ainda não existirem (idempotente por nome). */
  private async garantirPadroes(): Promise<void> {
    if (this.padroesGarantidos) return;
    await db
      .insert(locaisTable)
      .values(HOSPITAIS.map(padraoParaInsert))
      .onConflictDoNothing({ target: locaisTable.nome });
    this.padroesGarantidos = true;
  }

  async listar(incluirInativos = false): Promise<Local[]> {
    await this.garantirPadroes();
    const rows = await db.select().from(locaisTable).orderBy(locaisTable.nome);
    return incluirInativos ? rows : rows.filter((l) => l.ativo);
  }

  async obterPorId(id: number): Promise<Local | undefined> {
    const [row] = await db
      .select()
      .from(locaisTable)
      .where(eq(locaisTable.id, id));
    return row;
  }

  async obterPorNome(nome: string): Promise<Local | undefined> {
    await this.garantirPadroes();
    const alvo = nome.trim();
    if (!alvo) return undefined;
    const [row] = await db
      .select()
      .from(locaisTable)
      .where(eq(locaisTable.nome, alvo));
    return row;
  }

  async criar(dados: InsertLocal): Promise<Local> {
    const [row] = await db.insert(locaisTable).values(dados).returning();
    return row;
  }

  async atualizar(
    id: number,
    dados: Partial<InsertLocal>,
  ): Promise<Local | undefined> {
    const [row] = await db
      .update(locaisTable)
      .set(dados)
      .where(eq(locaisTable.id, id))
      .returning();
    return row;
  }

  async remover(id: number): Promise<boolean> {
    const linhas = await db
      .delete(locaisTable)
      .where(eq(locaisTable.id, id))
      .returning({ id: locaisTable.id });
    return linhas.length > 0;
  }
}

export const locaisRepo: LocaisRepository = new DrizzleLocaisRepository();

/**
 * Resolve o local de cirurgia de um cadastro para uma linha de `locais`:
 *  - `localId` informado e existente → usa esse local (da lista configurável).
 *  - senão, com `local` (texto livre) → reusa o local de mesmo nome OU cria um
 *    novo (o texto livre vira um endereço padrão dali em diante).
 *  - sem nada utilizável → null (o chamador mantém só os campos de texto).
 */
export async function resolverLocalDoCadastro(
  localId: number | null | undefined,
  local: string | null | undefined,
  localEndereco: string | null | undefined,
): Promise<Local | null> {
  if (localId != null) {
    const porId = await locaisRepo.obterPorId(localId);
    if (porId) return porId;
  }
  const nome = (local ?? "").trim();
  if (!nome) return null;
  const existente = await locaisRepo.obterPorNome(nome);
  if (existente) return existente;
  return locaisRepo.criar({
    nome,
    endereco: (localEndereco ?? "").trim(),
  });
}
