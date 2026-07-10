import { test, expect, type Page } from "@playwright/test";

import { aprovarPaciente, arquivarPaciente, criarPacienteTeste } from "./api";

/**
 * E2E coverage for crediting the team member who sends a WhatsApp reminder from
 * the mobile Console home (route "/", `app/index.tsx`).
 *
 * The mobile WhatsApp button must do more than open WhatsApp: it has to register
 * the reminder via POST /pacientes/:id/lembrete with the sender's name as
 * `autor`, so the attribution shows up ("Lembrado por X") on both web and
 * mobile. Since the app has no login, the sender's identity is captured once via
 * a lightweight prompt and reused (persisted in AsyncStorage, like the web
 * localStorage approach).
 *
 * This pins:
 *   - the first reminder prompts for "who is sending",
 *   - after confirming, the card flips to "Lembrar de novo" + "Lembrado por X",
 *   - the "Não abriu" alert stays (surgery still close, still not opened),
 *   - and a later reminder reuses the saved identity WITHOUT prompting again.
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
  // The reminder button opens the patient's WhatsApp (Linking.openURL → wa.me,
  // which on web becomes window.open). Abort that external load and auto-close
  // any popup so the test never waits on the real WhatsApp site.
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

function cartao(page: Page, id: number) {
  return page.getByTestId(`paciente-${id}`);
}

test("crediting the sender on a mobile reminder: prompts once, then reuses the identity", async ({
  page,
}) => {
  // A patient who qualifies for the "Não abriu" follow-up alert: approved (out
  // of Fechamento), never opened the link, surgery within the alert window.
  const paciente = await criarPacienteTeste({
    dataCirurgia: dataCirurgiaProxima(),
  });
  pacienteId = paciente.id;
  await aprovarPaciente(paciente.id);

  await page.goto("/");

  const card = cartao(page, paciente.id);
  await expect(card).toBeVisible();

  // Before the reminder: the red "NÃO ABRIU" alert and the un-logged CTA.
  await expect(card.getByText("NÃO ABRIU", { exact: true })).toBeVisible();

  const botaoLembrar = page.getByTestId(`lembrar-whatsapp-${paciente.id}`);
  await expect(botaoLembrar).toBeVisible();
  await expect(card.getByText("Lembrar pelo WhatsApp")).toBeVisible();
  // No attribution yet.
  await expect(page.getByTestId(`lembrado-por-${paciente.id}`)).toHaveCount(0);

  // First tap: the identity prompt appears (no name saved on this device yet).
  await botaoLembrar.click();
  const input = page.getByTestId("ident-operador-input");
  await expect(input).toBeVisible();

  const nome = `Recepção ${Math.random().toString(36).slice(2, 6)}`;
  await input.fill(nome);
  await page.getByTestId("ident-operador-confirmar").click();

  // The card flips to the "already reminded" state, crediting the sender, and
  // the "NÃO ABRIU" alert is STILL present.
  await expect(card.getByText("Lembrar de novo")).toBeVisible();
  const atribuicao = page.getByTestId(`lembrado-por-${paciente.id}`);
  await expect(atribuicao).toBeVisible();
  await expect(atribuicao).toContainText(`Lembrado por ${nome}`);
  await expect(card.getByText("Lembrar pelo WhatsApp")).toHaveCount(0);
  await expect(card.getByText("NÃO ABRIU", { exact: true })).toBeVisible();

  // A second reminder reuses the saved identity — no prompt this time.
  await page.getByTestId(`lembrar-whatsapp-${paciente.id}`).click();
  await expect(page.getByTestId("ident-operador-input")).toHaveCount(0);
  await expect(page.getByTestId(`lembrado-por-${paciente.id}`)).toContainText(
    `Lembrado por ${nome}`,
  );
});
