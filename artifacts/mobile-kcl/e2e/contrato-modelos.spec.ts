import { test, expect } from "@playwright/test";

import {
  obterContratoModelos,
  atualizarContratoModelo,
  criarContratoModelo,
  removerContratoModelo,
  type ContratoModeloE2E,
} from "./api";

/**
 * Restore-to-factory on the mobile Console (app/contrato-modelos.tsx), exercised
 * against the real Expo web app + shared API server + database.
 *
 * The templates are a shared singleton seeded for the demo, so the test snapshots
 * the chosen template first and rewrites it (vigente + original text) afterwards,
 * leaving the shared state exactly as it was found.
 */

let original: ContratoModeloE2E | null = null;

test.afterEach(async () => {
  if (original) {
    await atualizarContratoModelo(original.id, {
      tipo: original.tipo,
      procedimento: original.procedimento,
      titulo: original.titulo,
      corpo: original.corpo,
      vigente: original.vigente,
      observacoes: original.observacoes,
    });
    original = null;
  }
});

test("restores a template to the factory model, leaving it não vigente", async ({
  page,
}) => {
  // Pick a seeded template and snapshot it for cleanup.
  const modelos = await obterContratoModelos();
  const alvo = modelos.find((m) => m.tipo === "contrato") ?? modelos[0];
  test.skip(!alvo, "Nenhum modelo cadastrado para restaurar.");
  original = alvo!;

  // Seed a known baseline: make it vigente so the restore has something to undo,
  // mirroring the web behavior of coming back não vigente.
  await atualizarContratoModelo(original.id, {
    tipo: original.tipo,
    procedimento: original.procedimento,
    titulo: original.titulo,
    corpo: original.corpo,
    vigente: true,
    observacoes: original.observacoes,
  });

  await page.goto("/contrato-modelos");

  // The chosen template is listed with its own restore action.
  const restaurar = page.getByTestId(`restaurar-${original.id}`);
  await expect(restaurar).toBeVisible();

  // Tapping it opens the branded confirmation sheet.
  await restaurar.click();
  await expect(page.getByText("Restaurar ao modelo de fábrica?")).toBeVisible();

  // Confirm the restore.
  await page.getByTestId("dialog-confirm").click();

  // Success notice appears.
  await expect(page.getByText("Modelo restaurado")).toBeVisible();
  await page.getByTestId("dialog-confirm").click();

  // The server agrees: the template came back não vigente.
  const apos = (await obterContratoModelos()).find((m) => m.id === original!.id);
  expect(apos).toBeTruthy();
  expect(apos!.vigente).toBe(false);

  // And the screen reflects the inactive state on this template's card.
  await expect(
    page.getByTestId(`modelo-${original.id}`).getByText("INATIVO"),
  ).toBeVisible();
});

test("warns before discarding unsaved edits in the template editor", async ({
  page,
}) => {
  // A throwaway template to edit; cleaned up at the end.
  const sufixo = Math.random().toString(36).slice(2, 8);
  const modelo = await criarContratoModelo({
    tipo: "contrato",
    procedimento: `ZZ Teste Guarda ${sufixo}`,
    titulo: `Contrato de teste guarda ${sufixo}`,
    corpo: "Texto original do contrato de teste.",
    vigente: false,
    observacoes: "Criado pelo teste e2e — guarda de alterações.",
  });

  try {
    await page.goto("/contrato-modelos");

    // Open the editor for our template.
    await page.getByTestId(`editar-${modelo.id}`).click();
    const corpo = page.getByTestId("input-corpo");
    await expect(corpo).toBeVisible();

    // Closing immediately (no edits) does NOT prompt — the editor just closes.
    await page.getByTestId("editor-cancelar").click();
    await expect(page.getByText("Descartar alterações?")).not.toBeVisible();
    await expect(corpo).not.toBeVisible();

    // Reopen and type into the body so there are unsaved edits.
    await page.getByTestId(`editar-${modelo.id}`).click();
    await expect(corpo).toBeVisible();
    await corpo.fill("Texto original do contrato de teste. Edição não salva.");

    // Tapping the X now raises the branded discard confirmation.
    await page.getByTestId("editor-cancelar").click();
    await expect(page.getByText("Descartar alterações?")).toBeVisible();

    // Cancelling ("Continuar editando") keeps the editor open with the edits.
    await page.getByTestId("continuar-editando").click();
    await expect(page.getByText("Descartar alterações?")).not.toBeVisible();
    await expect(corpo).toBeVisible();
    await expect(corpo).toHaveValue(
      "Texto original do contrato de teste. Edição não salva.",
    );

    // Tapping X again and confirming discards the edits and closes the editor.
    await page.getByTestId("editor-cancelar").click();
    await expect(page.getByText("Descartar alterações?")).toBeVisible();
    await page.getByTestId("descartar-sair").click();
    await expect(corpo).not.toBeVisible();

    // The edit was discarded, not saved: the server still has the original body.
    const apos = (await obterContratoModelos()).find((m) => m.id === modelo.id);
    expect(apos).toBeTruthy();
    expect(apos!.corpo).toBe("Texto original do contrato de teste.");
  } finally {
    await removerContratoModelo(modelo.id);
  }
});

test("fails gracefully when restoring a manually-created template (no factory text)", async ({
  page,
}) => {
  // A template with a never-before-seen procedimento has no factory pair, so the
  // restore endpoint returns 422 ("semPadrao"). This is the path the mobile
  // screen must handle with a friendly notice instead of a stuck button.
  const sufixo = Math.random().toString(36).slice(2, 8);
  const manual = await criarContratoModelo({
    tipo: "contrato",
    procedimento: `ZZ Teste Manual ${sufixo}`,
    titulo: `Contrato manual de teste ${sufixo}`,
    corpo: "Texto redigido manualmente pela equipe, sem base de fábrica.",
    vigente: false,
    observacoes: "Criado pelo teste e2e — sem par de fábrica.",
  });

  try {
    await page.goto("/contrato-modelos");

    // The custom template is listed with its own restore action.
    const restaurar = page.getByTestId(`restaurar-${manual.id}`);
    await expect(restaurar).toBeVisible();

    // Tapping it opens the branded confirmation sheet.
    await restaurar.click();
    await expect(
      page.getByText("Restaurar ao modelo de fábrica?"),
    ).toBeVisible();

    // Confirm the restore — the server will reject it with 422.
    await page.getByTestId("dialog-confirm").click();

    // The friendly "criado manualmente" notice appears (server message wins).
    await expect(page.getByText("Não foi possível restaurar")).toBeVisible();
    await expect(
      page.getByText(
        "Este modelo foi criado manualmente e não tem um texto de fábrica para restaurar.",
      ),
    ).toBeVisible();

    // The button is not stuck on "Restaurando..." — dismissing the notice
    // returns the card to its normal restore action.
    await page.getByTestId("dialog-confirm").click();
    await expect(
      page.getByTestId(`restaurar-${manual.id}`).getByText(
        "Restaurar ao modelo de fábrica",
      ),
    ).toBeVisible();

    // The template is unchanged on the server: same text, still não vigente.
    const apos = (await obterContratoModelos()).find((m) => m.id === manual.id);
    expect(apos).toBeTruthy();
    expect(apos!.titulo).toBe(manual.titulo);
    expect(apos!.corpo).toBe(manual.corpo);
    expect(apos!.vigente).toBe(false);
    expect(apos!.versao).toBe(manual.versao);
  } finally {
    // Cleanup: remove the template the test created.
    await removerContratoModelo(manual.id);
  }
});
