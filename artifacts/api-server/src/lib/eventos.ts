import { timelineRepo } from "./timeline-repo";
import type { TimelineEvento } from "@workspace/db";

/**
 * Marcos automáticos da timeline. Centraliza os títulos para que todos os
 * registros automáticos fiquem consistentes em qualquer rota.
 */
const MARCOS = {
  criado: "Processo criado",
  enviado: "Handoff aprovado e enviado",
  vespera: "Entrou no estágio Véspera",
  cirurgia: "Dia da cirurgia",
  arquivado: "Processo arquivado",
  restaurado: "Processo restaurado",
  contrato_assinado: "Contrato assinado",
  contrato_recusado: "Contrato recusado",
  termo_assinado: "Termo de consentimento assinado",
  termo_recusado: "Termo de consentimento recusado",
  retirada_pontos: "Retirada de pontos",
  retorno_1: "1º retorno",
  retorno_2: "2º retorno",
  retorno_3: "3º retorno",
} as const;

export type TipoMarco = keyof typeof MARCOS;

/** Registra um marco automático na timeline do processo. */
export function registrarMarco(
  pacienteId: number,
  tipo: TipoMarco,
  descricao?: string,
): Promise<TimelineEvento> {
  return timelineRepo.criar({
    pacienteId,
    tipo,
    titulo: MARCOS[tipo],
    descricao: descricao ?? null,
    automatico: true,
  });
}

/**
 * Registra um marco MANUAL (pós-operatório) na timeline, guardando o autor que
 * marcou (a equipe). Diferente de registrarMarco, fica como não-automático.
 */
export function registrarMarcoManual(
  pacienteId: number,
  tipo: TipoMarco,
  autor: string | null,
): Promise<TimelineEvento> {
  return timelineRepo.criar({
    pacienteId,
    tipo,
    titulo: MARCOS[tipo],
    autor: autor ?? null,
    automatico: false,
  });
}

/** Mapeia uma transição de estágio para o marco correspondente, se houver. */
export function marcoDoEstagio(estagio: string): TipoMarco | null {
  switch (estagio) {
    case "Enviado":
      return "enviado";
    case "Véspera":
      return "vespera";
    case "Cirurgia":
      return "cirurgia";
    default:
      return null;
  }
}
