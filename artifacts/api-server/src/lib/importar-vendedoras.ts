/**
 * Import idempotente das vendedoras (salesreps) do lumexa-core para a tabela
 * `vendedoras` local. Espelha o import de médicos: puxamos só o essencial (nome
 * e se está ativa), ligando pela origem estável `coreSalesrepId` — nunca pelo
 * nome, que pode repetir.
 */

import { listarVendedorasCore, type CoreSalesrep } from "./lumexa-core";
import { vendedorasRepo } from "./vendedoras-repo";

export interface ResultadoImportVendedoras {
  total: number;
  criados: number;
  atualizados: number;
}

/** Nome de exibição a partir do first/last name do core. */
function montarNome(sr: CoreSalesrep): string {
  const nome = [sr.first_name, sr.last_name]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return nome || sr.first_name || "Vendedora sem nome";
}

export async function importarVendedorasDoCore(): Promise<ResultadoImportVendedoras> {
  const vendedorasCore = await listarVendedorasCore();

  let criados = 0;
  let atualizados = 0;

  for (const sr of vendedorasCore) {
    const { criado } = await vendedorasRepo.upsertPorCoreId(sr.id, {
      nome: montarNome(sr),
      ativo: sr.is_active,
    });
    if (criado) criados++;
    else atualizados++;
  }

  return { total: vendedorasCore.length, criados, atualizados };
}
