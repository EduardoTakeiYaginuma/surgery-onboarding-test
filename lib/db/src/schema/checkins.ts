import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { pacientesTable } from "./pacientes";

/**
 * Check-ins do acompanhamento PÓS-operatório da paciente.
 *
 * Cada linha é um ponto de contato agendado por dia relativo à cirurgia
 * (`dia` = D+N, ex.: 1, 7, 30). O `tipo` define o que se espera:
 *  - `foto`    → a paciente envia uma foto da evolução (uploader na página pública);
 *  - `retorno` → consulta/retorno presencial (apenas exibido);
 *  - `nps`     → pesquisa de satisfação (apenas exibido; coleta é fase futura).
 *
 * O staff acompanha o progresso no Console (tema escuro): marca status, anota,
 * e sinaliza atenção (`sinalAtencao`) para casos que merecem destaque.
 */
export const checkinsTable = pgTable("checkins_posop", {
  id: serial("id").primaryKey(),
  pacienteId: integer("paciente_id")
    .notNull()
    .references(() => pacientesTable.id, { onDelete: "cascade" }),
  /** Dia relativo à cirurgia (D+N). Ex.: 1, 7, 30. */
  dia: integer("dia").notNull(),
  tipo: text("tipo").$type<"foto" | "retorno" | "nps">().notNull(),
  status: text("status")
    .$type<"pendente" | "concluido" | "atrasado">()
    .notNull()
    .default("pendente"),
  /**
   * Caminho do objeto da foto no Object Storage privado (relativo ao
   * PRIVATE_OBJECT_DIR). Nunca é uma URL pública: o Console exibe via URL
   * assinada/proxy gerada no servidor. null enquanto não há foto enviada.
   */
  fotoUrl: text("foto_url"),
  nota: text("nota"),
  sinalAtencao: boolean("sinal_atencao").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertCheckinSchema = createInsertSchema(checkinsTable).omit({
  id: true,
  createdAt: true,
});
// Derivado do tipo nativo de insert do drizzle (preserva os literais de `tipo`
// e `status`); o schema zod acima existe para validação e alarga para string.
export type InsertCheckin = Omit<
  typeof checkinsTable.$inferInsert,
  "id" | "createdAt"
>;
export type Checkin = typeof checkinsTable.$inferSelect;
