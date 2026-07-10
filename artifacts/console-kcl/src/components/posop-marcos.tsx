import { useState } from "react";
import {
  useMarcarMarcoManual,
  getObterPacienteQueryKey,
  getResumoPacientesQueryKey,
  getListarPacientesQueryKey,
  getObterAtividadePacienteQueryKey,
  getListarTimelineQueryKey,
  type Paciente,
  type MarcoJornadaInfo,
  type MarcoManualEntradaMarco,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { toastErroAcao } from "@/lib/erro-acao";
import { useOperador } from "@/lib/operador";
import { ehMarcoManual } from "@/lib/jornada-equipe";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check } from "lucide-react";

/**
 * Mapeia cada marco pós-operatório manual ao carimbo de tempo correspondente no
 * DTO da paciente. A ordem e os rótulos vêm do servidor (config.jornadaEquipe);
 * aqui só sabemos QUAL campo guarda a data de cada chave.
 */
function carimboDoMarco(
  paciente: Paciente,
  chave: MarcoManualEntradaMarco,
): string | null {
  switch (chave) {
    case "retirada_pontos":
      return paciente.retiradaPontosEm;
    case "retorno_1":
      return paciente.retorno1Em;
    case "retorno_2":
      return paciente.retorno2Em;
    case "retorno_3":
      return paciente.retorno3Em;
    default:
      return null;
  }
}

/**
 * Cirurgia já ocorreu? Os marcos pós-operatórios só ficam liberados quando a
 * data da cirurgia chegou (dias <= 0) — antes disso não faz sentido marcar
 * retirada de pontos/retornos. Espelha `diasAteCirurgia` do servidor.
 */
function cirurgiaJaOcorreu(dataCirurgia: string | null | undefined): boolean {
  if (!dataCirurgia) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataCirurgia);
  if (!m) return false;
  const alvo = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return alvo.getTime() <= hoje.getTime();
}

/**
 * Controles dos marcos PÓS-OPERATÓRIOS manuais (retirada de pontos e 1º/2º/3º
 * retorno). A equipe marca/desmarca — diferente dos check-ins de recuperação,
 * que dependem das fotos da paciente. A ordem e os rótulos vêm de
 * config.jornadaEquipe (fonte única); aqui só ligamos cada chave ao seu carimbo.
 *
 * Os controles só ficam ATIVOS depois que a cirurgia ocorre (dias <= 0). Antes
 * disso aparecem desabilitados com uma dica — a menos que o marco já esteja
 * carimbado (permite corrigir/desmarcar um registro feito antes).
 */
export function PosOpMarcos({
  paciente,
  jornada,
}: {
  paciente: Paciente;
  jornada: MarcoJornadaInfo[];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { operador, salvar: salvarOperador } = useOperador();
  const marcar = useMarcarMarcoManual();

  // Marco aguardando identidade do operador (quando ainda não informada).
  const [pendente, setPendente] = useState<{
    marco: MarcoManualEntradaMarco;
    concluido: boolean;
  } | null>(null);
  const [identDialogAberto, setIdentDialogAberto] = useState(false);
  const [identRascunho, setIdentRascunho] = useState("");

  // Só os marcos manuais, na ordem definida pelo servidor.
  const manuais = jornada.filter(
    (m): m is MarcoJornadaInfo & { chave: MarcoManualEntradaMarco } =>
      !m.automatico && ehMarcoManual(m.chave),
  );

  // Pós-op só libera depois da cirurgia (dias <= 0). Antes disso os controles
  // ficam desabilitados, com dica de quando abrem.
  const liberado = cirurgiaJaOcorreu(paciente.dataCirurgia);
  const dataCirurgiaFmt = paciente.dataCirurgia
    ? format(parseISO(paciente.dataCirurgia), "dd/MM/yyyy", { locale: ptBR })
    : null;

  function executar(
    marco: MarcoManualEntradaMarco,
    concluido: boolean,
    autor: string | null,
  ) {
    marcar.mutate(
      {
        id: paciente.id,
        data: { marco, concluido, ...(autor ? { autor } : {}) },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getObterPacienteQueryKey(paciente.id),
          });
          queryClient.invalidateQueries({
            queryKey: getObterAtividadePacienteQueryKey(paciente.id),
          });
          queryClient.invalidateQueries({
            queryKey: getListarTimelineQueryKey(paciente.id),
          });
          queryClient.invalidateQueries({
            queryKey: getResumoPacientesQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getListarPacientesQueryKey(),
          });
        },
        onError: (error) =>
          toast(
            toastErroAcao(error, {
              title: "Não foi possível atualizar o marco.",
            }),
          ),
      },
    );
  }

  function alternar(marco: MarcoManualEntradaMarco, concluido: boolean) {
    if (!operador) {
      // Pergunta quem está registrando antes de carimbar (credita o histórico).
      setPendente({ marco, concluido });
      setIdentRascunho("");
      setIdentDialogAberto(true);
      return;
    }
    executar(marco, concluido, operador);
  }

  function confirmarIdentidade() {
    const nome = identRascunho.trim();
    if (!nome || !pendente) return;
    salvarOperador(nome);
    const acao = pendente;
    setIdentDialogAberto(false);
    setPendente(null);
    executar(acao.marco, acao.concluido, nome);
  }

  return (
    <div className="space-y-4">
      {!liberado && (
        <div className="border border-dashed border-border px-4 py-3">
          <p className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground">
            {dataCirurgiaFmt
              ? `Disponível após a cirurgia (${dataCirurgiaFmt})`
              : "Disponível após a cirurgia"}
          </p>
        </div>
      )}
      {manuais.map((m) => {
        const carimbo = carimboDoMarco(paciente, m.chave);
        const concluido = carimbo !== null;
        // Trava antes da cirurgia — mas nunca trava um marco já carimbado (permite
        // corrigir/desmarcar um registro feito fora de ordem).
        const bloqueado = !liberado && !concluido;
        return (
          <div
            key={m.chave}
            className={`bg-card border p-5 flex items-center justify-between gap-4 ${
              concluido ? "border-accent/50" : "border-transparent"
            } ${bloqueado ? "opacity-60" : ""}`}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {concluido && (
                  <Check className="w-4 h-4 text-accent" strokeWidth={2} />
                )}
                <span className="font-serif text-lg text-foreground">
                  {m.rotulo}
                </span>
              </div>
              <p className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground">
                {concluido && carimbo
                  ? `Marcado em ${format(parseISO(carimbo), "dd/MM/yyyy", { locale: ptBR })}`
                  : bloqueado
                    ? "Aguardando a cirurgia"
                    : "Ainda não marcado"}
              </p>
            </div>
            <label
              className={`flex items-center gap-3 shrink-0 ${
                bloqueado ? "cursor-not-allowed" : "cursor-pointer"
              }`}
            >
              <span className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground">
                {concluido ? "Concluído" : "Marcar"}
              </span>
              <Switch
                checked={concluido}
                onCheckedChange={(v) => alternar(m.chave, v)}
                disabled={marcar.isPending || bloqueado}
              />
            </label>
          </div>
        );
      })}

      <AlertDialog open={identDialogAberto} onOpenChange={setIdentDialogAberto}>
        <AlertDialogContent className="bg-background border-border rounded-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl text-foreground">
              Quem está registrando?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground font-light">
              Seu nome fica salvo neste navegador e aparece no histórico do
              processo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={identRascunho}
            onChange={(e) => setIdentRascunho(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmarIdentidade();
            }}
            placeholder="Seu nome"
            autoFocus
            className="bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-11 text-foreground placeholder:text-muted-foreground/50"
          />
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIdentDialogAberto(false);
                setPendente(null);
              }}
              className="rounded-none border-border bg-transparent hover:bg-card text-muted-foreground hover:text-foreground h-11 px-6"
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmarIdentidade}
              disabled={!identRascunho.trim()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-11 px-6"
            >
              Confirmar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
