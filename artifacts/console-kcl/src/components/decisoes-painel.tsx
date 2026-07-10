import { useMemo } from "react";
import type {
  DecisaoRegiao,
  DecisaoRegiaoInput,
} from "@workspace/api-client-react";
import { Check, CircleCheck, SlidersHorizontal, Loader2 } from "lucide-react";

/**
 * Painel de Decisões do motor de cláusulas — a superfície de "auto-inferir +
 * confirmar". Lista cada `variante`/`opcional`/`genero` inferida na geração com
 * o valor sugerido, a ORIGEM (o porquê) e o controle para trocar/confirmar.
 *
 * Não parseia o texto: opera sobre o snapshot de decisões da geração. Qualquer
 * ação chama `onAplicar` com as decisões CONFIRMADAS (as já confirmadas + a que
 * o operador acabou de mexer) — o servidor regenera o corpo de forma
 * determinística; as pendentes não enviadas são re-inferidas. A troca de uma
 * opção pode re-inferir outra encadeada (ex.: exames → Cláusula 5.1).
 */
export interface DecisoesPainelProps {
  decisoes: DecisaoRegiao[];
  /** Aplica as decisões confirmadas (regera o documento no servidor). */
  onAplicar: (previas: DecisaoRegiaoInput[]) => void;
  aplicando: boolean;
  /** Trava os controles (ex.: documento não é mais rascunho). */
  desabilitado?: boolean;
}

function toInput(d: DecisaoRegiao): DecisaoRegiaoInput {
  return { id: d.id, tipo: d.tipo, valor: d.valor, incluido: d.incluido };
}

export function DecisoesPainel({
  decisoes,
  onAplicar,
  aplicando,
  desabilitado = false,
}: DecisoesPainelProps) {
  const pendencias = useMemo(
    () => decisoes.filter((d) => !d.confirmado).length,
    [decisoes],
  );

  // previas = todas as decisões JÁ confirmadas + a mudança atual (merge por id).
  // As pendentes ficam de fora e são re-inferidas pelo servidor (preserva o
  // encadeamento e o estado "pendente" de quem o operador ainda não decidiu).
  function aplicarCom(mudanca: DecisaoRegiaoInput) {
    const mapa = new Map<string, DecisaoRegiaoInput>();
    for (const d of decisoes) if (d.confirmado) mapa.set(d.id, toInput(d));
    mapa.set(mudanca.id, mudanca);
    onAplicar([...mapa.values()]);
  }

  const bloqueado = desabilitado || aplicando;

  return (
    <div className="border border-border/60 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal
            className="w-4 h-4 text-accent"
            strokeWidth={1.8}
          />
          <h4 className="font-expanded text-[10px] tracking-widest uppercase text-foreground">
            Decisões do documento
          </h4>
        </div>
        {pendencias > 0 ? (
          <span className="font-mono text-[10px] tracking-wider uppercase border border-amber-500/60 text-amber-500 px-2 py-0.5">
            {pendencias} pendente{pendencias > 1 ? "s" : ""}
          </span>
        ) : (
          <span className="font-mono text-[10px] tracking-wider uppercase border border-accent/50 text-accent px-2 py-0.5 flex items-center gap-1">
            <Check className="w-3 h-3" strokeWidth={2.5} /> confirmadas
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground font-light leading-relaxed">
        O sistema inferiu cada escolha a partir dos dados da paciente e da médica.
        Confirme ou ajuste — o texto e a numeração são regerados automaticamente.
        Mudar decisões descarta ajustes manuais de texto.
      </p>

      {aplicando && (
        <p className="text-[11px] text-accent font-light flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.8} />
          Regerando o documento...
        </p>
      )}

      <ul className="space-y-3">
        {decisoes.map((d) => (
          <li
            key={d.id}
            className="border border-border/50 bg-background/40 p-3 space-y-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-[13px] font-medium text-foreground leading-tight">
                {d.rotulo}
              </span>
              <EstadoBadge decisao={d} />
            </div>

            <ControleDecisao
              decisao={d}
              bloqueado={bloqueado}
              onEscolher={aplicarCom}
            />

            {d.origem && (
              <p className="text-[11px] text-muted-foreground font-light leading-snug">
                {d.origem}
              </p>
            )}

            {!d.confirmado && (
              <button
                type="button"
                disabled={bloqueado}
                onClick={() => aplicarCom(toInput(d))}
                className="w-full h-8 border border-accent/50 text-accent text-[11px] font-medium uppercase tracking-wider hover:bg-accent/10 transition-colors disabled:opacity-40"
              >
                Confirmar
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EstadoBadge({ decisao }: { decisao: DecisaoRegiao }) {
  if (!decisao.confirmado) {
    return (
      <span className="shrink-0 font-mono text-[9px] tracking-wider uppercase border border-amber-500/60 text-amber-500 px-1.5 py-0.5">
        pendente
      </span>
    );
  }
  if (decisao.editado) {
    return (
      <span className="shrink-0 font-mono text-[9px] tracking-wider uppercase border border-accent/50 text-accent px-1.5 py-0.5">
        ajustado
      </span>
    );
  }
  return (
    <span className="shrink-0 flex items-center gap-1 font-mono text-[9px] tracking-wider uppercase text-muted-foreground">
      <CircleCheck className="w-3 h-3 text-accent" strokeWidth={2} />
      confirmado
    </span>
  );
}

function ControleDecisao({
  decisao,
  bloqueado,
  onEscolher,
}: {
  decisao: DecisaoRegiao;
  bloqueado: boolean;
  onEscolher: (m: DecisaoRegiaoInput) => void;
}) {
  // opcional: incluir / omitir.
  if (decisao.tipo === "opcional") {
    const incluido = decisao.incluido ?? false;
    return (
      <div className="grid grid-cols-2 gap-1 bg-muted/40 p-1">
        {[
          { v: true, label: "Incluir" },
          { v: false, label: "Omitir" },
        ].map((op) => (
          <button
            key={String(op.v)}
            type="button"
            disabled={bloqueado}
            aria-pressed={incluido === op.v}
            onClick={() =>
              incluido !== op.v &&
              onEscolher({ id: decisao.id, tipo: decisao.tipo, incluido: op.v })
            }
            className={`h-8 text-[12px] font-medium transition-colors disabled:opacity-40 ${
              incluido === op.v
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {op.label}
          </button>
        ))}
      </div>
    );
  }

  // variante / genero: escolher 1 das opções.
  const opcoes = decisao.opcoes ?? [];
  return (
    <div className="flex flex-wrap gap-1 bg-muted/40 p-1">
      {opcoes.map((op) => {
        const ativo = decisao.valor === op.valor;
        return (
          <button
            key={op.valor}
            type="button"
            disabled={bloqueado}
            aria-pressed={ativo}
            onClick={() =>
              !ativo &&
              onEscolher({ id: decisao.id, tipo: decisao.tipo, valor: op.valor })
            }
            className={`h-8 px-3 text-[12px] font-medium transition-colors disabled:opacity-40 ${
              ativo
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {op.label}
          </button>
        );
      })}
    </div>
  );
}
