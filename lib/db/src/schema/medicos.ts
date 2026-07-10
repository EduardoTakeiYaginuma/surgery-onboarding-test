import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Cadastro de médicos que atendem as pacientes. A clínica pode ter vários
 * médicos; cada paciente escolhe quem a atende (Dra. Karla é o padrão).
 *
 * - `foto`: caminho do objeto (relativo ao PRIVATE_OBJECT_DIR) da foto do
 *   médico em Object Storage privado. A exibição usa URL assinada de validade
 *   curta; null = sem foto.
 * - `padrao`: médico sugerido ao cadastrar um novo paciente. A garantia de no
 *   máximo um padrão fica na camada de repositório (medicos-repo).
 * - `ativo`: quando false, o médico some das listas de escolha, mas continua
 *   nos pacientes que já o tinham (snapshot preservado no próprio paciente).
 */
export const medicosTable = pgTable("medicos", {
  id: serial("id").primaryKey(),
  // Identificador do médico no lumexa-core (endpoint /api/admin/doctors). Chave
  // externa ESTÁVEL para sincronizar de forma idempotente — casar por nome não
  // serve (o core tem médicos homônimos). null = médico cadastrado à mão, sem
  // origem no core. Único quando preenchido.
  coreDoctorId: text("core_doctor_id").unique(),
  nome: text("nome").notNull(),
  crm: text("crm").notNull().default(""),
  rqe: text("rqe").notNull().default(""),
  clinica: text("clinica").notNull().default("KCL"),
  foto: text("foto"),
  logo: text("logo"),
  ativo: boolean("ativo").notNull().default(true),
  padrao: boolean("padrao").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertMedicoSchema = createInsertSchema(medicosTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMedico = z.infer<typeof insertMedicoSchema>;
export type Medico = typeof medicosTable.$inferSelect;
