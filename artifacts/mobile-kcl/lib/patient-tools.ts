/**
 * Ferramentas da paciente no app móvel, espelhando
 * `artifacts/console-kcl/src/lib/patient-tools.ts` do Console web. Reúne as
 * ferramentas de follow-up (lembrete por WhatsApp e alerta de abertura) e as
 * ferramentas da jornada (etapa e contagem regressiva da pré-visualização).
 * Mantenha-as em sincronia com o Console web e a página pública.
 */
import { formatDate } from "./format";

/** Janela (em dias) antes da cirurgia em que a falta de abertura vira alerta. */
export const DIAS_ALERTA_ABERTURA = 7;

function soDigitos(v: string): string {
  return v.replace(/\D/g, "");
}

/** Primeiro nome (mesma lógica do servidor para mensagens informais). */
function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

/** Dias civis até a cirurgia (negativo se já passou, 0 = hoje). */
function diasParaCirurgia(dataCirurgia: string): number {
  const [ano, mes, dia] = dataCirurgia.split("-").map((n) => parseInt(n, 10));
  if (!ano || !mes || !dia) return 0;
  const alvo = new Date(ano, mes - 1, dia);
  alvo.setHours(0, 0, 0, 0);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const MS_DIA = 24 * 60 * 60 * 1000;
  return Math.round((alvo.getTime() - hoje.getTime()) / MS_DIA);
}

/**
 * Alerta de follow-up: a paciente ainda não abriu o link e a cirurgia está
 * próxima. Só vale depois que o link foi entregue (linkEnviadoEm != null) e
 * enquanto a cirurgia não passou. `abriu` undefined (desconhecido) não alerta.
 * Espelha `precisaAlertaAbertura` do Console web.
 */
export function precisaAlertaAbertura(p: {
  abriu?: boolean;
  linkEnviadoEm: string | null;
  dataCirurgia: string;
}): boolean {
  if (p.abriu !== false) return false;
  if (!p.linkEnviadoEm) return false;
  const dias = diasParaCirurgia(p.dataCirurgia);
  return dias >= 0 && dias <= DIAS_ALERTA_ABERTURA;
}

/**
 * Link público absoluto da paciente, espelhando `montarLinkPublico` do servidor
 * (`https://host/p/{codigo}`) — o mesmo endereço que ela já recebeu por
 * WhatsApp. Os bundles Expo rodam fora do proxy, então usamos o domínio
 * absoluto injetado em build (o mesmo usado para falar com a API).
 */
export function montarLinkPublicoCliente(codigoPublico: string): string {
  const base = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
  return `${base}/p/${codigoPublico}`;
}

/**
 * Link de WhatsApp (wa.me) para um lembrete one-tap: abre a conversa com a
 * paciente já com uma mensagem curta e o link público pré-preenchidos. Tom
 * contido e sem emoji, idêntico ao do Console web (`linkLembreteWhatsApp`).
 */
export function linkLembreteWhatsApp(p: {
  telefone: string;
  nome: string;
  codigoPublico: string;
  dataCirurgia: string;
  horario: string;
}): string {
  const num = soDigitos(p.telefone);
  const comDDI = num.startsWith("55") ? num : `55${num}`;
  const link = montarLinkPublicoCliente(p.codigoPublico);
  const data = formatDate(p.dataCirurgia);
  const msg = `Olá, ${primeiroNome(p.nome)}. Passando para lembrar da sua cirurgia em ${data} às ${p.horario}. Reunimos todas as orientações, documentos e contatos em um só lugar, com calma: ${link}. Quando puder, dê uma olhada — qualquer dúvida, é só responder por aqui.`;
  return `https://wa.me/${comDDI}?text=${encodeURIComponent(msg)}`;
}

/** Etapa atual da jornada (5 nós) a partir dos dias restantes. */
export function etapaAtual(dias: number): number {
  if (dias > 10) return 0; // reserva confirmada
  if (dias > 1) return 1; // 7-10 dias antes
  if (dias === 1) return 2; // véspera
  if (dias === 0) return 3; // dia da cirurgia
  return 4; // pós-operatório
}

/** Texto da contagem regressiva com tratamento para hoje/amanhã/passado. */
export function contagemRegressiva(dias: number): string {
  if (dias < 0) return "Procedimento realizado";
  if (dias === 0) return "É hoje";
  if (dias === 1) return "É amanhã";
  return `Faltam ${dias} dias`;
}

/**
 * Dias de calendário entre hoje e a cirurgia (ISO yyyy-mm-dd). Equivale a
 * `differenceInCalendarDays(parseISO(dataCirurgia), new Date())` do Console web,
 * sem depender de date-fns (ausente no app móvel). Devolve 0 para datas inválidas.
 */
export function diasAteCirurgia(isoDate: string): number {
  const [ano, mes, dia] = isoDate.split("-").map((n) => parseInt(n, 10));
  if (!ano || !mes || !dia) return 0;
  const alvo = Date.UTC(ano, mes - 1, dia);
  const hoje = new Date();
  const base = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvo - base) / 86_400_000);
}
