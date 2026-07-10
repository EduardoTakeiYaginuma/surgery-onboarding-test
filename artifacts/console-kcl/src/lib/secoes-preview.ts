import { type SecaoConteudo } from "@workspace/api-client-react";
import {
  type ContextoCompleto,
  type IdentidadeMedica,
  montarContextoCompleto,
  resolverSecoesComContexto,
} from "@workspace/secoes";

/**
 * Pré-visualização do conteúdo no Console. A substituição de variáveis
 * (`{{...}}`) e o cálculo das datas vivem em `@workspace/secoes` — a mesma
 * fonte usada pelo api-server para montar a página pública. Assim, a prévia da
 * secretária é idêntica ao que a paciente recebe. Aqui ficam apenas os dados
 * de exemplo e a montagem do contexto a partir de `DadosPreview`.
 */

export interface DadosPreview {
  /** Nome completo da paciente. */
  nome: string;
  /** Data da cirurgia em ISO (yyyy-mm-dd). */
  dataCirurgia: string;
  /** Horário (HH:mm). */
  horario: string;
  /** Nome do hospital (curto basta para a pré-visualização). */
  hospital: string;
  /** Hospital + endereço (ou só o nome quando o endereço não está disponível). */
  local: string;
  /** Nome da médica. */
  medica: string;
  /** Equipe de anestesia. */
  equipe: string;
  /** Telefone da anestesia. */
  equipeTelefone: string;
  /** Instruções de chegada/jejum específicas do hospital. */
  instrucoesChegada: string;
  /** Valor pago na reserva (R$) — alimenta `{{valorReserva}}`. */
  valorPago: number;
  /** Saldo em aberto (R$); 0 quando quitado — alimenta `{{statusHonorarios}}`. */
  valorPendente: number;
  /** Data prevista do saldo (ISO) ou null — alimenta `{{statusHonorarios}}`. */
  dataPagamentoPendente: string | null;
  /** Procedimentos do caso — usados só para exibição na prévia (não são variáveis). */
  procedimentos: string[];
  /** CRM da médica (exibido no card "Sua médica" quando disponível). */
  crm?: string;
  /** RQE da médica. */
  rqe?: string;
  /** Nome da clínica (exibido no cabeçalho, ao lado do logo). */
  clinica?: string;
  /** URL assinada da foto da médica (quando houver; senão cai nas iniciais). */
  medicoFotoUrl?: string | null;
  /** URL assinada do logo da médica/clínica (quando houver; senão cai no emblema "K"). */
  medicoLogoUrl?: string | null;
  // Estado real (contrato / termo / honorários) para o bloco "Agora". Opcionais:
  // a prévia genérica (sem paciente) os deixa indefinidos e o bloco mostra apenas
  // as confirmações sempre verdadeiras (data/hora e local), nunca inventa estado.
  /** Status do contrato (`assinado`/`pendente`/...); `null`/`ausente` = sem contrato. */
  contratoStatus?: string | null;
  /** Prazo de assinatura do contrato (ISO), quando pendente. */
  contratoPrazo?: string | null;
  /** Data de assinatura do contrato (ISO), quando assinado. */
  contratoAssinadoEm?: string | null;
  /** Status do termo de consentimento; `null`/`ausente` = sem termo. */
  termoStatus?: string | null;
  /** Prazo de assinatura do termo (ISO), quando pendente. */
  termoPrazo?: string | null;
  /** Data de assinatura do termo (ISO), quando assinado. */
  termoAssinadoEm?: string | null;
  /** Honorários quitados? Indefinido = sem dado de pagamento (omite a linha). */
  pagamentoQuitado?: boolean;
  /** Vencimento do saldo (ISO), quando há saldo em aberto. */
  pagamentoVencimento?: string | null;
}

/** Paciente fictícia para a pré-visualização do conteúdo padrão (global). */
export const DADOS_PREVIEW_EXEMPLO: DadosPreview = {
  nome: "Maria Silva (exemplo)",
  dataCirurgia: proximaDataExemplo(),
  horario: "06:00",
  hospital: "Avant Moema Day Hospital",
  local: "Avant Moema Day Hospital — Av. Copacabana, 112, 3º andar (Edif. Medic Life)",
  medica: "Dra. Karla Caetano Lobo",
  equipe: "Zenicare",
  equipeTelefone: "(11) 95080-2525",
  instrucoesChegada: "Confirme a janela de chegada (2h ou 3h antes).",
  valorPago: 3400,
  valorPendente: 0,
  dataPagamentoPendente: null,
  procedimentos: ["Mamoplastia", "Lipoaspiração"],
  clinica: "KCL",
};

function proximaDataExemplo(): string {
  const d = new Date();
  d.setDate(d.getDate() + 21);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Monta o dicionário de variáveis a partir dos dados de pré-visualização.
 * Delega a montagem à fonte única (`montarContextoCompleto`), de modo que as
 * chaves do contexto sejam exatamente as mesmas do api-server e do app móvel.
 * Exportada para o teste de anti-deriva (`secoes-preview.test.ts`).
 */
export function montarContexto(d: DadosPreview): ContextoCompleto {
  return montarContextoCompleto({
    nome: d.nome,
    dataCirurgia: d.dataCirurgia,
    horario: d.horario,
    hospital: d.hospital,
    local: d.local,
    medica: d.medica,
    equipe: d.equipe,
    equipeTelefone: d.equipeTelefone,
    instrucoesChegada: d.instrucoesChegada,
    valorPago: d.valorPago,
    valorPendente: d.valorPendente,
    dataPagamentoPendente: d.dataPagamentoPendente,
  });
}

/**
 * Resolve as seções para a pré-visualização: delega a substituição de variáveis
 * e o cálculo das datas à fonte única (`@workspace/secoes`), a mesma usada pelo
 * api-server. Não altera a estrutura nem a ordem.
 */
export function resolverSecoesPreview(
  secoes: SecaoConteudo[],
  dados: DadosPreview,
): SecaoConteudo[] {
  return resolverSecoesComContexto(
    secoes,
    montarContexto(dados),
    dados.dataCirurgia,
  );
}

/**
 * Projeta os dados da prévia no contrato único do cabeçalho de identidade da
 * médica (`IdentidadeMedica` em `@workspace/secoes`) — o mesmo objeto que o
 * componente compartilhado consome e que o DTO da página pública produz. É a
 * ponte da prévia para a fonte única do CONJUNTO de campos do cabeçalho: se um
 * campo for acrescentado/removido do catálogo, esta função (e o teste de
 * anti-deriva) deixam de compilar/passar até a prévia acompanhar. Campos de texto
 * ausentes caem em `""`; URLs ausentes em `null`.
 */
export function identidadeDePreview(d: DadosPreview): IdentidadeMedica {
  return {
    medica: d.medica,
    crm: d.crm ?? "",
    rqe: d.rqe ?? "",
    clinica: d.clinica ?? "",
    medicoFotoUrl: d.medicoFotoUrl ?? null,
    medicoLogoUrl: d.medicoLogoUrl ?? null,
  };
}
