import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { pacientesTable } from "./pacientes";

/**
 * Receita de preparo da pele (PDF) da paciente — **uma por paciente**, exibida
 * dentro da seção "Preparo da Pele" (`tipo: "preparo_pele"`) na página pública.
 *
 * Mesmo padrão do pedido de exames: tabela própria + **bucket de storage próprio**
 * (`SUPABASE_STORAGE_BUCKET_RECEITAS_PELE`, default `receitas-preparo-pele`),
 * separado dos demais. `pacienteId` é único: subir uma nova receita substitui a
 * anterior. O arquivo vive no object storage; aqui só metadados. `objectPath` é a
 * chave interna e NUNCA é exposta ao frontend — o download é sempre via stream
 * pelo servidor, identificado pelo `tokenPublico` opaco no link público.
 */
export const pacientesReceitaPreparoPeleTable = pgTable(
  "pacientes_receita_preparo_pele",
  {
    id: serial("id").primaryKey(),
    pacienteId: integer("paciente_id")
      .notNull()
      .unique()
      .references(() => pacientesTable.id, { onDelete: "cascade" }),
    // Nome original do arquivo, usado no Content-Disposition do download.
    nomeArquivo: text("nome_arquivo").notNull(),
    // Chave interna do objeto no bucket de receitas. Apenas servidor.
    objectPath: text("object_path").notNull(),
    contentType: text("content_type").notNull().default("application/pdf"),
    // Tamanho em bytes.
    tamanho: integer("tamanho").notNull().default(0),
    // Referência pública opaca usada no link da paciente.
    tokenPublico: uuid("token_publico").notNull().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const insertReceitaPreparoPeleSchema = createInsertSchema(
  pacientesReceitaPreparoPeleTable,
).omit({
  id: true,
  createdAt: true,
});
export type InsertReceitaPreparoPele = z.infer<
  typeof insertReceitaPreparoPeleSchema
>;
export type ReceitaPreparoPelePaciente =
  typeof pacientesReceitaPreparoPeleTable.$inferSelect;
