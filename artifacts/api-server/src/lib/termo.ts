import { pacientesRepo, type PacienteComVendedora } from "./pacientes-repo";
import { consultarStatusContrato } from "./autentique";
import { notificarTransicaoTermo } from "./notificacoes";
import { registrarMarco } from "./eventos";
import { arquivarDocumentoAssinado } from "./documento-assinado-storage";

/** Rótulos legíveis dos status do termo, para a trilha de auditoria. */
const ROTULO_STATUS: Record<string, string> = {
  assinado: "Assinado",
  pendente: "Pendente",
  recusado: "Recusado",
  indisponivel: "Indisponível",
};

function rotuloStatusTermo(status: string | null): string {
  return status ? (ROTULO_STATUS[status] ?? status) : "—";
}

/**
 * Consulta a Autentique (somente leitura) e atualiza o cache de status do
 * termo de consentimento no paciente. Espelha `refrescarStatusContrato`.
 * Nunca lança — `consultarStatusContrato` já degrada para "indisponivel",
 * então o carregamento do paciente jamais quebra por isso.
 * Sem link salvo, devolve o paciente inalterado.
 *
 * `preservarSeIndisponivel`: usado pelo webhook. Quando a Autentique está
 * momentaneamente fora do ar, não sobrescrevemos um status real já conhecido
 * com "indisponivel".
 */
export async function refrescarStatusTermo(
  paciente: PacienteComVendedora,
  opts: { preservarSeIndisponivel?: boolean } = {},
): Promise<PacienteComVendedora> {
  if (!paciente.termoAutentiqueId) return paciente;

  const { status, assinadoEm, linkAssinatura } = await consultarStatusContrato(
    paciente.termoAutentiqueId,
  );

  if (opts.preservarSeIndisponivel && status === "indisponivel") {
    return paciente;
  }

  const statusAnterior = paciente.termoStatus;

  const atualizado = await pacientesRepo.atualizarTermo(paciente.id, {
    termoStatus: status,
    termoAssinadoEm: assinadoEm,
    termoVerificadoEm: new Date(),
    termoLinkAssinatura: linkAssinatura,
  });

  if (status !== statusAnterior) {
    await notificarTransicaoTermo({ nome: paciente.nome }, status);

    if (status === "assinado" || status === "recusado") {
      await pacientesRepo.registrarHistorico(paciente.id, [
        {
          campo: "termoStatus",
          rotulo: "Status do termo de consentimento",
          de: rotuloStatusTermo(statusAnterior),
          para: rotuloStatusTermo(status),
        },
      ]);

      await registrarMarco(
        paciente.id,
        status === "assinado" ? "termo_assinado" : "termo_recusado",
      );
    }
  }

  // Arquivamento do PDF final assinado do termo — espelho de
  // refrescarStatusContrato. Idempotente e com retry em reconsultas; nunca lança.
  let resultado = atualizado ?? paciente;
  if (status === "assinado" && !resultado.termoAssinadoObjectPath) {
    const objectPath = await arquivarDocumentoAssinado({
      tipo: "termo",
      documentoId: paciente.termoAutentiqueId,
      pacienteId: paciente.id,
    });
    if (objectPath) {
      resultado =
        (await pacientesRepo.atualizarTermo(paciente.id, {
          termoAssinadoObjectPath: objectPath,
        })) ?? resultado;
    }
  }

  return resultado;
}
