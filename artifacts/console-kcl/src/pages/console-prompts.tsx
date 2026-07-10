import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  useObterConfigPrompts,
  useDefinirConfigPrompts,
  getObterConfigPromptsQueryKey,
  type ConfigPrompts,
  type ConfigPromptItem,
} from "@workspace/api-client-react";
import { ArrowLeft, RotateCcw, Sparkles, FileText, FileCheck2, Wand2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { DiscardChangesDialog } from "@/components/discard-changes-dialog";
import { EstratosLogo } from "./console-home";
import { ThemeToggle } from "@/components/theme-toggle";
import { motion } from "framer-motion";

type PromptTipo = "contrato" | "termo" | "refino";

const PROMPT_MIN_LEN = 40;

const META: Record<
  PromptTipo,
  { rotulo: string; icone: typeof FileText; descricao: string }
> = {
  contrato: {
    rotulo: "Contrato",
    icone: FileText,
    descricao:
      "Instrui a IA a redigir o CONTRATO de prestação de serviços. O texto fixo das cláusulas (Seções IV a VII, Soberania Técnica, Assinatura Digital) está embutido aqui — edite com cuidado.",
  },
  termo: {
    rotulo: "Termo (TCLE)",
    icone: FileCheck2,
    descricao:
      "Instrui a IA a redigir o TERMO DE CONSENTIMENTO. As seções fixas (1, 2, 4, 5) estão embutidas; os riscos por procedimento e a seção de imagem entram pelos tokens.",
  },
  refino: {
    rotulo: "Refino",
    icone: Wand2,
    descricao:
      "Usado quando o operador pede um ajuste por chat depois do documento pronto. Deve mudar só o necessário, preservando o resto do texto.",
  },
};

/** Descrição amigável de cada token, para a legenda de cada prompt. */
const DESC_TOKEN: Record<string, string> = {
  CONCORDANCIA_GENERO:
    "Instrução de concordância de gênero (vira o texto para masculino/feminino).",
  DADOS: "Bloco com os dados do paciente/contrato preenchidos no formulário.",
  RISCOS_SELECIONADOS:
    "Blocos de risco APENAS dos procedimentos selecionados (Seção 3).",
  SECAO_6:
    "Seção 6 (LGPD) — texto de AUTORIZA / NÃO AUTORIZA uso de imagem.",
  TIPO_DOC: "Nome do documento em edição (contrato ou termo).",
};

const TIPOS: PromptTipo[] = ["contrato", "termo", "refino"];

/** Tokens obrigatórios que faltam no texto. */
function tokensFaltando(texto: string, tokens: string[]): string[] {
  return tokens.filter((t) => !texto.includes(`{{${t}}}`));
}

export default function ConsolePrompts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data, isLoading, isError } = useObterConfigPrompts({
    query: { queryKey: getObterConfigPromptsQueryKey() },
  });
  const salvar = useDefinirConfigPrompts();

  // Texto atual de cada prompt e o baseline carregado (para detectar mudança).
  const [texto, setTexto] = useState<Record<PromptTipo, string> | null>(null);
  const [baseline, setBaseline] = useState<Record<PromptTipo, string> | null>(
    null,
  );
  const [aba, setAba] = useState<PromptTipo>("contrato");
  const [descartarAberto, setDescartarAberto] = useState(false);

  useEffect(() => {
    if (data && texto === null) {
      const inicial: Record<PromptTipo, string> = {
        contrato: data.contrato.texto,
        termo: data.termo.texto,
        refino: data.refino.texto,
      };
      setTexto(inicial);
      setBaseline({ ...inicial });
    }
  }, [data, texto]);

  const item = (tipo: PromptTipo): ConfigPromptItem | undefined =>
    data ? (data[tipo] as ConfigPromptItem) : undefined;

  // Validação por prompt: precisa dos tokens obrigatórios e de um mínimo de texto.
  const validacoes = useMemo(() => {
    const res: Record<PromptTipo, { faltando: string[]; curto: boolean; ok: boolean }> = {
      contrato: { faltando: [], curto: false, ok: true },
      termo: { faltando: [], curto: false, ok: true },
      refino: { faltando: [], curto: false, ok: true },
    };
    if (!texto || !data) return res;
    for (const tipo of TIPOS) {
      const t = texto[tipo].trim();
      const faltando = tokensFaltando(texto[tipo], (data[tipo] as ConfigPromptItem).tokens);
      const curto = t.length < PROMPT_MIN_LEN;
      res[tipo] = { faltando, curto, ok: faltando.length === 0 && !curto };
    }
    return res;
  }, [texto, data]);

  const dirtyPorTipo = useMemo(() => {
    const res: Record<PromptTipo, boolean> = {
      contrato: false,
      termo: false,
      refino: false,
    };
    if (!texto || !baseline) return res;
    for (const tipo of TIPOS) res[tipo] = texto[tipo] !== baseline[tipo];
    return res;
  }, [texto, baseline]);

  const dirty = dirtyPorTipo.contrato || dirtyPorTipo.termo || dirtyPorTipo.refino;
  const tudoValido = validacoes.contrato.ok && validacoes.termo.ok && validacoes.refino.ok;

  useUnsavedChanges(dirty, () => setDescartarAberto(true));

  function tentarSair() {
    if (dirty) setDescartarAberto(true);
    else setLocation("/");
  }

  function restaurarPadrao(tipo: PromptTipo) {
    const padrao = item(tipo)?.padrao;
    if (padrao == null || texto === null) return;
    setTexto({ ...texto, [tipo]: padrao });
  }

  async function onSalvar() {
    if (texto === null || baseline === null || !data) return;
    if (!tudoValido) {
      toast({
        variant: "destructive",
        title: "Há prompts inválidos",
        description:
          "Confira os tokens obrigatórios que faltam nas abas destacadas antes de salvar.",
      });
      return;
    }
    // Monta o payload: só manda o que mudou. Voltar ao texto padrão vira `null`
    // (restaura o padrão de código); alterações viram o texto novo.
    const payload: { contrato?: string | null; termo?: string | null; refino?: string | null } = {};
    for (const tipo of TIPOS) {
      if (!dirtyPorTipo[tipo]) continue;
      const atual = texto[tipo];
      const padrao = (data[tipo] as ConfigPromptItem).padrao;
      payload[tipo] = atual.trim() === padrao.trim() ? null : atual;
    }

    try {
      const salvo: ConfigPrompts = await salvar.mutateAsync({ data: payload });
      const novo: Record<PromptTipo, string> = {
        contrato: salvo.contrato.texto,
        termo: salvo.termo.texto,
        refino: salvo.refino.texto,
      };
      setTexto(novo);
      setBaseline({ ...novo });
      queryClient.setQueryData(getObterConfigPromptsQueryKey(), salvo);
      queryClient.invalidateQueries({ queryKey: getObterConfigPromptsQueryKey() });
      toast({
        title: "Prompts salvos",
        description:
          "A próxima geração de documentos já usa os prompts atualizados.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Não foi possível salvar",
        description:
          "Confira se cada prompt mantém os tokens obrigatórios e tente de novo.",
      });
    }
  }

  const carregando = isLoading || texto === null || baseline === null || !data;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground pb-24 font-sans selection:bg-accent/30">
      <header className="border-b border-border bg-background/90 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={tentarSair}
              className="text-muted-foreground hover:text-accent transition-colors p-2 -ml-2"
            >
              <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
            </button>
            <div className="w-px h-6 bg-card"></div>
            <EstratosLogo className="text-foreground" />
            <span className="font-expanded tracking-widest text-xs font-medium text-muted-foreground">
              PROMPTS DA IA
            </span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-4xl mx-auto px-4 mt-12 space-y-10"
      >
        <header className="space-y-3">
          <h1 className="font-serif text-4xl md:text-5xl font-light tracking-tight text-foreground flex items-center gap-3">
            <Sparkles className="w-7 h-7 text-accent" strokeWidth={1.5} />
            Prompts da geração por IA
          </h1>
          <p className="text-muted-foreground font-light text-lg leading-relaxed">
            Aqui você edita as instruções que a IA segue para redigir o contrato,
            o termo e os refinamentos. Vale para toda a equipe. Os trechos entre{" "}
            <code className="font-mono text-sm text-accent">{"{{ }}"}</code> são
            preenchidos automaticamente com os dados de cada paciente — mantenha-os
            no texto.
          </p>
        </header>

        {isError ? (
          <div className="border border-dashed border-border p-8 text-center text-muted-foreground font-light">
            Não foi possível carregar os prompts. Tente recarregar a página.
          </div>
        ) : carregando ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full bg-card rounded-none" />
            <Skeleton className="h-72 w-full bg-card rounded-none" />
          </div>
        ) : (
          <Tabs value={aba} onValueChange={(v) => setAba(v as PromptTipo)} className="space-y-6">
            <TabsList className="grid grid-cols-3 w-full rounded-none bg-card p-1 h-auto">
              {TIPOS.map((tipo) => {
                const Icone = META[tipo].icone;
                const invalido = !validacoes[tipo].ok;
                return (
                  <TabsTrigger
                    key={tipo}
                    value={tipo}
                    className="rounded-none data-[state=active]:bg-background gap-2 py-2.5 relative"
                  >
                    <Icone className="w-4 h-4" strokeWidth={1.5} />
                    <span>{META[tipo].rotulo}</span>
                    {dirtyPorTipo[tipo] ? (
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${invalido ? "bg-red-400" : "bg-accent"}`}
                        aria-hidden
                      />
                    ) : null}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {TIPOS.map((tipo) => {
              const it = data[tipo] as ConfigPromptItem;
              const v = validacoes[tipo];
              return (
                <TabsContent key={tipo} value={tipo} className="space-y-4 mt-0">
                  <section className="space-y-4 border border-border p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <h2 className="font-serif text-2xl font-light tracking-tight text-foreground">
                          Prompt de {META[tipo].rotulo.toLowerCase()}
                        </h2>
                        <p className="text-muted-foreground font-light leading-relaxed">
                          {META[tipo].descricao}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="rounded-none shrink-0 font-mono text-[10px] tracking-wide"
                      >
                        {it.personalizado ? "PERSONALIZADO" : "PADRÃO"}
                      </Badge>
                    </div>

                    {it.tokens.length > 0 ? (
                      <div className="border border-border/60 bg-card/40 p-4 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Tokens obrigatórios (não remova)
                        </p>
                        <ul className="space-y-1.5">
                          {it.tokens.map((tk) => (
                            <li key={tk} className="flex items-baseline gap-2 text-sm">
                              <code className="font-mono text-accent shrink-0">
                                {`{{${tk}}}`}
                              </code>
                              <span className="text-muted-foreground font-light">
                                {DESC_TOKEN[tk] ?? "Preenchido automaticamente na geração."}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <Textarea
                      value={texto[tipo]}
                      onChange={(e) => setTexto({ ...texto, [tipo]: e.target.value })}
                      spellCheck={false}
                      className="rounded-none font-mono text-xs leading-relaxed min-h-[420px] resize-y"
                      aria-invalid={!v.ok}
                    />

                    {!v.ok ? (
                      <div className="text-xs font-light text-red-400 space-y-1 border-t border-border pt-3">
                        {v.curto ? (
                          <p>O prompt está muito curto (mínimo {PROMPT_MIN_LEN} caracteres).</p>
                        ) : null}
                        {v.faltando.length > 0 ? (
                          <p>
                            Faltam tokens obrigatórios:{" "}
                            {v.faltando.map((t) => `{{${t}}}`).join(", ")}. Sem eles,
                            o dado correspondente some do documento.
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
                      <p className="text-xs font-light text-muted-foreground">
                        {texto[tipo].trim() === it.padrao.trim()
                          ? "Este é exatamente o texto padrão."
                          : "Texto diferente do padrão de código."}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => restaurarPadrao(tipo)}
                        disabled={texto[tipo] === it.padrao}
                        className="rounded-none h-10 px-5 shrink-0 gap-2"
                      >
                        <RotateCcw className="w-4 h-4" strokeWidth={1.5} />
                        Restaurar padrão
                      </Button>
                    </div>
                  </section>
                </TabsContent>
              );
            })}
          </Tabs>
        )}

        {!carregando && !isError ? (
          <div className="flex items-center justify-between gap-3 border-t border-border pt-6 sticky bottom-0 bg-background/95 backdrop-blur py-4">
            <p className="text-xs font-light text-muted-foreground">
              As mudanças valem para a próxima geração de documentos de toda a equipe.
            </p>
            <Button
              onClick={onSalvar}
              disabled={salvar.isPending || !dirty || !tudoValido}
              className="rounded-none bg-primary hover:bg-primary/90 text-primary-foreground font-medium h-12 px-8 shrink-0"
            >
              {salvar.isPending ? "Salvando..." : "Salvar prompts"}
            </Button>
          </div>
        ) : null}
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
