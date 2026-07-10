import { test, expect, type Locator, type Page } from "@playwright/test";

import { arquivarPaciente, criarPacienteTeste, type CreatedPaciente } from "./api";
import { bgLuminance, textLuminance, expectSurfaceMatchesMode } from "./luminance";

/**
 * Light/dark regression guard for the PUBLIC patient page (`/p/:token`).
 *
 * This page has its OWN editorial register, fully independent from the Console's
 * Meia-noite/Linho toggle: the `.paciente` / `.paciente-dark` tokens in
 * index.css (Dra. Karla's brand — warm linen light, warm dark; NOT the navy
 * Console). The active register is driven by each patient's saved `tema`, with a
 * token-scoped localStorage fast path (`kcl-paciente-theme:<token>`).
 *
 * Like the Console guard, these tests assert on COMPUTED colors so a hardcoded
 * color that breaks ONE register (a surface stuck in the wrong register, or
 * unreadable same-tone text) fails deterministically. They also exercise the
 * dark editorial "slab" band (`.pp-slab`, the cover + footer) which must read
 * dark in BOTH registers.
 */

const STORAGE_PREFIX = "kcl-paciente-theme";

/** True when the public page root is showing the dark editorial register. */
async function pacienteIsDark(page: Page): Promise<boolean> {
  const cls = (await page.locator(".paciente").first().getAttribute("class")) ?? "";
  return cls.split(/\s+/).includes("paciente-dark");
}

/**
 * The footer/cover use `.pp-slab`, an intentionally dark band that must stay
 * dark with light text in BOTH registers (so it can't simply follow --pp-bg).
 */
async function expectSlabReadsDark(slab: Locator, text: Locator): Promise<void> {
  const bg = await bgLuminance(slab);
  const fg = await textLuminance(text);
  expect(bg, "editorial slab must read dark in both registers").toBeLessThan(0.4);
  expect(fg, "slab text must stay light").toBeGreaterThan(0.5);
  expect(Math.abs(bg - fg), "slab text must keep contrast").toBeGreaterThan(0.3);
}

let paciente: CreatedPaciente;

test.beforeEach(async () => {
  paciente = await criarPacienteTeste();
});

test.afterEach(async () => {
  if (paciente) await arquivarPaciente(paciente.id);
});

test("public patient page renders correctly in light then dark editorial registers", async ({
  page,
}) => {
  const token = paciente.token;
  const chaveTema = `${STORAGE_PREFIX}:${token}`;

  // Drive each register deterministically via the token-scoped localStorage fast
  // path (the new patient has no saved server `tema`, so this value wins). We
  // reload between registers rather than clicking the fixed header toggle, which
  // the Replit dev banner overlaps in this environment.
  async function aplicarRegistro(registro: "light" | "dark") {
    await page.evaluate(
      ([k, v]) => localStorage.setItem(k, v),
      [chaveTema, registro] as const,
    );
    await page.reload();
    await expect.poll(() => pacienteIsDark(page)).toBe(registro === "dark");
  }

  await page.goto(`/p/${token}`);

  const root = page.locator(".paciente").first();
  await expect(root).toBeVisible();

  // Page surface + body text (the "Sua médica" heading inherits --pp-text).
  const medicaHeading = page.locator("main h2").first();
  await expect(medicaHeading).toBeVisible();
  // An elevated card surface (--pp-surface) must follow the register too. Scope
  // to <main> so we hit the solid doctor-photo card, not the translucent
  // header toggle (which uses --pp-surface at /80 opacity).
  const surface = page.locator('main [class*="--pp-surface"]').first();
  await expect(surface).toBeVisible();
  // The footer slab + its "Camada" signature must read dark in both registers.
  const footer = page.locator("footer.pp-slab");
  const footerText = footer.getByText("Camada", { exact: true });
  await expect(footerText).toBeVisible();

  // ---- LIGHT (linen) register ----
  await aplicarRegistro("light");
  await expectSurfaceMatchesMode("light", root, medicaHeading);
  expect(
    await bgLuminance(surface),
    "elevated card stuck dark in light register",
  ).toBeGreaterThan(0.55);
  await expectSlabReadsDark(footer, footerText);

  // ---- DARK (warm) register ----
  await aplicarRegistro("dark");
  await expectSurfaceMatchesMode("dark", root, medicaHeading);
  expect(
    await bgLuminance(surface),
    "elevated card stuck light in dark register",
  ).toBeLessThan(0.4);
  // The slab must STILL read dark (not flip light) in the dark register.
  await expectSlabReadsDark(footer, footerText);
});
