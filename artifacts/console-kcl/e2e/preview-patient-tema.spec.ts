import { test, expect, type Page } from "@playwright/test";

import {
  arquivarPaciente,
  criarPacienteTeste,
  definirTemaPaciente,
  type CreatedPaciente,
} from "./api";
import { bgLuminance, expectSurfaceMatchesMode } from "./luminance";

/**
 * Regression guard: the Console patient page's "O que a paciente recebe" preview
 * must render in the patient's OWN saved light/dark register (`tema`; null →
 * light), independent of the secretary's ambient Console theme.
 *
 * The preview lives in the always-visible left column of the split-view and is
 * wrapped in the `.paciente` / `.paciente paciente-dark` editorial register
 * (Dra. Karla's brand), driven by `data.paciente.tema` — NOT next-themes. So a
 * future change that re-couples it to the Console theme (or diverges from the
 * mobile companion) fails here deterministically: we open a dark-theme patient
 * while the Console is light (and vice-versa) and assert the preview follows the
 * patient, while the Console chrome stays in its opposite register.
 *
 * Like the sibling theme specs, we assert on COMPUTED colors rather than
 * screenshots, so a stuck/hardcoded color is caught too.
 */

/** True when next-themes has the `dark` class on <html> (the Console chrome). */
async function consoleIsDark(page: Page): Promise<boolean> {
  const cls = (await page.locator("html").getAttribute("class")) ?? "";
  return cls.split(/\s+/).includes("dark");
}

/**
 * Opens the patient page with the Console pre-set to a fixed light/dark theme.
 * We seed next-themes' localStorage key directly (deterministic, and avoids the
 * Replit dev-banner overlapping the header toggle) and skip the onboarding
 * guide so nothing renders modal over the page.
 */
async function abrirPaciente(
  page: Page,
  id: number,
  consoleTheme: "light" | "dark",
): Promise<void> {
  await page.addInitScript((theme) => {
    localStorage.setItem("kcl-console-guia-visto", "1");
    localStorage.setItem("kcl-console-theme", theme);
  }, consoleTheme);
  await page.goto(`/paciente/${id}`);
}

let paciente: CreatedPaciente;

test.beforeEach(async () => {
  paciente = await criarPacienteTeste();
});

test.afterEach(async () => {
  if (paciente) await arquivarPaciente(paciente.id);
});

test("preview follows the patient's DARK register while the Console is light", async ({
  page,
}) => {
  await definirTemaPaciente(paciente.token, "dark");
  await abrirPaciente(page, paciente.id, "light");

  await expect(page.getByRole("heading", { name: paciente.nome })).toBeVisible();
  // The Console chrome itself is LIGHT — the preview must not follow it.
  expect(await consoleIsDark(page)).toBe(false);

  const preview = page.locator(".paciente").first();
  await expect(preview).toBeVisible();
  // The doctor name (h2) inherits the editorial --pp-text, our text probe.
  const previewText = preview.locator("h2").first();
  await expect(previewText).toBeVisible();

  // Despite the light Console, the preview reads DARK (the patient's choice).
  await expectSurfaceMatchesMode("dark", preview, previewText);
});

test("preview follows the patient's LIGHT register while the Console is dark", async ({
  page,
}) => {
  await definirTemaPaciente(paciente.token, "light");
  await abrirPaciente(page, paciente.id, "dark");

  await expect(page.getByRole("heading", { name: paciente.nome })).toBeVisible();
  // The Console chrome itself is DARK — the preview must not follow it.
  expect(await consoleIsDark(page)).toBe(true);
  // Sanity: the page body really is on the dark Console palette.
  expect(
    await bgLuminance(page.locator("body")),
    "Console chrome should be dark",
  ).toBeLessThan(0.4);

  const preview = page.locator(".paciente").first();
  await expect(preview).toBeVisible();
  const previewText = preview.locator("h2").first();
  await expect(previewText).toBeVisible();

  // Despite the dark Console, the preview reads LIGHT (the patient's choice).
  await expectSurfaceMatchesMode("light", preview, previewText);
});
