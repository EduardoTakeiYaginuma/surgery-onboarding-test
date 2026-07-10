import { test, expect } from "@playwright/test";

import {
  definirConfigContrato,
  definirConfigNotificacao,
  obterConfigContrato,
  obterConfigNotificacao,
  type ConfigContrato,
  type ConfigNotificacao,
} from "./api";

/**
 * E2E coverage for the team-alert settings screen (route "/notificacoes",
 * page `src/pages/console-notificacoes.tsx`).
 *
 * The backend (config/notificacoes + config/contrato) is covered by route/unit
 * tests; this verifies the Console UI a real team uses: that they can set a
 * destination, toggle the alerts switch, save, and see the values survive a
 * reload — plus the inline destination guard that mirrors the backend so a
 * mistyped webhook can't silently disable the team's alerts.
 *
 * The notification config is a shared singleton in the dev database, so each
 * test snapshots the current values up front and restores them afterwards to
 * keep the demo state untouched.
 */

const SWITCH = 'button[role="switch"][aria-label="Ativar ou pausar os avisos"]';
const DESTINO = 'input[type="url"]';
const AVISO_DESTINO = /O destino precisa ser uma URL completa/;
const MSG_PRAZO_INVALIDO = "Informe um número inteiro de dias entre 0 e 60.";
const ENVIAR_TESTE = "Enviar teste";

/** The numeric input inside the section carrying the given heading text. */
function campoNumerico(
  page: import("@playwright/test").Page,
  tituloSecao: string,
) {
  return page
    .locator("section", { hasText: tituloSecao })
    .locator('input[type="number"]');
}

/** A different-but-still-valid (0..60) value so the assertion can't pass on stale state. */
function proximoValorValido(atual: number): number {
  return (atual + 3) % 61;
}

let configInicial: ConfigNotificacao;
let contratoInicial: ConfigContrato;

test.beforeEach(async ({ page }) => {
  // Preset the onboarding guard so the home "Como funciona" modal never makes
  // the page inert (it gates the first-visit experience via localStorage).
  await page.addInitScript(() =>
    localStorage.setItem("kcl-console-guia-visto", "1"),
  );
  configInicial = await obterConfigNotificacao();
  contratoInicial = await obterConfigContrato();
});

test.afterEach(async () => {
  if (configInicial) await definirConfigNotificacao(configInicial);
  if (contratoInicial) await definirConfigContrato(contratoInicial);
});

async function switchIsAtivo(page: import("@playwright/test").Page): Promise<boolean> {
  const state = await page.locator(SWITCH).getAttribute("data-state");
  return state === "checked";
}

test("set a destination, toggle alerts, save, and the values persist after reload", async ({
  page,
}) => {
  await page.goto("/notificacoes");

  // Wait for the form to hydrate (the destination input only renders once both
  // configs have loaded).
  const destino = page.locator(DESTINO);
  await expect(destino).toBeVisible();

  // A unique, valid webhook URL so the assertion can't pass on stale state.
  const url = `https://hooks.slack.com/services/E2E/${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  await destino.fill(url);

  // Flip the alerts switch and remember the state we expect to persist.
  const ativoAntes = await switchIsAtivo(page);
  await page.locator(SWITCH).click();
  const ativoEsperado = !ativoAntes;
  expect(await switchIsAtivo(page)).toBe(ativoEsperado);

  // Save — the button is disabled until there are unsaved changes.
  const salvar = page.getByRole("button", { name: "Salvar avisos" });
  await expect(salvar).toBeEnabled();
  await salvar.click();

  // Success confirmation.
  await expect(page.getByText("Avisos salvos", { exact: true })).toBeVisible();

  // The values must come back the same after a fresh load from the server.
  await page.reload();
  const destinoRecarregado = page.locator(DESTINO);
  await expect(destinoRecarregado).toBeVisible();
  await expect(destinoRecarregado).toHaveValue(url);
  expect(await switchIsAtivo(page)).toBe(ativoEsperado);
});

test("the inline destination guard disables Save for a bad URL, allows empty, and re-enables for a valid one", async ({
  page,
}) => {
  await page.goto("/notificacoes");

  const destino = page.locator(DESTINO);
  await expect(destino).toBeVisible();

  const salvar = page.getByRole("button", { name: "Salvar avisos" });
  const aviso = page.getByText(AVISO_DESTINO);

  // Make the form dirty via a field OTHER than the destination, so that Save's
  // enabled/disabled state tracks the destination guard alone (not the
  // unsaved-changes gate). Toggling the alerts switch is enough.
  await page.locator(SWITCH).click();

  // Baseline: with the destination still valid, no warning and Save is enabled.
  await expect(aviso).toHaveCount(0);
  await expect(salvar).toBeEnabled();

  // A non-empty value that isn't a valid http(s) URL ("slack.com" lacks the
  // scheme): the inline warning appears and Save is blocked.
  await destino.fill("slack.com");
  await expect(aviso).toBeVisible();
  await expect(salvar).toBeDisabled();

  // A proper https:// URL clears the warning and re-enables Save.
  await destino.fill("https://hooks.slack.com/services/E2E/guard");
  await expect(aviso).toHaveCount(0);
  await expect(salvar).toBeEnabled();

  // An empty destination is allowed (= no alerts): no warning, and Save stays
  // usable because the other fields are still valid.
  await destino.fill("");
  await expect(aviso).toHaveCount(0);
  await expect(salvar).toBeEnabled();
});

test("edit both deadline defaults with valid values, save, and they persist after reload", async ({
  page,
}) => {
  await page.goto("/notificacoes");

  // Both number fields only render once the contract config has loaded.
  const prazo = campoNumerico(page, "Prazo de assinatura do contrato");
  const vencimento = campoNumerico(page, "Vencimento do saldo");
  await expect(prazo).toBeVisible();
  await expect(vencimento).toBeVisible();

  // New, valid (0..60) values that differ from the current ones so the
  // persistence assertion can't pass on stale state.
  const novoPrazo = proximoValorValido(contratoInicial.prazoAssinaturaDiasAntes);
  const novoVencimento = proximoValorValido(
    contratoInicial.vencimentoSaldoDiasUteisAntes,
  );

  await prazo.fill(String(novoPrazo));
  await vencimento.fill(String(novoVencimento));

  const salvar = page.getByRole("button", { name: "Salvar avisos" });
  await expect(salvar).toBeEnabled();
  await salvar.click();

  await expect(page.getByText("Avisos salvos", { exact: true })).toBeVisible();

  // The values must come back the same after a fresh load from the server —
  // these defaults back-feed patient onboarding, so a silent reset would be a bug.
  await page.reload();
  const prazoRecarregado = campoNumerico(page, "Prazo de assinatura do contrato");
  const vencimentoRecarregado = campoNumerico(page, "Vencimento do saldo");
  await expect(prazoRecarregado).toBeVisible();
  await expect(prazoRecarregado).toHaveValue(String(novoPrazo));
  await expect(vencimentoRecarregado).toHaveValue(String(novoVencimento));
});

/**
 * Both deadline defaults feed patient onboarding downstream (the contract
 * sign-by date and the balance due date), so each field is whole-numbers-only
 * between 0 and 60. These guards mirror the same `Number.isInteger(...) && 0..60`
 * check in the page and disable "Salvar avisos" inline — a refactor that
 * re-enabled Save with a bad value would let the team save a broken default.
 *
 * The two fields share one guard implementation, so the cases are run against
 * both to catch a regression that only re-wires one of them.
 */
const CAMPOS_PRAZO = [
  {
    titulo: "Prazo de assinatura do contrato",
    valorBase: () => contratoInicial.prazoAssinaturaDiasAntes,
  },
  {
    titulo: "Vencimento do saldo",
    valorBase: () => contratoInicial.vencimentoSaldoDiasUteisAntes,
  },
] as const;

for (const campo of CAMPOS_PRAZO) {
  test(`the "${campo.titulo}" guard blocks Save for empty/negative/out-of-range/non-integer values and re-enables for a valid one`, async ({
    page,
  }) => {
    await page.goto("/notificacoes");

    const input = campoNumerico(page, campo.titulo);
    await expect(input).toBeVisible();

    const salvar = page.getByRole("button", { name: "Salvar avisos" });
    // Scope the warning to THIS field's section so we don't pick up the twin
    // field's identical message.
    const aviso = page
      .locator("section", { hasText: campo.titulo })
      .getByText(MSG_PRAZO_INVALIDO, { exact: true });

    // Each invalid value makes the form dirty (it differs from the saved
    // baseline) yet must surface the inline warning and keep Save disabled, so a
    // bad default can never reach the server. (A real user can't type letters
    // into a number input — the browser drops them, leaving the field empty —
    // so the empty case stands in for the "abc" / non-numeric input.)
    for (const invalido of ["", "-1", "99", "2.5"]) {
      await input.fill(invalido);
      await expect(aviso).toBeVisible();
      await expect(salvar).toBeDisabled();
    }

    // A valid (0..60) whole number that differs from the saved value clears the
    // warning and re-enables Save (the other fields are still valid).
    const valido = proximoValorValido(campo.valorBase());
    await input.fill(String(valido));
    await expect(aviso).toHaveCount(0);
    await expect(salvar).toBeEnabled();
  });
}

/**
 * The "Enviar teste" button is how the team gains confidence their destination
 * works. The trust-critical risk is the UI reporting success when delivery
 * actually failed (or vice-versa). The backend (`enviarAvisoTeste` +
 * POST /config/notificacoes/testar) is covered by route/unit tests; these e2e
 * checks pin the *UI mapping* of each backend `resultado` to the right toast,
 * by intercepting the test call so every outcome is exercised deterministically
 * without depending on a live external webhook.
 */

const SUCESSO = "Teste enviado";
const FALHA = "O destino não aceitou o teste";

test('"Enviar teste" reports success only when the destination accepts the message', async ({
  page,
}) => {
  await page.goto("/notificacoes");
  const destino = page.locator(DESTINO);
  await expect(destino).toBeVisible();

  const url = `https://hooks.slack.com/services/E2E/${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  await destino.fill(url);

  // Intercept the test call and confirm the UI actually sends the typed
  // destination (so the assertion can't pass on a stale/blank request), then
  // return the backend's "enviado" outcome.
  let corpoEnviado: { webhookUrl?: string } | null = null;
  await page.route("**/config/notificacoes/testar", async (route) => {
    corpoEnviado = route.request().postDataJSON() as { webhookUrl?: string };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ resultado: "enviado" }),
    });
  });

  await page.getByRole("button", { name: ENVIAR_TESTE }).click();

  // The success toast confirms the destination accepted the message...
  await expect(page.getByText(SUCESSO, { exact: true })).toBeVisible();
  // ...and the failure toast must NOT be showing alongside it.
  await expect(page.getByText(FALHA, { exact: true })).toHaveCount(0);

  expect(corpoEnviado).not.toBeNull();
  expect(corpoEnviado!.webhookUrl).toBe(url);
});

test('"Enviar teste" reports failure (never a false success) when the destination rejects', async ({
  page,
}) => {
  await page.goto("/notificacoes");
  const destino = page.locator(DESTINO);
  await expect(destino).toBeVisible();

  const url = `https://hooks.slack.com/services/E2E/${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  await destino.fill(url);

  // The destination rejects the delivery (backend returns "falha" with the HTTP
  // status it got back). This is the core guard: a rejected delivery must never
  // surface as success.
  await page.route("**/config/notificacoes/testar", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ resultado: "falha", status: 502 }),
    });
  });

  await page.getByRole("button", { name: ENVIAR_TESTE }).click();

  // The destructive toast surfaces the failure (and echoes the HTTP status).
  // Match the description exactly so it resolves to the visible toast text and
  // not the aria-live status mirror (which concatenates title + description).
  await expect(page.getByText(FALHA, { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "O destino respondeu com erro (HTTP 502). Confira a URL e tente de novo.",
      { exact: true },
    ),
  ).toBeVisible();
  // ...and the success toast must NOT have appeared — no false "it works".
  await expect(page.getByText(SUCESSO, { exact: true })).toHaveCount(0);
});

test('"Enviar teste" is blocked with an empty destination (no false success)', async ({
  page,
}) => {
  await page.goto("/notificacoes");
  const destino = page.locator(DESTINO);
  await expect(destino).toBeVisible();

  // Clear the destination — the UI must not let an empty field be "tested",
  // which is the sem-webhook outcome surfaced as a disabled control.
  await destino.fill("");

  const enviar = page.getByRole("button", { name: ENVIAR_TESTE });
  await expect(enviar).toBeDisabled();

  // Typing a destination re-enables it, and clearing it again disables it — so
  // the guard tracks the field, it isn't just permanently off.
  await destino.fill("https://hooks.slack.com/services/E2E/abc12345");
  await expect(enviar).toBeEnabled();
  await destino.fill("");
  await expect(enviar).toBeDisabled();

  // And no success toast could ever have fired from the empty state.
  await expect(page.getByText(SUCESSO, { exact: true })).toHaveCount(0);
});
