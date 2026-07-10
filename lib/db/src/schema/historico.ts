import {
  pgTable,
  serial,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { pacientesTable } from "./pacientes";

/**
 * Histórico de edições de um paciente. Cada linha registra uma operação de
 * edição com a lista de campos alterados (valor anterior → novo). Mantém a
 * trilha de auditoria pedida: nada que a secretária corrige se perde.
 */
export interface AlteracaoCampo {
  campo: string;
  rotulo: string;
  de: string;
  para: string;
}

export const pacientesHistoricoTable = pgTable("pacientes_historico", {
  id: serial("id").primaryKey(),
  pacienteId: integer("paciente_id")
    .notNull()
    .references(() => pacientesTable.id, { onDelete: "cascade" }),
  alteracoes: jsonb("alteracoes").$type<AlteracaoCampo[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertHistoricoSchema = createInsertSchema(
  pacientesHistoricoTable,
).omit({
  id: true,
  createdAt: true,
});
export type InsertHistorico = z.infer<typeof insertHistoricoSchema>;
export type HistoricoEdicao = typeof pacientesHistoricoTable.$inferSelect;
