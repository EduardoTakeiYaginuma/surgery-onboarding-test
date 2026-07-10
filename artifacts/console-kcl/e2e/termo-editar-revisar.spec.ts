/**
 * Espelha o teste do contrato para o TERMO DE CONSENTIMENTO (TCLE): prova que a
 * etapa de EDIÇÃO + REVISÃO POR IA de um rascunho de termo (o fluxo WYSIWYG) não
 * pode quebrar em silêncio. O termo compartilha o mesmo pipeline do contrato
 * (modelo-base → preenchimento → edição → revisão por IA → aprovação humana),
 * com foco de revisão diferente, então uma regressão aqui passaria despercebida.
 *
 *  1. gera um rascunho de termo para uma paciente (o termo NÃO tem porta de
 *     prontidão — a ficha é só leitura; basta um modelo-base de termo vigente);
 *  2. edita o corpo no editor e salva → toast "Rascunho salvo", SEM "Não foi
 *     possível salvar", e a edição persiste após o remount do editor;
 *  3. roda "Revisar com IA" → ou o relatório renderiza (sucesso) ou degrada com
 *     um toast de falha controlado — e, nos dois casos, o corpo do rascunho
 *     permanece intacto (a revisão nunca apaga/corrompe a edição da equipe).
 */
import { test, expect } from "@playwright/test";
import {
  arquivarPaciente,
  criarPacienteTeste,
  garantirModeloBaseTermoVigente,
  type CreatedPaciente,
  type ModeloBaseVigente,
} from "./api";

let modeloBase: ModeloBaseVigente;
let paciente: CreatedPaciente | undefined;

test.beforeAll(async () => {
  // A geração resolve o modelo-base único e vigente; garante essa pré-condição.
  modeloBase = await garantirModeloBaseTermoVigente();
});

test.afterAll(async () => {
  if (modeloBase) await modeloBase.restaurar();
});

test.afterEach(async () => {
  if (paciente) {
    await arquivarPaciente(paciente.id);
    paciente = undefined;
  }
});

test("edita, salva e revisa por IA um rascunho de termo", async ({ page }) => {
  // O termo não tem porta de prontidão (a ficha é só leitura), então uma
  // paciente básica já libera a geração — basta o modelo-base de termo vigente.
  paciente = await criarPacienteTeste();

  const sufixo = Math.random().toString(36).slice(2, 8);
  const marcador = `Clausula adicional de teste E2E ${sufixo}`;

  // O modal de onboarding só trava "/", mas preencher a flag é inofensivo.
  await page.addInitScript(() =>
    localStorage.setItem("kcl-console-guia-visto", "1"),
  );

  // A pré-seleção via querystring já abre a paciente na aba de termo.
  await page.goto(`/documentos?paciente=${paciente.id}&tipo=termo`);

  // Os mesmos textos dos toasts ("Rascunho salvo", "Revisão concluída") também
  // aparecem como rótulos na lista de prontidão do corpo da página, então as
  // asserções de toast são escopadas à região de notificações para não casar
  // múltiplos elementos (strict mode).
  const toasts = page.getByLabel("Notifications (F8)");

  // Modelo-base de termo vigente → "Gerar rascunho" liberado.
  const gerar = page.getByRole("button", { name: "Gerar rascunho" });
  await expect(gerar).toBeEnabled({ timeout: 20000 });
  await gerar.click();

  // O rascunho gerado renderiza no editor.
  const editor = page.locator(".editor-doc").first();
  await expect(editor).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("heading", { name: "Termos (TCLE) gerados" }),
  ).toBeVisible();

  // Edita o corpo: insere um marcador único ao final do documento.
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(` ${marcador}`);
  await expect(editor).toContainText(marcador);

  // Salva a edição → toast de sucesso e NENHUM toast de falha.
  const salvar = page.getByRole("button", { name: "Salvar edições" });
  await expect(salvar).toBeEnabled();
  await salvar.click();
  await expect(toasts.getByText("Rascunho salvo", { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await expect(
    toasts.getByText("Não foi possível salvar", { exact: true }),
  ).toHaveCount(0);

  // A edição persistiu: o editor remonta após salvar e o marcador continua lá.
  await expect(editor).toContainText(marcador, { timeout: 20000 });

  // Roda a revisão por IA. Ou renderiza o relatório (sucesso), ou degrada com um
  // toast de falha controlado — o que importa é não quebrar em silêncio.
  const revisar = page.getByRole("button", { name: /Revisar (com IA|de novo)/ });
  await expect(revisar).toBeEnabled();
  await revisar.click();

  const sucesso = toasts.getByText("Revisão concluída", { exact: true });
  const degradado = toasts.getByText("A revisão de IA falhou", { exact: true });
  await expect(sucesso.or(degradado)).toBeVisible({ timeout: 60000 });

  // No sucesso, o relatório de IA renderiza na página (cabeçalho "Revisão de IA"
  // do bloco RelatorioIa — um <span>, não um heading; exato para não casar os
  // rótulos de prontidão "Revisão de IA feita/opcional").
  if (await sucesso.isVisible()) {
    await expect(
      page.getByText("Revisão de IA", { exact: true }).first(),
    ).toBeVisible({ timeout: 20000 });
  }

  // Em qualquer desfecho, o corpo do rascunho permanece intacto.
  await expect(editor).toContainText(marcador);
});
