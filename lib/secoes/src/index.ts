/**
 * Fonte única da substituição de variáveis (`{{chave}}`) e do cálculo das datas
 * da linha do tempo usados para renderizar as seções da página da paciente.
 *
 * Consumido tanto pelo api-server (resolução oficial, na hora de montar a página
 * pública) quanto pelo Console (pré-visualização). Manter aqui — e só aqui —
 * garante que a prévia da secretária seja idêntica ao que a paciente recebe.
 *
 * A construção do contexto (o dicionário `{{chave}} → valor`) fica a cargo de
 * cada consumidor, porque as fontes diferem: o servidor deriva do paciente +
 * protocolo; o Console usa dados de exemplo/edição. A LÓGICA de substituição e
 * de datas, porém, vive somente neste módulo.
 */

/**
 * Catálogo único das variáveis de template (`{{chave}}`) disponíveis para o
 * conteúdo da página da paciente. Esta é a ÚNICA declaração do conjunto de
 * chaves: o api-server (resolução oficial), as prévias do Console/app e a lista
 * de "Variáveis disponíveis" do editor derivam todas daqui. Adicionar uma chave
 * neste array faz com que ela apareça em todos os lugares — e o tipo
 * `ContextoCompleto` passa a exigir que cada consumidor forneça o valor.
 */
export const VARIAVEIS_DISPONIVEIS = [
  { chave: "nome", descricao: "Nome completo da paciente" },
  { chave: "primeiroNome", descricao: "Primeiro nome da paciente" },
  { chave: "data", descricao: "Data da cirurgia (dd/mm/aaaa)" },
  { chave: "horario", descricao: "Horário da cirurgia" },
  { chave: "hospital", descricao: "Nome do hospital" },
  { chave: "local", descricao: "Hospital + endereço" },
  { chave: "medica", descricao: "Nome da médica" },
  { chave: "equipe", descricao: "Equipe de anestesia" },
  { chave: "equipeTelefone", descricao: "Telefone da anestesia" },
  {
    chave: "instrucoesChegada",
    descricao: "Instruções de chegada/jejum do hospital",
  },
  { chave: "valorReserva", descricao: "Valor pago na reserva (R$)" },
  {
    chave: "statusHonorarios",
    descricao: "Frase do status dos honorários (varia se está quitado ou com saldo)",
  },
] as const satisfies readonly { chave: string; descricao: string }[];

/** Uma chave de variável válida (`"nome" | "primeiroNome" | ...`). */
export type VariavelChave = (typeof VARIAVEIS_DISPONIVEIS)[number]["chave"];

/** Lista plana das chaves disponíveis, derivada do catálogo único. */
export const CHAVES_VARIAVEIS: VariavelChave[] = VARIAVEIS_DISPONIVEIS.map(
  (v) => v.chave,
);

/** Dicionário de variáveis: `{{chave}}` → valor já formatado. */
export type Contexto = Record<string, string>;

/**
 * Contexto que cobre TODAS as variáveis do catálogo. Cada consumidor que monta
 * um contexto a partir da sua própria fonte (paciente, dados de exemplo, etc.)
 * deve retornar este tipo — assim, ao acrescentar uma chave em
 * `VARIAVEIS_DISPONIVEIS`, a compilação falha em qualquer `montarContexto` que
 * ainda não a forneça, mantendo as prévias e a página pública em sincronia.
 */
export type ContextoCompleto = Record<VariavelChave, string>;

/**
 * Campos brutos (já resolvidos) de uma paciente/exemplo a partir dos quais o
 * contexto de variáveis é montado. Cada consumidor (api-server, Console, app)
 * resolve estes campos da sua própria fonte e delega a montagem final a
 * `montarContextoCompleto` — assim a lista de chaves do contexto tem uma única
 * declaração e não pode divergir entre os consumidores.
 */
export interface CamposContexto {
  /** Nome completo da paciente. */
  nome: string;
  /** Data da cirurgia em ISO (yyyy-mm-dd) — formatada para `{{data}}`. */
  dataCirurgia: string;
  /** Horário da cirurgia (HH:mm). */
  horario: string;
  /** Nome do hospital. */
  hospital: string;
  /** Hospital + endereço (ou só o nome quando não há endereço). */
  local: string;
  /** Nome da médica. */
  medica: string;
  /** Equipe de anestesia. */
  equipe: string;
  /** Telefone da anestesia. */
  equipeTelefone: string;
  /** Instruções de chegada/jejum específicas do hospital. */
  instrucoesChegada: string;
  /** Valor já pago pela paciente na reserva (R$) — formatado para `{{valorReserva}}`. */
  valorPago: number;
  /** Saldo em aberto (R$); 0 quando quitado — vira a frase `{{statusHonorarios}}`. */
  valorPendente: number;
  /** Data prevista para o saldo (ISO yyyy-mm-dd) ou null — entra em `{{statusHonorarios}}`. */
  dataPagamentoPendente: string | null;
}

/**
 * Monta o dicionário de variáveis (`{{chave}} → valor`) a partir dos campos
 * brutos. Esta é a ÚNICA montagem do contexto: api-server, Console e app móvel
 * resolvem seus campos e chamam esta função. Acrescentar uma chave em
 * `VARIAVEIS_DISPONIVEIS` quebra a compilação aqui (via `ContextoCompleto`) até
 * que o valor seja fornecido — propagando para todos os consumidores de uma vez.
 */
export function montarContextoCompleto(c: CamposContexto): ContextoCompleto {
  return {
    nome: c.nome,
    primeiroNome: primeiroNome(c.nome),
    data: formatarData(c.dataCirurgia),
    horario: c.horario,
    hospital: c.hospital,
    local: c.local,
    medica: c.medica,
    equipe: c.equipe,
    equipeTelefone: c.equipeTelefone,
    instrucoesChegada: c.instrucoesChegada,
    valorReserva: formatarReais(c.valorPago),
    statusHonorarios: fraseStatusHonorarios(c.valorPendente, c.dataPagamentoPendente),
  };
}

/**
 * Formata um valor numérico em Reais (`R$ 1.234,56`). Fonte única do formato de
 * moeda das variáveis da página; `NaN`/valor inválido cai em `R$ 0,00` para que
 * a variável nunca renderize vazia nem quebre o texto da paciente.
 */
export function formatarReais(valor: number): string {
  const numero = Number.isFinite(valor) ? valor : 0;
  return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Monta a frase de status dos honorários usada em `{{statusHonorarios}}`. Sempre
 * devolve texto (nunca vazio), variando conforme o pagamento: quitado confirma a
 * quitação; com saldo em aberto informa o valor restante e, quando há data, o
 * vencimento. A parte editável do texto de confirmação (a prosa em volta) mora no
 * seed do conteúdo; esta frase apenas reflete o estado financeiro real da paciente.
 */
export function fraseStatusHonorarios(
  valorPendente: number,
  dataPagamentoPendente: string | null,
): string {
  const pendente = Number.isFinite(valorPendente) ? valorPendente : 0;
  if (pendente <= 0) return "Os honorários estão integralmente quitados.";
  const saldo = formatarReais(pendente);
  return dataPagamentoPendente
    ? `Resta um saldo de ${saldo}, com vencimento em ${formatarData(dataPagamentoPendente)}.`
    : `Resta um saldo de ${saldo} a ser quitado antes da cirurgia.`;
}

/**
 * Hospital, na forma mínima que a prévia lê da `/config`. Espelha os campos que
 * o api-server expõe (`nomeCompleto`, `local`, `instrucoesChegada`) e que a
 * página pública resolve a partir do protocolo — por isso são lidos verbatim.
 */
export interface HospitalConfig {
  chave: string;
  nomeCompleto: string;
  local: string;
  instrucoesChegada: string;
}

/** Subconjunto da `/config` consultado para montar a prévia. */
export interface ConfigPreview {
  hospitais: HospitalConfig[];
}

/** Campos do contexto resolvidos a partir do hospital/equipe da `/config`. */
export type CamposLocais = Pick<
  CamposContexto,
  "hospital" | "local" | "equipe" | "equipeTelefone" | "instrucoesChegada"
>;

/**
 * Resolve os campos de hospital/equipe do contexto a partir da `/config` — a
 * ÚNICA montagem desse mapeamento. O Console (web) e o app móvel delegam ambos
 * a esta função para que a prévia leia exatamente os mesmos valores que a página
 * pública mostra (nome do hospital, "Nome — Endereço", nome/telefone da anestesia
 * e instruções de chegada). O NOME do hospital é texto livre do paciente
 * (`paciente.local`) — mostrado verbatim, igual à página; da config só vêm o
 * endereço e as instruções de chegada quando o nome digitado casa com um hospital
 * conhecido. A equipe de anestesia é texto livre gravado no próprio paciente
 * (nome + telefone). Quando o hospital não está na config (ainda não carregou ou é
 * desconhecido), fica só o nome livre e o texto de chegada padrão — nunca inventa
 * um valor diferente do que a paciente vê.
 */
export function camposLocaisDeConfig(
  args: {
    /** Chave do hospital (paciente.local). */
    localChave: string;
    /** Nome da equipe de anestesia (paciente.equipeAnestesia, texto livre). */
    equipeNome: string;
    /** Telefone da equipe de anestesia (paciente.equipeAnestesiaTelefone). */
    equipeTelefone: string;
    /** Texto de chegada usado só quando o hospital não está na config. */
    instrucoesChegadaPadrao: string;
  },
  cfg?: ConfigPreview,
): CamposLocais {
  const hospital = cfg?.hospitais.find((h) => h.chave === args.localChave);
  // O NOME do hospital é campo LIVRE do paciente (o que a equipe digitou em
  // `paciente.local`) — a página pública mostra exatamente esse texto, então a
  // prévia também. Da config só aproveitamos o ENDEREÇO e as INSTRUÇÕES quando o
  // nome digitado casa com um hospital conhecido; isso espelha o servidor
  // (`perfilLocalDoPaciente` + `localTexto`), que usa `nome` livre + endereço do
  // catálogo. O endereço vem embutido em `hospital.local` ("<nomeCompleto> —
  // <endereço>"); trocamos o prefixo do nome completo pelo nome livre.
  const nome = args.localChave;
  let local = nome;
  if (hospital) {
    const sufixoEndereco = hospital.local.startsWith(hospital.nomeCompleto)
      ? hospital.local.slice(hospital.nomeCompleto.length)
      : "";
    local = `${nome}${sufixoEndereco}`;
  }
  return {
    hospital: nome,
    local,
    equipe: args.equipeNome,
    equipeTelefone: args.equipeTelefone,
    instrucoesChegada: hospital?.instrucoesChegada ?? args.instrucoesChegadaPadrao,
  };
}

/**
 * Catálogo único dos campos do cabeçalho de identidade da médica (foto, logo,
 * clínica, médica, CRM/RQE) exibidos no topo da página da paciente. Este bloco
 * NÃO passa pela substituição de `{{...}}` — é renderizado direto por componentes
 * React — então a página pública e as prévias precisavam ser espelhadas à mão e
 * derivavam em silêncio. Centralizar o CONJUNTO de campos aqui (e renderizar por
 * um componente compartilhado tipado por `IdentidadeMedica`) faz com que acrescentar
 * ou remover um campo do cabeçalho quebre a compilação/os testes em qualquer lado
 * que ainda não tenha acompanhado.
 */
export const CAMPOS_IDENTIDADE_MEDICA = [
  "medica",
  "crm",
  "rqe",
  "clinica",
  "medicoFotoUrl",
  "medicoLogoUrl",
] as const satisfies readonly string[];

/** Um campo do cabeçalho de identidade (`"medica" | "crm" | ...`). */
export type CampoIdentidadeMedica = (typeof CAMPOS_IDENTIDADE_MEDICA)[number];

/**
 * Identidade da médica renderizada no cabeçalho da página da paciente. É a fonte
 * única do CONJUNTO de campos do cabeçalho: tanto o DTO da página pública
 * (api-server) quanto a montagem da prévia (Console) produzem este objeto, e o
 * componente compartilhado o consome — assim nenhum lado pode mostrar um campo
 * que o outro não mostra. As URLs são `string | null` (URL assinada ou ausente);
 * os demais são `string` (cai num fallback gracioso quando vazio).
 */
export interface IdentidadeMedica {
  /** Nome da médica (ex.: "Dra. Karla Caetano Lobo"). */
  medica: string;
  /** CRM da médica. */
  crm: string;
  /** RQE da médica. */
  rqe: string;
  /** Nome da clínica exibido ao lado do logo. */
  clinica: string;
  /** URL assinada da foto da médica; `null` cai nas iniciais. */
  medicoFotoUrl: string | null;
  /** URL assinada do logo da médica/clínica; `null` cai no emblema "K". */
  medicoLogoUrl: string | null;
}

/**
 * Trava de tipo: garante que `IdentidadeMedica` tenha EXATAMENTE as chaves de
 * `CAMPOS_IDENTIDADE_MEDICA` — nem a mais, nem a menos. Se as duas declarações
 * saírem de sincronia, a compilação falha aqui.
 */
type _ChavesIdentidadeBatem = [CampoIdentidadeMedica] extends [
  keyof IdentidadeMedica,
]
  ? [keyof IdentidadeMedica] extends [CampoIdentidadeMedica]
    ? true
    : never
  : never;
const _chavesIdentidadeBatem: _ChavesIdentidadeBatem = true;
void _chavesIdentidadeBatem;

/**
 * Deriva as iniciais da médica (até 3 letras) para o emblema usado quando não há
 * foto. Fonte única — a página pública e as prévias derivavam isto à mão e
 * precisavam render o mesmo fallback. Remove o prefixo "Dr./Dra." e cai em "KCL"
 * quando o nome não rende iniciais.
 */
export function iniciaisMedica(medica: string): string {
  return (
    medica
      .replace(/^Dr[ae]?\.?\s*/i, "")
      .split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 3)
      .toUpperCase() || "KCL"
  );
}

/** Etapa da linha do tempo, na forma mínima que o resolvedor manipula. */
export interface SecaoEtapaResolvivel {
  quando: string;
  titulo: string;
  descricao: string;
  /** Dias relativos à data da cirurgia (0 = no dia, -10 = dez dias antes). null/undefined = sem data. */
  offsetDias?: number | null;
  /** Data resolvida para exibição. */
  data?: string;
}

/** Medicamento a suspender, na forma mínima que o resolvedor manipula. */
export interface SecaoMedicamentoResolvivel {
  marca: string;
  principio?: string;
}

/** Janela de suspensão de medicamentos, na forma mínima que o resolvedor manipula. */
export interface SecaoGrupoMedicamentosResolvivel {
  quando: string;
  offsetDias?: number | null;
  data?: string;
  medicamentos: SecaoMedicamentoResolvivel[];
}

/** Produto do preparo da pele, na forma mínima que o resolvedor manipula. */
export interface SecaoProdutoResolvivel {
  nome: string;
  instrucao: string;
  inicio: string;
  tag: string;
}

/** Medicação do receituário pós-op, na forma mínima que o resolvedor manipula. */
export interface SecaoMedicacaoResolvivel {
  nome: string;
  instrucao: string;
  via: string;
}

/** Seção de conteúdo, na forma mínima que o resolvedor manipula. */
export interface SecaoResolvivel {
  id: string;
  tipo: string;
  titulo: string;
  itens?: string[];
  corpo?: string;
  etapas?: SecaoEtapaResolvivel[];
  contatos?: { rotulo: string; valor: string }[];
  grupos?: SecaoGrupoMedicamentosResolvivel[];
  aviso?: string;
  /** Metadados de arquivo anexado; passam intactos (não resolvidos). */
  arquivo?: { nomeArquivo: string; tamanho: number; token: string };
  produtos?: SecaoProdutoResolvivel[];
  medicacoes?: SecaoMedicacaoResolvivel[];
}

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

/** Formata `yyyy-mm-dd` como `dd/mm/aaaa`. */
export function formatarData(isoDate: string): string {
  const [ano, mes, dia] = isoDate.split("-");
  if (!ano || !mes || !dia) return isoDate;
  return `${dia}/${mes}/${ano}`;
}

/** Formata `yyyy-mm-dd` como `dd/mm`. */
export function formatarDataCurta(isoDate: string): string {
  const [, mes, dia] = isoDate.split("-");
  if (!mes || !dia) return isoDate;
  return `${dia}/${mes}`;
}

/** Desloca uma data `yyyy-mm-dd` por um número de dias, em UTC. */
export function deslocarDias(isoDate: string, dias: number): string {
  const [ano, mes, dia] = isoDate.split("-").map((n) => parseInt(n, 10));
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() + dias);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Substitui `{{chave}}` (com espaços opcionais) pelos valores do contexto. */
export function resolverVariaveis(texto: string, ctx: Contexto): string {
  return texto.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (original, chave) => {
    const valor = ctx[chave as string];
    return valor !== undefined ? valor : original;
  });
}

// ===========================================================================
// Formato canônico dos documentos jurídicos (contratos/termos): HTML
// ---------------------------------------------------------------------------
// O editor WYSIWYG, a geração do rascunho, a revisão de IA e o PDF compartilham
// um único formato — HTML. Estes helpers (sem dependências) convertem o texto
// puro legado para HTML, detectam o formato e extraem texto legível para a IA.
// As variáveis `{{chave}}` continuam vivendo nos nós de texto e são resolvidas
// por `resolverVariaveis` normalmente.
// ===========================================================================

/** Escapa os caracteres especiais de HTML em um trecho de texto puro. */
export function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Decodifica as entidades HTML mais comuns de volta para texto puro. */
function decodeHtml(texto: string): string {
  return texto
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/g, "'")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&amp;/g, "&");
}

/**
 * Heurística para decidir se um conteúdo já está em HTML (formato canônico) ou
 * é texto puro legado. Procura por tags de bloco/inline típicas.
 */
export function ehHtml(texto: string): boolean {
  return /<\/?(p|h[1-6]|ul|ol|li|div|br|strong|em|u|b|i)(\s|>|\/)/i.test(
    texto ?? "",
  );
}

/**
 * Converte texto puro legado para HTML, preservando a estrutura: linhas em
 * branco separam blocos, linhas iniciadas por `•` viram itens de `<ul>`, e
 * linhas que começam com "ATENÇÃO" são destacadas em `<strong>` (espelha o
 * comportamento histórico do PDF). As `{{variáveis}}` permanecem intactas.
 */
export function textoParaHtml(texto: string): string {
  const linhas = (texto ?? "").replace(/\r\n/g, "\n").split("\n");
  const partes: string[] = [];
  let bullets: string[] = [];
  const fecharLista = () => {
    if (bullets.length) {
      partes.push(`<ul>${bullets.map((b) => `<li>${b}</li>`).join("")}</ul>`);
      bullets = [];
    }
  };
  for (const linhaBruta of linhas) {
    const linha = linhaBruta.trim();
    if (linha === "") {
      fecharLista();
      continue;
    }
    const mBullet = linha.match(/^[\u2022\u00b7]\s+(.*)$/);
    if (mBullet) {
      bullets.push(escapeHtml(mBullet[1]));
      continue;
    }
    fecharLista();
    const conteudo = escapeHtml(linha);
    const ehAtencao = linha.toUpperCase().startsWith("ATEN\u00c7\u00c3O");
    partes.push(
      `<p>${ehAtencao ? `<strong>${conteudo}</strong>` : conteudo}</p>`,
    );
  }
  fecharLista();
  return partes.join("");
}

/** Garante HTML: devolve o conteúdo se já for HTML, senão converte de texto. */
export function normalizarParaHtml(texto: string): string {
  const t = texto ?? "";
  return ehHtml(t) ? t : textoParaHtml(t);
}

/**
 * Extrai texto legível de um conteúdo HTML (para a revisão de IA, que precisa
 * de texto puro). Blocos viram quebras de linha, itens de lista ganham "• ".
 */
export function htmlParaTexto(html: string): string {
  if (!ehHtml(html)) return html ?? "";
  let t = html;
  t = t.replace(/<li[^>]*>/gi, "\n\u2022 ").replace(/<\/li>/gi, "");
  t = t.replace(/<\/(p|h[1-6]|ul|ol|div)>/gi, "\n\n");
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<[^>]+>/g, "");
  t = decodeHtml(t);
  t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

/** Conteúdo HTML é "vazio" quando não há texto visível (só tags/espaços). */
export function htmlVazio(html: string): boolean {
  return htmlParaTexto(html ?? "").trim() === "";
}

/** Calcula a data de exibição de uma etapa a partir do offset em dias. */
export function dataDaEtapa(
  offsetDias: number | null | undefined,
  dataCirurgia: string,
): string | undefined {
  if (offsetDias === null || offsetDias === undefined) return undefined;
  if (offsetDias === 0) return formatarData(dataCirurgia);
  return formatarDataCurta(deslocarDias(dataCirurgia, offsetDias));
}

/**
 * Resolve as seções para um contexto: troca as variáveis em todos os textos e
 * calcula as datas da linha do tempo. Não altera a estrutura nem a ordem.
 * Preserva o tipo exato das seções de entrada.
 */
export function resolverSecoesComContexto<S extends SecaoResolvivel>(
  secoes: S[],
  ctx: Contexto,
  dataCirurgia: string,
): S[] {
  const sub = (t: string) => resolverVariaveis(t, ctx);

  return secoes.map((secao) => ({
    ...secao,
    titulo: sub(secao.titulo),
    ...(secao.itens ? { itens: secao.itens.map(sub) } : {}),
    ...(secao.corpo !== undefined ? { corpo: sub(secao.corpo) } : {}),
    ...(secao.etapas
      ? {
          etapas: secao.etapas.map((e) => ({
            quando: sub(e.quando),
            titulo: sub(e.titulo),
            descricao: sub(e.descricao),
            offsetDias: e.offsetDias ?? null,
            data: dataDaEtapa(e.offsetDias, dataCirurgia),
          })),
        }
      : {}),
    ...(secao.contatos
      ? {
          contatos: secao.contatos.map((c) => ({
            rotulo: sub(c.rotulo),
            valor: sub(c.valor),
          })),
        }
      : {}),
    ...(secao.aviso !== undefined ? { aviso: sub(secao.aviso) } : {}),
    ...(secao.grupos
      ? {
          grupos: secao.grupos.map((g) => ({
            quando: sub(g.quando),
            offsetDias: g.offsetDias ?? null,
            data: dataDaEtapa(g.offsetDias, dataCirurgia),
            medicamentos: g.medicamentos.map((m) => ({
              marca: sub(m.marca),
              ...(m.principio !== undefined
                ? { principio: sub(m.principio) }
                : {}),
            })),
          })),
        }
      : {}),
    ...(secao.produtos
      ? {
          produtos: secao.produtos.map((p) => ({
            nome: sub(p.nome),
            instrucao: sub(p.instrucao),
            inicio: sub(p.inicio),
            tag: sub(p.tag),
          })),
        }
      : {}),
    ...(secao.medicacoes
      ? {
          medicacoes: secao.medicacoes.map((m) => ({
            nome: sub(m.nome),
            instrucao: sub(m.instrucao),
            via: sub(m.via),
          })),
        }
      : {}),
  })) as S[];
}
