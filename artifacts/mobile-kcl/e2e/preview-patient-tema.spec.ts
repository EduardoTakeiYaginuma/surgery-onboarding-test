import { test, expect, type Locator } from "@playwright/test";

import {
  arquivarPaciente,
  criarPacienteTeste,
  definirTemaPaciente,
  type CreatedPaciente,
} from "./api";

/**
 * Regression guard: the mobile companion's "PÁGINA DA PACIENTE" preview must
 * render in the patient's OWN saved light/dark register (`tema`; null → light),
 * independent of the team's ambient mobile Console theme — and stay in lockstep
 * with the web Console's `previa-pagina-paciente` preview.
 *
 * The preview is wrapped in a fixed `<ThemeScope theme={pagina.tema}>` so its
 * shared `Preview*` components resolve to the patient's register, not the
 * Console's. We open a dark-theme patient with the Console in light (and
 * vice-versa) and assert the preview surface (`pagina-preview`) follows the
 * patient while the surrounding Console surface (`pagina-secao`) follows the
 * Console — proving they are decoupled.
 *
 * We assert on COMPUTED background colors (react-native-web renders the inline
 * `backgroundColor` style), so a future change that re-couples the preview to
 * the Console theme is caught deterministically rather than by eyeballing.
 */

/** Perceived luminance (0 dark … 1 light) of an element's own background. */
async function bgLuminance(locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    const m =
      getComputedStyle(el).backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [
        0, 0, 0,
      ];
    const [r, g, b] = m;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  });
}

let paciente: CreatedPaciente;

test.beforeEach(async () => {
  paciente = await criarPacienteTeste();
});

test.afterEach(async () => {
  if (paciente) await arquivarPaciente(paciente.id);
});

test("preview follows the patient's LIGHT register while the Console is dark", async ({
  page,
}) => {
  await definirTemaPaciente(paciente.token, "light");

  await page.goto("/");
  await page.getByTestId(`paciente-${paciente.id}`).click();
  await expect(page).toHaveURL(new RegExp(`/paciente/${paciente.id}`));

  // The mobile Console defaults to DARK — leave it untouched so the preview's
  // light register clearly diverges from the ambient theme.
  await page.getByTestId("toggle-pagina").click();
  const preview = page.getByTestId("pagina-preview");
  await expect(preview).toBeVisible();

  // The surrounding Console surface stays on its dark palette …
  expect(
    await bgLuminance(page.getByTestId("pagina-secao")),
    "Console surface should be dark",
  ).toBeLessThan(0.4);
  // … while the preview inside it reads LIGHT (the patient's saved choice).
  expect(
    await bgLuminance(preview),
    "preview must follow the patient's light register, not the dark Console",
  ).toBeGreaterThan(0.55);
});

test("preview follows the patient's DARK register while the Console is light", async ({
  page,
}) => {
  await definirTemaPaciente(paciente.token, "dark");

  await page.goto("/");
  await page.getByTestId(`paciente-${paciente.id}`).click();
  await expect(page).toHaveURL(new RegExp(`/paciente/${paciente.id}`));

  // Flip the mobile Console to LIGHT (toggle cycles Escuro → Claro), so the
  // ambient theme is the opposite of the patient's dark choice. expo-router
  // keeps the just-left home screen mounted-but-hidden, so its theme toggle is
  // still in the DOM — scope to the visible (detail-screen) one.
  const themeToggle = page.locator('[data-testid="theme-toggle"]:visible');
  await themeToggle.click();
  await expect(themeToggle).toHaveAttribute("aria-label", /Claro/);

  await page.getByTestId("toggle-pagina").click();
  const preview = page.getByTestId("pagina-preview");
  await expect(preview).toBeVisible();

  // The surrounding Console surface now reads LIGHT …
  expect(
    await bgLuminance(page.getByTestId("pagina-secao")),
    "Console surface should be light",
  ).toBeGreaterThan(0.55);
  // … while the preview inside it stays DARK (the patient's saved choice).
  expect(
    await bgLuminance(preview),
    "preview must follow the patient's dark register, not the light Console",
  ).toBeLessThan(0.4);
});
