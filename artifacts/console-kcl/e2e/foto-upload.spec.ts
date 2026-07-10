/**
 * Prova que o caminho de UPLOAD DE FOTO (credenciais do médico) não pode quebrar
 * em silêncio. A foto da médica e o logo da clínica aparecem na página da
 * paciente; a equipe os envia pelo diálogo "Médicos". O envio é multipart direto
 * ao servidor (`POST /api/medicos/:id/foto`), que guarda o arquivo em Object
 * Storage PRIVADO e devolve o médico já com uma URL ASSINADA de leitura. Uma
 * regressão no envio, na gravação ou na assinatura deixaria a equipe sem
 * conseguir anexar imagens — sem aviso. Aqui cobrimos:
 *
 *   1. PNG válido → toast de sucesso E a miniatura renderiza de volta (a URL
 *      assinada resolve para bytes de imagem reais: `naturalWidth > 0`);
 *   2. arquivo rejeitado (não-imagem) → degrada com um toast de falha controlado
 *      (nunca um 500 opaco nem um sucesso silencioso).
 *
 * Cada teste cria seu próprio médico descartável e o DESATIVA na limpeza (não há
 * exclusão de médico), para não vazar estado no banco compartilhado.
 */
import { test, expect } from "@playwright/test";
import { criarMedicoTeste, desativarMedico } from "./api";
import { pngMinimo } from "./fixtures";

test.beforeEach(async ({ page }) => {
  // O modal de onboarding torna "/" inerte até a flag estar marcada.
  await page.addInitScript(() =>
    localStorage.setItem("kcl-console-guia-visto", "1"),
  );
});

/** Abre o diálogo "Médicos" e devolve a linha do médico de nome `nome`. */
async function abrirLinhaMedico(page: import("@playwright/test").Page, nome: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Médicos" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Médicos" })).toBeVisible();
  const linha = dialog.locator("div.bg-background.px-4.py-3").filter({
    hasText: nome,
  });
  await expect(linha).toBeVisible();
  return linha;
}

test("envia um PNG e a foto do médico volta renderizada (URL assinada resolve)", async ({
  page,
}) => {
  const medico = await criarMedicoTeste();
  try {
    const linha = await abrirLinhaMedico(page, medico.nome);

    // O input de foto é o primeiro file input da linha (o segundo é o do logo).
    await linha.locator('input[type="file"]').first().setInputFiles({
      name: "foto-medico.png",
      mimeType: "image/png",
      buffer: pngMinimo(),
    });

    const toasts = page.getByLabel("Notifications (F8)");
    await expect(
      toasts.getByText("Foto atualizada", { exact: true }),
    ).toBeVisible({ timeout: 30000 });

    // A miniatura volta renderizada: a URL assinada precisa resolver para uma
    // imagem real. `naturalWidth > 0` prova que o <img> decodificou os bytes.
    const img = linha.getByRole("img", { name: `Foto de ${medico.nome}` }).first();
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute("src", /^https?:\/\//);
    await expect
      .poll(
        () =>
          img.evaluate((el) => (el as HTMLImageElement).naturalWidth),
        { timeout: 30000 },
      )
      .toBeGreaterThan(0);
  } finally {
    await desativarMedico(medico.id);
  }
});

test("degrada com um toast controlado quando o arquivo não é uma imagem", async ({
  page,
}) => {
  const medico = await criarMedicoTeste();
  try {
    const linha = await abrirLinhaMedico(page, medico.nome);

    // Um arquivo de texto passa pelo seletor (o `accept` é só uma dica), sobe ao
    // servidor e é REJEITADO pela checagem de mimetype (400) → toast de falha,
    // SEM gravar foto nem quebrar.
    await linha.locator('input[type="file"]').first().setInputFiles({
      name: "nao-e-imagem.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("isto nao e uma imagem", "utf8"),
    });

    const toasts = page.getByLabel("Notifications (F8)");
    await expect(
      toasts.getByText("Não foi possível enviar a foto", { exact: true }),
    ).toBeVisible({ timeout: 30000 });

    // A foto NÃO foi gravada: nenhuma miniatura aparece na linha.
    await expect(
      linha.getByRole("img", { name: `Foto de ${medico.nome}` }),
    ).toHaveCount(0);
  } finally {
    await desativarMedico(medico.id);
  }
});
