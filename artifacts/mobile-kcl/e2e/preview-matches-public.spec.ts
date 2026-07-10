import { test, expect, type Locator } from "@playwright/test";

import {
  arquivarPaciente,
  criarPacienteTeste,
  obterMedicos,
  type CreatedPaciente,
  type MedicoConfig,
} from "./api";

/**
 * Drift guard: the mobile Console "PÁGINA DA PACIENTE" preview must render the
 * exact same doctor identity block (name, CRM/RQE, clínica, photo, logo) and
 * payment summary line as the PUBLIC patient page the patient actually receives.
 *
 * Both surfaces resolve these values independently:
 *   - The public page (`/p/:token`) — built server-side by `montarPaginaPaciente`
 *     using the patient snapshot + signed photo/logo URLs from the linked médico.
 *   - The mobile preview (`pagina-preview` in the patient detail screen) — built
 *     client-side by `identidadeDaPaciente` (doctor lookup via `useListarMedicos`)
 *     and `PaginaPreview` (honoring `pagamento` from `useObterPaginaPaciente`).
 *
 * Photo and logo URLs are signed (signature changes per request), so we compare
 * only the object path (origin + pathname) — same path = same image. A drift
 * (wrong or missing doctor lookup) would leave the initials/"K" fallback with no
 * <img> at all, so the `toBeVisible()` expects fail deterministically.
 *
 * The test uses the absolute Expo dev domain via playwright.config.ts `baseURL`.
 * The PUBLIC page lives on the web-console domain, not the Expo domain, so it
 * is opened via its fully-qualified URL (`https://${REPLIT_DEV_DOMAIN}/p/:token`).
 */

const SALDO_ABERTO = 2000;
const VENCIMENTO_SALDO = "2026-08-01";
const VENCIMENTO_SALDO_FMT = "01/08/2026";

const webDomain = process.env.REPLIT_DEV_DOMAIN;

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

let paciente: CreatedPaciente;
let medico: MedicoConfig;

test.afterEach(async () => {
  if (paciente) await arquivarPaciente(paciente.id);
});

test("mobile preview renders the same doctor identity / photo / payment summary as the public page", async ({
  page,
}) => {
  // ---- Resolve the expected doctor from the same source the preview reads. ----
  const medicos = await obterMedicos();
  const ativo = medicos.find((m) => m.ativo) ?? medicos[0];
  expect(ativo, "nenhum médico cadastrado no /medicos").toBeTruthy();
  if (!ativo) return;
  medico = ativo;

  // The doctor block must carry real text + images so the mirror is genuinely
  // exercised — a blank-photo regression is detectable, not vacuously true.
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
  // Opened via absolute URL: the public page lives on the web-console domain,
  // not on the Expo dev domain that `baseURL` points to.
  await page.goto(`https://${webDomain}/p/${paciente.token}`);

  // DOCTOR NAME: heading in the "Sua médica" section.
  const publicMedica = page
    .locator("section")
    .filter({ hasText: "Sua médica" })
    .first();
  await expect(publicMedica.getByRole("heading", { level: 2 })).toHaveText(medico.nome);
  await expect(publicMedica).toContainText(`CRM ${medico.crm} · RQE ${medico.rqe}`);

  // CLÍNICA: in the page header lockup.
  await expect(page.locator("header").first()).toContainText(medico.clinica);

  // PHOTO + LOGO: real images must exist (not the initials/"K" fallback).
  const publicFoto = caminhoImagem(publicMedica.locator("img").first());
  const publicLogo = caminhoImagem(page.locator("header img").first());

  // PAYMENT LINE: open balance → "Honorários · pagar até <vencimento>".
  const publicHonorarios = page.locator("li").filter({ hasText: "Honorários" }).first();
  await expect(publicHonorarios).toContainText("pagar até");
  await expect(publicHonorarios).toContainText(VENCIMENTO_SALDO_FMT);
  const publicHonorariosTexto = (await publicHonorarios.innerText()).trim();
  const [caminhoFotoPublic, caminhoLogoPublic] = await Promise.all([publicFoto, publicLogo]);

  // ---- Mobile patient detail (/paciente/:id) — must match the public page. ----
  // Uses the baseURL (Expo dev domain), so a relative path is correct here.
  await page.goto("/");
  await page.getByTestId(`paciente-${paciente.id}`).click();
  await expect(page).toHaveURL(new RegExp(`/paciente/${paciente.id}`));

  // Open the "PÁGINA DA PACIENTE" preview section.
  await page.getByTestId("toggle-pagina").click();
  const preview = page.getByTestId("pagina-preview");
  await expect(preview).toBeVisible();

  // DOCTOR IDENTITY: name and CRM/RQE are in the identidade-header block.
  const identidadeHeader = preview.getByTestId("identidade-header");
  await expect(identidadeHeader).toContainText(medico.nome);
  await expect(identidadeHeader).toContainText(`CRM ${medico.crm} · RQE ${medico.rqe}`);
  await expect(identidadeHeader).toContainText(medico.clinica);

  // PHOTO + LOGO: the preview resolves them from `useListarMedicos`; wait for
  // images to appear (a drift leaves initials/"K" with no <img>).
  // Layout order inside identidade-header: logo first (lockupRow), then photo
  // (medicaRow) — matching ClinicaLogo → MedicaFoto render order.
  const previewLogo = identidadeHeader.locator("img").first();
  const previewFoto = identidadeHeader.locator("img").nth(1);
  await expect(previewLogo).toBeVisible();
  await expect(previewFoto).toBeVisible();
  expect(
    await caminhoImagem(previewLogo),
    "logo divergiu da página pública",
  ).toBe(caminhoLogoPublic);
  expect(
    await caminhoImagem(previewFoto),
    "foto da médica divergiu da página pública",
  ).toBe(caminhoFotoPublic);

  // PAYMENT SUMMARY: the honorários line must match the public page verbatim.
  const previewHonorarios = preview.getByTestId("preview-honorarios");
  await expect(previewHonorarios).toContainText("pagar até");
  await expect(previewHonorarios).toContainText(VENCIMENTO_SALDO_FMT);
  expect(
    (await previewHonorarios.innerText()).trim(),
    "resumo de pagamento divergiu da página pública",
  ).toBe(publicHonorariosTexto);
});
