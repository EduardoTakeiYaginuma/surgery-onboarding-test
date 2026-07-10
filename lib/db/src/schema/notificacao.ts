import { pgTable, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";

/**
 * Configuração dos avisos de contrato à equipe — editável pelo Console.
 *
 * Singleton (sempre id = 1). Antes existia só por variável de ambiente
 * (`EQUIPE_NOTIFICACAO_WEBHOOK` / `EQUIPE_NOTIFICACAO_SILENCIADA`); agora a
 * equipe define o destino e liga/desliga os avisos pela própria tela, sem mexer
 * em secrets. As variáveis de ambiente continuam valendo como fallback quando
 * nada foi salvo aqui (ver `notificacoes.ts`).
 *
 * - `webhookUrl`: destino do aviso (Slack/Discord/ponte WhatsApp). null = sem
 *   destino salvo (cai no env, se houver).
 * - `silenciada`: quando true, os avisos param sem perder o destino salvo.
 */
export const configNotificacaoTable = pgTable("config_notificacao", {
  /** Singleton: sempre id = 1. */
  id: integer("id").primaryKey(),
  webhookUrl: text("webhook_url"),
  silenciada: boolean("silenciada").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type ConfigNotificacaoRow = typeof configNotificacaoTable.$inferSelect;
