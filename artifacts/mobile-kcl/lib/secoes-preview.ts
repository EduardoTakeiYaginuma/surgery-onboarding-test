import {
  type ConfigOperacional,
  type Medico,
  type Paciente,
  type SecaoConteudo,
} from "@workspace/api-client-react";
import {
  type ContextoCompleto,
  type IdentidadeMedica,
  type VariavelChave,
  VARIAVEIS_DISPONIVEIS,
  camposLocaisDeConfig,
  montarContextoCompleto,
  resolverSecoesComContexto,
} from "@workspace/secoes";

/**
 * Pré-visualização do conteúdo no app móvel. A substituição de variáveis
 * (`{{...}}`) e o cálculo das datas vivem em `@workspace/secoes` — a mesma fonte
 * usada pelo api-server para montar a página pública e pelo Console web. Assim, a
 * prévia que a equipe vê no editor é idêntica ao que a paciente recebe. Aqui
 * ficam apenas a montagem do contexto a partir dos dados reais da paciente e o
 * fallback para o que não está disponível no cliente.
 */

export interface DadosPreview {
  nome: string;
  /** Data da cirurgia em ISO (yyyy-mm-dd). */
  dataCirurgia: string;
  horario: string;
  hospital: string;
  local: string;
  medica: string;
  equipe: string;
  equipeTelefone: string;
  instrucoesChegada: string;
  /** Valor pago na reserva (R$) — alimenta `{{valorReserva}}`. */
  valorPago: number;
  /** Saldo em aberto (R$); 0 quando quitado — alimenta `{{statusHonorarios}}`. */
  valorPendente: number;
  /** Data prevista do saldo (ISO) ou null — alimenta `{{statusHonorarios}}`. */
  dataPagamentoPendente: string | null;
}

/**
 * O telefone da anestesia é resolvido no servidor a partir do protocolo e não
 * está disponível no cliente; usamos um valor de exemplo só na pré-visualização.
 */
const EQUIPE_TELEFONE_EXEMPLO = "(11) 95080-2525";

/** Data de exemplo (~3 semanas à frente) para a prévia sem data definida. */
function proximaDataExemplo(): string {
  const d = new Date();
  d.setDate(d.getDate() + 21);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Paciente fictícia para a prévia do conteúdo padrão (cadastro de novo handoff),
 * espelhando o exemplo do Console web. Os valores entram só como fallback quando
 * o campo ainda não foi preenchido no formulário.
 */
export const DADOS_PREVIEW_EXEMPLO: DadosPreview = {
  nome: "Paciente",
  dataCirurgia: proximaDataExemplo(),
  horario: "06:00",
  hospital: "Avant Moema Day Hospital",
  local: "Avant Moema Day Hospital",
  medica: "Dra. Karla Caetano Lobo",
  equipe: "Zenicare",
  equipeTelefone: EQUIPE_TELEFONE_EXEMPLO,
  instrucoesChegada: "Confirme a janela de chegada (2h ou 3h antes).",
  valorPago: 3400,
  valorPendente: 0,
  dataPagamentoPendente: null,
};

/**
 * Monta os dados de pré-visualização a partir da paciente real e da config.
 * O `/config` expõe os mesmos valores que a página pública mostra — nome
 * completo e "Nome — Endereço" do hospital e o telefone da anestesia — então a
 * prévia usa exatamente eles (sem valores de exemplo). Caímos na chave salva da
 * paciente apenas quando a config ainda não carregou ou a chave é desconhecida.
 */
export function dadosDaPaciente(
  paciente: Paciente,
  config?: ConfigOperacional,
): DadosPreview {
  // O mapeamento config → campos de hospital/equipe vive na fonte única
  // (`camposLocaisDeConfig`), partilhada com o Console e exercitada pelo teste
  // de equivalência do api-server — assim a prévia nunca diverge da página.
  const locais = camposLocaisDeConfig(
    {
      localChave: paciente.local,
      equipeNome: paciente.equipeAnestesia,
      equipeTelefone: paciente.equipeAnestesiaTelefone ?? "",
      instrucoesChegadaPadrao:
        "Confirme a janela de chegada e o tempo de jejum com a equipe.",
    },
    config,
  );
  return {
    nome: paciente.nome,
    dataCirurgia: paciente.dataCirurgia,
    horario: paciente.horario,
    medica: paciente.medica,
    valorPago: Number(paciente.valorSinal),
    valorPendente: Number(paciente.valorPendente),
    dataPagamentoPendente: paciente.dataPagamentoPendente ?? null,
    ...locais,
  };
}

/**
 * Catálogo de chips de "Variáveis disponíveis" do editor móvel, derivado da
 * fonte única (`VARIAVEIS_DISPONIVEIS`). Não declare a lista localmente: assim a
 * lista do app, a do Console e a resolução do servidor nunca divergem.
 */
export const VARIAVEIS_PREVIEW: { chave: VariavelChave; token: string; descricao: string }[] =
  VARIAVEIS_DISPONIVEIS.map((v) => ({
    chave: v.chave,
    token: `{{${v.chave}}}`,
    descricao: v.descricao,
  }));

/**
 * Monta o dicionário de variáveis a partir dos dados de pré-visualização.
 * Delega a montagem à fonte única (`montarContextoCompleto`), de modo que as
 * chaves do contexto sejam exatamente as mesmas do api-server e do Console.
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
  return resolverSecoesComContexto(secoes, montarContexto(dados), dados.dataCirurgia);
}

/**
 * Identidade da médica exibida no cabeçalho da prévia quando ainda não há um
 * médico resolvido (prévia genérica do conteúdo padrão, sem médico cadastrado).
 * Espelha o exemplo do Console web (clínica "KCL", médica padrão). Texto ausente
 * cai em `""`; URLs em `null` — os fallbacks (iniciais / emblema "K") cuidam do
 * resto no componente compartilhado.
 */
export const IDENTIDADE_PREVIEW_EXEMPLO: IdentidadeMedica = {
  medica: DADOS_PREVIEW_EXEMPLO.medica,
  crm: "",
  rqe: "",
  clinica: "KCL",
  medicoFotoUrl: null,
  medicoLogoUrl: null,
};

/**
 * Projeta o cabeçalho de identidade a partir da paciente real e do médico ligado
 * a ela. Espelha a página pública (api-server) e a prévia do Console: nome,
 * CRM/RQE e clínica vêm do registro da paciente; foto e logo vêm do CADASTRO do
 * médico (URLs assinadas — não estão no snapshot da paciente). Passe o médico
 * resolvido por id incluindo inativos, igual ao Console
 * (`useListarMedicos({ incluirInativos: true })`), para que um médico inativo
 * ainda mostre a sua foto/logo. Sem médico, as imagens caem nos fallbacks.
 */
export function identidadeDaPaciente(
  paciente: Paciente,
  medico?: Medico | null,
): IdentidadeMedica {
  return {
    medica: paciente.medica,
    crm: paciente.crm,
    rqe: paciente.rqe,
    clinica: paciente.clinica,
    medicoFotoUrl: medico?.fotoUrl ?? null,
    medicoLogoUrl: medico?.logoUrl ?? null,
  };
}

/**
 * Projeta o cabeçalho de identidade a partir de um médico cadastrado (usado pela
 * prévia do novo handoff, que ainda não tem paciente salva — o médico vem da
 * seleção/padrão do formulário). Sem médico, cai no exemplo.
 */
export function identidadeDoMedico(medico?: Medico | null): IdentidadeMedica {
  if (!medico) return IDENTIDADE_PREVIEW_EXEMPLO;
  return {
    medica: medico.nome,
    crm: medico.crm,
    rqe: medico.rqe,
    clinica: medico.clinica,
    medicoFotoUrl: medico.fotoUrl,
    medicoLogoUrl: medico.logoUrl,
  };
}
