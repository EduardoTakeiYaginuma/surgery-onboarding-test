import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  useObterConteudoPadrao,
  useAtualizarConteudoPadrao,
  getObterConteudoPadraoQueryKey,
  useObterConfig,
  useDefinirTemaPadrao,
  getObterConfigQueryKey,
  type SecaoConteudo,
} from "@workspace/api-client-react";
import { Sun, Moon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { SecoesEditor } from "@/components/secoes-editor";
import { DiscardChangesDialog } from "@/components/discard-changes-dialog";
import { EstratosLogo } from "./console-home";
import { ThemeToggle } from "@/components/theme-toggle";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

export default function ConsoleConteudo() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data, isLoading, isError } = useObterConteudoPadrao({
    query: { queryKey: getObterConteudoPadraoQueryKey() },
  });
  const { data: config } = useObterConfig({
    query: { queryKey: getObterConfigQueryKey() },
  });
  const atualizar = useAtualizarConteudoPadrao();
  const definirTema = useDefinirTemaPadrao();

  const [secoes, setSecoes] = useState<SecaoConteudo[] | null>(null);
  const [baseline, setBaseline] = useState<SecaoConteudo[] | null>(null);
  const [tema, setTema] = useState<"light" | "dark" | null>(null);
  const [temaBaseline, setTemaBaseline] = useState<"light" | "dark" | null>(null);
  const [descartarAberto, setDescartarAberto] = useState(false);

  useEffect(() => {
    if (data && secoes === null) {
      setSecoes(data.secoes);
      setBaseline(data.secoes);
    }
  }, [data, secoes]);

  useEffect(() => {
    if (config && tema === null) {
      setTema(config.temaPadrao);
      setTemaBaseline(config.temaPadrao);
    }
  }, [config, tema]);

  const dirty =
    (baseline !== null &&
      secoes !== null &&
      JSON.stringify(secoes) !== JSON.stringify(baseline)) ||
    (temaBaseline !== null && tema !== null && tema !== temaBaseline);

  useUnsavedChanges(dirty, () => setDescartarAberto(true));

  function tentarSair() {
    if (dirty) {
      setDescartarAberto(true);
    } else {
      setLocation("/");
    }
  }

  async function salvar() {
    if (!secoes || !tema) return;
    const secoesDirty =
      baseline !== null && JSON.stringify(secoes) !== JSON.stringify(baseline);
    const temaDirty = temaBaseline !== null && tema !== temaBaseline;
    try {
      if (secoesDirty) {
        const res = await atualizar.mutateAsync({ data: { secoes } });
        setSecoes(res.secoes);
        setBaseline(res.secoes);
        queryClient.invalidateQueries({
          queryKey: getObterConteudoPadraoQueryKey(),
        });
      }
      if (temaDirty) {
        const res = await definirTema.mutateAsync({ data: { tema } });
        setTema(res.tema);
        setTemaBaseline(res.tema);
        queryClient.invalidateQueries({ queryKey: getObterConfigQueryKey() });
      }
      toast({
        title: "Padrão salvo",
        description: "As novas pacientes verão este conteúdo e registro por padrão.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Não foi possível salvar",
        description: "Tente novamente em instantes.",
      });
    }
  }

  const salvando = atualizar.isPending || definirTema.isPending;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground pb-24 font-sans selection:bg-accent/30">
      <header className="border-b border-border bg-background/90 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={tentarSair}
              aria-label="Voltar"
              className="text-muted-foreground hover:text-accent transition-colors p-2 -ml-2"
            >
              <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
            </button>
            <div className="w-px h-6 bg-card"></div>
            <EstratosLogo className="text-foreground" />
            <span className="font-expanded tracking-widest text-xs font-medium text-muted-foreground">CONTEÚDO PADRÃO</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-3xl mx-auto px-4 mt-12 space-y-10"
      >
        <header className="space-y-3">
          <h1 className="font-serif text-4xl md:text-5xl font-light tracking-tight text-foreground">
            Conteúdo padrão da página
          </h1>
          <p className="text-muted-foreground font-light text-lg leading-relaxed">
            Este é o conteúdo que toda paciente vê na página pública. Você pode personalizar cada paciente
            individualmente na tela dela — sem alterar este padrão.
          </p>
        </header>

        {isError ? (
          <div className="border border-dashed border-border p-8 text-center text-muted-foreground font-light">
            Não foi possível carregar o conteúdo padrão. Tente recarregar a página.
          </div>
        ) : isLoading || !secoes ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full bg-card rounded-none" />
            <Skeleton className="h-48 w-full bg-card rounded-none" />
          </div>
        ) : (
          <>
            <section className="space-y-4 border border-border p-6">
              <div className="space-y-1">
                <h2 className="font-serif text-2xl font-light tracking-tight text-foreground">
                  Registro padrão
                </h2>
                <p className="text-muted-foreground font-light leading-relaxed">
                  Com qual aparência o link de uma nova paciente abre no primeiro
                  acesso. Se ela trocar depois, a escolha dela passa a valer.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 max-w-md">
                {(
                  [
                    { valor: "light", rotulo: "Claro", Icone: Sun },
                    { valor: "dark", rotulo: "Escuro", Icone: Moon },
                  ] as const
                ).map(({ valor, rotulo, Icone }) => {
                  const ativo = tema === valor;
                  return (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => setTema(valor)}
                      aria-pressed={ativo}
                      className={`flex items-center gap-3 border px-4 h-14 transition-colors ${
                        ativo
                          ? "border-accent bg-accent/10 text-foreground"
                          : "border-border text-muted-foreground hover:border-accent/50 hover:text-foreground"
                      }`}
                    >
                      <Icone className="w-5 h-5" strokeWidth={1.5} />
                      <span className="font-medium">{rotulo}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <SecoesEditor secoes={secoes} onChange={setSecoes} />
            <div className="flex items-center justify-end gap-3 border-t border-border pt-6 sticky bottom-0 bg-background/95 backdrop-blur py-4">
              <Button
                onClick={salvar}
                disabled={salvando || !dirty}
                className="rounded-none bg-primary hover:bg-primary/90 text-primary-foreground font-medium h-12 px-8"
              >
                {salvando ? "Salvando..." : "Salvar padrão"}
              </Button>
            </div>
          </>
        )}
      </motion.main>

      <DiscardChangesDialog
        open={descartarAberto}
        onOpenChange={setDescartarAberto}
        onConfirm={() => {
          setDescartarAberto(false);
          setLocation("/");
        }}
      />
    </div>
  );
}
