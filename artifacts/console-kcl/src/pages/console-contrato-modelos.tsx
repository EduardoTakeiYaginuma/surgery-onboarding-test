import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  useListarContratoModelos,
  getListarContratoModelosQueryKey,
  useListarVariaveisContrato,
  getListarVariaveisContratoQueryKey,
  useCriarContratoModelo,
  useAtualizarContratoModelo,
  useRemoverContratoModelo,
  useRestaurarContratoModeloPadrao,
  useImportarContratoModelo,
  type ContratoModelo,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import {
  ArrowLeft,
  FileText,
  Plus,
  Pencil,
  Trash2,
  Check,
  Copy,
  RotateCcw,
  Upload,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EditorDocumento } from "@/components/editor-documento";
import { htmlVazio } from "@workspace/secoes";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { DiscardChangesDialog } from "@/components/discard-changes-dialog";
import { EstratosLogo } from "./console-home";
import { ThemeToggle } from "@/components/theme-toggle";
import { motion } from "framer-motion";

type FormState = {
  tipo: ContratoModelo["tipo"];
  procedimento: string;
  titulo: string;
  corpo: string;
  vigente: boolean;
  observacoes: string;
};

const VAZIO: FormState = {
  tipo: "contrato",
  procedimento: "",
  titulo: "",
  corpo: "",
  vigente: true,
  observacoes: "",
};

const TIPO_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const TIPO_PDF = "application/pdf";
const TAMANHO_MAXIMO_IMPORT = 20 * 1024 * 1024;

export default function ConsoleContratoModelos() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: modelos, isLoading, isError } = useListarContratoModelos(
    undefined,
    { query: { queryKey: getListarContratoModelosQueryKey() } },
  );
  const { data: variaveis } = useListarVariaveisContrato({
    query: { queryKey: getListarVariaveisContratoQueryKey() },
  });

  const criar = useCriarContratoModelo();
  const atualizar = useAtualizarContratoModelo();
  const remover = useRemoverContratoModelo();
  const restaurar = useRestaurarContratoModeloPadrao();
  const importar = useImportarContratoModelo();
  const { uploadFile } = useUpload();

  const [editorAberto, setEditorAberto] = useState(false);
  const [editando, setEditando] = useState<ContratoModelo | null>(null);
  const [form, setForm] = useState<FormState>(VAZIO);
  // Snapshot dos campos ao abrir o editor, para detectar edições não salvas. O
  // corpo é tratado à parte (corpoBaseline) porque o TipTap reserializa o HTML
  // ao montar — comparar com o texto de entrada acusaria "sujo" sem edição.
  const [formInicial, setFormInicial] = useState<FormState>(VAZIO);
  const [corpoBaseline, setCorpoBaseline] = useState("");
  const [descartarAberto, setDescartarAberto] = useState(false);
  const [aRemover, setARemover] = useState<ContratoModelo | null>(null);
  const [aRestaurar, setARestaurar] = useState<ContratoModelo | null>(null);
  const [confirmarVigente, setConfirmarVigente] = useState(false);
  const [copiada, setCopiada] = useState<string | null>(null);
  const [chaveEditor, setChaveEditor] = useState(0);
  const [importando, setImportando] = useState(false);
  const arquivoInputRef = useRef<HTMLInputElement>(null);

  function abrirNovo() {
    setEditando(null);
    setForm(VAZIO);
    setFormInicial(VAZIO);
    setCorpoBaseline("");
    setChaveEditor((k) => k + 1);
    setEditorAberto(true);
  }

  function abrirEdicao(m: ContratoModelo) {
    setEditando(m);
    const inicial: FormState = {
      tipo: m.tipo,
      procedimento: m.procedimento,
      titulo: m.titulo,
      corpo: m.corpo,
      vigente: m.vigente,
      observacoes: m.observacoes ?? "",
    };
    setForm(inicial);
    setFormInicial(inicial);
    setCorpoBaseline("");
    setEditorAberto(true);
  }

  function fecharEditor() {
    setEditorAberto(false);
    setEditando(null);
    setForm(VAZIO);
    setFormInicial(VAZIO);
    setCorpoBaseline("");
    setConfirmarVigente(false);
  }

  async function importarArquivo(file: File) {
    const nome = file.name.toLowerCase();
    const ehDocx = nome.endsWith(".docx");
    const ehPdf = nome.endsWith(".pdf");
    if (!ehDocx && !ehPdf) {
      toast({
        title: "Formato não aceito",
        description: "Envie um arquivo Word (.docx) ou PDF (.pdf).",
        variant: "destructive",
      });
      return;
    }
    if (file.size > TAMANHO_MAXIMO_IMPORT) {
      toast({
        title: "Arquivo muito grande",
        description: "O limite é de 20 MB por arquivo.",
        variant: "destructive",
      });
      return;
    }
    setImportando(true);
    try {
      const enviado = await uploadFile(file);
      if (!enviado) throw new Error("Falha no envio do arquivo.");
      const resultado = await importar.mutateAsync({
        data: {
          objectPath: enviado.objectPath,
          nomeArquivo: file.name,
          contentType:
            file.type || (ehDocx ? TIPO_DOCX : TIPO_PDF),
        },
      });
      setEditando(null);
      const inicial: FormState = {
        ...VAZIO,
        titulo: resultado.titulo,
        corpo: resultado.corpo,
      };
      setForm(inicial);
      setFormInicial(inicial);
      setCorpoBaseline("");
      setChaveEditor((k) => k + 1);
      setEditorAberto(true);
      toast({
        title: "Arquivo importado",
        description:
          "Revise o texto, defina o procedimento e insira as variáveis antes de salvar.",
      });
    } catch (error) {
      toast({
        title: "Não foi possível importar o arquivo",
        description:
          error instanceof Error
            ? error.message
            : "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setImportando(false);
      if (arquivoInputRef.current) arquivoInputRef.current.value = "";
    }
  }

  const formValido =
    form.procedimento.trim() !== "" &&
    form.titulo.trim() !== "" &&
    !htmlVazio(form.corpo);

  // Chaves `{{...}}` realmente presentes no corpo do documento. Mesma semântica
  // do servidor (`variaveisNaoResolvidas`): só letras, espaços opcionais.
  const chavesNoCorpo = useMemo(() => {
    const set = new Set<string>();
    const re = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(form.corpo)) !== null) set.add(m[1]);
    return set;
  }, [form.corpo]);

  // Variáveis do catálogo que ainda NÃO aparecem no corpo. É o ponto crítico ao
  // importar um Word/PDF próprio (que chega como texto puro, sem nenhuma chave):
  // sem inseri-las, o documento gerado sai genérico, sem o nome da paciente,
  // procedimento, valores ou dados da médica. Aviso é consultivo (não bloqueia).
  const variaveisAusentes = useMemo(
    () => (variaveis ?? []).filter((v) => !chavesNoCorpo.has(v.chave)),
    [variaveis, chavesNoCorpo],
  );

  // Subconjunto ESSENCIAL ausente para o tipo de documento atual. Diferente do
  // aviso consultivo acima (que lista qualquer variável ausente), são as chaves
  // que, faltando, geram um documento juridicamente genérico — sem o nome da
  // paciente, o procedimento, as credenciais da médica ou os valores. Marcar o
  // modelo como vigente sem elas pede uma confirmação explícita (ver `salvar`).
  const essenciaisAusentes = useMemo(
    () =>
      (variaveis ?? []).filter(
        (v) =>
          (v.essencialPara ?? []).includes(form.tipo) &&
          !chavesNoCorpo.has(v.chave),
      ),
    [variaveis, chavesNoCorpo, form.tipo],
  );

  // Há edições não salvas enquanto o editor está aberto e algum campo difere do
  // snapshot. O corpo só conta depois que o editor emitiu a baseline serializada
  // (corpoBaseline), evitando falso "sujo" pela reserialização do TipTap.
  const dirty =
    editorAberto &&
    corpoBaseline !== "" &&
    (form.tipo !== formInicial.tipo ||
      form.procedimento !== formInicial.procedimento ||
      form.titulo !== formInicial.titulo ||
      form.corpo !== corpoBaseline ||
      form.vigente !== formInicial.vigente ||
      form.observacoes !== formInicial.observacoes);

  useUnsavedChanges(dirty, () => setDescartarAberto(true));

  function tentarFechar() {
    if (dirty) {
      setDescartarAberto(true);
    } else {
      fecharEditor();
    }
  }

  function invalidarLista() {
    queryClient.invalidateQueries({
      queryKey: getListarContratoModelosQueryKey(),
    });
  }

  async function salvar() {
    if (!formValido) return;
    // Freio: marcar como vigente sem as variáveis essenciais geraria documentos
    // genéricos em silêncio. Pede confirmação explícita — rascunhos não vigentes
    // salvam sem fricção.
    if (form.vigente && essenciaisAusentes.length > 0) {
      setConfirmarVigente(true);
      return;
    }
    await gravar();
  }

  async function gravar() {
    if (!formValido) return;
    const payload = {
      tipo: form.tipo,
      procedimento: form.procedimento.trim(),
      titulo: form.titulo.trim(),
      corpo: form.corpo,
      vigente: form.vigente,
      observacoes: form.observacoes.trim() || null,
    };
    try {
      if (editando) {
        await atualizar.mutateAsync({ id: editando.id, data: payload });
        toast({
          title: "Modelo atualizado",
          description: "Uma nova versão do modelo-base foi salva.",
        });
      } else {
        await criar.mutateAsync({ data: payload });
        toast({
          title: "Modelo criado",
          description: "O modelo-base já pode ser usado para gerar contratos.",
        });
      }
      invalidarLista();
      fecharEditor();
    } catch {
      toast({
        variant: "destructive",
        title: "Não foi possível salvar",
        description: "Confira os campos obrigatórios e tente de novo.",
      });
    }
  }

  async function confirmarRemocao() {
    if (!aRemover) return;
    try {
      await remover.mutateAsync({ id: aRemover.id });
      invalidarLista();
      toast({
        title: "Modelo removido",
        description: "O modelo-base não estará mais disponível para novos contratos.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Não foi possível remover",
        description: "Tente de novo em instantes.",
      });
    } finally {
      setARemover(null);
    }
  }

  async function confirmarRestauracao() {
    if (!aRestaurar) return;
    try {
      await restaurar.mutateAsync({
        id: aRestaurar.id,
        data: { confirmar: true },
      });
      invalidarLista();
      toast({
        title: "Modelo restaurado",
        description:
          "O texto de fábrica voltou. Revise e marque como vigente antes de gerar documentos.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Não foi possível restaurar",
        description:
          "Este modelo pode ter sido criado manualmente (sem texto de fábrica). Tente de novo em instantes.",
      });
    } finally {
      setARestaurar(null);
    }
  }

  function copiarVariavel(chave: string) {
    const texto = `{{${chave}}}`;
    navigator.clipboard?.writeText(texto);
    setCopiada(chave);
    setTimeout(() => setCopiada((atual) => (atual === chave ? null : atual)), 1500);
  }

  const salvando = criar.isPending || atualizar.isPending;

  const grupos: {
    tipo: ContratoModelo["tipo"];
    titulo: string;
    itens: ContratoModelo[];
  }[] = [
    {
      tipo: "contrato",
      titulo: "Contratos",
      itens: (modelos ?? []).filter((m) => m.tipo === "contrato"),
    },
    {
      tipo: "termo",
      titulo: "Termos de consentimento (TCLE)",
      itens: (modelos ?? []).filter((m) => m.tipo === "termo"),
    },
  ];

  const renderModeloCard = (m: ContratoModelo) => (
    <div
      key={m.id}
      className="border border-border p-5 flex items-start justify-between gap-4"
    >
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-expanded text-[10px] tracking-widest uppercase text-accent">
            {m.procedimento}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground/60 uppercase tracking-wider">
            v{m.versao}
          </span>
          {!m.vigente && (
            <span className="font-expanded text-[9px] tracking-widest uppercase border border-border px-2 py-0.5 text-muted-foreground">
              Inativo
            </span>
          )}
          {m.statusFabrica === "desatualizado" && (
            <span
              title="O texto difere do modelo de fábrica mais recente — pode haver atualização jurídica pendente, ou foi editado pela equipe."
              className="font-expanded text-[9px] tracking-widest uppercase border border-accent/60 text-accent px-2 py-0.5"
            >
              Desatualizado
            </span>
          )}
          {m.statusFabrica === "igual" && (
            <span
              title="O texto está idêntico ao modelo de fábrica mais recente."
              className="font-expanded text-[9px] tracking-widest uppercase border border-border px-2 py-0.5 text-muted-foreground/70"
            >
              Igual à fábrica
            </span>
          )}
        </div>
        <p className="text-foreground font-light leading-snug truncate">
          {m.titulo}
        </p>
        {m.observacoes && (
          <p className="text-xs text-muted-foreground/80 font-light truncate">
            {m.observacoes}
          </p>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={() => abrirEdicao(m)}
          className="rounded-none border-border bg-transparent hover:bg-card text-muted-foreground hover:text-foreground h-9 px-3 gap-2"
        >
          <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
          Editar
        </Button>
        {m.statusFabrica !== null && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setARestaurar(m)}
            title="Restaurar ao modelo de fábrica"
            className="rounded-none border-border bg-transparent hover:bg-card text-muted-foreground hover:text-accent h-9 px-3 gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
            Restaurar
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setARemover(m)}
          className="rounded-none border-border bg-transparent hover:bg-card text-muted-foreground hover:text-red-400 h-9 px-3"
        >
          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );

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
              MODELOS DE DOCUMENTO
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
          <h1 className="font-serif text-4xl md:text-5xl font-light tracking-tight text-foreground">
            Modelos-base de contrato e termo
          </h1>
          <p className="text-muted-foreground font-light text-lg leading-relaxed">
            Cada procedimento tem um contrato-base e um termo de consentimento
            (TCLE) aprovados. A partir da página de uma paciente, o Console
            preenche o modelo com os dados dela, passa por uma revisão de IA e só
            envia à Autentique depois da sua aprovação. Use chaves entre{" "}
            <code className="font-mono text-accent">{"{{ }}"}</code> para os campos
            que serão preenchidos automaticamente.
          </p>
        </header>

        {variaveis && variaveis.length > 0 && (
          <section className="space-y-4 border border-border p-6">
            <div className="space-y-1">
              <h2 className="font-serif text-2xl font-light tracking-tight text-foreground">
                Variáveis disponíveis
              </h2>
              <p className="text-muted-foreground font-light leading-relaxed">
                Clique para copiar a chave e cole no corpo do contrato. Tudo que
                não for variável é mantido exatamente como escrito.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {variaveis.map((v) => (
                <button
                  key={v.chave}
                  type="button"
                  onClick={() => copiarVariavel(v.chave)}
                  className="flex items-center justify-between gap-3 text-left border border-border/60 bg-background hover:border-accent/50 transition-colors px-3 py-2 group"
                >
                  <div className="min-w-0">
                    <code className="font-mono text-xs text-accent">{`{{${v.chave}}}`}</code>
                    <p className="text-[11px] text-muted-foreground font-light truncate">
                      {v.descricao}
                    </p>
                  </div>
                  {copiada === v.chave ? (
                    <Check className="w-3.5 h-3.5 text-accent shrink-0" strokeWidth={2} />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-accent shrink-0" strokeWidth={1.5} />
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-serif text-2xl font-light tracking-tight text-foreground">
              Modelos cadastrados
            </h2>
            <div className="flex items-center gap-2 shrink-0">
              <input
                ref={arquivoInputRef}
                type="file"
                accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importarArquivo(file);
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={importando}
                onClick={() => arquivoInputRef.current?.click()}
                title="Envie o modelo próprio da clínica (Word/PDF)"
                aria-label="Subir modelo próprio da clínica"
                className="rounded-none border-border bg-transparent text-foreground font-medium h-11 px-5 gap-2"
              >
                {importando ? (
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Upload className="w-4 h-4" strokeWidth={1.5} />
                )}
                {importando ? "Importando..." : "Subir modelo da clínica"}
              </Button>
              <Button
                onClick={abrirNovo}
                className="rounded-none bg-primary hover:bg-primary/90 text-primary-foreground font-medium h-11 px-5 gap-2"
              >
                <Plus className="w-4 h-4" strokeWidth={1.5} />
                Novo modelo
              </Button>
            </div>
          </div>

          {isError ? (
            <div className="border border-dashed border-border p-8 text-center text-muted-foreground font-light">
              Não foi possível carregar os modelos. Tente recarregar a página.
            </div>
          ) : isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full bg-card rounded-none" />
              <Skeleton className="h-24 w-full bg-card rounded-none" />
            </div>
          ) : !modelos || modelos.length === 0 ? (
            <div className="border border-dashed border-border p-10 text-center space-y-2">
              <FileText className="w-8 h-8 mx-auto text-muted-foreground/40" strokeWidth={1.2} />
              <p className="text-muted-foreground font-light">
                Nenhum modelo cadastrado ainda. Crie o primeiro modelo-base para
                começar a gerar contratos.
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              {grupos.map((grupo) =>
                grupo.itens.length === 0 ? null : (
                  <div key={grupo.tipo} className="space-y-3">
                    <h3 className="font-expanded text-[10px] tracking-widest uppercase text-muted-foreground border-b border-border/60 pb-2">
                      {grupo.titulo}
                    </h3>
                    {grupo.itens.map((m) => renderModeloCard(m))}
                  </div>
                ),
              )}
            </div>
          )}
        </section>
      </motion.main>

      <Dialog
        open={editorAberto}
        onOpenChange={(aberto) => {
          if (!aberto) tentarFechar();
        }}
      >
        <DialogContent className="rounded-none max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl font-light tracking-tight">
              {editando ? "Editar modelo-base" : "Novo modelo-base"}
            </DialogTitle>
            <DialogDescription className="font-light">
              {editando
                ? "Salvar gera uma nova versão do modelo. Contratos já criados não são afetados."
                : "Defina o procedimento, o título e o corpo do contrato. Use {{variáveis}} para os campos automáticos."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <label className="font-expanded text-[10px] tracking-widest uppercase text-muted-foreground">
                Tipo de documento
              </label>
              <Select
                value={form.tipo}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, tipo: v as ContratoModelo["tipo"] }))
                }
                disabled={!!editando}
              >
                <SelectTrigger className="rounded-none h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="contrato" className="rounded-none">
                    Contrato
                  </SelectItem>
                  <SelectItem value="termo" className="rounded-none">
                    Termo de consentimento (TCLE)
                  </SelectItem>
                </SelectContent>
              </Select>
              {editando && (
                <p className="text-[11px] text-muted-foreground/70 font-light">
                  O tipo não muda ao editar — crie um novo modelo para o outro
                  tipo.
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-expanded text-[10px] tracking-widest uppercase text-muted-foreground">
                  Procedimento
                </label>
                <Input
                  value={form.procedimento}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, procedimento: e.target.value }))
                  }
                  placeholder="Ex.: Blefaroplastia"
                  className="rounded-none h-11"
                />
              </div>
              <div className="space-y-2 flex flex-col">
                <label className="font-expanded text-[10px] tracking-widest uppercase text-muted-foreground">
                  Modelo vigente
                </label>
                <div className="flex items-center gap-3 h-11">
                  <Switch
                    checked={form.vigente}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, vigente: v }))}
                  />
                  <span className="text-sm text-muted-foreground font-light">
                    {form.vigente
                      ? "Disponível para gerar documentos"
                      : "Guardado, mas não aparece na geração"}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="font-expanded text-[10px] tracking-widest uppercase text-muted-foreground">
                Título do documento
              </label>
              <Input
                value={form.titulo}
                onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                placeholder="Ex.: Contrato de prestação de serviços médicos — Blefaroplastia"
                className="rounded-none h-11"
              />
            </div>

            <div className="space-y-2">
              <label className="font-expanded text-[10px] tracking-widest uppercase text-muted-foreground">
                Corpo do documento
              </label>
              <EditorDocumento
                key={editando ? `m-${editando.id}` : `novo-${chaveEditor}`}
                value={form.corpo}
                onChange={(html) => setForm((f) => ({ ...f, corpo: html }))}
                onReady={(html) => {
                  setCorpoBaseline(html);
                  setForm((f) => ({ ...f, corpo: html }));
                }}
                variaveis={variaveis ?? []}
                minHeight={280}
              />
              <p className="text-[11px] text-muted-foreground/70 font-light">
                Formate o texto com a barra de ferramentas. Use o menu{" "}
                <span className="text-foreground">Variável</span> para inserir
                campos <code className="font-mono text-accent">{"{{ }}"}</code>{" "}
                que serão preenchidos automaticamente.
              </p>
            </div>

            {variaveis && variaveis.length > 0 && (
              variaveisAusentes.length > 0 ? (
                <div className="space-y-3 border border-accent/50 bg-accent/5 p-4">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle
                      className="w-4 h-4 text-accent shrink-0 mt-0.5"
                      strokeWidth={1.8}
                    />
                    <div className="space-y-1">
                      <p className="font-expanded text-[10px] tracking-widest uppercase text-accent">
                        {variaveisAusentes.length}{" "}
                        {variaveisAusentes.length === 1
                          ? "variável ainda não inserida"
                          : "variáveis ainda não inseridas"}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-light leading-relaxed">
                        Sem estas chaves no corpo, o documento gerado sai
                        genérico — sem o nome da paciente, procedimento, valores
                        ou dados da médica. Use o menu{" "}
                        <span className="text-foreground">Variável</span> acima
                        para inseri-las, ou clique abaixo para copiar a chave.
                        Recomendado antes de marcar o modelo como vigente.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {variaveisAusentes.map((v) => (
                      <button
                        key={v.chave}
                        type="button"
                        onClick={() => copiarVariavel(v.chave)}
                        className="flex items-center justify-between gap-3 text-left border border-border/60 bg-background hover:border-accent/50 transition-colors px-3 py-2 group"
                      >
                        <div className="min-w-0">
                          <code className="font-mono text-xs text-accent">{`{{${v.chave}}}`}</code>
                          <p className="text-[11px] text-muted-foreground font-light truncate">
                            {v.descricao}
                          </p>
                        </div>
                        {copiada === v.chave ? (
                          <Check
                            className="w-3.5 h-3.5 text-accent shrink-0"
                            strokeWidth={2}
                          />
                        ) : (
                          <Copy
                            className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-accent shrink-0"
                            strokeWidth={1.5}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 border border-border/60 p-3 text-[11px] text-muted-foreground font-light">
                  <Check
                    className="w-3.5 h-3.5 text-accent shrink-0"
                    strokeWidth={2}
                  />
                  Todas as variáveis disponíveis já estão no corpo do documento.
                </div>
              )
            )}

            <div className="space-y-2">
              <label className="font-expanded text-[10px] tracking-widest uppercase text-muted-foreground">
                Observações internas (opcional)
              </label>
              <Input
                value={form.observacoes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, observacoes: e.target.value }))
                }
                placeholder="Nota de uso interno — não aparece no contrato"
                className="rounded-none h-11"
              />
            </div>
          </div>

          {confirmarVigente && (
            <div
              role="alertdialog"
              aria-label="Marcar como vigente mesmo assim?"
              className="space-y-3 border border-accent/60 bg-accent/5 p-4"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle
                  className="w-4 h-4 text-accent shrink-0 mt-0.5"
                  strokeWidth={1.8}
                />
                <div className="space-y-1">
                  <p className="font-expanded text-[10px] tracking-widest uppercase text-accent">
                    Marcar como vigente mesmo assim?
                  </p>
                  <p className="text-[11px] text-muted-foreground font-light leading-relaxed">
                    {form.tipo === "termo"
                      ? "Este termo está sem variáveis essenciais no corpo. "
                      : "Este contrato está sem variáveis essenciais no corpo. "}
                    Sem elas, os documentos gerados sairão genéricos — faltando o
                    nome da paciente, o procedimento ou outros dados que seriam
                    preenchidos automaticamente.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {essenciaisAusentes.map((v) => (
                  <code
                    key={v.chave}
                    className="font-mono text-xs text-accent border border-accent/40 bg-background px-2 py-1"
                  >{`{{${v.chave}}}`}</code>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            {confirmarVigente ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setConfirmarVigente(false)}
                  className="rounded-none border-border bg-transparent h-11 px-6"
                >
                  Voltar e inserir
                </Button>
                <Button
                  onClick={() => {
                    setConfirmarVigente(false);
                    void gravar();
                  }}
                  disabled={salvando}
                  className="rounded-none bg-primary hover:bg-primary/90 text-primary-foreground font-medium h-11 px-6"
                >
                  {salvando ? "Salvando..." : "Marcar como vigente"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={tentarFechar}
                  className="rounded-none border-border bg-transparent h-11 px-6"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={salvar}
                  disabled={!formValido || salvando}
                  className="rounded-none bg-primary hover:bg-primary/90 text-primary-foreground font-medium h-11 px-6"
                >
                  {salvando ? "Salvando..." : editando ? "Salvar nova versão" : "Criar modelo"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DiscardChangesDialog
        open={descartarAberto}
        onOpenChange={setDescartarAberto}
        onConfirm={() => {
          setDescartarAberto(false);
          fecharEditor();
        }}
      />

      <AlertDialog open={aRemover !== null} onOpenChange={(o) => !o && setARemover(null)}>
        <AlertDialogContent className="rounded-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-xl font-light tracking-tight">
              Remover este modelo?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-light">
              {aRemover?.titulo} ({aRemover?.procedimento}) não estará mais
              disponível para gerar novos contratos. Contratos já criados não são
              afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarRemocao}
              disabled={remover.isPending}
              className="rounded-none bg-red-500 hover:bg-red-500/90 text-white"
            >
              {remover.isPending ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={aRestaurar !== null}
        onOpenChange={(o) => !o && setARestaurar(null)}
      >
        <AlertDialogContent className="rounded-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-xl font-light tracking-tight">
              Restaurar ao modelo de fábrica?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-light">
              O texto atual de {aRestaurar?.titulo} ({aRestaurar?.procedimento})
              será substituído pelo modelo de fábrica mais recente. Qualquer
              edição feita pela equipe será perdida e o modelo ficará{" "}
              <strong className="font-medium text-foreground">não vigente</strong>{" "}
              — revise e marque como vigente antes de gerar documentos. Contratos
              já criados não são afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarRestauracao}
              disabled={restaurar.isPending}
              className="rounded-none bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {restaurar.isPending ? "Restaurando..." : "Restaurar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
