import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListarLocais,
  useCriarLocal,
  useAtualizarLocal,
  useRemoverLocal,
  getListarLocaisQueryKey,
  getObterConfigQueryKey,
  type Local,
} from "@workspace/api-client-react";
import { ArrowLeft, MapPin, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { EstratosLogo } from "./console-home";
import { ThemeToggle } from "@/components/theme-toggle";
import { motion } from "framer-motion";

const LABEL_CLS =
  "text-muted-foreground font-expanded text-[10px] tracking-widest uppercase";
const INPUT_CLS =
  "bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-11 text-foreground";

/** Campos editáveis de um local (o que o formulário manipula). */
interface FormLocal {
  nome: string;
  nomeCompleto: string;
  endereco: string;
  contatoCcNome: string;
  contatoCcTelefone: string;
  instrucoesChegada: string;
  sinalSugerido: string; // texto no input; "" = sem sugestão
  ativo: boolean;
}

const VAZIO: FormLocal = {
  nome: "",
  nomeCompleto: "",
  endereco: "",
  contatoCcNome: "",
  contatoCcTelefone: "",
  instrucoesChegada: "",
  sinalSugerido: "",
  ativo: true,
};

function localParaForm(l: Local): FormLocal {
  return {
    nome: l.nome,
    nomeCompleto: l.nomeCompleto,
    endereco: l.endereco,
    contatoCcNome: l.contatoCcNome,
    contatoCcTelefone: l.contatoCcTelefone,
    instrucoesChegada: l.instrucoesChegada,
    sinalSugerido: l.sinalSugerido != null ? String(l.sinalSugerido) : "",
    ativo: l.ativo,
  };
}

export default function ConsoleLocais() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Inclui inativos para a equipe conseguir reativar/remover.
  const { data: locais, isLoading, isError } = useListarLocais({
    incluirInativos: true,
  });
  const criar = useCriarLocal();
  const atualizar = useAtualizarLocal();
  const remover = useRemoverLocal();

  // Diálogo de criar/editar. `editando` null = criando.
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Local | null>(null);
  const [form, setForm] = useState<FormLocal>(VAZIO);
  const [aRemover, setARemover] = useState<Local | null>(null);

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: getListarLocaisQueryKey() });
    // O /config expõe a lista para os seletores — recarrega junto.
    queryClient.invalidateQueries({ queryKey: getObterConfigQueryKey() });
  }

  function abrirNovo() {
    setEditando(null);
    setForm(VAZIO);
    setAberto(true);
  }

  function abrirEdicao(l: Local) {
    setEditando(l);
    setForm(localParaForm(l));
    setAberto(true);
  }

  function setCampo<K extends keyof FormLocal>(k: K, v: FormLocal[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function salvar() {
    const nome = form.nome.trim();
    if (!nome) {
      toast({ title: "Informe o nome do local.", variant: "destructive" });
      return;
    }
    const sinalTxt = form.sinalSugerido.trim().replace(",", ".");
    const sinal = sinalTxt === "" ? null : Number(sinalTxt);
    if (sinal != null && !Number.isFinite(sinal)) {
      toast({ title: "Valor de sinal inválido.", variant: "destructive" });
      return;
    }
    const corpo = {
      nome,
      nomeCompleto: form.nomeCompleto.trim(),
      endereco: form.endereco.trim(),
      contatoCcNome: form.contatoCcNome.trim(),
      contatoCcTelefone: form.contatoCcTelefone.trim(),
      instrucoesChegada: form.instrucoesChegada.trim(),
      sinalSugerido: sinal,
    };

    if (editando) {
      atualizar.mutate(
        { id: editando.id, data: { ...corpo, ativo: form.ativo } },
        {
          onSuccess: () => {
            invalidar();
            setAberto(false);
            toast({ title: "Local atualizado." });
          },
          onError: () =>
            toast({
              title: "Não foi possível salvar o local.",
              variant: "destructive",
            }),
        },
      );
    } else {
      criar.mutate(
        { data: corpo },
        {
          onSuccess: () => {
            invalidar();
            setAberto(false);
            toast({ title: "Local cadastrado." });
          },
          onError: () =>
            toast({
              title: "Não foi possível cadastrar o local.",
              description: "Já pode existir um local com este nome.",
              variant: "destructive",
            }),
        },
      );
    }
  }

  function confirmarRemocao() {
    if (!aRemover) return;
    remover.mutate(
      { id: aRemover.id },
      {
        onSuccess: () => {
          invalidar();
          setARemover(null);
          toast({ title: "Local removido." });
        },
        onError: () => {
          setARemover(null);
          toast({
            title: "Não foi possível remover o local.",
            variant: "destructive",
          });
        },
      },
    );
  }

  const salvando = criar.isPending || atualizar.isPending;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground pb-24 font-sans selection:bg-accent/30">
      <header className="border-b border-border bg-background/90 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
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
              LOCAIS DE CIRURGIA
            </span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-4xl mx-auto px-4 mt-12 space-y-8"
      >
        <header className="space-y-3">
          <h1 className="font-serif text-4xl md:text-5xl font-light tracking-tight text-foreground flex items-center gap-3">
            <MapPin className="w-8 h-8 text-accent" strokeWidth={1.5} />
            Locais de cirurgia
          </h1>
          <p className="text-muted-foreground text-sm font-light max-w-2xl">
            Endereços padrão dos hospitais. A equipe escolhe um destes no cadastro
            da paciente (ou digita um novo). O contato do Centro Cirúrgico e as
            instruções de chegada entram nas mensagens e na página da paciente.
          </p>
        </header>

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={abrirNovo}
            className="rounded-none gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} /> Novo local
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-none" />
            <Skeleton className="h-24 w-full rounded-none" />
          </div>
        ) : isError ? (
          <p className="text-sm text-red-400 font-mono">
            Não foi possível carregar os locais.
          </p>
        ) : (locais ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground font-light">
            Nenhum local cadastrado ainda.
          </p>
        ) : (
          <ul className="space-y-3">
            {(locais ?? []).map((l) => (
              <li
                key={l.id}
                className="border border-border bg-card/40 p-4 flex items-start justify-between gap-4"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-medium">{l.nome}</span>
                    {!l.ativo && (
                      <span className="text-[10px] font-expanded tracking-widest uppercase text-muted-foreground border border-border px-1.5 py-0.5">
                        Inativo
                      </span>
                    )}
                  </div>
                  {l.nomeCompleto && (
                    <p className="text-sm text-muted-foreground font-light">
                      {l.nomeCompleto}
                    </p>
                  )}
                  {l.endereco && (
                    <p className="text-xs text-muted-foreground/80 font-light">
                      {l.endereco}
                    </p>
                  )}
                  {(l.contatoCcNome || l.contatoCcTelefone) && (
                    <p className="text-xs text-muted-foreground/80 font-mono">
                      CC: {l.contatoCcNome} {l.contatoCcTelefone}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => abrirEdicao(l)}
                    aria-label="Editar local"
                    className="rounded-none text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="w-4 h-4" strokeWidth={1.5} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setARemover(l)}
                    aria-label="Remover local"
                    className="rounded-none text-muted-foreground hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </motion.main>

      {/* Diálogo criar/editar */}
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="rounded-none bg-background border-border max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif font-light text-2xl">
              {editando ? "Editar local" : "Novo local"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className={LABEL_CLS}>Nome (curto)</Label>
              <Input
                className={INPUT_CLS}
                value={form.nome}
                onChange={(e) => setCampo("nome", e.target.value)}
                placeholder="Ex: Avant Moema"
              />
            </div>
            <div className="space-y-1.5">
              <Label className={LABEL_CLS}>Nome completo</Label>
              <Input
                className={INPUT_CLS}
                value={form.nomeCompleto}
                onChange={(e) => setCampo("nomeCompleto", e.target.value)}
                placeholder="Ex: Avant Moema Day Hospital"
              />
            </div>
            <div className="space-y-1.5">
              <Label className={LABEL_CLS}>Endereço</Label>
              <Input
                className={INPUT_CLS}
                value={form.endereco}
                onChange={(e) => setCampo("endereco", e.target.value)}
                placeholder="Ex: Av. Copacabana, 112, 3º andar — Moema, São Paulo"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className={LABEL_CLS}>Contato CC (nome)</Label>
                <Input
                  className={INPUT_CLS}
                  value={form.contatoCcNome}
                  onChange={(e) => setCampo("contatoCcNome", e.target.value)}
                  placeholder="Ex: Alana"
                />
              </div>
              <div className="space-y-1.5">
                <Label className={LABEL_CLS}>Contato CC (telefone)</Label>
                <Input
                  className={INPUT_CLS}
                  value={form.contatoCcTelefone}
                  onChange={(e) => setCampo("contatoCcTelefone", e.target.value)}
                  placeholder="Ex: (11) 94215-3780"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className={LABEL_CLS}>Instruções de chegada</Label>
              <Textarea
                className="bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none text-foreground min-h-20"
                value={form.instrucoesChegada}
                onChange={(e) => setCampo("instrucoesChegada", e.target.value)}
                placeholder="Ex: Chegue 2h antes e confirme o jejum com a equipe."
              />
            </div>
            <div className="space-y-1.5">
              <Label className={LABEL_CLS}>Sinal sugerido (opcional)</Label>
              <Input
                inputMode="decimal"
                className={INPUT_CLS}
                value={form.sinalSugerido}
                onChange={(e) => setCampo("sinalSugerido", e.target.value)}
                placeholder="Ex: 5000"
              />
            </div>
            {editando && (
              <div className="flex items-center justify-between border-t border-border pt-4">
                <div>
                  <Label className={LABEL_CLS}>Ativo</Label>
                  <p className="text-xs text-muted-foreground/80 font-light">
                    Inativo some dos seletores, mas mantém o histórico.
                  </p>
                </div>
                <Switch
                  checked={form.ativo}
                  onCheckedChange={(v) => setCampo("ativo", v)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAberto(false)}
              className="rounded-none gap-2"
            >
              <X className="w-4 h-4" strokeWidth={1.5} /> Cancelar
            </Button>
            <Button
              type="button"
              onClick={salvar}
              disabled={salvando}
              className="rounded-none gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Check className="w-4 h-4" strokeWidth={1.5} />
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de remoção */}
      <Dialog open={aRemover != null} onOpenChange={(v) => !v && setARemover(null)}>
        <DialogContent className="rounded-none bg-background border-border">
          <DialogHeader>
            <DialogTitle className="font-serif font-light text-2xl">
              Remover local
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground font-light">
            Remover <span className="text-foreground">{aRemover?.nome}</span>? As
            pacientes que já o usaram mantêm o endereço registrado. Para apenas
            tirá-lo dos seletores, prefira desativar.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setARemover(null)}
              className="rounded-none"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={confirmarRemocao}
              disabled={remover.isPending}
              className="rounded-none bg-red-500/90 text-white hover:bg-red-500"
            >
              {remover.isPending ? "Removendo…" : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
