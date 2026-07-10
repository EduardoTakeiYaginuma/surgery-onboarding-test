import { test, expect } from "@playwright/test";

import {
  arquivarPaciente,
  criarPacienteTeste,
  obterConfig,
  obterMedicos,
  type ConfigOperacional,
  type CreatedPaciente,
  type MedicoConfig,
} from "./api";

/**
 * Regression guard: the Console patient editor's HOSPITAL/LOCAL and MÉDICO
 * RESPONSÁVEL <Select> dropdowns must display the patient's SAVED values (not
 * the "Selecione…" placeholder) when the patient page first loads.
 *
 * The form-init effect (console-patient.tsx) intentionally gates `form.reset()`
 * on three conditions being truthy simultaneously:
 *
 *   data && config && medicosAtivos && !formPronto
 *
 * …because Radix <Select> only maps a `value` to the matching <SelectItem>
 * text if the options are already mounted when the value is set. If the reset
 * ran before `config.hospitais` or `medicosAtivos` had loaded, both triggers
 * would stay stuck on their placeholder text indefinitely.
 *
 * The test creates a patient with a non-default hospital + a linked doctor,
 * then asserts both triggers show the saved values — failing deterministically
 * if the gating logic is removed or the reset timing regresses.
 *
 * The "Dados" tab is the default active tab, so no tab click is needed.
 * `getByRole("combobox")` matches Radix Select triggers (SelectPrimitive.Trigger
 * renders as a button with role="combobox"). `toBeVisible()` retries until the
 * form-init effect fires and the correct text appears in the trigger.
 */

const HOSPITAL_NAO_PADRAO = "Vila Nova Star";
const PLACEHOLDER_HOSPITAL = "Selecione o hospital";
const PLACEHOLDER_MEDICO = "Selecione o médico";

let config: ConfigOperacional;
let medico: MedicoConfig;
let paciente: CreatedPaciente;

test.beforeAll(async () => {
  const [cfg, medicos] = await Promise.all([obterConfig(), obterMedicos()]);
  config = cfg;
  const ativo = medicos.find((m) => m.ativo) ?? medicos[0];
  if (!ativo) throw new Error("Nenhum médico cadastrado em /medicos");
  medico = ativo;
});

test.afterEach(async () => {
  if (paciente) await arquivarPaciente(paciente.id);
});

test("patient editor pre-selects the saved hospital and doctor (not the placeholder)", async ({
  page,
}) => {
  // Resolve the non-default hospital from /config (same source the form uses).
  const hospital = config.hospitais.find((h) => h.chave === HOSPITAL_NAO_PADRAO);
  expect(
    hospital,
    `hospital "${HOSPITAL_NAO_PADRAO}" não encontrado em /config — verifique o protocolo`,
  ).toBeTruthy();
  if (!hospital) return;

  // Sanity: the chosen hospital is genuinely different from the default so a
  // stale-default fallback cannot produce a false pass.
  const hospitalPadrao = config.hospitais[0];
  expect(hospital.chave).not.toBe(hospitalPadrao.chave);

  // Create the patient pinned to the non-default hospital + the linked doctor.
  paciente = await criarPacienteTeste({
    local: hospital.chave,
    medicoId: medico.id,
  });

  // Suppress the first-visit onboarding modal (makes the page inert otherwise).
  await page.addInitScript(() => localStorage.setItem("kcl-console-guia-visto", "1"));
  await page.goto(`/paciente/${paciente.id}`);

  // "Dados" is the default active tab — no click needed. Both selects are
  // already mounted in the DOM. We wait for the form-init effect to fire.

  // ---- HOSPITAL / LOCAL select ----
  // Radix SelectTrigger renders as role="combobox". Once form.reset() fires
  // (gated on data + config + medicosAtivos), the trigger shows the saved name.
  const hospitalCombobox = page
    .getByRole("combobox")
    .filter({ hasText: hospital.nome });
  await expect(hospitalCombobox).toBeVisible({ timeout: 15000 });

  // Belt-and-suspenders: the placeholder text must not appear in any combobox.
  await expect(
    page.getByRole("combobox").filter({ hasText: PLACEHOLDER_HOSPITAL }),
  ).toHaveCount(0);

  // ---- MÉDICO RESPONSÁVEL select ----
  // After form.reset() the doctor trigger shows the linked doctor's name.
  // `filter({ hasText })` uses contains-matching, so any " · padrão" suffix
  // on the label does not interfere with the assertion.
  const medicoCombobox = page
    .getByRole("combobox")
    .filter({ hasText: medico.nome });
  await expect(medicoCombobox).toBeVisible({ timeout: 15000 });

  await expect(
    page.getByRole("combobox").filter({ hasText: PLACEHOLDER_MEDICO }),
  ).toHaveCount(0);

  // ---- Saving an UNRELATED edit keeps both selections ----
  // The exact #187 failure mode: clearing the required `local` silently blocked
  // EVERY save. The post-save `form.reset(values)` is also a fresh spurious-""
  // trigger, so we edit only the phone, save, and re-assert the selects survive.
  const telefone = page.getByLabel("Telefone / WhatsApp");
  await telefone.fill("11988887777");

  const salvar = page.getByRole("button", { name: "Salvar alterações" });
  await expect(salvar).toBeEnabled();
  await salvar.click();

  // The save must actually go through (it would be silently blocked if a select
  // had been wiped to "" and invalidated the form).
  const toasts = page.getByLabel("Notifications (F8)");
  await expect(
    toasts.getByText("Dados atualizados", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    toasts.getByText("Não foi possível salvar", { exact: true }),
  ).toHaveCount(0);

  // Both selections remain intact after the post-save reset.
  await expect(
    page.getByRole("combobox").filter({ hasText: hospital.nome }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox").filter({ hasText: medico.nome }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox").filter({ hasText: PLACEHOLDER_HOSPITAL }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox").filter({ hasText: PLACEHOLDER_MEDICO }),
  ).toHaveCount(0);
});
