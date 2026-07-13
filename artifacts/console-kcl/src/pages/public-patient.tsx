import { useEffect, useState, useCallback, useRef } from "react";
import {
  useObterPaginaPaciente,
  getObterPaginaPacienteQueryKey,
  isConnectivityError,
  useSalvarPreparoPaciente,
  useConfirmarLeituraPaciente,
} from "@workspace/api-client-react";
import coverPhoto from "@assets/image_1782503830851.webp";
import { ConnectionErrorPublic } from "@/components/connection-error";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  CalendarPlus,
  Download,
  Clock,
  Eye,
  MessageCircle,
  FileSignature,
  Sun,
  Moon,
  Check,
} from "lucide-react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { motion } from "framer-motion";
import { reveal, stagger, secaoMotion, SectionHeading, SecoesPublicas, Tracado } from "@/components/secoes-publicas";
import { SurgeryFactsGrid, LogoClinicaLockup, MedicaIdentidade } from "@/components/patient-page-sections";
import { formatarReais } from "@workspace/secoes";
import {
  etapaAtual,
  contagemRegressiva,
  linkMapa,
  linkWhatsApp,
  ehTelefone,
  baixarICS,
  baixarResumoPDF,
  registrarEventoPaciente,
} from "@/lib/patient-tools";
import { usePatientTheme, type PatientTheme } from "@/lib/use-patient-theme";
import { PosOpPublico } from "@/components/posop-publico";

/**
 * Discreet claro/escuro toggle for the public patient page. Editorial styling —
 * a thin champagne hairline with a sun/moon glyph, no Camada-styled control.
 */
function PatientThemeToggle({ theme, toggle }: { theme: PatientTheme; toggle: () => void }) {
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      className="fixed top-5 right-5 z-50 inline-flex items-center gap-2 border border-[var(--pp-accent)]/30 hover:border-[var(--pp-accent)]/70 bg-[var(--pp-surface)]/80 backdrop-blur-sm px-3 py-2 transition-colors"
    >
      {isDark ? (
        <Sun className="w-3.5 h-3.5 text-[var(--pp-accent)] stroke-[1.5]" />
      ) : (
        <Moon className="w-3.5 h-3.5 text-[var(--pp-accent)] stroke-[1.5]" />
      )}
      <span className="font-expanded text-[9px] tracking-widest uppercase text-[var(--pp-text)]">
        {isDark ? "Claro" : "Escuro"}
      </span>
    </button>
  );
}

/**
 * Estratos — the Camada masterbrand mark. Three left-aligned strata, top third
 * in champagne (= the doctor), per the brand rule. Used only as a discreet
 * footer signature; uses currentColor so it follows the footer slab register.
 */
function Estratos() {
  return (
    <svg width="38" height="29" viewBox="0 0 40 30" aria-hidden="true" className="shrink-0">
      <rect x="0" y="0" width="16" height="6.4" fill="var(--pp-accent)" />
      <rect x="0" y="11.6" width="27" height="6.4" fill="currentColor" />
      <rect x="0" y="23.2" width="39" height="6.4" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

function AcaoButton({
  icon: Icon,
  label,
  onClick,
  href,
}: {
  icon: typeof CalendarPlus;
  label: string;
  onClick?: () => void;
  href?: string;
}) {
  const className =
    "group flex items-center justify-center gap-3 bg-[var(--pp-surface)] border border-[var(--pp-accent)]/25 hover:border-[var(--pp-accent)]/70 transition-colors px-6 py-4 w-full";
  const inner = (
    <>
      <Icon className="w-4 h-4 text-[var(--pp-accent)] stroke-[1.5] shrink-0" />
      <span className="font-expanded text-[10px] tracking-widest uppercase text-[var(--pp-text)]">{label}</span>
    </>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={onClick}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}

function formatarTamanhoDoc(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Footer doctor logo — renders the signed logo image when present; falls back
 * to the Estratos mark.
 */
function FooterLogo({ medicoLogoUrl }: { medicoLogoUrl?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (medicoLogoUrl && !failed) {
    return (
      <img
        src={medicoLogoUrl}
        alt=""
        aria-hidden="true"
        className="h-8 w-auto object-contain shrink-0 opacity-80"
        onError={() => setFailed(true)}
      />
    );
  }
  return <Estratos />;
}

/** Champagne accent hairline flush top-left, overlaying the section border-t. */
function SectionHairline() {
  return <div className="absolute top-0 left-0 w-10 h-px bg-[var(--pp-accent)]" aria-hidden="true" />;
}

export default function PublicPatient({ params }: { params: { token: string } }) {
  const token = params.token;

  const { data, isLoading, isError, error, refetch, isRefetching } = useObterPaginaPaciente(token, {
    query: { enabled: !!token, queryKey: getObterPaginaPacienteQueryKey(token) },
  });

  const { theme, toggle: toggleTema } = usePatientTheme(
    token,
    data?.tema ?? null,
    data?.temaPadrao ?? "light",
  );
  const temaClasse = `paciente${theme === "dark" ? " paciente-dark" : ""}`;

  // Paint the document background to match the active patient theme so overscroll
  // / rubber-band areas never flash the global (Console) background.
  useEffect(() => {
    const el = document.documentElement;
    const anterior = el.style.backgroundColor;
    el.style.backgroundColor = theme === "dark" ? "#1C1714" : "#EDE5D3";
    return () => {
      el.style.backgroundColor = anterior;
    };
  }, [theme]);

  const storageKey = `kcl-preparo-${token}`;
  const [feito, setFeito] = useState<Record<string, boolean>>({});
  const { mutate: salvarPreparo } = useSalvarPreparoPaciente();
  const { mutate: confirmarLeituraServidor } = useConfirmarLeituraPaciente();
  // O servidor é a fonte da verdade do checklist/confirmação; hidratamos uma vez
  // quando o payload chega (sobrevive à troca de aparelho). O localStorage segue
  // como caminho rápido/offline.
  const preparoHidratado = useRef(false);
  const leituraHidratada = useRef(false);
  const [leituraConfirmada, setLeituraConfirmada] = useState(false);
  const [contratoBaixando, setContratoBaixando] = useState<null | "abrir" | "baixar">(null);
  const [contratoErro, setContratoErro] = useState(false);
  const [termoBaixando, setTermoBaixando] = useState<null | "abrir" | "baixar">(null);
  const [termoErro, setTermoErro] = useState(false);
  const [documentoAcao, setDocumentoAcao] = useState<string | null>(null);
  const [documentoErro, setDocumentoErro] = useState(false);
  const [pedidoExamesAcao, setPedidoExamesAcao] = useState<null | "abrir" | "baixar">(null);
  const [receitaAcao, setReceitaAcao] = useState<null | "abrir" | "baixar">(null);
  const [receituarioAcao, setReceituarioAcao] = useState<null | "abrir" | "baixar">(null);
  const [listaMedicamentosBaixando, setListaMedicamentosBaixando] = useState(false);
  const aberturaRegistrada = useRef(false);

  // Registra a abertura do link automaticamente (uma vez por montagem).
  useEffect(() => {
    if (!token || aberturaRegistrada.current) return;
    aberturaRegistrada.current = true;
    registrarEventoPaciente(token, "abertura");
  }, [token]);

  async function acessarContrato(modo: "abrir" | "baixar") {
    setContratoErro(false);
    setContratoBaixando(modo);
    const janela = modo === "abrir" ? window.open("", "_blank") : null;
    try {
      const url = `/api/publico/${token}/contrato/download${modo === "baixar" ? "?download=1" : ""}`;
      const resp = await fetch(url, { headers: { accept: "application/pdf" } });
      if (!resp.ok) {
        janela?.close();
        setContratoErro(true);
        return;
      }
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      if (modo === "abrir") {
        if (janela) janela.location.href = blobUrl;
        else window.open(blobUrl, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = "contrato-assinado.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch {
      janela?.close();
      setContratoErro(true);
    } finally {
      setContratoBaixando(null);
    }
  }

  async function acessarTermo(modo: "abrir" | "baixar") {
    setTermoErro(false);
    setTermoBaixando(modo);
    const janela = modo === "abrir" ? window.open("", "_blank") : null;
    try {
      const url = `/api/publico/${token}/termo/download${modo === "baixar" ? "?download=1" : ""}`;
      const resp = await fetch(url, { headers: { accept: "application/pdf" } });
      if (!resp.ok) {
        janela?.close();
        setTermoErro(true);
        return;
      }
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      if (modo === "abrir") {
        if (janela) janela.location.href = blobUrl;
        else window.open(blobUrl, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = "termo-consentimento-assinado.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch {
      janela?.close();
      setTermoErro(true);
    } finally {
      setTermoBaixando(null);
    }
  }

  async function acessarDocumento(
    docToken: string,
    nomeArquivo: string,
    modo: "abrir" | "baixar",
  ) {
    setDocumentoErro(false);
    setDocumentoAcao(`${docToken}:${modo}`);
    const janela = modo === "abrir" ? window.open("", "_blank") : null;
    try {
      const url = `/api/publico/${token}/documentos/${docToken}/download${modo === "baixar" ? "?download=1" : ""}`;
      const resp = await fetch(url, { headers: { accept: "application/pdf" } });
      if (!resp.ok) {
        janela?.close();
        setDocumentoErro(true);
        return;
      }
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      if (modo === "abrir") {
        if (janela) janela.location.href = blobUrl;
        else window.open(blobUrl, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch {
      janela?.close();
      setDocumentoErro(true);
    } finally {
      setDocumentoAcao(null);
    }
  }

  async function acessarPedidoExames(
    pedidoToken: string,
    nomeArquivo: string,
    modo: "abrir" | "baixar",
  ) {
    setPedidoExamesAcao(modo);
    const janela = modo === "abrir" ? window.open("", "_blank") : null;
    try {
      const url = `/api/publico/${token}/pedido-exames/${pedidoToken}/download${modo === "baixar" ? "?download=1" : ""}`;
      const resp = await fetch(url, { headers: { accept: "application/pdf" } });
      if (!resp.ok) {
        janela?.close();
        return;
      }
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      if (modo === "abrir") {
        if (janela) janela.location.href = blobUrl;
        else window.open(blobUrl, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch {
      janela?.close();
    } finally {
      setPedidoExamesAcao(null);
    }
  }

  async function acessarReceita(
    receitaToken: string,
    nomeArquivo: string,
    modo: "abrir" | "baixar",
  ) {
    setReceitaAcao(modo);
    const janela = modo === "abrir" ? window.open("", "_blank") : null;
    try {
      const url = `/api/publico/${token}/receita-preparo-pele/${receitaToken}/download${modo === "baixar" ? "?download=1" : ""}`;
      const resp = await fetch(url, { headers: { accept: "application/pdf" } });
      if (!resp.ok) {
        janela?.close();
        return;
      }
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      if (modo === "abrir") {
        if (janela) janela.location.href = blobUrl;
        else window.open(blobUrl, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch {
      janela?.close();
    } finally {
      setReceitaAcao(null);
    }
  }

  async function acessarReceituario(
    receituarioToken: string,
    nomeArquivo: string,
    modo: "abrir" | "baixar",
  ) {
    setReceituarioAcao(modo);
    const janela = modo === "abrir" ? window.open("", "_blank") : null;
    try {
      const url = `/api/publico/${token}/receituario-posop/${receituarioToken}/download${modo === "baixar" ? "?download=1" : ""}`;
      const resp = await fetch(url, { headers: { accept: "application/pdf" } });
      if (!resp.ok) {
        janela?.close();
        return;
      }
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      if (modo === "abrir") {
        if (janela) janela.location.href = blobUrl;
        else window.open(blobUrl, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch {
      janela?.close();
    } finally {
      setReceituarioAcao(null);
    }
  }

  async function baixarListaMedicamentos(arquivoToken: string, nomeArquivo: string) {
    setListaMedicamentosBaixando(true);
    try {
      const url = `/api/publico/${token}/lista-medicamentos/${arquivoToken}/download?download=1`;
      const resp = await fetch(url, { headers: { accept: "application/pdf" } });
      if (!resp.ok) return;
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = nomeArquivo;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch {
      // Silencioso: a página não deve quebrar por falha de download.
    } finally {
      setListaMedicamentosBaixando(false);
    }
  }

  // Caminho rápido/offline: aplica o valor local enquanto o payload não chega.
  // Reinicia os flags de hidratação a cada troca de token.
  useEffect(() => {
    preparoHidratado.current = false;
    leituraHidratada.current = false;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setFeito(JSON.parse(raw));
      else setFeito({});
    } catch {
      setFeito({});
    }
  }, [storageKey]);

  // Fonte da verdade: quando o payload chega, mescla o que o servidor tem com o
  // que estava marcado localmente (nada se perde na primeira migração) e espelha
  // no localStorage. Roda uma única vez por token.
  useEffect(() => {
    if (preparoHidratado.current || !data) return;
    preparoHidratado.current = true;
    setFeito((local) => {
      const servidor = data.preparoConcluido ?? {};
      const merged = { ...local, ...servidor };
      try {
        localStorage.setItem(storageKey, JSON.stringify(merged));
      } catch {
        /* ignore quota/availability errors */
      }
      return merged;
    });
  }, [data, storageKey]);

  // Confirmação de leitura: reflete o que o servidor devolveu, uma vez.
  useEffect(() => {
    if (leituraHidratada.current || !data) return;
    leituraHidratada.current = true;
    setLeituraConfirmada(!!data.leituraConfirmadaEm);
  }, [data]);

  const toggle = useCallback(
    (key: string) => {
      const marcando = !feito[key];
      setFeito((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* ignore quota/availability errors */
        }
        // Persiste o mapa inteiro no servidor (best-effort). Assim a done-list
        // sobrevive à troca de aparelho e a aberturas semanas depois.
        if (token) salvarPreparo({ token, data: { preparo: next } });
        return next;
      });
      // Registra apenas quando a paciente MARCA um item (não ao desmarcar).
      if (marcando && token) {
        if (key.startsWith("prep:")) {
          registrarEventoPaciente(token, "preparo", key.slice(5));
        } else if (key.startsWith("doc:")) {
          registrarEventoPaciente(token, "documento", key.slice(4));
        }
      }
    },
    [feito, storageKey, token, salvarPreparo],
  );

  const alternarLeitura = useCallback(() => {
    setLeituraConfirmada((prev) => {
      const next = !prev;
      if (token) confirmarLeituraServidor({ token, data: { confirmado: next } });
      return next;
    });
  }, [token, confirmarLeituraServidor]);

  if (isError) {
    if (isConnectivityError(error)) {
      return (
        <div className={temaClasse}>
          <PatientThemeToggle theme={theme} toggle={toggleTema} />
          <ConnectionErrorPublic onRetry={() => refetch()} isRetrying={isRefetching} />
        </div>
      );
    }
    return (
      <div className={`${temaClasse} min-h-[100dvh] bg-[var(--pp-bg)] text-[var(--pp-text)] flex flex-col items-center justify-center p-6 font-sans selection:bg-[var(--pp-accent)]/20`}>
        <PatientThemeToggle theme={theme} toggle={toggleTema} />
        <h1 className="font-serif text-3xl mb-4 text-[var(--pp-accent)] italic">Página indisponível</h1>
        <p className="text-center opacity-70 max-w-md font-light leading-relaxed">
          Este link expirou ou é inválido. Por favor, entre em contato com a clínica para solicitar um novo acesso.
        </p>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className={`${temaClasse} min-h-[100dvh] bg-[var(--pp-bg)] text-[var(--pp-text)]`}>
        <PatientThemeToggle theme={theme} toggle={toggleTema} />
        <div className="pp-slab pt-20 pb-12 px-6">
          <div className="max-w-2xl mx-auto space-y-6">
            <Skeleton className="h-6 w-24 bg-[var(--pp-on-strong)]/10 rounded-none" />
            <Skeleton className="h-20 w-40 bg-[var(--pp-on-strong)]/10 rounded-none" />
          </div>
        </div>
        <main className="max-w-2xl mx-auto px-6 pt-12 space-y-8">
          <Skeleton className="h-28 w-full bg-[var(--pp-accent)]/10 rounded-none" />
          <Skeleton className="h-48 w-full bg-[var(--pp-accent)]/10 rounded-none" />
        </main>
      </div>
    );
  }

  const dataObj = parseISO(data.dataCirurgia);
  const dataFmt = format(dataObj, "dd/MM/yyyy");
  const dias = differenceInCalendarDays(dataObj, new Date());
  const contagem = contagemRegressiva(dias);
  const passoAtual = etapaAtual(dias);
  const { pagamento } = data;

  // Estado do contrato e dos honorários — refletem o payload, nunca inventam.
  const contratoAssinado = data.contratoStatus === "assinado";
  const contratoAcaoPendente = data.contratoStatus === "pendente";

  // Estado do termo de consentimento.
  const termoAssinado = data.termoStatus === "assinado";
  const termoAcaoPendente = data.termoStatus === "pendente";

  // Link real de assinatura (quando a clínica tem um para esta paciente) e o
  // prazo combinado — só fazem sentido enquanto o contrato está pendente.
  const assinaturaHref = data.contratoLinkAssinatura;
  // O backend só devolve o link quando ainda faz sentido assinar (status nem
  // assinado nem recusado), inclusive para link manual sem documento na
  // Autentique. Por isso a CTA aparece sempre que há link, não só no "pendente".
  const contratoAcaoNecessaria = contratoAcaoPendente || Boolean(assinaturaHref);
  const prazoTexto = (() => {
    if (!contratoAcaoNecessaria || !data.contratoPrazo) return null;
    const prazo = parseISO(data.contratoPrazo);
    const diasPrazo = differenceInCalendarDays(prazo, new Date());
    const prazoFmt = format(prazo, "dd/MM/yyyy");
    if (diasPrazo < 0) return `O prazo de assinatura venceu em ${prazoFmt} — fale com a equipe.`;
    if (diasPrazo === 0) return `O prazo de assinatura é hoje (${prazoFmt}).`;
    if (diasPrazo === 1) return `Assine até amanhã (${prazoFmt}).`;
    return `Assine até ${prazoFmt} — faltam ${diasPrazo} dias.`;
  })();

  // Termo de consentimento.
  const termoAssinaturaHref = data.termoLinkAssinatura;
  const termoAcaoNecessaria = termoAcaoPendente || Boolean(termoAssinaturaHref);
  const termoPrazoTexto = (() => {
    if (!termoAcaoNecessaria || !data.termoPrazo) return null;
    const prazo = parseISO(data.termoPrazo);
    const diasPrazo = differenceInCalendarDays(prazo, new Date());
    const prazoFmt = format(prazo, "dd/MM/yyyy");
    if (diasPrazo < 0) return `O prazo de assinatura venceu em ${prazoFmt} — fale com a equipe.`;
    if (diasPrazo === 0) return `O prazo de assinatura é hoje (${prazoFmt}).`;
    if (diasPrazo === 1) return `Assine até amanhã (${prazoFmt}).`;
    return `Assine até ${prazoFmt} — faltam ${diasPrazo} dias.`;
  })();

  // Conteúdo editável: o principal (preparo, timeline, documentos-checklist,
  // textos) entra no bloco "Preparo"; o secundário (equipes & taxas, política)
  // vai para o acordeão colapsado no fim. Sem campo novo no modelo.
  const secoesSecundarias = data.secoes.filter(
    (s) => s.tipo === "contatos" || s.tipo === "politica",
  );
  const secoesPrincipais = data.secoes.filter(
    (s) => s.tipo !== "contatos" && s.tipo !== "politica",
  );

  // WhatsApp da equipe — vem de uma seção `contatos` preenchida no Console.
  // TODO: não existe link de assinatura no modelo; a CTA da ação pendente aponta
  // para o WhatsApp da equipe. Some quando a clínica não cadastrou contato.
  const contatosSecao = data.secoes.find((s) => s.tipo === "contatos");
  const contatoWhats =
    contatosSecao?.contatos?.find((c) => ehTelefone(c.valor) && /whats/i.test(c.rotulo)) ??
    contatosSecao?.contatos?.find((c) => ehTelefone(c.valor));
  const whatsHref = contatoWhats
    ? linkWhatsApp(contatoWhats.valor, data.primeiroNome, dataFmt, data.horario)
    : null;

  const temDocumentos = data.documentos.length > 0 || contratoAssinado || termoAssinado;

  return (
    <div className={`${temaClasse} min-h-[100dvh] bg-[var(--pp-bg)] text-[var(--pp-text)] font-sans selection:bg-[var(--pp-accent)]/20`}>
      <PatientThemeToggle theme={theme} toggle={toggleTema} />

      {/* ============ CAPA ============ */}
      <header
        className="pp-slab pt-20 pb-14 px-6"
        style={{
          backgroundImage: `linear-gradient(rgba(10,23,41,.80),rgba(10,23,41,.93)),url(${coverPhoto})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="max-w-2xl mx-auto">
          <div className="flex items-start justify-between gap-4">
            <LogoClinicaLockup
              variant="page"
              clinica={data.clinica}
              medicoLogoUrl={data.medicoLogoUrl}
            />
            <Tracado />
          </div>

          <motion.div variants={stagger} initial="hidden" animate="show" className="mt-14">
            <motion.p
              variants={reveal}
              className="font-expanded text-[10px] tracking-[0.22em] uppercase opacity-70"
            >
              Olá, {data.primeiroNome}
              {dias > 1 ? " — faltam" : ""}
            </motion.p>
            <motion.div
              variants={reveal}
              className="flex items-baseline gap-4 mt-2 pb-3 border-b border-[var(--pp-accent)] w-max"
            >
              {dias > 1 ? (
                <>
                  <span className="font-mono font-medium leading-none text-[clamp(56px,15vw,92px)]">{dias}</span>
                  <span className="font-serif italic font-light text-[clamp(22px,5vw,32px)]">dias</span>
                </>
              ) : (
                <span className="font-serif italic font-light text-[clamp(28px,7vw,44px)]">{contagem}</span>
              )}
            </motion.div>
            <motion.p variants={reveal} className="font-mono text-sm mt-4 opacity-70">
              para a sua cirurgia · {dataFmt} · {data.horario}
            </motion.p>
          </motion.div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6">
        {/* ============ MÉDICA ============ */}
        <motion.section {...secaoMotion} className="relative flex items-center gap-5 py-10 border-b border-[var(--pp-accent)]/15">
          <SectionHairline />
          <MedicaIdentidade
            variant="page"
            medica={data.medica}
            crm={data.crm}
            rqe={data.rqe}
            medicoFotoUrl={data.medicoFotoUrl}
          />
        </motion.section>

        {/* ============ AÇÕES PENDENTES ============ */}
        {/* Só os CTAs de assinatura (contrato/termo). O antigo resumo "Agora"/"Tudo
            certo", a lista de confirmações e o botão "Falar com a equipe" foram
            removidos; o saldo pendente agora aparece abaixo de "Sua Cirurgia". A
            seção só renderiza quando há assinatura pendente — senão a página começa
            direto em "Sua Cirurgia". */}
        {(contratoAcaoNecessaria || termoAcaoNecessaria) && (
          <motion.section {...secaoMotion} className="relative py-12 space-y-8">
            <SectionHairline />
            {contratoAcaoNecessaria && (
              <div className="pp-slab p-8 space-y-3 relative overflow-hidden">
                <p className="font-expanded text-[9px] tracking-widest uppercase text-[var(--pp-accent)]">
                  Falta você fazer
                </p>
                <h4 className="font-serif text-2xl">Assinar o contrato</h4>
                <p className="font-mono text-xs opacity-70 leading-relaxed">
                  {assinaturaHref
                    ? "Abra o documento e assine pelo celular — leva poucos minutos."
                    : "A equipe envia o link de assinatura pelo WhatsApp. Leva poucos minutos pelo celular."}
                </p>
                {prazoTexto && (
                  <p className="flex items-center gap-2 font-mono text-xs text-[var(--pp-accent)]">
                    <Clock className="w-3.5 h-3.5 stroke-[1.5] shrink-0" />
                    {prazoTexto}
                  </p>
                )}
                <div className="flex flex-wrap gap-3 pt-1">
                  {assinaturaHref && (
                    <a
                      href={assinaturaHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 bg-[var(--pp-on-strong)] text-[var(--pp-strong)] hover:opacity-90 transition-opacity px-6 py-3 font-expanded text-[10px] tracking-widest uppercase"
                    >
                      <FileSignature className="w-4 h-4 stroke-[1.5]" />
                      Assinar o contrato
                    </a>
                  )}
                  {whatsHref && (
                    <a
                      href={whatsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => registrarEventoPaciente(token, "whatsapp", "assinatura")}
                      className={
                        assinaturaHref
                          ? "inline-flex items-center gap-2 border border-[var(--pp-accent)]/40 hover:border-[var(--pp-accent)]/70 transition-colors px-6 py-3 font-expanded text-[10px] tracking-widest uppercase"
                          : "inline-flex items-center gap-2 bg-[var(--pp-on-strong)] text-[var(--pp-strong)] hover:opacity-90 transition-opacity px-6 py-3 font-expanded text-[10px] tracking-widest uppercase"
                      }
                    >
                      <MessageCircle className="w-4 h-4 stroke-[1.5]" />
                      Falar com a equipe
                    </a>
                  )}
                </div>
              </div>
            )}

            {termoAcaoNecessaria && (
              <div className="pp-slab p-8 space-y-3 relative overflow-hidden">
                <p className="font-expanded text-[9px] tracking-widest uppercase text-[var(--pp-accent)]">
                  Falta você fazer
                </p>
                <h4 className="font-serif text-2xl">Assinar o termo de consentimento</h4>
                <p className="font-mono text-xs opacity-70 leading-relaxed">
                  {termoAssinaturaHref
                    ? "Abra o documento e assine pelo celular — leva poucos minutos."
                    : "A equipe envia o link de assinatura pelo WhatsApp. Leva poucos minutos pelo celular."}
                </p>
                {termoPrazoTexto && (
                  <p className="flex items-center gap-2 font-mono text-xs text-[var(--pp-accent)]">
                    <Clock className="w-3.5 h-3.5 stroke-[1.5] shrink-0" />
                    {termoPrazoTexto}
                  </p>
                )}
                <div className="flex flex-wrap gap-3 pt-1">
                  {termoAssinaturaHref && (
                    <a
                      href={termoAssinaturaHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 bg-[var(--pp-on-strong)] text-[var(--pp-strong)] hover:opacity-90 transition-opacity px-6 py-3 font-expanded text-[10px] tracking-widest uppercase"
                    >
                      <FileSignature className="w-4 h-4 stroke-[1.5]" />
                      Assinar o TCLE
                    </a>
                  )}
                  {whatsHref && (
                    <a
                      href={whatsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => registrarEventoPaciente(token, "whatsapp", "assinatura-tcle")}
                      className={
                        termoAssinaturaHref
                          ? "inline-flex items-center gap-2 border border-[var(--pp-accent)]/40 hover:border-[var(--pp-accent)]/70 transition-colors px-6 py-3 font-expanded text-[10px] tracking-widest uppercase"
                          : "inline-flex items-center gap-2 bg-[var(--pp-on-strong)] text-[var(--pp-strong)] hover:opacity-90 transition-opacity px-6 py-3 font-expanded text-[10px] tracking-widest uppercase"
                      }
                    >
                      <MessageCircle className="w-4 h-4 stroke-[1.5]" />
                      Falar com a equipe
                    </a>
                  )}
                </div>
              </div>
            )}
          </motion.section>
        )}

        {/* ============ SUA CIRURGIA ============ */}
        {/* Só usa border-t quando há bloco de ações pendentes acima; sem ele, a
            borda-inferior da seção da médica já serve de separador (evita a linha
            dupla quando a página começa aqui). */}
        <motion.section
          {...secaoMotion}
          className={`relative py-12 space-y-8${
            contratoAcaoNecessaria || termoAcaoNecessaria
              ? " border-t border-[var(--pp-accent)]/20"
              : ""
          }`}
        >
          <SectionHairline />
          {/* "Sua cirurgia" (título + grid de fatos) — marcação compartilhada
              com a prévia em components/patient-page-sections.tsx. */}
          <SurgeryFactsGrid
            variant="page"
            procedimentos={data.procedimentos}
            dataFmt={dataFmt}
            horario={data.horario}
            localNome={data.local}
            mapaHref={linkMapa(data.local, data.enderecoLocal)}
            onMapa={() => registrarEventoPaciente(token, "mapa")}
            anestesia={data.equipeAnestesia}
          />

          {/* Saldo pendente dos honorários — informado logo abaixo dos fatos da
              cirurgia. Só aparece quando ainda há valor a pagar. */}
          {!pagamento.quitado && (
            <p className="font-light leading-relaxed text-[var(--pp-accent)]">
              Você ainda tem um saldo de{" "}
              <span className="font-mono">{formatarReais(pagamento.valorPendente)}</span> pendente.
            </p>
          )}

          {/* Praticidade — calendário e resumo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AcaoButton
              icon={CalendarPlus}
              label="Add ao calendário"
              onClick={() => {
                registrarEventoPaciente(token, "calendario");
                baixarICS(data);
              }}
            />
            <AcaoButton
              icon={Download}
              label="Baixar resumo"
              onClick={() => {
                registrarEventoPaciente(token, "resumo");
                baixarResumoPDF(data, dataFmt);
              }}
            />
          </div>
        </motion.section>

        {/* ============ PREPARO ============ */}
        {secoesPrincipais.length > 0 && (
          <section className="relative py-12 space-y-16 border-t border-[var(--pp-accent)]/20">
            <SectionHairline />
            <SecoesPublicas
              secoes={secoesPrincipais}
              passoAtual={passoAtual}
              feito={feito}
              toggle={toggle}
              primeiroNome={data.primeiroNome}
              dataFmt={dataFmt}
              horario={data.horario}
              onEvento={(tipo, rotulo) => registrarEventoPaciente(token, tipo, rotulo)}
              pedidoExames={data.pedidoExames}
              pedidoExamesAcao={pedidoExamesAcao}
              onAcessarPedidoExames={(modo) => {
                if (data.pedidoExames) {
                  void acessarPedidoExames(
                    data.pedidoExames.token,
                    data.pedidoExames.nomeArquivo,
                    modo,
                  );
                }
              }}
              receitaPreparoPele={data.receitaPreparoPele}
              receitaAcao={receitaAcao}
              onAcessarReceita={(modo) => {
                if (data.receitaPreparoPele) {
                  void acessarReceita(
                    data.receitaPreparoPele.token,
                    data.receitaPreparoPele.nomeArquivo,
                    modo,
                  );
                }
              }}
              receituarioPosop={data.receituarioPosop}
              receituarioAcao={receituarioAcao}
              onAcessarReceituario={(modo) => {
                if (data.receituarioPosop) {
                  void acessarReceituario(
                    data.receituarioPosop.token,
                    data.receituarioPosop.nomeArquivo,
                    modo,
                  );
                }
              }}
              listaMedicamentosBaixando={listaMedicamentosBaixando}
              onBaixarListaMedicamentos={(arquivoToken) => {
                const secao = secoesPrincipais.find(
                  (s) => s.tipo === "suspensao_medicamentos",
                );
                void baixarListaMedicamentos(
                  arquivoToken,
                  secao?.arquivo?.nomeArquivo ?? "lista-de-medicamentos.pdf",
                );
              }}
            />
          </section>
        )}

        {/* ============ DOCUMENTOS ============ */}
        {temDocumentos && (
          <motion.section {...secaoMotion} className="relative py-12 space-y-8 border-t border-[var(--pp-accent)]/20">
            <SectionHairline />
            <SectionHeading>Documentos e exames</SectionHeading>
            <div className="space-y-4">
              {contratoAssinado && (
                <div className="border border-[var(--pp-accent)]/20 p-6 md:p-7">
                  <div className="flex items-start gap-4 mb-4">
                    <FileText className="w-5 h-5 text-[var(--pp-accent)] shrink-0 mt-1 stroke-[1.5]" />
                    <div className="min-w-0">
                      <p className="font-medium leading-relaxed">Contrato de prestação de serviços</p>
                      <p className="font-mono text-[11px] opacity-50 mt-1">
                        PDF · assinado
                        {data.contratoAssinadoEm
                          ? ` em ${format(parseISO(data.contratoAssinadoEm), "dd/MM/yyyy")}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => acessarContrato("abrir")}
                      disabled={contratoBaixando !== null}
                      className="group flex items-center justify-center gap-3 bg-[var(--pp-surface)] border border-[var(--pp-accent)]/25 hover:border-[var(--pp-accent)]/70 transition-colors px-5 py-4 disabled:opacity-60"
                    >
                      <Eye className="w-4 h-4 text-[var(--pp-accent)] stroke-[1.5] shrink-0" />
                      <span className="font-expanded text-[10px] tracking-widest uppercase text-[var(--pp-text)]">
                        {contratoBaixando === "abrir" ? "Abrindo..." : "Ver"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => acessarContrato("baixar")}
                      disabled={contratoBaixando !== null}
                      className="group flex items-center justify-center gap-3 bg-[var(--pp-surface)] border border-[var(--pp-accent)]/25 hover:border-[var(--pp-accent)]/70 transition-colors px-5 py-4 disabled:opacity-60"
                    >
                      <Download className="w-4 h-4 text-[var(--pp-accent)] stroke-[1.5] shrink-0" />
                      <span className="font-expanded text-[10px] tracking-widest uppercase text-[var(--pp-text)]">
                        {contratoBaixando === "baixar" ? "Baixando..." : "Baixar"}
                      </span>
                    </button>
                  </div>
                  {contratoErro && (
                    <p className="font-light text-sm text-[var(--pp-accent)] leading-relaxed mt-4">
                      Contrato indisponível no momento. Por favor, tente novamente em instantes.
                    </p>
                  )}
                </div>
              )}

              {termoAssinado && (
                <div className="border border-[var(--pp-accent)]/20 p-6 md:p-7">
                  <div className="flex items-start gap-4 mb-4">
                    <FileText className="w-5 h-5 text-[var(--pp-accent)] shrink-0 mt-1 stroke-[1.5]" />
                    <div className="min-w-0">
                      <p className="font-medium leading-relaxed">Termo de consentimento (TCLE)</p>
                      <p className="font-mono text-[11px] opacity-50 mt-1">
                        PDF · assinado
                        {data.termoAssinadoEm
                          ? ` em ${format(parseISO(data.termoAssinadoEm), "dd/MM/yyyy")}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => acessarTermo("abrir")}
                      disabled={termoBaixando !== null}
                      className="group flex items-center justify-center gap-3 bg-[var(--pp-surface)] border border-[var(--pp-accent)]/25 hover:border-[var(--pp-accent)]/70 transition-colors px-5 py-4 disabled:opacity-60"
                    >
                      <Eye className="w-4 h-4 text-[var(--pp-accent)] stroke-[1.5] shrink-0" />
                      <span className="font-expanded text-[10px] tracking-widest uppercase text-[var(--pp-text)]">
                        {termoBaixando === "abrir" ? "Abrindo..." : "Ver"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => acessarTermo("baixar")}
                      disabled={termoBaixando !== null}
                      className="group flex items-center justify-center gap-3 bg-[var(--pp-surface)] border border-[var(--pp-accent)]/25 hover:border-[var(--pp-accent)]/70 transition-colors px-5 py-4 disabled:opacity-60"
                    >
                      <Download className="w-4 h-4 text-[var(--pp-accent)] stroke-[1.5] shrink-0" />
                      <span className="font-expanded text-[10px] tracking-widest uppercase text-[var(--pp-text)]">
                        {termoBaixando === "baixar" ? "Baixando..." : "Baixar"}
                      </span>
                    </button>
                  </div>
                  {termoErro && (
                    <p className="font-light text-sm text-[var(--pp-accent)] leading-relaxed mt-4">
                      Termo indisponível no momento. Por favor, tente novamente em instantes.
                    </p>
                  )}
                </div>
              )}

              {data.documentos.map((doc) => (
                <div key={doc.token} className="border border-[var(--pp-accent)]/20 p-6 md:p-7">
                  <div className="flex items-start gap-4 mb-4">
                    <FileText className="w-5 h-5 text-[var(--pp-accent)] shrink-0 mt-1 stroke-[1.5]" />
                    <div className="min-w-0">
                      <p className="font-medium leading-relaxed break-words">{doc.rotulo}</p>
                      <p className="font-mono text-[11px] opacity-50 mt-1">
                        PDF · {formatarTamanhoDoc(doc.tamanho)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => acessarDocumento(doc.token, doc.nomeArquivo, "abrir")}
                      disabled={documentoAcao !== null}
                      className="group flex items-center justify-center gap-3 bg-[var(--pp-surface)] border border-[var(--pp-accent)]/25 hover:border-[var(--pp-accent)]/70 transition-colors px-5 py-4 disabled:opacity-60"
                    >
                      <Eye className="w-4 h-4 text-[var(--pp-accent)] stroke-[1.5] shrink-0" />
                      <span className="font-expanded text-[10px] tracking-widest uppercase text-[var(--pp-text)]">
                        {documentoAcao === `${doc.token}:abrir` ? "Abrindo..." : "Ver"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => acessarDocumento(doc.token, doc.nomeArquivo, "baixar")}
                      disabled={documentoAcao !== null}
                      className="group flex items-center justify-center gap-3 bg-[var(--pp-surface)] border border-[var(--pp-accent)]/25 hover:border-[var(--pp-accent)]/70 transition-colors px-5 py-4 disabled:opacity-60"
                    >
                      <Download className="w-4 h-4 text-[var(--pp-accent)] stroke-[1.5] shrink-0" />
                      <span className="font-expanded text-[10px] tracking-widest uppercase text-[var(--pp-text)]">
                        {documentoAcao === `${doc.token}:baixar` ? "Baixando..." : "Baixar"}
                      </span>
                    </button>
                  </div>
                </div>
              ))}
              {documentoErro && (
                <p className="font-light text-sm text-[var(--pp-accent)] leading-relaxed">
                  Documento indisponível no momento. Por favor, tente novamente em instantes.
                </p>
              )}
            </div>
          </motion.section>
        )}

        {/* ============ DEPOIS ============ */}
        {/* A moldura (borda + hairline + espaçamento) vive dentro do PosOpPublico,
            que retorna null quando não há check-ins — sem deixar um bloco vazio. */}
        <PosOpPublico token={token} />

        {/* ============ SECUNDÁRIO (expandido, igual à prévia) ============ */}
        {secoesSecundarias.length > 0 && (
          <section className="relative py-12 space-y-16 border-t border-[var(--pp-accent)]/20">
            <SectionHairline />
            <SecoesPublicas
              secoes={secoesSecundarias}
              passoAtual={passoAtual}
              feito={feito}
              toggle={toggle}
              primeiroNome={data.primeiroNome}
              dataFmt={dataFmt}
              horario={data.horario}
              onEvento={(tipo, rotulo) => registrarEventoPaciente(token, tipo, rotulo)}
            />
          </section>
        )}

        {/* ============ CONFIRMAÇÃO DE LEITURA ============ */}
        <section className="relative py-12 border-t border-[var(--pp-accent)]/20">
          <button
            type="button"
            onClick={alternarLeitura}
            aria-pressed={leituraConfirmada}
            className="group flex items-start gap-4 w-full text-left"
          >
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border transition-colors ${
                leituraConfirmada
                  ? "bg-[var(--pp-strong)] border-[var(--pp-strong)]"
                  : "border-[var(--pp-accent)]/50 group-hover:border-[var(--pp-accent)]"
              }`}
            >
              {leituraConfirmada && (
                <Check className="h-4 w-4 text-[var(--pp-on-strong)]" strokeWidth={2.5} />
              )}
            </span>
            <span>
              <span className="block font-light leading-relaxed text-[var(--pp-text)]">
                Li e estou ciente de todas as informações desta página.
              </span>
              <span className="mt-1 block font-mono text-[11px] opacity-60">
                {leituraConfirmada
                  ? "Confirmado — obrigada! A equipe já consegue ver."
                  : "Toque para confirmar quando terminar de ler."}
              </span>
            </span>
          </button>
        </section>
      </main>

      {/* ============ RODAPÉ ============ */}
      <footer className="pp-slab mt-12 px-6 py-12">
        <div className="max-w-2xl mx-auto space-y-8">
          {whatsHref && (
            <a
              href={whatsHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => registrarEventoPaciente(token, "whatsapp", "rodape")}
              className="inline-flex items-center gap-2 font-mono text-sm border-b border-[var(--pp-accent)]/50 hover:border-[var(--pp-accent)] pb-0.5 transition-colors"
            >
              <MessageCircle className="w-4 h-4 text-[var(--pp-accent)] stroke-[1.5]" />
              Dúvidas sobre o preparo? Falar no WhatsApp
            </a>
          )}
          <div className="flex items-center justify-between gap-6 flex-wrap pt-8 border-t border-[var(--pp-accent)]/30">
            <div className="flex items-center gap-3">
              <FooterLogo medicoLogoUrl={data.medicoLogoUrl} />
              <div className="leading-tight">
                <span className="block font-expanded text-base tracking-[0.3em] uppercase">Camada</span>
                <span className="block font-mono text-[10px] opacity-60 mt-1">{data.clinica}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px] opacity-60">
              <Clock className="w-3.5 h-3.5 text-[var(--pp-accent)]" />
              <span>{contagem}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
