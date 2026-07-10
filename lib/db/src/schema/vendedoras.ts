import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vendedorasTable = pgTable("vendedoras", {
  id: serial("id").primaryKey(),
  // Identificador da vendedora no lumexa-core (endpoint /api/admin/salesreps).
  // Chave externa ESTÁVEL para sincronizar de forma idempotente (mesma lógica de
  // `medicos.core_doctor_id`). null = cadastro manual, sem origem no core.
  coreSalesrepId: text("core_salesrep_id").unique(),
  nome: text("nome").notNull(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertVendedoraSchema = createInsertSchema(vendedorasTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertVendedora = z.infer<typeof insertVendedoraSchema>;
export type Vendedora = typeof vendedorasTable.$inferSelect;
