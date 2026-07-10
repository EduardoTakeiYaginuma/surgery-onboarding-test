/**
 * Guarda a lógica do EDITOR DE CONTRATO (gerador-contrato.tsx) que vai além de
 * "edita e salva" — a parte que um bug recente quebrou à mão e que ainda não
 * tinha cobertura de navegador:
 *
 *   1. baseline vs. corpoEdit: "Salvar edições" começa DESABILITADO (sem
 *      edições), habilita ao editar, e volta a desabilitar após salvar (o
 *      onReady da remontagem redefine a baseline → corpoSujo falso de novo);
 *   2. após salvar, "Revisar com IA" fica LIBERADO (não exige re-salvar) — a
 *      regressão exata corrigida nesta sessão era a baseline NÃO reiniciar,
 *      deixando o botão travado pedindo um novo "Salvar";
 *   3. "Reverter alterações" (o desfazer por remontagem via resetNonce) descarta
 *      as edições não salvas e recarrega o documento pristino salvo;
 *   4. um documento já aprovado (status != "rascunho") renderiza em
 *      SOMENTE-LEITURA: sem barra de ferramentas e sem "Salvar edições".
 *
 * NOTA DE ESCOPO: o editor (componente GeradorDocumento de gerador-contrato.tsx)
 * vive na área "Geração de documentos" (/documentos), não na página da paciente.
 * A aba "Contrato" de /paciente/:id virou apenas acompanhamento de status e tem
 * um botão "Gerar contrato" que leva justamente para /documentos. Por isso o
 * teste exercita /documentos?paciente=&tipo=contrato, onde a lógica descrita na
 * tarefa de fato roda. A criação da paciente usa um CPF com checksum válido
 * (helpers de api.ts), o que a runTest agent não consegue fazer sozinha.
 */
import { test, expect } from "@playwright/test";
import {
  arquivarPaciente,
  criarPacienteTeste,
  gerarRascunhoContratoPaciente,
  listarGeracoesPaciente,
  aprovarEEnviarContratoGeracao,
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

test("salva/reverte o rascunho e renderiza somente-leitura quando aprovado", async ({
  page,
}) => {
  // Paciente vinculada à médica padrão (preenche o snapshot médica/CRM/clínica).
  // A geração via API não depende da porta de prontidão (essa é só da UI), mas
  // criamos uma paciente "completa" para refletir o uso real.
  const medicos = await obterMedicos();
  const padrao = medicos.find((m) => m.padrao && m.ativo) ?? medicos[0];
  paciente = await criarPacienteTeste({
    medicoId: padrao.id,
    valorPendente: 1500,
    dataPagamentoPendente: "2026-08-01",
    dataCirurgia: "2026-08-15",
  });

  // Cria o rascunho direto pela API (endpoint POST /pacientes/:id/contratos/gerar),
  // assim o editor já abre com um documento — sem depender da UI de geração.
  await gerarRascunhoContratoPaciente(paciente.id);

  const sufixo = Math.random().toString(36).slice(2, 8);
  const marcadorSalvo = `Clausula SALVA E2E ${sufixo}`;
  const marcadorDescartado = `Clausula DESCARTADA E2E ${sufixo}`;

  // O modal de onboarding só trava "/", mas preencher a flag é inofensivo.
  await page.addInitScript(() =>
    localStorage.setItem("kcl-console-guia-visto", "1"),
  );

  // A pré-seleção via querystring já abre a paciente na aba de contrato.
  await page.goto(`/documentos?paciente=${paciente.id}&tipo=contrato`);

  const editor = page.locator(".editor-doc").first();
  await expect(editor).toBeVisible({ timeout: 20000 });

  const salvar = page.getByRole("button", { name: "Salvar edições" });
  const reverter = page.getByRole("button", { name: "Reverter alterações" });
  const revisar = page.getByRole("button", { name: /Revisar (com IA|de novo)/ });
  // Botão da barra de ferramentas (só existe enquanto o editor é editável).
  const ferramentaNegrito = page.getByRole("button", { name: "Negrito" });

  // Editável: barra presente; sem edições, "Salvar edições" começa DESABILITADO.
  await expect(ferramentaNegrito).toBeVisible();
  await expect(salvar).toBeDisabled();
  await expect(reverter).toHaveCount(0);

  // (1) Editar habilita "Salvar edições".
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(` ${marcadorSalvo}`);
  await expect(editor).toContainText(marcadorSalvo);
  await expect(salvar).toBeEnabled();

  // Salvar → o editor remonta, a baseline reinicia e "Salvar edições" volta a
  // ficar DESABILITADO (corpoSujo falso), com a edição persistida.
  const toasts = page.getByLabel("Notifications (F8)");
  await salvar.click();
  await expect(toasts.getByText("Rascunho salvo", { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await expect(editor).toContainText(marcadorSalvo, { timeout: 20000 });
  await expect(salvar).toBeDisabled();
  await expect(reverter).toHaveCount(0);

  // (2) Com a baseline reiniciada, "Revisar com IA" fica LIBERADO (não exige
  // re-salvar). Não disparamos a revisão aqui (lenta e coberta em outro teste);
  // basta provar que o botão não ficou travado pedindo um novo "Salvar".
  await expect(revisar).toBeEnabled();

  // (3) Editar de novo e DESCARTAR via "Reverter alterações": o editor remonta
  // com o documento salvo (mantém o marcador salvo, perde o descartado).
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(` ${marcadorDescartado}`);
  await expect(editor).toContainText(marcadorDescartado);
  await expect(reverter).toBeVisible();
  await reverter.click();
  await expect(editor).not.toContainText(marcadorDescartado, { timeout: 20000 });
  await expect(editor).toContainText(marcadorSalvo);
  await expect(salvar).toBeDisabled();

  // (4) Aprovar a geração (via a mesma rota do Console) tira-a do status
  // "rascunho". Recarregamos a página: a geração reabre em SOMENTE-LEITURA —
  // sem barra de ferramentas e sem "Salvar edições".
  const geracoes = await listarGeracoesPaciente(paciente.id);
  const contrato = geracoes.find((g) => g.tipo === "contrato");
  if (!contrato) throw new Error("Rascunho de contrato não encontrado.");
  await aprovarEEnviarContratoGeracao(contrato.id);

  await page.reload();
  await expect(editor).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByText("Documento já aprovado", { exact: false }),
  ).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("button", { name: "Negrito" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Salvar edições" }),
  ).toHaveCount(0);
});
