import { desc, eq } from "drizzle-orm";
import {
  db,
  timelineEventosTable,
  type TimelineEvento,
  type InsertTimelineEvento,
} from "@workspace/db";

/** Tipo do evento de timeline gravado quando a equipe lembra a paciente pelo WhatsApp. */
export const TIPO_LEMBRETE_WHATSAPP = "lembrete_whatsapp";

/** Resumo do último lembrete de uma paciente: quando e por quem. */
export interface UltimoLembrete {
  em: Date;
  por: string | null;
}

/**
 * Camada de dados isolada para a timeline de acompanhamento de cada processo.
 * Registra marcos automáticos e anotações manuais da Thalita.
 */
export interface TimelineRepository {
  listarPorPaciente(pacienteId: number): Promise<TimelineEvento[]>;
  criar(dados: InsertTimelineEvento): Promise<TimelineEvento>;
  /**
   * Último lembrete (WhatsApp) por paciente — quando e por quem —, agregado em
   * uma única consulta para evitar N+1 na listagem do Console.
   */
  ultimoLembretePorPaciente(): Promise<Map<number, UltimoLembrete>>;
}

class DrizzleTimelineRepository implements TimelineRepository {
  async listarPorPaciente(pacienteId: number): Promise<TimelineEvento[]> {
    return db
      .select()
      .from(timelineEventosTable)
      .where(eq(timelineEventosTable.pacienteId, pacienteId))
      .orderBy(timelineEventosTable.createdAt);
  }

  async criar(dados: InsertTimelineEvento): Promise<TimelineEvento> {
    const [row] = await db
      .insert(timelineEventosTable)
      .values(dados)
      .returning();
    return row;
  }

  async ultimoLembretePorPaciente(): Promise<Map<number, UltimoLembrete>> {
    // DISTINCT ON traz a linha mais recente por paciente (não só o max da data),
    // para recuperarmos também o autor do último lembrete numa só consulta.
    const rows = await db
      .selectDistinctOn([timelineEventosTable.pacienteId], {
        pacienteId: timelineEventosTable.pacienteId,
        em: timelineEventosTable.createdAt,
        por: timelineEventosTable.autor,
      })
      .from(timelineEventosTable)
      .where(eq(timelineEventosTable.tipo, TIPO_LEMBRETE_WHATSAPP))
      .orderBy(
        timelineEventosTable.pacienteId,
        desc(timelineEventosTable.createdAt),
      );
    return new Map(
      rows.map((r) => [r.pacienteId, { em: new Date(r.em), por: r.por }]),
    );
  }
}

export const timelineRepo: TimelineRepository = new DrizzleTimelineRepository();
