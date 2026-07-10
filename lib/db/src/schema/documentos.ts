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
 * Documentos (PDFs) anexados à paciente — pedidos médicos, pedidos de exame,
 * receitas, suspensão de medicação etc. Cada arquivo é um registro próprio
 * (nunca uma coluna jsonb solta) para permitir listar e remover individualmente.
 *
 * O arquivo em si vive no object storage (App Storage); aqui guardamos apenas os
 * metadados. `objectPath` é o caminho interno do objeto (ex.: /objects/uploads/…)
 * e NUNCA é exposto ao frontend — o download é sempre via stream pelo servidor.
 */
export const pacientesDocumentosTable = pgTable("pacientes_documentos", {
  id: serial("id").primaryKey(),
  pacienteId: integer("paciente_id")
    .notNull()
    .references(() => pacientesTable.id, { onDelete: "cascade" }),
  // Rótulo/categoria simples escolhido pela equipe (ex.: "Pedido médico").
  rotulo: text("rotulo").notNull(),
  // Nome original do arquivo, usado no Content-Disposition do download.
  nomeArquivo: text("nome_arquivo").notNull(),
  // Caminho interno do objeto no armazenamento (/objects/…). Apenas servidor.
  objectPath: text("object_path").notNull(),
  contentType: text("content_type").notNull().default("application/pdf"),
  // Tamanho em bytes.
  tamanho: integer("tamanho").notNull().default(0),
  // Referência pública opaca usada no link da paciente, para nunca expor o id
  // interno sequencial nem o caminho do objeto no download público.
  tokenPublico: uuid("token_publico").notNull().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertDocumentoSchema = createInsertSchema(
  pacientesDocumentosTable,
).omit({
  id: true,
  createdAt: true,
});
export type InsertDocumento = z.infer<typeof insertDocumentoSchema>;
export type DocumentoPaciente = typeof pacientesDocumentosTable.$inferSelect;
