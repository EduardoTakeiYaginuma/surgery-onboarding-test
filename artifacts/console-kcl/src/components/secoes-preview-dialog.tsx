import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { type SecaoConteudo } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SecoesPublicas } from "@/components/secoes-publicas";
import { etapaAtual, contagemRegressiva } from "@/lib/patient-tools";
import { resolverSecoesPreview, type DadosPreview } from "@/lib/secoes-preview";
import { differenceInCalendarDays, parseISO } from "date-fns";

/** Limites do controle fino de dias até a cirurgia na pré-visualização. */
const DIAS_MIN = -7;
const DIAS_MAX_PADRAO = 30;

/**
 * Os 5 momentos da jornada que a equipe pode simular na pré-visualização —
 * alinhados a `etapaAtual` (mesmos índices). Cada um traz um nº representativo
 * de dias até a cirurgia para mover a contagem regressiva junto com a etapa.
 */
const ETAPAS_JORNADA: { rotulo: string; dias: number }[] = [
  { rotulo: "Reserva confirmada", dias: 21 },
  { rotulo: "7 a 10 dias antes", dias: 7 },
  { rotulo: "Véspera", dias: 1 },
  { rotulo: "Dia da cirurgia", dias: 0 },
  { rotulo: "Pós-operatório", dias: -3 },
];

/**
 * Pré-visualização do conteúdo editável renderizada exatamente como a página
 * pública da paciente (mesmos componentes, mesmo território claro). As variáveis
 * são substituídas com os dados informados (exemplo no editor global, dados
 * reais na tela da paciente). É um espelho visual — sem persistência nem ações.
 */
export function SecoesPreviewDialog({
  aberto,
  onOpenChange,
  secoes,
  dados,
}: {
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
  secoes: SecaoConteudo[];
  dados: DadosPreview;
}) {
  const resolvidas = useMemo(() => resolverSecoesPreview(secoes, dados), [secoes, dados]);

  const diasReais = useMemo(() => {
    try {
      return differenceInCalendarDays(parseISO(dados.dataCirurgia), new Date());
    } catch {
      return 0;
    }
  }, [dados.dataCirurgia]);

  // Dias até a cirurgia simulados pela equipe. `null` = usa os dias reais
  // calculados pela data da cirurgia. Ao reabrir o modal, volta ao momento real.
  const [diasSimulado, setDiasSimulado] = useState<number | null>(null);
  useEffect(() => {
    if (aberto) setDiasSimulado(null);
  }, [aberto]);

  // O slider precisa alcançar o dia real mesmo quando a cirurgia está distante.
  const diasMax = Math.max(DIAS_MAX_PADRAO, diasReais);

  // Dia efetivo da pré-visualização: o simulado quando há um, senão o real.
  // A etapa, o destaque da linha do tempo e a contagem derivam todos dele —
  // então as etapas e o controle de dias ficam sempre em sincronia.
  const diasEfetivos = diasSimulado ?? diasReais;
  const passoAtual = etapaAtual(diasEfetivos);
  const contagem = contagemRegressiva(diasEfetivos);

  const ajustarDias = (valor: number) => {
    if (Number.isNaN(valor)) return;
    setDiasSimulado(Math.min(diasMax, Math.max(DIAS_MIN, Math.round(valor))));
  };
  const dataFmt = (() => {
    const [ano, mes, dia] = dados.dataCirurgia.split("-");
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : dados.dataCirurgia;
  })();
  const primeiroNome = dados.nome.trim().split(/\s+/)[0] ?? dados.nome;

  // The preview mirrors the patient page in whatever register the Console is
  // currently in: the patient page's own editorial light/dark, scoped via the
  // `.paciente` token set, following the Console's resolved theme.
  const { resolvedTheme } = useTheme();
  const temaClasse = `paciente${resolvedTheme === "dark" ? " paciente-dark" : ""}`;

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className={`${temaClasse} max-w-3xl w-[calc(100vw-2rem)] h-[calc(100dvh-3rem)] p-0 gap-0 rounded-none border-[var(--pp-accent)]/30 bg-[var(--pp-bg)] overflow-hidden flex flex-col`}>
        <DialogHeader className="px-6 py-4 border-b border-[var(--pp-accent)]/20 bg-[var(--pp-bg)] shrink-0">
          <DialogTitle className="font-serif text-2xl italic text-[var(--pp-accent)]">
            Pré-visualização da página
          </DialogTitle>
          <DialogDescription className="font-light text-sm text-[var(--pp-text)]/70">
            É assim que a paciente vê o conteúdo. Variáveis preenchidas com{" "}
            <span className="font-medium">{dados.nome}</span> · {dataFmt} · {contagem}.
          </DialogDescription>

          <div className="pt-3 space-y-2">
            <p className="font-expanded text-[9px] tracking-widest uppercase text-[var(--pp-accent)]">
              Simular momento da jornada
            </p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Momento da jornada">
              {ETAPAS_JORNADA.map((etapa, idx) => {
                const ativo = idx === passoAtual;
                return (
                  <button
                    key={etapa.rotulo}
                    type="button"
                    onClick={() => ajustarDias(etapa.dias)}
                    aria-pressed={ativo}
                    className={cn(
                      "font-expanded text-[9px] tracking-widest uppercase px-3 py-1.5 border transition-colors",
                      ativo
                        ? "bg-[var(--pp-strong)] border-[var(--pp-strong)] text-[var(--pp-on-strong)]"
                        : "border-[var(--pp-accent)]/30 text-[var(--pp-text)]/70 hover:border-[var(--pp-accent)]/70 hover:text-[var(--pp-text)]",
                    )}
                  >
                    {etapa.rotulo}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3 pt-1">
              <label
                htmlFor="preview-dias"
                className="font-expanded text-[9px] tracking-widest uppercase text-[var(--pp-accent)] shrink-0"
              >
                Dias até a cirurgia
              </label>
              <input
                id="preview-dias"
                type="range"
                min={DIAS_MIN}
                max={diasMax}
                step={1}
                value={diasEfetivos}
                onChange={(e) => ajustarDias(e.target.valueAsNumber)}
                aria-label="Dias até a cirurgia"
                className="flex-1 h-1.5 accent-[var(--pp-strong)] cursor-pointer"
              />
              <input
                type="number"
                min={DIAS_MIN}
                max={diasMax}
                step={1}
                value={diasEfetivos}
                onChange={(e) => ajustarDias(e.target.valueAsNumber)}
                aria-label="Dias até a cirurgia (número)"
                className="w-16 shrink-0 bg-transparent border border-[var(--pp-accent)]/30 px-2 py-1 font-mono text-sm text-[var(--pp-text)] text-center focus:outline-none focus:border-[var(--pp-accent)]/70"
              />
            </div>
            <p className="font-mono text-[10px] text-[var(--pp-text)]/50">
              {contagem}
              {diasSimulado !== null && diasEfetivos !== diasReais ? " · simulado" : ""}
            </p>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-[var(--pp-bg)] text-[var(--pp-text)] font-sans selection:bg-[var(--pp-accent)]/20">
          {resolvidas.length === 0 ? (
            <div className="h-full flex items-center justify-center p-10 text-center">
              <p className="font-light text-[var(--pp-text)]/60 max-w-sm leading-relaxed">
                Nenhuma seção para pré-visualizar ainda. Adicione seções no editor para vê-las aqui.
              </p>
            </div>
          ) : (
            <main className="max-w-2xl mx-auto px-6 py-12 space-y-24">
              <SecoesPublicas
                secoes={resolvidas}
                passoAtual={passoAtual}
                feito={{}}
                toggle={() => {}}
                primeiroNome={primeiroNome}
                dataFmt={dataFmt}
                horario={dados.horario}
                animar={false}
              />
            </main>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
