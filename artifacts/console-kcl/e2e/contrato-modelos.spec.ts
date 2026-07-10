import { test, expect, type Locator, type Page } from "@playwright/test";

import {
  atualizarModeloContrato,
  criarModeloContrato,
  listarModelosContrato,
  removerModeloContrato,
  restaurarModeloPadrao,
  type ModeloContrato,
} from "./api";

/**
 * Regression guard for the document-template management page (`/contrato-modelos`).
 *
 * The whole document-generation area (`/documentos`) is fed by VIGENTE model-base
 * templates managed here. `documentos.spec.ts` only SEEDS templates via the API —
 * it never drives this management UI. If listing, creating/activating, or
 * restoring a factory template silently breaks, the generator loses its source
 * material and CI wouldn't notice.
 *
 * This spec exercises the management UI end-to-end:
 *   1. Create a brand-new model-base NÃO vigente, then activate it via the editor
 *      and assert it flips to vigente (no "Inativo" badge). Fully isolated: it
 *      uses a unique procedimento (no factory pair) and is removed afterwards.
 *   2. Restore a FACTORY template (one with a factory pair, `statusFabrica != null`):
 *      the "Restaurar" button is confirm-gated (an AlertDialog), and confirming
 *      brings the model back NÃO vigente. The original state is snapshotted and
 *      restored via the API so the shared seed is left untouched.
 *
 * The onboarding modal guard only blocks "/", so `/contrato-modelos` doesn't
 * strictly need the localStorage preset — but we set it anyway to follow the
 * suite's existing setup convention.
 */

/**
 * Locates a model card by its EXACT title. Titles can be prefixes of one another
 * (e.g. "… — Blefaroplastia" is a prefix of "… — Blefaroplastia com Laser CO₂"),
 * so a substring `hasText` filter would match sibling cards too. Anchoring on the
 * exact title text node and walking up to its nearest ancestor card (the closest
 * <div> containing a button) keeps the match unambiguous.
 */
function cardDoModelo(page: Page, titulo: string): Locator {
  return page
    .getByText(titulo, { exact: true })
    .locator("xpath=ancestor::div[.//button][1]");
}

const SUFIXO = Math.random().toString(36).slice(2, 8);
const PROCEDIMENTO_NOVO = `ZZ E2E Modelo ${SUFIXO}`;
const TITULO_NOVO = `Contrato E2E de gestão de modelos ${SUFIXO}`;

let idCriado: number | null = null;

test.beforeEach(async ({ page }) => {
  // Suppress the first-visit onboarding modal (suite convention).
  await page.addInitScript(() =>
    localStorage.setItem("kcl-console-guia-visto", "1"),
  );
});

test.afterEach(async () => {
  // Remove the model created through the UI. Fall back to a lookup by the unique
  // `procedimento` in case creation succeeded but the test aborted before the id
  // was captured — otherwise the row would leak into the shared demo list.
  let id = idCriado;
  if (id == null) {
    const orfao = (await listarModelosContrato()).find(
      (m) => m.procedimento === PROCEDIMENTO_NOVO,
    );
    id = orfao?.id ?? null;
  }
  if (id != null) await removerModeloContrato(id);
  idCriado = null;
});

test("creates a model-base NÃO vigente then activates it through the editor", async ({
  page,
}) => {
  await page.goto("/contrato-modelos");

  // The list must load (regression: a broken list = no source material).
  await expect(
    page.getByRole("heading", { name: "Modelos cadastrados" }),
  ).toBeVisible();

  // ---- Create (NÃO vigente) ----
  await page.getByRole("button", { name: "Novo modelo" }).click();

  const dialogo = page.getByRole("dialog");
  await expect(
    dialogo.getByRole("heading", { name: "Novo modelo-base" }),
  ).toBeVisible();

  await dialogo.getByPlaceholder("Ex.: Blefaroplastia").fill(PROCEDIMENTO_NOVO);
  await dialogo
    .getByPlaceholder("Ex.: Contrato de prestação de serviços médicos", {
      exact: false,
    })
    .fill(TITULO_NOVO);

  // Type the body into the TipTap (ProseMirror) editor so `corpo` isn't empty
  // (the "Criar modelo" button stays disabled until the body has content).
  const corpo = dialogo.locator(".ProseMirror");
  await corpo.click();
  await corpo.pressSequentially("Corpo de teste do modelo-base.");

  // Switch OFF "Modelo vigente" so it is created NÃO vigente (defaults ON).
  await dialogo.getByRole("switch").click();

  const criar = dialogo.getByRole("button", { name: "Criar modelo" });
  await expect(criar).toBeEnabled();
  await criar.click();

  // Dialog closes and the new card shows up, flagged "Inativo".
  await expect(dialogo).toBeHidden();
  const card = cardDoModelo(page, TITULO_NOVO);
  await expect(card).toBeVisible();
  await expect(card.getByText("Inativo")).toBeVisible();

  // A manually-created model has no factory pair (`statusFabrica === null`), so
  // it must NOT offer a "Restaurar" action — restoring would dead-end with an
  // error toast. The button is hidden for these cards.
  await expect(
    card.getByRole("button", { name: "Restaurar" }),
  ).toHaveCount(0);

  // Capture the id for cleanup (and to confirm it really persisted).
  const criado = (await listarModelosContrato()).find(
    (m) => m.procedimento === PROCEDIMENTO_NOVO,
  );
  expect(criado, "modelo criado deve existir na API").toBeTruthy();
  idCriado = criado!.id;
  expect(criado!.vigente).toBe(false);

  // ---- Activate (vigente) through the editor ----
  await card.getByRole("button", { name: "Editar" }).click();
  await expect(
    dialogo.getByRole("heading", { name: "Editar modelo-base" }),
  ).toBeVisible();
  await dialogo.getByRole("switch").click(); // turn vigente ON
  await dialogo.getByRole("button", { name: "Salvar nova versão" }).click();
  await expect(dialogo).toBeHidden();

  // The "Inativo" badge is gone — the model is now vigente (usable for generation).
  await expect(cardDoModelo(page, TITULO_NOVO).getByText("Inativo")).toHaveCount(
    0,
  );

  // Confirm the activation landed on the server too.
  await expect
    .poll(async () => {
      const m = (await listarModelosContrato()).find(
        (x) => x.id === idCriado,
      );
      return m?.vigente;
    })
    .toBe(true);
});

/**
 * Drives the restore-to-factory flow for BOTH the contrato and the termo
 * model-base. Each run:
 *   1. Edits the factory model so its text DIFFERS from the factory source
 *      (`statusFabrica === "desatualizado"`) and is left VIGENTE — the exact
 *      state restore must undo.
 *   2. Restores through the UI: the action is confirm-gated (an AlertDialog must
 *      appear), and confirming pulls the LIVE factory text back.
 *   3. Asserts the model comes back NÃO vigente AND its text now matches the
 *      factory source again (`statusFabrica === "igual"` — computed server-side
 *      against the live factory source, so it would catch restoring stale text).
 * The original state is snapshotted and put back in a `finally` so the shared
 * seed is left exactly as found.
 */
for (const tipo of ["contrato", "termo"] as const) {
  const rotulo = tipo === "termo" ? "termo" : "contrato";

  test(`restaura o modelo-base de ${rotulo} ao texto de fábrica: confirma, volta NÃO vigente e igual à fábrica`, async ({
    page,
  }) => {
    // The factory model-base for this tipo (the only one with a factory pair).
    const alvo: ModeloContrato | undefined = (
      await listarModelosContrato()
    ).find((m) => m.tipo === tipo && m.statusFabrica !== null);

    test.skip(
      !alvo,
      `Nenhum modelo de fábrica de ${rotulo} disponível neste ambiente.`,
    );

    const original = alvo!;
    // Snapshot so we can put the model back exactly as we found it.
    const snapshot = {
      titulo: original.titulo,
      corpo: original.corpo,
      vigente: original.vigente,
      observacoes: original.observacoes,
    };

    try {
      // Diverge the text from the factory source (→ "desatualizado") and leave
      // it vigente, so a correct restore must change BOTH the text and the
      // vigência. Keep the título untouched so the card lookup stays stable.
      await atualizarModeloContrato(original.id, {
        corpo: `${original.corpo}<p>EDIÇÃO E2E A SER REVERTIDA</p>`,
        vigente: true,
      });
      await expect
        .poll(async () => {
          const m = (await listarModelosContrato()).find(
            (x) => x.id === original.id,
          );
          return m?.statusFabrica;
        })
        .toBe("desatualizado");

      await page.goto("/contrato-modelos");

      const card = cardDoModelo(page, original.titulo);
      await expect(card).toBeVisible();
      // It starts vigente (no "Inativo" badge) thanks to the setup above.
      await expect(card.getByText("Inativo")).toHaveCount(0);

      // ---- Restore is confirm-gated ----
      await card.getByRole("button", { name: "Restaurar" }).click();
      const confirm = page.getByRole("alertdialog");
      await expect(
        confirm.getByRole("heading", {
          name: "Restaurar ao modelo de fábrica?",
        }),
      ).toBeVisible();
      await confirm.getByRole("button", { name: "Restaurar" }).click();

      // ---- Comes back NÃO vigente ----
      await expect(
        page.getByText("Modelo restaurado", { exact: true }),
      ).toBeVisible();
      await expect(
        cardDoModelo(page, original.titulo).getByText("Inativo"),
      ).toBeVisible();

      // The server flipped vigente to false AND the text now matches the live
      // factory source again (statusFabrica back to "igual") — this is what
      // would catch restoring stale text or leaving it vigente.
      await expect
        .poll(async () => {
          const m = (await listarModelosContrato()).find(
            (x) => x.id === original.id,
          );
          return m && { vigente: m.vigente, statusFabrica: m.statusFabrica };
        })
        .toEqual({ vigente: false, statusFabrica: "igual" });
    } finally {
      // Restore the original state (idempotent — same text means no version bump).
      await atualizarModeloContrato(original.id, snapshot);
    }
  });
}

/**
 * A manually-created model-base (a procedimento with no factory pair) must be
 * REJECTED by the restore route — there is no factory text to restore to. The
 * UI never shows the "Restaurar" button for these (covered above), so this
 * drives the route directly to prove the server-side guard (422) holds even if
 * a client called it anyway.
 */
test("restaurar um modelo criado manualmente (sem par de fábrica) é rejeitado (422)", async () => {
  const sufixo = Math.random().toString(36).slice(2, 8);
  const id = await criarModeloContrato({
    titulo: `Modelo manual sem fábrica ${sufixo}`,
    corpo: "<p>Texto manual sem par de fábrica.</p>",
    procedimento: `ZZ E2E Manual ${sufixo}`,
    vigente: false,
  });
  try {
    // Sanity: a manual model has no factory pair to compare/restore against.
    const criado = (await listarModelosContrato()).find((m) => m.id === id);
    expect(criado?.statusFabrica).toBeNull();

    const status = await restaurarModeloPadrao(id, true);
    expect(status).toBe(422);
  } finally {
    await removerModeloContrato(id);
  }
});

/**
 * Unsaved-edits guard for the template editor (Dialog). Unlike the full-page
 * editors covered by `unsaved-changes.spec.ts`, this one lives in a Dialog, so
 * the guard fires on Cancel / Dialog-close: a dirty body must open the branded
 * <DiscardChangesDialog> ("Descartar alterações?") instead of silently dropping
 * a long contract draft. These tests never save, so nothing leaks to the API.
 */
test("warns before discarding unsaved template edits; cancel keeps, confirm closes", async ({
  page,
}) => {
  await page.goto("/contrato-modelos");
  await expect(
    page.getByRole("heading", { name: "Modelos cadastrados" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Novo modelo" }).click();
  const dialogo = page.getByRole("dialog");
  await expect(
    dialogo.getByRole("heading", { name: "Novo modelo-base" }),
  ).toBeVisible();

  // Make the editor dirty by typing a draft into the body.
  const corpo = dialogo.locator(".ProseMirror");
  await corpo.click();
  await corpo.pressSequentially("Rascunho que não deve ser perdido por engano.");

  // Cancel → the guard intercepts with the branded confirmation.
  await dialogo.getByRole("button", { name: "Cancelar" }).click();
  const descartar = page.getByRole("alertdialog");
  await expect(descartar).toBeVisible();
  await expect(descartar.getByText("Descartar alterações?")).toBeVisible();

  // "Continuar editando" keeps the editor open, edits intact.
  await descartar.getByRole("button", { name: "Continuar editando" }).click();
  await expect(descartar).toBeHidden();
  await expect(
    dialogo.getByRole("heading", { name: "Novo modelo-base" }),
  ).toBeVisible();
  await expect(corpo).toContainText("Rascunho que não deve ser perdido");

  // Cancel again → "Descartar e sair" discards and closes the editor.
  await dialogo.getByRole("button", { name: "Cancelar" }).click();
  await expect(descartar).toBeVisible();
  await descartar.getByRole("button", { name: "Descartar e sair" }).click();
  await expect(dialogo).toBeHidden();
});

test("untouched template editor closes immediately with no prompt", async ({
  page,
}) => {
  await page.goto("/contrato-modelos");
  await expect(
    page.getByRole("heading", { name: "Modelos cadastrados" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Novo modelo" }).click();
  const dialogo = page.getByRole("dialog");
  await expect(
    dialogo.getByRole("heading", { name: "Novo modelo-base" }),
  ).toBeVisible();
  // Wait for the editor surface (baseline emitted) so the guard is fully armed.
  await expect(dialogo.locator(".ProseMirror")).toBeVisible();

  // No edits → Cancel closes straight away, no discard dialog.
  await dialogo.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(dialogo).toBeHidden();
});
