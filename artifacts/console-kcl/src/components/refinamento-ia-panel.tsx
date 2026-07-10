import { useState } from "react";
import {
  useRefinarIaDocumento,
  type ContratoGeracao,
  type TurnoConversaIa,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  geracaoId: number;
  /** Turnos já aplicados (auditoria) — exibidos como histórico. */
  conversa?: TurnoConversaIa[] | null;
  /** Chamado com a geração atualizada após aplicar o refino. */
  onRefinado: (g: ContratoGeracao) => void;
}

/**
 * Painel de refino por chat de um documento redigido por IA: o operador descreve
 * uma alteração em linguagem natural e a IA reescreve o documento aplicando só o
 * pedido, preservando o resto. Disponível enquanto o documento está em rascunho.
 */
export function RefinamentoIaPanel({ geracaoId, conversa, onRefinado }: Props) {
  const { toast } = useToast();
  const refinar = useRefinarIaDocumento();
  const [instrucao, setInstrucao] = useState("");

  async function handleAplicar() {
    const texto = instrucao.trim();
    if (!texto) return;
    try {
      const atualizado = await refinar.mutateAsync({
        id: geracaoId,
        data: { instrucao: texto },
      });
      setInstrucao("");
      onRefinado(atualizado);
      toast({
        title: "Alteração aplicada",
        description: "A IA atualizou o documento. Confira o texto ao lado.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Não foi possível aplicar a alteração",
        description: "A IA não respondeu agora. Tente novamente.",
      });
    }
  }

  return (
    <div className="border border-border/60 p-5 space-y-4">
      <div className="space-y-1">
        <h4 className="font-expanded text-[10px] tracking-widest uppercase text-foreground flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-accent" strokeWidth={1.5} />
          Pedir alteração à IA
        </h4>
        <p className="text-xs text-muted-foreground font-light leading-relaxed">
          Descreva o que mudar (ex.: “troque o Foro para Campinas”, “adicione a
          cláusula de flexibilidade de reagendamento por saúde”, “corrija o valor do
          saldo para R$ 9.700”). A IA reescreve preservando o restante do documento.
        </p>
      </div>

      {conversa && conversa.length > 0 && (
        <ul className="space-y-1.5 border-l border-accent/30 pl-3">
          {conversa.map((t, i) => (
            <li key={i} className="text-[11px] text-muted-foreground font-light leading-relaxed">
              {t.instrucao}
            </li>
          ))}
        </ul>
      )}

      <textarea
        value={instrucao}
        onChange={(e) => setInstrucao(e.target.value)}
        rows={3}
        placeholder="Descreva a alteração que a IA deve aplicar…"
        className="w-full rounded-none bg-background border border-border/60 focus:border-border p-3 text-sm font-light leading-relaxed resize-y"
      />

      <Button
        onClick={handleAplicar}
        disabled={!instrucao.trim() || refinar.isPending}
        variant="outline"
        className="rounded-none border-accent/40 bg-transparent hover:bg-background text-accent hover:text-accent h-10 px-5 font-medium gap-2"
      >
        {refinar.isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
        ) : (
          <Sparkles className="w-4 h-4" strokeWidth={1.5} />
        )}
        {refinar.isPending ? "Aplicando…" : "Aplicar alteração"}
      </Button>
    </div>
  );
}
