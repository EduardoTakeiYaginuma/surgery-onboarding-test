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
 * Guard for "a FAILED AI review never corrupts or loses a patient's draft".
 *
 * #308 proved that a *successful* AI review stays bound to the right patient,
 * but it mocks the AI call with a canned 200 report. The real review
 * (POST /api/contratos/:id/revisar → revisarContrato, backed by the OpenAI
 * integration) can FAIL and the route answers 502 (RevisaoIaError). The server
 * is written so a failed review leaves the draft untouched (the report is only
 * persisted on success), and the Console is supposed to surface the error
 * instead of silently dropping or mis-binding the draft.
 *
 * This test makes that contract deterministic and free: it generates a real
 * draft for a known patient via the API, then mocks ONLY the revisar POST to
 * fail with a 502 (no real billed AI request). It then asserts — reading the
 * AUTHORITATIVE state straight from the API, outside the browser — that the
 * draft is byte-for-byte the same (same pacienteId, tipo, corpo, status
 * rascunho, relatorioIa still null), and that the Console shows a review-failure
 * state (the error toast) while the review panel keeps its "no report yet"
 * empty state rather than a corrupted/empty report.
 */

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

test("a failed AI review leaves the draft intact and surfaces the error", async ({
  page,
}) => {
  paciente = await criarPacienteTeste();

  // Create a real draft via the API so the test owns its starting state without
  // depending on the generation UI (that path is covered by #308).
  await gerarRascunhoContratoPaciente(paciente.id);

  // Snapshot the AUTHORITATIVE draft state before the (failing) review.
  const antes = await listarGeracoesPaciente(paciente.id);
  expect(antes).toHaveLength(1);
  const rascunhoAntes: GeracaoResumo = antes[0];
  expect(rascunhoAntes.pacienteId).toBe(paciente.id);
  expect(rascunhoAntes.tipo).toBe("contrato");
  expect(rascunhoAntes.status).toBe("rascunho");
  expect(rascunhoAntes.relatorioIa).toBeNull();

  // Onboarding modal only guards "/"; init script kept as a harmless safety net.
  await page.addInitScript(() =>
    localStorage.setItem("kcl-console-guia-visto", "1"),
  );
  await page.goto("/documentos");

  // Pick the patient from the searchable list (contrato is the default tipo).
  await page.getByPlaceholder("Buscar por nome").fill(paciente.nome);
  await page.getByRole("button", { name: paciente.nome }).click();

  // The lone draft auto-selects, so the editor + review panel render.
  const editor = page.locator(".editor-doc").first();
  await expect(editor).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("heading", { name: "Contratos gerados" }),
  ).toBeVisible();

  // Mock ONLY the AI review call so it FAILS with the same 502 the server
  // returns for a RevisaoIaError — deterministic and free (no real AI request).
  // The draft is NOT touched: a failed review never persists a report.
  await page.route("**/api/contratos/*/revisar", async (route) => {
    await route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ message: "Revisão de IA indisponível no momento." }),
    });
  });

  await page.getByRole("button", { name: "Revisar com IA" }).click();

  // The Console surfaces the failure (toast) and reassures the draft is intact.
  // The text renders twice (visible toast + aria-live region), so match the
  // exact, full toast strings and take the first node.
  await expect(
    page.getByText("A revisão de IA falhou", { exact: true }).first(),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    page
      .getByText("O rascunho está intacto. Tente revisar novamente em instantes.", {
        exact: true,
      })
      .first(),
  ).toBeVisible();

  // The review panel keeps its empty "ask for a review" state — NOT a corrupted
  // or half-rendered report.
  await expect(
    page.getByText("Peça uma revisão de IA para checar cláusulas"),
  ).toBeVisible();

  await page.unrouteAll({ behavior: "ignoreErrors" });

  // AUTHORITATIVE check: the draft is byte-for-byte unchanged and still bound to
  // the same patient/tipo, with no AI report attached.
  const depois = await listarGeracoesPaciente(paciente.id);
  expect(depois).toHaveLength(1);
  const rascunhoDepois = depois[0];
  expect(rascunhoDepois.id).toBe(rascunhoAntes.id);
  expect(rascunhoDepois.pacienteId).toBe(paciente.id);
  expect(rascunhoDepois.tipo).toBe("contrato");
  expect(rascunhoDepois.status).toBe("rascunho");
  expect(rascunhoDepois.corpo).toBe(rascunhoAntes.corpo);
  expect(rascunhoDepois.relatorioIa).toBeNull();
  expect(rascunhoDepois.iaRevisadoEm).toBeNull();
});
