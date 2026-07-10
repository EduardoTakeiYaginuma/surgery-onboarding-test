/**
 * Apoio de UI para a jornada interna da equipe (9 marcos) no app móvel,
 * espelhando `artifacts/console-kcl/src/lib/jornada-equipe.ts`. A ORDEM, os
 * RÓTULOS e quais marcos são manuais vêm SEMPRE do servidor (GET /config →
 * jornadaEquipe e GET /pacientes/resumo → porMarco). Aqui ficam só a paleta do
 * badge por fase e o vínculo de cada chave manual ao seu carimbo de tempo.
 *
 * NÃO tem relação com a "Sua jornada" da página pública da paciente.
 */
import type {
  MarcoManualEntradaMarco,
  Paciente,
} from "@workspace/api-client-react";

import type { useColors } from "@/hooks/useColors";

type Colors = ReturnType<typeof useColors>;

/** Rótulo do baseline (nenhum marco atingido ainda). */
export const AGUARDANDO_CONTRATO_ROTULO = "Aguardando contrato";

/** Chaves dos marcos pós-operatórios (registrados manualmente pela equipe). */
export const MARCOS_MANUAIS = [
  "retirada_pontos",
  "retorno_1",
  "retorno_2",
  "retorno_3",
] as const satisfies readonly MarcoManualEntradaMarco[];

export function ehMarcoManual(chave: string): chave is MarcoManualEntradaMarco {
  return (MARCOS_MANUAIS as readonly string[]).includes(chave);
}

/** Rótulo do marco atual, com fallback para o baseline. */
export function rotuloDoMarco(rotulo: string | null | undefined): string {
  return rotulo ?? AGUARDANDO_CONTRATO_ROTULO;
}

/** Paleta do badge conforme a fase do marco atual (claro/escuro via colors). */
export function paletaDoMarco(
  chave: string | null | undefined,
  colors: Colors,
): { bg: string; fg: string; border: string } {
  switch (chave) {
    case "contrato_pagamento":
    case "link_enviado":
    case "termo_assinado":
      return { bg: colors.card, fg: colors.primary, border: "rgba(201,169,110,0.3)" };
    case "menos_48h_cirurgia":
      return { bg: "rgba(201,169,110,0.2)", fg: colors.primary, border: "rgba(201,169,110,0.5)" };
    case "cirurgia":
      return { bg: colors.ivory, fg: colors.background, border: colors.ivory };
    case "retirada_pontos":
    case "retorno_1":
    case "retorno_2":
    case "retorno_3":
      return { bg: colors.card, fg: colors.foreground, border: "rgba(201,169,110,0.4)" };
    default:
      // baseline "Aguardando contrato"
      return { bg: colors.muted, fg: colors.mutedForeground, border: colors.borderStrong };
  }
}

/**
 * Carimbo de tempo de um marco pós-operatório manual no DTO da paciente. A
 * ordem e os rótulos vêm do servidor; aqui só sabemos QUAL campo guarda a data.
 */
export function carimboDoMarco(
  paciente: Paciente,
  chave: MarcoManualEntradaMarco,
): string | null {
  switch (chave) {
    case "retirada_pontos":
      return paciente.retiradaPontosEm;
    case "retorno_1":
      return paciente.retorno1Em;
    case "retorno_2":
      return paciente.retorno2Em;
    case "retorno_3":
      return paciente.retorno3Em;
    default:
      return null;
  }
}
