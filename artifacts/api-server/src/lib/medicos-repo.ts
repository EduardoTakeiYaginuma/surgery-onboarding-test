import { eq, ne } from "drizzle-orm";
import {
  db,
  medicosTable,
  type Medico,
  type InsertMedico,
} from "@workspace/db";

/**
 * Camada de dados isolada para o cadastro de médicos. A garantia de "no máximo
 * um padrão" mora aqui: ao gravar um médico como padrão, os demais são
 * rebaixados na mesma transação.
 */
export interface MedicosRepository {
  listar(incluirInativos?: boolean): Promise<Medico[]>;
  obterPorId(id: number): Promise<Medico | undefined>;
  /** Médico padrão (padrao=true e ativo); fallback para o primeiro ativo. */
  obterPadrao(): Promise<Medico | undefined>;
  criar(dados: InsertMedico): Promise<Medico>;
  atualizar(
    id: number,
    dados: Partial<InsertMedico>,
  ): Promise<Medico | undefined>;
  /**
   * Insere ou atualiza um médico pela sua origem no lumexa-core
   * (`coreDoctorId`). Idempotente: reimportar não duplica. Devolve o médico e
   * se foi criado agora.
   */
  upsertPorCoreId(
    coreDoctorId: string,
    dados: Omit<InsertMedico, "coreDoctorId">,
  ): Promise<{ medico: Medico; criado: boolean }>;
  /** Grava o caminho do objeto (relativo) da foto. null remove a foto. */
  definirFoto(id: number, relativo: string | null): Promise<Medico | undefined>;
  /** Grava o caminho do objeto (relativo) do logo. null remove o logo. */
  definirLogo(id: number, relativo: string | null): Promise<Medico | undefined>;
}

class DrizzleMedicosRepository implements MedicosRepository {
  async listar(incluirInativos = false): Promise<Medico[]> {
    const rows = await db.select().from(medicosTable).orderBy(medicosTable.nome);
    return incluirInativos ? rows : rows.filter((m) => m.ativo);
  }

  async obterPorId(id: number): Promise<Medico | undefined> {
    const [row] = await db
      .select()
      .from(medicosTable)
      .where(eq(medicosTable.id, id));
    return row;
  }

  async obterPadrao(): Promise<Medico | undefined> {
    const ativos = await this.listar(false);
    return ativos.find((m) => m.padrao) ?? ativos[0];
  }

  async criar(dados: InsertMedico): Promise<Medico> {
    return db.transaction(async (tx) => {
      const [row] = await tx.insert(medicosTable).values(dados).returning();
      if (row.padrao) {
        await tx
          .update(medicosTable)
          .set({ padrao: false })
          .where(ne(medicosTable.id, row.id));
      }
      return row;
    });
  }

  async atualizar(
    id: number,
    dados: Partial<InsertMedico>,
  ): Promise<Medico | undefined> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(medicosTable)
        .set(dados)
        .where(eq(medicosTable.id, id))
        .returning();
      if (row && dados.padrao === true) {
        await tx
          .update(medicosTable)
          .set({ padrao: false })
          .where(ne(medicosTable.id, row.id));
      }
      return row;
    });
  }

  async upsertPorCoreId(
    coreDoctorId: string,
    dados: Omit<InsertMedico, "coreDoctorId">,
  ): Promise<{ medico: Medico; criado: boolean }> {
    return db.transaction(async (tx) => {
      const [existente] = await tx
        .select()
        .from(medicosTable)
        .where(eq(medicosTable.coreDoctorId, coreDoctorId));

      if (existente) {
        const [row] = await tx
          .update(medicosTable)
          .set(dados)
          .where(eq(medicosTable.id, existente.id))
          .returning();
        return { medico: row, criado: false };
      }

      const [row] = await tx
        .insert(medicosTable)
        .values({ ...dados, coreDoctorId })
        .returning();
      return { medico: row, criado: true };
    });
  }

  async definirFoto(
    id: number,
    relativo: string | null,
  ): Promise<Medico | undefined> {
    const [row] = await db
      .update(medicosTable)
      .set({ foto: relativo })
      .where(eq(medicosTable.id, id))
      .returning();
    return row;
  }

  async definirLogo(
    id: number,
    relativo: string | null,
  ): Promise<Medico | undefined> {
    const [row] = await db
      .update(medicosTable)
      .set({ logo: relativo })
      .where(eq(medicosTable.id, id))
      .returning();
    return row;
  }
}

export const medicosRepo: MedicosRepository = new DrizzleMedicosRepository();
