import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useListarPacientes,
  useListarPacientesArquivados,
  useResumoPacientes,
  useObterConfig,
  useListarVendedoras,
  useListarMedicos,
  useCriarVendedora,
  useAtualizarVendedora,
  useProcessarAlertasPrazo,
  useRegistrarLembrete,
  getListarVendedorasQueryKey,
  getListarPacientesQueryKey,
  getResumoPacientesQueryKey,
  isConnectivityError,
} from "@workspace/api-client-react";
import { ConnectionErrorConsole } from "@/components/connection-error";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toastErroAcao } from "@/lib/erro-acao";
import { NovoPacienteDialog, SEM_VENDEDORA } from "@/components/novo-paciente-dialog";
import { MedicosDialog } from "@/components/medicos-dialog";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { motion } from "framer-motion";
import { ChevronRight, Plus, HelpCircle, X, Check, Pencil, Users, Archive, Search, FileText, AlertTriangle, Bell, CalendarClock, MessageCircle, FilePlus, Menu, Stethoscope, Sparkles, MapPin } from "lucide-react";
import { linkLembreteWhatsApp } from "@/lib/patient-tools";
import { useOperador } from "@/lib/operador";
import {
  corDoMarco,
  rotuloDoMarco,
  ajudaDoMarco,
  AGUARDANDO_CONTRATO_ROTULO,
} from "@/lib/jornada-equipe";

// Janela padrão (em dias) para considerar a cirurgia "próxima" e, junto com a
// ausência de abertura do link, disparar o alerta de follow-up para a equipe.
const DIAS_ALERTA_ABERTURA = 7;

/** Dias civis até a cirurgia (negativo se já passou, 0 = hoje). */
function diasParaCirurgia(dataCirurgia: string): number {
  return differenceInCalendarDays(parseISO(dataCirurgia), new Date());
}

/**
 * Alerta de follow-up: a paciente ainda não abriu o link e a cirurgia está
 * próxima. Só vale depois que o link foi entregue (linkEnviadoEm) e enquanto a
 * cirurgia não passou. `abriu` undefined (desconhecido) não alerta.
 */
function precisaAlertaAbertura(p: {
  abriu?: boolean;
  linkEnviadoEm: string | null;
  dataCirurgia: string;
}): boolean {
  if (p.abriu !== false) return false;
  // Só faz sentido cobrar a abertura depois que o link foi efetivamente enviado.
  if (p.linkEnviadoEm == null) return false;
  const dias = diasParaCirurgia(p.dataCirurgia);
  return dias >= 0 && dias <= DIAS_ALERTA_ABERTURA;
}

// Marcos de urgência (em horas antes da cirurgia) em que um documento pendente
// passa a ser destacado na home, do mais folgado ao mais crítico. A regra da
// clínica é que contrato e termo estejam assinados no máximo 24h antes da
// cirurgia — então escalonamos o destaque a 72h, 48h e 24h para o prazo não
// estourar sem ninguém perceber.
type UrgenciaPrazo = "atencao" | "urgente" | "critico";

interface MarcoPrazo {
  horas: 72 | 48 | 24;
  urgencia: UrgenciaPrazo;
  /** Rótulo curto para o badge: "72h", "48h", "24h", "hoje" ou "atrasado". */
  rotulo: string;
}

// Classes por nível de urgência (badge e borda do tooltip). Champagne (accent)
// só como fio/realce fino no nível mais folgado; âmbar e vermelho escalam a
// leitura conforme a cirurgia se aproxima.
const CLASSE_URGENCIA: Record<
  UrgenciaPrazo,
  { badge: string; tip: string }
> = {
  atencao: {
    badge: "bg-accent/10 text-accent border-accent/50",
    tip: "border-accent/30",
  },
  urgente: {
    badge: "bg-amber-500/10 text-amber-300 border-amber-400/50",
    tip: "border-amber-400/40",
  },
  critico: {
    badge: "bg-red-500/10 text-red-300 border-red-400/50",
    tip: "border-red-400/40",
  },
};

/**
 * Marco de urgência a partir dos dias civis até a cirurgia, ou null quando ainda
 * falta mais de 72h. Janelas cumulativas: devolve sempre o marco MAIS crítico
 * aplicável, para o documento pendente mostrar um único destaque.
 */
function marcoPorDiasParaCirurgia(dias: number): MarcoPrazo | null {
  if (dias <= 1) {
    const rotulo = dias < 0 ? "atrasado" : dias === 0 ? "hoje" : "24h";
    return { horas: 24, urgencia: "critico", rotulo };
  }
  if (dias <= 2) return { horas: 48, urgencia: "urgente", rotulo: "48h" };
  if (dias <= 3) return { horas: 72, urgencia: "atencao", rotulo: "72h" };
  return null;
}

/**
 * Destaque de prazo do contrato na home. Só vale com contrato vinculado
 * (enviado) e ainda não assinado/recusado; escalona conforme a cirurgia se
 * aproxima (72h → 48h → 24h). `null` = sem destaque.
 */
function statusPrazoContrato(p: {
  contratoStatus: string | null;
  dataCirurgia: string;
  contratoAutentiqueId: string | null;
  contratoLinkAssinaturaManual: string | null;
}): MarcoPrazo | null {
  if (p.contratoStatus === "assinado" || p.contratoStatus === "recusado")
    return null;
  const temContrato = Boolean(
    p.contratoAutentiqueId || p.contratoLinkAssinaturaManual,
  );
  if (!temContrato) return null;
  return marcoPorDiasParaCirurgia(diasParaCirurgia(p.dataCirurgia));
}

/**
 * Destaque de prazo do termo de consentimento (TCLE). Espelha
 * `statusPrazoContrato`: só vale com termo vinculado e ainda não
 * assinado/recusado; escalona a 72h → 48h → 24h da cirurgia.
 */
function statusPrazoTermo(p: {
  termoStatus: string | null;
  dataCirurgia: string;
  termoAutentiqueId: string | null;
  termoLinkAssinaturaManual: string | null;
}): MarcoPrazo | null {
  if (p.termoStatus === "assinado" || p.termoStatus === "recusado") return null;
  const temTermo = Boolean(p.termoAutentiqueId || p.termoLinkAssinaturaManual);
  if (!temTermo) return null;
  return marcoPorDiasParaCirurgia(diasParaCirurgia(p.dataCirurgia));
}

export const EstratosLogo = ({ className }: { className?: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect x="0" y="4" width="8" height="2" className="fill-accent" />
    <rect x="0" y="11" width="16" height="2" fill="currentColor" />
    <rect x="0" y="18" width="24" height="2" fill="currentColor" />
  </svg>
);

const TODOS_MARCOS = "__todos__";
const MARCO_AGUARDANDO = "__aguardando__";
const TODAS_VENDEDORAS = "__todas__";

const ORDEM_CIRURGIA = "cirurgia";
const ORDEM_NOME = "nome";
type Ordenacao = typeof ORDEM_CIRURGIA | typeof ORDEM_NOME;

// Mini linha do tempo por paciente: os 10 marcos da jornada interna da equipe
// (losangos + fio em champagne). A ORDEM e os RÓTULOS vêm do servidor (/config).
// Cada losango é preenchido conforme os marcos efetivamente cumpridos
// (`marcosConcluidos`) — render honesto, já que marcos automáticos podem ficar
// "em falha" no meio do caminho. O marco atual aparece em destaque, com só o
// rótulo do estado atual (a referência de todas as etapas fica na legenda da
// lista, ver `LegendaJornada`).
function MiniLinhaTempo({
  jornada,
  marcoAtual,
  marcosConcluidos,
}: {
  jornada: { chave: string; rotulo: string }[];
  marcoAtual: string | null;
  marcosConcluidos: string[];
}) {
  if (jornada.length === 0) return null;
  const concluidos = new Set(marcosConcluidos);
  const idxAtual = marcoAtual
    ? jornada.findIndex((m) => m.chave === marcoAtual)
    : -1;
  const rotuloAtual =
    idxAtual >= 0
      ? (jornada[idxAtual]?.rotulo ?? AGUARDANDO_CONTRATO_ROTULO)
      : AGUARDANDO_CONTRATO_ROTULO;
  const progresso =
    idxAtual > 0 ? (idxAtual / (jornada.length - 1)) * 100 : 0;
  return (
    <div
      className="relative pt-2 max-w-md"
      role="img"
      aria-label={`Jornada da equipe — marco atual: ${rotuloAtual}`}
    >
      <div className="pointer-events-none absolute left-1 right-1 top-[13px] h-px bg-muted-foreground/20" />
      {progresso > 0 && (
        <div
          className="pointer-events-none absolute left-1 top-[13px] h-px bg-accent/60"
          style={{ width: `calc(${progresso}% - 0.25rem)` }}
        />
      )}
      <div className="relative flex items-center justify-between gap-1">
        {jornada.map((m, idx) => {
          // Losango preenchido quando o marco foi concluído OU está antes do
          // marco atual — assim os losangos acompanham o fio de progresso, que
          // já é desenhado cheio até o marco atual (idxAtual).
          const cumprido = concluidos.has(m.chave) || (idxAtual >= 0 && idx < idxAtual);
          const ehAtual = idx === idxAtual;
          return (
            <span
              key={m.chave}
              title={m.rotulo}
              className="relative h-2.5 flex items-center justify-center"
            >
              <span
                className={
                  ehAtual
                    ? "w-2.5 h-2.5 rotate-45 bg-accent"
                    : cumprido
                      ? "w-1.5 h-1.5 rotate-45 bg-accent"
                      : "w-1.5 h-1.5 rotate-45 border border-muted-foreground/40 bg-transparent"
                }
              />
              {/* Rótulo do estado atual ancorado NO losango atual — centralizado
                  sob ele (ou colado à borda quando é a 1ª/última etapa, pra não
                  vazar). */}
              {ehAtual && (
                <span
                  className={`absolute top-full mt-1.5 whitespace-nowrap font-expanded text-[8px] uppercase tracking-[0.15em] leading-none text-foreground ${
                    idx === 0
                      ? "left-0"
                      : idx === jornada.length - 1
                        ? "right-0"
                        : "left-1/2 -translate-x-1/2"
                  }`}
                >
                  {rotuloAtual}
                </span>
              )}
            </span>
          );
        })}
      </div>
      <div className="relative mt-1.5 h-3">
        {/* Baseline (nenhum marco atingido): rótulo à esquerda, sem losango atual. */}
        {idxAtual < 0 && (
          <span className="absolute left-0 top-0 whitespace-nowrap font-expanded text-[8px] uppercase tracking-[0.15em] leading-none text-foreground">
            {rotuloAtual}
          </span>
        )}
        {/* Contador no canto direito. */}
        <span className="absolute right-0 top-0 font-mono text-[8px] tracking-wide text-muted-foreground/70">
          {Math.max(idxAtual + 1, 0)}/{jornada.length}
        </span>
      </div>
    </div>
  );
}

// Legenda da jornada — barra HORIZONTAL completa com TODAS as etapas nomeadas,
// exibida uma vez acima da lista (após as abas Ativos/Arquivados). Serve de
// referência para ler a barrinha de cada card: os mesmos losangos, aqui com o
// rótulo de cada marco por baixo, na ordem do funil.
function LegendaJornada({
  jornada,
}: {
  jornada: { chave: string; rotulo: string }[];
}) {
  if (jornada.length === 0) return null;
  return (
    <div className="border border-border/60 bg-card/40 px-4 py-3">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1.5 h-1.5 bg-accent rotate-45" aria-hidden />
        <span className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground">
          Jornada da equipe — etapas
        </span>
      </div>
      <div className="relative overflow-x-auto">
        {/* Fio de fundo ligando as etapas. */}
        <ol className="relative flex items-start justify-between gap-2 min-w-[640px]">
          <span
            className="pointer-events-none absolute left-2 right-2 top-[5px] h-px bg-muted-foreground/20"
            aria-hidden
          />
          {jornada.map((m, idx) => (
            <li
              key={m.chave}
              className="relative flex-1 flex flex-col items-center gap-1.5 text-center"
            >
              <span className="h-2.5 flex items-center justify-center">
                <span className="w-2 h-2 rotate-45 border border-muted-foreground/50 bg-background" />
              </span>
              <span className="font-mono text-[8px] text-muted-foreground/50 leading-none">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <span className="font-expanded text-[8px] uppercase tracking-[0.1em] leading-tight text-muted-foreground">
                {m.rotulo}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default function ConsoleHome() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [vendedorasOpen, setVendedorasOpen] = useState(false);
  const [aba, setAba] = useState<"ativos" | "arquivados">("ativos");
  const [busca, setBusca] = useState("");
  const [filtroMarco, setFiltroMarco] = useState<string>(TODOS_MARCOS);
  const [filtroVendedora, setFiltroVendedora] = useState<string>(TODAS_VENDEDORAS);
  const [soAlerta, setSoAlerta] = useState(false);
  const [soPrazo, setSoPrazo] = useState(false);
  const [soPrazoTermo, setSoPrazoTermo] = useState(false);
  const [ordenacao, setOrdenacao] = useState<Ordenacao>(ORDEM_CIRURGIA);
  const [medicosOpen, setMedicosOpen] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("kcl-console-guia-visto") !== "1") {
      setShowGuide(true);
    }
  }, []);

  // Varredura de prazos vencidos → avisa a equipe (com dedup no servidor).
  // É um POST com efeito colateral, então roda uma única vez ao carregar a home
  // e, em caso de envio, atualiza as listas para refletir o carimbo de aviso.
  const processarAlertasPrazo = useProcessarAlertasPrazo();
  useEffect(() => {
    let cancelado = false;
    processarAlertasPrazo.mutate(undefined, {
      onSuccess: (r) => {
        if (cancelado || r.avisados === 0) return;
        queryClient.invalidateQueries({ queryKey: getListarPacientesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getResumoPacientesQueryKey() });
      },
    });
    return () => {
      cancelado = true;
    };
    // Apenas no mount: a varredura é idempotente (dedup por paciente no servidor).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Registra o lembrete enviado pela equipe (sem bloquear a abertura do
  // WhatsApp): atualiza a lista para refletir o "Lembrado em" no cartão e
  // evitar que dois atendentes façam o mesmo follow-up.
  const registrarLembrete = useRegistrarLembrete();
  // Identidade leve de quem está usando o Console neste navegador, para creditar
  // o lembrete a uma pessoa (não a uma genérica "equipe") e evitar follow-up
  // duplicado. Capturada uma vez e reutilizada.
  const { operador, salvar: salvarOperador } = useOperador();
  type LembretePaciente = { id: number; telefone: string; nome: string; codigoPublico: string; dataCirurgia: string; horario: string };
  const [identDialogAberto, setIdentDialogAberto] = useState(false);
  const [identRascunho, setIdentRascunho] = useState("");
  const [identPendente, setIdentPendente] = useState<LembretePaciente | null>(null);

  function enviarLembrete(p: LembretePaciente, autor: string | null) {
    // Abre o WhatsApp primeiro, ainda dentro do gesto do clique (evita bloqueio
    // de pop-up). O registro do lembrete é best-effort em seguida.
    window.open(linkLembreteWhatsApp(p), "_blank", "noopener,noreferrer");
    registrarLembrete.mutate(
      { id: p.id, data: autor ? { autor } : undefined },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListarPacientesQueryKey() });
        },
        onError: (err) => {
          toast(
            toastErroAcao(err, {
              title: "Não foi possível registrar o lembrete",
              description: "O WhatsApp foi aberto, mas o registro falhou. Tente novamente.",
            }),
          );
        },
      },
    );
  }

  function lembrarPaciente(p: LembretePaciente) {
    // Sem identidade ainda neste navegador: pergunta quem está enviando antes de
    // abrir o WhatsApp. O envio acontece no gesto de clique do diálogo (também
    // válido para o pop-up).
    if (!operador) {
      setIdentRascunho("");
      setIdentPendente(p);
      setIdentDialogAberto(true);
      return;
    }
    enviarLembrete(p, operador);
  }

  function confirmarIdentidade() {
    const nome = identRascunho.trim();
    if (!nome || !identPendente) return;
    salvarOperador(nome);
    const p = identPendente;
    setIdentDialogAberto(false);
    setIdentPendente(null);
    enviarLembrete(p, nome);
  }

  function dismissGuide() {
    localStorage.setItem("kcl-console-guia-visto", "1");
    setShowGuide(false);
  }

  const {
    data: resumo,
    isLoading: loadingResumo,
    isError: resumoErro,
    error: resumoErrObj,
    refetch: refetchResumo,
    isRefetching: refetchingResumo,
  } = useResumoPacientes();
  const {
    data: pacientes,
    isLoading: loadingPacientes,
    isError: pacientesErro,
    error: pacientesErrObj,
    refetch: refetchPacientes,
    isRefetching: refetchingPacientes,
  } = useListarPacientes();
  const {
    data: arquivados,
    isLoading: loadingArquivados,
    isError: arquivadosErro,
    error: arquivadosErrObj,
    refetch: refetchArquivados,
    isRefetching: refetchingArquivados,
  } = useListarPacientesArquivados();
  const { data: vendedoras } = useListarVendedoras();
  const { data: medicos } = useListarMedicos();

  const cargaErro = resumoErro || pacientesErro || arquivadosErro;
  const cargaErroObj = resumoErrObj ?? pacientesErrObj ?? arquivadosErrObj;
  const recarregando = refetchingResumo || refetchingPacientes || refetchingArquivados;
  const recarregarDados = () => {
    refetchResumo();
    refetchPacientes();
    refetchArquivados();
  };
  const { data: config } = useObterConfig();

  const contratoVisual = (status: string | null) => {
    switch (status) {
      case "assinado": return { label: "Assinado", className: "bg-card text-foreground border-accent/60" };
      case "pendente": return { label: "Pendente", className: "bg-card text-accent border-accent/40" };
      case "recusado": return { label: "Recusado", className: "bg-card text-red-300 border-red-400/40" };
      case "indisponivel": return { label: "Indisponível", className: "bg-card text-muted-foreground border-muted-foreground/30" };
      default: return { label: "—", className: "bg-transparent text-muted-foreground border-border" };
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
  };

  const ativas = vendedoras?.filter((v) => v.ativo) ?? [];

  const listaExibida = aba === "ativos" ? pacientes : arquivados;
  const carregandoLista = aba === "ativos" ? loadingPacientes : loadingArquivados;

  // Pacientes ativos que precisam de follow-up: cirurgia próxima e link ainda
  // não aberto. Sempre calculado sobre a lista de ativos (não a aba arquivados).
  const pacientesAlerta = (pacientes ?? []).filter(precisaAlertaAbertura);
  // Quantas das pacientes sinalizadas já receberam um lembrete da equipe —
  // para o banner deixar claro que parte do follow-up já foi feito.
  const pacientesAlertaLembrados = pacientesAlerta.filter(
    (p) => p.lembreteEnviadoEm,
  ).length;

  // Pacientes ativos com contrato pendente dentro da janela de 72h da cirurgia
  // (e ainda sem assinatura). "Crítico" = a 24h ou menos da cirurgia.
  const pacientesPrazo = (pacientes ?? []).filter(
    (p) => statusPrazoContrato(p) !== null,
  );
  const pacientesPrazoCritico = pacientesPrazo.filter(
    (p) => statusPrazoContrato(p)?.urgencia === "critico",
  );

  // Pacientes ativos com termo de consentimento pendente dentro da janela de
  // 72h da cirurgia — mesma lógica do contrato.
  const pacientesPrazoTermo = (pacientes ?? []).filter(
    (p) => statusPrazoTermo(p) !== null,
  );
  const pacientesPrazoTermoCritico = pacientesPrazoTermo.filter(
    (p) => statusPrazoTermo(p)?.urgencia === "critico",
  );

  const buscaNorm = busca.trim().toLowerCase();
  const filtrosAtivos =
    buscaNorm.length > 0 ||
    filtroMarco !== TODOS_MARCOS ||
    filtroVendedora !== TODAS_VENDEDORAS ||
    soAlerta ||
    soPrazo ||
    soPrazoTermo;

  const listaFiltrada = listaExibida
    ?.filter((p) => {
      if (soAlerta && !precisaAlertaAbertura(p)) return false;
      if (soPrazo && statusPrazoContrato(p) === null) return false;
      if (soPrazoTermo && statusPrazoTermo(p) === null) return false;
      if (buscaNorm && !p.nome.toLowerCase().includes(buscaNorm)) return false;
      if (filtroMarco !== TODOS_MARCOS) {
        if (filtroMarco === MARCO_AGUARDANDO) {
          if (p.marcoAtual != null) return false;
        } else if (p.marcoAtual !== filtroMarco) {
          return false;
        }
      }
      if (filtroVendedora !== TODAS_VENDEDORAS) {
        if (filtroVendedora === SEM_VENDEDORA) {
          if (p.vendedoraId != null) return false;
        } else if (String(p.vendedoraId) !== filtroVendedora) {
          return false;
        }
      }
      return true;
    })
    .slice()
    .sort((a, b) => {
      if (ordenacao === ORDEM_NOME) {
        return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
      }
      // Cirurgia mais próxima primeiro (datas iguais → desempate por nome).
      const dataA = a.dataCirurgia.localeCompare(b.dataCirurgia);
      if (dataA !== 0) return dataA;
      return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
    });

  function limparFiltros() {
    setBusca("");
    setFiltroMarco(TODOS_MARCOS);
    setFiltroVendedora(TODAS_VENDEDORAS);
    setSoAlerta(false);
    setSoPrazo(false);
    setSoPrazoTermo(false);
  }

  if (cargaErro) {
    if (isConnectivityError(cargaErroObj)) {
      return <ConnectionErrorConsole onRetry={recarregarDados} isRetrying={recarregando} />;
    }
    return (
      <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center bg-background text-foreground font-sans selection:bg-accent/30 p-4">
        <EstratosLogo className="text-accent mb-12 opacity-50" />
        <div className="text-center space-y-6 max-w-md w-full">
          <h1 className="text-4xl font-serif font-light text-foreground">
            Não foi possível carregar o Console
          </h1>
          <p className="text-muted-foreground font-light leading-relaxed text-lg">
            Ocorreu um erro inesperado ao carregar os dados. Tente novamente.
          </p>
          <div className="pt-8">
            <Button
              onClick={recarregarDados}
              disabled={recarregando}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-none px-8 h-12 w-full transition-all disabled:opacity-60"
            >
              {recarregando ? "Tentando..." : "Tentar novamente"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
    <div className="min-h-[100dvh] bg-background text-foreground pb-24 font-sans selection:bg-accent/30">
      <header className="border-b border-border bg-background/90 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          {/* Identidade: logo + CAMADA nunca encolhem (evita a logo sobrepor o
              texto em telas estreitas). O rótulo da operação trunca a partir de md. */}
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex items-center gap-3 shrink-0">
              <EstratosLogo className="text-foreground" />
              <span className="font-expanded tracking-widest text-sm font-medium">CAMADA</span>
            </div>
            <div className="hidden md:flex items-baseline gap-3 min-w-0">
              <span className="text-accent opacity-50 shrink-0">|</span>
              <span className="text-muted-foreground text-[10px] font-expanded tracking-widest uppercase truncate">OPERAÇÃO KCL · DRA. KARLA</span>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {/* Navegação completa — só em telas largas (xl+); abaixo vira menu. */}
            <nav className="hidden xl:flex items-center gap-4">
              <Link
                href="/conteudo"
                className="flex items-center gap-2 text-muted-foreground hover:text-accent transition-colors text-xs font-light"
              >
                <FileText className="w-4 h-4" strokeWidth={1.5} />
                <span>Conteúdo padrão</span>
              </Link>
              <Link
                href="/documentos"
                className="flex items-center gap-2 text-muted-foreground hover:text-accent transition-colors text-xs font-light"
              >
                <FilePlus className="w-4 h-4" strokeWidth={1.5} />
                <span>Gerar documentos</span>
              </Link>
              <Link
                href="/notificacoes"
                className="flex items-center gap-2 text-muted-foreground hover:text-accent transition-colors text-xs font-light"
              >
                <Bell className="w-4 h-4" strokeWidth={1.5} />
                <span>Avisos da equipe</span>
              </Link>
              <Link
                href="/prompts"
                className="flex items-center gap-2 text-muted-foreground hover:text-accent transition-colors text-xs font-light"
              >
                <Sparkles className="w-4 h-4" strokeWidth={1.5} />
                <span>Prompts da IA</span>
              </Link>
              <Link
                href="/locais"
                className="flex items-center gap-2 text-muted-foreground hover:text-accent transition-colors text-xs font-light"
              >
                <MapPin className="w-4 h-4" strokeWidth={1.5} />
                <span>Locais de cirurgia</span>
              </Link>
              <button
                type="button"
                onClick={() => setShowGuide(true)}
                className="flex items-center gap-2 text-muted-foreground hover:text-accent transition-colors text-xs font-light"
              >
                <HelpCircle className="w-4 h-4" strokeWidth={1.5} />
                <span>Como funciona</span>
              </button>
            </nav>

            {/* Diálogos Médicos/Vendedoras: sempre montados e controlados. O
                wrapper esconde só os TRIGGERS abaixo de lg (o conteúdo é
                portalizado, então o menu compacto os abre via estado). */}
            <div className="hidden xl:flex items-center gap-4">
              <MedicosDialog open={medicosOpen} onOpenChange={setMedicosOpen} />
              <VendedorasDialog open={vendedorasOpen} onOpenChange={setVendedorasOpen} />
            </div>

            <ThemeToggle />

            {/* Menu compacto — abaixo de xl reúne toda a navegação e os cadastros. */}
            <div className="xl:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Menu"
                    className="rounded-none text-muted-foreground hover:text-accent hover:bg-card"
                  >
                    <Menu className="w-5 h-5" strokeWidth={1.5} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-none w-56 bg-background! text-foreground! border-border">
                  <DropdownMenuItem asChild>
                    <Link href="/conteudo" className="flex items-center gap-2 cursor-pointer text-muted-foreground focus:bg-card! focus:text-foreground!">
                      <FileText className="w-4 h-4" strokeWidth={1.5} /> Conteúdo padrão
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/documentos" className="flex items-center gap-2 cursor-pointer text-muted-foreground focus:bg-card! focus:text-foreground!">
                      <FilePlus className="w-4 h-4" strokeWidth={1.5} /> Gerar documentos
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/notificacoes" className="flex items-center gap-2 cursor-pointer text-muted-foreground focus:bg-card! focus:text-foreground!">
                      <Bell className="w-4 h-4" strokeWidth={1.5} /> Avisos da equipe
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/prompts" className="flex items-center gap-2 cursor-pointer text-muted-foreground focus:bg-card! focus:text-foreground!">
                      <Sparkles className="w-4 h-4" strokeWidth={1.5} /> Prompts da IA
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/locais" className="flex items-center gap-2 cursor-pointer text-muted-foreground focus:bg-card! focus:text-foreground!">
                      <MapPin className="w-4 h-4" strokeWidth={1.5} /> Locais de cirurgia
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setMedicosOpen(true)} className="flex items-center gap-2 cursor-pointer text-muted-foreground focus:bg-card! focus:text-foreground!">
                    <Stethoscope className="w-4 h-4" strokeWidth={1.5} /> Médicos
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setVendedorasOpen(true)} className="flex items-center gap-2 cursor-pointer text-muted-foreground focus:bg-card! focus:text-foreground!">
                    <Users className="w-4 h-4" strokeWidth={1.5} /> Vendedoras
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setShowGuide(true)} className="flex items-center gap-2 cursor-pointer text-muted-foreground focus:bg-card! focus:text-foreground!">
                    <HelpCircle className="w-4 h-4" strokeWidth={1.5} /> Como funciona
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <motion.main 
        variants={containerVariants} 
        initial="hidden" 
        animate="show" 
        className="max-w-4xl mx-auto px-4 mt-12 space-y-12"
      >
        <motion.section variants={itemVariants} className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
          <div className="space-y-2">
            <h1 className="font-serif text-5xl font-light tracking-tight text-foreground">Console de Operação</h1>
            <p className="text-muted-foreground font-light text-lg">Gestão de handoff e preparo cirúrgico.</p>
          </div>

          <Button
            onClick={() => setIsDialogOpen(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-none h-12 px-6 transition-all group"
          >
            <Plus className="w-4 h-4 mr-2 opacity-50 group-hover:opacity-100 transition-opacity" />
            Novo paciente
          </Button>
          <NovoPacienteDialog
            open={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            config={config}
            ativas={ativas}
            medicos={medicos ?? []}
          />
        </motion.section>

        {/* Resumo Strip */}
        <motion.section variants={itemVariants} className="space-y-4">
          {/* KPIs principais */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-[1px] bg-card p-[1px]">
            {loadingResumo ? (
              Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-28 bg-background rounded-none" />)
            ) : resumo ? (
              [
                { label: "Total", value: resumo.total, color: "text-foreground", ajuda: null as null | { resumo: string; detalhe: string } },
                { label: "Aguardando contrato", value: resumo.aguardandoContrato, color: "text-muted-foreground", ajuda: ajudaDoMarco(null) },
                { label: "Contratos pendentes", value: resumo.contratosPendentes, color: "text-accent", ajuda: null },
                { label: "Termos pendentes", value: resumo.termosPendentes, color: "text-accent", ajuda: null },
              ].map((item) => {
                const card = (
                  <div className="bg-background p-6 flex flex-col justify-center items-center text-center h-full">
                    <span className={`font-mono text-4xl font-light mb-2 ${item.color}`}>{item.value}</span>
                    <span className="font-expanded text-[10px] tracking-widest uppercase text-muted-foreground opacity-80 flex items-center gap-1">
                      {item.label}
                      {item.ajuda && <HelpCircle className="w-3 h-3 opacity-60" strokeWidth={1.5} />}
                    </span>
                  </div>
                );
                return item.ajuda ? (
                  <Tooltip key={item.label}>
                    <TooltipTrigger asChild>
                      <button type="button" className="cursor-help">{card}</button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[240px] bg-card border border-accent/30 text-foreground rounded-none font-light text-xs leading-relaxed">
                      <span className="block font-medium mb-1">{item.ajuda.resumo}</span>
                      {item.ajuda.detalhe}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <div key={item.label}>{card}</div>
                );
              })
            ) : null}
          </div>

          {/* Funil da equipe: contagem por marco (ordem e rótulos vêm do servidor). */}
          {!loadingResumo && resumo && resumo.porMarco.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="font-expanded text-[10px] tracking-widest uppercase text-muted-foreground shrink-0">Jornada da equipe</span>
                <span className="h-px flex-1 bg-card" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-[1px] bg-card p-[1px]">
                {resumo.porMarco.map((m, idx) => {
                  const ajuda = ajudaDoMarco(m.chave);
                  const ativo = filtroMarco === m.chave;
                  return (
                    <Tooltip key={m.chave}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setFiltroMarco(ativo ? TODOS_MARCOS : m.chave)}
                          className={`bg-background p-4 flex flex-col items-center text-center gap-1.5 transition-colors hover:bg-card cursor-pointer ${ativo ? "ring-1 ring-accent ring-inset" : ""}`}
                        >
                          <span className="flex items-baseline gap-1.5">
                            <span className="font-mono text-[9px] text-muted-foreground/50">{String(idx + 1).padStart(2, "0")}</span>
                            <span className={`font-mono text-2xl font-light ${m.total > 0 ? "text-accent" : "text-muted-foreground/50"}`}>{m.total}</span>
                          </span>
                          <span className="font-expanded text-[8px] tracking-widest uppercase text-muted-foreground leading-tight">{m.rotulo}</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[240px] bg-card border border-accent/30 text-foreground rounded-none font-light text-xs leading-relaxed">
                        <span className="block font-medium mb-1">{ajuda.resumo}</span>
                        {ajuda.detalhe}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          )}
        </motion.section>

        {/* Alerta de follow-up: cirurgia próxima e link ainda não aberto */}
        {aba === "ativos" && pacientesAlerta.length > 0 && (
          <motion.section variants={itemVariants}>
            <div className="border border-red-400/40 bg-red-500/[0.06] p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-start gap-3 flex-1">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" strokeWidth={1.5} />
                <div className="space-y-1">
                  <p className="text-foreground font-light">
                    <span className="font-mono text-red-300">{pacientesAlerta.length}</span>{" "}
                    {pacientesAlerta.length === 1
                      ? "paciente com cirurgia próxima ainda não abriu o link"
                      : "pacientes com cirurgia próxima ainda não abriram o link"}
                    .
                  </p>
                  <p className="text-muted-foreground/80 font-light text-sm leading-relaxed">
                    Cirurgia em até {DIAS_ALERTA_ABERTURA} dias e sem nenhuma abertura registrada. Vale um follow-up manual antes do dia.
                    {pacientesAlertaLembrados > 0 && (
                      <>
                        {" "}
                        <span className="text-muted-foreground">
                          {pacientesAlertaLembrados === 1
                            ? "1 já recebeu lembrete."
                            : `${pacientesAlertaLembrados} já receberam lembrete.`}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSoAlerta((v) => !v)}
                className="rounded-none border-red-400/40 text-red-300 hover:bg-red-500/10 hover:text-red-200 h-10 px-4 font-expanded text-[10px] tracking-widest uppercase shrink-0"
              >
                {soAlerta ? "Ver todas" : "Ver só estas"}
              </Button>
            </div>
          </motion.section>
        )}

        {/* Alerta de prazo de contrato: vencido ou próximo e ainda não assinado */}
        {aba === "ativos" && pacientesPrazo.length > 0 && (
          <motion.section variants={itemVariants}>
            <div className="border border-accent/40 bg-accent/[0.06] p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-start gap-3 flex-1">
                <CalendarClock className="w-5 h-5 text-accent shrink-0 mt-0.5" strokeWidth={1.5} />
                <div className="space-y-1">
                  <p className="text-foreground font-light">
                    <span className="font-mono text-accent">{pacientesPrazo.length}</span>{" "}
                    {pacientesPrazo.length === 1
                      ? "paciente com contrato pendente e cirurgia próxima"
                      : "pacientes com contrato pendente e cirurgia próxima"}
                    {pacientesPrazoCritico.length > 0 && (
                      <>
                        {" "}
                        (<span className="font-mono text-red-300">{pacientesPrazoCritico.length}</span>{" "}
                        a ≤24h)
                      </>
                    )}
                    .
                  </p>
                  <p className="text-muted-foreground/80 font-light text-sm leading-relaxed">
                    Contrato ainda não assinado e cirurgia em até 72h. O destaque escala a 72h, 48h e 24h da cirurgia.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSoPrazo((v) => !v)}
                className="rounded-none border-accent/40 text-accent hover:bg-accent/10 hover:text-accent h-10 px-4 font-expanded text-[10px] tracking-widest uppercase shrink-0"
              >
                {soPrazo ? "Ver todas" : "Ver só estas"}
              </Button>
            </div>
          </motion.section>
        )}

        {/* Alerta de prazo do termo de consentimento: vencido ou próximo e ainda não assinado */}
        {aba === "ativos" && pacientesPrazoTermo.length > 0 && (
          <motion.section variants={itemVariants}>
            <div className="border border-accent/40 bg-accent/[0.06] p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-start gap-3 flex-1">
                <CalendarClock className="w-5 h-5 text-accent shrink-0 mt-0.5" strokeWidth={1.5} />
                <div className="space-y-1">
                  <p className="text-foreground font-light">
                    <span className="font-mono text-accent">{pacientesPrazoTermo.length}</span>{" "}
                    {pacientesPrazoTermo.length === 1
                      ? "paciente com termo pendente e cirurgia próxima"
                      : "pacientes com termo pendente e cirurgia próxima"}
                    {pacientesPrazoTermoCritico.length > 0 && (
                      <>
                        {" "}
                        (<span className="font-mono text-red-300">{pacientesPrazoTermoCritico.length}</span>{" "}
                        a ≤24h)
                      </>
                    )}
                    .
                  </p>
                  <p className="text-muted-foreground/80 font-light text-sm leading-relaxed">
                    Termo de consentimento ainda não assinado e cirurgia em até 72h. O destaque escala a 72h, 48h e 24h da cirurgia.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSoPrazoTermo((v) => !v)}
                className="rounded-none border-accent/40 text-accent hover:bg-accent/10 hover:text-accent h-10 px-4 font-expanded text-[10px] tracking-widest uppercase shrink-0"
              >
                {soPrazoTermo ? "Ver todas" : "Ver só estas"}
              </Button>
            </div>
          </motion.section>
        )}

        {/* Lista */}
        <motion.section variants={itemVariants} className="space-y-6">
          <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
            <Tabs value={aba} onValueChange={(v) => setAba(v as "ativos" | "arquivados")}>
              <TabsList className="bg-card rounded-none h-auto p-1">
                <TabsTrigger value="ativos" className="rounded-none font-expanded text-[10px] tracking-widest uppercase data-[state=active]:bg-background data-[state=active]:text-accent text-muted-foreground px-4 py-2">
                  Ativos
                </TabsTrigger>
                <TabsTrigger value="arquivados" className="rounded-none font-expanded text-[10px] tracking-widest uppercase data-[state=active]:bg-background data-[state=active]:text-accent text-muted-foreground px-4 py-2">
                  <Archive className="w-3 h-3 mr-2" /> Arquivados
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Legenda da jornada: barra horizontal completa com todas as etapas
              nomeadas — referência para ler a barrinha de cada card abaixo. */}
          {listaExibida && listaExibida.length > 0 && (
            <LegendaJornada jornada={config?.jornadaEquipe ?? []} />
          )}

          {listaExibida && listaExibida.length > 0 && (
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" strokeWidth={1.5} />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome"
                  className="bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-11 pl-9 text-foreground placeholder:text-muted-foreground/50"
                />
                {busca && (
                  <button
                    type="button"
                    onClick={() => setBusca("")}
                    aria-label="Limpar busca"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-accent transition-colors"
                  >
                    <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <Select value={filtroMarco} onValueChange={setFiltroMarco}>
                  <SelectTrigger className="bg-card border-transparent focus:ring-1 focus:ring-ring rounded-none h-11 w-full lg:w-52 text-foreground font-light">
                    <SelectValue placeholder="Marco" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border text-foreground rounded-none">
                    <SelectItem value={TODOS_MARCOS} className="focus:bg-card focus:text-foreground rounded-none">
                      Todos os marcos
                    </SelectItem>
                    <SelectItem value={MARCO_AGUARDANDO} className="focus:bg-card focus:text-foreground rounded-none">
                      {AGUARDANDO_CONTRATO_ROTULO}
                    </SelectItem>
                    {(config?.jornadaEquipe ?? []).map((m) => (
                      <SelectItem key={m.chave} value={m.chave} className="focus:bg-card focus:text-foreground rounded-none">
                        {m.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filtroVendedora} onValueChange={setFiltroVendedora}>
                  <SelectTrigger className="bg-card border-transparent focus:ring-1 focus:ring-ring rounded-none h-11 w-full lg:w-52 text-foreground font-light">
                    <SelectValue placeholder="Responsável" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border text-foreground rounded-none">
                    <SelectItem value={TODAS_VENDEDORAS} className="focus:bg-card focus:text-foreground rounded-none">
                      Todas as responsáveis
                    </SelectItem>
                    <SelectItem value={SEM_VENDEDORA} className="focus:bg-card focus:text-foreground rounded-none">
                      Sem responsável
                    </SelectItem>
                    {ativas.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)} className="focus:bg-card focus:text-foreground rounded-none">
                        {v.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={ordenacao} onValueChange={(v) => setOrdenacao(v as Ordenacao)}>
                  <SelectTrigger className="bg-card border-transparent focus:ring-1 focus:ring-ring rounded-none h-11 w-full lg:w-52 text-foreground font-light">
                    <SelectValue placeholder="Ordenar por" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border text-foreground rounded-none">
                    <SelectItem value={ORDEM_CIRURGIA} className="focus:bg-card focus:text-foreground rounded-none">
                      Cirurgia (mais próxima)
                    </SelectItem>
                    <SelectItem value={ORDEM_NOME} className="focus:bg-card focus:text-foreground rounded-none">
                      Nome (A–Z)
                    </SelectItem>
                  </SelectContent>
                </Select>
                {filtrosAtivos && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={limparFiltros}
                    className="rounded-none text-muted-foreground hover:text-accent hover:bg-card h-11 px-3 font-expanded text-[10px] tracking-widest uppercase shrink-0"
                  >
                    <X className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} /> Limpar
                  </Button>
                )}
              </div>
            </div>
          )}

          {listaExibida && listaExibida.length > 0 && filtrosAtivos && (
            <p className="-mt-2 text-xs font-light text-muted-foreground">
              <span className="font-mono">{listaFiltrada?.length ?? 0}</span>
              {" de "}
              <span className="font-mono">{listaExibida.length}</span>
              {" "}
              {listaExibida.length === 1 ? "paciente" : "pacientes"}
            </p>
          )}

          {carregandoLista ? (
            Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full bg-card rounded-none" />)
          ) : listaExibida?.length === 0 ? (
            aba === "ativos" ? (
              <div className="text-center py-16 px-6 border border-dashed border-border space-y-5">
                <p className="text-foreground font-serif text-2xl font-light">Nenhum paciente cadastrado ainda</p>
                <p className="text-muted-foreground font-light max-w-md mx-auto leading-relaxed">
                  Para começar, toque em <span className="text-foreground">Novo paciente</span> no topo. O Console vai gerar o link e as mensagens prontas para você revisar e entregar à paciente.
                </p>
                <Button
                  onClick={() => setIsDialogOpen(true)}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-none h-11 px-6 transition-all group"
                >
                  <Plus className="w-4 h-4 mr-2 opacity-50 group-hover:opacity-100 transition-opacity" />
                  Novo paciente
                </Button>
              </div>
            ) : (
              <div className="text-center py-20 border border-dashed border-border">
                <p className="text-muted-foreground font-light text-lg">Nenhum processo arquivado.</p>
              </div>
            )
          ) : listaFiltrada?.length === 0 ? (
            <div className="text-center py-16 px-6 border border-dashed border-border space-y-5">
              <p className="text-foreground font-serif text-2xl font-light">Nenhuma paciente encontrada</p>
              <p className="text-muted-foreground font-light max-w-md mx-auto leading-relaxed">
                Nenhum resultado para os filtros aplicados. Ajuste a busca ou limpe os filtros para ver todas as pacientes.
              </p>
              <Button
                onClick={limparFiltros}
                variant="ghost"
                className="rounded-none text-muted-foreground hover:text-accent hover:bg-card h-11 px-4 font-expanded text-[10px] tracking-widest uppercase"
              >
                <X className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} /> Limpar filtros
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              {listaFiltrada?.map((p) => (
                <Link key={p.id} href={`/paciente/${p.id}`}>
                  <Card className="bg-card border-transparent hover:border-accent/30 transition-all duration-300 rounded-none cursor-pointer group shadow-none relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-accent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <CardContent className="p-6 flex items-center justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-4">
                          <h3 className="font-serif text-2xl text-foreground group-hover:text-accent transition-colors">{p.nome}</h3>
                          {p.leituraConfirmadaEm && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className="inline-flex items-center justify-center w-5 h-5 border border-accent/60 text-accent cursor-help shrink-0"
                                  aria-label="Paciente confirmou que leu as informações"
                                >
                                  <Check className="w-3 h-3" strokeWidth={2.5} />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[240px] bg-card border border-accent/40 text-foreground rounded-none font-light text-xs leading-relaxed">
                                <span className="block font-medium mb-1">Confirmou a leitura</span>
                                A paciente marcou "Li e estou ciente" em {format(parseISO(p.leituraConfirmadaEm), "dd/MM/yyyy 'às' HH:mm")}.
                              </TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className={`rounded-none font-expanded text-[9px] uppercase tracking-widest px-2.5 py-0.5 border cursor-help ${corDoMarco(p.marcoAtual)}`}>
                                {rotuloDoMarco(p.marcoAtualRotulo)}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[240px] bg-card border border-accent/30 text-foreground rounded-none font-light text-xs leading-relaxed">
                              <span className="block font-medium mb-1">{ajudaDoMarco(p.marcoAtual).resumo}</span>
                              {ajudaDoMarco(p.marcoAtual).detalhe}
                            </TooltipContent>
                          </Tooltip>
                          {/* Resumo leve por documento (sempre visível): se foi
                              enviado à assinatura e o status geral. "quem assinou"
                              por parte fica na ficha/gerador (sem consulta extra
                              aqui, pra não pesar a home). */}
                          {[
                            {
                              rotulo: "Contrato",
                              temDoc: !!(p.contratoAutentiqueId || p.contratoLinkAssinaturaManual),
                              status: p.contratoStatus,
                            },
                            {
                              rotulo: "Termo",
                              temDoc: !!(p.termoAutentiqueId || p.termoLinkAssinaturaManual),
                              status: p.termoStatus,
                            },
                          ].map((doc) =>
                            doc.temDoc ? (
                              <Badge
                                key={doc.rotulo}
                                variant="outline"
                                className={`rounded-none font-expanded text-[9px] uppercase tracking-widest px-2.5 py-0.5 border inline-flex items-center ${contratoVisual(doc.status).className}`}
                              >
                                {doc.status === "assinado" && <Check className="w-2.5 h-2.5 mr-1 text-accent" strokeWidth={2.5} />}
                                {doc.rotulo} · {contratoVisual(doc.status).label}
                              </Badge>
                            ) : (
                              <Badge
                                key={doc.rotulo}
                                variant="outline"
                                className="rounded-none font-expanded text-[9px] uppercase tracking-widest px-2.5 py-0.5 border border-muted-foreground/25 text-muted-foreground/50 inline-flex items-center"
                              >
                                {doc.rotulo} · não enviado
                              </Badge>
                            ),
                          )}
                          {precisaAlertaAbertura(p) && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="rounded-none font-expanded text-[9px] uppercase tracking-widest px-2.5 py-0.5 border bg-red-500/10 text-red-300 border-red-400/50 inline-flex items-center cursor-help">
                                  <AlertTriangle className="w-2.5 h-2.5 mr-1" strokeWidth={2} />
                                  Não abriu
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[240px] bg-card border border-red-400/40 text-foreground rounded-none font-light text-xs leading-relaxed">
                                <span className="block font-medium mb-1">Ainda não abriu o link</span>
                                Cirurgia em até {DIAS_ALERTA_ABERTURA} dias e nenhuma abertura registrada. Faça um follow-up com a paciente.
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {(() => {
                            const marco = statusPrazoContrato(p);
                            if (!marco) return null;
                            const cls = CLASSE_URGENCIA[marco.urgencia];
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge
                                    variant="outline"
                                    className={`rounded-none font-expanded text-[9px] uppercase tracking-widest px-2.5 py-0.5 border inline-flex items-center cursor-help ${cls.badge}`}
                                  >
                                    <CalendarClock className="w-2.5 h-2.5 mr-1" strokeWidth={2} />
                                    Contrato · {marco.rotulo}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className={`max-w-[240px] bg-card border text-foreground rounded-none font-light text-xs leading-relaxed ${cls.tip}`}>
                                  <span className="block font-medium mb-1">
                                    {marco.urgencia === "critico"
                                      ? "Contrato não assinado — prazo crítico"
                                      : `Contrato não assinado — cirurgia em ~${marco.horas}h`}
                                  </span>
                                  Cirurgia em {format(parseISO(p.dataCirurgia), "dd/MM/yyyy")}
                                  {p.contratoPrazo && (
                                    <> · assinar até {format(parseISO(p.contratoPrazo), "dd/MM/yyyy")}</>
                                  )}
                                  .
                                </TooltipContent>
                              </Tooltip>
                            );
                          })()}
                          {(() => {
                            const marco = statusPrazoTermo(p);
                            if (!marco) return null;
                            const cls = CLASSE_URGENCIA[marco.urgencia];
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge
                                    variant="outline"
                                    className={`rounded-none font-expanded text-[9px] uppercase tracking-widest px-2.5 py-0.5 border inline-flex items-center cursor-help ${cls.badge}`}
                                  >
                                    <CalendarClock className="w-2.5 h-2.5 mr-1" strokeWidth={2} />
                                    Termo · {marco.rotulo}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className={`max-w-[240px] bg-card border text-foreground rounded-none font-light text-xs leading-relaxed ${cls.tip}`}>
                                  <span className="block font-medium mb-1">
                                    {marco.urgencia === "critico"
                                      ? "Termo não assinado — prazo crítico"
                                      : `Termo não assinado — cirurgia em ~${marco.horas}h`}
                                  </span>
                                  Cirurgia em {format(parseISO(p.dataCirurgia), "dd/MM/yyyy")}
                                  {p.termoPrazo && (
                                    <> · assinar até {format(parseISO(p.termoPrazo), "dd/MM/yyyy")}</>
                                  )}
                                  .
                                </TooltipContent>
                              </Tooltip>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                          <span className="font-light">{p.procedimentos.join(" · ")}</span>
                          <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                          <span className="font-mono text-xs opacity-80">{format(parseISO(p.dataCirurgia), "dd/MM/yyyy")} · {p.horario}</span>
                          <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                          {(() => {
                            const dias = diasParaCirurgia(p.dataCirurgia);
                            const texto =
                              dias > 1
                                ? `em ${dias} dias`
                                : dias === 1
                                  ? "amanhã"
                                  : dias === 0
                                    ? "hoje"
                                    : dias === -1
                                      ? "há 1 dia"
                                      : `há ${-dias} dias`;
                            const proximo = dias >= 0 && dias <= 2;
                            return (
                              <span
                                className={`font-mono text-xs ${
                                  proximo
                                    ? "text-accent"
                                    : dias < 0
                                      ? "text-muted-foreground/50"
                                      : "opacity-80"
                                }`}
                              >
                                cirurgia {texto}
                              </span>
                            );
                          })()}
                          <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                          <span className="font-expanded text-[9px] uppercase tracking-widest text-accent/80">
                            {p.vendedoraNome ?? "Sem responsável"}
                          </span>
                        </div>
                        <MiniLinhaTempo
                          jornada={config?.jornadaEquipe ?? []}
                          marcoAtual={p.marcoAtual}
                          marcosConcluidos={p.marcosConcluidos}
                        />
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {precisaAlertaAbertura(p) && p.telefone && (
                          <div className="flex flex-col items-end gap-1.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    lembrarPaciente(p);
                                  }}
                                  className={
                                    p.lembreteEnviadoEm
                                      ? "rounded-none border-border text-muted-foreground hover:bg-card hover:text-foreground h-9 px-3 font-expanded text-[9px] tracking-widest uppercase"
                                      : "rounded-none border-red-400/40 text-red-300 hover:bg-red-500/10 hover:text-red-200 h-9 px-3 font-expanded text-[9px] tracking-widest uppercase"
                                  }
                                >
                                  <MessageCircle className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
                                  {p.lembreteEnviadoEm ? "Lembrar de novo" : "Lembrar pelo WhatsApp"}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[240px] bg-card border border-red-400/40 text-foreground rounded-none font-light text-xs leading-relaxed">
                                {p.lembreteEnviadoEm
                                  ? "Um lembrete já foi registrado. Você pode reenviar se precisar."
                                  : "Abre o WhatsApp da paciente com uma mensagem curta e o link já preenchidos, e registra o follow-up."}
                              </TooltipContent>
                            </Tooltip>
                            {p.lembreteEnviadoEm && (
                              <span className="font-expanded text-[8px] tracking-widest uppercase text-muted-foreground/70 inline-flex items-center gap-1">
                                <Check className="w-2.5 h-2.5 text-accent" strokeWidth={2.5} />
                                {p.lembradoPor
                                  ? `Lembrado por ${p.lembradoPor} em ${format(parseISO(p.lembreteEnviadoEm), "dd/MM")}`
                                  : `Lembrado em ${format(parseISO(p.lembreteEnviadoEm), "dd/MM")}`}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="text-card group-hover:text-accent transition-colors">
                          <ChevronRight className="w-6 h-6" strokeWidth={1} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </motion.section>
      </motion.main>

      <Dialog open={showGuide} onOpenChange={(open) => { if (!open) dismissGuide(); }}>
        <DialogContent className="bg-background border border-border text-foreground rounded-none sm:max-w-[520px] p-0 overflow-hidden shadow-2xl">
          <div className="h-1 w-full bg-accent"></div>
          <div className="p-8">
            <DialogHeader className="mb-6">
              <DialogTitle className="font-serif text-3xl font-light text-foreground">Como funciona</DialogTitle>
              <p className="text-muted-foreground font-light text-sm pt-1">
                Um passo a passo rápido para conduzir cada paciente do cadastro até a cirurgia.
              </p>
            </DialogHeader>
            <ol className="space-y-5">
              {[
                { t: "Cadastre a paciente", d: "Toque em \"Novo paciente\" e preencha os dados. Use os atalhos de procedimento para preencher mais rápido." },
                { t: "Revise os dados", d: "Confira tudo na tela de revisão antes de gerar o link e as mensagens." },
                { t: "Aprove o handoff", d: "Na ficha da paciente, revise os blocos de mensagem e aprove para liberar o envio." },
                { t: "Entregue à paciente", d: "Copie a mensagem principal com o link e envie pelo WhatsApp. Os envios ao centro cirúrgico e à anestesia ficam logo abaixo." },
                { t: "Acompanhe os estágios", d: "As etiquetas mostram em que fase cada paciente está — passe o cursor sobre elas para ver o significado." },
              ].map((step, idx) => (
                <li key={idx} className="flex gap-4">
                  <span className="font-mono text-accent text-lg shrink-0 w-7">{String(idx + 1).padStart(2, "0")}</span>
                  <div className="space-y-1">
                    <p className="text-foreground font-light">{step.t}</p>
                    <p className="text-muted-foreground/80 font-light text-sm leading-relaxed">{step.d}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Button
              type="button"
              onClick={dismissGuide}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-12 text-base font-medium mt-8"
            >
              Entendi, vamos começar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={identDialogAberto}
        onOpenChange={(open) => {
          if (!open) {
            setIdentDialogAberto(false);
            setIdentPendente(null);
          }
        }}
      >
        <DialogContent className="bg-background border border-border text-foreground rounded-none sm:max-w-[440px] p-0 overflow-hidden shadow-2xl">
          <div className="h-1 w-full bg-accent"></div>
          <div className="p-8">
            <DialogHeader className="mb-4">
              <DialogTitle className="font-serif text-2xl font-light text-foreground">
                Quem está enviando?
              </DialogTitle>
              <DialogDescription className="text-muted-foreground font-light text-sm pt-1">
                Seu nome fica registrado no lembrete para a equipe saber quem fez o follow-up. Guardamos só neste navegador.
              </DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              value={identRascunho}
              onChange={(e) => setIdentRascunho(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmarIdentidade();
              }}
              placeholder="Seu nome (ex.: Ana)"
              className="bg-background border-border focus-visible:ring-1 focus-visible:ring-ring rounded-none h-11 text-foreground placeholder:text-muted-foreground/50"
            />
            <DialogFooter className="mt-6">
              <Button
                type="button"
                onClick={confirmarIdentidade}
                disabled={!identRascunho.trim()}
                className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-11 px-6 font-expanded text-[10px] tracking-widest uppercase"
              >
                <MessageCircle className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
                Enviar lembrete
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}

function VendedorasDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: vendedoras, isLoading } = useListarVendedoras(
    { incluirInativas: true },
    {
      query: {
        enabled: open,
        queryKey: getListarVendedorasQueryKey({ incluirInativas: true }),
      },
    },
  );
  const criarVendedora = useCriarVendedora();
  const atualizarVendedora = useAtualizarVendedora();
  const { toast } = useToast();
  const [novoNome, setNovoNome] = useState("");

  const invalidar = () =>
    queryClient.invalidateQueries({ queryKey: getListarVendedorasQueryKey() });

  const adicionar = () => {
    const nome = novoNome.trim();
    if (!nome) return;
    criarVendedora.mutate(
      { data: { nome } },
      {
        onSuccess: () => {
          invalidar();
          setNovoNome("");
        },
        onError: (error) => {
          toast(
            toastErroAcao(error, {
              title: "Não foi possível adicionar a vendedora",
              description: "Tente novamente em instantes.",
            }),
          );
        },
      },
    );
  };

  const alternarAtivo = (id: number, ativo: boolean) => {
    atualizarVendedora.mutate(
      { id, data: { ativo } },
      {
        onSuccess: invalidar,
        onError: (error) => {
          toast(
            toastErroAcao(error, {
              title: "Não foi possível atualizar a vendedora",
              description: "Tente novamente em instantes.",
            }),
          );
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="rounded-none text-muted-foreground hover:text-accent hover:bg-card h-10 font-expanded text-[10px] tracking-widest uppercase">
          <Users className="w-4 h-4 mr-2" /> Vendedoras
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-background border border-border text-foreground rounded-none sm:max-w-[460px] p-0 overflow-hidden shadow-2xl">
        <div className="h-1 w-full bg-accent"></div>
        <div className="p-8">
          <DialogHeader className="mb-6">
            <DialogTitle className="font-serif text-3xl font-light text-foreground">Vendedoras</DialogTitle>
          </DialogHeader>

          <div className="flex gap-2 mb-6">
            <Input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  adicionar();
                }
              }}
              placeholder="Nome da vendedora"
              className="bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-11 text-foreground placeholder:text-muted-foreground/50"
            />
            <Button
              onClick={adicionar}
              disabled={criarVendedora.isPending || !novoNome.trim()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-11 px-4 shrink-0"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-px bg-card">
            {isLoading ? (
              Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-14 w-full bg-background rounded-none" />)
            ) : vendedoras?.length === 0 ? (
              <p className="text-muted-foreground font-light text-sm py-8 text-center bg-background">Nenhuma vendedora cadastrada.</p>
            ) : (
              vendedoras?.map((v) => (
                <div key={v.id} className="flex items-center justify-between bg-background px-4 py-3">
                  <span className={`font-light ${v.ativo ? "text-foreground" : "text-muted-foreground/50 line-through"}`}>
                    {v.nome}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground">
                      {v.ativo ? "Ativa" : "Inativa"}
                    </span>
                    <Switch
                      checked={v.ativo}
                      onCheckedChange={(checked) => alternarAtivo(v.id, checked)}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
