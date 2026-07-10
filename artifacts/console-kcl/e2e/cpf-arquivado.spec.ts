import { test, expect } from "@playwright/test";

import {
  arquivarPaciente,
  criarPacienteTeste,
  gerarCpfValido,
  type CreatedPaciente,
} from "./api";

/**
 * End-to-end guard for the ARCHIVED-CPF branch of the duplicate-CPF block,
 * exercised through the real Console "Novo paciente" wizard + shared API server.
 *
 * Unlike an ACTIVE duplicate (codigo "cpf_ativo" → destructive toast, covered by
 * cpf-duplicado.spec.ts), a match against an ARCHIVED patient is NOT an error: the
 * API returns HTTP 409 `{ codigo: "cpf_arquivado", pacienteArquivado: {...} }` and
 * the dialog opens a "restaurar ou criar novo" AlertDialog so a returning patient
 * is restored instead of silently re-blocked. This test proves that the restore
 * AlertDialog actually appears (and the destructive error toast does NOT) when the
 * submitted CPF belongs to a real archived record — the UI half of the contract
 * the api-server unit tests cover on the server half.
 */

// The "Novo paciente" dialog is fixed-centered (translateY(-50%)) and, on the
// non-review steps, has no internal scroll — so on the surgery step it grows
// taller than the default 800px viewport and its footer ("Avançar") ends up
// outside the viewport, unscrollable. A tall viewport keeps the whole dialog on
// screen for the wizard walkthrough.
test.use({ viewport: { width: 1280, height: 1600 } });

// The destructive toast title the dialog shows for a generic create failure —
// asserted ABSENT here to prove we took the restore branch, not the error branch.
const TITULO_TOAST_ERRO = "Não foi possível cadastrar a paciente";

// The pre-existing patient that owns the duplicated CPF. Seeded then ARCHIVED in
// beforeEach, so the wizard submit collides with a real archived record. Stays
// archived after the test (it is never restored), so it leaves the demo list as
// it found it — no afterEach cleanup needed.
let arquivada: CreatedPaciente | null = null;

test.beforeEach(async ({ page }) => {
  // Seed an active patient with a known, checksum-valid CPF, then archive it so
  // the same CPF lives only on an ARCHIVED record when the wizard submits below.
  arquivada = await criarPacienteTeste({ cpf: gerarCpfValido() });
  await arquivarPaciente(arquivada.id);
  // Suppress the first-visit onboarding modal (suite convention) — it makes the
  // home page inert otherwise.
  await page.addInitScript(() =>
    localStorage.setItem("kcl-console-guia-visto", "1"),
  );
});

test("submitting the novo-paciente dialog with an archived CPF opens the restore dialog", async ({
  page,
}) => {
  const cpfArquivado = arquivada!.cpf;

  await page.goto("/");
  await page.getByRole("button", { name: "Novo paciente" }).first().click();

  // Step 1 — Paciente: a valid name + phone, but the CPF of the archived patient.
  await page.getByPlaceholder("Ex: Maria Silva").fill("ZZ Arquivada Console");
  await page.getByPlaceholder("000.000.000-00").fill(cpfArquivado);
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
  // server, which answers with the 409 cpf_arquivado branch.
  await page.getByRole("button", { name: /Confirmar e gerar link/ }).click();

  // The restore AlertDialog must open — its title plus the "Restaurar cadastro"
  // CTA prove the returning-patient branch, not the destructive error toast.
  await expect(
    page.getByRole("heading", { name: "Cadastro arquivado com este CPF" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Restaurar cadastro" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Criar novo cadastro" }),
  ).toBeVisible();

  // And the generic create-failure toast must NOT appear — the archived match is
  // an offer to restore, never a silent block.
  await expect(page.getByText(TITULO_TOAST_ERRO)).toHaveCount(0);
});
