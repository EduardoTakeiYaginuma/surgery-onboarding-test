import { pgTable, integer, jsonb, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Conteúdo editável da página pública da paciente.
 *
 * Modelo em dois níveis:
 *  - **Padrão global**: uma única linha nesta tabela (id = 1) guarda as seções
 *    que valem para todas as pacientes.
 *  - **Ajuste por paciente**: a coluna `conteudo_pagina` em `pacientes` guarda um
 *    override opcional; quando ausente, cai no padrão global.
 *
 * Cada seção é um bloco ordenado com título e corpo (parágrafos/itens, etapas
 * de linha do tempo ou contatos). Os textos aceitam variáveis simples (ex.:
 * `{{primeiroNome}}`, `{{data}}`) resolvidas na hora de exibir.
 */

export type SecaoTipo =
  | "linha_do_tempo"
  | "lista"
  | "documentos"
  | "politica"
  | "contatos"
  | "texto"
  /**
   * Exames pré-operatórios: uma descrição (`corpo`) + a lista de exames
   * (`itens`, marcáveis) que a paciente deve realizar, exibida como bloco
   * recolhível (accordion) na página da paciente. O PDF com o pedido de todos os
   * exames é anexado por paciente (tabela `pacientes_pedido_exames`, fora desta
   * estrutura editável) e baixável dentro da seção.
   */
  | "preparo"
  /**
   * Suspensão de medicamentos: linha do tempo agrupada por janela de
   * antecedência. Cada grupo (`grupos`) tem um rótulo (`quando`, ex.: "21 dias
   * antes") e um `offsetDias` que resolve a data-limite exibida ("ATÉ dd/mm"),
   * e uma lista de medicamentos (`medicamentos`) com marca + princípio ativo.
   * `aviso` é o callout de rodapé (editável) e `arquivo` é o PDF único da
   * clínica com a lista completa (armazenado em bucket; baixável na seção).
   */
  | "suspensao_medicamentos"
  /**
   * Preparo da pele: uma descrição (`corpo`) + a lista de produtos (`produtos`)
   * que a paciente deve usar antes da cirurgia, exibida como bloco recolhível.
   * Cada produto tem nome, instrução de uso, quando começar e uma tag. A receita
   * (PDF) com a prescrição completa é anexada por paciente (tabela
   * `pacientes_receita_preparo_pele`, fora desta estrutura editável) e baixável
   * dentro da seção.
   */
  | "preparo_pele"
  /**
   * Receituário pós-operatório: uma descrição (`corpo`) + a lista de medicações
   * (`medicacoes`: nome, instrução, via) usadas após o procedimento, um callout
   * de rodapé (`aviso`, ex.: indicações de protetor solar) e o PDF do receituário
   * anexado por paciente (tabela `pacientes_receituario_posop`, fora desta
   * estrutura editável), baixável dentro da seção. Bloco recolhível.
   */
  | "receituario_posop";

export interface SecaoEtapa {
  quando: string;
  titulo: string;
  descricao: string;
  /** Dias relativos à data da cirurgia (0 = no dia, -10 = dez dias antes). null = sem data. */
  offsetDias: number | null;
  /** Data resolvida para exibição (preenchida só na página pública). */
  data?: string;
}

export interface SecaoContato {
  rotulo: string;
  valor: string;
}

/** suspensao_medicamentos: um medicamento a suspender (marca + princípio ativo). */
export interface SecaoMedicamento {
  /** Nome comercial, exibido em destaque. */
  marca: string;
  /** Princípio ativo, exibido esmaecido entre parênteses. Opcional. */
  principio?: string;
}

/** suspensao_medicamentos: uma janela de antecedência com seus medicamentos. */
export interface SecaoGrupoMedicamentos {
  /** Rótulo livre da janela, ex.: "21 dias antes" ou "3 dias antes (72h)". */
  quando: string;
  /** Dias relativos à data da cirurgia (negativo = antes). null = sem data-limite. */
  offsetDias: number | null;
  /** Data-limite resolvida para exibição ("dd/mm"). Preenchida só na página pública. */
  data?: string;
  medicamentos: SecaoMedicamento[];
}

/**
 * Arquivo único anexado a uma seção (hoje só `suspensao_medicamentos`). Guarda
 * apenas metadados — os bytes vivem no bucket. `token` é opaco e também é a
 * chave do objeto (`<token>.pdf`), então nenhum caminho interno é exposto no
 * payload público.
 */
export interface SecaoArquivo {
  nomeArquivo: string;
  tamanho: number;
  token: string;
}

/** preparo_pele: um produto do preparo da pele. Todos os campos aceitam variáveis. */
export interface SecaoProduto {
  /** Nome do produto e marca, ex.: "Blancy TX — Mantecorp". */
  nome: string;
  /** Instrução de uso, ex.: "Aplicar 1 camada na pele à noite, todos os dias". */
  instrucao: string;
  /** Quando começar, ex.: "Iniciar 10 dias antes da cirurgia". */
  inicio: string;
  /** Rótulo curto, ex.: "1 frasco · Uso tópico noturno". */
  tag: string;
}

/** receituario_posop: uma medicação do receituário. Todos os campos aceitam variáveis. */
export interface SecaoMedicacao {
  /** Nome e dose, ex.: "Cefalexina 500mg". */
  nome: string;
  /** Posologia, ex.: "Tomar 1 comprimido de 6/6 horas por 7 dias". */
  instrucao: string;
  /** Via de uso (exibida em itálico), ex.: "Via oral", "Uso ocular". */
  via: string;
}

export interface SecaoConteudo {
  /** Identificador estável da seção (usado para reordenar/editar). */
  id: string;
  tipo: SecaoTipo;
  titulo: string;
  /** lista, documentos: itens de texto. */
  itens?: string[];
  /** politica, texto: corpo em parágrafos (separados por linha em branco). documentos, preparo, suspensao_medicamentos: subtítulo exibido abaixo do título. */
  corpo?: string;
  /** linha_do_tempo: etapas. */
  etapas?: SecaoEtapa[];
  /** contatos: pares rótulo/valor. */
  contatos?: SecaoContato[];
  /** suspensao_medicamentos: janelas de antecedência com seus medicamentos. */
  grupos?: SecaoGrupoMedicamentos[];
  /** suspensao_medicamentos: texto do callout de rodapé (editável). */
  aviso?: string;
  /** suspensao_medicamentos: PDF único da lista completa (metadados; bytes no bucket). */
  arquivo?: SecaoArquivo;
  /** preparo_pele: produtos do preparo da pele. */
  produtos?: SecaoProduto[];
  /** receituario_posop: medicações do receituário pós-operatório. */
  medicacoes?: SecaoMedicacao[];
}

export const conteudoPaginaTable = pgTable("conteudo_pagina", {
  /** Singleton: sempre id = 1. */
  id: integer("id").primaryKey(),
  secoes: jsonb("secoes").$type<SecaoConteudo[]>().notNull(),
  /**
   * Registro (claro/escuro) com que TODA página de paciente abre no primeiro
   * acesso. A escolha da própria paciente (coluna `tema` em `pacientes`) sempre
   * vence depois — este é só o padrão inicial da clínica.
   */
  temaPadrao: text("tema_padrao")
    .$type<"light" | "dark">()
    .notNull()
    .default("light"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type ConteudoPaginaRow = typeof conteudoPaginaTable.$inferSelect;
