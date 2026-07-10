import { test, expect } from "@playwright/test";

import { arquivarPaciente } from "./api";

/**
 * The mobile "Novo handoff" screen is a 4-step guided wizard
 * (Paciente → Cirurgia → Pagamento → Revisar) with per-step validation gating
 * and a review step before submission. These tests exercise it against the real
 * Expo web app + shared API server, proving: advancing is blocked on invalid
 * steps, valid steps advance, the review summary reflects what was entered,
 * "Editar" jumps back keeping values, and a valid submission creates the
 * patient and lands on the detail screen.
 */

// A valid Brazilian CPF checksum + phone shape accepted by the form's validation.
const CPF_VALIDO = "11144477735";
const TELEFONE_VALIDO = "11987654321";

/**
 * Generate a fresh, checksum-valid CPF for the happy-path create. The API
 * enforces a unique CPF (even against archived patients), so a fixed value
 * would collide across runs — each create needs its own.
 */
function gerarCpfValido(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const digito = (nums: number[], pesoInicial: number): number => {
    let soma = 0;
    for (let i = 0; i < nums.length; i++) soma += nums[i] * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = digito(base, 10);
  const d2 = digito([...base, d1], 11);
  return [...base, d1, d2].join("");
}

function formatCpf(cpf: string): string {
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

// Per-step description copy — unique per step, so it doubles as a reliable
// "which step am I on" signal (the bare step title "Paciente" also appears in
// the progress indicator and the heading).
const DESC_PACIENTE = "Quem é a paciente";
const DESC_CIRURGIA = "Onde, quando e o que será feito";
const DESC_PAGAMENTO = "Valores e vencimento do saldo";
const DESC_REVISAR = "Confira tudo antes de gerar o handoff";

// Patient created through the UI in the happy-path test; archived afterwards so
// it stays out of the active demo list.
let createdId: number | null = null;

test.afterEach(async () => {
  if (createdId != null) {
    await arquivarPaciente(createdId);
    createdId = null;
  }
});

test("blocks advancing past invalid steps and surfaces field errors", async ({ page }) => {
  await page.goto("/novo");
  await expect(page.getByText(DESC_PACIENTE)).toBeVisible();

  // Step 1 (Paciente): advancing with an empty form is blocked and shows errors.
  await page.getByTestId("avancar").click();
  await expect(page.getByText("Informe o nome do paciente.")).toBeVisible();
  await expect(page.getByText("Informe um CPF válido.")).toBeVisible();
  await expect(page.getByText("Informe um telefone válido com DDD.")).toBeVisible();
  // Did not advance — the Cirurgia step copy is not on screen.
  await expect(page.getByText(DESC_CIRURGIA)).toHaveCount(0);

  // A valid name + phone but an invalid CPF still blocks on the CPF error.
  await page.getByTestId("input-nome").fill("Maria Wizard");
  await page.getByTestId("input-telefone").fill(TELEFONE_VALIDO);
  await page.getByTestId("input-cpf").fill("123");
  await page.getByTestId("avancar").click();
  await expect(page.getByText("Informe um CPF válido.")).toBeVisible();
  await expect(page.getByText(DESC_CIRURGIA)).toHaveCount(0);

  // Fix the CPF — now it advances to step 2 (Cirurgia).
  await page.getByTestId("input-cpf").fill(CPF_VALIDO);
  await page.getByTestId("avancar").click();
  await expect(page.getByText(DESC_CIRURGIA)).toBeVisible();

  // Step 2 (Cirurgia): no procedure + no date blocks advance with both errors.
  await page.getByTestId("avancar").click();
  await expect(page.getByText("Escolha ou descreva ao menos um procedimento.")).toBeVisible();
  await expect(page.getByText("Escolha a data da cirurgia.")).toBeVisible();
  await expect(page.getByText(DESC_PAGAMENTO)).toHaveCount(0);

  // Pick a procedure + a date — advances to step 3 (Pagamento).
  await page.getByTestId("chip-procedimento-Blefaroplastia").click();
  await page.getByTestId("input-data").fill("2026-08-15");
  await page.getByTestId("avancar").click();
  await expect(page.getByText(DESC_PAGAMENTO)).toBeVisible();

  // Step 3 (Pagamento): an empty/zero "valor pago" blocks advance to Revisar.
  await page.getByTestId("avancar").click();
  await expect(page.getByText("Informe um valor maior que zero.")).toBeVisible();
  await expect(page.getByText(DESC_REVISAR)).toHaveCount(0);
});

test("balance-due date appears/required when pending > 0, hides when cleared, shown in review", async ({ page }) => {
  await page.goto("/novo");
  await expect(page.getByText(DESC_PACIENTE)).toBeVisible();

  // Step 1 — Paciente (use fixed valid CPF; no submit, so no uniqueness issue).
  await page.getByTestId("input-nome").fill("Maria Pendente");
  await page.getByTestId("input-cpf").fill(CPF_VALIDO);
  await page.getByTestId("input-telefone").fill(TELEFONE_VALIDO);
  await page.getByTestId("avancar").click();

  // Step 2 — Cirurgia.
  await expect(page.getByText(DESC_CIRURGIA)).toBeVisible();
  await page.getByTestId("chip-procedimento-Blefaroplastia").click();
  await page.getByTestId("input-data").fill("2026-08-15");
  await page.getByTestId("avancar").click();

  // Step 3 — Pagamento: fill valor sinal and a positive valor pendente.
  await expect(page.getByText(DESC_PAGAMENTO)).toBeVisible();
  await page.getByTestId("input-valor").fill("5000");

  // "Vencimento do saldo" must not be on screen yet (pending is zero/empty).
  await expect(page.getByTestId("input-data-pendente")).toHaveCount(0);

  // Enter a positive pending amount — due-date field must appear.
  await page.getByTestId("input-valor-pendente").fill("2000");
  await expect(page.getByTestId("input-data-pendente")).toBeVisible();

  // Advancing without filling the due date must be blocked with the right error.
  await page.getByTestId("avancar").click();
  await expect(page.getByText("Escolha o vencimento do saldo.")).toBeVisible();
  await expect(page.getByText(DESC_REVISAR)).toHaveCount(0);

  // Fill the due date — step must advance to Revisar.
  await page.getByTestId("input-data-pendente").fill("2026-09-30");
  await page.getByTestId("avancar").click();
  await expect(page.getByText(DESC_REVISAR)).toBeVisible();

  // Review summary must show the pending value and its formatted due date.
  await expect(page.getByText("R$ 2.000,00")).toBeVisible();
  await expect(page.getByText("30/09/2026")).toBeVisible();

  // Go back to Pagamento via "Editar" and clear the pending amount.
  await page.getByTestId("editar-pagamento").click();
  await expect(page.getByText(DESC_PAGAMENTO)).toBeVisible();
  await page.getByTestId("input-valor-pendente").fill("0");

  // Due-date field must disappear when pending drops to zero.
  await expect(page.getByTestId("input-data-pendente")).toHaveCount(0);
});

test("reviews entered values, supports Editar back-navigation, and creates a patient", async ({ page }) => {
  const nome = `ZZ Wizard E2E ${Math.random().toString(36).slice(2, 7)}`;
  const cpf = gerarCpfValido();

  await page.goto("/novo");
  await expect(page.getByText(DESC_PACIENTE)).toBeVisible();

  // Step 1 — Paciente.
  await page.getByTestId("input-nome").fill(nome);
  await page.getByTestId("input-cpf").fill(cpf);
  await page.getByTestId("input-telefone").fill(TELEFONE_VALIDO);
  await page.getByTestId("avancar").click();

  // Step 2 — Cirurgia.
  await expect(page.getByText(DESC_CIRURGIA)).toBeVisible();
  await page.getByTestId("chip-procedimento-Blefaroplastia").click();
  await page.getByTestId("input-data").fill("2026-08-15");
  await page.getByTestId("avancar").click();

  // Step 3 — Pagamento.
  await expect(page.getByText(DESC_PAGAMENTO)).toBeVisible();
  await page.getByTestId("input-valor").fill("5000");
  await page.getByTestId("avancar").click();

  // Step 4 — Revisar: the summary reflects everything entered above, formatted.
  await expect(page.getByText(DESC_REVISAR)).toBeVisible();
  await expect(page.getByText(nome)).toBeVisible();
  await expect(page.getByText(formatCpf(cpf))).toBeVisible();
  await expect(page.getByText("(11) 98765-4321")).toBeVisible();
  await expect(page.getByText("Blefaroplastia")).toBeVisible();
  await expect(page.getByText("15/08/2026")).toBeVisible();
  await expect(page.getByText("R$ 5.000,00")).toBeVisible();

  // "Editar" on the Paciente group jumps back to step 1 with values intact.
  await page.getByTestId("editar-paciente").click();
  await expect(page.getByText(DESC_PACIENTE)).toBeVisible();
  await expect(page.getByTestId("input-nome")).toHaveValue(nome);

  // Walk forward again through the (still valid) steps back to Revisar.
  await page.getByTestId("avancar").click();
  await expect(page.getByText(DESC_CIRURGIA)).toBeVisible();
  await page.getByTestId("avancar").click();
  await expect(page.getByText(DESC_PAGAMENTO)).toBeVisible();
  await page.getByTestId("avancar").click();
  await expect(page.getByText(DESC_REVISAR)).toBeVisible();

  // Submit — a successful create navigates to the patient detail screen.
  // expo-router does a client-side route change (no full page load), so poll the
  // URL with toHaveURL rather than waitForURL (which waits on a load event).
  await page.getByTestId("salvar").click();
  await expect(page).toHaveURL(/\/paciente\/\d+/);
  const match = page.url().match(/\/paciente\/(\d+)/);
  expect(match).not.toBeNull();
  createdId = Number(match![1]);

  // "ENTREGA PRINCIPAL" is unique to the detail screen — proves the create landed.
  await expect(page.getByText("ENTREGA PRINCIPAL")).toBeVisible();
});
