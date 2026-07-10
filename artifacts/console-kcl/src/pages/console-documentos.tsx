import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  useListarPacientes,
  useObterPaciente,
  getObterPacienteQueryKey,
} from "@workspace/api-client-react";
import {
  ArrowLeft,
  Search,
  ChevronRight,
  ChevronLeft,
  CalendarClock,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EstratosLogo } from "./console-home";
import { corDoMarco, rotuloDoMarco } from "@/lib/jornada-equipe";
import { ThemeToggle } from "@/components/theme-toggle";
import { GeradorDocumento } from "@/components/gerador-contrato";
import { motion } from "framer-motion";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

type DocTipo = "contrato" | "termo";

/**
 * Lê a pré-seleção (paciente + tipo) da query string. Usada quando se chega
 * aqui por um link da página da paciente (ex.: /documentos?paciente=12&tipo=termo).
 * A área lê o parâmetro uma única vez no carregamento; não o reescreve.
 */
function lerPreselecao(): { paciente: number | null; tipo: DocTipo } {
  if (typeof window === "undefined") return { paciente: null, tipo: "contrato" };
  const params = new URLSearchParams(window.location.search);
  const pid = Number(params.get("paciente"));
  return {
    paciente: Number.isInteger(pid) && pid > 0 ? pid : null,
    tipo: params.get("tipo") === "termo" ? "termo" : "contrato",
  };
}

export default function ConsoleDocumentos() {
  const [, setLocation] = useLocation();
  const preset = useMemo(lerPreselecao, []);
  const [tipo, setTipo] = useState<DocTipo>(preset.tipo);
  const [selecionadaId, setSelecionadaId] = useState<number | null>(
    preset.paciente,
  );
  const [busca, setBusca] = useState("");

  const { data: pacientes, isLoading, isError } = useListarPacientes();

  // Detalhe só é buscado quando há paciente escolhida; serve apenas para saber
  // se já existe documento vinculado (mensagem informativa do gerador).
  const { data: detalhe } = useObterPaciente(selecionadaId ?? 0, {
    query: {
      enabled: selecionadaId !== null,
      queryKey: getObterPacienteQueryKey(selecionadaId ?? 0),
    },
  });

  const selecionada = useMemo(
    () => (pacientes ?? []).find((p) => p.id === selecionadaId) ?? null,
    [pacientes, selecionadaId],
  );

  const buscaNorm = busca.trim().toLowerCase();
  const lista = useMemo(
    () =>
      (pacientes ?? [])
        .filter((p) => !buscaNorm || p.nome.toLowerCase().includes(buscaNorm))
        .slice()
        .sort((a, b) => a.dataCirurgia.localeCompare(b.dataCirurgia)),
    [pacientes, buscaNorm],
  );

  const jaVinculado =
    tipo === "termo"
      ? !!detalhe?.paciente.termoAutentiqueId
      : !!detalhe?.paciente.contratoAutentiqueId;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground pb-24 font-sans selection:bg-accent/30">
      <header className="border-b border-border bg-background/90 backdrop-blur-md sticky top-0 z-20">
        <div
          className={`${selecionada ? "max-w-7xl" : "max-w-4xl"} mx-auto px-4 h-16 flex items-center justify-between transition-[max-width] duration-300`}
        >
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setLocation("/")}
              className="text-muted-foreground hover:text-accent transition-colors p-2 -ml-2"
            >
              <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
            </button>
            <div className="w-px h-6 bg-card"></div>
            <EstratosLogo className="text-foreground" />
            <span className="font-expanded tracking-widest text-xs font-medium text-muted-foreground">
              GERAÇÃO DE DOCUMENTOS
            </span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={`${selecionada ? "max-w-7xl" : "max-w-4xl"} mx-auto px-4 mt-12 space-y-10 transition-[max-width] duration-300`}
      >
        <header className="space-y-3">
          <h1 className="font-serif text-4xl md:text-5xl font-light tracking-tight text-foreground">
            Gerar contratos e termos
          </h1>
          <p className="text-muted-foreground font-light text-lg leading-relaxed">
            Escolha uma paciente, crie o documento com o apoio da IA (ou suba um
            PDF pronto), revise, peça ajustes e aprove para enviar à Autentique. O
            acompanhamento da assinatura (link e status) fica na página de cada
            paciente.
          </p>
        </header>

        {selecionada ? (
          <div className="space-y-8">
            {/* Barra da paciente escolhida */}
            <div className="border border-border p-5 flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-serif text-2xl font-light tracking-tight text-foreground truncate">
                    {selecionada.nome}
                  </span>
                  <span
                    className={`font-expanded text-[9px] tracking-widest uppercase border px-2 py-0.5 ${corDoMarco(selecionada.marcoAtual)}`}
                  >
                    {rotuloDoMarco(selecionada.marcoAtualRotulo)}
                  </span>
                </div>
                <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground font-light">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock
                      className="w-3.5 h-3.5 text-muted-foreground/60"
                      strokeWidth={1.5}
                    />
                    Cirurgia em{" "}
                    {format(parseISO(selecionada.dataCirurgia), "dd/MM/yyyy", {
                      locale: ptBR,
                    })}
                  </span>
                  {selecionada.procedimentos.length > 0 && (
                    <span className="truncate">
                      {selecionada.procedimentos.join(", ")}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelecionadaId(null);
                    setBusca("");
                  }}
                  className="rounded-none border-border bg-transparent hover:bg-card text-muted-foreground hover:text-foreground h-10 px-4 gap-2"
                >
                  <ChevronLeft className="w-4 h-4" strokeWidth={1.5} />
                  Trocar paciente
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setLocation(`/paciente/${selecionada.id}`)}
                  className="rounded-none border-border bg-transparent hover:bg-card text-muted-foreground hover:text-accent h-10 px-4 gap-2"
                >
                  Acompanhamento
                  <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
                </Button>
              </div>
            </div>

            {/* Tipo de documento */}
            <Tabs value={tipo} onValueChange={(v) => setTipo(v as DocTipo)}>
              <TabsList className="flex h-auto justify-start gap-1 rounded-none bg-card/40 p-1.5">
                <TabsTrigger
                  value="contrato"
                  className="rounded-none font-expanded text-[10px] tracking-widest uppercase px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  Contrato
                </TabsTrigger>
                <TabsTrigger
                  value="termo"
                  className="rounded-none font-expanded text-[10px] tracking-widest uppercase px-4 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  Termo (TCLE)
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Gerador (remontado a cada paciente/tipo para zerar o estado) */}
            <GeradorDocumento
              key={`${selecionada.id}-${tipo}`}
              pacienteId={selecionada.id}
              pacienteNome={selecionada.nome}
              tipo={tipo}
              documentoJaVinculado={jaVinculado}
            />
          </div>
        ) : (
          <section className="space-y-4">
            <div className="space-y-1">
              <h2 className="font-serif text-2xl font-light tracking-tight text-foreground">
                Escolha a paciente
              </h2>
              <p className="text-muted-foreground font-light leading-relaxed">
                Selecione a paciente para quem você vai gerar o contrato ou o
                termo de consentimento.
              </p>
            </div>

            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60"
                strokeWidth={1.5}
              />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome"
                className="rounded-none h-12 pl-10 bg-background border-border"
              />
            </div>

            {isError ? (
              <div className="border border-dashed border-border p-8 text-center text-muted-foreground font-light">
                Não foi possível carregar as pacientes. Tente recarregar a
                página.
              </div>
            ) : isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full bg-card rounded-none" />
                <Skeleton className="h-16 w-full bg-card rounded-none" />
                <Skeleton className="h-16 w-full bg-card rounded-none" />
              </div>
            ) : lista.length === 0 ? (
              <div className="border border-dashed border-border p-10 text-center space-y-2">
                <ClipboardList
                  className="w-8 h-8 mx-auto text-muted-foreground/40"
                  strokeWidth={1.2}
                />
                <p className="text-muted-foreground font-light">
                  {buscaNorm
                    ? "Nenhuma paciente encontrada com esse nome."
                    : "Nenhuma paciente ativa no momento."}
                </p>
              </div>
            ) : (
              <div className="border border-border divide-y divide-border max-h-[28rem] overflow-y-auto">
                {lista.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelecionadaId(p.id)}
                    className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 bg-background hover:bg-card transition-colors group"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-foreground font-light truncate">
                          {p.nome}
                        </span>
                        <span
                          className={`font-expanded text-[9px] tracking-widest uppercase border px-2 py-0.5 ${corDoMarco(p.marcoAtual)}`}
                        >
                          {rotuloDoMarco(p.marcoAtualRotulo)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground/80 font-light truncate">
                        Cirurgia em{" "}
                        {format(parseISO(p.dataCirurgia), "dd/MM/yyyy", {
                          locale: ptBR,
                        })}
                        {p.procedimentos.length > 0
                          ? ` · ${p.procedimentos.join(", ")}`
                          : ""}
                      </p>
                    </div>
                    <ChevronRight
                      className="w-4 h-4 text-muted-foreground/40 group-hover:text-accent shrink-0"
                      strokeWidth={1.5}
                    />
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </motion.main>
    </div>
  );
}
