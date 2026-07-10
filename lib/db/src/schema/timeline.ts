import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { pacientesTable } from "./pacientes";

export const timelineEventosTable = pgTable("timeline_eventos", {
  id: serial("id").primaryKey(),
  pacienteId: integer("paciente_id")
    .notNull()
    .references(() => pacientesTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  titulo: text("titulo").notNull(),
  descricao: text("descricao"),
  // Quem disparou o evento (membro da equipe que clicou). Null em marcos
  // automáticos e em eventos antigos anteriores à captura de identidade.
  autor: text("autor"),
  automatico: boolean("automatico").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertTimelineEventoSchema = createInsertSchema(
  timelineEventosTable,
).omit({
  id: true,
  createdAt: true,
});
export type InsertTimelineEvento = z.infer<typeof insertTimelineEventoSchema>;
export type TimelineEvento = typeof timelineEventosTable.$inferSelect;
