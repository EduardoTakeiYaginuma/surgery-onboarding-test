import { test, expect, type Page } from "@playwright/test";

import {
  arquivarPaciente,
  criarModeloContrato,
  criarPacienteTeste,
  listarGeracoesPaciente,
  removerModeloContrato,
  type CreatedPaciente,
} from "./api";

/**
 * Guard for "a generated draft never reaches the wrong patient's document".
 *
 * #307 verified the deep-link buttons land on /documentos with the right
 * patient + tipo pre-selected, but stopped short of "Gerar rascunho". This test
 * drives the full draft-generation flow (GeradorDocumento) for a known patient
 * and asserts — reading the AUTHORITATIVE binding straight from the API, outside
 * the browser — that each generated draft is tied to that exact `pacienteId` and
 * the chosen `tipo` (contrato vs termo), and that a control patient gets NOTHING.
 * It also drives the AI-review step, but with the AI call mocked at the network
 * layer so the test is deterministic and free (no real billed AI request).
 *
 * Deterministic vigente models (contrato + termo) are created via the API so the
 * test never depends on the factory-seed/activation state of the shared dev DB.
 * Both model bodies embed `{{nome}}`, so we can also assert the saved draft body
 * carries THIS patient's name — extra proof the draft is the right patient's.
 */

let paciente: CreatedPaciente;
let controle: CreatedPaciente;
let modeloContratoId: number;
let modeloTermoId: number;
const sufixo = Math.random().toString(36).slice(2, 8);
const TITULO_CONTRATO = `Contrato vínculo E2E ${sufixo}`;
const TITULO_TERMO = `Termo vínculo E2E ${sufixo}`;

test.beforeAll(async () => {
  modeloContratoId = await criarModeloContrato({
    tipo: "contrato",
    titulo: TITULO_CONTRATO,
    procedimento: `Proc contrato ${sufixo}`,
    corpo:
      "<p>Objeto: prestação de serviços médicos para {{nome}} (fins de teste).</p>",
    vigente: true,
  });
  modeloTermoId = await criarModeloContrato({
    tipo: "termo",
    titulo: TITULO_TERMO,
    procedimento: `Proc termo ${sufixo}`,
    corpo:
      "<p>Termo de consentimento livre e esclarecido de {{nome}} (fins de teste).</p>",
    vigente: true,
  });
});

test.afterAll(async () => {
  if (modeloContratoId) await removerModeloContrato(modeloContratoId);
  if (modeloTermoId) await removerModeloContrato(modeloTermoId);
});

test.afterEach(async () => {
  if (paciente) await arquivarPaciente(paciente.id);
  if (controle) await arquivarPaciente(controle.id);
});

/**
 * Picks a vigente model from the generator's model select and clicks "Gerar
 * rascunho". The contrato view has TWO comboboxes (médico + modelo). A Radix
 * Select trigger has role="combobox", whose accessible name does NOT come from
 * its text content, so we can't match it by `name`; instead we filter by the
 * trigger's visible placeholder text, which only the model picker shows.
 */
async function gerarRascunho(page: Page, tituloModelo: string): Promise<void> {
  await page
    .getByRole("combobox")
    .filter({ hasText: "Selecione o modelo-base" })
    .click();
  await page.getByRole("option", { name: tituloModelo }).click();
  await page.getByRole("button", { name: "Gerar rascunho" }).click();
}

test("generated drafts stay bound to the chosen patient and tipo", async ({
  page,
}) => {
  paciente = await criarPacienteTeste();
  // A second, untouched patient: nothing the test generates may ever land here.
  controle = await criarPacienteTeste();

  // Onboarding modal only guards "/"; init script kept as a harmless safety net.
  await page.addInitScript(() =>
    localStorage.setItem("kcl-console-guia-visto", "1"),
  );
  await page.goto("/documentos");

  // Pick the patient from the searchable list.
  await page.getByPlaceholder("Buscar por nome").fill(paciente.nome);
  await page.getByRole("button", { name: paciente.nome }).click();

  // --- Contrato draft (default tipo) ------------------------------------
  await gerarRascunho(page, TITULO_CONTRATO);

  const editor = page.locator(".editor-doc").first();
  await expect(editor).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("heading", { name: "Contratos gerados" }),
  ).toBeVisible();

  // AUTHORITATIVE binding check, read from the API (not the browser): exactly
  // one generation, bound to THIS patient, tipo contrato, body carries the name.
  await expect
    .poll(async () => (await listarGeracoesPaciente(paciente.id)).length)
    .toBe(1);
  const aposContrato = await listarGeracoesPaciente(paciente.id);
  const contratoGen = aposContrato[0];
  expect(contratoGen.pacienteId).toBe(paciente.id);
  expect(contratoGen.tipo).toBe("contrato");
  expect(contratoGen.status).toBe("rascunho");
  expect(contratoGen.corpo).toContain(paciente.nome);

  // The control patient must have received nothing.
  expect(await listarGeracoesPaciente(controle.id)).toHaveLength(0);

  // --- AI review (mocked: deterministic + free) -------------------------
  const relatorioFake = {
    geradoEm: new Date().toISOString(),
    modelo: "stub-e2e",
    alertas: 0,
    resumoGeral: "Revisão simulada para o teste E2E (sem chamada real de IA).",
    frentes: [
      {
        chave: "clausulas",
        titulo: "Cláusulas",
        resumo: "Conferência simulada.",
        itens: [],
      },
    ],
  };

  // The POST /revisar AI call: fulfilled with a canned report so no real billed
  // AI request is made. We re-serve the REAL generation object so the mocked
  // response keeps the genuine `pacienteId` binding.
  await page.route("**/api/contratos/*/revisar", async (route) => {
    const atual = (await listarGeracoesPaciente(paciente.id)).find(
      (g) => g.tipo === "contrato",
    )!;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...atual,
        relatorioIa: relatorioFake,
        iaRevisadoEm: relatorioFake.geradoEm,
      }),
    });
  });
  // The Console renders the report from the refetched LIST, so the list GET that
  // follows the review must also carry the canned report. We attach it only to
  // the contrato generation, preserving every real field (incl. pacienteId).
  await page.route("**/api/pacientes/*/contratos", async (route, request) => {
    if (request.method() !== "GET") {
      await route.continue();
      return;
    }
    const lista = await listarGeracoesPaciente(paciente.id);
    const comRevisao = lista.map((g) =>
      g.tipo === "contrato"
        ? { ...g, relatorioIa: relatorioFake, iaRevisadoEm: relatorioFake.geradoEm }
        : g,
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(comRevisao),
    });
  });

  await page.getByRole("button", { name: "Revisar com IA" }).click();

  // The mocked report renders in the review panel — proof the review step runs
  // against the patient-bound draft, with no real AI call.
  await expect(
    page.getByText("Revisão de IA", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(relatorioFake.resumoGeral)).toBeVisible();

  await page.unrouteAll({ behavior: "ignoreErrors" });

  // --- Termo draft (different tipo) -------------------------------------
  await page.getByRole("tab", { name: "Termo (TCLE)" }).click();
  await gerarRascunho(page, TITULO_TERMO);

  await expect(
    page.getByRole("heading", { name: "Termos (TCLE) gerados" }),
  ).toBeVisible({ timeout: 20000 });

  // The patient now owns BOTH drafts; the new one is bound to THIS patient and
  // tipo termo. The control patient is still empty.
  await expect
    .poll(async () => (await listarGeracoesPaciente(paciente.id)).length)
    .toBe(2);
  const todas = await listarGeracoesPaciente(paciente.id);
  const termoGens = todas.filter((g) => g.tipo === "termo");
  expect(termoGens).toHaveLength(1);
  const termoGen = termoGens[0];
  expect(termoGen.pacienteId).toBe(paciente.id);
  expect(termoGen.tipo).toBe("termo");
  expect(termoGen.corpo).toContain(paciente.nome);
  // The contrato draft is untouched and still tied to the same patient.
  expect(todas.filter((g) => g.tipo === "contrato")).toHaveLength(1);

  expect(await listarGeracoesPaciente(controle.id)).toHaveLength(0);
});
