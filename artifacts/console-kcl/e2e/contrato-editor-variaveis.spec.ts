import { test, expect } from "@playwright/test";

import {
  arquivarPaciente,
  criarModeloContrato,
  criarPacienteTeste,
  gerarRascunhoContratoPaciente,
  removerModeloContrato,
  type CreatedPaciente,
} from "./api";

/**
 * Regression guard for the /documentos area WYSIWYG editor (gerador-contrato.tsx):
 *
 *  1. The "Inserir variável" control must be available in the generation-area
 *     editor (not only the templates page) — so the secretary can drop a
 *     `{{variável}}` into an already-generated draft.
 *  2. A generated draft comes back with its variables already substituted, so a
 *     `{{token}}` inserted afterwards would otherwise reach the PDF/Autentique
 *     literally. Saving must re-resolve it with the patient's data (handled by
 *     the PUT /contratos/:id backend). After saving, the inserted `{{nome}}`
 *     must be replaced by the patient's actual name and the literal token gone.
 *
 * The draft is generated via the API (deterministic, no dependency on factory
 * seeds) from a model whose body contains NO variables, so the only way the
 * patient's name can appear in the saved body is through the toolbar insertion +
 * save-time resolution under test.
 */

let paciente: CreatedPaciente;
let modeloId: number;

test.beforeAll(async () => {
  modeloId = await criarModeloContrato({
    tipo: "contrato",
    titulo: "Contrato E2E variáveis",
    // Sem variáveis: o nome da paciente só pode entrar via inserção + save.
    corpo: "<p>Objeto: prestação de serviços médicos.</p>",
    vigente: true,
  });
});

test.afterAll(async () => {
  if (modeloId) await removerModeloContrato(modeloId);
});

test.afterEach(async () => {
  if (paciente) await arquivarPaciente(paciente.id);
});

test("documents-area editor inserts a variable and resolves it on save", async ({
  page,
}) => {
  paciente = await criarPacienteTeste();
  await gerarRascunhoContratoPaciente(paciente.id);

  // Generation now lives in the dedicated /documentos area. With a patient + type
  // preselected via the query string, GeradorDocumento renders directly and
  // auto-selects the just-generated draft. The onboarding modal only guards "/",
  // so going straight to /documentos avoids it (init script kept as a harmless
  // safety net if navigation ever bounces through home).
  await page.addInitScript(() =>
    localStorage.setItem("kcl-console-guia-visto", "1"),
  );
  await page.goto(`/documentos?paciente=${paciente.id}&tipo=contrato`);

  const editor = page.locator(".editor-doc").first();
  await expect(editor).toBeVisible({ timeout: 20000 });

  // Sanity: the generated draft has no variable yet (model had none).
  await expect(editor).not.toContainText("{{nome}}");

  // (1) The variable-insert control is present in the PATIENT editor.
  const inserirVariavel = page.getByRole("button", {
    name: "Inserir variável",
  });
  await expect(inserirVariavel).toBeVisible();
  await inserirVariavel.click();

  // The variable picker is a searchable Popover+Command, so entries are options
  // (role="option"), not menu items. Pick {{nome}} (anchored so it cannot match
  // {{primeiroNome}} / {{nomeCompleto}}).
  await page
    .getByRole("option")
    .filter({ hasText: /^\{\{nome\}\}/ })
    .click();

  // The literal token now sits in the editor body.
  await expect(editor).toContainText("{{nome}}");

  // (2) Save — the backend must re-resolve the inserted token.
  await page.getByRole("button", { name: "Salvar edições" }).click();

  // After save the editor remounts with the resolved body: the patient's name
  // appears and the literal token is gone.
  await expect(editor).toContainText(paciente.nome, { timeout: 20000 });
  await expect(editor).not.toContainText("{{nome}}");
});
