import { test, expect } from "@playwright/test";

import {
  arquivarPaciente,
  criarPacienteTeste,
  garantirModeloBaseContratoVigente,
  gerarRascunhoContratoPaciente,
  listarGeracoesPaciente,
  type CreatedPaciente,
  type GeracaoResumo,
  type ModeloBaseVigente,
} from "./api";

/**
 * Guard for "a FAILED Autentique send never loses an approved contract".
 *
 * The write path "Aprovar e enviar à Autentique"
 * (POST /api/contratos/:id/aprovar-e-enviar → handleAprovarEEnviar) records the
 * approval FIRST and only then creates the document on Autentique. If that
 * create call fails, the server marks the generation `falha_envio` (keeping the
 * approval + draft intact, NOT touching the patient's contract) and the Console
 * is supposed to surface the failure (toast + "Último erro de envio" panel) so
 * the team can retry — never silently succeed or drop the contract.
 *
 * The server's falha_envio branch already has unit coverage in
 * artifacts/api-server/src/routes/contratos.test.ts (it mocks the Autentique
 * create to reject). This test is the Console-side complement: it proves the UI
 * reacts correctly to a failed send AND — reading the AUTHORITATIVE state
 * straight from the API, outside the browser — that the generation is NOT lost
 * or mis-bound (same id/patient/tipo, body unchanged) and stays retryable.
 *
 * IMPORTANT: the api-server runtime has a LIVE Autentique token, so a real
 * aprovar-e-enviar would create an actual remote document (not free, not
 * deterministic). So we intercept the browser network instead:
 *   - the POST is fulfilled with 502 (the same status the server returns for a
 *     CriarContratoError) — deterministic and free, no real Autentique call;
 *   - the generations GET starts returning the failed shape (status
 *     `falha_envio` + erroEnvio + preserved aprovadoPor) only AFTER that POST,
 *     mirroring exactly what the server would have persisted, so the Console
 *     surfaces the recoverable failure state.
 * The authoritative check then reads the REAL API (no browser, so the mocks
 * don't apply): the draft survived intact and bound — the contract is never
 * lost, even when the send fails.
 */

const APROVADOR = "Equipe E2E";
const ERRO_ENVIO_MOCK =
  "A Autentique recusou a criação (HTTP 503). Tente novamente.";

let paciente: CreatedPaciente;
let modeloBase: ModeloBaseVigente;

test.beforeAll(async () => {
  // Generation resolves the single vigente base model; make sure it's active so
  // the draft can be created independent of the shared dev DB's seed state.
  modeloBase = await garantirModeloBaseContratoVigente();
});

test.afterAll(async () => {
  if (modeloBase) await modeloBase.restaurar();
});

test.afterEach(async () => {
  if (paciente) await arquivarPaciente(paciente.id);
});

test("a failed Autentique send surfaces the error and never loses the approved contract", async ({
  page,
}) => {
  paciente = await criarPacienteTeste();

  // Create a real draft via the API so the test owns its starting state without
  // depending on the generation UI.
  await gerarRascunhoContratoPaciente(paciente.id);

  // Snapshot the AUTHORITATIVE draft state before the (failing) send.
  const antes = await listarGeracoesPaciente(paciente.id);
  expect(antes).toHaveLength(1);
  const rascunhoAntes: GeracaoResumo = antes[0];
  expect(rascunhoAntes.pacienteId).toBe(paciente.id);
  expect(rascunhoAntes.tipo).toBe("contrato");
  expect(rascunhoAntes.status).toBe("rascunho");

  // Onboarding modal only guards "/"; init script kept as a harmless safety net.
  await page.addInitScript(() =>
    localStorage.setItem("kcl-console-guia-visto", "1"),
  );
  await page.goto("/documentos");

  // Pick the patient from the searchable list (contrato is the default tipo).
  await page.getByPlaceholder("Buscar por nome").fill(paciente.nome);
  await page.getByRole("button", { name: paciente.nome }).click();

  // The lone draft auto-selects, so the editor + approval panel render.
  const editor = page.locator(".editor-doc").first();
  await expect(editor).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("heading", { name: "Contratos gerados" }),
  ).toBeVisible();

  // Mock ONLY the Autentique write path so it FAILS — deterministic and free
  // (no real document is created). `enviouFalhou` flips the generations GET to
  // the failed shape the server WOULD have persisted, so the Console re-fetch
  // after the failure shows the recoverable state.
  let enviouFalhou = false;

  await page.route(
    /\/api\/contratos\/\d+\/aprovar-e-enviar$/,
    async (route) => {
      enviouFalhou = true;
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ message: ERRO_ENVIO_MOCK }),
      });
    },
  );

  await page.route(
    new RegExp(`/api/pacientes/${paciente.id}/contratos(\\?|$)`),
    async (route) => {
      if (!enviouFalhou) {
        await route.continue();
        return;
      }
      // Take the REAL list and overlay exactly what marcarFalhaEnvio + aprovar
      // would have written, so the Console renders the genuine failure surface.
      const resp = await route.fetch();
      const lista = (await resp.json()) as GeracaoResumo[];
      const falha = lista.map((g) => ({
        ...g,
        status: "falha_envio",
        erroEnvio: ERRO_ENVIO_MOCK,
        aprovadoPor: APROVADOR,
        aprovadoEm: new Date().toISOString(),
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(falha),
      });
    },
  );

  // Approve & send: fill the auditor, open the confirm dialog, confirm.
  await page.getByPlaceholder("Seu nome (auditoria)").fill(APROVADOR);
  await page
    .getByRole("button", { name: "Aprovar e enviar à Autentique" })
    .click();
  await page.getByRole("button", { name: "Confirmar e enviar" }).click();

  // The Console surfaces the failure (toast) and reassures the data is intact.
  // The text renders twice (visible toast + aria-live region), so match exact,
  // full strings and take the first node.
  await expect(
    page.getByText("Falha ao enviar à Autentique", { exact: true }).first(),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    page
      .getByText(
        "A aprovação foi registrada, mas o envio falhou. Os dados da paciente estão intactos — tente enviar de novo.",
        { exact: true },
      )
      .first(),
  ).toBeVisible();

  // The recoverable failure state is surfaced: the "Último erro de envio" panel
  // shows the persisted send error (so the team knows what to retry).
  await expect(
    page.getByText(`Último erro de envio: ${ERRO_ENVIO_MOCK}`),
  ).toBeVisible({ timeout: 20000 });

  // It did NOT silently succeed: the "criado na Autentique" confirmation never
  // appears.
  await expect(
    page.getByText("Contrato criado na Autentique", { exact: false }),
  ).toHaveCount(0);

  await page.unrouteAll({ behavior: "ignoreErrors" });

  // AUTHORITATIVE check (real API, browser mocks don't apply): the generation
  // still exists, bound to the same patient/tipo, with its body byte-for-byte
  // unchanged — the contract was never lost or mis-bound. The real send was
  // intercepted, so it stays a `rascunho` the team can re-approve and retry.
  const depois = await listarGeracoesPaciente(paciente.id);
  expect(depois).toHaveLength(1);
  const rascunhoDepois = depois[0];
  expect(rascunhoDepois.id).toBe(rascunhoAntes.id);
  expect(rascunhoDepois.pacienteId).toBe(paciente.id);
  expect(rascunhoDepois.tipo).toBe("contrato");
  expect(rascunhoDepois.corpo).toBe(rascunhoAntes.corpo);
  expect(rascunhoDepois.status).toBe("rascunho");
});
