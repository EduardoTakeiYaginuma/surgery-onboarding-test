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
 * Pedido de exames (PDF) da paciente — **um por paciente**, exibido dentro da
 * seção "Procedimentos pré-operatórios" (`tipo: "preparo"`) na página pública.
 *
 * Fica numa tabela própria (nunca uma coluna solta em `pacientes`) e num
 * **bucket de storage próprio** (`SUPABASE_STORAGE_BUCKET_EXAMES`, default
 * `pedidos-exames`), separado da aba "Documentos extra" (bucket `documentos`),
 * para organizar melhor os arquivos.
 *
 * `pacienteId` é único: subir um novo pedido substitui o anterior (a rota apaga
 * o objeto antigo antes de gravar o novo). Como nos documentos, o arquivo em si
 * vive no object storage; aqui guardamos só os metadados. `objectPath` é a chave
 * interna do objeto e NUNCA é exposta ao frontend — o download é sempre via
 * stream pelo servidor, identificado pelo `tokenPublico` opaco no link público.
 */
export const pacientesPedidoExamesTable = pgTable("pacientes_pedido_exames", {
  id: serial("id").primaryKey(),
  pacienteId: integer("paciente_id")
    .notNull()
    .unique()
    .references(() => pacientesTable.id, { onDelete: "cascade" }),
  // Nome original do arquivo, usado no Content-Disposition do download.
  nomeArquivo: text("nome_arquivo").notNull(),
  // Chave interna do objeto no bucket de pedidos de exames. Apenas servidor.
  objectPath: text("object_path").notNull(),
  contentType: text("content_type").notNull().default("application/pdf"),
  // Tamanho em bytes.
  tamanho: integer("tamanho").notNull().default(0),
  // Referência pública opaca usada no link da paciente, para nunca expor o id
  // interno nem o caminho do objeto no download público.
  tokenPublico: uuid("token_publico").notNull().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertPedidoExamesSchema = createInsertSchema(
  pacientesPedidoExamesTable,
).omit({
  id: true,
  createdAt: true,
});
export type InsertPedidoExames = z.infer<typeof insertPedidoExamesSchema>;
export type PedidoExamesPaciente =
  typeof pacientesPedidoExamesTable.$inferSelect;
