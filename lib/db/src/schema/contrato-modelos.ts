import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Tipo do documento jurídico gerável: o CONTRATO de prestação de serviços ou o
 * TERMO de consentimento livre e esclarecido (TCLE). Os dois compartilham o
 * mesmo pipeline (modelo-base → preenchimento → revisão por IA → aprovação
 * humana → PDF → Autentique); só mudam o texto-base, o foco da revisão e qual
 * campo do paciente recebe o documento enviado.
 */
export type DocumentoTipo = "contrato" | "termo";

/**
 * Modelos-base por (tipo, procedimento). Cada linha é o texto-base aprovado para
 * um procedimento (ex.: "Blefaroplastia"), com variáveis `{{...}}` preenchidas
 * com os dados da paciente na hora de gerar.
 *
 * O par `(tipo, procedimento)` é único — há um modelo corrente de contrato e um
 * de termo por procedimento. Cada edição incrementa `versao` (auditoria: qual
 * versão do texto deu origem a um documento). `vigente` indica que a equipe
 * revisou e marcou este texto como a versão jurídica em vigor; apenas modelos
 * vigentes podem gerar um documento.
 */
export const contratoModelosTable = pgTable(
  "contrato_modelos",
  {
    id: serial("id").primaryKey(),
    tipo: text("tipo").$type<DocumentoTipo>().notNull().default("contrato"),
    procedimento: text("procedimento").notNull(),
    titulo: text("titulo").notNull(),
    corpo: text("corpo").notNull(),
    versao: integer("versao").notNull().default(1),
    vigente: boolean("vigente").notNull().default(false),
    // Observações internas da equipe sobre o modelo (não vai para o documento).
    observacoes: text("observacoes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("contrato_modelos_tipo_procedimento_unique").on(
      table.tipo,
      table.procedimento,
    ),
  ],
);

export type ContratoModelo = typeof contratoModelosTable.$inferSelect;
export type InsertContratoModelo = typeof contratoModelosTable.$inferInsert;
