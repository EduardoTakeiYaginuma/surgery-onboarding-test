/**
 * Fallback AO VIVO do snapshot da médica no documento (contrato/termo).
 *
 * Os campos `medica/crm/rqe/clinica` da paciente são um SNAPSHOT gravado no
 * momento do cadastro (ver `routes/pacientes.ts`). Se a médica ainda não tinha
 * CRM/RQE preenchidos naquele instante, o snapshot ficou vazio e o documento
 * sairia sem esses dados — mesmo que a médica já tenha o RQE hoje.
 *
 * Aqui buscamos o cadastro ATUAL da médica vinculada (`medicoId`) apenas para
 * PREENCHER O QUE ESTÁ VAZIO. Regras:
 *  - nunca sobrescreve um valor de snapshot já preenchido (preserva a auditoria);
 *  - não grava nada no banco (fallback só em memória, na hora de gerar);
 *  - sem `medicoId`, com todos os campos já preenchidos, ou médica não
 *    encontrada, devolve a paciente intacta (uma ida ao banco a menos).
 */

import type { Paciente } from "@workspace/db";
import { medicosRepo } from "./medicos-repo";

function vazio(v: string | null | undefined): boolean {
  return !v || !v.trim();
}

/** Paciente com o snapshot da médica completado a partir do cadastro vigente. */
export async function comSnapshotMedicoEfetivo(p: Paciente): Promise<Paciente> {
  const faltaAlgum =
    vazio(p.medica) || vazio(p.crm) || vazio(p.rqe) || vazio(p.clinica);
  if (p.medicoId == null || !faltaAlgum) return p;

  const medico = await medicosRepo.obterPorId(p.medicoId);
  if (!medico) return p;

  return {
    ...p,
    medica: vazio(p.medica) ? medico.nome : p.medica,
    crm: vazio(p.crm) ? medico.crm : p.crm,
    rqe: vazio(p.rqe) ? medico.rqe : p.rqe,
    clinica: vazio(p.clinica) ? medico.clinica : p.clinica,
  };
}
