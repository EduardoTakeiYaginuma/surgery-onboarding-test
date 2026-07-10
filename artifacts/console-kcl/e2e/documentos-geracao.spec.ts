import { test, expect } from "@playwright/test";

import {
  arquivarPaciente,
  criarPacienteTeste,
  garantirModeloBaseContratoVigente,
  type CreatedPaciente,
  type ModeloBaseVigente,
} from "./api";

/**
 * Smoke guard for the standalone document-generation area (/documentos):
 * choosing a patient, satisfying the contract readiness gate and clicking
 * "Gerar rascunho" must produce an editable draft.
 *
 * The contrato flow was redesigned: generation no longer offers a model picker —
 * it auto-resolves the single vigente modelo-base ("Todos os procedimentos") via
 * POST /pacientes/:id/contratos/gerar with body `{ tipo }` (no modeloId). So the
 * only deterministic precondition is that the base model is vigente, which
 * `garantirModeloBaseContratoVigente()` guarantees (and restores afterwards) so
 * the test never depends on the activation state of the shared development DB.
 *
 * A fresh patient created via the API is "ready" by default (procedimentos, a
 * default doctor snapshot, a paid deposit and a surgery date), so the readiness
 * checklist clears and the "Gerar rascunho" button enables on its own.
 */

let paciente: CreatedPaciente;
let modeloBase: ModeloBaseVigente;

test.beforeAll(async () => {
  modeloBase = await garantirModeloBaseContratoVigente();
});

test.afterAll(async () => {
  if (modeloBase) await modeloBase.restaurar();
});

test.afterEach(async () => {
  if (paciente) await arquivarPaciente(paciente.id);
});

test("generates a draft in the documents area", async ({ page }) => {
  paciente = await criarPacienteTeste();

  // Onboarding modal only guards "/"; init script kept as a harmless safety net.
  await page.addInitScript(() =>
    localStorage.setItem("kcl-console-guia-visto", "1"),
  );
  // Patient + type preselected via the query string so GeradorDocumento renders
  // directly (no model picker exists in the redesigned flow).
  await page.goto(`/documentos?paciente=${paciente.id}&tipo=contrato`);

  // Satisfy the readiness gate: a ready patient clears the checklist, so the
  // generate button enables once the contract sheet finishes loading.
  const gerar = page.getByRole("button", { name: "Gerar rascunho" });
  await expect(gerar).toBeEnabled({ timeout: 20000 });
  await gerar.click();

  // The generated draft renders in the editor and is listed under "Contratos
  // gerados" — proof the end-to-end generation action works from the new area.
  const editor = page.locator(".editor-doc").first();
  await expect(editor).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("heading", { name: "Contratos gerados" }),
  ).toBeVisible();
});
