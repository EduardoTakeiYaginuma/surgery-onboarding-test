import type { PaginaPaciente } from "@workspace/api-client-react";

export type TipoEventoPaciente =
  | "abertura"
  | "calendario"
  | "mapa"
  | "resumo"
  | "whatsapp"
  | "ligacao"
  | "preparo"
  | "documento"
  | "politica";

/**
 * Registra uma interação da paciente de forma NÃO bloqueante. Usa sendBeacon
 * quando disponível (sobrevive à navegação) e cai para fetch keepalive. Toda
 * falha é silenciosa — a página da paciente nunca pode travar por causa disso.
 */
export function registrarEventoPaciente(
  token: string,
  tipo: TipoEventoPaciente,
  rotulo?: string,
): void {
  try {
    const url = `${import.meta.env.BASE_URL}api/publico/${encodeURIComponent(token)}/eventos`;
    const payload = JSON.stringify(rotulo ? { tipo, rotulo } : { tipo });

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) return;
    }

    void fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      /* silencioso */
    });
  } catch {
    /* silencioso */
  }
}

/** Parse "06h00", "06:00", "6h", "06 00" → { hh, mm }. Defaults to 06:00. */
export function parseHorario(h: string): { hh: number; mm: number } {
  const m = h.match(/(\d{1,2})\s*[:hH]\s*(\d{2})?/);
  if (!m) return { hh: 6, mm: 0 };
  return { hh: parseInt(m[1], 10), mm: m[2] ? parseInt(m[2], 10) : 0 };
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

function soDigitos(v: string): string {
  return v.replace(/\D/g, "");
}

export function ehTelefone(valor: string): boolean {
  return soDigitos(valor).length >= 10;
}

/** Link absoluto de WhatsApp (wa.me) com mensagem pré-preenchida e personalizada. */
export function linkWhatsApp(valor: string, primeiroNome: string, dataFmt: string, horario: string): string {
  const num = soDigitos(valor);
  const comDDI = num.startsWith("55") ? num : `55${num}`;
  const msg = `Olá, sou a ${primeiroNome}. Minha cirurgia está marcada para ${dataFmt} às ${horario}. Gostaria de tirar uma dúvida sobre o pré-operatório.`;
  return `https://wa.me/${comDDI}?text=${encodeURIComponent(msg)}`;
}

export function linkTelefone(valor: string): string {
  const num = soDigitos(valor);
  const comDDI = num.startsWith("55") ? `+${num}` : `+55${num}`;
  return `tel:${comDDI}`;
}

/** Primeiro nome (mesma lógica do servidor para mensagens informais). */
function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

/** "2026-06-30" → "30/06/2026". Devolve a entrada se não for ISO. */
function formatarDataIso(isoDate: string): string {
  const [ano, mes, dia] = isoDate.split("-");
  if (!ano || !mes || !dia) return isoDate;
  return `${dia}/${mes}/${ano}`;
}

/**
 * Link público absoluto da paciente, espelhando `montarLinkPublico` do servidor
 * (`https://host/p/{codigo}`) — o mesmo endereço que ela já recebeu por WhatsApp.
 */
export function montarLinkPublicoCliente(codigoPublico: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/p/${codigoPublico}`;
}

/**
 * Link de WhatsApp (wa.me) para um lembrete one-tap: abre a conversa com a
 * paciente já com uma mensagem curta e o link público pré-preenchidos. Tom
 * contido e sem emoji, alinhado à mensagem de entrega do Console.
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
  const data = formatarDataIso(p.dataCirurgia);
  const msg = `Olá, ${primeiroNome(p.nome)}. Passando para lembrar da sua cirurgia em ${data} às ${p.horario}. Reunimos todas as orientações, documentos e contatos em um só lugar, com calma: ${link}. Quando puder, dê uma olhada — qualquer dúvida, é só responder por aqui.`;
  return `https://wa.me/${comDDI}?text=${encodeURIComponent(msg)}`;
}

/** Link de mapas com o endereço do local. */
export function linkMapa(local: string, endereco: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${local} ${endereco}`)}`;
}

function escapeICS(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Gera e baixa um arquivo .ics com o evento da cirurgia. */
export function baixarICS(data: PaginaPaciente): void {
  const { hh, mm } = parseHorario(data.horario);
  const [y, mo, d] = data.dataCirurgia.split("-").map((n) => parseInt(n, 10));

  const dtStart = `${y}${pad(mo)}${pad(d)}T${pad(hh)}${pad(mm)}00`;
  const fim = new Date(y, mo - 1, d, hh + 3, mm);
  const dtEnd = `${fim.getFullYear()}${pad(fim.getMonth() + 1)}${pad(fim.getDate())}T${pad(fim.getHours())}${pad(fim.getMinutes())}00`;

  const agora = new Date();
  const dtStamp = `${agora.getUTCFullYear()}${pad(agora.getUTCMonth() + 1)}${pad(agora.getUTCDate())}T${pad(agora.getUTCHours())}${pad(agora.getUTCMinutes())}${pad(agora.getUTCSeconds())}Z`;

  const local = `${data.local} — ${data.enderecoLocal}`;
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KCL//Pre-Operatorio//PT-BR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${data.dataCirurgia}-${dtStart}@kcl`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeICS(`Cirurgia — ${data.medica}`)}`,
    `LOCATION:${escapeICS(local)}`,
    `DESCRIPTION:${escapeICS(`Procedimento: ${data.procedimentos.join(", ")}. Chegue no horário combinado e leve um acompanhante.`)}`,
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    "DESCRIPTION:Lembrete: sua cirurgia é amanhã",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  const blob = new Blob([linhas.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cirurgia-kcl.ics";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Abre uma janela de impressão com um resumo branded, para salvar em PDF. */
export function baixarResumoPDF(data: PaginaPaciente, dataFmt: string): void {
  const w = window.open("", "_blank");
  if (!w) return;

  const hoje = new Intl.DateTimeFormat("pt-BR").format(new Date());

  const listaSecao = data.secoes.find((s) => s.tipo === "lista");
  const docsSecao = data.secoes.find((s) => s.tipo === "documentos");
  const prep = (listaSecao?.itens ?? [])
    .map((i) => `<li>${escapeHtml(i)}</li>`)
    .join("");
  const docs = (docsSecao?.itens ?? [])
    .map((i) => `<li>${escapeHtml(i)}</li>`)
    .join("");
  const tituloPrep = escapeHtml(listaSecao?.titulo ?? "Como se preparar");
  const tituloDocs = escapeHtml(docsSecao?.titulo ?? "Documentos para levar");
  const blocoPrep = prep ? `<h2>${tituloPrep}</h2><ul>${prep}</ul>` : "";
  const blocoDocs = docs ? `<h2>${tituloDocs}</h2><ul>${docs}</ul>` : "";

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Resumo — ${escapeHtml(data.medica)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&family=Archivo+Expanded:wght@600&family=IBM+Plex+Mono:wght@400;500&family=Spectral:ital,wght@0,300;0,400;1,400&display=swap');
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #ffffff; color: #0A1729; }
  body { font-family: 'Archivo', sans-serif; line-height: 1.6; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { max-width: 720px; margin: 0 auto; padding: 56px 48px; }
  .eyebrow { font-family: 'Archivo Expanded', sans-serif; text-transform: uppercase; letter-spacing: 0.25em; font-size: 10px; color: #8A6B33; }
  h1 { font-family: 'Spectral', serif; font-style: italic; font-weight: 400; color: #8A6B33; font-size: 34px; margin: 10px 0 6px; }
  .cred { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.08em; color: #5b6470; text-transform: uppercase; }
  .rule { height: 1px; background: rgba(138,107,51,0.25); margin: 28px 0; }
  .block { border-left: 3px solid #8A6B33; padding: 4px 0 4px 20px; margin: 6px 0 24px; }
  .lbl { font-family: 'Archivo Expanded', sans-serif; text-transform: uppercase; letter-spacing: 0.2em; font-size: 9px; color: #8A6B33; display: block; margin-bottom: 4px; }
  .val { font-family: 'IBM Plex Mono', monospace; font-size: 17px; }
  .loc { font-family: 'Spectral', serif; font-style: italic; font-size: 20px; }
  .addr { font-weight: 300; font-size: 13px; color: #5b6470; }
  .gap { height: 18px; }
  h2 { font-family: 'Spectral', serif; font-weight: 400; color: #8A6B33; font-size: 22px; margin: 32px 0 12px; }
  ul { margin: 0; padding-left: 20px; }
  li { font-weight: 300; margin-bottom: 8px; }
  footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid rgba(138,107,51,0.2); font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: 0.08em; color: #8b94a0; text-transform: uppercase; }
  @media print { .page { padding: 32px; } }
</style>
</head>
<body>
  <div class="page">
    <div class="eyebrow">KCL</div>
    <h1>${escapeHtml(data.medica)}</h1>
    <div class="cred">${escapeHtml(data.especialidade)} · CRM ${escapeHtml(data.crm)} · RQE ${escapeHtml(data.rqe)}</div>
    <div class="rule"></div>
    <div class="block">
      <span class="lbl">Data e hora</span>
      <div class="val">${escapeHtml(dataFmt)} às ${escapeHtml(data.horario)}</div>
      <div class="gap"></div>
      <span class="lbl">Local</span>
      <div class="loc">${escapeHtml(data.local)}</div>
      <div class="addr">${escapeHtml(data.enderecoLocal)}</div>
    </div>
    ${blocoPrep}
    ${blocoDocs}
    <footer>Resumo gerado em ${escapeHtml(hoje)} · ${escapeHtml(data.medica)}</footer>
  </div>
</body>
</html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
  const acionar = () => {
    w.focus();
    w.print();
  };
  w.onload = acionar;
  setTimeout(acionar, 700);
}
