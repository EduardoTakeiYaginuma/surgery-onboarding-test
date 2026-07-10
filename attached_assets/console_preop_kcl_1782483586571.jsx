import React, { useState, useEffect } from "react";
import {
  Check, Copy, Calendar, Clock, MapPin, FileText, Phone,
  ChevronDown, Pill, ClipboardList, Sparkles, ShieldCheck,
  AlertTriangle, MessageCircle,
} from "lucide-react";

/* Identidade Camada — Meia-noite & Champanhe (Branding Playbook v02) */
const c = {
  meianoite: "#0A1729", marinho: "#11294A", brisa: "#97A3B4",
  marfim: "#F4F1E8", linho: "#EDE5D3", champanhe: "#C9A96E", champanheTxt: "#8A6B33",
  white: "#FFFFFF",
  ink: "#0A1729",
  line: "rgba(10,23,41,0.12)", lineSoft: "rgba(10,23,41,0.07)",
};
const F = {
  serif: '"Spectral", Georgia, "Times New Roman", serif',
  sans: '"Archivo", system-ui, -apple-system, sans-serif',
  exp: '"Archivo Expanded", "Archivo", system-ui, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, "SFMono-Regular", monospace',
};

const MESES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
function dataBR(iso) {
  if (!iso) return "a definir";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "a definir";
  return `${String(d).padStart(2, "0")} ${MESES[m - 1]} ${y}`;
}
function slugify(s) {
  return (s || "paciente").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 24) || "paciente";
}

// Símbolo Estratos (terços crescentes; barra menor em champanhe = o médico). Esquerda-alinhado.
function Estratos({ size = 22, base = c.meianoite }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="8" height="3.1" rx="1.55" fill={c.champanhe} />
      <rect x="4" y="10.45" width="13" height="3.1" rx="1.55" fill={base} />
      <rect x="4" y="15.9" width="16" height="3.1" rx="1.55" fill={base} />
    </svg>
  );
}

function CopyButton({ text, label = "Copiar", small }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => { try { await navigator.clipboard.writeText(text); } catch (e) {} setDone(true); setTimeout(() => setDone(false), 1600); }}
      className={`inline-flex items-center gap-1.5 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 ${small ? "px-2.5 py-1" : "px-3 py-1.5"}`}
      style={{ background: done ? c.meianoite : "rgba(10,23,41,0.06)", color: done ? c.marfim : c.meianoite, fontFamily: F.exp, fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600 }}
    >
      {done ? <Check size={12} /> : <Copy size={12} />}
      {done ? "Copiado" : label}
    </button>
  );
}

function Section({ id, icon: Icon, title, hint, open, onToggle, children }) {
  return (
    <div className="rounded-2xl border" style={{ borderColor: c.line, background: c.white }}>
      <button onClick={() => onToggle(id)}
        className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: c.marfim, color: c.meianoite }}><Icon size={16} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold" style={{ color: c.meianoite, fontFamily: F.sans }}>{title}</span>
          {hint && <span className="block" style={{ color: c.brisa, fontFamily: F.mono, fontSize: 11 }}>{hint}</span>}
        </span>
        <ChevronDown size={18} style={{ color: c.brisa, transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function MsgBlock({ tag, text }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: c.lineSoft, background: c.marfim }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span style={{ color: c.champanheTxt, fontFamily: F.mono, fontSize: 11, fontWeight: 500 }}>{tag}</span>
        <CopyButton text={text} small />
      </div>
      <p className="whitespace-pre-line leading-relaxed" style={{ color: c.marinho, fontFamily: F.sans, fontSize: 12 }}>{text}</p>
    </div>
  );
}

function Eyebrow({ children, color = c.brisa, style }) {
  return <div style={{ fontFamily: F.exp, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color, fontWeight: 600, ...style }}>{children}</div>;
}
function SectionTitle({ children }) {
  return <Eyebrow color={c.meianoite}>{children}</Eyebrow>;
}

function Row({ icon: Icon, label, value, sub, mono }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={16} className="mt-0.5 shrink-0" style={{ color: c.champanheTxt }} />
      <div className="min-w-0">
        <div style={{ fontFamily: F.exp, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: c.brisa }}>{label}</div>
        <div style={{ color: mono ? c.champanheTxt : c.meianoite, fontFamily: mono ? F.mono : F.sans, fontSize: mono ? 15 : 14, fontWeight: mono ? 500 : 600 }}>{value}</div>
        {sub && <div style={{ color: c.marinho, fontFamily: F.sans, fontSize: 12 }}>{sub}</div>}
      </div>
    </div>
  );
}
function ContactRow({ icon: Icon, title, sub }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border p-3" style={{ borderColor: c.line, background: c.white }}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: c.marfim, color: c.meianoite }}><Icon size={16} /></span>
      <div>
        <div className="font-medium" style={{ color: c.meianoite, fontFamily: F.sans, fontSize: 14 }}>{title}</div>
        <div style={{ color: c.marinho, fontFamily: F.sans, fontSize: 12 }}>{sub}</div>
      </div>
    </div>
  );
}

/* Página do paciente — território da Dra. Karla, na estética Camada (sem logo Camada) */
function PatientPage({ f }) {
  const [polOpen, setPolOpen] = useState(false);
  const hora = f.hora || "06:00";
  const docs = [
    { icon: FileText, title: "Exames pré-operatórios", desc: "Pedidos de exames laboratoriais e avaliações." },
    { icon: Pill, title: "Suspensão de medicamentos", desc: "O que pausar antes, orientado pela equipe de anestesia.", note: "Jejum de 8h · sem apliques, unhas de gel ou cílios" },
    { icon: ClipboardList, title: "Receita pós-operatória", desc: "Enviada antes para você comprar as medicações com calma." },
  ];
  if (f.laser) docs.splice(2, 0, { icon: Sparkles, title: "Receita pré-laser CO₂", desc: "Preparo para o laser no dia da cirurgia." });

  const journey = [
    { when: "HOJE", title: "Suas orientações e documentos", desc: "Está tudo reunido aqui nesta página." },
    { when: "7 A 10 DIAS ANTES", title: "Centro cirúrgico e anestesia", desc: "O Avant e a equipe Zenicare entram em contato para alinhar os detalhes com você." },
    { when: "VÉSPERA", title: "Reconfirmação", desc: "Nossa equipe fala com você para confirmar tudo." },
    { when: "DIA DA CIRURGIA", title: `${hora} · Avant Moema`, desc: "Chegue em jejum de 8h e com acompanhante." },
  ];
  const prep = ["Jejum de 8 horas antes da cirurgia", "Sem apliques, unhas de gel ou cílios postiços", "Leve um acompanhante", "Roupa confortável e sem maquiagem"];

  return (
    <div style={{ background: c.linho, color: c.meianoite, fontFamily: F.sans }}>
      {/* Marca da médica — KCL / Dra. Karla (identidade dela, intacta) */}
      <div className="px-5 pt-6 pb-4 text-center">
        <div className="mx-auto mb-2 inline-flex flex-col items-center">
          <div style={{ fontFamily: F.exp, fontSize: 22, letterSpacing: "0.16em", fontWeight: 700, color: c.meianoite }}>KCL</div>
          <div className="mt-1" style={{ height: 1, width: 30, background: c.champanhe }} />
        </div>
        <div className="mt-2" style={{ fontFamily: F.serif, fontSize: 15, color: c.meianoite }}>Dra. Karla Caetano Lobo</div>
        <div style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: "0.04em", color: c.brisa }}>CIRURGIA OCULOPLÁSTICA · CRM-SP {"{nº}"} · RQE {"{nº}"}</div>
      </div>

      {/* Hero confirmação */}
      <div className="px-5">
        <div className="overflow-hidden rounded-2xl border" style={{ borderColor: c.line, background: c.white }}>
          <div style={{ height: 2, background: c.champanhe }} />
          <div className="p-5">
            <div className="flex items-center gap-1.5" style={{ color: c.champanheTxt, fontFamily: F.exp, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600 }}>
              <ShieldCheck size={13} /> Reserva confirmada
            </div>
            <h1 className="mt-2 leading-tight" style={{ fontFamily: F.serif, fontSize: 27, fontWeight: 400, color: c.meianoite }}>
              {f.nome ? `${f.nome.split(" ")[0]}, sua cirurgia` : "Sua cirurgia"} está confirmada.
            </h1>
            <p className="mt-1.5" style={{ fontFamily: F.sans, fontSize: 13.5, color: c.marinho }}>
              {f.procedimento || "Blefaroplastia"} com a Dra. Karla Caetano Lobo. Cada etapa daqui até o dia está cuidada — é só seguir esta página.
            </p>
            <div className="mt-4" style={{ height: 1, background: c.lineSoft }} />
            <div className="mt-4 space-y-3.5">
              <Row icon={Calendar} label="Data" value={dataBR(f.data)} mono />
              <Row icon={Clock} label="Horário" value={hora} mono />
              <Row icon={MapPin} label="Local" value={"Avant Moema Day Hospital"} sub={"Av. Copacabana, 112 · 3º andar (Edif. Medic Life)"} />
            </div>
          </div>
        </div>
      </div>

      {/* Jornada — assinatura */}
      <div className="px-5 pt-7">
        <SectionTitle>Sua jornada até a cirurgia</SectionTitle>
        <div className="relative mt-3 pl-1">
          {journey.map((s, i) => (
            <div key={i} className="relative flex gap-3.5 pb-5 last:pb-0">
              {i < journey.length - 1 && <span className="absolute" style={{ top: 18, left: 5, height: "100%", width: 1, background: c.champanhe, opacity: 0.5 }} />}
              <span className="z-10 mt-1 shrink-0 rounded-full" style={{ height: 11, width: 11, background: i === 0 ? c.champanhe : c.white, border: `1.5px solid ${c.champanhe}` }} />
              <div className="min-w-0">
                <div style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.06em", color: c.champanheTxt }}>{s.when}</div>
                <div className="font-medium" style={{ fontFamily: F.sans, fontSize: 14, color: c.meianoite }}>{s.title}</div>
                <div className="leading-snug" style={{ fontFamily: F.sans, fontSize: 12.5, color: c.marinho }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Documentos */}
      <div className="px-5 pt-6">
        <SectionTitle>Seus documentos</SectionTitle>
        <div className="mt-3 space-y-2.5">
          {docs.map((d, i) => (
            <div key={i} className="rounded-2xl border p-3.5" style={{ borderColor: c.line, background: c.white }}>
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: c.marfim, color: c.meianoite }}><d.icon size={16} /></span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium" style={{ fontFamily: F.sans, fontSize: 14, color: c.meianoite }}>{d.title}</div>
                  <div className="leading-snug" style={{ fontFamily: F.sans, fontSize: 12, color: c.marinho }}>{d.desc}</div>
                  {d.note && <div className="mt-1.5 inline-block rounded-md px-2 py-1" style={{ background: c.marfim, color: c.champanheTxt, fontFamily: F.mono, fontSize: 10.5 }}>{d.note}</div>}
                </div>
              </div>
              <button className="mt-2.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
                      style={{ border: `1px solid ${c.line}`, color: c.meianoite, fontFamily: F.exp, fontSize: 10.5, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600 }}>
                <FileText size={12} /> Abrir PDF
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Preparo */}
      <div className="px-5 pt-6">
        <SectionTitle>Como se preparar</SectionTitle>
        <div className="mt-3 rounded-2xl border p-4" style={{ borderColor: c.line, background: c.white }}>
          <ul className="space-y-2.5">
            {prep.map((p, i) => (
              <li key={i} className="flex items-start gap-2.5" style={{ fontFamily: F.sans, fontSize: 13, color: c.marinho }}>
                <Check size={15} className="mt-0.5 shrink-0" style={{ color: c.champanheTxt }} /> {p}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Política */}
      <div className="px-5 pt-6">
        <button onClick={() => setPolOpen(!polOpen)}
          className="flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
          style={{ borderColor: c.line, background: c.white }}>
          <span className="font-medium" style={{ fontFamily: F.sans, fontSize: 13.5, color: c.meianoite }}>Política de remarcação</span>
          <ChevronDown size={17} style={{ color: c.brisa, transform: polOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
        </button>
        {polOpen && (
          <div className="mt-2 space-y-1 rounded-2xl border p-4 leading-relaxed" style={{ borderColor: c.lineSoft, background: c.marfim, color: c.marinho, fontFamily: F.sans, fontSize: 12.5 }}>
            <p>Mais de 14 dias de antecedência: remarcação sem custo.</p>
            <p>Entre 7 e 14 dias: retenção de 50% do sinal.</p>
            <p>Menos de 7 dias ou não comparecimento: retenção de 100% do sinal.</p>
            <p className="pt-1">Em emergência médica comprovada, conversamos e avaliamos cada caso com cuidado.</p>
          </div>
        )}
      </div>

      {/* Contatos */}
      <div className="px-5 pt-6">
        <SectionTitle>Fale com a gente</SectionTitle>
        <div className="mt-3 space-y-2.5">
          <ContactRow icon={MessageCircle} title="KCL · Dra. Karla" sub="Tire qualquer dúvida por aqui" />
          <ContactRow icon={Phone} title="Anestesia · Zenicare" sub="(11) 95080-2525" />
        </div>
      </div>

      <div className="mt-8 pb-8 text-center" style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: "0.06em", color: c.brisa }}>
        KCL · DRA. KARLA CAETANO LOBO
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block" style={{ fontFamily: F.exp, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: c.brisa, fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}
function Step({ n, children }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full" style={{ background: c.meianoite, color: c.marfim, fontFamily: F.mono, fontSize: 11, fontWeight: 500 }}>{n}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export default function App() {
  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&family=Archivo+Expanded:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Spectral:ital,wght@0,300;0,400;0,500;1,400&display=swap";
    document.head.appendChild(l);
    return () => { try { document.head.removeChild(l); } catch (e) {} };
  }, []);

  const [f, setF] = useState({ nome: "", procedimento: "Blefaroplastia", data: "", hora: "06:00", sinal: "", laser: false });
  const [open, setOpen] = useState({ fallback: false, ops: false });
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const link = `kclclinic.com.br/preop/${slugify(f.nome)}`;
  const nome = f.nome || "{nome}";
  const sinal = f.sinal || "{valor}";

  const msg = `Olá, ${nome}! Sua cirurgia com a Dra. Karla Caetano Lobo está confirmada para ${dataBR(f.data)} às ${f.hora || "06:00"}, no Avant Moema Day Hospital.\n\nReuni numa página só tudo o que você precisa — suas orientações, seus documentos e o passo a passo até o dia da cirurgia:\n${link}\n\nFica tranquila: qualquer dúvida, é só me chamar por aqui.`;
  const a6 = `Olá, ${nome}. Tudo bem? ✅ Confirmação de Reserva: Recebemos o pagamento (R$ ${sinal}) referente à reserva dos honorários da Dra. Karla. Com isso, sua cirurgia está oficialmente confirmada para:\nData: ${dataBR(f.data)}\nHorário: ${f.hora || "06:00"}\nLocal: 📍 Avant Moema Day Hospital — Av. Copacabana, 112, 3º andar (Edif. Medic Life)`;
  const a7 = `(Pré-Operatório) A seguir, enviaremos todos os PDFs:\n- Os pedidos de exames laboratoriais e avaliações necessárias.\n- A lista de suspensão de medicações, conforme a equipe de anestesia.\n- A sua receita de pós-operatório, enviada com antecedência para comprar as medicações com calma.\n🗓️ Um dia antes da cirurgia: entraremos em contato para a cobrança do valor final dos honorários.\n💳 Taxas de terceiros (Centro Cirúrgico e Anestesia): conforme o orçamento, o Centro Cirúrgico e a equipe Zenicare (11 95080-2525) entram em contato entre 7 e 10 dias antes para alinhar detalhes e formas de pagamento.`;
  const a8 = `Envio também a nossa política de remarcação:\n- Com mais de 14 dias de antecedência → remarcação sem custo\n- Entre 7 e 14 dias → retenção de 50% do sinal\n- Com menos de 7 dias ou não comparecimento → retenção de 100% do sinal\nEsses valores cobrem custos de reserva de centro cirúrgico e equipe já alocados. Em emergência médica comprovada, converse com a gente.`;
  const a4 = `Procedimento a ser realizado: ${f.procedimento || ""}\nData e hora: ${dataBR(f.data)} ${f.hora || "06:00"}\nNome completo da paciente: ${f.nome || ""}\nData de nascimento:\nCPF:\nTelefone:\nE-mail:\nValor do CC descrito no orçamento: R$`;
  const a5 = `Procedimento a ser realizado: ${f.procedimento || ""}\nData e hora: ${dataBR(f.data)} ${f.hora || "06:00"}\nDuração prevista (2h ou 3h):\nNome completo da paciente: ${f.nome || ""}\nData de nascimento:\nCPF:\nTelefone:\nLocal da cirurgia: Avant Moema Day Hospital`;

  const inputStyle = { borderColor: c.line, background: c.white, color: c.meianoite, fontFamily: F.sans };

  return (
    <div className="min-h-screen w-full" style={{ background: c.marfim, fontFamily: F.sans }}>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* Cabeçalho — território Camada (operação) */}
        <header className="mb-6">
          <div className="flex items-center gap-2">
            <Estratos size={20} />
            <span style={{ fontFamily: F.exp, fontSize: 13, letterSpacing: "0.2em", fontWeight: 700, color: c.meianoite }}>CAMADA</span>
            <span style={{ color: c.line }}>|</span>
            <span style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: "0.04em", color: c.brisa }}>OPERAÇÃO KCL · DRA. KARLA</span>
          </div>
          <h1 className="mt-3" style={{ fontFamily: F.serif, fontSize: 30, fontWeight: 400, color: c.meianoite }}>O que a Thalita envia</h1>
          <p className="mt-1 max-w-xl" style={{ fontFamily: F.sans, fontSize: 14, color: c.marinho }}>
            Preencha o caso uma vez. De até <span style={{ fontFamily: F.mono, color: c.champanheTxt }}>8 envios soltos</span> para <span style={{ color: c.meianoite, fontWeight: 600 }}>1 mensagem + 1 página</span> para a paciente.
          </p>
        </header>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Console */}
          <div className="space-y-4">
            <div className="rounded-2xl border p-4" style={{ borderColor: c.line, background: c.white }}>
              <div className="mb-3 font-semibold" style={{ color: c.meianoite, fontFamily: F.sans, fontSize: 14 }}>Dados do caso</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Nome da paciente">
                  <input value={f.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: Marina Souza"
                    className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700" style={inputStyle} />
                </Field>
                <Field label="Procedimento">
                  <input value={f.procedimento} onChange={(e) => set("procedimento", e.target.value)}
                    className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700" style={inputStyle} />
                </Field>
                <Field label="Data da cirurgia">
                  <input type="date" value={f.data} onChange={(e) => set("data", e.target.value)}
                    className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700" style={inputStyle} />
                </Field>
                <Field label="Horário">
                  <input type="time" value={f.hora} onChange={(e) => set("hora", e.target.value)}
                    className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700" style={inputStyle} />
                </Field>
                <Field label="Valor do sinal (R$)">
                  <input value={f.sinal} onChange={(e) => set("sinal", e.target.value)} placeholder="Ex.: 2.000"
                    className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700" style={inputStyle} />
                </Field>
                <Field label="Laser CO₂ no dia?">
                  <button onClick={() => set("laser", !f.laser)}
                    className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700" style={inputStyle}>
                    <span style={{ color: f.laser ? c.meianoite : c.brisa }}>{f.laser ? "Sim — incluir receita pré-laser" : "Não"}</span>
                    <span className="relative inline-block h-5 w-9 rounded-full transition-colors" style={{ background: f.laser ? c.champanhe : c.line }}>
                      <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all" style={{ left: f.laser ? 18 : 2 }} />
                    </span>
                  </button>
                </Field>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border" style={{ borderColor: c.line, background: c.white }}>
              <div style={{ height: 2, background: c.champanhe }} />
              <div className="p-4">
                <div className="mb-1 flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full" style={{ background: c.meianoite, color: c.marfim }}><MessageCircle size={14} /></span>
                  <div className="font-semibold" style={{ color: c.meianoite, fontFamily: F.sans, fontSize: 14 }}>Mensagem para a paciente</div>
                </div>
                <p className="mb-3" style={{ color: c.brisa, fontFamily: F.sans, fontSize: 12 }}>Uma mensagem, um link. A página entrega o resto.</p>
                <div className="rounded-xl p-3" style={{ background: c.marfim, border: `1px solid ${c.lineSoft}` }}>
                  <p className="whitespace-pre-line leading-relaxed" style={{ color: c.marinho, fontFamily: F.sans, fontSize: 13 }}>{msg}</p>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="truncate" style={{ color: c.champanheTxt, fontFamily: F.mono, fontSize: 11.5 }}>{link}</span>
                  <CopyButton text={msg} label="Copiar mensagem" />
                </div>
              </div>
            </div>

            <Section id="fallback" icon={ClipboardList} title="Sequência manual (fallback)"
              hint="A6 → NF → A7 → PDFs → A8 · ordem obrigatória" open={open.fallback} onToggle={toggle}>
              <div className="space-y-2.5">
                <Step n="1"><MsgBlock tag="A6 · CONFIRMAÇÃO DE RESERVA" text={a6} /></Step>
                <Step n="2">
                  <div className="flex items-center gap-2 rounded-xl border px-3 py-2.5" style={{ borderColor: c.lineSoft, color: c.marinho, background: c.marfim, fontFamily: F.sans, fontSize: 12 }}>
                    <FileText size={14} style={{ color: c.champanheTxt }} /> Anexar o&nbsp;<b style={{ color: c.meianoite }}>PDF da NF</b>
                  </div>
                </Step>
                <Step n="3"><MsgBlock tag="A7 · PRÉ-OPERATÓRIO" text={a7} /></Step>
                <Step n="4">
                  <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: c.lineSoft, background: c.marfim }}>
                    <div className="mb-1.5 font-medium" style={{ color: c.meianoite, fontFamily: F.sans, fontSize: 12 }}>Anexar PDFs do Medx</div>
                    {[["Pedido de exames pré-op", true],["Suspensão de medicamentos", true],["Receita pós-operatória", true],["Receita pré-laser CO₂", f.laser]]
                      .filter(([, on]) => on).map(([t], i) => (
                        <div key={i} className="flex items-center gap-2 py-0.5" style={{ color: c.marinho, fontFamily: F.sans, fontSize: 12 }}><Check size={13} style={{ color: c.champanheTxt }} /> {t}</div>
                      ))}
                  </div>
                </Step>
                <Step n="5"><MsgBlock tag="A8 · POLÍTICA DE REMARCAÇÃO" text={a8} /></Step>
              </div>
            </Section>

            <Section id="ops" icon={Phone} title="Envios operacionais" hint="Centro cirúrgico (A4) e anestesia (A5)" open={open.ops} onToggle={toggle}>
              <div className="mb-2.5 flex items-start gap-2 rounded-xl px-3 py-2.5" style={{ background: c.marfim, color: c.champanheTxt, fontFamily: F.sans, fontSize: 12 }}>
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>Antes de qualquer envio, confirme a disponibilidade com a <b>Alana</b> (11 94215-3780). Horário fora do padrão → também com a Bruna.</span>
              </div>
              <div className="space-y-2.5">
                <MsgBlock tag="A4 · CENTRO CIRÚRGICO (ALANA)" text={a4} />
                <MsgBlock tag="A5 · ANESTESIA (ZENICARE)" text={a5} />
              </div>
            </Section>
          </div>

          {/* Prévia do paciente */}
          <div className="lg:sticky lg:top-6">
            <div className="mb-2 flex items-center gap-2" style={{ color: c.brisa, fontFamily: F.exp, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>
              O que a paciente recebe
            </div>
            <div className="mx-auto" style={{ maxWidth: 380 }}>
              <div className="mx-auto p-2.5 shadow-xl" style={{ background: c.meianoite, borderRadius: 44 }}>
                <div className="relative overflow-hidden" style={{ background: c.linho, borderRadius: 34, height: 720 }}>
                  <div className="absolute left-1/2 top-2 z-20 h-1.5 w-20 -translate-x-1/2 rounded-full" style={{ background: "rgba(244,241,232,0.45)" }} />
                  <div className="h-full overflow-y-auto"><PatientPage f={f} /></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
