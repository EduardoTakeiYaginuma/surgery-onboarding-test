import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { pacientesTable } from "./pacientes";

/**
 * Eventos de interação da paciente na página pública (/p/:token). Cada linha
 * registra UMA interação: apenas o tipo, um rótulo curto opcional (qual
 * botão/documento) e a data/hora. Nenhum dado pessoal é armazenado — serve só
 * para a secretária confirmar que o handoff chegou e acompanhar o engajamento.
 */
export const pacientesEventosTable = pgTable("pacientes_eventos", {
  id: serial("id").primaryKey(),
  pacienteId: integer("paciente_id")
    .notNull()
    .references(() => pacientesTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  rotulo: text("rotulo"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertEventoSchema = createInsertSchema(
  pacientesEventosTable,
).omit({
  id: true,
  createdAt: true,
});
export type InsertEvento = z.infer<typeof insertEventoSchema>;
export type EventoPaciente = typeof pacientesEventosTable.$inferSelect;
