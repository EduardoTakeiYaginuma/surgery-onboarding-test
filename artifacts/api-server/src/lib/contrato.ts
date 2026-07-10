import { pacientesRepo, type PacienteComVendedora } from "./pacientes-repo";
import { consultarStatusContrato } from "./autentique";
import {
  notificarTransicaoContrato,
  notificarPrazoContrato,
  notificarPrazoTermo,
} from "./notificacoes";
import { registrarMarco } from "./eventos";
import { contratoConfigRepo } from "./contrato-config-repo";
import { calcularPrazoAssinatura, hojeISO } from "./prazos";
import { arquivarDocumentoAssinado } from "./documento-assinado-storage";

/** Rótulos legíveis dos status de contrato, para a trilha de auditoria. */
const ROTULO_STATUS: Record<string, string> = {
  assinado: "Assinado",
  pendente: "Pendente",
  recusado: "Recusado",
  indisponivel: "Indisponível",
};

function rotuloStatusContrato(status: string | null): string {
  return status ? (ROTULO_STATUS[status] ?? status) : "—";
}

/**
 * Consulta a Autentique (somente leitura) e atualiza o cache de status do
 * contrato no paciente. Nunca lança — `consultarStatusContrato` já degrada para
 * "indisponivel", então o carregamento do paciente jamais quebra por isso.
 * Sem link salvo, devolve o paciente inalterado.
 *
 * `preservarSeIndisponivel`: usado pelo webhook. Quando a Autentique está
 * momentaneamente fora do ar, não sobrescrevemos um status real já conhecido
 * com "indisponivel" — o evento serve apenas como gatilho de atualização e a
 * próxima abertura do processo reconsulta de qualquer forma.
 *
 * Aviso à equipe: quando o status MUDA de fato para "assinado" ou "recusado",
 * disparamos um aviso (ver `notificarTransicaoContrato`). A comparação é com o
 * status anterior gravado, então o aviso sai uma única vez na transição real —
 * nunca a cada reconsulta. É o ponto central por onde passam tanto o webhook
 * quanto a reconsulta ao abrir o processo.
 *
 * Além da comparação em memória, há um marcador DURÁVEL por (paciente + status):
 * `contratoAlertaStatus` guarda o último status já avisado. Se já registramos um
 * aviso para este exato status, pulamos — mesmo que o cache de status acima se
 * perca ou duas entregas de webhook para a mesma assinatura corram juntas. Assim
 * a garantia de "um aviso por status" deixa de depender só da janela estreita da
 * comparação em memória e fica auditável (`contratoAlertaEnviadoEm`).
 */
export async function refrescarStatusContrato(
  paciente: PacienteComVendedora,
  opts: { preservarSeIndisponivel?: boolean } = {},
): Promise<PacienteComVendedora> {
  if (!paciente.contratoAutentiqueId) return paciente;

  const { status, assinadoEm, linkAssinatura } = await consultarStatusContrato(
    paciente.contratoAutentiqueId,
  );

  if (opts.preservarSeIndisponivel && status === "indisponivel") {
    return paciente;
  }

  const statusAnterior = paciente.contratoStatus;

  const atualizado = await pacientesRepo.atualizarContrato(paciente.id, {
    contratoStatus: status,
    contratoAssinadoEm: assinadoEm,
    contratoVerificadoEm: new Date(),
    // Cache do link automático da Autentique; o override manual continua tendo
    // prioridade no DTO. Em assinado/recusado vem null (link não faz sentido).
    contratoLinkAssinatura: linkAssinatura,
  });

  // Transição real: trata uma única vez quando o status muda de fato. A
  // comparação com o status anterior gravado garante que tanto o aviso quanto a
  // trilha de auditoria saiam só na transição — nunca a cada reconsulta.
  if (status !== statusAnterior) {
    // Trilha de auditoria: grava uma linha no histórico quando o contrato passa
    // a assinado/recusado (mesma regra de no-op do diffPaciente).
    if (status === "assinado" || status === "recusado") {
      await pacientesRepo.registrarHistorico(paciente.id, [
        {
          campo: "contratoStatus",
          rotulo: "Status do contrato",
          de: rotuloStatusContrato(statusAnterior),
          para: rotuloStatusContrato(status),
        },
      ]);

      // Marco na linha do tempo principal: assim este evento importante aparece
      // junto de "Processo criado", "Handoff enviado", etc. — não só no
      // histórico de edições.
      await registrarMarco(
        paciente.id,
        status === "assinado" ? "contrato_assinado" : "contrato_recusado",
      );
    }

    // Aviso à equipe — dedup DURÁVEL e ATÔMICO por (paciente + status). Só
    // assinado/recusado avisam. `reivindicarAlertaContrato` faz um UPDATE
    // condicional atômico: mesmo que duas entregas do mesmo evento corram
    // juntas, só uma ganha a reivindicação e dispara o aviso (a outra vê o
    // marcador já gravado e desiste). Estar dentro da transição real evita
    // spam por reconsulta; a reivindicação atômica fecha a janela de corrida.
    // Se o aviso NÃO saiu de fato (silenciado/sem-webhook/falha), liberamos o
    // marcador para que uma próxima tentativa possa reavisar — o marcador
    // reflete apenas avisos REALMENTE enviados.
    if (status === "assinado" || status === "recusado") {
      const reivindicou = await pacientesRepo.reivindicarAlertaContrato(
        paciente.id,
        status,
      );
      if (reivindicou) {
        const enviado = await notificarTransicaoContrato(
          { nome: paciente.nome },
          status,
        );
        if (!enviado) {
          await pacientesRepo.liberarAlertaContrato(paciente.id, status);
        }
      }
    }
  }

  // Arquivamento do PDF final assinado — guarda uma cópia durável no bucket
  // privado. Idempotente: só quando assinado e ainda sem cópia. Fora do bloco de
  // transição DE PROPÓSITO, para que uma reconsulta futura RETENTE caso um
  // arquivamento anterior tenha falhado (Autentique/rede momentaneamente fora).
  // `arquivarDocumentoAssinado` nunca lança, então nunca quebra o refresh.
  let resultado = atualizado ?? paciente;
  if (status === "assinado" && !resultado.contratoAssinadoObjectPath) {
    const objectPath = await arquivarDocumentoAssinado({
      tipo: "contrato",
      documentoId: paciente.contratoAutentiqueId,
      pacienteId: paciente.id,
    });
    if (objectPath) {
      resultado =
        (await pacientesRepo.atualizarContrato(paciente.id, {
          contratoAssinadoObjectPath: objectPath,
        })) ?? resultado;
    }
  }

  return resultado;
}

/**
 * Varre os pacientes ativos e avisa a equipe quando o PRAZO de assinatura do
 * contrato venceu e ele ainda não foi assinado. Sem outros efeitos colaterais —
 * deve ser chamado por um POST explícito (nunca dentro de um GET).
 *
 * Dedup: cada paciente é avisado uma única vez por prazo, via
 * `contratoPrazoAlertadoEm`. A rota de edição reseta esse carimbo quando a data
 * da cirurgia ou o override mudam, de modo que um novo prazo volta a alertar.
 * Em falha de ENTREGA (rede/HTTP) não marcamos — retenta na próxima varredura;
 * silenciado/sem-webhook contam como processado (a home já mostra o badge).
 */
export async function processarAlertasPrazo(): Promise<{ avisados: number }> {
  const { prazoAssinaturaDiasAntes } = await contratoConfigRepo.obter();
  const pacientes = await pacientesRepo.listar();
  const hoje = hojeISO();
  let avisados = 0;

  for (const p of pacientes) {
    // Contrato: estados terminais não geram aviso de prazo: assinado já cumpriu;
    // recusado encerrou o fluxo (cobrar prazo de algo recusado é ruído).
    if (
      p.contratoStatus !== "assinado" &&
      p.contratoStatus !== "recusado" &&
      !p.contratoPrazoAlertadoEm && // ainda não avisado neste prazo
      Boolean(p.contratoAutentiqueId || p.contratoLinkAssinaturaManual)
    ) {
      const prazo = calcularPrazoAssinatura({
        dataCirurgia: p.dataCirurgia,
        contratoPrazoOverride: p.contratoPrazoOverride,
        diasAntes: prazoAssinaturaDiasAntes,
      });
      if (prazo && hoje >= prazo) {
        const resultado = await notificarPrazoContrato({ nome: p.nome }, { prazo });
        if (resultado !== "falha") {
          await pacientesRepo.atualizar(p.id, {
            contratoPrazoAlertadoEm: new Date(),
          });
        }
        if (resultado === "enviado") avisados += 1;
      }
    }

    // Termo de consentimento (TCLE): mesma regra, com dedup independente em
    // `termoPrazoAlertadoEm`. É um documento separado do contrato, então um
    // paciente pode disparar avisos de prazo distintos para cada um.
    if (
      p.termoStatus !== "assinado" &&
      p.termoStatus !== "recusado" &&
      !p.termoPrazoAlertadoEm && // ainda não avisado neste prazo
      Boolean(p.termoAutentiqueId || p.termoLinkAssinaturaManual)
    ) {
      const prazoTermo = calcularPrazoAssinatura({
        dataCirurgia: p.dataCirurgia,
        contratoPrazoOverride: p.termoPrazoOverride,
        diasAntes: prazoAssinaturaDiasAntes,
      });
      if (prazoTermo && hoje >= prazoTermo) {
        const resultado = await notificarPrazoTermo(
          { nome: p.nome },
          { prazo: prazoTermo },
        );
        if (resultado !== "falha") {
          await pacientesRepo.atualizar(p.id, {
            termoPrazoAlertadoEm: new Date(),
          });
        }
        if (resultado === "enviado") avisados += 1;
      }
    }
  }

  return { avisados };
}
