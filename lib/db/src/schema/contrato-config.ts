import { pgTable, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Configuração operacional global da clínica (linha única, id=1). Editável pelo
 * Console pela equipe — sem mexer em código.
 *
 * `prazoAssinaturaDiasAntes` = quantos dias antes da cirurgia o contrato deve
 * estar assinado. O prazo de cada paciente é dataCirurgia − este valor, salvo
 * quando o paciente tem um override próprio.
 *
 * `vencimentoSaldoDiasUteisAntes` = quantos dias úteis antes da cirurgia o saldo
 * pendente vence por padrão. O Console usa para pré-preencher o vencimento do
 * saldo (e na dica do campo).
 */
export const configContratoTable = pgTable("config_contrato", {
  id: integer("id").primaryKey(),
  // Padrão 1 dia = termo/contrato assinado no mínimo ≈24h antes (D-1) da
  // cirurgia. Editável por clínica na tela /notificacoes.
  prazoAssinaturaDiasAntes: integer("prazo_assinatura_dias_antes")
    .notNull()
    .default(1),
  vencimentoSaldoDiasUteisAntes: integer("vencimento_saldo_dias_uteis_antes")
    .notNull()
    .default(2),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type ConfigContratoRow = typeof configContratoTable.$inferSelect;
