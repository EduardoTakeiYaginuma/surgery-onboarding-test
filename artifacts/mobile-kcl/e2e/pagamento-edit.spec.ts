import { test, expect } from "@playwright/test";

import {
  arquivarPaciente,
  criarPacienteComPendente,
  criarPacienteTeste,
  obterSaidas,
  type CreatedPaciente,
} from "./api";

/** Domínio do Console web — onde a página pública (/p/:token) é servida. */
const webDomain = process.env.REPLIT_DEV_DOMAIN;

/**
 * E2E tests for the payment-edit section (Section 07) on the patient detail
 * screen. Exercises the conditional due-date field, save-blocking validation,
 * and round-trip persistence — using the real Expo web app + shared API server.
 */

let paciente: CreatedPaciente;

test.afterEach(async () => {
  if (paciente) await arquivarPaciente(paciente.id);
});

test("due-date field appears when pending > 0 and hides when cleared to zero", async ({ page }) => {
  paciente = await criarPacienteTeste();
  await page.goto(`/paciente/${paciente.id}`);
  await expect(page.getByText("PAGAMENTO")).toBeVisible();

  const pendente = page.getByTestId("pagamento-valor-pendente");
  await expect(pendente).toBeVisible();

  // No pending balance yet — due-date field must not exist.
  await expect(page.getByTestId("pagamento-data-pendente")).toHaveCount(0);

  // Type a positive pending amount — due-date field must appear.
  await pendente.fill("1500");
  await expect(page.getByTestId("pagamento-data-pendente")).toBeVisible();

  // Clear back to zero — due-date field must disappear.
  await pendente.fill("0");
  await expect(page.getByTestId("pagamento-data-pendente")).toHaveCount(0);
});

test("save is blocked without a due date when balance is open", async ({ page }) => {
  paciente = await criarPacienteTeste();
  await page.goto(`/paciente/${paciente.id}`);
  await expect(page.getByText("PAGAMENTO")).toBeVisible();

  // Enter a positive pending balance but leave the due date empty.
  await page.getByTestId("pagamento-valor-pendente").fill("2000");
  await expect(page.getByTestId("pagamento-data-pendente")).toBeVisible();

  // Try to save — must be blocked with the validation error.
  await page.getByTestId("pagamento-salvar").click();
  await expect(page.getByText("Escolha o vencimento do saldo.")).toBeVisible();

  // The success dialog must NOT appear.
  await expect(page.getByText("Pagamento atualizado")).toHaveCount(0);
});

test("existing pending balance and due date load into the edit fields", async ({ page }) => {
  paciente = await criarPacienteComPendente({
    valorPendente: 2000,
    dataPagamentoPendente: "2026-10-10",
  });
  await page.goto(`/paciente/${paciente.id}`);
  await expect(page.getByText("PAGAMENTO")).toBeVisible();

  // The pending value should be pre-filled from the server.
  await expect(page.getByTestId("pagamento-valor-pendente")).toHaveValue("2000");

  // Due-date field must be visible (pending > 0) and pre-filled.
  const dataField = page.getByTestId("pagamento-data-pendente");
  await expect(dataField).toBeVisible();
  await expect(dataField).toHaveValue("2026-10-10");
});

test("saving valid payment values persists and round-trips after reload", async ({ page }) => {
  paciente = await criarPacienteTeste();
  await page.goto(`/paciente/${paciente.id}`);
  await expect(page.getByText("PAGAMENTO")).toBeVisible();

  // Fill valor pago + valor pendente + due date.
  await page.getByTestId("pagamento-valor-sinal").fill("5000");
  await page.getByTestId("pagamento-valor-pendente").fill("1500");
  const dataField = page.getByTestId("pagamento-data-pendente");
  await expect(dataField).toBeVisible();
  await dataField.fill("2026-11-20");

  // Save — branded success notice must appear.
  await page.getByTestId("pagamento-salvar").click();
  await expect(page.getByText("Pagamento atualizado")).toBeVisible();
  await page.getByText("Entendi").click();

  // Reload from server — the saved values must round-trip into the fields.
  await page.goto(`/paciente/${paciente.id}`);
  await expect(page.getByText("PAGAMENTO")).toBeVisible();
  await expect(page.getByTestId("pagamento-valor-sinal")).toHaveValue("5000");
  await expect(page.getByTestId("pagamento-valor-pendente")).toHaveValue("1500");
  await expect(page.getByTestId("pagamento-data-pendente")).toHaveValue("2026-11-20");
});

test("clearing the pending balance removes the due date on save", async ({ page }) => {
  paciente = await criarPacienteComPendente({
    valorPendente: 2000,
    dataPagamentoPendente: "2026-10-10",
  });
  await page.goto(`/paciente/${paciente.id}`);
  await expect(page.getByText("PAGAMENTO")).toBeVisible();

  // Both fields should start pre-filled.
  await expect(page.getByTestId("pagamento-valor-pendente")).toHaveValue("2000");
  await expect(page.getByTestId("pagamento-data-pendente")).toBeVisible();

  // Clear the pending balance to zero — due-date field disappears.
  await page.getByTestId("pagamento-valor-pendente").fill("0");
  await expect(page.getByTestId("pagamento-data-pendente")).toHaveCount(0);

  // Save — success notice confirms the update went through.
  await page.getByTestId("pagamento-salvar").click();
  await expect(page.getByText("Pagamento atualizado")).toBeVisible();
  await page.getByText("Entendi").click();

  // Reload — due-date field must remain hidden (balance is zero).
  await page.goto(`/paciente/${paciente.id}`);
  await expect(page.getByText("PAGAMENTO")).toBeVisible();
  await expect(page.getByTestId("pagamento-valor-pendente")).toHaveValue("0");
  await expect(page.getByTestId("pagamento-data-pendente")).toHaveCount(0);
});

test("lowering the paid amount asks for confirmation and aborts on cancel", async ({ page }) => {
  // Patients start with valorSinal = R$ 3.000,00 (see criarPacienteTeste).
  paciente = await criarPacienteTeste();
  await page.goto(`/paciente/${paciente.id}`);
  await expect(page.getByText("PAGAMENTO")).toBeVisible();
  await expect(page.getByTestId("pagamento-valor-sinal")).toHaveValue("3000");

  // Reduce the paid amount below the recorded value, then try to save.
  await page.getByTestId("pagamento-valor-sinal").fill("1000");
  await page.getByTestId("pagamento-salvar").click();

  // A confirmation dialog must appear, citing both the previous and new values.
  await expect(page.getByText("Reduzir o valor pago?")).toBeVisible();
  await expect(page.getByText("R$ 3.000,00")).toBeVisible();
  await expect(page.getByText("R$ 1.000,00")).toBeVisible();

  // Cancel — nothing is saved.
  await page.getByText("Cancelar").click();
  await expect(page.getByText("Pagamento atualizado")).toHaveCount(0);

  // Reload — the original paid amount must be intact on the server.
  await page.goto(`/paciente/${paciente.id}`);
  await expect(page.getByText("PAGAMENTO")).toBeVisible();
  await expect(page.getByTestId("pagamento-valor-sinal")).toHaveValue("3000");
});

test("lowering the paid amount persists once the team confirms", async ({ page }) => {
  paciente = await criarPacienteTeste();
  await page.goto(`/paciente/${paciente.id}`);
  await expect(page.getByText("PAGAMENTO")).toBeVisible();
  await expect(page.getByTestId("pagamento-valor-sinal")).toHaveValue("3000");

  // Reduce the paid amount and confirm the reduction.
  await page.getByTestId("pagamento-valor-sinal").fill("1000");
  await page.getByTestId("pagamento-salvar").click();
  await expect(page.getByText("Reduzir o valor pago?")).toBeVisible();
  await page.getByText("Reduzir mesmo assim").click();

  // Save goes through.
  await expect(page.getByText("Pagamento atualizado")).toBeVisible();
  await page.getByText("Entendi").click();

  // Reload — the lower value must now be persisted.
  await page.goto(`/paciente/${paciente.id}`);
  await expect(page.getByText("PAGAMENTO")).toBeVisible();
  await expect(page.getByTestId("pagamento-valor-sinal")).toHaveValue("1000");
});

test("raising the paid amount saves directly without a confirmation", async ({ page }) => {
  paciente = await criarPacienteTeste();
  await page.goto(`/paciente/${paciente.id}`);
  await expect(page.getByText("PAGAMENTO")).toBeVisible();
  await expect(page.getByTestId("pagamento-valor-sinal")).toHaveValue("3000");

  // Raise the paid amount — no confirmation dialog should appear.
  await page.getByTestId("pagamento-valor-sinal").fill("5000");
  await page.getByTestId("pagamento-salvar").click();
  await expect(page.getByText("Reduzir o valor pago?")).toHaveCount(0);
  await expect(page.getByText("Pagamento atualizado")).toBeVisible();
  await page.getByText("Entendi").click();

  // Reload — the higher value round-trips.
  await page.goto(`/paciente/${paciente.id}`);
  await expect(page.getByText("PAGAMENTO")).toBeVisible();
  await expect(page.getByTestId("pagamento-valor-sinal")).toHaveValue("5000");
});

test("editing an open balance on mobile updates the public page + handoff message", async ({
  page,
}) => {
  paciente = await criarPacienteTeste();
  await page.goto(`/paciente/${paciente.id}`);
  await expect(page.getByText("PAGAMENTO")).toBeVisible();

  // Edit payment on mobile: paid R$ 5.000,00, pending R$ 1.500,00, due 20/11/2026.
  await page.getByTestId("pagamento-valor-sinal").fill("5000");
  await page.getByTestId("pagamento-valor-pendente").fill("1500");
  const dataField = page.getByTestId("pagamento-data-pendente");
  await expect(dataField).toBeVisible();
  await dataField.fill("2026-11-20");
  await page.getByTestId("pagamento-salvar").click();
  await expect(page.getByText("Pagamento atualizado")).toBeVisible();
  await page.getByText("Entendi").click();

  // PUBLIC PAGE: the honorários line must reflect the new due date and stay in
  // the pending state (open balance → "pagar até <vencimento>").
  await page.goto(`https://${webDomain}/p/${paciente.token}`);
  const honorarios = page.locator("li").filter({ hasText: "Honorários" }).first();
  await expect(honorarios).toContainText("pagar até");
  await expect(honorarios).toContainText("20/11/2026");
  await expect(honorarios).not.toContainText("pagamento confirmado");

  // HANDOFF MESSAGE: the confirmation text (A6) is where the R$ values live —
  // it must cite the new paid amount, the pending balance and the due date.
  const saidas = await obterSaidas(paciente.id);
  expect(saidas.a6).toContain("R$ 5.000,00");
  expect(saidas.a6).toContain("R$ 1.500,00");
  expect(saidas.a6).toContain("20/11/2026");
});

test("clearing the balance on mobile marks the public page paid + drops the pending text", async ({
  page,
}) => {
  paciente = await criarPacienteComPendente({
    valorPendente: 2000,
    dataPagamentoPendente: "2026-10-10",
  });
  await page.goto(`/paciente/${paciente.id}`);
  await expect(page.getByText("PAGAMENTO")).toBeVisible();

  // Settle the balance on mobile: raise the paid amount, clear the pending one.
  await page.getByTestId("pagamento-valor-sinal").fill("8000");
  await page.getByTestId("pagamento-valor-pendente").fill("0");
  await expect(page.getByTestId("pagamento-data-pendente")).toHaveCount(0);
  await page.getByTestId("pagamento-salvar").click();
  await expect(page.getByText("Pagamento atualizado")).toBeVisible();
  await page.getByText("Entendi").click();

  // PUBLIC PAGE: honorários must now read "pagamento confirmado" (no due date).
  await page.goto(`https://${webDomain}/p/${paciente.token}`);
  const honorarios = page.locator("li").filter({ hasText: "Honorários" }).first();
  await expect(honorarios).toContainText("pagamento confirmado");
  await expect(honorarios).not.toContainText("pagar até");

  // HANDOFF MESSAGE: A6 must show the new paid amount and drop the pending text.
  const saidas = await obterSaidas(paciente.id);
  expect(saidas.a6).toContain("R$ 8.000,00");
  expect(saidas.a6).not.toContain("valor pendente");
});
