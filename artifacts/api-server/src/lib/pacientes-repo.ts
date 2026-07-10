import { and, eq, or, desc, sql } from "drizzle-orm";
import {
  db,
  pacientesTable,
  pacientesHistoricoTable,
  vendedorasTable,
  pacientesEventosTable,
  pacientesDocumentosTable,
  pacientesPedidoExamesTable,
  pacientesReceitaPreparoPeleTable,
  pacientesReceituarioPosopTable,
  type Paciente,
  type InsertPaciente,
  type HistoricoEdicao,
  type AlteracaoCampo,
  type SecaoConteudo,
  type EventoPaciente,
  type DocumentoPaciente,
  type InsertDocumento,
  type PedidoExamesPaciente,
  type InsertPedidoExames,
  type ReceitaPreparoPelePaciente,
  type InsertReceitaPreparoPele,
  type ReceituarioPosopPaciente,
  type InsertReceituarioPosop,
} from "@workspace/db";
import { gerarCodigoPublico } from "./codigo-publico";

/**
 * Paciente enriquecido com o nome da vendedora responsável (resolvido por join),
 * para que a UI mostre a responsável sem uma consulta adicional.
 */
export type PacienteComVendedora = Paciente & { vendedoraNome: string | null };

/**
 * Camada de dados isolada (repositório). Toda a UI e os handlers falam com esta
 * interface — a fonte da verdade pode ser trocada no futuro (ex.: Twenty CRM)
 * sem reescrever as rotas nem o frontend.
 */
export interface PacientesRepository {
  listar(): Promise<PacienteComVendedora[]>;
  listarArquivados(): Promise<PacienteComVendedora[]>;
  obterPorId(id: number): Promise<PacienteComVendedora | undefined>;
  obterPorToken(token: string): Promise<PacienteComVendedora | undefined>;
  /**
   * Busca uma paciente pelo CPF (apenas dígitos). `excluirId` é usado no
   * update: garante que a paciente não conflite consigo mesma ao reenviar o
   * mesmo CPF. `apenasAtivos`/`apenasArquivados` restringem a busca ao estado
   * de arquivamento — usado no cadastro para distinguir um conflito com um
   * cadastro ativo (sempre bloqueia) de um cadastro arquivado (oferece
   * restauração).
   */
  obterPorCpf(
    cpf: string,
    opcoes?: {
      excluirId?: number;
      apenasAtivos?: boolean;
      apenasArquivados?: boolean;
    },
  ): Promise<PacienteComVendedora | undefined>;
  obterPorContratoId(
    contratoId: string,
  ): Promise<PacienteComVendedora | undefined>;
  obterPorTermoId(
    termoId: string,
  ): Promise<PacienteComVendedora | undefined>;
  criar(dados: InsertPaciente): Promise<PacienteComVendedora>;
  atualizar(
    id: number,
    dados: Partial<InsertPaciente>,
  ): Promise<PacienteComVendedora | undefined>;
  atualizarContrato(
    id: number,
    dados: {
      contratoAutentiqueId?: string | null;
      contratoStatus?: string | null;
      contratoAssinadoEm?: string | null;
      contratoVerificadoEm?: Date | null;
      contratoLinkAssinatura?: string | null;
      contratoAssinadoObjectPath?: string | null;
    },
  ): Promise<PacienteComVendedora | undefined>;
  atualizarTermo(
    id: number,
    dados: {
      termoAutentiqueId?: string | null;
      termoStatus?: string | null;
      termoAssinadoEm?: string | null;
      termoVerificadoEm?: Date | null;
      termoLinkAssinatura?: string | null;
      termoAssinadoObjectPath?: string | null;
    },
  ): Promise<PacienteComVendedora | undefined>;
  /**
   * Reivindica ATOMICAMENTE o direito de avisar a equipe sobre `status`
   * (assinado/recusado). Grava o marcador durável (contratoAlertaStatus/
   * contratoAlertaEnviadoEm) num único UPDATE condicional e devolve `true`
   * apenas para quem ganhou a reivindicação. Duas entregas concorrentes do
   * mesmo evento não conseguem ganhar as duas — só uma dispara o aviso.
   */
  reivindicarAlertaContrato(id: number, status: string): Promise<boolean>;
  /**
   * Libera o marcador reivindicado quando o aviso NÃO saiu de fato
   * (silenciado/sem-webhook/falha de entrega), para que uma próxima tentativa
   * possa reavisar. Só limpa se o marcador ainda for o `status` reivindicado.
   */
  liberarAlertaContrato(id: number, status: string): Promise<void>;
  arquivar(id: number): Promise<PacienteComVendedora | undefined>;
  restaurar(id: number): Promise<PacienteComVendedora | undefined>;
  registrarHistorico(
    pacienteId: number,
    alteracoes: AlteracaoCampo[],
  ): Promise<HistoricoEdicao>;
  listarHistorico(pacienteId: number): Promise<HistoricoEdicao[]>;
  /** Salva (ou substitui) o override de conteúdo da paciente. */
  salvarConteudo(
    id: number,
    secoes: SecaoConteudo[],
  ): Promise<Paciente | undefined>;
  /** Remove o override, voltando ao padrão global. */
  removerConteudo(id: number): Promise<Paciente | undefined>;
  registrarEvento(
    pacienteId: number,
    tipo: string,
    rotulo?: string | null,
  ): Promise<EventoPaciente>;
  listarEventos(pacienteId: number): Promise<EventoPaciente[]>;
  /**
   * Conjunto de ids de pacientes que já abriram o link ao menos uma vez,
   * agregado em uma única consulta para evitar N+1 na listagem do Console.
   */
  idsComAbertura(): Promise<Set<number>>;
  /** Salva a preferência de tema escolhida pela paciente na página pública. */
  salvarTema(
    id: number,
    tema: "light" | "dark",
  ): Promise<Paciente | undefined>;
  /** Cria o registro de um PDF já enviado ao armazenamento. */
  criarDocumento(dados: InsertDocumento): Promise<DocumentoPaciente>;
  /** Lista os documentos da paciente (mais recentes primeiro). */
  listarDocumentos(pacienteId: number): Promise<DocumentoPaciente[]>;
  /** Busca um documento por id, restrito à paciente dona. */
  obterDocumento(
    pacienteId: number,
    documentoId: number,
  ): Promise<DocumentoPaciente | undefined>;
  /** Busca um documento pelo token público opaco. */
  obterDocumentoPorToken(
    token: string,
  ): Promise<DocumentoPaciente | undefined>;
  /** Remove o registro do documento (o objeto é apagado pela rota). */
  removerDocumento(pacienteId: number, documentoId: number): Promise<boolean>;

  /** Pedido de exames (PDF) da paciente — um por paciente; undefined quando não há. */
  obterPedidoExames(
    pacienteId: number,
  ): Promise<PedidoExamesPaciente | undefined>;
  /** Busca o pedido de exames pelo token público opaco (download público). */
  obterPedidoExamesPorToken(
    token: string,
  ): Promise<PedidoExamesPaciente | undefined>;
  /**
   * Grava (ou substitui) o pedido de exames da paciente e devolve o registro,
   * junto do `objectPathAnterior` (a chave do arquivo antigo, quando havia) para
   * a rota apagar o objeto substituído do storage.
   */
  salvarPedidoExames(
    dados: InsertPedidoExames,
  ): Promise<{ pedido: PedidoExamesPaciente; objectPathAnterior: string | null }>;
  /**
   * Remove o registro do pedido de exames e devolve o `objectPath` do arquivo
   * removido (null quando não havia) para a rota apagar o objeto do storage.
   */
  removerPedidoExames(pacienteId: number): Promise<string | null>;

  /** Receita de preparo da pele (PDF) da paciente — uma por paciente; undefined quando não há. */
  obterReceitaPreparoPele(
    pacienteId: number,
  ): Promise<ReceitaPreparoPelePaciente | undefined>;
  /** Busca a receita pelo token público opaco (download público). */
  obterReceitaPreparoPelePorToken(
    token: string,
  ): Promise<ReceitaPreparoPelePaciente | undefined>;
  /** Grava (ou substitui) a receita; devolve o registro + `objectPathAnterior`. */
  salvarReceitaPreparoPele(
    dados: InsertReceitaPreparoPele,
  ): Promise<{
    receita: ReceitaPreparoPelePaciente;
    objectPathAnterior: string | null;
  }>;
  /** Remove o registro da receita e devolve o `objectPath` removido (ou null). */
  removerReceitaPreparoPele(pacienteId: number): Promise<string | null>;

  /** Receituário pós-operatório (PDF) da paciente — um por paciente; undefined quando não há. */
  obterReceituarioPosop(
    pacienteId: number,
  ): Promise<ReceituarioPosopPaciente | undefined>;
  /** Busca o receituário pelo token público opaco (download público). */
  obterReceituarioPosopPorToken(
    token: string,
  ): Promise<ReceituarioPosopPaciente | undefined>;
  /** Grava (ou substitui) o receituário; devolve o registro + `objectPathAnterior`. */
  salvarReceituarioPosop(
    dados: InsertReceituarioPosop,
  ): Promise<{
    receituario: ReceituarioPosopPaciente;
    objectPathAnterior: string | null;
  }>;
  /** Remove o registro do receituário e devolve o `objectPath` removido (ou null). */
  removerReceituarioPosop(pacienteId: number): Promise<string | null>;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function combinar(
  row: Paciente,
  vendedoraNome: string | null,
): PacienteComVendedora {
  return { ...row, vendedoraNome };
}

class DrizzlePacientesRepository implements PacientesRepository {
  private baseSelect() {
    return db
      .select({
        paciente: pacientesTable,
        vendedoraNome: vendedorasTable.nome,
      })
      .from(pacientesTable)
      .leftJoin(
        vendedorasTable,
        eq(pacientesTable.vendedoraId, vendedorasTable.id),
      );
  }

  async listar(): Promise<PacienteComVendedora[]> {
    const rows = await this.baseSelect().orderBy(pacientesTable.dataCirurgia);
    return rows
      .filter((r) => !r.paciente.arquivado)
      .map((r) => combinar(r.paciente, r.vendedoraNome));
  }

  async listarArquivados(): Promise<PacienteComVendedora[]> {
    const rows = await this.baseSelect().orderBy(desc(pacientesTable.updatedAt));
    return rows
      .filter((r) => r.paciente.arquivado)
      .map((r) => combinar(r.paciente, r.vendedoraNome));
  }

  async obterPorId(id: number): Promise<PacienteComVendedora | undefined> {
    const [row] = await this.baseSelect().where(eq(pacientesTable.id, id));
    return row ? combinar(row.paciente, row.vendedoraNome) : undefined;
  }

  async obterPorToken(
    token: string,
  ): Promise<PacienteComVendedora | undefined> {
    // Aceita tanto o código curto novo quanto o UUID antigo, para que os links
    // já enviados pelo WhatsApp continuem funcionando. A comparação com a coluna
    // uuid só entra quando o token tem formato de UUID (senão o Postgres lança
    // erro de sintaxe ao comparar texto arbitrário com uuid).
    const condicao = UUID_REGEX.test(token)
      ? or(
          eq(pacientesTable.codigoPublico, token),
          eq(pacientesTable.tokenPublico, token),
        )
      : eq(pacientesTable.codigoPublico, token);
    const [row] = await this.baseSelect().where(condicao);
    return row ? combinar(row.paciente, row.vendedoraNome) : undefined;
  }

  private async gerarCodigoUnico(): Promise<string> {
    for (let tentativa = 0; tentativa < 10; tentativa++) {
      const codigo = gerarCodigoPublico();
      const [existe] = await db
        .select({ id: pacientesTable.id })
        .from(pacientesTable)
        .where(eq(pacientesTable.codigoPublico, codigo));
      if (!existe) return codigo;
    }
    throw new Error("Não foi possível gerar um código público único");
  }

  async criar(dados: InsertPaciente): Promise<PacienteComVendedora> {
    const codigoPublico = await this.gerarCodigoUnico();
    const [row] = await db
      .insert(pacientesTable)
      .values({ ...dados, codigoPublico })
      .returning();
    return (await this.obterPorId(row.id))!;
  }

  async obterPorCpf(
    cpf: string,
    opcoes?: {
      excluirId?: number;
      apenasAtivos?: boolean;
      apenasArquivados?: boolean;
    },
  ): Promise<PacienteComVendedora | undefined> {
    const filtros = [eq(pacientesTable.cpf, cpf)];
    if (opcoes?.excluirId !== undefined) {
      filtros.push(sql`${pacientesTable.id} <> ${opcoes.excluirId}`);
    }
    if (opcoes?.apenasAtivos) {
      filtros.push(eq(pacientesTable.arquivado, false));
    }
    if (opcoes?.apenasArquivados) {
      filtros.push(eq(pacientesTable.arquivado, true));
    }
    const [row] = await this.baseSelect().where(and(...filtros));
    return row ? combinar(row.paciente, row.vendedoraNome) : undefined;
  }

  async obterPorContratoId(
    contratoId: string,
  ): Promise<PacienteComVendedora | undefined> {
    const [row] = await this.baseSelect().where(
      eq(pacientesTable.contratoAutentiqueId, contratoId),
    );
    return row ? combinar(row.paciente, row.vendedoraNome) : undefined;
  }

  async obterPorTermoId(
    termoId: string,
  ): Promise<PacienteComVendedora | undefined> {
    const [row] = await this.baseSelect().where(
      eq(pacientesTable.termoAutentiqueId, termoId),
    );
    return row ? combinar(row.paciente, row.vendedoraNome) : undefined;
  }

  async atualizar(
    id: number,
    dados: Partial<InsertPaciente>,
  ): Promise<PacienteComVendedora | undefined> {
    const [row] = await db
      .update(pacientesTable)
      .set(dados)
      .where(eq(pacientesTable.id, id))
      .returning();
    if (!row) return undefined;
    return this.obterPorId(row.id);
  }

  async arquivar(id: number): Promise<PacienteComVendedora | undefined> {
    return this.atualizar(id, { arquivado: true });
  }

  async restaurar(id: number): Promise<PacienteComVendedora | undefined> {
    return this.atualizar(id, { arquivado: false });
  }

  async atualizarContrato(
    id: number,
    dados: {
      contratoAutentiqueId?: string | null;
      contratoStatus?: string | null;
      contratoAssinadoEm?: string | null;
      contratoVerificadoEm?: Date | null;
      contratoLinkAssinatura?: string | null;
      contratoAssinadoObjectPath?: string | null;
    },
  ): Promise<PacienteComVendedora | undefined> {
    const [row] = await db
      .update(pacientesTable)
      .set(dados)
      .where(eq(pacientesTable.id, id))
      .returning();
    if (!row) return undefined;
    return this.obterPorId(row.id);
  }

  async atualizarTermo(
    id: number,
    dados: {
      termoAutentiqueId?: string | null;
      termoStatus?: string | null;
      termoAssinadoEm?: string | null;
      termoVerificadoEm?: Date | null;
      termoLinkAssinatura?: string | null;
      termoAssinadoObjectPath?: string | null;
    },
  ): Promise<PacienteComVendedora | undefined> {
    const [row] = await db
      .update(pacientesTable)
      .set(dados)
      .where(eq(pacientesTable.id, id))
      .returning();
    if (!row) return undefined;
    return this.obterPorId(row.id);
  }

  async reivindicarAlertaContrato(
    id: number,
    status: string,
  ): Promise<boolean> {
    // UPDATE condicional atômico: só grava (e devolve linha) quando o marcador
    // atual difere do `status` pedido. `IS DISTINCT FROM` trata null como
    // diferente, então a primeira reivindicação vence e uma entrega concorrente
    // do mesmo evento, que chega logo depois, vê o marcador já igual e perde.
    const rows = await db
      .update(pacientesTable)
      .set({ contratoAlertaStatus: status, contratoAlertaEnviadoEm: new Date() })
      .where(
        and(
          eq(pacientesTable.id, id),
          sql`${pacientesTable.contratoAlertaStatus} IS DISTINCT FROM ${status}`,
        ),
      )
      .returning({ id: pacientesTable.id });
    return rows.length > 0;
  }

  async liberarAlertaContrato(id: number, status: string): Promise<void> {
    await db
      .update(pacientesTable)
      .set({ contratoAlertaStatus: null, contratoAlertaEnviadoEm: null })
      .where(
        and(
          eq(pacientesTable.id, id),
          eq(pacientesTable.contratoAlertaStatus, status),
        ),
      );
  }

  async registrarHistorico(
    pacienteId: number,
    alteracoes: AlteracaoCampo[],
  ): Promise<HistoricoEdicao> {
    const [row] = await db
      .insert(pacientesHistoricoTable)
      .values({ pacienteId, alteracoes })
      .returning();
    return row;
  }

  async listarHistorico(pacienteId: number): Promise<HistoricoEdicao[]> {
    return db
      .select()
      .from(pacientesHistoricoTable)
      .where(eq(pacientesHistoricoTable.pacienteId, pacienteId))
      .orderBy(desc(pacientesHistoricoTable.createdAt));
  }

  async salvarConteudo(
    id: number,
    secoes: SecaoConteudo[],
  ): Promise<Paciente | undefined> {
    const [row] = await db
      .update(pacientesTable)
      .set({ conteudoPagina: secoes })
      .where(eq(pacientesTable.id, id))
      .returning();
    return row;
  }

  async registrarEvento(
    pacienteId: number,
    tipo: string,
    rotulo?: string | null,
  ): Promise<EventoPaciente> {
    const [row] = await db
      .insert(pacientesEventosTable)
      .values({ pacienteId, tipo, rotulo: rotulo ?? null })
      .returning();
    return row;
  }

  async removerConteudo(id: number): Promise<Paciente | undefined> {
    const [row] = await db
      .update(pacientesTable)
      .set({ conteudoPagina: null })
      .where(eq(pacientesTable.id, id))
      .returning();
    return row;
  }

  async listarEventos(pacienteId: number): Promise<EventoPaciente[]> {
    return db
      .select()
      .from(pacientesEventosTable)
      .where(eq(pacientesEventosTable.pacienteId, pacienteId))
      .orderBy(desc(pacientesEventosTable.createdAt));
  }

  async idsComAbertura(): Promise<Set<number>> {
    const rows = await db
      .selectDistinct({ pacienteId: pacientesEventosTable.pacienteId })
      .from(pacientesEventosTable)
      .where(eq(pacientesEventosTable.tipo, "abertura"));
    return new Set(rows.map((r) => r.pacienteId));
  }

  async salvarTema(
    id: number,
    tema: "light" | "dark",
  ): Promise<Paciente | undefined> {
    const [row] = await db
      .update(pacientesTable)
      .set({ tema })
      .where(eq(pacientesTable.id, id))
      .returning();
    return row;
  }

  async criarDocumento(dados: InsertDocumento): Promise<DocumentoPaciente> {
    const [row] = await db
      .insert(pacientesDocumentosTable)
      .values(dados)
      .returning();
    return row;
  }

  async listarDocumentos(pacienteId: number): Promise<DocumentoPaciente[]> {
    return db
      .select()
      .from(pacientesDocumentosTable)
      .where(eq(pacientesDocumentosTable.pacienteId, pacienteId))
      .orderBy(desc(pacientesDocumentosTable.createdAt));
  }

  async obterDocumento(
    pacienteId: number,
    documentoId: number,
  ): Promise<DocumentoPaciente | undefined> {
    const [row] = await db
      .select()
      .from(pacientesDocumentosTable)
      .where(eq(pacientesDocumentosTable.id, documentoId));
    return row && row.pacienteId === pacienteId ? row : undefined;
  }

  async obterDocumentoPorToken(
    token: string,
  ): Promise<DocumentoPaciente | undefined> {
    if (!UUID_REGEX.test(token)) return undefined;
    const [row] = await db
      .select()
      .from(pacientesDocumentosTable)
      .where(eq(pacientesDocumentosTable.tokenPublico, token));
    return row;
  }

  async removerDocumento(
    pacienteId: number,
    documentoId: number,
  ): Promise<boolean> {
    const existente = await this.obterDocumento(pacienteId, documentoId);
    if (!existente) return false;
    await db
      .delete(pacientesDocumentosTable)
      .where(eq(pacientesDocumentosTable.id, documentoId));
    return true;
  }

  async obterPedidoExames(
    pacienteId: number,
  ): Promise<PedidoExamesPaciente | undefined> {
    const [row] = await db
      .select()
      .from(pacientesPedidoExamesTable)
      .where(eq(pacientesPedidoExamesTable.pacienteId, pacienteId));
    return row;
  }

  async obterPedidoExamesPorToken(
    token: string,
  ): Promise<PedidoExamesPaciente | undefined> {
    if (!UUID_REGEX.test(token)) return undefined;
    const [row] = await db
      .select()
      .from(pacientesPedidoExamesTable)
      .where(eq(pacientesPedidoExamesTable.tokenPublico, token));
    return row;
  }

  async salvarPedidoExames(
    dados: InsertPedidoExames,
  ): Promise<{ pedido: PedidoExamesPaciente; objectPathAnterior: string | null }> {
    // Um por paciente: guardamos a chave antiga (se houver) para a rota apagar o
    // objeto substituído, e sobrescrevemos o registro no conflito de pacienteId.
    const anterior = await this.obterPedidoExames(dados.pacienteId);
    const [pedido] = await db
      .insert(pacientesPedidoExamesTable)
      .values(dados)
      .onConflictDoUpdate({
        target: pacientesPedidoExamesTable.pacienteId,
        set: {
          nomeArquivo: dados.nomeArquivo,
          objectPath: dados.objectPath,
          contentType: dados.contentType,
          tamanho: dados.tamanho,
        },
      })
      .returning();
    return {
      pedido,
      objectPathAnterior:
        anterior && anterior.objectPath !== pedido.objectPath
          ? anterior.objectPath
          : null,
    };
  }

  async removerPedidoExames(pacienteId: number): Promise<string | null> {
    const [row] = await db
      .delete(pacientesPedidoExamesTable)
      .where(eq(pacientesPedidoExamesTable.pacienteId, pacienteId))
      .returning();
    return row?.objectPath ?? null;
  }

  async obterReceitaPreparoPele(
    pacienteId: number,
  ): Promise<ReceitaPreparoPelePaciente | undefined> {
    const [row] = await db
      .select()
      .from(pacientesReceitaPreparoPeleTable)
      .where(eq(pacientesReceitaPreparoPeleTable.pacienteId, pacienteId));
    return row;
  }

  async obterReceitaPreparoPelePorToken(
    token: string,
  ): Promise<ReceitaPreparoPelePaciente | undefined> {
    if (!UUID_REGEX.test(token)) return undefined;
    const [row] = await db
      .select()
      .from(pacientesReceitaPreparoPeleTable)
      .where(eq(pacientesReceitaPreparoPeleTable.tokenPublico, token));
    return row;
  }

  async salvarReceitaPreparoPele(
    dados: InsertReceitaPreparoPele,
  ): Promise<{
    receita: ReceitaPreparoPelePaciente;
    objectPathAnterior: string | null;
  }> {
    const anterior = await this.obterReceitaPreparoPele(dados.pacienteId);
    const [receita] = await db
      .insert(pacientesReceitaPreparoPeleTable)
      .values(dados)
      .onConflictDoUpdate({
        target: pacientesReceitaPreparoPeleTable.pacienteId,
        set: {
          nomeArquivo: dados.nomeArquivo,
          objectPath: dados.objectPath,
          contentType: dados.contentType,
          tamanho: dados.tamanho,
        },
      })
      .returning();
    return {
      receita,
      objectPathAnterior:
        anterior && anterior.objectPath !== receita.objectPath
          ? anterior.objectPath
          : null,
    };
  }

  async removerReceitaPreparoPele(pacienteId: number): Promise<string | null> {
    const [row] = await db
      .delete(pacientesReceitaPreparoPeleTable)
      .where(eq(pacientesReceitaPreparoPeleTable.pacienteId, pacienteId))
      .returning();
    return row?.objectPath ?? null;
  }

  async obterReceituarioPosop(
    pacienteId: number,
  ): Promise<ReceituarioPosopPaciente | undefined> {
    const [row] = await db
      .select()
      .from(pacientesReceituarioPosopTable)
      .where(eq(pacientesReceituarioPosopTable.pacienteId, pacienteId));
    return row;
  }

  async obterReceituarioPosopPorToken(
    token: string,
  ): Promise<ReceituarioPosopPaciente | undefined> {
    if (!UUID_REGEX.test(token)) return undefined;
    const [row] = await db
      .select()
      .from(pacientesReceituarioPosopTable)
      .where(eq(pacientesReceituarioPosopTable.tokenPublico, token));
    return row;
  }

  async salvarReceituarioPosop(
    dados: InsertReceituarioPosop,
  ): Promise<{
    receituario: ReceituarioPosopPaciente;
    objectPathAnterior: string | null;
  }> {
    const anterior = await this.obterReceituarioPosop(dados.pacienteId);
    const [receituario] = await db
      .insert(pacientesReceituarioPosopTable)
      .values(dados)
      .onConflictDoUpdate({
        target: pacientesReceituarioPosopTable.pacienteId,
        set: {
          nomeArquivo: dados.nomeArquivo,
          objectPath: dados.objectPath,
          contentType: dados.contentType,
          tamanho: dados.tamanho,
        },
      })
      .returning();
    return {
      receituario,
      objectPathAnterior:
        anterior && anterior.objectPath !== receituario.objectPath
          ? anterior.objectPath
          : null,
    };
  }

  async removerReceituarioPosop(pacienteId: number): Promise<string | null> {
    const [row] = await db
      .delete(pacientesReceituarioPosopTable)
      .where(eq(pacientesReceituarioPosopTable.pacienteId, pacienteId))
      .returning();
    return row?.objectPath ?? null;
  }
}

export const pacientesRepo: PacientesRepository =
  new DrizzlePacientesRepository();
