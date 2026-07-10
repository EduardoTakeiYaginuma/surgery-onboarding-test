import { test, expect } from "@playwright/test";

import { arquivarPaciente, criarPacienteTeste, gerarCpfValido, type CreatedPaciente } from "./api";

/**
 * End-to-end guard for the ARCHIVED-CPF branch of the duplicate-CPF block,
 * exercised through the real mobile "Novo handoff" wizard (Expo web target) +
 * shared API server.
 *
 * Unlike an ACTIVE duplicate (codigo "cpf_ativo", covered by cpf-duplicado.spec.ts),
 * a match against an ARCHIVED patient is NOT an error: the API returns HTTP 409
 * `{ codigo: "cpf_arquivado", ... }` with a guidance message — "Já existe um
 * cadastro arquivado com este CPF. Restaure-o ou crie um novo cadastro." — so a
 * returning patient is steered to restore instead of silently re-blocked. The
 * mobile wizard surfaces that server guidance verbatim in its error banner (it
 * has no in-place restore dialog; restoring is done from the Console). This test
 * proves that the archived-CPF guidance banner actually appears (and the wizard
 * stays put) when the submitted CPF belongs to a real archived record.
 */

const TELEFONE_VALIDO = "11987654321";
// The verbatim server guidance for the archived-CPF branch — the "restore"
// affordance the mobile wizard surfaces (distinct from the cpf_ativo message).
const MENSAGEM_CPF_ARQUIVADO =
  "Já existe um cadastro arquivado com este CPF. Restaure-o ou crie um novo cadastro.";

const DESC_CIRURGIA = "Onde, quando e o que será feito";
const DESC_PAGAMENTO = "Valores e vencimento do saldo";
const DESC_REVISAR = "Confira tudo antes de gerar o handoff";

// The pre-existing patient that owns the duplicated CPF. Seeded then ARCHIVED in
// beforeEach so the wizard submit collides with a real archived record. Stays
// archived after the test, so it leaves the demo list as it found it — no
// afterEach cleanup needed.
let arquivada: CreatedPaciente | null = null;

test.beforeEach(async () => {
  // Seed an active patient with a known, checksum-valid CPF, then archive it so
  // the same CPF lives only on an ARCHIVED record when the wizard submits below.
  arquivada = await criarPacienteTeste({ cpf: gerarCpfValido() });
  await arquivarPaciente(arquivada.id);
});

test("submitting the wizard with an archived CPF shows the restore guidance banner", async ({
  page,
}) => {
  const cpfArquivado = arquivada!.cpf;

  await page.goto("/novo");
  await expect(page.getByText("Quem é a paciente")).toBeVisible();

  // Step 1 — Paciente: a valid name + phone, but the CPF of the archived patient.
  await page.getByTestId("input-nome").fill("ZZ Arquivada Mobile");
  await page.getByTestId("input-cpf").fill(cpfArquivado);
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
  // validation and reaches the server, which answers with the 409 cpf_arquivado
  // branch.
  await expect(page.getByText(DESC_REVISAR)).toBeVisible();
  await page.getByTestId("salvar").click();

  // The archived-CPF guidance must surface in the wizard's error banner, and the
  // wizard must stay put (no navigation to a patient detail screen) — a returning
  // patient is steered to restore, never silently re-blocked.
  await expect(page.getByText(MENSAGEM_CPF_ARQUIVADO)).toBeVisible();
  await expect(page).not.toHaveURL(/\/paciente\/\d+/);
});
