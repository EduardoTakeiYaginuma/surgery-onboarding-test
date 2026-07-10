import { eq } from "drizzle-orm";
import {
  db,
  vendedorasTable,
  type Vendedora,
  type InsertVendedora,
} from "@workspace/db";

/**
 * Camada de dados isolada para a lista fixa de vendedoras responsáveis.
 */
export interface VendedorasRepository {
  listar(incluirInativas?: boolean): Promise<Vendedora[]>;
  obterPorId(id: number): Promise<Vendedora | undefined>;
  criar(dados: InsertVendedora): Promise<Vendedora>;
  atualizar(
    id: number,
    dados: Partial<InsertVendedora>,
  ): Promise<Vendedora | undefined>;
  /**
   * Insere ou atualiza uma vendedora pela sua origem no lumexa-core
   * (`coreSalesrepId`). Idempotente. Devolve a vendedora e se foi criada agora.
   */
  upsertPorCoreId(
    coreSalesrepId: string,
    dados: Omit<InsertVendedora, "coreSalesrepId">,
  ): Promise<{ vendedora: Vendedora; criado: boolean }>;
}

class DrizzleVendedorasRepository implements VendedorasRepository {
  async listar(incluirInativas = false): Promise<Vendedora[]> {
    const rows = await db
      .select()
      .from(vendedorasTable)
      .orderBy(vendedorasTable.nome);
    return incluirInativas ? rows : rows.filter((v) => v.ativo);
  }

  async obterPorId(id: number): Promise<Vendedora | undefined> {
    const [row] = await db
      .select()
      .from(vendedorasTable)
      .where(eq(vendedorasTable.id, id));
    return row;
  }

  async criar(dados: InsertVendedora): Promise<Vendedora> {
    const [row] = await db.insert(vendedorasTable).values(dados).returning();
    return row;
  }

  async atualizar(
    id: number,
    dados: Partial<InsertVendedora>,
  ): Promise<Vendedora | undefined> {
    const [row] = await db
      .update(vendedorasTable)
      .set(dados)
      .where(eq(vendedorasTable.id, id))
      .returning();
    return row;
  }

  async upsertPorCoreId(
    coreSalesrepId: string,
    dados: Omit<InsertVendedora, "coreSalesrepId">,
  ): Promise<{ vendedora: Vendedora; criado: boolean }> {
    return db.transaction(async (tx) => {
      const [existente] = await tx
        .select()
        .from(vendedorasTable)
        .where(eq(vendedorasTable.coreSalesrepId, coreSalesrepId));

      if (existente) {
        const [row] = await tx
          .update(vendedorasTable)
          .set(dados)
          .where(eq(vendedorasTable.id, existente.id))
          .returning();
        return { vendedora: row, criado: false };
      }

      const [row] = await tx
        .insert(vendedorasTable)
        .values({ ...dados, coreSalesrepId })
        .returning();
      return { vendedora: row, criado: true };
    });
  }
}

export const vendedorasRepo: VendedorasRepository =
  new DrizzleVendedorasRepository();
