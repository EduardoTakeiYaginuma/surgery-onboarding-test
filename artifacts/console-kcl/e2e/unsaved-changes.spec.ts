import { test, expect, type Page } from "@playwright/test";

/**
 * Unsaved-edits guard regression for the web Console.
 *
 * Wouter has NO built-in navigation blocker, so the Console rolls its own
 * (`src/hooks/use-unsaved-changes.ts`): while a form is dirty it (a) intercepts
 * the in-app Back button — which routes through `setLocation` — by opening an
 * AlertDialog instead of leaving, and (b) traps the BROWSER Back/Forward by
 * pushing a same-URL history sentinel and re-arming on `popstate`, again opening
 * the dialog rather than silently losing the edits. Both paths converge on the
 * in-app <DiscardChangesDialog> ("Descartar alterações?") — NOT a native
 * window.confirm — so the assertions below key off that dialog deterministically
 * (visible/hidden + title text), no native-dialog interception required.
 *
 * The "Conteúdo padrão" page (/conteudo) is used because it owns a guarded form
 * with a trivial dirty trigger (add a section) and, unlike the home page, never
 * shows the first-visit onboarding modal that would make the page inert.
 *
 * Covered:
 *   - clean (untouched) page leaves immediately, no prompt;
 *   - dirty + in-app Back  → prompt; cancel stays put; confirm discards & leaves;
 *   - dirty + browser Back → prompt; cancel stays put (URL unchanged).
 */

const DISCARD_TITLE = "Descartar alterações?";
const DISCARD_MESSAGE =
  "Você tem alterações que ainda não foram salvas. Se sair agora, elas serão perdidas.";

/** Skip the home onboarding modal in case any path lands back on "/". */
async function suppressOnboarding(page: Page): Promise<void> {
  await page.addInitScript(() =>
    localStorage.setItem("kcl-console-guia-visto", "1"),
  );
}

function pathnameOf(page: Page): string {
  return new URL(page.url()).pathname;
}

async function gotoConteudo(page: Page): Promise<void> {
  await suppressOnboarding(page);
  await page.goto("/conteudo");
  await expect(
    page.getByRole("heading", { name: "Conteúdo padrão da página" }),
  ).toBeVisible();
}

/** Make the form dirty by appending a section; proven by the Save button enabling. */
async function makeDirty(page: Page): Promise<void> {
  const salvar = page.getByRole("button", { name: "Salvar padrão" });
  await expect(salvar).toBeDisabled(); // clean baseline
  await page.getByRole("button", { name: "Adicionar seção" }).click();
  await expect(salvar).toBeEnabled(); // now dirty
}

test("clean page navigates away immediately with no prompt", async ({ page }) => {
  await gotoConteudo(page);

  // Back arrow on a pristine form routes straight home — guard must not fire.
  await page.getByRole("button", { name: "Voltar" }).click();

  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(() => expect(pathnameOf(page)).toBe("/")).toPass();
});

test("dirty + in-app Back: cancel keeps you, confirm discards and leaves", async ({
  page,
}) => {
  await gotoConteudo(page);
  await makeDirty(page);

  // First attempt: the guard intercepts and asks for confirmation.
  await page.getByRole("button", { name: "Voltar" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(DISCARD_TITLE)).toBeVisible();
  await expect(dialog.getByText(DISCARD_MESSAGE)).toBeVisible();

  // Cancel ("Continuar editando") — stay on the page, edits intact.
  await dialog.getByRole("button", { name: "Continuar editando" }).click();
  await expect(dialog).toBeHidden();
  expect(pathnameOf(page)).toBe("/conteudo");
  await expect(page.getByRole("button", { name: "Salvar padrão" })).toBeEnabled();

  // Second attempt: confirm ("Descartar e sair") — discard and leave.
  await page.getByRole("button", { name: "Voltar" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Descartar e sair" }).click();
  await expect(() => expect(pathnameOf(page)).toBe("/")).toPass();
});

test("dirty + browser Back (popstate) prompts and keeps you in place", async ({
  page,
}) => {
  await gotoConteudo(page);
  await makeDirty(page);

  // The hardware/browser Back press pops the history sentinel; the guard
  // re-arms and opens the dialog instead of unloading the dirty form.
  await page.goBack();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(DISCARD_TITLE)).toBeVisible();

  // Cancelling leaves us exactly where we were — still dirty, still on /conteudo.
  await dialog.getByRole("button", { name: "Continuar editando" }).click();
  await expect(dialog).toBeHidden();
  expect(pathnameOf(page)).toBe("/conteudo");
  await expect(page.getByRole("button", { name: "Salvar padrão" })).toBeEnabled();
});
