import { test, expect, type Locator } from "@playwright/test";

import {
  arquivarPaciente,
  criarPacienteTeste,
  inativarMedico,
  reativarMedico,
  obterConfig,
  obterMedicos,
  obterPacienteDocStatus,
  definirPrazoOverride,
  definirStatusDocumentos,
  type ConfigOperacional,
  type CreatedPaciente,
  type MedicoConfig,
} from "./api";

/**
 * Drift guard: the Console per-patient LIVE PREVIEW must render the exact same
 * hospital / address / anesthesia phone as the PUBLIC patient page the patient
 * actually receives.
 *
 * Both surfaces resolve those values from the operational protocolo, but through
 * different paths: the public page resolves them server-side (`lib/conteudo-padrao.ts`
 * + `lib/saidas.ts`), while the Console preview mirrors them client-side from
 * `GET /config` (`console-patient.tsx` `dadosPreview` → `previa-pagina-paciente.tsx`).
 * If either path re-introduces a hardcoded fallback (e.g. always "Avant Moema"),
 * the two will silently diverge — this test fails deterministically when they do.
 *
 * The shared `SurgeryFactsGrid` renders the LOCAL fact as `<dt>Local</dt><dd>…</dd>`
 * on BOTH pages, and the default page sections render the full address (timeline
 * "Compareça ao {{local}}") and the anesthesia phone (contacts "{{equipeTelefone}}").
 *
 * Coverage requirement: a NON-DEFAULT hospital (Vila Nova Star) is used so a
 * hardcoded default-hospital fallback cannot pass.
 */

const HOSPITAL_NAO_PADRAO = "Vila Nova Star";
// Equipe de anestesia é texto livre por paciente (nome + telefone). Valores
// distintos do padrão para flagrar um fallback hardcoded na prévia.
const EQUIPE_TESTE = "Anestesia Drift Teste";
const EQUIPE_TELEFONE_TESTE = "(11) 98888-7777";

/** Reads the LOCAL fact cell value (hospital full name) from a SurgeryFactsGrid. */
function localFato(scope: Locator): Locator {
  return scope.locator('dl dt:text-is("Local") + dd span').first();
}

let paciente: CreatedPaciente;
let config: ConfigOperacional;

test.beforeAll(async () => {
  config = await obterConfig();
});

/** Médico desativado por um teste (reativado na limpeza para não vazar estado). */
let medicoInativadoId: number | undefined;

test.afterEach(async () => {
  if (paciente) await arquivarPaciente(paciente.id);
  if (medicoInativadoId != null) {
    await reativarMedico(medicoInativadoId);
    medicoInativadoId = undefined;
  }
});

test("Console preview renders the same hospital / address / anesthesia phone as the public page", async ({
  page,
}) => {
  // ---- Resolve the expected values from the SAME source the preview reads. ----
  const hospitalPadrao = config.hospitais[0];
  const hospital = config.hospitais.find((h) => h.chave === HOSPITAL_NAO_PADRAO);
  expect(hospital, `hospital "${HOSPITAL_NAO_PADRAO}" não está no /config`).toBeTruthy();
  if (!hospital) return;

  // Sanity: we are exercising a genuinely NON-DEFAULT hospital, and its resolved
  // "local" carries the address (so a missing-address regression is detectable).
  expect(hospital.chave, "o hospital de teste deve ser diferente do padrão").not.toBe(
    hospitalPadrao.chave,
  );
  expect(hospital.nomeCompleto).not.toBe(hospitalPadrao.nomeCompleto);
  expect(hospital.local, "o local resolvido deve conter o endereço").toContain("—");
  expect(hospital.local).toContain(hospital.nomeCompleto);

  // Each test owns its patient, pinned to the non-default hospital + team.
  paciente = await criarPacienteTeste({
    local: hospital.chave,
    equipeAnestesia: EQUIPE_TESTE,
    equipeAnestesiaTelefone: EQUIPE_TELEFONE_TESTE,
  });

  // ---- PUBLIC patient page (/p/:token) — the source of truth. ----
  await page.goto(`/p/${paciente.token}`);
  const publicLocal = localFato(page.locator("body"));
  await expect(publicLocal).toHaveText(hospital.nomeCompleto);
  const publicLocalText = (await publicLocal.innerText()).trim();
  // Address (full "{{local}}") and anesthesia phone are rendered in the default
  // sections; assert they are present on the public page before comparing.
  await expect(page.locator("body")).toContainText(hospital.local);
  await expect(page.locator("body")).toContainText(EQUIPE_TELEFONE_TESTE);

  // ---- Console live preview (/paciente/:id) — must match the public page. ----
  await page.goto(`/paciente/${paciente.id}`);
  const previa = page.getByTestId("previa-pagina-paciente");
  await expect(previa).toBeVisible();

  // HOSPITAL: the LOCAL cell in the preview must equal the public page's, and the
  // non-default name (never the default fallback). `toHaveText` retries until
  // /config has loaded and the preview swaps the raw key for the full name.
  const previewLocal = localFato(previa);
  await expect(previewLocal).toHaveText(publicLocalText);
  await expect(previewLocal).toHaveText(hospital.nomeCompleto);
  expect(publicLocalText, "preview/public mostraram o hospital padrão (fallback)").not.toBe(
    hospitalPadrao.nomeCompleto,
  );

  // ADDRESS: the full resolved local (name + address) must appear in the preview,
  // identical to what the public page renders.
  await expect(previa).toContainText(hospital.local);

  // ANESTHESIA PHONE: the contacts section phone must match the public page.
  await expect(previa).toContainText(EQUIPE_TELEFONE_TESTE);
});

/**
 * Sibling drift guard for the OTHER values the Console preview mirrors BY HAND
 * from the public page: the doctor identity block (name, CRM/RQE, clínica, photo
 * and logo) and the payment summary line in "Agora".
 *
 * Same divergence risk as the hospital block: the public page resolves these
 * server-side (`saidas.ts montarPaginaPaciente` — médica/crm/rqe/clínica from the
 * patient snapshot, photo/logo as signed URLs from the linked médico), while the
 * preview re-derives them client-side (`console-patient.tsx dadosPreview` →
 * `MedicaIdentidade` / `LogoClinicaLockup` / `AgoraConfirmacoes`). The photo/logo
 * are especially fragile: the preview looks them up from `useListarMedicos` by
 * `medicoId`, so a wrong/blank lookup would silently fall back to the initials /
 * "K" emblem while the patient still sees the real photo.
 *
 * Coverage: the patient is pinned to an explicitly LINKED médico (so the photo/
 * logo live-resolution path runs, not the personalizado fallback) and carries an
 * OPEN balance + due date (so the payment line renders "pagar até …", not the
 * quitado path). Signed photo/logo URLs are compared by object path only — the
 * signature query changes per request, but the stored object path is stable, so
 * a divergent path means the preview is pointing at a different (or no) image.
 */
const SALDO_ABERTO = 2000;
const VENCIMENTO_SALDO = "2026-08-01";
const VENCIMENTO_SALDO_FMT = "01/08/2026";

/** A seção "Sua médica" (foto + nome + CRM/RQE), idêntica nos dois lugares. */
function secaoMedica(scope: Locator): Locator {
  return scope.locator("section").filter({ hasText: "Sua médica" }).first();
}

/** A linha de honorários do bloco "Agora" (✓ confirmado ou ○ pendente). */
function linhaHonorarios(scope: Locator): Locator {
  return scope.locator("li").filter({ hasText: "Honorários" }).first();
}

/**
 * Caminho do objeto de uma imagem assinada (origin + pathname, sem a query). A
 * assinatura muda a cada request, mas o objeto apontado não — então caminhos
 * iguais = mesma imagem nas duas telas.
 */
async function caminhoImagem(img: Locator): Promise<string> {
  const src = await img.getAttribute("src");
  expect(src, "imagem sem src").toBeTruthy();
  const url = new URL(src!);
  return url.origin + url.pathname;
}

let medico: MedicoConfig;

test("Console preview renders the same doctor identity / photo / payment summary as the public page", async ({
  page,
}) => {
  // ---- Resolve the expected values from the SAME source the preview reads. ----
  const medicos = await obterMedicos();
  const ativo = medicos.find((m) => m.ativo) ?? medicos[0];
  expect(ativo, "nenhum médico cadastrado no /medicos").toBeTruthy();
  if (!ativo) return;
  medico = ativo;

  // The doctor block carries real text + images, so the mirror is genuinely
  // exercised (a blank-photo regression is detectable, not vacuously true).
  expect(medico.crm, "o médico de teste precisa de CRM").toBeTruthy();
  expect(medico.rqe, "o médico de teste precisa de RQE").toBeTruthy();
  expect(medico.clinica, "o médico de teste precisa de clínica").toBeTruthy();
  expect(medico.fotoUrl, "o médico de teste precisa ter foto cadastrada").toBeTruthy();
  expect(medico.logoUrl, "o médico de teste precisa ter logo cadastrado").toBeTruthy();

  // Patient pinned to the linked médico, with an open balance + due date.
  paciente = await criarPacienteTeste({
    medicoId: medico.id,
    valorPendente: SALDO_ABERTO,
    dataPagamentoPendente: VENCIMENTO_SALDO,
  });

  // ---- PUBLIC patient page (/p/:token) — the source of truth. ----
  await page.goto(`/p/${paciente.token}`);
  const publicMedica = secaoMedica(page.locator("body"));
  await expect(publicMedica.getByRole("heading", { level: 2 })).toHaveText(medico.nome);
  await expect(publicMedica).toContainText(`CRM ${medico.crm} · RQE ${medico.rqe}`);
  await expect(page.locator("header").first()).toContainText(medico.clinica);
  // Photo + logo must render as real images (not the initials / "K" fallback).
  const publicFoto = caminhoImagem(publicMedica.locator("img").first());
  const publicLogo = caminhoImagem(page.locator("header img").first());
  // Payment summary: open balance → "Honorários · pagar até <vencimento>".
  const publicHonorarios = linhaHonorarios(page.locator("body"));
  await expect(publicHonorarios).toContainText("pagar até");
  await expect(publicHonorarios).toContainText(VENCIMENTO_SALDO_FMT);
  const publicHonorariosTexto = (await publicHonorarios.innerText()).trim();
  const [caminhoFotoPublic, caminhoLogoPublic] = await Promise.all([publicFoto, publicLogo]);

  // ---- Console live preview (/paciente/:id) — must match the public page. ----
  await page.goto(`/paciente/${paciente.id}`);
  const previa = page.getByTestId("previa-pagina-paciente");
  await expect(previa).toBeVisible();

  // DOCTOR IDENTITY: name + CRM/RQE (snapshot) and clínica (header lockup).
  const previewMedica = secaoMedica(previa);
  await expect(previewMedica.getByRole("heading", { level: 2 })).toHaveText(medico.nome);
  await expect(previewMedica).toContainText(`CRM ${medico.crm} · RQE ${medico.rqe}`);
  await expect(previa.locator("header")).toContainText(medico.clinica);

  // PHOTO + LOGO: the preview resolves these from `useListarMedicos`; wait for
  // the images to appear (a drift would leave the initials / "K" fallback with
  // no <img>, so these expects fail), then compare the object paths.
  const previewFoto = previewMedica.locator("img").first();
  const previewLogo = previa.locator("header img").first();
  await expect(previewFoto).toBeVisible();
  await expect(previewLogo).toBeVisible();
  expect(await caminhoImagem(previewFoto), "foto da médica divergiu da página pública").toBe(
    caminhoFotoPublic,
  );
  expect(await caminhoImagem(previewLogo), "logo divergiu da página pública").toBe(
    caminhoLogoPublic,
  );

  // PAYMENT SUMMARY: the "Honorários" line must match the public page verbatim.
  const previewHonorarios = linhaHonorarios(previa);
  await expect(previewHonorarios).toContainText("pagar até");
  await expect(previewHonorarios).toContainText(VENCIMENTO_SALDO_FMT);
  expect(
    (await previewHonorarios.innerText()).trim(),
    "resumo de pagamento divergiu da página pública",
  ).toBe(publicHonorariosTexto);
});

/**
 * Caminho do objeto de uma URL assinada já como string (origin + pathname). Igual
 * a `caminhoImagem`, mas para a URL bruta que `obterMedicos` devolve — usado para
 * provar que o objeto exibido nas telas é EXATAMENTE a foto/logo do médico de
 * teste, não uma imagem qualquer.
 */
function caminhoImagemUrl(src: string): string {
  const url = new URL(src);
  return url.origin + url.pathname;
}

/**
 * Drift guard: a foto/logo do médico devem continuar resolvendo NA PÁGINA PÚBLICA
 * e NA PRÉVIA DO CONSOLE mesmo depois que o médico é DESATIVADO. As duas telas só
 * encontram o cadastro de um médico inativo porque resolvem com `incluirInativos`
 * (a prévia via `useListarMedicos({ incluirInativos: true })`, o servidor da
 * página pública via a mesma consulta). Se alguém remover esse `incluirInativos`,
 * uma paciente vinculada a um médico desativado cairia silenciosamente nas
 * iniciais / no emblema "K" — este teste falha de forma determinística nesse caso.
 *
 * Coverage: o médico é DESATIVADO antes de qualquer render, e os caminhos de
 * objeto (sem a assinatura) das imagens são comparados contra a foto/logo reais
 * do próprio médico (de `obterMedicos`) E entre as duas telas — então o fallback
 * de iniciais (sem `<img>`) ou um objeto divergente reprova o teste.
 */
test("doctor photo/logo still resolve on both pages after the doctor is deactivated", async ({
  page,
}) => {
  // ---- Pick an active médico WITH photo + logo, then deactivate it. ----
  const medicos = await obterMedicos();
  const alvo = medicos.find((m) => m.ativo && m.fotoUrl && m.logoUrl);
  expect(
    alvo,
    "nenhum médico ativo com foto E logo cadastrados no /medicos",
  ).toBeTruthy();
  if (!alvo) return;
  medico = alvo;

  const caminhoFotoEsperado = caminhoImagemUrl(medico.fotoUrl!);
  const caminhoLogoEsperado = caminhoImagemUrl(medico.logoUrl!);

  // Patient pinned to the LINKED médico (so the live photo/logo resolution runs,
  // not the personalizado snapshot fallback).
  paciente = await criarPacienteTeste({ medicoId: medico.id });

  // Deactivate the médico — from now on it is only reachable via incluirInativos.
  await inativarMedico(medico.id);
  medicoInativadoId = medico.id;

  // Sanity: re-reading /medicos (with incluirInativos) still carries the médico,
  // but now flagged ativo=false — confirming the deactivation took effect.
  const apos = await obterMedicos();
  expect(
    apos.some((m) => m.id === medico.id && !m.ativo),
    "o médico deveria aparecer como inativo após inativarMedico",
  ).toBeTruthy();

  // ---- PUBLIC patient page (/p/:token) — must still show the real images. ----
  await page.goto(`/p/${paciente.token}`);
  const publicMedica = secaoMedica(page.locator("body"));
  await expect(publicMedica.getByRole("heading", { level: 2 })).toHaveText(
    medico.nome,
  );
  const publicFoto = publicMedica.locator("img").first();
  const publicLogo = page.locator("header img").first();
  await expect(publicFoto).toBeVisible();
  await expect(publicLogo).toBeVisible();
  expect(
    await caminhoImagem(publicFoto),
    "página pública caiu nas iniciais após o médico ser desativado",
  ).toBe(caminhoFotoEsperado);
  expect(
    await caminhoImagem(publicLogo),
    "logo da página pública divergiu após o médico ser desativado",
  ).toBe(caminhoLogoEsperado);

  // ---- Console live preview (/paciente/:id) — must ALSO still show them. ----
  await page.goto(`/paciente/${paciente.id}`);
  const previa = page.getByTestId("previa-pagina-paciente");
  await expect(previa).toBeVisible();
  const previewMedica = secaoMedica(previa);
  const previewFoto = previewMedica.locator("img").first();
  const previewLogo = previa.locator("header img").first();
  await expect(previewFoto).toBeVisible();
  await expect(previewLogo).toBeVisible();
  expect(
    await caminhoImagem(previewFoto),
    "prévia do Console caiu nas iniciais / 'K' após o médico ser desativado",
  ).toBe(caminhoFotoEsperado);
  expect(
    await caminhoImagem(previewLogo),
    "logo da prévia divergiu após o médico ser desativado",
  ).toBe(caminhoLogoEsperado);
});

/**
 * Drift guard: the Console live preview's contract ("Contrato") and consent
 * ("Termo de consentimento") status lines in the "Agora" block must render the
 * exact same text as the PUBLIC patient page, across both the actionable-pending
 * state ("assinar até <data>") and the terminal-signed state ("assinado em <data>").
 *
 * Both surfaces share the AgoraConfirmacoes component (patient-page-sections.tsx),
 * but they feed it through different paths:
 *   - Public page  → server-side DTO from `montarPaginaPaciente` (lib/saidas.ts)
 *   - Console preview → client-side `dadosPreview` from `pacienteParaDTO` via /api/pacientes/:id
 *
 * If either path re-introduces a hardcoded fallback or misses a field (e.g. always
 * renders "aguardando assinatura" while the public page has a prazo), these tests
 * fail deterministically.
 *
 * A dev-only PATCH /pacientes/:id/_dev/status endpoint seeds the DB status without
 * needing a real Autentique document.
 */

/** Converts an ISO date (YYYY-MM-DD) to the Brazilian DD/MM/YYYY display format. */
function fmtDataBR(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** The contract "Contrato …" list item inside a "Agora" block. */
function linhaContrato(scope: Locator): Locator {
  return scope.locator("li").filter({ hasText: /^Contrato/ }).first();
}

/** The consent "Termo de consentimento …" list item inside a "Agora" block. */
function linhaTermo(scope: Locator): Locator {
  return scope.locator("li").filter({ hasText: /Termo de consentimento/ }).first();
}

test("Console preview renders the same pending contract/consent deadline as the public page", async ({
  page,
}) => {
  // Create a patient and seed the pending status for both contract and consent.
  paciente = await criarPacienteTeste();
  await definirStatusDocumentos(paciente.id, {
    contratoStatus: "pendente",
    termoStatus: "pendente",
  });

  // Read back the patient DTO to get the server-computed prazo values (they
  // depend on dataCirurgia − prazoAssinaturaDiasAntes from config, so we don't
  // hardcode them here).
  const docStatus = await obterPacienteDocStatus(paciente.id);
  expect(
    docStatus.contratoPrazo,
    "contratoPrazo deve estar calculado — verifique prazoAssinaturaDiasAntes na config",
  ).toBeTruthy();
  expect(
    docStatus.termoPrazo,
    "termoPrazo deve estar calculado — verifique prazoAssinaturaDiasAntes na config",
  ).toBeTruthy();
  if (!docStatus.contratoPrazo || !docStatus.termoPrazo) return;

  const contratoPrazoBR = fmtDataBR(docStatus.contratoPrazo);
  const termoPrazoBR = fmtDataBR(docStatus.termoPrazo);

  // ---- PUBLIC patient page (/p/:token) — the source of truth. ----
  await page.goto(`/p/${paciente.token}`);
  const publicContrato = linhaContrato(page.locator("body"));
  const publicTermo = linhaTermo(page.locator("body"));
  await expect(publicContrato).toContainText("assinar até");
  await expect(publicContrato).toContainText(contratoPrazoBR);
  await expect(publicTermo).toContainText("assinar até");
  await expect(publicTermo).toContainText(termoPrazoBR);
  const publicContratoTexto = (await publicContrato.innerText()).trim();
  const publicTermoTexto = (await publicTermo.innerText()).trim();

  // ---- Console live preview (/paciente/:id) — must match the public page. ----
  await page.goto(`/paciente/${paciente.id}`);
  const previa = page.getByTestId("previa-pagina-paciente");
  await expect(previa).toBeVisible();

  // CONTRACT: the preview's "Contrato" line must render the same deadline text.
  const previewContrato = linhaContrato(previa);
  await expect(previewContrato).toContainText("assinar até");
  await expect(previewContrato).toContainText(contratoPrazoBR);
  expect(
    (await previewContrato.innerText()).trim(),
    "linha de contrato (pendente) divergiu da página pública",
  ).toBe(publicContratoTexto);

  // CONSENT: same for the termo de consentimento line.
  const previewTermo = linhaTermo(previa);
  await expect(previewTermo).toContainText("assinar até");
  await expect(previewTermo).toContainText(termoPrazoBR);
  expect(
    (await previewTermo.innerText()).trim(),
    "linha de termo (pendente) divergiu da página pública",
  ).toBe(publicTermoTexto);
});

// Override dates picked to be clearly DIFFERENT from the default computed prazo
// (criarPacienteTeste pins dataCirurgia = 2026-08-15, so the default is a few
// days before that). A divergence here means a path read the default instead of
// the secretary's per-patient override.
const CONTRATO_PRAZO_OVERRIDE = "2026-07-20";
const CONTRATO_PRAZO_OVERRIDE_FMT = "20/07/2026";
const TERMO_PRAZO_OVERRIDE = "2026-07-10";
const TERMO_PRAZO_OVERRIDE_FMT = "10/07/2026";

test("Console preview renders the per-patient prazo override (not the default) just like the public page", async ({
  page,
}) => {
  // Create a patient, seed both documents as pending, then OVERRIDE the prazo
  // per-patient via the same PATCH the secretary uses in the Console.
  paciente = await criarPacienteTeste();
  await definirStatusDocumentos(paciente.id, {
    contratoStatus: "pendente",
    termoStatus: "pendente",
  });
  await definirPrazoOverride(paciente.id, {
    contratoPrazoOverride: CONTRATO_PRAZO_OVERRIDE,
    termoPrazoOverride: TERMO_PRAZO_OVERRIDE,
  });

  // Read back the patient DTO: the server-computed prazo must now equal the
  // OVERRIDE, proving the override wins over the default in `pacienteParaDTO`.
  const docStatus = await obterPacienteDocStatus(paciente.id);
  expect(
    docStatus.contratoPrazo,
    "contratoPrazo no DTO do Console deve refletir o override, não o default",
  ).toBe(CONTRATO_PRAZO_OVERRIDE);
  expect(
    docStatus.termoPrazo,
    "termoPrazo no DTO do Console deve refletir o override, não o default",
  ).toBe(TERMO_PRAZO_OVERRIDE);

  // ---- PUBLIC patient page (/p/:token) — the source of truth. ----
  // Exercises the override path in `montarPaginaPaciente` (the prazo is computed
  // server-side and fed into the public DTO).
  await page.goto(`/p/${paciente.token}`);
  const publicContrato = linhaContrato(page.locator("body"));
  const publicTermo = linhaTermo(page.locator("body"));
  await expect(publicContrato).toContainText("assinar até");
  await expect(publicContrato).toContainText(CONTRATO_PRAZO_OVERRIDE_FMT);
  await expect(publicTermo).toContainText("assinar até");
  await expect(publicTermo).toContainText(TERMO_PRAZO_OVERRIDE_FMT);
  const publicContratoTexto = (await publicContrato.innerText()).trim();
  const publicTermoTexto = (await publicTermo.innerText()).trim();

  // ---- Console live preview (/paciente/:id) — must match the public page. ----
  await page.goto(`/paciente/${paciente.id}`);
  const previa = page.getByTestId("previa-pagina-paciente");
  await expect(previa).toBeVisible();

  // CONTRACT: the preview's "Contrato" line must show the OVERRIDE deadline
  // (a drift here would render the default dataCirurgia − diasAntes date).
  const previewContrato = linhaContrato(previa);
  await expect(previewContrato).toContainText("assinar até");
  await expect(previewContrato).toContainText(CONTRATO_PRAZO_OVERRIDE_FMT);
  expect(
    (await previewContrato.innerText()).trim(),
    "linha de contrato (override) divergiu da página pública",
  ).toBe(publicContratoTexto);

  // CONSENT: same for the termo de consentimento line.
  const previewTermo = linhaTermo(previa);
  await expect(previewTermo).toContainText("assinar até");
  await expect(previewTermo).toContainText(TERMO_PRAZO_OVERRIDE_FMT);
  expect(
    (await previewTermo.innerText()).trim(),
    "linha de termo (override) divergiu da página pública",
  ).toBe(publicTermoTexto);
});

const CONTRATO_ASSINADO_EM = "2026-06-15";
const CONTRATO_ASSINADO_EM_FMT = "15/06/2026";
const TERMO_ASSINADO_EM = "2026-06-10";
const TERMO_ASSINADO_EM_FMT = "10/06/2026";

test("Console preview renders the same signed contract/consent confirmation as the public page", async ({
  page,
}) => {
  // Create a patient and seed the signed status for both contract and consent.
  paciente = await criarPacienteTeste();
  await definirStatusDocumentos(paciente.id, {
    contratoStatus: "assinado",
    contratoAssinadoEm: CONTRATO_ASSINADO_EM,
    termoStatus: "assinado",
    termoAssinadoEm: TERMO_ASSINADO_EM,
  });

  // ---- PUBLIC patient page (/p/:token) — the source of truth. ----
  await page.goto(`/p/${paciente.token}`);
  const publicContrato = linhaContrato(page.locator("body"));
  const publicTermo = linhaTermo(page.locator("body"));
  // Signed state → LinhaConfirmada with the "assinado em <data>" suffix.
  await expect(publicContrato).toContainText("assinado");
  await expect(publicContrato).toContainText(CONTRATO_ASSINADO_EM_FMT);
  await expect(publicTermo).toContainText("assinado");
  await expect(publicTermo).toContainText(TERMO_ASSINADO_EM_FMT);
  const publicContratoTexto = (await publicContrato.innerText()).trim();
  const publicTermoTexto = (await publicTermo.innerText()).trim();

  // ---- Console live preview (/paciente/:id) — must match the public page. ----
  await page.goto(`/paciente/${paciente.id}`);
  const previa = page.getByTestId("previa-pagina-paciente");
  await expect(previa).toBeVisible();

  // CONTRACT: the preview's "Contrato" line must show the signed confirmation.
  // A drift here would mean the preview still shows "aguardando assinatura" or
  // "assinar até …" while the patient sees the signed state.
  const previewContrato = linhaContrato(previa);
  await expect(previewContrato).toContainText("assinado");
  await expect(previewContrato).toContainText(CONTRATO_ASSINADO_EM_FMT);
  expect(
    (await previewContrato.innerText()).trim(),
    "linha de contrato (assinado) divergiu da página pública",
  ).toBe(publicContratoTexto);

  // CONSENT: same for the termo de consentimento.
  const previewTermo = linhaTermo(previa);
  await expect(previewTermo).toContainText("assinado");
  await expect(previewTermo).toContainText(TERMO_ASSINADO_EM_FMT);
  expect(
    (await previewTermo.innerText()).trim(),
    "linha de termo (assinado) divergiu da página pública",
  ).toBe(publicTermoTexto);
});
