import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListarMedicos,
  useCriarMedico,
  useAtualizarMedico,
  getListarMedicosQueryKey,
  type Medico,
} from "@workspace/api-client-react";
import { Stethoscope, Plus, Star, ImagePlus, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { toastErroAcao } from "@/lib/erro-acao";

const INPUT_CLS =
  "bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-11 text-foreground placeholder:text-muted-foreground/50";
const LABEL_CLS =
  "text-muted-foreground font-expanded text-[10px] tracking-widest uppercase";
const FOTO_ACEITA = "image/jpeg,image/png";

/** Envia a foto do médico por multipart, respeitando o base path do Console. */
async function enviarFoto(medicoId: number, arquivo: File): Promise<void> {
  const fd = new FormData();
  fd.append("foto", arquivo);
  const res = await fetch(
    `${import.meta.env.BASE_URL}api/medicos/${medicoId}/foto`,
    { method: "POST", body: fd },
  );
  if (!res.ok) {
    let msg = "Não foi possível enviar a foto.";
    try {
      const j = (await res.json()) as { message?: string };
      if (j?.message) msg = j.message;
    } catch {
      /* corpo não-JSON — mantém a mensagem padrão */
    }
    throw new Error(msg);
  }
}

/** Envia o logo do médico por multipart, respeitando o base path do Console. */
async function enviarLogo(medicoId: number, arquivo: File): Promise<void> {
  const fd = new FormData();
  fd.append("logo", arquivo);
  const res = await fetch(
    `${import.meta.env.BASE_URL}api/medicos/${medicoId}/logo`,
    { method: "POST", body: fd },
  );
  if (!res.ok) {
    let msg = "Não foi possível enviar o logo.";
    try {
      const j = (await res.json()) as { message?: string };
      if (j?.message) msg = j.message;
    } catch {
      /* corpo não-JSON — mantém a mensagem padrão */
    }
    throw new Error(msg);
  }
}

/** Iniciais (até duas) para o avatar quando não há foto. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "—";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1][0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

function AvatarMedico({ medico }: { medico: Medico }) {
  if (medico.fotoUrl) {
    return (
      <img
        src={medico.fotoUrl}
        alt={`Foto de ${medico.nome}`}
        className="w-12 h-12 object-cover rounded-none border border-border shrink-0"
      />
    );
  }
  return (
    <div className="w-12 h-12 rounded-none border border-border bg-card flex items-center justify-center shrink-0">
      <span className="font-expanded text-[11px] tracking-widest text-accent">
        {iniciais(medico.nome)}
      </span>
    </div>
  );
}

function LinhaMedico({
  medico,
  onAlterado,
}: {
  medico: Medico;
  onAlterado: () => void;
}) {
  const atualizarMedico = useAtualizarMedico();
  const { toast } = useToast();
  const inputFoto = useRef<HTMLInputElement>(null);
  const inputLogo = useRef<HTMLInputElement>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [enviandoLogo, setEnviandoLogo] = useState(false);
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(medico.nome);
  const [crm, setCrm] = useState(medico.crm);
  const [rqe, setRqe] = useState(medico.rqe);
  const [clinica, setClinica] = useState(medico.clinica);

  const ocupado = atualizarMedico.isPending || enviandoFoto || enviandoLogo;

  function erro(error: unknown, titulo: string) {
    toast(
      toastErroAcao(error, {
        title: titulo,
        description: "Tente novamente em instantes.",
      }),
    );
  }

  const alternarAtivo = (ativo: boolean) =>
    atualizarMedico.mutate(
      { id: medico.id, data: { ativo } },
      {
        onSuccess: onAlterado,
        onError: (e) => erro(e, "Não foi possível atualizar o médico"),
      },
    );

  const tornarPadrao = () =>
    atualizarMedico.mutate(
      { id: medico.id, data: { padrao: true } },
      {
        onSuccess: onAlterado,
        onError: (e) => erro(e, "Não foi possível definir o médico padrão"),
      },
    );

  async function trocarFoto(arquivo: File) {
    setEnviandoFoto(true);
    try {
      await enviarFoto(medico.id, arquivo);
      onAlterado();
      toast({ title: "Foto atualizada", description: `Foto de ${medico.nome} salva.` });
    } catch (e) {
      erro(e, "Não foi possível enviar a foto");
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function trocarLogo(arquivo: File) {
    setEnviandoLogo(true);
    try {
      await enviarLogo(medico.id, arquivo);
      onAlterado();
      toast({ title: "Logo atualizado", description: `Logo de ${medico.nome} salvo.` });
    } catch (e) {
      erro(e, "Não foi possível enviar o logo");
    } finally {
      setEnviandoLogo(false);
    }
  }

  function salvarEdicao() {
    const nomeLimpo = nome.trim();
    if (!nomeLimpo) return;
    atualizarMedico.mutate(
      {
        id: medico.id,
        data: {
          nome: nomeLimpo,
          crm: crm.trim(),
          rqe: rqe.trim(),
          clinica: clinica.trim(),
        },
      },
      {
        onSuccess: () => {
          onAlterado();
          setEditando(false);
        },
        onError: (e) => erro(e, "Não foi possível salvar o médico"),
      },
    );
  }

  function cancelarEdicao() {
    setNome(medico.nome);
    setCrm(medico.crm);
    setRqe(medico.rqe);
    setClinica(medico.clinica);
    setEditando(false);
  }

  return (
    <div className="bg-background px-4 py-3 space-y-3">
      <div className="flex items-center gap-3">
        <AvatarMedico medico={medico} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`font-light truncate ${medico.ativo ? "text-foreground" : "text-muted-foreground/50 line-through"}`}
            >
              {medico.nome}
            </span>
            {medico.padrao && (
              <span className="inline-flex items-center gap-1 font-expanded text-[8px] tracking-widest uppercase text-accent border border-accent/40 px-1.5 py-0.5">
                <Star className="w-2.5 h-2.5 fill-accent text-accent" strokeWidth={1.5} />
                Padrão
              </span>
            )}
          </div>
          <p className="font-mono text-[11px] text-muted-foreground/80 truncate">
            {[medico.crm, medico.rqe, medico.clinica].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground">
            {medico.ativo ? "Ativo" : "Inativo"}
          </span>
          <Switch
            checked={medico.ativo}
            disabled={ocupado}
            onCheckedChange={alternarAtivo}
            className="data-[state=checked]:bg-primary"
          />
        </div>
      </div>

      {editando ? (
        <div className="space-y-2 pl-[60px]">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome" className={INPUT_CLS} />
          <div className="grid grid-cols-2 gap-2">
            <Input value={crm} onChange={(e) => setCrm(e.target.value)} placeholder="CRM" className={`${INPUT_CLS} font-mono`} />
            <Input value={rqe} onChange={(e) => setRqe(e.target.value)} placeholder="RQE" className={`${INPUT_CLS} font-mono`} />
          </div>
          <Input value={clinica} onChange={(e) => setClinica(e.target.value)} placeholder="Clínica" className={INPUT_CLS} />
          <div className="flex gap-2 pt-1">
            <Button
              onClick={salvarEdicao}
              disabled={ocupado || !nome.trim()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-9 px-4 text-xs"
            >
              <Check className="w-3.5 h-3.5 mr-1.5" /> Salvar
            </Button>
            <Button
              variant="outline"
              onClick={cancelarEdicao}
              disabled={ocupado}
              className="rounded-none border-border bg-transparent hover:bg-card text-muted-foreground hover:text-foreground h-9 px-4 text-xs"
            >
              <X className="w-3.5 h-3.5 mr-1.5" /> Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 pl-[60px]">
          <div className="flex flex-wrap items-center gap-2">
            {!medico.padrao && medico.ativo && (
              <Button
                variant="outline"
                onClick={tornarPadrao}
                disabled={ocupado}
                className="rounded-none border-border bg-transparent hover:bg-card text-muted-foreground hover:text-accent h-8 px-3 font-expanded text-[9px] tracking-widest uppercase"
              >
                <Star className="w-3 h-3 mr-1.5" strokeWidth={1.5} /> Tornar padrão
              </Button>
            )}
            <input
              ref={inputFoto}
              type="file"
              accept={FOTO_ACEITA}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void trocarFoto(f);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              onClick={() => inputFoto.current?.click()}
              disabled={ocupado}
              className="rounded-none border-border bg-transparent hover:bg-card text-muted-foreground hover:text-foreground h-8 px-3 font-expanded text-[9px] tracking-widest uppercase"
            >
              <ImagePlus className="w-3 h-3 mr-1.5" strokeWidth={1.5} />
              {enviandoFoto ? "Enviando..." : medico.fotoUrl ? "Trocar foto" : "Adicionar foto"}
            </Button>
            <input
              ref={inputLogo}
              type="file"
              accept={FOTO_ACEITA}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void trocarLogo(f);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              onClick={() => inputLogo.current?.click()}
              disabled={ocupado}
              className="rounded-none border-border bg-transparent hover:bg-card text-muted-foreground hover:text-foreground h-8 px-3 font-expanded text-[9px] tracking-widest uppercase"
            >
              <ImagePlus className="w-3 h-3 mr-1.5" strokeWidth={1.5} />
              {enviandoLogo ? "Enviando..." : medico.logoUrl ? "Trocar logo" : "Adicionar logo"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setEditando(true)}
              disabled={ocupado}
              className="rounded-none border-border bg-transparent hover:bg-card text-muted-foreground hover:text-foreground h-8 px-3 font-expanded text-[9px] tracking-widest uppercase"
            >
              <Pencil className="w-3 h-3 mr-1.5" strokeWidth={1.5} /> Editar
            </Button>
          </div>
          {/* Preview row: foto + logo side by side when either exists */}
          {(medico.fotoUrl || medico.logoUrl) && (
            <div className="flex items-center gap-3 pt-1">
              {medico.fotoUrl && (
                <div className="space-y-0.5">
                  <p className="font-expanded text-[8px] tracking-widest uppercase text-muted-foreground/60">Foto</p>
                  <img
                    src={medico.fotoUrl}
                    alt={`Foto de ${medico.nome}`}
                    className="w-10 h-12 object-cover border border-border"
                    style={{ objectPosition: "50% 20%" }}
                  />
                </div>
              )}
              {medico.logoUrl && (
                <div className="space-y-0.5">
                  <p className="font-expanded text-[8px] tracking-widest uppercase text-muted-foreground/60">Logo</p>
                  <img
                    src={medico.logoUrl}
                    alt={`Logo de ${medico.nome}`}
                    className="h-12 w-auto object-contain border border-border bg-card p-1"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MedicosDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: medicos, isLoading } = useListarMedicos(
    { incluirInativos: true },
    {
      query: {
        enabled: open,
        queryKey: getListarMedicosQueryKey({ incluirInativos: true }),
      },
    },
  );
  const criarMedico = useCriarMedico();
  const { toast } = useToast();
  const inputNovaFoto = useRef<HTMLInputElement>(null);

  const [nome, setNome] = useState("");
  const [crm, setCrm] = useState("");
  const [rqe, setRqe] = useState("");
  const [clinica, setClinica] = useState("");
  const [padrao, setPadrao] = useState(false);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);

  const invalidar = () =>
    queryClient.invalidateQueries({ queryKey: getListarMedicosQueryKey() });

  function limparNovo() {
    setNome("");
    setCrm("");
    setRqe("");
    setClinica("");
    setPadrao(false);
    setFotoFile(null);
  }

  async function adicionar() {
    const nomeLimpo = nome.trim();
    if (!nomeLimpo || salvando) return;
    setSalvando(true);
    try {
      const novo = await criarMedico.mutateAsync({
        data: {
          nome: nomeLimpo,
          crm: crm.trim(),
          rqe: rqe.trim(),
          clinica: clinica.trim(),
          padrao,
        },
      });
      if (fotoFile) {
        try {
          await enviarFoto(novo.id, fotoFile);
        } catch (e) {
          toast(
            toastErroAcao(e, {
              title: "Médico criado, mas a foto falhou",
              description: "Você pode tentar enviar a foto pela lista abaixo.",
            }),
          );
        }
      }
      invalidar();
      limparNovo();
      toast({ title: "Médico cadastrado", description: `${nomeLimpo} foi adicionado.` });
    } catch (e) {
      toast(
        toastErroAcao(e, {
          title: "Não foi possível cadastrar o médico",
          description: "Tente novamente em instantes.",
        }),
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="rounded-none text-muted-foreground hover:text-accent hover:bg-card h-10 font-expanded text-[10px] tracking-widest uppercase">
          <Stethoscope className="w-4 h-4 mr-2" /> Médicos
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-background border border-border text-foreground rounded-none sm:max-w-[520px] p-0 overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
        <div className="h-1 w-full bg-accent shrink-0"></div>
        <div className="p-8 overflow-y-auto">
          <DialogHeader className="mb-6">
            <DialogTitle className="font-serif text-3xl font-light text-foreground">Médicos</DialogTitle>
            <p className="text-muted-foreground font-light text-sm pt-1">
              Cadastre os médicos da operação e escolha quem aparece como padrão ao
              criar uma paciente. A foto e o logo aparecem na página da paciente.
            </p>
          </DialogHeader>

          <div className="space-y-2 border border-border p-4 mb-6">
            <span className={LABEL_CLS}>Novo médico</span>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (ex: Dra. Karla Caetano Lobo)" className={INPUT_CLS} />
            <div className="grid grid-cols-2 gap-2">
              <Input value={crm} onChange={(e) => setCrm(e.target.value)} placeholder="CRM" className={`${INPUT_CLS} font-mono`} />
              <Input value={rqe} onChange={(e) => setRqe(e.target.value)} placeholder="RQE" className={`${INPUT_CLS} font-mono`} />
            </div>
            <Input value={clinica} onChange={(e) => setClinica(e.target.value)} placeholder="Clínica (ex: KCL)" className={INPUT_CLS} />
            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                <input
                  ref={inputNovaFoto}
                  type="file"
                  accept={FOTO_ACEITA}
                  className="hidden"
                  onChange={(e) => {
                    setFotoFile(e.target.files?.[0] ?? null);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => inputNovaFoto.current?.click()}
                  className="rounded-none border-border bg-transparent hover:bg-card text-muted-foreground hover:text-foreground h-9 px-3 font-expanded text-[9px] tracking-widest uppercase"
                >
                  <ImagePlus className="w-3 h-3 mr-1.5" strokeWidth={1.5} />
                  {fotoFile ? "Foto escolhida" : "Foto (opcional)"}
                </Button>
                {fotoFile && (
                  <span className="font-mono text-[10px] text-muted-foreground/70 truncate max-w-[120px]">
                    {fotoFile.name}
                  </span>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground">Padrão</span>
                <Switch checked={padrao} onCheckedChange={setPadrao} className="data-[state=checked]:bg-primary" />
              </label>
            </div>
            <Button
              onClick={adicionar}
              disabled={salvando || !nome.trim()}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-11 mt-1"
            >
              <Plus className="w-4 h-4 mr-2" />
              {salvando ? "Cadastrando..." : "Cadastrar médico"}
            </Button>
          </div>

          <div className="space-y-px bg-card">
            {isLoading ? (
              Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-20 w-full bg-background rounded-none" />)
            ) : medicos?.length === 0 ? (
              <p className="text-muted-foreground font-light text-sm py-8 text-center bg-background">Nenhum médico cadastrado.</p>
            ) : (
              medicos?.map((m) => (
                <LinhaMedico key={m.id} medico={m} onAlterado={invalidar} />
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
