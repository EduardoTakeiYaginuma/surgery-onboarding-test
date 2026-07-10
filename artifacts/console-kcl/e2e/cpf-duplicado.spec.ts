import { test, expect } from "@playwright/test";

import {
  arquivarPaciente,
  criarPacienteTeste,
  gerarCpfValido,
  type CreatedPaciente,
} from "./api";

/**
 * End-to-end guard for the server-side duplicate-CPF block, exercised through
 * the real Console "Novo paciente" wizard + shared API server.
 *
 * The API rejects a POST /pacientes whose CPF already belongs to an ACTIVE
 * patient with HTTP 409 `{ codigo: "cpf_ativo", message: "Este CPF já está
 * cadastrado para outra paciente." }`. The dialog turns that into a destructive
 * toast whose description is the server message (`toastErroAcao`). This test
 * proves the toast actually appears for a real duplicate — the UI half of the
 * contract the api-server unit tests cover on the server half.
 *
 * (The archived-CPF path is deliberately NOT covered here: an archived match
 * opens the "restaurar ou criar novo" AlertDialog instead of the toast. This
 * test seeds an ACTIVE patient, which is the `cpf_ativo` branch.)
 */

// The "Novo paciente" dialog is fixed-centered (translateY(-50%)) and, on the
// non-review steps, has no internal scroll — so on the surgery step it grows
// taller than the default 800px viewport and its footer ("Avançar") ends up
// outside the viewport, unscrollable. A tall viewport keeps the whole dialog on
// screen for the wizard walkthrough.
test.use({ viewport: { width: 1280, height: 1600 } });

const MENSAGEM_CPF_DUPLICADO = "Este CPF já está cadastrado para outra paciente.";

// The pre-existing active patient that owns the duplicated CPF. Archived after
// each test so it leaves the shared demo list as it found it.
let existente: CreatedPaciente | null = null;

test.beforeEach(async ({ page }) => {
  // Seed an active patient with a known, checksum-valid CPF straight through the
  // API, so the wizard submit below collides with a real active record.
  existente = await criarPacienteTeste({ cpf: gerarCpfValido() });
  // Suppress the first-visit onboarding modal (suite convention) — it makes the
  // home page inert otherwise.
  await page.addInitScript(() =>
    localStorage.setItem("kcl-console-guia-visto", "1"),
  );
});

test.afterEach(async () => {
  if (existente) {
    await arquivarPaciente(existente.id);
    existente = null;
  }
});

test("submitting the novo-paciente dialog with an existing CPF shows the duplicate toast", async ({
  page,
}) => {
  const cpfDuplicado = existente!.cpf;

  await page.goto("/");
  await page.getByRole("button", { name: "Novo paciente" }).first().click();

  // Step 1 — Paciente: a valid name + phone, but the CPF of the existing patient.
  await page.getByPlaceholder("Ex: Maria Silva").fill("ZZ Duplicada Console");
  await page.getByPlaceholder("000.000.000-00").fill(cpfDuplicado);
  await page.getByPlaceholder("(11) 90000-0000").fill("11987654321");
  await page.getByRole("button", { name: "Avançar" }).click();

  // Step 2 — Cirurgia: hospital, procedure, date, time and anesthesia team so
  // the step passes its zod validation.
  await page
    .getByRole("combobox")
    .filter({ hasText: "Selecione o hospital" })
    .click();
  await page.getByRole("option").first().click();

  await page.getByRole("button", { name: "Blefaroplastia", exact: true }).click();

  // Date picker (custom popover calendar): pick day 15 of next month so it is
  // always in the future regardless of today's date.
  await page.getByRole("button", { name: "Escolher data da cirurgia" }).click();
  await page.getByRole("button", { name: "Go to the Next Month" }).click();
  await page.getByRole("button", { name: /\b15 de .+ de 20\d\d/ }).click();

  // Time picker (custom popover): hour 09 then minute 30 → 09:30.
  await page.getByRole("button", { name: "Escolher horário da cirurgia" }).click();
  await page.getByRole("button", { name: "09", exact: true }).click();
  await page.getByRole("button", { name: "30", exact: true }).click();

  await page
    .getByRole("combobox")
    .filter({ hasText: "Selecione a equipe" })
    .click();
  await page.getByRole("option").first().click();

  await page.getByRole("button", { name: "Avançar" }).click();

  // Step 3 — Pagamento: the default valor pago (0) is valid, just advance.
  await page.getByRole("button", { name: "Avançar" }).click();

  // Step 4 — Revisar: confirm. The CPF is locally valid, so it reaches the
  // server, which rejects it with the 409.
  await page.getByRole("button", { name: /Confirmar e gerar link/ }).click();

  // The server message must surface in the destructive toast. The same string
  // is also mirrored into an aria-live status region, so scope to the visible
  // toast description to keep the locator unambiguous.
  await expect(
    page.getByText(MENSAGEM_CPF_DUPLICADO, { exact: true }),
  ).toBeVisible();
});
