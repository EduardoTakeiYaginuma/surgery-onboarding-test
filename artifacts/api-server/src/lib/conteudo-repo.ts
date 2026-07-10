import { eq } from "drizzle-orm";
import {
  db,
  conteudoPaginaTable,
  type SecaoConteudo,
} from "@workspace/db";
import { CONTEUDO_PADRAO_SEED } from "./conteudo-padrao";

const SINGLETON_ID = 1;

/**
 * Repositório do conteúdo editável da página pública.
 *
 * O padrão global é uma linha única (id = 1). Quando ainda não foi salvo nenhum
 * conteúdo, devolve o seed de fábrica (`CONTEUDO_PADRAO_SEED`) — assim a página
 * funciona desde o primeiro acesso, sem depender de uma migração de dados.
 */
export type TemaPadrao = "light" | "dark";

export interface ConteudoRepository {
  obterPadrao(): Promise<SecaoConteudo[]>;
  salvarPadrao(secoes: SecaoConteudo[]): Promise<SecaoConteudo[]>;
  /** Registro (claro/escuro) com que novas páginas de paciente abrem. */
  obterTemaPadrao(): Promise<TemaPadrao>;
  salvarTemaPadrao(tema: TemaPadrao): Promise<TemaPadrao>;
}

class DrizzleConteudoRepository implements ConteudoRepository {
  async obterPadrao(): Promise<SecaoConteudo[]> {
    const [row] = await db
      .select()
      .from(conteudoPaginaTable)
      .where(eq(conteudoPaginaTable.id, SINGLETON_ID));
    return row?.secoes ?? CONTEUDO_PADRAO_SEED;
  }

  async salvarPadrao(secoes: SecaoConteudo[]): Promise<SecaoConteudo[]> {
    const [row] = await db
      .insert(conteudoPaginaTable)
      .values({ id: SINGLETON_ID, secoes })
      .onConflictDoUpdate({
        target: conteudoPaginaTable.id,
        set: { secoes, updatedAt: new Date() },
      })
      .returning();
    return row.secoes;
  }

  async obterTemaPadrao(): Promise<TemaPadrao> {
    const [row] = await db
      .select()
      .from(conteudoPaginaTable)
      .where(eq(conteudoPaginaTable.id, SINGLETON_ID));
    return row?.temaPadrao ?? "light";
  }

  async salvarTemaPadrao(tema: TemaPadrao): Promise<TemaPadrao> {
    // O singleton pode ainda não existir (nenhum conteúdo salvo). Ao inserir,
    // semeamos `secoes` com o padrão de fábrica para respeitar a coluna NOT NULL.
    const [row] = await db
      .insert(conteudoPaginaTable)
      .values({ id: SINGLETON_ID, secoes: CONTEUDO_PADRAO_SEED, temaPadrao: tema })
      .onConflictDoUpdate({
        target: conteudoPaginaTable.id,
        set: { temaPadrao: tema, updatedAt: new Date() },
      })
      .returning();
    return row.temaPadrao;
  }
}

export const conteudoRepo: ConteudoRepository = new DrizzleConteudoRepository();
