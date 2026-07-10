import { useState } from "react";
import {
  useListarCheckins,
  useCriarCheckin,
  useSemearCheckinsPadrao,
  useAtualizarCheckin,
  getListarCheckinsQueryKey,
  type Checkin,
  type CheckinTipo,
  type CheckinStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { toastErroAcao } from "@/lib/erro-acao";

const ROTULO_TIPO: Record<CheckinTipo, string> = {
  foto: "Foto",
  retorno: "Retorno",
  nps: "NPS",
};

const ROTULO_STATUS: Record<CheckinStatus, string> = {
  pendente: "Pendente",
  concluido: "Concluído",
  atrasado: "Atrasado",
};

function StatusBadge({ status }: { status: CheckinStatus }) {
  const cor =
    status === "concluido"
      ? "text-accent border-accent/50"
      : status === "atrasado"
        ? "text-destructive border-destructive/50"
        : "text-muted-foreground border-border";
  return (
    <span
      className={`font-expanded text-[9px] tracking-widest uppercase border px-2 py-0.5 ${cor}`}
    >
      {ROTULO_STATUS[status]}
    </span>
  );
}

/** Cartão de um check-in: status, foto enviada, atenção e nota interna. */
function CheckinCard({
  checkin,
  onAtualizar,
  pendente,
}: {
  checkin: Checkin;
  onAtualizar: (
    id: number,
    dados: { status?: CheckinStatus; nota?: string | null; sinalAtencao?: boolean },
  ) => void;
  pendente: boolean;
}) {
  const [notaDraft, setNotaDraft] = useState(checkin.nota ?? "");
  const notaMudou = notaDraft.trim() !== (checkin.nota ?? "").trim();

  return (
    <Card
      className={`bg-card rounded-none border ${
        checkin.sinalAtencao ? "border-accent/60" : "border-transparent"
      }`}
    >
      <CardContent className="p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm text-accent">D+{checkin.dia}</span>
          <span className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground">
            {ROTULO_TIPO[checkin.tipo]}
          </span>
          <StatusBadge status={checkin.status} />
        </div>

        {checkin.tipo === "foto" &&
          (checkin.fotoUrl ? (
            <a
              href={checkin.fotoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-fit"
            >
              <img
                src={checkin.fotoUrl}
                alt={`Foto enviada no D+${checkin.dia}`}
                className="max-h-56 border border-border object-cover"
              />
            </a>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground/70 text-sm font-light">
              <ImageIcon className="w-4 h-4" strokeWidth={1.5} />
              Aguardando foto da paciente.
            </div>
          ))}

        <div className="flex flex-wrap items-center gap-4">
          <Select
            value={checkin.status}
            onValueChange={(v) =>
              onAtualizar(checkin.id, { status: v as CheckinStatus })
            }
            disabled={pendente}
          >
            <SelectTrigger className="bg-background border-transparent focus:ring-1 focus:ring-ring rounded-none h-10 w-44 text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background border-border text-foreground rounded-none">
              {(Object.keys(ROTULO_STATUS) as CheckinStatus[]).map((s) => (
                <SelectItem
                  key={s}
                  value={s}
                  className="focus:bg-card focus:text-foreground"
                >
                  {ROTULO_STATUS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label className="flex items-center gap-2 cursor-pointer">
            <Switch
              checked={checkin.sinalAtencao}
              onCheckedChange={(v) =>
                onAtualizar(checkin.id, { sinalAtencao: v })
              }
              disabled={pendente}
            />
            <span className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground">
              Atenção
            </span>
          </label>
        </div>

        <div className="space-y-2">
          <Textarea
            value={notaDraft}
            onChange={(e) => setNotaDraft(e.target.value)}
            placeholder="Nota interna (não vai para a paciente)"
            className="bg-background border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none text-foreground placeholder:text-muted-foreground/50 min-h-[60px]"
          />
          {notaMudou && (
            <Button
              size="sm"
              onClick={() =>
                onAtualizar(checkin.id, { nota: notaDraft.trim() || null })
              }
              disabled={pendente}
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-9 px-4"
            >
              Salvar nota
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Seção PÓS-OP do Console (tema escuro). Gerencia os check-ins de recuperação:
 * gera o conjunto padrão, adiciona manuais, e marca status / nota / atenção.
 * A paciente envia as fotos pela página pública dela.
 */
export function PosOpStaff({ pacienteId }: { pacienteId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: checkins, isLoading } = useListarCheckins(pacienteId, {
    query: { queryKey: getListarCheckinsQueryKey(pacienteId) },
  });

  const invalidar = () =>
    queryClient.invalidateQueries({
      queryKey: getListarCheckinsQueryKey(pacienteId),
    });

  const semear = useSemearCheckinsPadrao();
  const criar = useCriarCheckin();
  const atualizar = useAtualizarCheckin();

  const [novoDia, setNovoDia] = useState("");
  const [novoTipo, setNovoTipo] = useState<CheckinTipo>("foto");

  const handleSemear = () => {
    semear.mutate(
      { id: pacienteId },
      {
        onSuccess: () => {
          invalidar();
          toast({ title: "Check-ins padrão gerados." });
        },
        onError: (error) =>
          toast(
            toastErroAcao(error, {
              title: "Não foi possível gerar os check-ins.",
            }),
          ),
      },
    );
  };

  const handleCriar = () => {
    const dia = Number(novoDia);
    if (!Number.isInteger(dia) || dia < 0) {
      toast({
        variant: "destructive",
        title: "Informe um dia válido (ex.: 1, 7, 30).",
      });
      return;
    }
    criar.mutate(
      { id: pacienteId, data: { dia, tipo: novoTipo } },
      {
        onSuccess: () => {
          invalidar();
          setNovoDia("");
          setNovoTipo("foto");
          toast({ title: "Check-in adicionado." });
        },
        onError: (error) =>
          toast(
            toastErroAcao(error, {
              title: "Não foi possível adicionar o check-in.",
            }),
          ),
      },
    );
  };

  const handleAtualizar = (
    id: number,
    dados: { status?: CheckinStatus; nota?: string | null; sinalAtencao?: boolean },
  ) => {
    atualizar.mutate(
      { id: pacienteId, checkinId: id, data: dados },
      {
        onSuccess: () => invalidar(),
        onError: (error) =>
          toast(
            toastErroAcao(error, {
              title: "Não foi possível atualizar o check-in.",
            }),
          ),
      },
    );
  };

  if (isLoading) {
    return <Skeleton className="h-24 w-full bg-card rounded-none" />;
  }

  return (
    <div className="space-y-6">
      {checkins && checkins.length > 0 ? (
        <div className="space-y-4">
          {checkins.map((c) => (
            <CheckinCard
              key={c.id}
              checkin={c}
              onAtualizar={handleAtualizar}
              pendente={atualizar.isPending}
            />
          ))}
        </div>
      ) : (
        <div className="border border-dashed border-card py-10 text-center space-y-4">
          <p className="text-muted-foreground font-light">
            Nenhum check-in pós-op ainda.
          </p>
          <Button
            onClick={handleSemear}
            disabled={semear.isPending}
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-11 px-6"
          >
            Gerar check-ins padrão
          </Button>
        </div>
      )}

      <div className="bg-card/40 border border-border p-6 space-y-4">
        <span className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground">
          Adicionar check-in
        </span>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <label className="block font-expanded text-[9px] tracking-widest uppercase text-muted-foreground/70">
              Dia (D+)
            </label>
            <Input
              value={novoDia}
              onChange={(e) => setNovoDia(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="Ex.: 7"
              className="bg-background border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-11 w-28 text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block font-expanded text-[9px] tracking-widest uppercase text-muted-foreground/70">
              Tipo
            </label>
            <Select
              value={novoTipo}
              onValueChange={(v) => setNovoTipo(v as CheckinTipo)}
            >
              <SelectTrigger className="bg-background border-transparent focus:ring-1 focus:ring-ring rounded-none h-11 w-44 text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background border-border text-foreground rounded-none">
                {(Object.keys(ROTULO_TIPO) as CheckinTipo[]).map((t) => (
                  <SelectItem
                    key={t}
                    value={t}
                    className="focus:bg-card focus:text-foreground"
                  >
                    {ROTULO_TIPO[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleCriar}
            disabled={criar.isPending || !novoDia}
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-11 px-6"
          >
            <Plus className="w-4 h-4 mr-2" /> Adicionar
          </Button>
        </div>
      </div>
    </div>
  );
}
