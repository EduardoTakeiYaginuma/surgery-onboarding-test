import { eq, asc } from "drizzle-orm";
import {
  db,
  checkinsTable,
  type Checkin,
  type InsertCheckin,
} from "@workspace/db";

export type CheckinTipo = "foto" | "retorno" | "nps";
export type CheckinStatus = "pendente" | "concluido" | "atrasado";

/** Conjunto padrão de check-ins pós-op gerado com um clique. */
export const CHECKINS_PADRAO: { dia: number; tipo: CheckinTipo }[] = [
  { dia: 1, tipo: "foto" },
  { dia: 7, tipo: "foto" },
  { dia: 7, tipo: "retorno" },
  { dia: 30, tipo: "nps" },
];

/**
 * Repositório dos check-ins pós-op. Isola o acesso a dados das rotas, no mesmo
 * padrão de `pacientesRepo`.
 */
export interface CheckinsRepository {
  listarPorPaciente(pacienteId: number): Promise<Checkin[]>;
  obterPorId(id: number): Promise<Checkin | undefined>;
  criar(dados: InsertCheckin): Promise<Checkin>;
  atualizar(
    id: number,
    dados: Partial<
      Pick<Checkin, "status" | "nota" | "sinalAtencao" | "fotoUrl">
    >,
  ): Promise<Checkin | undefined>;
  /** Cria o conjunto padrão e devolve a lista completa ordenada. */
  semearPadrao(pacienteId: number): Promise<Checkin[]>;
}

class DrizzleCheckinsRepository implements CheckinsRepository {
  async listarPorPaciente(pacienteId: number): Promise<Checkin[]> {
    return db
      .select()
      .from(checkinsTable)
      .where(eq(checkinsTable.pacienteId, pacienteId))
      .orderBy(asc(checkinsTable.dia), asc(checkinsTable.id));
  }

  async obterPorId(id: number): Promise<Checkin | undefined> {
    const [row] = await db
      .select()
      .from(checkinsTable)
      .where(eq(checkinsTable.id, id));
    return row;
  }

  async criar(dados: InsertCheckin): Promise<Checkin> {
    const [row] = await db.insert(checkinsTable).values(dados).returning();
    return row;
  }

  async atualizar(
    id: number,
    dados: Partial<
      Pick<Checkin, "status" | "nota" | "sinalAtencao" | "fotoUrl">
    >,
  ): Promise<Checkin | undefined> {
    const [row] = await db
      .update(checkinsTable)
      .set(dados)
      .where(eq(checkinsTable.id, id))
      .returning();
    return row;
  }

  async semearPadrao(pacienteId: number): Promise<Checkin[]> {
    await db
      .insert(checkinsTable)
      .values(
        CHECKINS_PADRAO.map((c) => ({
          pacienteId,
          dia: c.dia,
          tipo: c.tipo,
        })),
      );
    return this.listarPorPaciente(pacienteId);
  }
}

export const checkinsRepo: CheckinsRepository =
  new DrizzleCheckinsRepository();
