/**
 * Prova que a etapa de EDIÇÃO + REVISÃO POR IA de um rascunho de contrato (o
 * fluxo WYSIWYG) não pode quebrar em silêncio. A geração em si já é coberta por
 * outro teste; aqui o foco é o que vem depois dela:
 *
 *  1. gera um rascunho para uma paciente pronta (porta de prontidão verde);
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
  garantirModeloBaseContratoVigente,
  obterMedicos,
  type CreatedPaciente,
  type ModeloBaseVigente,
} from "./api";

let modeloBase: ModeloBaseVigente;
let paciente: CreatedPaciente | undefined;

test.beforeAll(async () => {
  // A geração resolve o modelo-base único e vigente; garante essa pré-condição.
  modeloBase = await garantirModeloBaseContratoVigente();
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

test("edita, salva e revisa por IA um rascunho de contrato", async ({
  page,
}) => {
  // Paciente PRONTA: a porta de prontidão da ficha de contrato exige
  // procedimentos, snapshot da médica (medica/crm/clinica), pagamento com
  // vencimento e data de cirurgia. Vincular a médica padrão preenche o snapshot,
  // e informar o saldo + vencimento satisfaz o item de pagamento sem dirty.
  const medicos = await obterMedicos();
  const padrao = medicos.find((m) => m.padrao && m.ativo) ?? medicos[0];
  paciente = await criarPacienteTeste({
    medicoId: padrao.id,
    valorPendente: 1500,
    dataPagamentoPendente: "2026-08-01",
    dataCirurgia: "2026-08-15",
  });

  const sufixo = Math.random().toString(36).slice(2, 8);
  const marcador = `Clausula adicional de teste E2E ${sufixo}`;

  // O modal de onboarding só trava "/", mas preencher a flag é inofensivo.
  await page.addInitScript(() =>
    localStorage.setItem("kcl-console-guia-visto", "1"),
  );

  // A pré-seleção via querystring já abre a paciente na aba de contrato.
  await page.goto(`/documentos?paciente=${paciente.id}&tipo=contrato`);

  // Os mesmos textos dos toasts ("Rascunho salvo", "Revisão concluída") também
  // aparecem como rótulos na lista de prontidão do corpo da página, então as
  // asserções de toast são escopadas à região de notificações para não casar
  // múltiplos elementos (strict mode).
  const toasts = page.getByLabel("Notifications (F8)");

  // Prontidão verde → "Gerar rascunho" liberado.
  const gerar = page.getByRole("button", { name: "Gerar rascunho" });
  await expect(gerar).toBeEnabled({ timeout: 20000 });
  await gerar.click();

  // O rascunho gerado renderiza no editor.
  const editor = page.locator(".editor-doc").first();
  await expect(editor).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("heading", { name: "Contratos gerados" }),
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
