import { Router, type IRouter, type Request } from "express";
import { timingSafeEqual } from "node:crypto";
import { pacientesRepo } from "../lib/pacientes-repo";
import { refrescarStatusContrato } from "../lib/contrato";
import { refrescarStatusTermo } from "../lib/termo";

/**
 * Webhook PÚBLICO da Autentique — caminho de ESCRITA exposto à internet.
 *
 * A Autentique dispara um evento quando o paciente assina ou recusa o contrato.
 * Em vez de confiar no corpo do evento, usamos o webhook apenas como GATILHO:
 * extraímos o ID do documento, reconsultamos a Autentique ao vivo (somente
 * leitura, fonte única da verdade) e atualizamos o cache do paciente. Assim o
 * contador de "Contratos pendentes" na home e o status nas listas se atualizam
 * no instante da assinatura, sem ninguém precisar abrir o processo.
 *
 * Continua SOMENTE LEITURA em relação à Autentique: nunca alteramos o documento
 * lá — só lemos o status e gravamos o cache local.
 *
 * Autenticidade: por ser um caminho de escrita público, exigimos um segredo
 * compartilhado (AUTENTIQUE_WEBHOOK_SECRET). Aceitamos, nesta ordem:
 *   1. `Authorization: Bearer <segredo>` — é o que o próprio painel da Autentique
 *      envia quando se liga "Autenticação → Bearer token" (recomendado).
 *   2. querystring `?secret=<segredo>` (removida dos logs).
 *   3. header `x-autentique-secret: <segredo>`.
 * Sem o segredo configurado, o endpoint fica fechado (fail-closed) e rejeita tudo.
 */

const router: IRouter = Router();

const UUID_REGEX =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Compara o segredo recebido com o esperado em tempo constante. Retorna false
 * quando não há segredo configurado (caminho fechado) ou quando algo não bate.
 */
function segredoConfere(req: Request): boolean {
  const esperado = process.env.AUTENTIQUE_WEBHOOK_SECRET;
  if (!esperado) return false;

  const auth = req.get("authorization") ?? "";
  const viaBearer = /^bearer\s+/i.test(auth)
    ? auth.replace(/^bearer\s+/i, "").trim()
    : "";
  const viaQuery =
    typeof req.query.secret === "string" ? req.query.secret : "";
  const viaHeader = req.get("x-autentique-secret") ?? "";
  const recebido = viaBearer || viaQuery || viaHeader;
  if (!recebido) return false;

  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Varre o payload (de forma recursiva) e coleta todos os UUIDs encontrados — o
 * ID do documento da Autentique é um UUID. Não dependemos da forma exata do
 * evento, que pode variar; basta cruzar os UUIDs com os contratos cadastrados.
 */
function coletarUuids(valor: unknown, encontrados: Set<string>): void {
  if (typeof valor === "string") {
    const m = valor.match(UUID_REGEX);
    if (m) encontrados.add(m[0]);
  } else if (Array.isArray(valor)) {
    for (const item of valor) coletarUuids(item, encontrados);
  } else if (valor && typeof valor === "object") {
    for (const item of Object.values(valor)) coletarUuids(item, encontrados);
  }
}

router.post("/webhooks/autentique", async (req, res): Promise<void> => {
  if (!segredoConfere(req)) {
    res.status(401).json({ message: "Não autorizado" });
    return;
  }

  const uuids = new Set<string>();
  coletarUuids(req.body, uuids);

  let atualizados = 0;
  for (const docId of uuids) {
    // Cruza com contrato e com termo — são documentos independentes na
    // Autentique. O mesmo UUID nunca aparece nos dois, então o custo extra é
    // apenas um SELECT a mais quando o contrato não casa.
    const porContrato = await pacientesRepo.obterPorContratoId(docId);
    if (porContrato) {
      await refrescarStatusContrato(porContrato, { preservarSeIndisponivel: true });
      atualizados += 1;
      continue;
    }
    const porTermo = await pacientesRepo.obterPorTermoId(docId);
    if (porTermo) {
      await refrescarStatusTermo(porTermo, { preservarSeIndisponivel: true });
      atualizados += 1;
    }
  }

  // Sempre 200 quando autenticado, mesmo sem casar nenhum paciente, para a
  // Autentique não reenfileirar eventos de documentos que não acompanhamos.
  res.json({ ok: true, atualizados });
});

export default router;
