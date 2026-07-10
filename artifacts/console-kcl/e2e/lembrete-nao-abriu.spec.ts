import { test, expect, type Page } from "@playwright/test";

import { aprovarPaciente, arquivarPaciente, criarPacienteTeste } from "./api";

/**
 * E2E coverage for the "Não abriu" follow-up reminder on the Console home
 * (route "/", page `src/pages/console-home.tsx`).
 *
 * The whole point of logging a reminder is to flag that a follow-up already
 * happened WITHOUT removing the red "Não abriu" alert (the surgery is still
 * close and the patient still hasn't opened the link). This pins that contract
 * so a future change can't silently re-hide the alert or stop logging the
 * timeline event:
 *   - clicking "Lembrar pelo WhatsApp" logs the reminder,
 *   - the card flips to "Lembrado em DD/MM" + "Lembrar de novo",
 *   - the "Não abriu" badge is STILL present,
 *   - and the reminder shows up as a "Lembrete" event in the patient timeline
 *     (Acompanhamento tab).
 *
 * The patient qualifies for the alert (`precisaAlertaAbertura`) by being out of
 * "Fechamento" (approved → "Enviado"), never having opened the link (no
 * abertura events), and having surgery within the 7-day alert window.
 */

/** YYYY-MM-DD a few days out, safely inside the 0..7-day alert window. */
function dataCirurgiaProxima(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

let pacienteId: number | null = null;

test.beforeEach(async ({ page, context }) => {
  // Preset the onboarding guard so the home "Como funciona" modal never makes
  // the page inert (it gates the first-visit experience via localStorage).
  await page.addInitScript(() =>
    localStorage.setItem("kcl-console-guia-visto", "1"),
  );

  // The reminder button opens the patient's WhatsApp in a new tab
  // (window.open → wa.me). Abort that external load and auto-close any popup so
  // the test never waits on the real WhatsApp site.
  await context.route("https://wa.me/**", (route) => route.abort());
  context.on("page", (p) => {
    p.close().catch(() => {});
  });
});

test.afterEach(async () => {
  if (pacienteId != null) {
    await arquivarPaciente(pacienteId);
    pacienteId = null;
  }
});

/** Locates the home list card for the given patient by its detail link. */
function cartaoPaciente(page: Page, id: number) {
  return page.locator(`a[href="/paciente/${id}"]`);
}

test('logging a reminder keeps the "Não abriu" alert and records a "Lembrete" timeline event', async ({
  page,
}) => {
  // A patient who qualifies for the "Não abriu" follow-up alert: approved (so
  // out of "Fechamento"), never opened the link, surgery within the alert
  // window.
  const paciente = await criarPacienteTeste({
    dataCirurgia: dataCirurgiaProxima(),
  });
  pacienteId = paciente.id;
  await aprovarPaciente(paciente.id);

  await page.goto("/");

  const cartao = cartaoPaciente(page, paciente.id);
  await expect(cartao).toBeVisible();

  // Before the reminder: the red "Não abriu" alert and the un-logged CTA.
  const alerta = cartao.getByText("Não abriu", { exact: true });
  await expect(alerta).toBeVisible();

  const botaoLembrar = cartao.getByRole("button", {
    name: "Lembrar pelo WhatsApp",
  });
  await expect(botaoLembrar).toBeVisible();
  // The "already reminded" affordances must not be there yet.
  await expect(
    cartao.getByRole("button", { name: "Lembrar de novo" }),
  ).toHaveCount(0);
  await expect(cartao.getByText(/Lembrado em/)).toHaveCount(0);

  await botaoLembrar.click();

  // After logging the reminder, the list refetches and the card flips to the
  // "already reminded" state...
  await expect(
    cartao.getByRole("button", { name: "Lembrar de novo" }),
  ).toBeVisible();
  await expect(cartao.getByText(/Lembrado em \d{2}\/\d{2}/)).toBeVisible();
  // ...while the original CTA is gone...
  await expect(
    cartao.getByRole("button", { name: "Lembrar pelo WhatsApp" }),
  ).toHaveCount(0);
  // ...and — the whole point — the "Não abriu" alert is STILL present.
  await expect(cartao.getByText("Não abriu", { exact: true })).toBeVisible();

  // The reminder must also be recorded as a "Lembrete" event in the patient
  // timeline (Acompanhamento tab on the patient page).
  await page.goto(`/paciente/${paciente.id}`);
  await page.getByRole("tab", { name: "Acompanhamento" }).click();

  await expect(
    page.getByText("Lembrete enviado pelo WhatsApp", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Lembrete", { exact: true }).first()).toBeVisible();
});
