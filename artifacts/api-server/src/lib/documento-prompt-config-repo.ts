import { eq } from "drizzle-orm";
import { db, configDocumentoPromptTable } from "@workspace/db";
import {
  DEFAULT_PROMPT_CONTRATO,
  DEFAULT_PROMPT_TERMO,
  DEFAULT_PROMPT_REFINO,
  TOKENS_CONTRATO,
  TOKENS_TERMO,
  TOKENS_REFINO,
} from "./documento-ia-modelo";

const SINGLETON_ID = 1;

/** Tamanho mínimo de um prompt salvo — guarda contra apagão acidental. */
export const PROMPT_MIN_LEN = 40;

export type PromptTipo = "contrato" | "termo" | "refino";

const PADROES: Record<PromptTipo, string> = {
  contrato: DEFAULT_PROMPT_CONTRATO,
  termo: DEFAULT_PROMPT_TERMO,
  refino: DEFAULT_PROMPT_REFINO,
};

const TOKENS: Record<PromptTipo, readonly string[]> = {
  contrato: TOKENS_CONTRATO,
  termo: TOKENS_TERMO,
  refino: TOKENS_REFINO,
};

/** Prompt padrão (de código) de cada tipo. */
export function promptPadrao(tipo: PromptTipo): string {
  return PADROES[tipo];
}

/** Tokens obrigatórios de cada tipo. */
export function tokensObrigatorios(tipo: PromptTipo): readonly string[] {
  return TOKENS[tipo];
}

export interface ValidacaoPrompt {
  ok: boolean;
  muitoCurto: boolean;
  tokensFaltando: string[];
}

/**
 * Valida um texto de prompt: precisa ter um tamanho mínimo e conter TODOS os
 * tokens obrigatórios daquele tipo. Sem um token, o dado correspondente sumiria
 * do documento em silêncio — por isso rejeitamos antes de salvar.
 */
export function validarPrompt(tipo: PromptTipo, texto: string): ValidacaoPrompt {
  const t = texto.trim();
  const tokensFaltando = TOKENS[tipo].filter(
    (token) => !t.includes(`{{${token}}}`),
  );
  return {
    ok: t.length >= PROMPT_MIN_LEN && tokensFaltando.length === 0,
    muitoCurto: t.length < PROMPT_MIN_LEN,
    tokensFaltando,
  };
}

/** Erro de validação de prompt — carrega os detalhes para a resposta 400. */
export class PromptInvalidoError extends Error {
  constructor(
    public tipo: PromptTipo,
    public validacao: ValidacaoPrompt,
  ) {
    super(`Prompt de ${tipo} inválido`);
    this.name = "PromptInvalidoError";
  }
}

export interface PromptConfigItem {
  /** Texto efetivo (customizado quando houver; senão o padrão). */
  texto: string;
  /** Prompt padrão de código (para a tela poder mostrar/restaurar). */
  padrao: string;
  /** true quando há um texto customizado salvo. */
  personalizado: boolean;
  /** Tokens obrigatórios deste prompt. */
  tokens: string[];
}

export interface DocumentoPromptConfig {
  contrato: PromptConfigItem;
  termo: PromptConfigItem;
  refino: PromptConfigItem;
}

/** Entrada do salvar: `null` = restaurar padrão; `undefined` = não mexer. */
export interface SalvarPromptConfig {
  contrato?: string | null;
  termo?: string | null;
  refino?: string | null;
}

export interface DocumentoPromptConfigRepository {
  obter(): Promise<DocumentoPromptConfig>;
  /** Texto efetivo de um único prompt (usado na geração). */
  obterTexto(tipo: PromptTipo): Promise<string>;
  salvar(input: SalvarPromptConfig): Promise<DocumentoPromptConfig>;
}

function item(tipo: PromptTipo, salvo: string | null): PromptConfigItem {
  return {
    texto: salvo ?? PADROES[tipo],
    padrao: PADROES[tipo],
    personalizado: salvo != null,
    tokens: [...TOKENS[tipo]],
  };
}

class DrizzleDocumentoPromptConfigRepository
  implements DocumentoPromptConfigRepository
{
  private async linha() {
    const [row] = await db
      .select()
      .from(configDocumentoPromptTable)
      .where(eq(configDocumentoPromptTable.id, SINGLETON_ID));
    return row;
  }

  async obter(): Promise<DocumentoPromptConfig> {
    const row = await this.linha();
    return {
      contrato: item("contrato", row?.contratoPrompt ?? null),
      termo: item("termo", row?.termoPrompt ?? null),
      refino: item("refino", row?.refinoPrompt ?? null),
    };
  }

  async obterTexto(tipo: PromptTipo): Promise<string> {
    const row = await this.linha();
    const salvo =
      tipo === "contrato"
        ? row?.contratoPrompt
        : tipo === "termo"
          ? row?.termoPrompt
          : row?.refinoPrompt;
    return salvo ?? PADROES[tipo];
  }

  async salvar(input: SalvarPromptConfig): Promise<DocumentoPromptConfig> {
    // Normaliza cada campo: undefined = manter o que está; null = restaurar
    // padrão (grava null); string = customizar (valida antes).
    const patch: {
      contratoPrompt?: string | null;
      termoPrompt?: string | null;
      refinoPrompt?: string | null;
    } = {};

    const campos: Array<[PromptTipo, keyof typeof patch, string | null | undefined]> =
      [
        ["contrato", "contratoPrompt", input.contrato],
        ["termo", "termoPrompt", input.termo],
        ["refino", "refinoPrompt", input.refino],
      ];

    for (const [tipo, coluna, valor] of campos) {
      if (valor === undefined) continue;
      if (valor === null) {
        patch[coluna] = null;
        continue;
      }
      const validacao = validarPrompt(tipo, valor);
      if (!validacao.ok) throw new PromptInvalidoError(tipo, validacao);
      patch[coluna] = valor.trim();
    }

    if (Object.keys(patch).length > 0) {
      await db
        .insert(configDocumentoPromptTable)
        .values({ id: SINGLETON_ID, ...patch })
        .onConflictDoUpdate({
          target: configDocumentoPromptTable.id,
          set: { ...patch, updatedAt: new Date() },
        });
    }

    return this.obter();
  }
}

export const documentoPromptConfigRepo: DocumentoPromptConfigRepository =
  new DrizzleDocumentoPromptConfigRepository();
