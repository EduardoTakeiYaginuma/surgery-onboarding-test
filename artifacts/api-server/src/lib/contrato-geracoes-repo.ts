import { and, desc, eq } from "drizzle-orm";
import {
  db,
  contratoGeracoesTable,
  type ContratoGeracao,
  type DocumentoTipo,
  type InsertContratoGeracao,
  type RelatorioRevisao,
  type DecisaoRegiao,
  type SignatarioContrato,
  type FormularioDocumentoIa,
  type TurnoConversaIa,
} from "@workspace/db";

export interface ContratoGeracoesRepository {
  /** Lista as gerações de uma paciente; filtra por `tipo` quando informado. */
  listarPorPaciente(
    pacienteId: number,
    tipo?: DocumentoTipo,
  ): Promise<ContratoGeracao[]>;
  obter(id: number): Promise<ContratoGeracao | undefined>;
  criar(dados: InsertContratoGeracao): Promise<ContratoGeracao>;
  /**
   * Cria uma geração a partir de um PDF PRONTO enviado por fora (upload). Não há
   * corpo HTML nem modelo/decisões — o PDF no armazenamento é a fonte da verdade.
   * Entra como `rascunho`, seguindo o mesmo caminho de aprovação/envio.
   */
  criarUpload(dados: {
    pacienteId: number;
    tipo: DocumentoTipo;
    titulo: string;
    arquivoObjectPath: string;
    arquivoNome: string;
  }): Promise<ContratoGeracao>;
  /**
   * Cria uma geração REDIGIDA POR IA a partir do formulário. O `corpo` HTML
   * devolvido pelo ChatGPT é a fonte da verdade (não há modelo/decisões). Guarda o
   * formulário para auditoria. Entra como `rascunho`, mesmo caminho de aprovação.
   */
  criarIa(dados: {
    pacienteId: number;
    tipo: DocumentoTipo;
    titulo: string;
    corpo: string;
    formulario: FormularioDocumentoIa;
  }): Promise<ContratoGeracao>;
  /**
   * Aplica um refino por IA: substitui o `corpo` pelo HTML revisado e anexa a
   * instrução à trilha `conversaIa`. Só faz sentido em gerações `origem: "ia"`.
   */
  atualizarCorpoIa(
    id: number,
    corpo: string,
    turno: TurnoConversaIa,
  ): Promise<ContratoGeracao | undefined>;
  /** Salva o texto editado pela equipe (só permitido antes do envio). */
  atualizarCorpo(
    id: number,
    corpo: string,
  ): Promise<ContratoGeracao | undefined>;
  /** Regera o texto a partir das decisões do motor de cláusulas (corpo + snapshot). */
  atualizarCorpoEDecisoes(
    id: number,
    corpo: string,
    decisoes: DecisaoRegiao[],
  ): Promise<ContratoGeracao | undefined>;
  /** Guarda o relatório da revisão de IA (snapshot de apoio à decisão). */
  salvarRelatorio(
    id: number,
    relatorio: RelatorioRevisao,
  ): Promise<ContratoGeracao | undefined>;
  /** Registra a aprovação humana (quem/quando). */
  aprovar(
    id: number,
    aprovadoPor: string,
  ): Promise<ContratoGeracao | undefined>;
  /** Snapshot dos signatários enviados à Autentique (para o status por parte). */
  definirSignatarios(
    id: number,
    signatarios: SignatarioContrato[],
  ): Promise<ContratoGeracao | undefined>;
  /** Marca como enviado à Autentique e guarda o id do documento. */
  marcarEnviado(
    id: number,
    autentiqueId: string,
  ): Promise<ContratoGeracao | undefined>;
  /** Marca falha de envio (preserva a aprovação para permitir nova tentativa). */
  marcarFalhaEnvio(
    id: number,
    erro: string,
  ): Promise<ContratoGeracao | undefined>;
}

class DrizzleContratoGeracoesRepository
  implements ContratoGeracoesRepository
{
  async listarPorPaciente(
    pacienteId: number,
    tipo?: DocumentoTipo,
  ): Promise<ContratoGeracao[]> {
    return db
      .select()
      .from(contratoGeracoesTable)
      .where(
        tipo
          ? and(
              eq(contratoGeracoesTable.pacienteId, pacienteId),
              eq(contratoGeracoesTable.tipo, tipo),
            )
          : eq(contratoGeracoesTable.pacienteId, pacienteId),
      )
      .orderBy(desc(contratoGeracoesTable.createdAt));
  }

  async obter(id: number): Promise<ContratoGeracao | undefined> {
    const [row] = await db
      .select()
      .from(contratoGeracoesTable)
      .where(eq(contratoGeracoesTable.id, id));
    return row;
  }

  async criar(dados: InsertContratoGeracao): Promise<ContratoGeracao> {
    const [row] = await db
      .insert(contratoGeracoesTable)
      .values(dados)
      .returning();
    return row;
  }

  async criarUpload(dados: {
    pacienteId: number;
    tipo: DocumentoTipo;
    titulo: string;
    arquivoObjectPath: string;
    arquivoNome: string;
  }): Promise<ContratoGeracao> {
    const [row] = await db
      .insert(contratoGeracoesTable)
      .values({
        pacienteId: dados.pacienteId,
        tipo: dados.tipo,
        // Upload não vem de um modelo do sistema — snapshots neutros de auditoria.
        modeloId: null,
        modeloProcedimento: "—",
        modeloVersao: 0,
        titulo: dados.titulo,
        corpo: "",
        decisoes: null,
        arquivoObjectPath: dados.arquivoObjectPath,
        arquivoNome: dados.arquivoNome,
        status: "rascunho",
      })
      .returning();
    return row;
  }

  async criarIa(dados: {
    pacienteId: number;
    tipo: DocumentoTipo;
    titulo: string;
    corpo: string;
    formulario: FormularioDocumentoIa;
  }): Promise<ContratoGeracao> {
    const [row] = await db
      .insert(contratoGeracoesTable)
      .values({
        pacienteId: dados.pacienteId,
        tipo: dados.tipo,
        // Redigido por IA — sem modelo do sistema; snapshots neutros de auditoria.
        modeloId: null,
        modeloProcedimento: "—",
        modeloVersao: 0,
        titulo: dados.titulo,
        corpo: dados.corpo,
        decisoes: null,
        origem: "ia",
        formularioIa: dados.formulario,
        status: "rascunho",
      })
      .returning();
    return row;
  }

  async atualizarCorpoIa(
    id: number,
    corpo: string,
    turno: TurnoConversaIa,
  ): Promise<ContratoGeracao | undefined> {
    const atual = await this.obter(id);
    if (!atual) return undefined;
    const conversa = [...(atual.conversaIa ?? []), turno];
    const [row] = await db
      .update(contratoGeracoesTable)
      .set({ corpo, conversaIa: conversa, updatedAt: new Date() })
      .where(eq(contratoGeracoesTable.id, id))
      .returning();
    return row;
  }

  async atualizarCorpo(
    id: number,
    corpo: string,
  ): Promise<ContratoGeracao | undefined> {
    const [row] = await db
      .update(contratoGeracoesTable)
      .set({ corpo, updatedAt: new Date() })
      .where(eq(contratoGeracoesTable.id, id))
      .returning();
    return row;
  }

  async atualizarCorpoEDecisoes(
    id: number,
    corpo: string,
    decisoes: DecisaoRegiao[],
  ): Promise<ContratoGeracao | undefined> {
    const [row] = await db
      .update(contratoGeracoesTable)
      .set({
        corpo,
        decisoes: decisoes.length > 0 ? decisoes : null,
        updatedAt: new Date(),
      })
      .where(eq(contratoGeracoesTable.id, id))
      .returning();
    return row;
  }

  async salvarRelatorio(
    id: number,
    relatorio: RelatorioRevisao,
  ): Promise<ContratoGeracao | undefined> {
    const [row] = await db
      .update(contratoGeracoesTable)
      .set({
        relatorioIa: relatorio,
        iaRevisadoEm: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(contratoGeracoesTable.id, id))
      .returning();
    return row;
  }

  async aprovar(
    id: number,
    aprovadoPor: string,
  ): Promise<ContratoGeracao | undefined> {
    const [row] = await db
      .update(contratoGeracoesTable)
      .set({
        status: "aprovado",
        aprovadoPor,
        aprovadoEm: new Date(),
        erroEnvio: null,
        updatedAt: new Date(),
      })
      .where(eq(contratoGeracoesTable.id, id))
      .returning();
    return row;
  }

  async definirSignatarios(
    id: number,
    signatarios: SignatarioContrato[],
  ): Promise<ContratoGeracao | undefined> {
    const [row] = await db
      .update(contratoGeracoesTable)
      .set({
        signatarios: signatarios.length > 0 ? signatarios : null,
        updatedAt: new Date(),
      })
      .where(eq(contratoGeracoesTable.id, id))
      .returning();
    return row;
  }

  async marcarEnviado(
    id: number,
    autentiqueId: string,
  ): Promise<ContratoGeracao | undefined> {
    const [row] = await db
      .update(contratoGeracoesTable)
      .set({
        status: "enviado",
        autentiqueId,
        erroEnvio: null,
        updatedAt: new Date(),
      })
      .where(eq(contratoGeracoesTable.id, id))
      .returning();
    return row;
  }

  async marcarFalhaEnvio(
    id: number,
    erro: string,
  ): Promise<ContratoGeracao | undefined> {
    const [row] = await db
      .update(contratoGeracoesTable)
      .set({ status: "falha_envio", erroEnvio: erro, updatedAt: new Date() })
      .where(eq(contratoGeracoesTable.id, id))
      .returning();
    return row;
  }
}

export const contratoGeracoesRepo: ContratoGeracoesRepository =
  new DrizzleContratoGeracoesRepository();
