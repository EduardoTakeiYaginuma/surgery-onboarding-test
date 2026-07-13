import {
  pgTable,
  serial,
  text,
  date,
  numeric,
  boolean,
  uuid,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendedorasTable } from "./vendedoras";
import { medicosTable } from "./medicos";
import { locaisTable, type LocalSnapshot } from "./locais";
import type { SecaoConteudo } from "./conteudo";

export const pacientesTable = pgTable("pacientes", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  // CPF e telefone guardados apenas como dígitos (CPF: 11; telefone: 10 ou 11
  // com DDD). A formatação para exibição fica nos frontends.
  cpf: text("cpf").notNull().default(""),
  telefone: text("telefone").notNull().default(""),
  // E-mail da paciente (opcional). Puxado do contato do Twenty quando existe;
  // quando presente, habilita a entrega de assinatura por e-mail na Autentique.
  email: text("email"),
  // Vínculo com a pessoa REAL no Twenty (objeto People). Preenchido quando a
  // ficha é criada a partir da busca de contatos — garante que o cadastro aponta
  // para um paciente que existe no CRM. null = cadastro manual sem vínculo.
  twentyContactId: text("twenty_contact_id"),
  // Dados de identidade complementares usados nos documentos (contrato/termo).
  // Opcionais e editáveis no cadastro; enriquecidos ao gerar um documento pela
  // via de IA (o que a equipe digita no formulário é gravado aqui de volta).
  // Texto livre (nascimento como o operador digitar, ex.: "15/05/1981").
  rg: text("rg"),
  nascimento: text("nascimento"),
  endereco: text("endereco"),
  procedimentos: text("procedimentos").array().notNull(),
  dataCirurgia: date("data_cirurgia", { mode: "string" }).notNull(),
  horario: text("horario").notNull().default("06:00"),
  // valorSinal = valor já PAGO pela paciente (rótulo "Valor pago" na UI).
  valorSinal: numeric("valor_sinal", { precision: 10, scale: 2 }).notNull(),
  // Saldo em aberto (0 quando quitado) e data prevista para o pagamento pendente.
  valorPendente: numeric("valor_pendente", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  dataPagamentoPendente: date("data_pagamento_pendente", { mode: "string" }),
  laser: boolean("laser").notNull().default(false),
  // Médico responsável (cadastro em `medicos`). Os campos planos abaixo
  // (medica/crm/rqe/clinica) são um SNAPSHOT copiado do médico no momento do
  // cadastro/edição — preservam o texto de handoff, a auditoria e os pacientes
  // antigos mesmo se o médico for editado ou desativado depois.
  medicoId: integer("medico_id").references(() => medicosTable.id, {
    onDelete: "set null",
  }),
  medica: text("medica").notNull().default("Dra. Karla Caetano Lobo"),
  crm: text("crm").notNull().default("SP 254200"),
  rqe: text("rqe").notNull().default("124750"),
  clinica: text("clinica").notNull().default("KCL"),
  local: text("local").notNull().default("Avant Moema"),
  // Endereço do local da cirurgia, texto livre digitado no cadastro (antes vinha
  // da constante de hospitais). null/"" quando ainda não informado.
  localEndereco: text("local_endereco"),
  // Vínculo com o local de cirurgia configurável (tabela `locais`). Preenchido
  // quando a equipe escolhe um local da lista OU digita um novo (texto livre,
  // que cria uma linha em `locais`). Os campos `local`/`localEndereco` acima
  // continuam como texto de exibição/legado. null = cadastro antigo sem vínculo.
  localId: integer("local_id").references(() => locaisTable.id, {
    onDelete: "set null",
  }),
  // SNAPSHOT do local no momento do cadastro (contato do CC, instruções de
  // chegada, etc.), na mesma linha dos snapshots de médico. Preserva o texto das
  // mensagens mesmo que o local seja editado/desativado depois. null = cadastro
  // antigo; a resolução cai no texto livre (perfilLocalDoPaciente).
  localSnapshot: jsonb("local_snapshot").$type<LocalSnapshot>(),
  // Equipe de anestesia: texto livre digitado no cadastro (antes vinha de um
  // catálogo fixo de chaves). Nome e telefone são independentes por paciente.
  equipeAnestesia: text("equipe_anestesia").notNull().default("Zenicare"),
  // Telefone da equipe de anestesia, texto livre. null/"" quando não informado.
  equipeAnestesiaTelefone: text("equipe_anestesia_telefone"),
  estagio: text("estagio").notNull().default("Fechamento"),
  vendedoraId: integer("vendedora_id").references(() => vendedorasTable.id, {
    onDelete: "set null",
  }),
  arquivado: boolean("arquivado").notNull().default(false),
  tokenPublico: uuid("token_publico").notNull().defaultRandom(),
  // Contrato na Autentique (somente leitura). O ID do documento é extraído do
  // link colado pela secretária; status/assinatura/última verificação são cache
  // do último estado conhecido, reusado na listagem e resumo.
  contratoAutentiqueId: text("contrato_autentique_id"),
  contratoStatus: text("contrato_status"),
  contratoAssinadoEm: text("contrato_assinado_em"),
  contratoVerificadoEm: timestamp("contrato_verificado_em", {
    withTimezone: true,
  }),
  // Link de assinatura do contrato. `contratoLinkAssinatura` é cache do link do
  // primeiro signatário pendente, lido da Autentique (somente leitura);
  // `contratoLinkAssinaturaManual` é um override colado pela secretária e tem
  // prioridade quando preenchido. O link exibido = manual || cache.
  contratoLinkAssinatura: text("contrato_link_assinatura"),
  contratoLinkAssinaturaManual: text("contrato_link_assinatura_manual"),
  // Prazo de assinatura. O prazo efetivo = override (se houver) senão
  // dataCirurgia − (config_contrato.prazoAssinaturaDiasAntes). `alertadoEm`
  // marca quando a equipe já foi avisada do vencimento (dedup do webhook).
  contratoPrazoOverride: date("contrato_prazo_override", { mode: "string" }),
  contratoPrazoAlertadoEm: timestamp("contrato_prazo_alertado_em", {
    withTimezone: true,
  }),
  // Dedup DURÁVEL do aviso de transição (assinado/recusado). `alertaStatus`
  // guarda o último status pelo qual a equipe já foi avisada e `alertaEnviadoEm`
  // quando isso aconteceu. Mesmo que o cache de status acima se perca, ou duas
  // entregas de webhook corram juntas, só sai um aviso por status — e fica
  // auditável quando o aviso foi registrado.
  contratoAlertaStatus: text("contrato_alerta_status"),
  contratoAlertaEnviadoEm: timestamp("contrato_alerta_enviado_em", {
    withTimezone: true,
  }),
  // Cópia DURÁVEL do PDF final assinado, arquivada no bucket privado
  // `documentos-assinados` (SUPABASE_STORAGE_BUCKET_ASSINADOS). `/objects/<chave>`
  // sob o prefixo `contratos/`. Preenchido uma única vez quando o contrato passa
  // a "assinado" (ver refrescarStatusContrato); a Autentique continua sendo a
  // fonte da verdade, isto é só o arquivo guardado do nosso lado. null = ainda
  // não arquivado.
  contratoAssinadoObjectPath: text("contrato_assinado_object_path"),
  // Termo de consentimento (TCLE) na Autentique — campos espelho dos campos do
  // contrato acima. Documento independente: ID, status, assinatura, verificação,
  // link de assinatura (cache + override manual), prazo e dedup de alerta.
  termoAutentiqueId: text("termo_autentique_id"),
  termoStatus: text("termo_status"),
  termoAssinadoEm: text("termo_assinado_em"),
  termoVerificadoEm: timestamp("termo_verificado_em", {
    withTimezone: true,
  }),
  termoLinkAssinatura: text("termo_link_assinatura"),
  termoLinkAssinaturaManual: text("termo_link_assinatura_manual"),
  termoPrazoOverride: date("termo_prazo_override", { mode: "string" }),
  termoPrazoAlertadoEm: timestamp("termo_prazo_alertado_em", {
    withTimezone: true,
  }),
  // Cópia DURÁVEL do termo (TCLE) final assinado — espelho de
  // `contratoAssinadoObjectPath`, sob o prefixo `termos/` no mesmo bucket.
  termoAssinadoObjectPath: text("termo_assinado_object_path"),
  // Carimbos da jornada da equipe (funil de 10 marcos). O funil em si é DERIVADO
  // no servidor (lib/jornada-equipe) a partir de sinais já existentes
  // (contrato/termo assinados, pagamento, data da cirurgia) MAIS estes carimbos.
  // `linkEnviadoEm` é o sinal automático de "link enviado" (gravado no /aprovar);
  // os quatro de pós-operatório são MANUAIS (a equipe marca/desmarca). null =
  // marco não atingido; preenchido = quando foi atingido (auditável e exibível).
  linkEnviadoEm: timestamp("link_enviado_em", { withTimezone: true }),
  retiradaPontosEm: timestamp("retirada_pontos_em", { withTimezone: true }),
  retorno1Em: timestamp("retorno_1_em", { withTimezone: true }),
  retorno2Em: timestamp("retorno_2_em", { withTimezone: true }),
  retorno3Em: timestamp("retorno_3_em", { withTimezone: true }),
  codigoPublico: text("codigo_publico")
    .notNull()
    .unique()
    .default(sql`substr(md5(random()::text), 1, 8)`),
  // Override opcional do conteúdo da página pública desta paciente. Quando null,
  // a página cai no padrão global (tabela conteudo_pagina).
  conteudoPagina: jsonb("conteudo_pagina").$type<SecaoConteudo[]>(),
  // Preferência claro/escuro escolhida pela paciente na própria página pública.
  // null = nunca escolheu → padrão claro. Persistida por token para acompanhar a
  // paciente entre dispositivos.
  tema: text("tema").$type<"light" | "dark">(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertPacienteSchema = createInsertSchema(pacientesTable).omit({
  id: true,
  // conteudoPagina é gerenciado pelos endpoints dedicados de conteúdo, não pelo
  // CRUD comum de paciente.
  conteudoPagina: true,
  // tema é escolhido pela própria paciente na página pública (endpoint dedicado),
  // fora do CRUD comum de paciente.
  tema: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPaciente = z.infer<typeof insertPacienteSchema>;
export type Paciente = typeof pacientesTable.$inferSelect;
