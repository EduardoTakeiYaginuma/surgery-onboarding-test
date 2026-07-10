/**
 * Import idempotente dos médicos do lumexa-core para a tabela `medicos` local.
 *
 * Única automação de cadastro nesta fase: puxamos apenas o essencial (nome e se
 * está ativo). CRM/RQE/clínica só são preenchidos quando o core os expõe em
 * `custom_attributes` — assim um preenchimento manual local não é apagado por
 * uma reimportação. A ligação é pelo `coreDoctorId` (não pelo nome, que pode
 * repetir).
 */

import { listarMedicosCore, type CoreDoctor } from "./lumexa-core";
import { medicosRepo } from "./medicos-repo";

export interface ResultadoImportMedicos {
  total: number;
  criados: number;
  atualizados: number;
}

/** Extrai uma string de `custom_attributes[chave]`, ou undefined se ausente. */
function attrTexto(
  attrs: Record<string, unknown> | null,
  chave: string,
): string | undefined {
  const v = attrs?.[chave];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return undefined;
}

/** Nome de exibição do médico a partir do first/last name do core. */
function montarNome(doc: CoreDoctor): string {
  const nome = [doc.first_name, doc.last_name]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return nome || doc.first_name || "Médico sem nome";
}

export async function importarMedicosDoCore(): Promise<ResultadoImportMedicos> {
  const medicosCore = await listarMedicosCore();

  let criados = 0;
  let atualizados = 0;

  for (const doc of medicosCore) {
    // nome e status vêm sempre; CRM/RQE/clínica só quando o core os fornece
    // (não sobrescreve edição manual local com vazio).
    const dados: Parameters<typeof medicosRepo.upsertPorCoreId>[1] = {
      nome: montarNome(doc),
      ativo: doc.is_active,
    };
    const crm = attrTexto(doc.custom_attributes, "crm");
    const rqe = attrTexto(doc.custom_attributes, "rqe");
    const clinica = attrTexto(doc.custom_attributes, "clinica");
    if (crm !== undefined) dados.crm = crm;
    if (rqe !== undefined) dados.rqe = rqe;
    if (clinica !== undefined) dados.clinica = clinica;

    const { criado } = await medicosRepo.upsertPorCoreId(doc.id, dados);
    if (criado) criados++;
    else atualizados++;
  }

  return { total: medicosCore.length, criados, atualizados };
}
