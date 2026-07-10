import {
  pgTable,
  serial,
  text,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { pacientesTable } from "./pacientes";
import { contratoModelosTable, type DocumentoTipo } from "./contrato-modelos";

/** Uma frente da revisão de IA traz vários itens verificados. */
export interface RevisaoItem {
  rotulo: string;
  /** `ok` = conforme; `atencao` = precisa de revisão humana. */
  status: "ok" | "atencao";
  observacao: string;
  /** Sugestão de ajuste (texto), quando aplicável. */
  sugestao?: string;
}

/** As três frentes fixas da revisão jurídica assistida por IA. */
export interface RevisaoFrente {
  chave: "clausulas" | "consistencia" | "conformidade";
  titulo: string;
  resumo: string;
  itens: RevisaoItem[];
}

/**
 * Relatório estruturado devolvido pela revisão de IA. Guardado como snapshot na
 * geração — é um apoio à decisão humana, NUNCA uma aprovação automática.
 */
export interface RelatorioRevisao {
  /** ISO de quando o relatório foi gerado. */
  geradoEm: string;
  /** Modelo de IA usado (ex.: "gpt-5.4"). */
  modelo: string;
  /** Quantidade de itens em "atencao" — destaque rápido para a equipe. */
  alertas: number;
  resumoGeral: string;
  frentes: RevisaoFrente[];
}

/**
 * Uma decisão tomada sobre uma REGIÃO tipada do modelo ao gerar o contrato: qual
 * opção de uma `variante` foi escolhida, se um bloco `opcional` foi incluído, ou
 * o gênero da paciente (concordância). É o snapshot auditável do que o motor de
 * cláusulas inferiu e do que o operador confirmou/ajustou — guardado por geração
 * para reproduzir o texto e explicar cada escolha depois.
 *
 * `inferido` guarda a sugestão original do motor (para mostrar "ajustado" quando
 * o operador troca); `origem` é o texto do porquê da sugestão (ex.: "Médica: Dra.
 * Karla → São Paulo"). Só decisões `confirmado: true` liberam a aprovação.
 */
export interface DecisaoRegiao {
  /** `data-id` da região no modelo (único). `"genero"` para a concordância. */
  id: string;
  tipo: "variante" | "opcional" | "genero";
  /** Rótulo humano da decisão (ex.: "Foro", "Cláusula 5.1 — Taxa administrativa"). */
  rotulo: string;
  /** variante/genero: chave da opção escolhida (ex.: "sao-paulo", "f"). */
  valor?: string;
  /** variante/genero: opções disponíveis (para a UI trocar). Vazio no opcional. */
  opcoes?: { valor: string; label: string }[];
  /** opcional: se o bloco foi incluído no documento. */
  incluido?: boolean;
  /** Sugestão original do motor (chave da opção ou incluído/omitido). */
  inferido?: string | boolean;
  /** O operador confirmou esta decisão? Aprovação exige todas confirmadas. */
  confirmado: boolean;
  /** O valor efetivo difere do inferido (o operador ajustou à mão)? */
  editado: boolean;
  /** Texto auditável do porquê da sugestão inferida. */
  origem: string;
}

/**
 * Um signatário do documento, definido na hora do envio à Autentique. O `papel`
 * distingue as partes para a visualização por parte (contrato: paciente +
 * representante legal; termo: paciente + médico). `nome`/`email` são o que foi de
 * fato enviado à Autentique — guardamos aqui para casar cada assinatura de volta
 * ao seu papel (por e-mail) ao consultar o status por parte.
 */
export interface SignatarioContrato {
  /** `paciente` | `representante` | `medico`. Texto livre para extensibilidade. */
  papel: string;
  nome: string;
  email: string;
}

/** Ciclo de vida da geração de um contrato. */
export type ContratoGeracaoStatus =
  | "rascunho"
  | "aprovado"
  | "enviado"
  | "falha_envio";

/**
 * Como esta geração foi criada:
 * - `template`: motor de cláusulas tipadas + modelo-base (via legada, oculta na UI).
 * - `upload`: PDF pronto enviado por fora (governado por `arquivoObjectPath`).
 * - `ia`: redigido pelo ChatGPT a partir do formulário (`formularioIa`), seguindo
 *   o padrão dos documentos-exemplo. É a via simples atual.
 */
export type DocumentoOrigem = "template" | "upload" | "ia";

/**
 * Dados coletados no formulário da via de criação por IA. Superconjunto dos campos
 * de contrato e termo — o serviço de geração usa o que é relevante para cada
 * `tipo`. Guardado como snapshot para auditoria e eventual regeração.
 */
export interface FormularioDocumentoIa {
  // Identidade da paciente/contratante
  nome: string;
  cpf?: string;
  rg?: string;
  nascimento?: string;
  endereco?: string;
  email?: string;
  telefone?: string;
  /** Concordância de gênero da paciente/contratante. */
  genero: "feminino" | "masculino";
  // Médica responsável
  medica: string;
  crm?: string;
  rqe?: string;
  cidadeMedica?: string;
  /** Procedimentos contratados (nomes do catálogo padrão). Dirige objeto/riscos. */
  procedimentos: string[];
  /** Cidade e data da assinatura (contrato) ou do registro (termo). */
  cidade?: string;
  data?: string;
  // --- Específicos do CONTRATO ---
  foro?: string;
  dataProcedimento?: string;
  localProcedimento?: string;
  valorTotal?: string;
  valorSinal?: string;
  valorSaldo?: string;
  vencimentoSaldo?: string;
  /** Texto livre: descontos, forma de pagamento, cláusulas especiais, etc. */
  condicoesComerciais?: string;
  responsavelFinanceiro?: string;
  // --- Específicos do TERMO (TCLE) ---
  /** Autoriza uso de imagem (LGPD)? Default true. */
  autorizaImagem?: boolean;
}

/** Um turno da conversa de refino por IA sobre um documento gerado (auditoria). */
export interface TurnoConversaIa {
  /** Instrução do operador (o que pediu para mudar). */
  instrucao: string;
  /** ISO de quando o refino foi aplicado. */
  criadoEm: string;
}

/**
 * Cada geração de contrato de uma paciente: o rascunho preenchido a partir do
 * modelo-base, o relatório da revisão de IA, e a trilha de auditoria da
 * aprovação humana (quem/quando/qual versão do modelo) + o id do documento
 * criado na Autentique.
 *
 * Nada é enviado à Autentique sem aprovação humana. O `corpo` é a fonte da
 * verdade do texto (editável até a aprovação). `modeloVersao`/`modeloProcedimento`
 * são snapshots — preservam a auditoria mesmo se o modelo for editado depois.
 */
export const contratoGeracoesTable = pgTable("contrato_geracoes", {
  id: serial("id").primaryKey(),
  pacienteId: integer("paciente_id")
    .notNull()
    .references(() => pacientesTable.id, { onDelete: "cascade" }),
  // Tipo do documento gerado (contrato | termo) — herdado do modelo na geração.
  tipo: text("tipo").$type<DocumentoTipo>().notNull().default("contrato"),
  modeloId: integer("modelo_id").references(() => contratoModelosTable.id, {
    onDelete: "set null",
  }),
  modeloProcedimento: text("modelo_procedimento").notNull(),
  modeloVersao: integer("modelo_versao").notNull(),
  titulo: text("titulo").notNull(),
  corpo: text("corpo").notNull(),
  // Contrato PRONTO enviado por fora (upload de PDF): caminho do objeto no
  // armazenamento e nome original do arquivo. Quando `arquivoObjectPath` está
  // preenchido, esta geração NÃO tem corpo HTML gerado — o PDF do upload é a
  // fonte da verdade e vai intacto à Autentique/download. `null` nas gerações
  // produzidas pelo motor (fluxo padrão), que continuam governadas pelo `corpo`.
  arquivoObjectPath: text("arquivo_object_path"),
  arquivoNome: text("arquivo_nome"),
  // Signatários efetivamente enviados à Autentique (paciente + representante
  // legal no contrato; paciente + médico no termo). Snapshot do envio — mapeia
  // cada assinatura da Autentique ao seu papel na visualização por parte. null
  // nas gerações antigas (envio com signatário único, antes desta feature).
  signatarios: jsonb("signatarios").$type<SignatarioContrato[]>(),
  relatorioIa: jsonb("relatorio_ia").$type<RelatorioRevisao>(),
  iaRevisadoEm: timestamp("ia_revisado_em", { withTimezone: true }),
  // Decisões do motor de cláusulas (variantes/opcionais/gênero) — snapshot das
  // escolhas inferidas e confirmadas que produziram o `corpo`. null nas gerações
  // antigas e nos modelos sem regiões tipadas (documento 100% fixo + variáveis).
  decisoes: jsonb("decisoes").$type<DecisaoRegiao[]>(),
  // Via de criação desta geração (template | upload | ia). Gerações antigas ficam
  // como "template" (default), retrocompatível com o motor de cláusulas.
  origem: text("origem").$type<DocumentoOrigem>().notNull().default("template"),
  // Snapshot do formulário da via de IA (null nas demais vias). Fonte dos dados
  // que o ChatGPT usou para redigir o documento.
  formularioIa: jsonb("formulario_ia").$type<FormularioDocumentoIa>(),
  // Trilha das instruções de refino por IA aplicadas ao corpo (auditoria).
  conversaIa: jsonb("conversa_ia").$type<TurnoConversaIa[]>(),
  status: text("status")
    .$type<ContratoGeracaoStatus>()
    .notNull()
    .default("rascunho"),
  aprovadoPor: text("aprovado_por"),
  aprovadoEm: timestamp("aprovado_em", { withTimezone: true }),
  autentiqueId: text("autentique_id"),
  // Última mensagem de erro de envio (para a equipe entender a falha e tentar
  // de novo). Limpa quando o envio dá certo.
  erroEnvio: text("erro_envio"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type ContratoGeracao = typeof contratoGeracoesTable.$inferSelect;
export type InsertContratoGeracao = typeof contratoGeracoesTable.$inferInsert;
