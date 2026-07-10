import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  useObterConfigNotificacao,
  useDefinirConfigNotificacao,
  getObterConfigNotificacaoQueryKey,
  useObterConfigContrato,
  useDefinirConfigContrato,
  getObterConfigContratoQueryKey,
  useTestarConfigNotificacao,
} from "@workspace/api-client-react";
import { Bell, BellOff, ArrowLeft, CalendarClock, Send } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { DiscardChangesDialog } from "@/components/discard-changes-dialog";
import { EstratosLogo } from "./console-home";
import { ThemeToggle } from "@/components/theme-toggle";
import { motion } from "framer-motion";

export default function ConsoleNotificacoes() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data, isLoading, isError } = useObterConfigNotificacao({
    query: { queryKey: getObterConfigNotificacaoQueryKey() },
  });
  const { data: configContrato, isLoading: loadingContrato, isError: erroContrato } =
    useObterConfigContrato({ query: { queryKey: getObterConfigContratoQueryKey() } });
  const salvarConfig = useDefinirConfigNotificacao();
  const salvarContrato = useDefinirConfigContrato();
  const testarConfig = useTestarConfigNotificacao();

  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [silenciada, setSilenciada] = useState<boolean | null>(null);
  const [diasAntes, setDiasAntes] = useState<string | null>(null);
  const [diasVencimento, setDiasVencimento] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<{
    webhookUrl: string;
    silenciada: boolean;
    diasAntes: string;
    diasVencimento: string;
  } | null>(null);
  const [descartarAberto, setDescartarAberto] = useState(false);

  useEffect(() => {
    if (data && configContrato && webhookUrl === null) {
      const dias = String(configContrato.prazoAssinaturaDiasAntes);
      const venc = String(configContrato.vencimentoSaldoDiasUteisAntes);
      setWebhookUrl(data.webhookUrl ?? "");
      setSilenciada(data.silenciada);
      setDiasAntes(dias);
      setDiasVencimento(venc);
      setBaseline({
        webhookUrl: data.webhookUrl ?? "",
        silenciada: data.silenciada,
        diasAntes: dias,
        diasVencimento: venc,
      });
    }
  }, [data, configContrato, webhookUrl]);

  const diasAntesNum = Number(diasAntes);
  const diasAntesValido =
    diasAntes !== null && diasAntes.trim() !== "" && Number.isInteger(diasAntesNum) && diasAntesNum >= 0 && diasAntesNum <= 60;

  const diasVencimentoNum = Number(diasVencimento);
  const diasVencimentoValido =
    diasVencimento !== null && diasVencimento.trim() !== "" && Number.isInteger(diasVencimentoNum) && diasVencimentoNum >= 0 && diasVencimentoNum <= 60;

  const webhookTrim = (webhookUrl ?? "").trim();
  // Espelha a validação do backend: vazio é permitido (= sem avisos); quando há
  // destino, exige uma URL http(s) válida para não silenciar o aviso por engano.
  const webhookUrlValido =
    webhookTrim === "" ||
    (() => {
      try {
        const url = new URL(webhookTrim);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    })();

  const dirty =
    baseline !== null &&
    webhookUrl !== null &&
    silenciada !== null &&
    diasAntes !== null &&
    diasVencimento !== null &&
    (webhookUrl.trim() !== baseline.webhookUrl.trim() ||
      silenciada !== baseline.silenciada ||
      diasAntes.trim() !== baseline.diasAntes.trim() ||
      diasVencimento.trim() !== baseline.diasVencimento.trim());

  useUnsavedChanges(dirty, () => setDescartarAberto(true));

  function tentarSair() {
    if (dirty) {
      setDescartarAberto(true);
    } else {
      setLocation("/");
    }
  }

  async function salvar() {
    if (
      webhookUrl === null ||
      silenciada === null ||
      diasAntes === null ||
      diasVencimento === null
    )
      return;
    if (!diasAntesValido || !diasVencimentoValido) {
      toast({
        variant: "destructive",
        title: "Prazo inválido",
        description: "Informe um número inteiro de dias entre 0 e 60.",
      });
      return;
    }
    const limpo = webhookUrl.trim();
    try {
      const [res, resContrato] = await Promise.all([
        salvarConfig.mutateAsync({ data: { webhookUrl: limpo || null, silenciada } }),
        salvarContrato.mutateAsync({
          data: {
            prazoAssinaturaDiasAntes: diasAntesNum,
            vencimentoSaldoDiasUteisAntes: diasVencimentoNum,
          },
        }),
      ]);
      const dias = String(resContrato.prazoAssinaturaDiasAntes);
      const venc = String(resContrato.vencimentoSaldoDiasUteisAntes);
      setWebhookUrl(res.webhookUrl ?? "");
      setSilenciada(res.silenciada);
      setDiasAntes(dias);
      setDiasVencimento(venc);
      setBaseline({
        webhookUrl: res.webhookUrl ?? "",
        silenciada: res.silenciada,
        diasAntes: dias,
        diasVencimento: venc,
      });
      queryClient.invalidateQueries({
        queryKey: getObterConfigNotificacaoQueryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: getObterConfigContratoQueryKey(),
      });
      toast({
        title: "Avisos salvos",
        description: res.silenciada
          ? "Os avisos estão pausados — o destino continua guardado."
          : limpo
            ? "A equipe será avisada quando um contrato for assinado ou recusado."
            : "Sem destino salvo, nenhum aviso será enviado.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Não foi possível salvar",
        description: "Confira o destino (precisa ser uma URL https://...) e tente de novo.",
      });
    }
  }

  async function testar() {
    const destino = (webhookUrl ?? "").trim();
    if (destino === "") {
      toast({
        variant: "destructive",
        title: "Sem destino para testar",
        description: "Cole a URL do webhook antes de enviar um teste.",
      });
      return;
    }
    try {
      const res = await testarConfig.mutateAsync({ data: { webhookUrl: destino } });
      if (res.resultado === "enviado") {
        toast({
          title: "Teste enviado",
          description:
            "O destino aceitou a mensagem. Confira o canal para ver se ela chegou.",
        });
      } else if (res.resultado === "sem-webhook") {
        toast({
          variant: "destructive",
          title: "Sem destino para testar",
          description: "Cole a URL do webhook antes de enviar um teste.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "O destino não aceitou o teste",
          description: res.status
            ? `O destino respondeu com erro (HTTP ${res.status}). Confira a URL e tente de novo.`
            : "Não foi possível entregar a mensagem. Confira a URL e tente de novo.",
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Não foi possível testar",
        description:
          "Confira o destino (precisa ser uma URL https://...) e tente de novo.",
      });
    }
  }

  const semDestino = (webhookUrl ?? "").trim() === "";

  return (
    <div className="min-h-[100dvh] bg-background text-foreground pb-24 font-sans selection:bg-accent/30">
      <header className="border-b border-border bg-background/90 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
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
              AVISOS DA EQUIPE
            </span>
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
            Avisos de contrato à equipe
          </h1>
          <p className="text-muted-foreground font-light text-lg leading-relaxed">
            Assim que uma paciente assina ou recusa o contrato, avisamos a equipe
            no destino que você definir aqui — sem ninguém precisar ficar de olho
            na home. Funciona com qualquer webhook de entrada (Slack, Discord ou
            uma ponte para o WhatsApp).
          </p>
        </header>

        {isError || erroContrato ? (
          <div className="border border-dashed border-border p-8 text-center text-muted-foreground font-light">
            Não foi possível carregar as configurações de aviso. Tente recarregar a página.
          </div>
        ) : isLoading || loadingContrato || webhookUrl === null || silenciada === null || diasAntes === null || diasVencimento === null ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full bg-card rounded-none" />
            <Skeleton className="h-20 w-full bg-card rounded-none" />
          </div>
        ) : (
          <>
            <section className="space-y-4 border border-border p-6">
              <div className="space-y-1">
                <h2 className="font-serif text-2xl font-light tracking-tight text-foreground">
                  Destino do aviso
                </h2>
                <p className="text-muted-foreground font-light leading-relaxed">
                  Cole aqui a URL do webhook de entrada do canal que deve receber
                  os avisos. Deixe em branco para não enviar nenhum aviso.
                </p>
              </div>
              <Input
                type="url"
                inputMode="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                aria-invalid={!webhookUrlValido}
                className="rounded-none h-12 font-mono text-sm"
              />
              {!webhookUrlValido ? (
                <p className="text-xs font-light text-red-400">
                  O destino precisa ser uma URL completa começando com http://
                  ou https://. Deixe em branco para não enviar avisos.
                </p>
              ) : null}
              <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
                <p className="text-xs font-light text-muted-foreground">
                  Envie um aviso de teste para confirmar que a mensagem chega ao
                  canal. O teste usa o destino digitado acima e funciona mesmo com
                  os avisos pausados.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={testar}
                  disabled={testarConfig.isPending || semDestino}
                  className="rounded-none h-10 px-5 shrink-0 gap-2"
                >
                  <Send className="w-4 h-4" strokeWidth={1.5} />
                  {testarConfig.isPending ? "Enviando..." : "Enviar teste"}
                </Button>
              </div>
            </section>

            <section className="space-y-4 border border-border p-6">
              <div className="flex items-start justify-between gap-6">
                <div className="space-y-1">
                  <h2 className="font-serif text-2xl font-light tracking-tight text-foreground flex items-center gap-3">
                    {silenciada ? (
                      <BellOff className="w-5 h-5 text-muted-foreground" strokeWidth={1.5} />
                    ) : (
                      <Bell className="w-5 h-5 text-accent" strokeWidth={1.5} />
                    )}
                    Avisos {silenciada ? "pausados" : "ativos"}
                  </h2>
                  <p className="text-muted-foreground font-light leading-relaxed">
                    {silenciada
                      ? "Os avisos estão pausados. O destino continua guardado — é só reativar quando quiser."
                      : "A equipe recebe um aviso a cada contrato assinado ou recusado."}
                  </p>
                </div>
                <Switch
                  checked={!silenciada}
                  onCheckedChange={(ativo) => setSilenciada(!ativo)}
                  aria-label="Ativar ou pausar os avisos"
                  className="mt-2"
                />
              </div>
              {semDestino && !silenciada ? (
                <p className="text-xs font-light text-muted-foreground border-t border-border pt-4">
                  Sem um destino salvo, nenhum aviso será enviado mesmo com os
                  avisos ativos.
                </p>
              ) : null}
            </section>

            <section className="space-y-4 border border-border p-6">
              <div className="space-y-1">
                <h2 className="font-serif text-2xl font-light tracking-tight text-foreground flex items-center gap-3">
                  <CalendarClock className="w-5 h-5 text-accent" strokeWidth={1.5} />
                  Prazo de assinatura do contrato
                </h2>
                <p className="text-muted-foreground font-light leading-relaxed">
                  Quantos dias antes da cirurgia o contrato precisa estar assinado.
                  É o padrão para todas as pacientes — cada paciente pode ter um
                  prazo próprio na página dela. A equipe é avisada quando o prazo
                  está perto de vencer ou já venceu sem assinatura.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={60}
                  value={diasAntes ?? ""}
                  onChange={(e) => setDiasAntes(e.target.value)}
                  className="rounded-none h-12 font-mono text-sm w-28"
                />
                <span className="text-muted-foreground font-light">
                  dias antes da cirurgia
                </span>
              </div>
              {!diasAntesValido ? (
                <p className="text-xs font-light text-red-400 border-t border-border pt-4">
                  Informe um número inteiro de dias entre 0 e 60.
                </p>
              ) : null}
            </section>

            <section className="space-y-4 border border-border p-6">
              <div className="space-y-1">
                <h2 className="font-serif text-2xl font-light tracking-tight text-foreground flex items-center gap-3">
                  <CalendarClock className="w-5 h-5 text-accent" strokeWidth={1.5} />
                  Vencimento do saldo
                </h2>
                <p className="text-muted-foreground font-light leading-relaxed">
                  Quantos dias úteis antes da cirurgia o saldo pendente vence por
                  padrão. O Console usa este valor para pré-preencher o vencimento
                  ao cadastrar uma paciente com saldo em aberto — a data continua
                  editável caso a paciente combine outro prazo.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={60}
                  value={diasVencimento ?? ""}
                  onChange={(e) => setDiasVencimento(e.target.value)}
                  className="rounded-none h-12 font-mono text-sm w-28"
                />
                <span className="text-muted-foreground font-light">
                  dias úteis antes da cirurgia
                </span>
              </div>
              {!diasVencimentoValido ? (
                <p className="text-xs font-light text-red-400 border-t border-border pt-4">
                  Informe um número inteiro de dias entre 0 e 60.
                </p>
              ) : null}
            </section>

            <div className="flex items-center justify-end gap-3 border-t border-border pt-6 sticky bottom-0 bg-background/95 backdrop-blur py-4">
              <Button
                onClick={salvar}
                disabled={salvarConfig.isPending || salvarContrato.isPending || !dirty || !diasAntesValido || !diasVencimentoValido || !webhookUrlValido}
                className="rounded-none bg-primary hover:bg-primary/90 text-primary-foreground font-medium h-12 px-8"
              >
                {salvarConfig.isPending || salvarContrato.isPending ? "Salvando..." : "Salvar avisos"}
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
