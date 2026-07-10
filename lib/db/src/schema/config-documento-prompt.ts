import { pgTable, integer, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Prompts (system) usados pela via de criação de documento por IA — editáveis
 * pela equipe numa tela de admin, sem mexer em código. Linha única (id = 1).
 *
 * Cada coluna guarda o TEXTO do prompt (o "andaime" que instrui o ChatGPT a
 * redigir o documento, já com as cláusulas fixas embutidas). Quando `null`, o
 * sistema usa o prompt PADRÃO definido em código (`documento-ia-modelo.ts`) —
 * assim "restaurar padrão" é só gravar `null`, e o padrão de código continua
 * sendo a fonte da verdade quando ninguém customizou.
 *
 * Os prompts guardam placeholders `{{TOKEN}}` que o servidor substitui em tempo
 * de geração pelos dados de cada paciente (identificação, concordância de
 * gênero, blocos de risco por procedimento etc.). A validação no salvar garante
 * que os tokens obrigatórios não foram removidos por engano.
 */
export const configDocumentoPromptTable = pgTable("config_documento_prompt", {
  id: integer("id").primaryKey(),
  contratoPrompt: text("contrato_prompt"),
  termoPrompt: text("termo_prompt"),
  refinoPrompt: text("refino_prompt"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type ConfigDocumentoPromptRow =
  typeof configDocumentoPromptTable.$inferSelect;
