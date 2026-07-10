import { test, expect, type Page } from "@playwright/test";

import { arquivarPaciente, criarPacienteTeste, type CreatedPaciente } from "./api";
import { bgLuminance, expectSurfaceMatchesMode } from "./luminance";

/**
 * Light/dark theme regression guard for the web Console.
 *
 * The Console defaults to DARK ("Meia-noite": navy background, ivory text). A
 * toggle in the header cycles Escuro → Claro → Sistema → Escuro; next-themes
 * applies the choice as the `dark` class on <html> (present = dark, absent =
 * light) and persists it to localStorage "kcl-console-theme". LIGHT ("Linho")
 * is a warm beige background with navy text.
 *
 * Rather than eyeball screenshots, these tests assert on COMPUTED colors so a
 * future change that re-introduces a hardcoded color (a panel/dialog stuck dark
 * while the page is light, or unreadable same-tone text) fails deterministically:
 *   - a surface's background luminance must match the selected mode, and
 *   - foreground text must keep real contrast against its background.
 */

const THEME_BUTTON = 'button[aria-label^="Tema:"]';

async function htmlIsDark(page: Page): Promise<boolean> {
  const cls = (await page.locator("html").getAttribute("class")) ?? "";
  return cls.split(/\s+/).includes("dark");
}

/** Click the header toggle until the requested mode is active on <html>. */
async function setTheme(page: Page, mode: "dark" | "light"): Promise<void> {
  const button = page.locator(THEME_BUTTON);
  for (let i = 0; i < 3; i++) {
    if ((await htmlIsDark(page)) === (mode === "dark")) return;
    await button.click();
    // Let next-themes flip the class before re-checking.
    await page.waitForTimeout(150);
  }
  expect(await htmlIsDark(page), `failed to switch theme to ${mode}`).toBe(mode === "dark");
}

let paciente: CreatedPaciente;

test.beforeEach(async () => {
  paciente = await criarPacienteTeste();
});

test.afterEach(async () => {
  if (paciente) await arquivarPaciente(paciente.id);
});

test("home renders correctly in dark (default) then light", async ({ page }) => {
  // Skip the first-visit onboarding dialog (it renders modal and would make the
  // rest of the page inert); the theme default stays dark since we don't touch
  // the "kcl-console-theme" key.
  await page.addInitScript(() => localStorage.setItem("kcl-console-guia-visto", "1"));
  await page.goto("/");

  const heading = page.getByRole("heading", { name: "Console de Operação" });
  await expect(heading).toBeVisible();
  const body = page.locator("body");

  // DARK is the default identity.
  expect(await htmlIsDark(page)).toBe(true);
  await expectSurfaceMatchesMode("dark", body, heading);

  // Toggle to LIGHT — the whole page must follow, not just <html>.
  await setTheme(page, "light");
  expect(await htmlIsDark(page)).toBe(false);
  await expectSurfaceMatchesMode("light", body, heading);

  // A patient card must not stay stuck on the dark palette under the light page.
  const card = page.locator(".bg-card").first();
  if (await card.count()) {
    expect(await bgLuminance(card), "patient card stuck dark in light mode").toBeGreaterThan(0.5);
  }
});

test("patient detail, section 08 editor and discard dialog follow both themes", async ({ page }) => {
  await page.goto(`/paciente/${paciente.id}`);

  const patientName = page.getByRole("heading", { name: paciente.nome });
  await expect(patientName).toBeVisible();
  const body = page.locator("body");

  // ---- DARK (default) — patient detail ----
  expect(await htmlIsDark(page)).toBe(true);
  await expectSurfaceMatchesMode("dark", body, patientName);

  // The page is now a split-view: actions live in tabs on the right. Section 08
  // sits in the "Conteúdo" tab, and Radix unmounts inactive tab panels — so
  // activate it before reaching for its contents.
  await page.getByRole("tab", { name: "Conteúdo" }).click();

  // Open the section 08 ("Conteúdo da Página") editor.
  await expect(page.getByText("Conteúdo da Página")).toBeVisible();
  await page.getByRole("button", { name: "Personalizar" }).click();

  // Add a section so there is (a) an editor field to inspect and (b) an unsaved
  // change to trigger the discard dialog — independent of any default content.
  await page.getByRole("button", { name: "Adicionar seção" }).click();
  const tituloInput = page.getByPlaceholder("Título da seção").last();
  await expect(tituloInput).toBeVisible();
  await tituloInput.fill(`Tema E2E ${Math.random().toString(36).slice(2, 7)}`);

  // Editor field must read on the dark palette (input uses bg-background).
  expect(await bgLuminance(tituloInput), "section 08 input stuck light in dark mode").toBeLessThan(0.4);

  // ---- DARK — discard dialog ----
  await page.getByRole("button", { name: "Cancelar" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  const dialogTitle = dialog.getByText("Descartar alterações?");
  await expect(dialogTitle).toBeVisible();
  await expectSurfaceMatchesMode("dark", dialog, dialogTitle);
  await page.getByRole("button", { name: "Continuar editando" }).click();
  await expect(dialog).toBeHidden();

  // ---- LIGHT — patient detail, editor, dialog ----
  await setTheme(page, "light");
  expect(await htmlIsDark(page)).toBe(false);
  await expectSurfaceMatchesMode("light", body, patientName);

  // The still-open editor field must flip to the light palette.
  expect(await bgLuminance(tituloInput), "section 08 input stuck dark in light mode").toBeGreaterThan(0.55);

  // Re-trigger the discard dialog (the unsaved section is still present).
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialogTitle).toBeVisible();
  await expectSurfaceMatchesMode("light", dialog, dialogTitle);
  await page.getByRole("button", { name: "Continuar editando" }).click();
  await expect(dialog).toBeHidden();
});
