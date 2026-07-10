/**
 * Prova que IMPORTAR um modelo próprio da clínica (Word/PDF) não pode quebrar em
 * silêncio. O Console sobe o arquivo ao armazenamento e o servidor o converte em
 * HTML (mammoth p/ .docx, pdf-parse p/ .pdf) que pré-preenche o editor WYSIWYG —
 * sem mudança de schema. Uma regressão (envio quebrado, parse vazio, marcadores
 * de página vazando, editor não preenchido) deixaria a equipe com um rascunho em
 * branco ou poluído, sem aviso. Aqui cobrimos:
 *
 *   1. .docx → o editor abre preenchido com o texto do documento;
 *   2. .pdf de 2 páginas → o editor abre preenchido E sem os separadores
 *      "-- N of M --" que o pdf-parse insere entre páginas (são removidos no
 *      servidor antes de virar HTML);
 *   3. arquivo ilegível (.pdf inválido) → degrada com um toast de falha
 *      controlado e o editor NÃO abre (nunca um 500 opaco ou um rascunho vazio).
 *
 * A importação só preenche o editor — nada é gravado no banco até "Salvar", que
 * os testes nunca acionam; por isso não há limpeza a fazer.
 */
import { test, expect } from "@playwright/test";
import { docxComParagrafos, pdfComPaginas } from "./fixtures";

const TIPO_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

test.beforeEach(async ({ page }) => {
  // O modal de onboarding só trava "/", mas preencher a flag segue a convenção
  // da suíte e é inofensivo.
  await page.addInitScript(() =>
    localStorage.setItem("kcl-console-guia-visto", "1"),
  );
  await page.goto("/contrato-modelos");
  await expect(
    page.getByRole("heading", { name: "Modelos cadastrados" }),
  ).toBeVisible();
});

test("importa um .docx e pré-preenche o editor com o texto do documento", async ({
  page,
}) => {
  const sufixo = Math.random().toString(36).slice(2, 8);
  const marcador = `Clausula importada do Word ${sufixo}`;
  const segundoParagrafo = `Segunda clausula do contrato ${sufixo}`;

  const buffer = docxComParagrafos([marcador, segundoParagrafo]);
  await page.locator('input[type="file"]').setInputFiles({
    name: `Contrato Modelo Clinica ${sufixo}.docx`,
    mimeType: TIPO_DOCX,
    buffer,
  });

  // Toast de sucesso (escopado à região de notificações).
  const toasts = page.getByLabel("Notifications (F8)");
  await expect(
    toasts.getByText("Arquivo importado", { exact: true }),
  ).toBeVisible({ timeout: 30000 });

  // O editor abre preenchido com os DOIS parágrafos do documento.
  const dialogo = page.getByRole("dialog");
  await expect(
    dialogo.getByRole("heading", { name: "Novo modelo-base" }),
  ).toBeVisible();
  const corpo = dialogo.locator(".ProseMirror");
  await expect(corpo).toContainText(marcador);
  await expect(corpo).toContainText(segundoParagrafo);

  // O título é sugerido a partir do nome do arquivo (sem extensão).
  await expect(
    dialogo.getByPlaceholder("Ex.: Contrato de prestação de serviços médicos", {
      exact: false,
    }),
  ).toHaveValue(`Contrato Modelo Clinica ${sufixo}`);
});

test("importa um .pdf de 2 páginas sem deixar vazar os marcadores de página", async ({
  page,
}) => {
  const sufixo = Math.random().toString(36).slice(2, 8);
  const pagina1 = `PRIMEIRA PAGINA DO CONTRATO ${sufixo}`;
  const pagina2 = `SEGUNDA PAGINA DO CONTRATO ${sufixo}`;

  const buffer = pdfComPaginas([pagina1, pagina2]);
  await page.locator('input[type="file"]').setInputFiles({
    name: `Termo Importado ${sufixo}.pdf`,
    mimeType: "application/pdf",
    buffer,
  });

  const toasts = page.getByLabel("Notifications (F8)");
  await expect(
    toasts.getByText("Arquivo importado", { exact: true }),
  ).toBeVisible({ timeout: 30000 });

  const dialogo = page.getByRole("dialog");
  const corpo = dialogo.locator(".ProseMirror");
  // O texto das duas páginas chega ao editor...
  await expect(corpo).toContainText(pagina1);
  await expect(corpo).toContainText(pagina2);
  // ...mas os separadores "-- 1 of 2 --" / "-- 2 of 2 --" do pdf-parse foram
  // removidos no servidor (são ruído de extração, não conteúdo do documento).
  await expect(corpo).not.toContainText("of 2");
  await expect(corpo).not.toContainText("--");
});

test("avisa quais variáveis faltam após importar e atualiza ao inserir uma", async ({
  page,
}) => {
  // Um Word próprio chega como texto puro, sem nenhuma `{{variável}}` — gerar a
  // partir dele produziria um documento genérico. O editor precisa avisar, de
  // forma visível e não bloqueante, quais variáveis ainda não estão no corpo.
  const sufixo = Math.random().toString(36).slice(2, 8);
  const marcador = `Contrato sem variaveis ${sufixo}`;

  const buffer = docxComParagrafos([marcador]);
  await page.locator('input[type="file"]').setInputFiles({
    name: `Modelo Sem Variaveis ${sufixo}.docx`,
    mimeType: TIPO_DOCX,
    buffer,
  });

  const toasts = page.getByLabel("Notifications (F8)");
  await expect(
    toasts.getByText("Arquivo importado", { exact: true }),
  ).toBeVisible({ timeout: 30000 });

  const dialogo = page.getByRole("dialog");
  await expect(dialogo.locator(".ProseMirror")).toContainText(marcador);

  // O aviso aparece (texto importado não tem nenhuma variável) e cita o motivo.
  const aviso = dialogo.getByText("ainda não", { exact: false }).first();
  await expect(aviso).toBeVisible();
  await expect(dialogo).toContainText("o documento gerado sai");

  // O catálogo aparece como chips para copiar; conta quantas faltam antes...
  const chipNome = dialogo.getByRole("button", { name: /\{\{nome\}\}/ });
  await expect(chipNome).toBeVisible();
  const faltandoAntes = await dialogo
    .getByRole("button", { name: /^\{\{[a-zA-Z]+\}\}/ })
    .count();
  expect(faltandoAntes).toBeGreaterThan(0);

  // ...insere {{nome}} pelo menu Variável do editor...
  await dialogo.getByRole("button", { name: "Inserir variável" }).click();
  await page
    .getByRole("option")
    .filter({ hasText: /^\{\{nome\}\}/ })
    .click();
  await expect(dialogo.locator(".ProseMirror")).toContainText("{{nome}}");

  // ...e o aviso deixa de listar {{nome}} (a lista de faltantes encolhe).
  await expect(chipNome).toHaveCount(0);
  const faltandoDepois = await dialogo
    .getByRole("button", { name: /^\{\{[a-zA-Z]+\}\}/ })
    .count();
  expect(faltandoDepois).toBe(faltandoAntes - 1);
});

test("freia ao marcar como vigente um modelo sem as variáveis essenciais", async ({
  page,
}) => {
  // Um Word importado chega sem nenhuma `{{variável}}`. Marcá-lo como vigente
  // assim geraria documentos genéricos em silêncio. O save tem de pedir uma
  // confirmação explícita — sem bloquear quem realmente quer prosseguir.
  const sufixo = Math.random().toString(36).slice(2, 8);
  const marcador = `Contrato a confirmar ${sufixo}`;

  const buffer = docxComParagrafos([marcador]);
  await page.locator('input[type="file"]').setInputFiles({
    name: `Modelo A Confirmar ${sufixo}.docx`,
    mimeType: TIPO_DOCX,
    buffer,
  });

  const toasts = page.getByLabel("Notifications (F8)");
  await expect(
    toasts.getByText("Arquivo importado", { exact: true }),
  ).toBeVisible({ timeout: 30000 });

  const dialogo = page.getByRole("dialog");
  await expect(dialogo.locator(".ProseMirror")).toContainText(marcador);

  // O modelo importado já vem como vigente; só falta um procedimento p/ salvar.
  await expect(dialogo.getByRole("switch")).toBeChecked();
  await dialogo.getByPlaceholder("Ex.: Blefaroplastia").fill(`Teste ${sufixo}`);

  // Salvar dispara a confirmação (não o save direto).
  await dialogo.getByRole("button", { name: "Criar modelo" }).click();
  const confirmacao = page.getByRole("alertdialog", {
    name: "Marcar como vigente mesmo assim?",
  });
  await expect(confirmacao).toBeVisible();
  // Lista pelo menos uma chave essencial faltante (ex.: {{nome}}).
  await expect(confirmacao.getByText("{{nome}}", { exact: false })).toBeVisible();

  // "Voltar e inserir" cancela: nada é salvo e o editor continua aberto.
  await dialogo.getByRole("button", { name: "Voltar e inserir" }).click();
  await expect(confirmacao).toHaveCount(0);
  await expect(
    dialogo.getByRole("heading", { name: "Novo modelo-base" }),
  ).toBeVisible();
  await expect(
    toasts.getByText("Modelo criado", { exact: true }),
  ).toHaveCount(0);
});

test("não atrapalha salvar um rascunho não vigente sem as variáveis", async ({
  page,
}) => {
  // O freio vale só para modelos vigentes. Um rascunho (não vigente) salva sem
  // fricção, mesmo sem nenhuma variável — drafting tem de fluir. Interceptamos a
  // criação p/ não escrever no banco (a suíte não faz limpeza de modelos).
  const sufixo = Math.random().toString(36).slice(2, 8);
  const marcador = `Rascunho livre ${sufixo}`;

  await page.route("**/contrato-modelos", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: "stub-id",
        tipo: "contrato",
        procedimento: `Teste ${sufixo}`,
        titulo: `Modelo Rascunho ${sufixo}`,
        corpo: "<p>stub</p>",
        versao: 1,
        vigente: false,
        observacoes: null,
        statusFabrica: null,
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      }),
    });
  });

  const buffer = docxComParagrafos([marcador]);
  await page.locator('input[type="file"]').setInputFiles({
    name: `Modelo Rascunho ${sufixo}.docx`,
    mimeType: TIPO_DOCX,
    buffer,
  });

  const toasts = page.getByLabel("Notifications (F8)");
  await expect(
    toasts.getByText("Arquivo importado", { exact: true }),
  ).toBeVisible({ timeout: 30000 });

  const dialogo = page.getByRole("dialog");
  await expect(dialogo.locator(".ProseMirror")).toContainText(marcador);
  await dialogo.getByPlaceholder("Ex.: Blefaroplastia").fill(`Teste ${sufixo}`);

  // Desliga "vigente" → guardado como rascunho, fora da geração.
  await dialogo.getByRole("switch").click();
  await expect(dialogo.getByRole("switch")).not.toBeChecked();

  // Salva direto, sem passar pela confirmação de vigente.
  await dialogo.getByRole("button", { name: "Criar modelo" }).click();
  await expect(
    page.getByRole("alertdialog", { name: "Marcar como vigente mesmo assim?" }),
  ).toHaveCount(0);
  await expect(
    toasts.getByText("Modelo criado", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
});

test("degrada com um toast controlado quando o arquivo é ilegível", async ({
  page,
}) => {
  // Um .pdf inválido passa pela checagem de extensão/limite do cliente e sobe ao
  // armazenamento, mas o servidor não consegue extrair texto: deve responder com
  // erro tratável (422) → toast de falha, SEM abrir o editor nem quebrar.
  const buffer = Buffer.from(
    "isto nao e um PDF de verdade, apenas bytes quaisquer",
    "utf8",
  );
  await page.locator('input[type="file"]').setInputFiles({
    name: "arquivo-corrompido.pdf",
    mimeType: "application/pdf",
    buffer,
  });

  const toasts = page.getByLabel("Notifications (F8)");
  await expect(
    toasts.getByText("Não foi possível importar o arquivo", { exact: true }),
  ).toBeVisible({ timeout: 30000 });

  // O editor NÃO abre num rascunho vazio.
  await expect(
    page.getByRole("heading", { name: "Novo modelo-base" }),
  ).toHaveCount(0);
});
