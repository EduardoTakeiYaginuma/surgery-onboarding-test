import {
  pgTable,
  serial,
  text,
  numeric,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Locais de cirurgia (hospitais / day hospitals) configuráveis pela equipe.
 *
 * Antes esta lista vivia FIXA no código (constante `HOSPITAIS` em
 * api-server/src/lib/protocolo.ts). Agora é uma tabela: a equipe cadastra,
 * edita e desativa os endereços padrão pelo Console, e o paciente aponta para o
 * local escolhido por `pacientes.localId`. Um endereço digitado à mão no
 * cadastro (texto livre) também cria uma linha aqui, para virar padrão dali em
 * diante.
 *
 * Os campos ricos (contato do Centro Cirúrgico, instruções de chegada) são
 * usados nas mensagens operacionais e na página da paciente. `sinalSugerido`
 * pré-preenche o valor pago no formulário (null = sem sugestão). `ativo` some da
 * lista dos seletores sem apagar o histórico dos pacientes que já o usaram.
 */
export const locaisTable = pgTable(
  "locais",
  {
  id: serial("id").primaryKey(),
  // Nome curto para exibição e para casar com o `paciente.local` legado (a chave
  // estável que era persistida antes de existir o id). Único: o texto livre do
  // cadastro reusa o local de mesmo nome em vez de duplicar.
  nome: text("nome").notNull(),
  // Nome completo da instituição para mensagens e página da paciente.
  nomeCompleto: text("nome_completo").notNull().default(""),
  endereco: text("endereco").notNull().default(""),
  // Contato do Centro Cirúrgico (aparece nos blocos operacionais das saídas).
  contatoCcNome: text("contato_cc_nome").notNull().default(""),
  contatoCcTelefone: text("contato_cc_telefone").notNull().default(""),
  // Instruções/janela de chegada específicas do local.
  instrucoesChegada: text("instrucoes_chegada").notNull().default(""),
  // Valor de sinal sugerido para pré-preencher o formulário (null = sem sugestão).
  sinalSugerido: numeric("sinal_sugerido", { precision: 10, scale: 2 }),
  // Fora dos seletores quando false (mantém o histórico dos pacientes antigos).
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("locais_nome_unique").on(table.nome)],
);

export const insertLocalSchema = createInsertSchema(locaisTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLocal = z.infer<typeof insertLocalSchema>;
export type Local = typeof locaisTable.$inferSelect;

/**
 * SNAPSHOT do local gravado em `pacientes.localSnapshot` no momento do cadastro
 * (mesma filosofia dos campos medica/crm/clinica): preserva os dados usados nas
 * mensagens mesmo que o local seja editado ou desativado depois, e mantém os
 * pacientes antigos funcionando. Espelha o `HospitalProfile` do api-server.
 */
export type LocalSnapshot = {
  chave: string;
  nome: string;
  nomeCompleto: string;
  endereco: string;
  contatoCCNome: string;
  contatoCCTelefone: string;
  sinalSugerido: number | null;
  instrucoesChegada: string;
};
