import { refrescarStatusContrato } from "./contrato";
import { refrescarStatusTermo } from "./termo";
import type { PacienteComVendedora } from "./pacientes-repo";

/**
 * Reconsulta ao vivo, na listagem do dashboard, APENAS os processos cujo
 * contrato/termo ainda está pendente na Autentique — para que uma assinatura
 * recém-concluída apareça no funil sem precisar abrir o processo um a um.
 *
 * Dois guarda-corpos evitam martelar a Autentique:
 *  - TTL: um status verificado há menos de `TTL_REFRESCO_MS` é considerado
 *    fresco e não é reconsultado (o dashboard recarrega com frequência).
 *  - Estados terminais (assinado/recusado) nunca são reconsultados — não mudam.
 *  - Concorrência limitada a `CONCORRENCIA` chamadas simultâneas.
 *
 * `preservarSeIndisponivel` garante que, se a Autentique piscar, o cache real
 * não vira "indisponivel". Falhas por processo são engolidas (mantém o cache),
 * então a listagem nunca quebra por causa do refresh.
 */
const TTL_REFRESCO_MS = 30_000;
const CONCORRENCIA = 6;

function frescoAinda(verificadoEm: Date | null, agora: Date): boolean {
  return (
    verificadoEm != null &&
    agora.getTime() - verificadoEm.getTime() <= TTL_REFRESCO_MS
  );
}

function contratoPrecisaRefrescar(
  p: PacienteComVendedora,
  agora: Date,
): boolean {
  return (
    p.contratoAutentiqueId != null &&
    p.contratoStatus !== "assinado" &&
    p.contratoStatus !== "recusado" &&
    !frescoAinda(p.contratoVerificadoEm ?? null, agora)
  );
}

function termoPrecisaRefrescar(p: PacienteComVendedora, agora: Date): boolean {
  return (
    p.termoAutentiqueId != null &&
    p.termoStatus !== "assinado" &&
    p.termoStatus !== "recusado" &&
    !frescoAinda(p.termoVerificadoEm ?? null, agora)
  );
}

/**
 * Refresca os pendentes e devolve a MESMA lista com os processos atualizados
 * substituídos. Preserva a ordem original.
 */
export async function refrescarPendentes(
  pacientes: PacienteComVendedora[],
  agora: Date = new Date(),
): Promise<PacienteComVendedora[]> {
  const alvos = pacientes.filter(
    (p) =>
      contratoPrecisaRefrescar(p, agora) || termoPrecisaRefrescar(p, agora),
  );
  if (alvos.length === 0) return pacientes;

  const atualizados = new Map<
    PacienteComVendedora["id"],
    PacienteComVendedora
  >();
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < alvos.length) {
      const p = alvos[cursor++];
      try {
        let atual = p;
        if (contratoPrecisaRefrescar(p, agora)) {
          atual = await refrescarStatusContrato(atual, {
            preservarSeIndisponivel: true,
          });
        }
        if (termoPrecisaRefrescar(p, agora)) {
          atual = await refrescarStatusTermo(atual, {
            preservarSeIndisponivel: true,
          });
        }
        atualizados.set(p.id, atual);
      } catch {
        // Falha de rede/Autentique num processo não derruba a listagem: mantém
        // o cache atual desse processo.
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCORRENCIA, alvos.length) }, worker),
  );

  return pacientes.map((p) => atualizados.get(p.id) ?? p);
}
