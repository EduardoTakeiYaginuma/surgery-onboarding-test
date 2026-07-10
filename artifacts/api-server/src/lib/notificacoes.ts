import { logger } from "./logger";
import type { ContratoStatus } from "./autentique";
import { notificacaoConfigRepo } from "./notificacao-config-repo";
import { hojeISO } from "./prazos";
import { montarLinkConsolePaciente } from "./saidas";

/**
 * Avisos à equipe sobre o contrato. Dois gatilhos:
 *   1. Transição de status (assinou/recusou) — disparada pela reconsulta/webhook
 *      numa mudança real (ver `notificarTransicaoContrato`).
 *   2. Prazo de assinatura vencido — disparada pela varredura
 *      `processarAlertasPrazo` (ver contrato.ts), com dedup por paciente.
 *
 * Entrega: POST para um webhook configurável. O payload traz `text` (Slack),
 * `content` (Discord), `message` e campos estruturados, para casar com a maioria
 * dos receptores sem acoplar a um provedor.
 *
 * Configurável/silenciável (a equipe define pelo Console, sem mexer em secrets):
 *   - Destino e liga/desliga vêm da config persistida (config_notificacao); o
 *     destino salvo tem prioridade sobre EQUIPE_NOTIFICACAO_WEBHOOK (fallback).
 *   - Silenciado quando o toggle do Console pede OU EQUIPE_NOTIFICACAO_SILENCIADA
 *     = "true" (kill switch por env). Sem nenhum destino → desligado.
 *
 * Nunca lança: qualquer falha de rede/timeout é só registrada em log, para que
 * o webhook e o carregamento do paciente jamais quebrem por causa do aviso.
 */

const TIMEOUT_MS = 8000;

export interface PacienteNotificavel {
  nome: string;
}

/**
 * Resultado do envio do aviso à equipe:
 *   - "enviado": webhook aceitou.
 *   - "silenciado": a equipe desligou os avisos (toggle/kill switch).
 *   - "sem-webhook": nenhum destino configurado.
 *   - "falha": destino existe mas a entrega falhou (rede/HTTP) — vale retentar.
 */
export type ResultadoEnvio = "enviado" | "silenciado" | "sem-webhook" | "falha";

/**
 * POST de baixo nível para o webhook. Monta o payload multi-provedor e devolve
 * o resultado bruto (incluindo o status HTTP, quando houve resposta) para que os
 * chamadores formatem a saída como precisarem. Nunca lança.
 */
async function postWebhook(
  webhook: string,
  texto: string,
  extra: Record<string, unknown>,
): Promise<{ ok: boolean; status?: number }> {
  const corpo = JSON.stringify({
    text: texto,
    content: texto,
    message: texto,
    ...extra,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: corpo,
      signal: controller.signal,
    });
    if (!resp.ok) {
      logger.warn({ status: resp.status }, "Webhook rejeitou o aviso");
      return { ok: false, status: resp.status };
    }
    return { ok: true, status: resp.status };
  } catch (err) {
    logger.warn({ err }, "Falha ao enviar aviso à equipe");
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Núcleo de entrega compartilhado pelos dois tipos de aviso. Resolve config,
 * silenciamento e destino; monta o payload multi-provedor e faz o POST.
 */
async function enviarAvisoEquipe(
  texto: string,
  extra: Record<string, unknown>,
): Promise<ResultadoEnvio> {
  const config = await notificacaoConfigRepo.obter();

  // Silenciado pelo toggle do Console OU pelo kill switch por env.
  const silenciada =
    config.silenciada || process.env.EQUIPE_NOTIFICACAO_SILENCIADA === "true";
  if (silenciada) return "silenciado";

  // O destino salvo no Console tem prioridade; o env é só fallback.
  const webhook =
    config.webhookUrl?.trim() || process.env.EQUIPE_NOTIFICACAO_WEBHOOK?.trim();
  if (!webhook) return "sem-webhook";

  const { ok } = await postWebhook(webhook, texto, extra);
  return ok ? "enviado" : "falha";
}

/**
 * Resultado de um teste de destino:
 *   - "enviado": o destino aceitou a mensagem.
 *   - "sem-webhook": nenhum destino para testar (override vazio e nada salvo).
 *   - "falha": destino existe mas a entrega falhou (rede/timeout/HTTP).
 * `status` traz o código HTTP devolvido pelo destino, quando houve resposta.
 */
export interface ResultadoTeste {
  resultado: "enviado" | "sem-webhook" | "falha";
  status?: number;
}

/**
 * Dispara um aviso de teste para confirmar, na hora, que o destino funciona.
 *
 * Usa `webhookUrlOverride` (o destino recém-digitado, ainda não salvo) quando
 * informado; senão cai no destino salvo no Console e, por fim, no env. Ignora de
 * propósito o liga/desliga (silenciada): a equipe precisa poder validar o
 * destino mesmo com os avisos pausados. Nunca lança.
 */
export async function enviarAvisoTeste(
  webhookUrlOverride?: string | null,
): Promise<ResultadoTeste> {
  let webhook = webhookUrlOverride?.trim();
  if (!webhook) {
    const config = await notificacaoConfigRepo.obter();
    webhook =
      config.webhookUrl?.trim() ||
      process.env.EQUIPE_NOTIFICACAO_WEBHOOK?.trim();
  }
  if (!webhook) return { resultado: "sem-webhook" };

  const texto =
    "Aviso de teste do Console — se você está lendo isto, o destino dos avisos de contrato está funcionando.";
  const { ok, status } = await postWebhook(webhook, texto, { tipo: "teste" });
  return { resultado: ok ? "enviado" : "falha", status };
}

/** Só assinado/recusado geram aviso de transição; os demais são ignorados. */
function fraseContrato(status: ContratoStatus): string | null {
  if (status === "assinado") return "assinou o contrato";
  if (status === "recusado") return "recusou o contrato";
  return null;
}

/** Só assinado/recusado geram aviso de transição de termo. */
function fraseTermo(status: ContratoStatus): string | null {
  if (status === "assinado") return "assinou o termo de consentimento";
  if (status === "recusado") return "recusou o termo de consentimento";
  return null;
}

/**
 * Avisa a equipe sobre a nova situação do contrato. Deve ser chamado apenas
 * numa transição real de status. Retorna `true` quando um aviso foi de fato
 * enviado; `false` quando estava silenciado, sem webhook, ou o status não
 * gera aviso.
 */
export async function notificarTransicaoContrato(
  paciente: PacienteNotificavel,
  status: ContratoStatus,
): Promise<boolean> {
  const acao = fraseContrato(status);
  if (!acao) return false;

  const texto = `Contrato — ${paciente.nome} ${acao}.`;
  const resultado = await enviarAvisoEquipe(texto, {
    paciente: paciente.nome,
    status,
  });
  return resultado === "enviado";
}

/**
 * Avisa a equipe sobre a nova situação do termo de consentimento. Deve ser
 * chamado apenas numa transição real de status. Retorna `true` quando um aviso
 * foi de fato enviado; `false` quando estava silenciado, sem webhook, ou o
 * status não gera aviso.
 */
export async function notificarTransicaoTermo(
  paciente: PacienteNotificavel,
  status: ContratoStatus,
): Promise<boolean> {
  const acao = fraseTermo(status);
  if (!acao) return false;

  const texto = `Termo de consentimento — ${paciente.nome} ${acao}.`;
  const resultado = await enviarAvisoEquipe(texto, {
    paciente: paciente.nome,
    status,
    tipo: "termo",
  });
  return resultado === "enviado";
}

/**
 * Avisa a equipe de que a paciente enviou uma foto da recuperação em um
 * check-in do tipo "foto". Deve ser chamado depois que o upload conclui com
 * sucesso. Inclui nome, o dia do check-in (D+N) e um link direto para a página
 * da paciente no Console. Retorna `true` quando um aviso foi de fato enviado;
 * `false` quando estava silenciado ou sem webhook. Nunca lança.
 */
export async function notificarFotoCheckin(
  paciente: PacienteNotificavel & { id: number },
  checkin: { dia: number },
): Promise<boolean> {
  const link = montarLinkConsolePaciente(paciente.id);
  const texto = `Pós-op — ${paciente.nome} enviou uma foto da recuperação (D+${checkin.dia}). Veja no Console: ${link}`;
  const resultado = await enviarAvisoEquipe(texto, {
    paciente: paciente.nome,
    tipo: "foto_checkin",
    dia: checkin.dia,
    link,
  });
  return resultado === "enviado";
}

/** Formata yyyy-mm-dd como dd/mm/aaaa para a mensagem. */
function formatarBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Avisa a equipe de que o prazo de assinatura do contrato venceu (ou vence hoje)
 * e o contrato ainda não foi assinado. Retorna o resultado bruto do envio para
 * que a varredura decida sobre o dedup (não marca em falha de entrega).
 */
export async function notificarPrazoContrato(
  paciente: PacienteNotificavel,
  info: { prazo: string },
): Promise<ResultadoEnvio> {
  const venceHoje = info.prazo === hojeISO();
  const quando = venceHoje ? "vence hoje" : `venceu em ${formatarBR(info.prazo)}`;
  const texto = `Contrato — prazo de assinatura de ${paciente.nome} ${quando} e ainda não foi assinado.`;
  return enviarAvisoEquipe(texto, {
    paciente: paciente.nome,
    tipo: "prazo_contrato",
    prazo: info.prazo,
  });
}

/**
 * Avisa a equipe de que o prazo de assinatura do termo de consentimento venceu
 * (ou vence hoje) e ele ainda não foi assinado. Espelha
 * `notificarPrazoContrato`: retorna o resultado bruto do envio para que a
 * varredura decida sobre o dedup (não marca em falha de entrega).
 */
export async function notificarPrazoTermo(
  paciente: PacienteNotificavel,
  info: { prazo: string },
): Promise<ResultadoEnvio> {
  const venceHoje = info.prazo === hojeISO();
  const quando = venceHoje ? "vence hoje" : `venceu em ${formatarBR(info.prazo)}`;
  const texto = `Termo de consentimento — prazo de assinatura de ${paciente.nome} ${quando} e ainda não foi assinado.`;
  return enviarAvisoEquipe(texto, {
    paciente: paciente.nome,
    tipo: "prazo_termo",
    prazo: info.prazo,
  });
}
