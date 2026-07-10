import { test, expect } from "@playwright/test";

import { arquivarPaciente, criarPacienteTeste, type CreatedPaciente } from "./api";

/**
 * Core on-the-go flows of the mobile Console companion, exercised against the
 * real Expo web app + shared API server + database. Each test owns an isolated
 * patient created via the API and archives it afterwards as cleanup.
 */

let paciente: CreatedPaciente;

test.beforeEach(async () => {
  paciente = await criarPacienteTeste();
});

test.afterEach(async () => {
  if (paciente) await arquivarPaciente(paciente.id);
});

test("lists patients and switches between Ativos and Arquivados", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Console de Operação")).toBeVisible();

  const card = page.getByTestId(`paciente-${paciente.id}`);
  await expect(card).toBeVisible();
  await expect(card.getByText(paciente.nome)).toBeVisible();

  // Archived tab should not show this (active) patient.
  await page.getByTestId("aba-arquivados").click();
  await expect(page.getByTestId(`paciente-${paciente.id}`)).toHaveCount(0);

  // Back to active — it reappears.
  await page.getByTestId("aba-ativos").click();
  await expect(page.getByTestId(`paciente-${paciente.id}`)).toBeVisible();
});

test("opens a patient and copies the main handoff block", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId(`paciente-${paciente.id}`).click();

  await expect(page).toHaveURL(new RegExp(`/paciente/${paciente.id}`));
  // "ENTREGA PRINCIPAL" is unique to the detail screen — proves it opened.
  // (The patient name renders on both screens; the just-left home list stays
  // mounted-but-hidden in the DOM under expo-router, so we avoid matching it.)
  await expect(page.getByText("ENTREGA PRINCIPAL")).toBeVisible();

  const copiar = page.getByText("COPIAR").first();
  await copiar.click();
  await expect(page.getByText("COPIADO").first()).toBeVisible();
});

test("adds a timeline note", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId(`paciente-${paciente.id}`).click();
  await expect(page.getByText("ACOMPANHAMENTO")).toBeVisible();

  const titulo = `Nota E2E ${Math.random().toString(36).slice(2, 7)}`;
  await page.getByPlaceholder(/Título da nota/).fill(titulo);
  await page.getByTestId("adicionar-nota").click();

  await expect(page.getByText(titulo)).toBeVisible();
  await expect(page.getByText("NOTA").first()).toBeVisible();
});

test("renders the TCLE section and persists manual link + deadline", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId(`paciente-${paciente.id}`).click();
  await expect(page).toHaveURL(new RegExp(`/paciente/${paciente.id}`));

  // The consent-term section (Section 05) and its sub-blocks render.
  await expect(page.getByText("Termo de Consentimento (TCLE)")).toBeVisible();
  // A freshly created patient has no linked term yet.
  await expect(page.getByText("Sem termo vinculado")).toBeVisible();
  await expect(page.getByText("LINK DE ASSINATURA", { exact: true })).toBeVisible();
  await expect(page.getByText("PRAZO DE ASSINATURA", { exact: true })).toBeVisible();

  // Save a manual signature link, then save a signing deadline. The branded
  // success dialog is the completion signal (more robust than matching a
  // cross-origin API response).
  const link = `https://assinatura.autentique.com.br/manual-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
  await page.getByTestId("termo-link-manual-input").fill(link);
  await page.getByTestId("termo-link-manual-salvar").click();
  await expect(page.getByText("Link de assinatura do termo salvo")).toBeVisible();
  await page.getByText("Entendi").click();

  const prazo = "2026-08-10";
  await page.getByTestId("termo-prazo-input").fill(prazo);
  await page.getByTestId("termo-prazo-salvar").click();
  await expect(page.getByText("Prazo do termo salvo")).toBeVisible();
  await page.getByText("Entendi").click();

  // Reload from the server — the saved values must round-trip into the inputs.
  await page.goto(`/paciente/${paciente.id}`);
  await expect(page.getByTestId("termo-link-manual-input")).toHaveValue(link);
  await expect(page.getByTestId("termo-prazo-input")).toHaveValue(prazo);
});

test("links then clears the Autentique vínculo of the TCLE", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId(`paciente-${paciente.id}`).click();
  await expect(page).toHaveURL(new RegExp(`/paciente/${paciente.id}`));
  await expect(page.getByText("Termo de Consentimento (TCLE)")).toBeVisible();

  // Link a document — only the UUID is extracted and stored.
  const docId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  await page
    .getByTestId("termo-link-input")
    .fill(`https://painel.autentique.com.br/documentos/${docId}`);
  await page.getByTestId("termo-link-salvar").click();
  await expect(page.getByText("TCLE salvo")).toBeVisible();
  await page.getByText("Entendi").click();
  await expect(page.getByTestId("termo-link-input")).toHaveValue(docId);

  // Clear the link by emptying the field and saving again (same Salvar action,
  // which also reports "TCLE salvo").
  await page.getByTestId("termo-link-input").fill("");
  await page.getByTestId("termo-link-salvar").click();
  await expect(page.getByText("TCLE salvo")).toBeVisible();
  await page.getByText("Entendi").click();
  await expect(page.getByTestId("termo-link-input")).toHaveValue("");

  // Round-trips: a reload keeps the vínculo cleared.
  await page.goto(`/paciente/${paciente.id}`);
  await expect(page.getByTestId("termo-link-input")).toHaveValue("");
});

test("shows the download buttons when the TCLE is signed", async ({ page }) => {
  // The "assinado" status comes from a live Autentique query; intercept the
  // patient fetch and mark it signed so the download CTAs render without
  // depending on the external service.
  await page.route(
    new RegExp(`/api/pacientes/${paciente.id}(?:\\?.*)?$`),
    async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const json = await response.json();
      if (json?.paciente) {
        json.paciente.termoStatus = "assinado";
        json.paciente.termoAssinadoEm = "2026-08-13T10:00:00.000Z";
      }
      await route.fulfill({ response, json });
    },
  );

  await page.goto(`/paciente/${paciente.id}`);
  await expect(page.getByText("Termo de Consentimento (TCLE)")).toBeVisible();
  await expect(page.getByText(/Assinado em/)).toBeVisible();
  await expect(page.getByTestId("termo-abrir")).toBeVisible();
  await expect(page.getByTestId("termo-baixar")).toBeVisible();
});

test("branded confirm: 'Arquivar processo?' — cancel aborts, confirm proceeds", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId(`paciente-${paciente.id}`).click();
  await expect(page).toHaveURL(new RegExp(`/paciente/${paciente.id}`));
  await expect(page.getByTestId("arquivar")).toBeVisible();

  // Open the destructive confirm, then cancel — nothing should happen and we
  // must stay on the detail screen.
  await page.getByTestId("arquivar").click();
  await expect(page.getByText("Arquivar processo?")).toBeVisible();
  await page.getByTestId("dialog-cancel").click();
  await expect(page.getByText("Arquivar processo?")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/paciente/${paciente.id}`));
  await expect(page.getByTestId("arquivar")).toBeVisible();

  // Re-open and confirm — the screen navigates back to the home list, proving
  // the archive POST went through.
  await page.getByTestId("arquivar").click();
  await expect(page.getByText("Arquivar processo?")).toBeVisible();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByText("Console de Operação")).toBeVisible();

  // It now lives under the Arquivados tab.
  await page.goto("/");
  await page.getByTestId("aba-arquivados").click();
  await expect(page.getByTestId(`paciente-${paciente.id}`)).toBeVisible();
});

test("branded confirm: 'Remover documento?' — cancel keeps it, confirm removes it", async ({ page }) => {
  // Inject a single document via route interception so the remove flow renders
  // without depending on a real upload, and flip the list to empty once the
  // DELETE fires so the confirm path is observable end-to-end.
  const docId = 990001;
  let removido = false;

  await page.route(
    new RegExp(`/api/pacientes/${paciente.id}/documentos$`),
    async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      const corpo = removido
        ? []
        : [
            {
              id: docId,
              rotulo: "Documento E2E",
              nomeArquivo: "teste.pdf",
              contentType: "application/pdf",
              tamanho: 12345,
              createdAt: "2026-06-01T10:00:00.000Z",
            },
          ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(corpo),
      });
    },
  );

  await page.route(
    new RegExp(`/api/pacientes/${paciente.id}/documentos/${docId}$`),
    async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.continue();
        return;
      }
      removido = true;
      await route.fulfill({ status: 204, body: "" });
    },
  );

  await page.goto(`/paciente/${paciente.id}`);
  const remover = page.getByTestId(`remover-documento-${docId}`);
  await expect(remover).toBeVisible();

  // Cancel — the document stays put and no DELETE is issued.
  await remover.click();
  await expect(page.getByText("Remover documento?")).toBeVisible();
  await page.getByTestId("dialog-cancel").click();
  await expect(page.getByText("Remover documento?")).toHaveCount(0);
  expect(removido).toBe(false);
  await expect(remover).toBeVisible();

  // Confirm — the DELETE fires and the card disappears from the list.
  await remover.click();
  await expect(page.getByText("Remover documento?")).toBeVisible();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId(`remover-documento-${docId}`)).toHaveCount(0);
  expect(removido).toBe(true);
  await expect(page.getByText("Nenhum documento anexado ainda.")).toBeVisible();
});

test("branded confirm: 'Reverter ao padrão?' — cancel keeps the customization, confirm reverts", async ({ page }) => {
  // A fresh patient follows the global default; save once to create a
  // per-patient customization so the revert action becomes available. The
  // editor's badge tracks the server state and refreshes in place after each
  // save/revert, so we assert on it rather than on navigation.
  await page.goto(`/paciente/conteudo/${paciente.id}`);
  await expect(page.getByText("PADRÃO GLOBAL", { exact: true })).toBeVisible();
  await expect(page.getByTestId("reverter-conteudo")).toHaveCount(0);

  // Saving creates the per-patient copy — the badge flips to PERSONALIZADO and
  // the revert action appears.
  await page.getByTestId("salvar-conteudo").click();
  await expect(page.getByText("PERSONALIZADO", { exact: true })).toBeVisible();
  const reverter = page.getByTestId("reverter-conteudo");
  await expect(reverter).toBeVisible();

  // Cancel — the customization is kept and the revert action stays available.
  await reverter.click();
  await expect(page.getByText("Reverter ao padrão?")).toBeVisible();
  await page.getByTestId("dialog-cancel").click();
  await expect(page.getByText("Reverter ao padrão?")).toHaveCount(0);
  await expect(page.getByText("PERSONALIZADO", { exact: true })).toBeVisible();
  await expect(reverter).toBeVisible();

  // Confirm — the revert runs and the patient returns to the global default.
  await reverter.click();
  await expect(page.getByText("Reverter ao padrão?")).toBeVisible();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByText("PADRÃO GLOBAL", { exact: true })).toBeVisible();
  await expect(page.getByTestId("reverter-conteudo")).toHaveCount(0);
});

test("branded notice: 'Formato não aceito' appears for a non-PDF and dismisses", async ({ page }) => {
  await page.goto(`/paciente/${paciente.id}`);
  const anexar = page.getByTestId("anexar-documento");
  await expect(anexar).toBeVisible();

  // expo-document-picker on web opens a native file chooser; feed it a non-PDF
  // so the upload guard rejects it with the single-button branded notice.
  page.once("filechooser", async (chooser) => {
    await chooser.setFiles({
      name: "foto.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("nao sou um pdf"),
    });
  });
  await anexar.click();

  await expect(page.getByText("Formato não aceito")).toBeVisible();
  await expect(page.getByText("Envie apenas arquivos PDF.")).toBeVisible();

  // The single dismiss button closes the notice.
  await page.getByText("Entendi", { exact: true }).click();
  await expect(page.getByText("Formato não aceito")).toHaveCount(0);
});

test("archives then restores a patient", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId(`paciente-${paciente.id}`).click();
  await expect(page.getByTestId("arquivar")).toBeVisible();

  // Archiving first asks for confirmation in the branded dialog; confirm it.
  await page.getByTestId("arquivar").click();
  await page.getByText("Arquivar", { exact: true }).click();
  // On success the screen navigates back to the home list — that is the signal
  // the POST completed (so it isn't cancelled by an early navigation).
  await expect(page.getByText("Console de Operação")).toBeVisible();

  // It now lives under the Arquivados tab.
  await page.goto("/");
  await page.getByTestId("aba-arquivados").click();
  const card = page.getByTestId(`paciente-${paciente.id}`);
  await expect(card).toBeVisible();

  // Open it and restore. The uppercase banner is the archived-state marker
  // (a lowercase "Processo arquivado" timeline entry also exists, hence exact).
  await card.click();
  await expect(page.getByText("PROCESSO ARQUIVADO", { exact: true })).toBeVisible();
  await page.getByTestId("restaurar").click();
  await expect(page.getByText("PROCESSO ARQUIVADO", { exact: true })).toHaveCount(0);
});
