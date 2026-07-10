import { test, expect, type Page } from "@playwright/test";

import {
  arquivarPaciente,
  criarModeloContrato,
  criarPacienteTeste,
  removerModeloContrato,
  type CreatedPaciente,
} from "./api";

/**
 * Regression guard for the dedicated document-generation area (`/documentos`)
 * and the patient page's now-slimmed Contrato/Termo tabs.
 *
 * Generation (model → IA → approval → Autentique) lives on `/documentos`. The
 * CONTRATO tab is now an INLINE-EDITABLE workspace: the vendedora adjusts
 * payment / procedimentos / médica-clínica there (saved via PATCH
 * /pacientes/:id) and a readiness checklist gates "Gerar rascunho". The TERMO
 * (TCLE) tab stays READ-ONLY (the team edits on the patient page).
 *
 * This spec asserts the split + the editable contrato flow WITHOUT ever
 * clicking "Gerar rascunho" (that fires a real AI call).
 *
 * The model <Select> + "Gerar rascunho" button only render when at least one
 * VIGENTE model-base exists for the type; `beforeAll` seeds one per type and
 * removes them afterwards so the assertions are deterministic.
 */

// Ficha header per type: the contrato is editable ("Dados do contrato"); the
// termo keeps the read-only conference ficha ("Confira antes de gerar").
const HEADING_CONTRATO = "Dados do contrato";
const HEADING_TERMO = "Confira antes de gerar";
const HEADING_PRONTIDAO = "Pronto para gerar?";
const PLACEHOLDER_MODELO = "Selecione o modelo-base";
const BOTAO_GERAR_RASCUNHO = "Gerar rascunho";
const BOTAO_SALVAR = "Salvar dados do contrato";
const BOTAO_QUITADO = "Marcar como quitado";
const AVISO_NAO_SALVAS = "Você tem alterações não salvas";
const TOAST_SALVO = "Dados do contrato salvos";

// The server-resolved summary ("O que vai no contrato") renders each resolved
// field as a <dt> label + sibling <dd> value — the SAME source the generated PDF
// is built from. Some summary labels (e.g. "Vencimento do saldo") are ALSO form
// labels in the editable ficha, so we first scope to the summary section (the
// innermost div carrying its heading) and only then match the <dt> + its sibling
// <dd>, guaranteeing we read the resolved summary and never the editable inputs.
const HEADING_RESUMO = "O que vai no contrato";

const resumoSecao = (page: Page) =>
  page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: HEADING_RESUMO }) })
    .last();

const resumoValor = (page: Page, rotulo: string) =>
  resumoSecao(page)
    .getByText(rotulo, { exact: true })
    .locator("xpath=following-sibling::dd");

// "Dados do contrato" is a substring of the "Salvar dados do contrato" button,
// so the contrato heading must be matched by role (heading), not by text.
const headingContrato = (page: Page) =>
  page.getByRole("heading", { name: HEADING_CONTRATO });

const esperarHeadingFicha = (page: Page, tipo: "contrato" | "termo") =>
  tipo === "contrato"
    ? expect(headingContrato(page)).toBeVisible()
    : expect(page.getByText(HEADING_TERMO)).toBeVisible();

let paciente: CreatedPaciente;
let modeloContratoId: number;
let modeloTermoId: number;

test.beforeAll(async () => {
  // Seed one vigente model per type so the generator renders its <Select> +
  // "Gerar rascunho" button instead of the "Nenhum modelo-base vigente" state.
  [modeloContratoId, modeloTermoId] = await Promise.all([
    criarModeloContrato({
      tipo: "contrato",
      titulo: "Modelo Contrato E2E",
      corpo: "<p>Corpo de teste do contrato.</p>",
    }),
    criarModeloContrato({
      tipo: "termo",
      titulo: "Modelo Termo E2E",
      corpo: "<p>Corpo de teste do termo.</p>",
    }),
  ]);
});

test.afterAll(async () => {
  await Promise.all([
    removerModeloContrato(modeloContratoId),
    removerModeloContrato(modeloTermoId),
  ]);
});

test.beforeEach(async ({ page }) => {
  paciente = await criarPacienteTeste();
  // Suppress the first-visit onboarding modal (suite convention).
  await page.addInitScript(() =>
    localStorage.setItem("kcl-console-guia-visto", "1"),
  );
});

test.afterEach(async () => {
  if (paciente) await arquivarPaciente(paciente.id);
});

/** Opens /documentos already pointing at the patient + contrato tab. */
async function abrirContrato(page: Page, pacienteId: number) {
  await page.goto(`/documentos?paciente=${pacienteId}&tipo=contrato`);
  // Wait for the editable ficha to finish loading (skeleton → form).
  await expect(headingContrato(page)).toBeVisible();
  await expect(page.getByRole("button", { name: BOTAO_SALVAR })).toBeVisible();
}

/** Selects the seeded vigente contrato model so the generate button can enable. */
async function selecionarModeloContrato(page: Page) {
  await page.getByText(PLACEHOLDER_MODELO).click();
  // `.first()` tolerates a leaked duplicate seed if a prior run was interrupted
  // before its afterAll cleanup ran.
  await page
    .getByRole("option", { name: /Modelo Contrato E2E/ })
    .first()
    .click();
}

test("the /documentos area selects a patient and mounts the generator for both Contrato and Termo", async ({
  page,
}) => {
  await page.goto("/documentos");

  // Pick the patient via the search box → list-row button.
  await page.getByPlaceholder("Buscar por nome").fill(paciente.nome);
  await page
    .getByRole("button")
    .filter({ hasText: paciente.nome })
    .first()
    .click();

  // Patient bar confirms the selection landed.
  await expect(
    page.getByText(paciente.nome, { exact: false }).first(),
  ).toBeVisible();

  // ---- CONTRATO (default tab) — now the editable workspace ----
  await expect(headingContrato(page)).toBeVisible();
  await expect(page.getByText(HEADING_PRONTIDAO)).toBeVisible();
  await expect(page.getByRole("button", { name: BOTAO_SALVAR })).toBeVisible();
  await expect(page.getByText(PLACEHOLDER_MODELO)).toBeVisible();
  await expect(
    page.getByRole("button", { name: BOTAO_GERAR_RASCUNHO }),
  ).toBeVisible();

  // ---- TERMO (TCLE) — stays read-only ----
  await page.getByRole("tab", { name: "Termo (TCLE)" }).click();
  await expect(page.getByText(HEADING_TERMO)).toBeVisible();
  // The termo must NOT expose the editable save button.
  await expect(
    page.getByRole("button", { name: BOTAO_SALVAR }),
  ).toHaveCount(0);
  await expect(page.getByText(PLACEHOLDER_MODELO)).toBeVisible();
  await expect(
    page.getByRole("button", { name: BOTAO_GERAR_RASCUNHO }),
  ).toBeVisible();

  // Never click "Gerar rascunho" — it triggers a real AI generation call.
});

test("the patient page Contrato/Termo tabs show the moved-note + deep-link + status card and NO generator", async ({
  page,
}) => {
  await page.goto(`/paciente/${paciente.id}`);

  // Tabs are a split-view; inactive tabs unmount, so we click before asserting.

  // ---- CONTRATO tab ----
  await page.getByRole("tab", { name: "Contrato", exact: true }).click();

  await expect(
    page.getByText("A geração de contratos foi movida", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Gerar contrato" }),
  ).toBeVisible();
  await expect(
    page.getByText("Status do contrato (Autentique)"),
  ).toBeVisible();

  // The generator must NOT be present on the patient page.
  await expect(headingContrato(page)).toHaveCount(0);
  await expect(page.getByText(HEADING_TERMO)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: BOTAO_GERAR_RASCUNHO }),
  ).toHaveCount(0);

  // ---- TERMO tab ----
  await page.getByRole("tab", { name: "Termo", exact: true }).click();

  await expect(
    page.getByText("A geração do termo foi movida", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Gerar termo" })).toBeVisible();
  await expect(
    page.getByText("Termo de Consentimento (TCLE)"),
  ).toBeVisible();

  await expect(headingContrato(page)).toHaveCount(0);
  await expect(page.getByText(HEADING_TERMO)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: BOTAO_GERAR_RASCUNHO }),
  ).toHaveCount(0);
});

/**
 * The deep-link buttons must actually carry the patient + document type across
 * to `/documentos`. Asserting they merely *exist* (above) would miss a
 * regression where the query string is wrong (wrong patient, wrong type) or
 * `lerPreselecao` stops reading it. So here we click each button and assert the
 * generator opens with that exact patient pre-selected and the matching type
 * tab active — never touching "Gerar rascunho" (it fires a real AI call).
 */
for (const tipo of ["contrato", "termo"] as const) {
  // Tab label on the patient page (split-view) vs. on /documentos.
  const tabPaciente = tipo === "contrato" ? "Contrato" : "Termo";
  const tabDocumentos = tipo === "contrato" ? "Contrato" : "Termo (TCLE)";
  const botao = tipo === "contrato" ? "Gerar contrato" : "Gerar termo";

  test(`the "${botao}" button on /paciente/:id opens /documentos with that patient pre-selected and the ${tipo} type active`, async ({
    page,
  }) => {
    await page.goto(`/paciente/${paciente.id}`);

    // Inactive split-view tabs unmount, so reveal the section before clicking.
    await page
      .getByRole("tab", { name: tabPaciente, exact: true })
      .click();
    await page.getByRole("button", { name: botao }).click();

    // Landed on /documentos carrying the exact patient id + document type.
    await expect(page).toHaveURL(
      new RegExp(`/documentos\\?paciente=${paciente.id}&tipo=${tipo}(?:&|$)`),
    );

    // The patient bar (with "Trocar paciente") confirms the preset selection
    // landed — i.e. lerPreselecao read the id, not the search list.
    await expect(
      page.getByRole("button", { name: "Trocar paciente" }),
    ).toBeVisible();
    await expect(
      page.getByText(paciente.nome, { exact: false }).first(),
    ).toBeVisible();

    // The correct document-type tab is active and its ficha rendered.
    await expect(
      page.getByRole("tab", { name: tabDocumentos, exact: true }),
    ).toHaveAttribute("data-state", "active");
    await esperarHeadingFicha(page, tipo);
    await expect(
      page.getByRole("button", { name: BOTAO_GERAR_RASCUNHO }),
    ).toBeVisible();

    // Never click "Gerar rascunho" — it triggers a real AI generation call.
  });
}

test("a complete, saved contrato ficha unlocks generation once a model is picked", async ({
  page,
}) => {
  // The default test patient is already complete (médico padrão, procedimento,
  // valor pago, data da cirurgia) and fully paid → "Pago".
  await abrirContrato(page, paciente.id);

  await expect(page.getByText("Pago", { exact: true })).toBeVisible();

  // Before a model is picked, the button stays disabled (model is required).
  await expect(
    page.getByRole("button", { name: BOTAO_GERAR_RASCUNHO }),
  ).toBeDisabled();

  await selecionarModeloContrato(page);

  // Ready ficha + model selected → generation is unlocked. NEVER click it.
  await expect(
    page.getByRole("button", { name: BOTAO_GERAR_RASCUNHO }),
  ).toBeEnabled();
});

test("the vendedora marks the balance as paid inline and re-unlocks generation after saving", async ({
  page,
}) => {
  // Swap the default (paid) patient for one with an open balance + due date.
  await arquivarPaciente(paciente.id);
  paciente = await criarPacienteTeste({
    valorPendente: 2000,
    dataPagamentoPendente: "2026-08-01",
  });

  await abrirContrato(page, paciente.id);

  // Open balance shows the "Pendente" badge — but a pending balance WITH a due
  // date is allowed, so with a model picked generation is already unlocked.
  await expect(page.getByText("Pendente", { exact: true })).toBeVisible();
  await selecionarModeloContrato(page);
  await expect(
    page.getByRole("button", { name: BOTAO_GERAR_RASCUNHO }),
  ).toBeEnabled();

  // Mark as paid: balance folds into "valor pago", badge flips to "Pago", and
  // the now-unsaved edits BLOCK generation until the vendedora saves.
  await page.getByRole("button", { name: BOTAO_QUITADO }).click();
  await expect(page.getByText("Pago", { exact: true })).toBeVisible();
  await expect(page.getByText(AVISO_NAO_SALVAS)).toBeVisible();
  await expect(
    page.getByRole("button", { name: BOTAO_GERAR_RASCUNHO }),
  ).toBeDisabled();

  // Save (PATCH /pacientes/:id) → unsaved warning clears and generation unlocks
  // again (the server-resolved summary below also refreshes).
  await page.getByRole("button", { name: BOTAO_SALVAR }).click();
  await expect(page.getByText("Dados do contrato salvos")).toBeVisible();
  await expect(page.getByText(AVISO_NAO_SALVAS)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: BOTAO_GERAR_RASCUNHO }),
  ).toBeEnabled();
});

test("a pending patient whose due date the server auto-filled loads clean and generation-ready", async ({
  page,
}) => {
  // Swap for a pending patient created WITHOUT an explicit due date. The API
  // auto-computes (and persists) the vencimento on create, so the ficha loads
  // with the server's date — the PDF source of truth — not a local, unsaved
  // suggestion. Readiness must therefore reflect PERSISTED state: clean + ready.
  await arquivarPaciente(paciente.id);
  paciente = await criarPacienteTeste({ valorPendente: 2000 });

  await abrirContrato(page, paciente.id);

  await expect(page.getByText("Pendente", { exact: true })).toBeVisible();
  // No unsaved edits: the vencimento came from the server, not a dirty local fill.
  await expect(page.getByText(AVISO_NAO_SALVAS)).toHaveCount(0);

  await selecionarModeloContrato(page);
  await expect(
    page.getByRole("button", { name: BOTAO_GERAR_RASCUNHO }),
  ).toBeEnabled();
});

test("removing every procedimento blocks generation with a guard hint", async ({
  page,
}) => {
  await abrirContrato(page, paciente.id);

  // A complete patient + model would normally unlock generation...
  await selecionarModeloContrato(page);
  await expect(
    page.getByRole("button", { name: BOTAO_GERAR_RASCUNHO }),
  ).toBeEnabled();

  // ...but removing the only procedimento makes the ficha incomplete (and
  // unsaved), so the readiness guard re-blocks "Gerar rascunho".
  await page.getByRole("button", { name: "Remover Blefaroplastia" }).click();
  await expect(
    page.getByRole("button", { name: BOTAO_GERAR_RASCUNHO }),
  ).toBeDisabled();
  await expect(
    page.getByText("Conclua e salve a ficha do contrato", { exact: false }),
  ).toBeVisible();
});

test("saving a new procedimento makes it appear in the server-resolved summary", async ({
  page,
}) => {
  await abrirContrato(page, paciente.id);

  // A unique name so the assertion can't accidentally pass on leftover state.
  const novoProcedimento = `Rinoplastia E2E ${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  // Baseline: the resolved summary (PDF source of truth) shows only the seeded
  // procedimento and does NOT yet contain the new one.
  const procedimentoResumo = resumoValor(page, "Procedimento(s)");
  await expect(procedimentoResumo).toContainText("Blefaroplastia");
  await expect(procedimentoResumo).not.toContainText(novoProcedimento);

  // Add the procedimento inline (this dirties the ficha, blocking generation).
  await page.getByPlaceholder("Outro procedimento").fill(novoProcedimento);
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByText(AVISO_NAO_SALVAS)).toBeVisible();

  // Save (PATCH /pacientes/:id) → the summary must re-resolve from the server.
  await page.getByRole("button", { name: BOTAO_SALVAR }).click();
  await expect(page.getByText(TOAST_SALVO).first()).toBeVisible();
  await expect(page.getByText(AVISO_NAO_SALVAS)).toHaveCount(0);

  // The crux: the SAVED procedimento now appears in the resolved summary, so the
  // generated PDF would carry it too — the save→invalidate→refresh chain held.
  await expect(procedimentoResumo).toContainText(novoProcedimento);
});

test("marking the balance as paid is reflected in the server-resolved Valores summary", async ({
  page,
}) => {
  // Swap the default (paid) patient for one with an open balance + due date so
  // the "Marcar como quitado" action is available.
  await arquivarPaciente(paciente.id);
  paciente = await criarPacienteTeste({
    valorPendente: 2000,
    dataPagamentoPendente: "2026-08-01",
  });

  await abrirContrato(page, paciente.id);

  // Baseline: the resolved Valores summary shows an open balance with a due date.
  const saldoResumo = resumoValor(page, "Saldo em aberto");
  await expect(saldoResumo).not.toContainText("—");
  await expect(resumoValor(page, "Vencimento do saldo")).not.toContainText("—");

  // Fold the balance into the amount paid, then save.
  await page.getByRole("button", { name: BOTAO_QUITADO }).click();
  await expect(page.getByText(AVISO_NAO_SALVAS)).toBeVisible();
  await page.getByRole("button", { name: BOTAO_SALVAR }).click();
  await expect(page.getByText(TOAST_SALVO).first()).toBeVisible();
  await expect(page.getByText(AVISO_NAO_SALVAS)).toHaveCount(0);

  // The resolved summary (PDF source of truth) now reflects a settled balance:
  // amount paid rolled up to the full R$ 5.000,00, the saldo zeroed out, and the
  // vencimento cleared (an empty date resolves to "—").
  await expect(resumoValor(page, "Valor pago")).toContainText("5.000,00");
  await expect(saldoResumo).toContainText("0,00");
  await expect(resumoValor(page, "Vencimento do saldo")).toHaveText("—");
});
