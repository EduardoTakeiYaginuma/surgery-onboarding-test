import { test, expect } from "@playwright/test";

import { arquivarPaciente, criarPacienteTeste, gerarCpfValido, type CreatedPaciente } from "./api";

/**
 * End-to-end guard for the server-side duplicate-CPF block, exercised through
 * the real mobile "Novo handoff" wizard (Expo web target) + shared API server.
 *
 * The API rejects a POST /pacientes whose CPF already belongs to an ACTIVE
 * patient with HTTP 409 `{ codigo: "cpf_ativo", message: "Este CPF já está
 * cadastrado para outra paciente." }`. On the Revisar step the mobile screen
 * surfaces that server message in its error banner (`mensagemServidor`). This
 * test proves the banner actually appears for a real duplicate — the UI half of
 * the contract the api-server unit tests cover on the server half.
 */

const TELEFONE_VALIDO = "11987654321";
const MENSAGEM_CPF_DUPLICADO = "Este CPF já está cadastrado para outra paciente.";

const DESC_CIRURGIA = "Onde, quando e o que será feito";
const DESC_PAGAMENTO = "Valores e vencimento do saldo";
const DESC_REVISAR = "Confira tudo antes de gerar o handoff";

// The pre-existing active patient that owns the duplicated CPF. Archived after
// each test so it leaves the shared demo list as it found it.
let existente: CreatedPaciente | null = null;

test.beforeEach(async () => {
  // Seed an active patient with a known, checksum-valid CPF straight through the
  // API, so the wizard submit below collides with a real active record.
  existente = await criarPacienteTeste({ cpf: gerarCpfValido() });
});

test.afterEach(async () => {
  if (existente) {
    await arquivarPaciente(existente.id);
    existente = null;
  }
});

test("submitting the wizard with an already-used CPF shows the server error banner", async ({
  page,
}) => {
  const cpfDuplicado = existente!.cpf;

  await page.goto("/novo");
  await expect(page.getByText("Quem é a paciente")).toBeVisible();

  // Step 1 — Paciente: a valid name + phone, but the CPF of the existing patient.
  await page.getByTestId("input-nome").fill("ZZ Duplicada Mobile");
  await page.getByTestId("input-cpf").fill(cpfDuplicado);
  await page.getByTestId("input-telefone").fill(TELEFONE_VALIDO);
  await page.getByTestId("avancar").click();

  // Step 2 — Cirurgia: a procedure + a date so the step is valid.
  await expect(page.getByText(DESC_CIRURGIA)).toBeVisible();
  await page.getByTestId("chip-procedimento-Blefaroplastia").click();
  await page.getByTestId("input-data").fill("2026-08-15");
  await page.getByTestId("avancar").click();

  // Step 3 — Pagamento: a positive valor pago.
  await expect(page.getByText(DESC_PAGAMENTO)).toBeVisible();
  await page.getByTestId("input-valor").fill("5000");
  await page.getByTestId("avancar").click();

  // Step 4 — Revisar: submit. The CPF is locally valid, so it passes client
  // validation and reaches the server, which rejects it with the 409.
  await expect(page.getByText(DESC_REVISAR)).toBeVisible();
  await page.getByTestId("salvar").click();

  // The server message must surface in the wizard's error banner, and the
  // wizard must stay put (no navigation to a patient detail screen).
  await expect(page.getByText(MENSAGEM_CPF_DUPLICADO)).toBeVisible();
  await expect(page).not.toHaveURL(/\/paciente\/\d+/);
});
