import { eq } from "drizzle-orm";
import { db, configContratoTable } from "@workspace/db";
import { VENCIMENTO_SALDO_DIAS_UTEIS_ANTES } from "./protocolo";

const SINGLETON_ID = 1;
// Prazo legal do termo/contrato: assinado no mínimo 24h antes da cirurgia.
// No modelo de datas do sistema (yyyy-mm-dd, sem hora), 24h antes = D-1 (dia
// anterior à cirurgia) → 1 dia. Configurável por clínica na tela /notificacoes.
const PRAZO_PADRAO_DIAS = 1;
const VENCIMENTO_PADRAO_DIAS = VENCIMENTO_SALDO_DIAS_UTEIS_ANTES;

/**
 * Limites do prazo (em dias) para os dois campos de configuração. O servidor é a
 * fonte da verdade desta regra — a tela /notificacoes do Console mostra o mesmo
 * 0..60 inteiro, mas a validação não pode viver só na tela: qualquer cliente que
 * chame a API direto precisa esbarrar no mesmo teto.
 */
export const PRAZO_DIAS_MIN = 0;
export const PRAZO_DIAS_MAX = 60;

/** Espelha o guarda da tela: inteiro entre 0 e 60 (inclusive). */
export function diasNoIntervalo(valor: number): boolean {
  return (
    Number.isInteger(valor) && valor >= PRAZO_DIAS_MIN && valor <= PRAZO_DIAS_MAX
  );
}

function clampDias(valor: number): number {
  return Math.min(PRAZO_DIAS_MAX, Math.max(PRAZO_DIAS_MIN, Math.round(valor)));
}

/**
 * Configuração operacional da clínica (singleton, id = 1). Quando nada foi salvo
 * ainda, devolve os padrões (assinatura 1 dia / ≈24h antes; saldo 2 dias úteis).
 *
 * - `prazoAssinaturaDiasAntes`: dias antes da cirurgia para o contrato estar assinado.
 * - `vencimentoSaldoDiasUteisAntes`: dias úteis antes da cirurgia para o saldo vencer.
 */
export interface ConfigContrato {
  prazoAssinaturaDiasAntes: number;
  vencimentoSaldoDiasUteisAntes: number;
}

export interface ContratoConfigRepository {
  obter(): Promise<ConfigContrato>;
  salvar(config: ConfigContrato): Promise<ConfigContrato>;
}

class DrizzleContratoConfigRepository implements ContratoConfigRepository {
  async obter(): Promise<ConfigContrato> {
    const [row] = await db
      .select()
      .from(configContratoTable)
      .where(eq(configContratoTable.id, SINGLETON_ID));
    return {
      prazoAssinaturaDiasAntes:
        row?.prazoAssinaturaDiasAntes ?? PRAZO_PADRAO_DIAS,
      vencimentoSaldoDiasUteisAntes:
        row?.vencimentoSaldoDiasUteisAntes ?? VENCIMENTO_PADRAO_DIAS,
    };
  }

  async salvar(config: ConfigContrato): Promise<ConfigContrato> {
    const prazo = clampDias(config.prazoAssinaturaDiasAntes);
    const vencimento = clampDias(config.vencimentoSaldoDiasUteisAntes);
    const [row] = await db
      .insert(configContratoTable)
      .values({
        id: SINGLETON_ID,
        prazoAssinaturaDiasAntes: prazo,
        vencimentoSaldoDiasUteisAntes: vencimento,
      })
      .onConflictDoUpdate({
        target: configContratoTable.id,
        set: {
          prazoAssinaturaDiasAntes: prazo,
          vencimentoSaldoDiasUteisAntes: vencimento,
          updatedAt: new Date(),
        },
      })
      .returning();
    return {
      prazoAssinaturaDiasAntes: row.prazoAssinaturaDiasAntes,
      vencimentoSaldoDiasUteisAntes: row.vencimentoSaldoDiasUteisAntes,
    };
  }
}

export const contratoConfigRepo: ContratoConfigRepository =
  new DrizzleContratoConfigRepository();
