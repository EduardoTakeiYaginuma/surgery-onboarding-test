import { test, expect } from "@playwright/test";

import {
  obterConfigNotificacao,
  definirConfigNotificacao,
  type ConfigNotificacao,
} from "./api";

/**
 * Team contract-alert settings on the mobile Console (app/avisos.tsx), exercised
 * against the real Expo web app + shared API server + database.
 *
 * The alert config is a singleton shared with the demo, so each test snapshots
 * the original config first and restores it afterwards — leaving the shared
 * state exactly as it was found.
 */

let original: ConfigNotificacao;

test.beforeEach(async () => {
  original = await obterConfigNotificacao();
});

test.afterEach(async () => {
  await definirConfigNotificacao(original);
});

test("loads the saved config, persists edits, and round-trips", async ({ page }) => {
  // Seed a known baseline straight through the API so the screen has something
  // concrete to load (active, with a destination).
  const semente = "https://hooks.slack.com/services/SEED-BASELINE";
  await definirConfigNotificacao({ webhookUrl: semente, silenciada: false });

  await page.goto("/avisos");

  // The screen loads the saved config into its fields.
  await expect(page.getByTestId("input-webhook")).toHaveValue(semente);
  await expect(page.getByText("Avisos ativos")).toBeVisible();

  // Edit the destination and pause the alerts.
  const novoDestino = `https://hooks.slack.com/services/E2E-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
  await page.getByTestId("input-webhook").fill(novoDestino);
  await page.getByTestId("switch-avisos").click();
  await expect(page.getByText("Avisos pausados")).toBeVisible();

  // Save. On success the screen navigates back (bypassing the unsaved guard).
  await page.getByTestId("salvar-avisos").click();

  // Re-open the screen from scratch — the saved values must round-trip from the
  // server into the inputs (a full reload, so nothing is served from memory).
  await page.goto("/avisos");
  await expect(page.getByTestId("input-webhook")).toHaveValue(novoDestino);
  await expect(page.getByText("Avisos pausados")).toBeVisible();

  // And the API agrees the change was actually persisted.
  const salvo = await obterConfigNotificacao();
  expect(salvo.webhookUrl).toBe(novoDestino);
  expect(salvo.silenciada).toBe(true);
});

test("warns before leaving with unsaved edits and does not persist them", async ({
  page,
}) => {
  const semente = "https://hooks.slack.com/services/GUARD-BASELINE";
  await definirConfigNotificacao({ webhookUrl: semente, silenciada: false });

  await page.goto("/avisos");
  await expect(page.getByTestId("input-webhook")).toHaveValue(semente);

  // Make a pending edit so the screen becomes dirty.
  const pendente = "https://hooks.slack.com/services/NAO-SALVO";
  await page.getByTestId("input-webhook").fill(pendente);

  // Attempt to leave via the header back button — the discard guard must fire.
  await page.getByTestId("voltar").click();
  await expect(page.getByText("Descartar alterações?")).toBeVisible();

  // "Continuar editando" keeps us on the screen with the edit intact.
  await page.getByTestId("continuar-editando").click();
  await expect(page.getByText("Descartar alterações?")).toHaveCount(0);
  await expect(page.getByTestId("input-webhook")).toHaveValue(pendente);

  // The pending edit must NOT have been persisted — the API still has the seed.
  const salvo = await obterConfigNotificacao();
  expect(salvo.webhookUrl).toBe(semente);
  expect(salvo.silenciada).toBe(false);
});
