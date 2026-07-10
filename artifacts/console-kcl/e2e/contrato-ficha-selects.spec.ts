import { test, expect } from "@playwright/test";

import {
  arquivarPaciente,
  criarPacienteTeste,
  obterMedicos,
  type CreatedPaciente,
  type MedicoConfig,
} from "./api";

/**
 * Regression guard: the contract FICHA editor (FichaContratoEditavel em
 * gerador-contrato.tsx) tem o mesmo <Select> de "Médico responsável" que o
 * editor da paciente — e o mesmo risco. Seu valor é definido por um
 * `form.reset(valoresFichaContrato(p))` assíncrono (gated em `pronto`), e o
 * Radix <Select> dispara um `onValueChange("")` espúrio logo após o valor
 * controlado mudar (o <option> nativo ainda não está registrado). Sem o guard
 * `if (!v) return`, esse "" desvincularia a médica salva e o trigger voltaria
 * ao placeholder.
 *
 * Este teste cria uma paciente com médica vinculada, abre a ficha de contrato
 * (/documentos?paciente=X&tipo=contrato) e afirma que o trigger mostra a médica
 * SALVA — falhando de forma determinística se o guard for removido ou a janela
 * de timing do reset regredir.
 */

const PLACEHOLDER_MEDICO = "Selecione o médico";

let medico: MedicoConfig;
let paciente: CreatedPaciente | undefined;

test.beforeAll(async () => {
  const medicos = await obterMedicos();
  const ativo = medicos.find((m) => m.ativo) ?? medicos[0];
  if (!ativo) throw new Error("Nenhum médico cadastrado em /medicos");
  medico = ativo;
});

test.afterEach(async () => {
  if (paciente) {
    await arquivarPaciente(paciente.id);
    paciente = undefined;
  }
});

test("a ficha de contrato pré-seleciona a médica salva (não o placeholder)", async ({
  page,
}) => {
  // Paciente vinculada à médica — o snapshot (medica/crm/clinica) é preenchido
  // a partir do cadastro do médico no servidor.
  paciente = await criarPacienteTeste({ medicoId: medico.id });

  // O modal de onboarding só trava "/", mas preencher a flag é inofensivo.
  await page.addInitScript(() =>
    localStorage.setItem("kcl-console-guia-visto", "1"),
  );

  // A querystring abre direto a ficha de contrato da paciente.
  await page.goto(`/documentos?paciente=${paciente.id}&tipo=contrato`);

  // O trigger do Radix Select renderiza como role="combobox". Depois que o
  // form.reset() roda (gated em p + config + medicosAtivos), ele mostra o nome
  // salvo. `filter({ hasText })` usa contains-match, então qualquer sufixo
  // " · padrão"/" (inativo)" no rótulo não atrapalha.
  const medicoCombobox = page
    .getByRole("combobox")
    .filter({ hasText: medico.nome });
  await expect(medicoCombobox).toBeVisible({ timeout: 20000 });

  // Cinto e suspensório: o placeholder não pode aparecer em nenhum combobox.
  await expect(
    page.getByRole("combobox").filter({ hasText: PLACEHOLDER_MEDICO }),
  ).toHaveCount(0);

  // Segundo cenário do mesmo bug: salvar uma edição NÃO relacionada dispara
  // outro `form.reset(values)` (onSuccess do onSubmit). É exatamente o sintoma
  // do #187 — sem o guard `if (!v) return`, o reset pós-save desvincularia a
  // médica e bloquearia silenciosamente o save seguinte. Editamos um campo
  // inofensivo (Valor pago) só para habilitar o botão (gated em `dirty`).
  const valorPago = page.getByLabel("Valor pago (R$)");
  await valorPago.fill("1234");

  const salvar = page.getByRole("button", {
    name: "Salvar dados do contrato",
  });
  await expect(salvar).toBeEnabled();
  await salvar.click();

  // Toast de sucesso confirma que o PATCH passou (e, portanto, que o `local`
  // obrigatório não foi zerado por um "" espúrio no caminho do paciente).
  await expect(page.getByText("Dados do contrato salvos")).toBeVisible({
    timeout: 20000,
  });

  // Após o reset pós-save, a médica salva continua selecionada e o placeholder
  // não reaparece.
  await expect(
    page.getByRole("combobox").filter({ hasText: medico.nome }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox").filter({ hasText: PLACEHOLDER_MEDICO }),
  ).toHaveCount(0);
});
