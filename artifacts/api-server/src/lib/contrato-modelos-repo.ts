import { and, asc, eq, ne, sql } from "drizzle-orm";
import {
  db,
  contratoModelosTable,
  type ContratoModelo,
  type DocumentoTipo,
} from "@workspace/db";
import {
  MODELOS_PADRAO,
  PROCEDIMENTO_BASE,
  obterModeloPadrao,
} from "./contrato-modelo-padrao";

export interface NovoModelo {
  tipo?: DocumentoTipo;
  procedimento: string;
  titulo: string;
  corpo: string;
  vigente?: boolean;
  observacoes?: string | null;
}

/** O `tipo` de um modelo é imutável após criado (não se reclassifica). */
export type AtualizacaoModelo = Omit<Partial<NovoModelo>, "tipo">;

/**
 * Resultado de restaurar um modelo ao texto de fábrica:
 * - `naoEncontrado`: id inexistente;
 * - `semPadrao`: procedimento criado manualmente (sem par de fábrica);
 * - `precisaConfirmacao`: o modelo está vigente ou foi editado — restaurar
 *   sobrescreveria o trabalho da equipe; exige `confirmar`;
 * - `restaurado`: corpo/título voltaram à fábrica, NÃO vigente.
 */
export type RestauracaoPadraoResultado =
  | { status: "naoEncontrado" }
  | { status: "semPadrao" }
  | { status: "precisaConfirmacao"; modelo: ContratoModelo }
  | { status: "restaurado"; modelo: ContratoModelo };

export interface ContratoModelosRepository {
  /** Lista modelos; filtra por `tipo` quando informado. */
  listar(tipo?: DocumentoTipo): Promise<ContratoModelo[]>;
  obter(id: number): Promise<ContratoModelo | undefined>;
  /** Há um modelo corrente por (tipo, procedimento); `tipo` default contrato. */
  obterPorProcedimento(
    procedimento: string,
    tipo?: DocumentoTipo,
  ): Promise<ContratoModelo | undefined>;
  /**
   * Modelo-base VIGENTE de um tipo — a fonte única usada na geração. Resolve por
   * (procedimento = {@link PROCEDIMENTO_BASE}, tipo, vigente = true). Retorna
   * `undefined` quando a equipe ainda não marcou o modelo-base como vigente.
   */
  obterBaseVigente(tipo: DocumentoTipo): Promise<ContratoModelo | undefined>;
  criar(dados: NovoModelo): Promise<ContratoModelo>;
  atualizar(
    id: number,
    dados: AtualizacaoModelo,
  ): Promise<ContratoModelo | undefined>;
  remover(id: number): Promise<boolean>;
  /**
   * Semeia os modelos padrão FALTANTES por (tipo, procedimento), sem sobrescrever
   * os existentes (onConflictDoNothing). Idempotente: pode rodar a cada boot e só
   * adiciona o que falta — ex.: ao introduzir os modelos de TERMO, eles passam a
   * ser semeados sem tocar nos contratos já revisados pela equipe.
   */
  garantirPadrao(): Promise<void>;
  /**
   * Desativa (marca como NÃO vigente) os modelos-base por procedimento legados
   * — qualquer linha vigente cujo `procedimento` ≠ {@link PROCEDIMENTO_BASE}.
   * A geração resolve SEMPRE o modelo-base único ({@link obterBaseVigente}); um
   * modelo por procedimento vigente nunca é usado e só confunde a equipe, que o
   * vê "ativo" na página de modelos. Idempotente (no-op quando não há resíduo):
   * roda junto de `garantirPadrao` para limpar a deriva tanto em dev quanto em
   * produção, sem apagar as linhas (preservadas como histórico, NÃO vigentes).
   * Retorna quantas linhas foram rebaixadas.
   */
  desativarBasesObsoletas(): Promise<number>;
  /**
   * Restaura o corpo/título de um modelo ao texto de fábrica ATUAL
   * (`contrato-modelo-padrao.ts`), deixando-o NÃO vigente para preservar a
   * etapa humana de revisão+vigência antes de qualquer envio. Quando o modelo
   * está vigente ou foi editado, exige `confirmar` (não sobrescreve em silêncio
   * o trabalho da equipe). Idempotente: restaurar um modelo intocado é no-op.
   */
  restaurarPadrao(
    id: number,
    confirmar: boolean,
  ): Promise<RestauracaoPadraoResultado>;
}

class DrizzleContratoModelosRepository implements ContratoModelosRepository {
  async listar(tipo?: DocumentoTipo): Promise<ContratoModelo[]> {
    return db
      .select()
      .from(contratoModelosTable)
      .where(tipo ? eq(contratoModelosTable.tipo, tipo) : undefined)
      .orderBy(
        asc(contratoModelosTable.tipo),
        asc(contratoModelosTable.procedimento),
      );
  }

  async obter(id: number): Promise<ContratoModelo | undefined> {
    const [row] = await db
      .select()
      .from(contratoModelosTable)
      .where(eq(contratoModelosTable.id, id));
    return row;
  }

  async obterPorProcedimento(
    procedimento: string,
    tipo: DocumentoTipo = "contrato",
  ): Promise<ContratoModelo | undefined> {
    const [row] = await db
      .select()
      .from(contratoModelosTable)
      .where(
        and(
          eq(contratoModelosTable.procedimento, procedimento),
          eq(contratoModelosTable.tipo, tipo),
        ),
      );
    return row;
  }

  async obterBaseVigente(
    tipo: DocumentoTipo,
  ): Promise<ContratoModelo | undefined> {
    const [row] = await db
      .select()
      .from(contratoModelosTable)
      .where(
        and(
          eq(contratoModelosTable.procedimento, PROCEDIMENTO_BASE),
          eq(contratoModelosTable.tipo, tipo),
          eq(contratoModelosTable.vigente, true),
        ),
      );
    return row;
  }

  async criar(dados: NovoModelo): Promise<ContratoModelo> {
    const [row] = await db
      .insert(contratoModelosTable)
      .values({
        tipo: dados.tipo ?? "contrato",
        procedimento: dados.procedimento.trim(),
        titulo: dados.titulo,
        corpo: dados.corpo,
        vigente: dados.vigente ?? false,
        observacoes: dados.observacoes ?? null,
      })
      .returning();
    return row;
  }

  async atualizar(
    id: number,
    dados: AtualizacaoModelo,
  ): Promise<ContratoModelo | undefined> {
    const atual = await this.obter(id);
    if (!atual) return undefined;

    // Toda mudança no TEXTO (título/corpo) incrementa a versão — auditoria de
    // qual versão originou cada contrato. Mudar só `vigente`/observações não.
    const mudouTexto =
      (dados.titulo !== undefined && dados.titulo !== atual.titulo) ||
      (dados.corpo !== undefined && dados.corpo !== atual.corpo);

    const [row] = await db
      .update(contratoModelosTable)
      .set({
        ...(dados.procedimento !== undefined
          ? { procedimento: dados.procedimento.trim() }
          : {}),
        ...(dados.titulo !== undefined ? { titulo: dados.titulo } : {}),
        ...(dados.corpo !== undefined ? { corpo: dados.corpo } : {}),
        ...(dados.vigente !== undefined ? { vigente: dados.vigente } : {}),
        ...(dados.observacoes !== undefined
          ? { observacoes: dados.observacoes }
          : {}),
        ...(mudouTexto
          ? { versao: sql`${contratoModelosTable.versao} + 1` }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(contratoModelosTable.id, id))
      .returning();
    return row;
  }

  async remover(id: number): Promise<boolean> {
    const linhas = await db
      .delete(contratoModelosTable)
      .where(eq(contratoModelosTable.id, id))
      .returning({ id: contratoModelosTable.id });
    return linhas.length > 0;
  }

  async garantirPadrao(): Promise<void> {
    // Insere todos os modelos de fábrica e deixa o índice único (tipo,
    // procedimento) descartar os que já existem — assim só os FALTANTES são
    // criados, sem sobrescrever textos que a equipe já revisou/editou.
    await db
      .insert(contratoModelosTable)
      .values(
        MODELOS_PADRAO.map((m) => ({
          tipo: m.tipo,
          procedimento: m.procedimento,
          titulo: m.titulo,
          corpo: m.corpo,
          // Semeados como NÃO vigentes: a equipe revisa o corpo-base e marca
          // como vigente antes de gerar documentos (a rota de geração recusa
          // modelos não vigentes), garantindo a etapa humana já na origem.
          vigente: false,
        })),
      )
      .onConflictDoNothing({
        target: [contratoModelosTable.tipo, contratoModelosTable.procedimento],
      });
  }

  async desativarBasesObsoletas(): Promise<number> {
    // Rebaixa, sem apagar, todo modelo por procedimento legado ainda marcado
    // como vigente. A geração resolve só o modelo-base único (PROCEDIMENTO_BASE),
    // então um modelo por procedimento vigente é apenas resíduo da semeadura
    // antiga e confunde a equipe ao aparecer "ativo". Idempotente: quando não há
    // resíduo, o WHERE não casa nenhuma linha e nada muda.
    const linhas = await db
      .update(contratoModelosTable)
      .set({ vigente: false, updatedAt: new Date() })
      .where(
        and(
          ne(contratoModelosTable.procedimento, PROCEDIMENTO_BASE),
          eq(contratoModelosTable.vigente, true),
        ),
      )
      .returning({ id: contratoModelosTable.id });
    return linhas.length;
  }

  async restaurarPadrao(
    id: number,
    confirmar: boolean,
  ): Promise<RestauracaoPadraoResultado> {
    const atual = await this.obter(id);
    if (!atual) return { status: "naoEncontrado" };

    const padrao = obterModeloPadrao(atual.tipo, atual.procedimento);
    if (!padrao) return { status: "semPadrao" };

    // "Intocado" = texto idêntico à fábrica E já não vigente; restaurar nesse
    // caso é no-op e dispensa confirmação. Caso contrário (vigente OU editado),
    // restaurar sobrescreveria trabalho da equipe — exige confirmação explícita.
    const intocado =
      !atual.vigente &&
      atual.titulo === padrao.titulo &&
      atual.corpo === padrao.corpo;
    if (!intocado && !confirmar) {
      return { status: "precisaConfirmacao", modelo: atual };
    }

    // `atualizar` incrementa a versão quando o texto muda (auditoria) e zera a
    // vigência — a equipe revisa o texto de fábrica e marca como vigente antes
    // de gerar/enviar (a rota de geração recusa modelos não vigentes).
    const restaurado = await this.atualizar(id, {
      titulo: padrao.titulo,
      corpo: padrao.corpo,
      vigente: false,
    });
    return { status: "restaurado", modelo: restaurado! };
  }
}

export const contratoModelosRepo: ContratoModelosRepository =
  new DrizzleContratoModelosRepository();
