import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  type SecaoConteudo,
  type SecaoEtapa,
  type SecaoContato,
  type SecaoGrupoMedicamentos,
  type SecaoMedicamento,
  type SecaoArquivo,
  type SecaoProduto,
  type SecaoMedicacao,
  SecaoConteudoTipo,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronUp, ChevronDown, Trash2, Plus, GripVertical, Eye, AlertTriangle, Upload, FileText, Loader2 } from "lucide-react";
import { VARIAVEIS_DISPONIVEIS } from "@workspace/secoes";
import { useToast } from "@/hooks/use-toast";
import { SecoesPreviewDialog } from "@/components/secoes-preview-dialog";
import { DADOS_PREVIEW_EXEMPLO, type DadosPreview } from "@/lib/secoes-preview";
import {
  pareceTelefone,
  formatarContatoTelefone,
  contatoTelefoneIncompleto,
} from "@/lib/br-validacao";

const TIPO_ROTULO: Record<SecaoConteudo["tipo"], string> = {
  linha_do_tempo: "Linha do tempo",
  lista: "Lista de itens",
  documentos: "Documentos",
  politica: "Política / Texto recolhível",
  contatos: "Contatos",
  texto: "Texto livre",
  preparo: "Exames pré-operatórios",
  suspensao_medicamentos: "Suspensão de medicamentos",
  preparo_pele: "Preparo da pele",
  receituario_posop: "Receituário pós-operatório",
};

// Os chips de "Variáveis disponíveis" derivam do catálogo único em
// `@workspace/secoes`. Acrescentar uma chave lá faz o chip aparecer aqui
// automaticamente — não declare a lista localmente.
const VARIAVEIS = VARIAVEIS_DISPONIVEIS.map((v) => ({
  token: `{{${v.chave}}}`,
  descricao: v.descricao,
}));

/** Os campos de texto onde uma variável pode ser inserida. */
type CampoTexto = HTMLInputElement | HTMLTextAreaElement;

/** Um campo de texto livre (exclui number/checkbox/radio, que não recebem variáveis). */
function ehCampoTexto(alvo: EventTarget | null): alvo is CampoTexto {
  if (alvo instanceof HTMLTextAreaElement) return true;
  if (alvo instanceof HTMLInputElement) {
    return alvo.type !== "number" && alvo.type !== "checkbox" && alvo.type !== "radio";
  }
  return false;
}

/**
 * Insere `token` na posição do cursor de um campo controlado pelo React.
 * Usa o setter nativo + evento `input` para que o `onChange` do React dispare e
 * o estado da seção seja atualizado (mutar `value` direto não notifica o React).
 */
function inserirTokenNoCampo(el: CampoTexto, token: string) {
  const inicio = el.selectionStart ?? el.value.length;
  const fim = el.selectionEnd ?? el.value.length;
  const novoValor = el.value.slice(0, inicio) + token + el.value.slice(fim);

  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, novoValor);
  el.dispatchEvent(new Event("input", { bubbles: true }));

  const posCursor = inicio + token.length;
  el.focus();
  el.setSelectionRange(posCursor, posCursor);
}

function gerarId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `secao-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function secaoNova(tipo: SecaoConteudo["tipo"]): SecaoConteudo {
  const base: SecaoConteudo = { id: gerarId(), tipo, titulo: "" };
  switch (tipo) {
    case "linha_do_tempo":
      return { ...base, titulo: "Sua jornada", etapas: [] };
    case "preparo":
      return {
        ...base,
        titulo: "Exames Pré-Operatórios",
        corpo:
          "Realize os exames abaixo o mais breve possível e nos envie os resultados para anexarmos ao seu prontuário.",
        itens: [],
      };
    case "lista":
      return { ...base, titulo: "Como se preparar", itens: [] };
    case "documentos":
      return { ...base, titulo: "Documentos", itens: [] };
    case "politica":
      return { ...base, titulo: "Política de remarcação", corpo: "" };
    case "contatos":
      return { ...base, titulo: "Contatos", contatos: [] };
    case "texto":
      return { ...base, titulo: "Texto", corpo: "" };
    case "suspensao_medicamentos":
      return {
        ...base,
        titulo: "Suspensão de Medicamentos",
        corpo:
          "Se você utiliza algum dos medicamentos abaixo, suspenda-o com a antecedência indicada. Caso não use nenhum deles, desconsidere esta seção.",
        aviso:
          "Se você toma medicamentos de uso contínuo que não estão nesta lista, mantenha o uso normal conforme orientação do seu médico. Caso tenha dúvida sobre algum medicamento específico, entre em contato conosco.",
        grupos: [],
      };
    case "preparo_pele":
      return {
        ...base,
        titulo: "Preparo da Pele",
        corpo:
          "Inicie o uso dos produtos abaixo conforme orientação. Eles ajudam a preparar sua pele para o melhor resultado cirúrgico.",
        produtos: [],
      };
    case "receituario_posop":
      return {
        ...base,
        titulo: "Receituário Pós-Operatório",
        corpo:
          "Medicações que serão utilizadas após o procedimento. Já deixe tudo separado para o dia da cirurgia.",
        aviso: "",
        medicacoes: [],
      };
    default:
      return base;
  }
}

const labelCls = "font-expanded text-[9px] tracking-widest uppercase text-muted-foreground";
const inputCls =
  "rounded-none bg-background border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-ring/40";
const subBtnCls =
  "rounded-none border-border bg-transparent hover:bg-card text-muted-foreground hover:text-foreground h-9 px-3 text-xs font-medium";

export function SecoesEditor({
  secoes,
  onChange,
  dadosPreview = DADOS_PREVIEW_EXEMPLO,
  slotPreparo,
  slotPreparoPele,
  slotReceituario,
}: {
  secoes: SecaoConteudo[];
  onChange: (secoes: SecaoConteudo[]) => void;
  /** Dados usados para substituir as variáveis na pré-visualização. */
  dadosPreview?: DadosPreview;
  /**
   * Conteúdo extra renderizado dentro do bloco da seção de exames pré-operatórios
   * (`tipo: "preparo"`), logo após a lista de exames. Usado pelo Console para
   * colocar ali o upload do PDF de pedido de exames (dado por paciente), junto do
   * conteúdo a que ele pertence.
   */
  slotPreparo?: ReactNode;
  /**
   * Igual a `slotPreparo`, mas para a seção de preparo da pele (`tipo:
   * "preparo_pele"`): o upload do PDF da receita (dado por paciente), após a
   * lista de produtos.
   */
  slotPreparoPele?: ReactNode;
  /**
   * Igual, mas para a seção de receituário pós-operatório (`tipo:
   * "receituario_posop"`): o upload do PDF do receituário (dado por paciente).
   */
  slotReceituario?: ReactNode;
}) {
  const [novoTipo, setNovoTipo] = useState<SecaoConteudo["tipo"]>("texto");
  const [previewAberto, setPreviewAberto] = useState(false);
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const ultimoCampo = useRef<CampoTexto | null>(null);

  // Memoriza o último campo de texto focado, para que um clique no chip saiba
  // onde inserir a variável mesmo depois de o foco migrar para o botão.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const aoFocar = (e: FocusEvent) => {
      if (ehCampoTexto(e.target)) ultimoCampo.current = e.target;
    };
    container.addEventListener("focusin", aoFocar);
    return () => container.removeEventListener("focusin", aoFocar);
  }, []);

  function inserirVariavel(token: string) {
    const el = ultimoCampo.current;
    if (el && el.isConnected) {
      inserirTokenNoCampo(el, token);
      return;
    }
    // Nenhum campo focado: copia para a área de transferência como alternativa.
    ultimoCampo.current = null;
    const avisarSelecione = () =>
      toast({
        title: "Selecione um campo primeiro",
        description: `Clique no campo onde quer inserir ${token} e depois no chip.`,
      });

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(token)
        .then(() =>
          toast({
            title: "Variável copiada",
            description: `${token} — clique num campo e cole, ou clique no chip com o campo já selecionado.`,
          }),
        )
        .catch(avisarSelecione);
    } else {
      avisarSelecione();
    }
  }

  function atualizar(idx: number, patch: Partial<SecaoConteudo>) {
    onChange(secoes.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function remover(idx: number) {
    onChange(secoes.filter((_, i) => i !== idx));
  }

  function mover(idx: number, dir: -1 | 1) {
    const alvo = idx + dir;
    if (alvo < 0 || alvo >= secoes.length) return;
    const copia = [...secoes];
    [copia[idx], copia[alvo]] = [copia[alvo], copia[idx]];
    onChange(copia);
  }

  function adicionar() {
    onChange([...secoes, secaoNova(novoTipo)]);
  }

  return (
    <div className="space-y-6" ref={containerRef}>
      {/* Variáveis disponíveis */}
      <div className="border border-border bg-card/20 p-5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h4 className={labelCls}>Variáveis disponíveis</h4>
          <Button
            type="button"
            variant="outline"
            onClick={() => setPreviewAberto(true)}
            className="rounded-none border-accent/40 bg-transparent hover:bg-card text-accent hover:text-foreground h-9 px-4 text-xs font-medium shrink-0"
          >
            <Eye className="w-3.5 h-3.5 mr-2" strokeWidth={1.5} />
            Pré-visualizar
          </Button>
        </div>
        <p className="text-muted-foreground font-light text-sm leading-relaxed">
          Clique num campo abaixo e depois num código para inseri-lo no cursor — eles são substituídos automaticamente pelos dados de cada paciente.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {VARIAVEIS.map((v) => (
            <button
              type="button"
              key={v.token}
              title={`${v.descricao} — clique para inserir`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => inserirVariavel(v.token)}
              className="font-mono text-[11px] text-accent border border-accent/30 px-2 py-1 cursor-pointer transition-colors hover:bg-accent/10 hover:border-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40"
            >
              {v.token}
            </button>
          ))}
        </div>
      </div>

      {/* Seções */}
      <div className="space-y-4">
        {secoes.length === 0 && (
          <div className="border border-dashed border-border p-8 text-center text-muted-foreground font-light">
            Nenhuma seção ainda. Adicione a primeira abaixo.
          </div>
        )}
        {secoes.map((secao, idx) => (
          <div key={secao.id} className="border border-border bg-card/20">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex items-center gap-3">
                <GripVertical className="w-4 h-4 text-muted-foreground/50" strokeWidth={1.5} />
                <span className="font-expanded text-[9px] tracking-widest uppercase text-accent">
                  {TIPO_ROTULO[secao.tipo]}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => mover(idx, -1)}
                  disabled={idx === 0}
                  className="h-8 w-8 rounded-none text-muted-foreground hover:text-foreground hover:bg-card disabled:opacity-30"
                >
                  <ChevronUp className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => mover(idx, 1)}
                  disabled={idx === secoes.length - 1}
                  className="h-8 w-8 rounded-none text-muted-foreground hover:text-foreground hover:bg-card disabled:opacity-30"
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remover(idx)}
                  className="h-8 w-8 rounded-none text-muted-foreground hover:text-destructive hover:bg-card"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              <div className="space-y-1.5">
                <label className={labelCls}>Título</label>
                <Input
                  value={secao.titulo}
                  onChange={(e) => atualizar(idx, { titulo: e.target.value })}
                  className={inputCls}
                  placeholder="Título da seção"
                />
              </div>

              {secao.tipo === "documentos" && (
                <div className="space-y-1.5">
                  <label className={labelCls}>Subtítulo</label>
                  <Textarea
                    value={secao.corpo ?? ""}
                    onChange={(e) => atualizar(idx, { corpo: e.target.value })}
                    className={`${inputCls} min-h-[70px] font-light leading-relaxed`}
                    placeholder="Ex.: Orientações do que fazer e levar em {{data}} para sua cirurgia."
                  />
                </div>
              )}

              {(secao.tipo === "lista" || secao.tipo === "documentos") && (
                <ItensEditor
                  itens={secao.itens ?? []}
                  onChange={(itens) => atualizar(idx, { itens })}
                />
              )}

              {(secao.tipo === "texto" || secao.tipo === "politica") && (
                <div className="space-y-1.5">
                  <label className={labelCls}>Conteúdo</label>
                  <Textarea
                    value={secao.corpo ?? ""}
                    onChange={(e) => atualizar(idx, { corpo: e.target.value })}
                    className={`${inputCls} min-h-[140px] font-light leading-relaxed`}
                    placeholder="Escreva o texto. Você pode usar variáveis como {{primeiroNome}}."
                  />
                </div>
              )}

              {secao.tipo === "linha_do_tempo" && (
                <EtapasEditor
                  etapas={secao.etapas ?? []}
                  onChange={(etapas) => atualizar(idx, { etapas })}
                />
              )}

              {secao.tipo === "preparo" && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className={labelCls}>Descrição</label>
                    <Textarea
                      value={secao.corpo ?? ""}
                      onChange={(e) => atualizar(idx, { corpo: e.target.value })}
                      className={`${inputCls} min-h-[70px] font-light leading-relaxed`}
                      placeholder="Ex.: Realize os exames abaixo o mais breve possível e nos envie os resultados."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Exames</label>
                    <ItensEditor
                      itens={secao.itens ?? []}
                      onChange={(itens) => atualizar(idx, { itens })}
                    />
                  </div>
                  {slotPreparo ? (
                    <div className="space-y-1.5">
                      <label className={labelCls}>Pedido de exames (PDF)</label>
                      {slotPreparo}
                    </div>
                  ) : null}
                  <p className="text-[11px] text-muted-foreground font-light leading-relaxed border-l-2 border-border pl-3">
                    Na página da paciente, esta seção aparece num bloco recolhível
                    com a lista de exames, o aviso de WhatsApp e o botão para baixar
                    o PDF do pedido de exames.
                  </p>
                </div>
              )}

              {secao.tipo === "contatos" && (
                <ContatosEditor
                  contatos={secao.contatos ?? []}
                  onChange={(contatos) => atualizar(idx, { contatos })}
                />
              )}

              {secao.tipo === "suspensao_medicamentos" && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className={labelCls}>Introdução</label>
                    <Textarea
                      value={secao.corpo ?? ""}
                      onChange={(e) => atualizar(idx, { corpo: e.target.value })}
                      className={`${inputCls} min-h-[70px] font-light leading-relaxed`}
                      placeholder="Texto curto exibido abaixo do título."
                    />
                  </div>
                  <GruposMedicamentosEditor
                    grupos={secao.grupos ?? []}
                    onChange={(grupos) => atualizar(idx, { grupos })}
                  />
                  <div className="space-y-1.5">
                    <label className={labelCls}>Aviso (rodapé)</label>
                    <Textarea
                      value={secao.aviso ?? ""}
                      onChange={(e) => atualizar(idx, { aviso: e.target.value })}
                      className={`${inputCls} min-h-[70px] font-light leading-relaxed`}
                      placeholder="Callout de rodapé (opcional)."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Lista completa (PDF)</label>
                    <ArquivoListaEditor
                      arquivo={secao.arquivo}
                      onChange={(arquivo) => atualizar(idx, { arquivo })}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground font-light leading-relaxed border-l-2 border-border pl-3">
                    Cada janela mostra a data-limite (&quot;até dd/mm&quot;) calculada a
                    partir do offset em dias, relativa à data da cirurgia de cada
                    paciente. O botão de download só aparece na página quando há um
                    PDF anexado.
                  </p>
                </div>
              )}

              {secao.tipo === "preparo_pele" && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className={labelCls}>Descrição</label>
                    <Textarea
                      value={secao.corpo ?? ""}
                      onChange={(e) => atualizar(idx, { corpo: e.target.value })}
                      className={`${inputCls} min-h-[70px] font-light leading-relaxed`}
                      placeholder="Ex.: Inicie o uso dos produtos abaixo conforme orientação."
                    />
                  </div>
                  <ProdutosEditor
                    produtos={secao.produtos ?? []}
                    onChange={(produtos) => atualizar(idx, { produtos })}
                  />
                  {slotPreparoPele ? (
                    <div className="space-y-1.5">
                      <label className={labelCls}>Receita de preparo da pele (PDF)</label>
                      {slotPreparoPele}
                    </div>
                  ) : null}
                  <p className="text-[11px] text-muted-foreground font-light leading-relaxed border-l-2 border-border pl-3">
                    Na página da paciente, esta seção aparece num bloco recolhível
                    com a lista de produtos e o botão para baixar o PDF da receita.
                    A numeração dos produtos é automática.
                  </p>
                </div>
              )}

              {secao.tipo === "receituario_posop" && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className={labelCls}>Descrição</label>
                    <Textarea
                      value={secao.corpo ?? ""}
                      onChange={(e) => atualizar(idx, { corpo: e.target.value })}
                      className={`${inputCls} min-h-[70px] font-light leading-relaxed`}
                      placeholder="Ex.: Medicações que serão utilizadas após o procedimento."
                    />
                  </div>
                  <MedicacoesEditor
                    medicacoes={secao.medicacoes ?? []}
                    onChange={(medicacoes) => atualizar(idx, { medicacoes })}
                  />
                  <div className="space-y-1.5">
                    <label className={labelCls}>Aviso (rodapé)</label>
                    <Textarea
                      value={secao.aviso ?? ""}
                      onChange={(e) => atualizar(idx, { aviso: e.target.value })}
                      className={`${inputCls} min-h-[70px] font-light leading-relaxed`}
                      placeholder="Callout de rodapé (ex.: indicações de protetor solar). Opcional."
                    />
                  </div>
                  {slotReceituario ? (
                    <div className="space-y-1.5">
                      <label className={labelCls}>Receituário pós-operatório (PDF)</label>
                      {slotReceituario}
                    </div>
                  ) : null}
                  <p className="text-[11px] text-muted-foreground font-light leading-relaxed border-l-2 border-border pl-3">
                    Na página da paciente, esta seção aparece num bloco recolhível com
                    a lista de medicações, o aviso e o botão para baixar o PDF do
                    receituário.
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Adicionar seção */}
      <div className="flex flex-col sm:flex-row gap-3 border-t border-border pt-6">
        <Select value={novoTipo} onValueChange={(v) => setNovoTipo(v as SecaoConteudo["tipo"])}>
          <SelectTrigger className={`${inputCls} sm:w-64`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-none bg-popover border-border text-popover-foreground">
            {Object.values(SecaoConteudoTipo).map((tipo) => (
              <SelectItem key={tipo} value={tipo} className="rounded-none focus:bg-card focus:text-foreground">
                {TIPO_ROTULO[tipo]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          onClick={adicionar}
          className="rounded-none bg-primary hover:bg-primary/90 text-primary-foreground font-medium h-10 px-5"
        >
          <Plus className="w-4 h-4 mr-2" />
          Adicionar seção
        </Button>
      </div>

      <SecoesPreviewDialog
        aberto={previewAberto}
        onOpenChange={setPreviewAberto}
        secoes={secoes}
        dados={dadosPreview}
      />
    </div>
  );
}

function ItensEditor({ itens, onChange }: { itens: string[]; onChange: (itens: string[]) => void }) {
  return (
    <div className="space-y-2">
      <label className={labelCls}>Itens</label>
      <div className="space-y-2">
        {itens.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              value={item}
              onChange={(e) => onChange(itens.map((it, i) => (i === idx ? e.target.value : it)))}
              className={inputCls}
              placeholder="Item"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange(itens.filter((_, i) => i !== idx))}
              className="h-9 w-9 shrink-0 rounded-none text-muted-foreground hover:text-destructive hover:bg-card"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" onClick={() => onChange([...itens, ""])} className={subBtnCls}>
        <Plus className="w-3.5 h-3.5 mr-1.5" />
        Adicionar item
      </Button>
    </div>
  );
}

function EtapasEditor({
  etapas,
  onChange,
  mostrarOffset = true,
}: {
  etapas: SecaoEtapa[];
  onChange: (etapas: SecaoEtapa[]) => void;
  /**
   * Mostra o campo "offset em dias" (usado pela linha do tempo para calcular a
   * data real). Em `preparo`, `quando` é rótulo livre — sem cálculo de data —,
   * então o campo é ocultado.
   */
  mostrarOffset?: boolean;
}) {
  function atualizar(idx: number, patch: Partial<SecaoEtapa>) {
    onChange(etapas.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }
  return (
    <div className="space-y-3">
      <label className={labelCls}>{mostrarOffset ? "Etapas" : "Passos"}</label>
      <div className="space-y-3">
        {etapas.map((etapa, idx) => (
          <div key={idx} className="border border-border p-3 space-y-2 relative">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange(etapas.filter((_, i) => i !== idx))}
              className="absolute top-2 right-2 h-7 w-7 rounded-none text-muted-foreground hover:text-destructive hover:bg-card"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
            {mostrarOffset ? (
              <div className="grid sm:grid-cols-2 gap-2 pr-8">
                <Input
                  value={etapa.quando}
                  onChange={(e) => atualizar(idx, { quando: e.target.value })}
                  className={inputCls}
                  placeholder="Quando (ex: 7 dias antes)"
                />
                <Input
                  type="number"
                  value={etapa.offsetDias ?? ""}
                  onChange={(e) =>
                    atualizar(idx, {
                      offsetDias: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className={inputCls}
                  placeholder="Offset em dias (ex: -7)"
                />
              </div>
            ) : (
              <div className="pr-8">
                <Input
                  value={etapa.quando}
                  onChange={(e) => atualizar(idx, { quando: e.target.value })}
                  className={inputCls}
                  placeholder="Quando (ex: 7 dias antes)"
                />
              </div>
            )}
            <Input
              value={etapa.titulo}
              onChange={(e) => atualizar(idx, { titulo: e.target.value })}
              className={inputCls}
              placeholder="Título da etapa"
            />
            <Textarea
              value={etapa.descricao}
              onChange={(e) => atualizar(idx, { descricao: e.target.value })}
              className={`${inputCls} min-h-[70px] font-light`}
              placeholder="Descrição"
            />
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          onChange([...etapas, { quando: "", titulo: "", descricao: "", offsetDias: null }])
        }
        className={subBtnCls}
      >
        <Plus className="w-3.5 h-3.5 mr-1.5" />
        Adicionar etapa
      </Button>
    </div>
  );
}

function ContatosEditor({
  contatos,
  onChange,
}: {
  contatos: SecaoContato[];
  onChange: (contatos: SecaoContato[]) => void;
}) {
  function atualizar(idx: number, patch: Partial<SecaoContato>) {
    onChange(contatos.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }
  return (
    <div className="space-y-2">
      <label className={labelCls}>Contatos</label>
      <div className="space-y-2">
        {contatos.map((contato, idx) => {
          const telefoneIncompleto = contatoTelefoneIncompleto(contato);
          return (
            <div key={idx} className="flex items-start gap-2">
              <Input
                value={contato.rotulo}
                onChange={(e) => atualizar(idx, { rotulo: e.target.value })}
                className={`${inputCls} flex-1`}
                placeholder="Rótulo (ex: WhatsApp da equipe)"
              />
              <div className="flex-1 space-y-1">
                <Input
                  value={contato.valor}
                  onChange={(e) => atualizar(idx, { valor: formatarContatoTelefone(e.target.value) })}
                  className={`${inputCls} w-full ${telefoneIncompleto ? "border-amber-500/70 focus-visible:ring-amber-500/40" : ""}`}
                  placeholder="Valor (ex: {{equipeTelefone}})"
                  aria-invalid={telefoneIncompleto}
                />
                {telefoneIncompleto && (
                  <p className="flex items-center gap-1.5 text-[11px] font-light text-amber-400/90">
                    <AlertTriangle className="w-3 h-3 shrink-0" strokeWidth={1.75} />
                    Número de WhatsApp incompleto
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onChange(contatos.filter((_, i) => i !== idx))}
                className="h-9 w-9 shrink-0 rounded-none text-muted-foreground hover:text-destructive hover:bg-card"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          );
        })}
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => onChange([...contatos, { rotulo: "", valor: "" }])}
        className={subBtnCls}
      >
        <Plus className="w-3.5 h-3.5 mr-1.5" />
        Adicionar contato
      </Button>
    </div>
  );
}

function GruposMedicamentosEditor({
  grupos,
  onChange,
}: {
  grupos: SecaoGrupoMedicamentos[];
  onChange: (grupos: SecaoGrupoMedicamentos[]) => void;
}) {
  function atualizar(idx: number, patch: Partial<SecaoGrupoMedicamentos>) {
    onChange(grupos.map((g, i) => (i === idx ? { ...g, ...patch } : g)));
  }
  function atualizarMed(
    gIdx: number,
    mIdx: number,
    patch: Partial<SecaoMedicamento>,
  ) {
    const grupo = grupos[gIdx];
    const medicamentos = (grupo.medicamentos ?? []).map((m, i) =>
      i === mIdx ? { ...m, ...patch } : m,
    );
    atualizar(gIdx, { medicamentos });
  }
  return (
    <div className="space-y-3">
      <label className={labelCls}>Janelas de suspensão</label>
      <div className="space-y-3">
        {grupos.map((grupo, gIdx) => {
          const medicamentos = grupo.medicamentos ?? [];
          return (
            <div key={gIdx} className="border border-border p-3 space-y-3 relative">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onChange(grupos.filter((_, i) => i !== gIdx))}
                className="absolute top-2 right-2 h-7 w-7 rounded-none text-muted-foreground hover:text-destructive hover:bg-card"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
              <div className="grid sm:grid-cols-2 gap-2 pr-8">
                <Input
                  value={grupo.quando}
                  onChange={(e) => atualizar(gIdx, { quando: e.target.value })}
                  className={inputCls}
                  placeholder="Rótulo (ex: 7 dias antes)"
                />
                <Input
                  type="number"
                  value={grupo.offsetDias ?? ""}
                  onChange={(e) =>
                    atualizar(gIdx, {
                      offsetDias: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className={inputCls}
                  placeholder="Offset em dias (ex: -7)"
                />
              </div>
              <div className="space-y-2">
                <label className={labelCls}>Medicamentos</label>
                {medicamentos.map((m, mIdx) => (
                  <div key={mIdx} className="flex items-center gap-2">
                    <Input
                      value={m.marca}
                      onChange={(e) => atualizarMed(gIdx, mIdx, { marca: e.target.value })}
                      className={`${inputCls} flex-1`}
                      placeholder="Marca (ex: Xarelto)"
                    />
                    <Input
                      value={m.principio ?? ""}
                      onChange={(e) => atualizarMed(gIdx, mIdx, { principio: e.target.value })}
                      className={`${inputCls} flex-1`}
                      placeholder="Princípio ativo (ex: Rivaroxabana)"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        atualizar(gIdx, {
                          medicamentos: medicamentos.filter((_, i) => i !== mIdx),
                        })
                      }
                      className="h-9 w-9 shrink-0 rounded-none text-muted-foreground hover:text-destructive hover:bg-card"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    atualizar(gIdx, {
                      medicamentos: [...medicamentos, { marca: "", principio: "" }],
                    })
                  }
                  className={subBtnCls}
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Adicionar medicamento
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => onChange([...grupos, { quando: "", offsetDias: null, medicamentos: [] }])}
        className={subBtnCls}
      >
        <Plus className="w-3.5 h-3.5 mr-1.5" />
        Adicionar janela
      </Button>
    </div>
  );
}

function ProdutosEditor({
  produtos,
  onChange,
}: {
  produtos: SecaoProduto[];
  onChange: (produtos: SecaoProduto[]) => void;
}) {
  function atualizar(idx: number, patch: Partial<SecaoProduto>) {
    onChange(produtos.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }
  return (
    <div className="space-y-3">
      <label className={labelCls}>Produtos</label>
      <div className="space-y-3">
        {produtos.map((produto, idx) => (
          <div key={idx} className="border border-border p-3 space-y-2 relative">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange(produtos.filter((_, i) => i !== idx))}
              className="absolute top-2 right-2 h-7 w-7 rounded-none text-muted-foreground hover:text-destructive hover:bg-card"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
            <div className="font-mono text-[10px] text-muted-foreground/70">
              Produto {idx + 1}
            </div>
            <Input
              value={produto.nome}
              onChange={(e) => atualizar(idx, { nome: e.target.value })}
              className={inputCls}
              placeholder="Nome e marca (ex: Blancy TX — Mantecorp)"
            />
            <Textarea
              value={produto.instrucao}
              onChange={(e) => atualizar(idx, { instrucao: e.target.value })}
              className={`${inputCls} min-h-[60px] font-light`}
              placeholder="Instrução de uso (ex: Aplicar 1 camada à noite, todos os dias)"
            />
            <Input
              value={produto.inicio}
              onChange={(e) => atualizar(idx, { inicio: e.target.value })}
              className={inputCls}
              placeholder="Quando começar (ex: Iniciar 10 dias antes da cirurgia)"
            />
            <Input
              value={produto.tag}
              onChange={(e) => atualizar(idx, { tag: e.target.value })}
              className={inputCls}
              placeholder="Tag (ex: 1 frasco · Uso tópico noturno)"
            />
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          onChange([...produtos, { nome: "", instrucao: "", inicio: "", tag: "" }])
        }
        className={subBtnCls}
      >
        <Plus className="w-3.5 h-3.5 mr-1.5" />
        Adicionar produto
      </Button>
    </div>
  );
}

function MedicacoesEditor({
  medicacoes,
  onChange,
}: {
  medicacoes: SecaoMedicacao[];
  onChange: (medicacoes: SecaoMedicacao[]) => void;
}) {
  function atualizar(idx: number, patch: Partial<SecaoMedicacao>) {
    onChange(medicacoes.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }
  return (
    <div className="space-y-3">
      <label className={labelCls}>Medicações</label>
      <div className="space-y-3">
        {medicacoes.map((med, idx) => (
          <div key={idx} className="border border-border p-3 space-y-2 relative">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange(medicacoes.filter((_, i) => i !== idx))}
              className="absolute top-2 right-2 h-7 w-7 rounded-none text-muted-foreground hover:text-destructive hover:bg-card"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
            <div className="font-mono text-[10px] text-muted-foreground/70">
              Medicação {idx + 1}
            </div>
            <Input
              value={med.nome}
              onChange={(e) => atualizar(idx, { nome: e.target.value })}
              className={inputCls}
              placeholder="Nome e dose (ex: Cefalexina 500mg)"
            />
            <Textarea
              value={med.instrucao}
              onChange={(e) => atualizar(idx, { instrucao: e.target.value })}
              className={`${inputCls} min-h-[60px] font-light`}
              placeholder="Posologia (ex: Tomar 1 comprimido de 6/6 horas por 7 dias)"
            />
            <Input
              value={med.via}
              onChange={(e) => atualizar(idx, { via: e.target.value })}
              className={inputCls}
              placeholder="Via (ex: Via oral, Uso ocular, Uso tópico)"
            />
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          onChange([...medicacoes, { nome: "", instrucao: "", via: "" }])
        }
        className={subBtnCls}
      >
        <Plus className="w-3.5 h-3.5 mr-1.5" />
        Adicionar medicação
      </Button>
    </div>
  );
}

/**
 * Upload do PDF único da lista completa de medicamentos. Só armazena os bytes no
 * bucket (via `POST /api/conteudo-padrao/lista-medicamentos`) e devolve os
 * metadados; a referência (`arquivo`) é persistida junto com a seção quando o
 * conteúdo é salvo. `?anterior=<token>` limpa o arquivo substituído no bucket.
 */
function ArquivoListaEditor({
  arquivo,
  onChange,
}: {
  arquivo?: SecaoArquivo;
  onChange: (arquivo: SecaoArquivo | undefined) => void;
}) {
  const { toast } = useToast();
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function enviar(file: File) {
    if (file.type !== "application/pdf") {
      toast({ title: "Envie um arquivo PDF", variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({
        title: "Arquivo muito grande",
        description: "O limite é de 20 MB.",
        variant: "destructive",
      });
      return;
    }
    setEnviando(true);
    try {
      const form = new FormData();
      form.append("arquivo", file, file.name);
      const anterior = arquivo?.token ? `?anterior=${encodeURIComponent(arquivo.token)}` : "";
      const resp = await fetch(`/api/conteudo-padrao/lista-medicamentos${anterior}`, {
        method: "POST",
        body: form,
      });
      if (!resp.ok) throw new Error("upload_failed");
      const meta = (await resp.json()) as SecaoArquivo;
      onChange(meta);
      toast({ title: "Lista anexada", description: meta.nomeArquivo });
    } catch {
      toast({
        title: "Não foi possível anexar o PDF",
        description: "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void enviar(file);
        }}
      />
      {arquivo ? (
        <div className="flex items-center justify-between gap-3 border border-border px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="w-4 h-4 text-accent shrink-0" strokeWidth={1.5} />
            <span className="font-mono text-xs truncate">{arquivo.nomeArquivo}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={enviando}
              className={subBtnCls}
            >
              {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Substituir"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange(undefined)}
              className="h-9 w-9 rounded-none text-muted-foreground hover:text-destructive hover:bg-card"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={enviando}
          className={subBtnCls}
        >
          {enviando ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <Upload className="w-3.5 h-3.5 mr-1.5" />
          )}
          {enviando ? "Enviando…" : "Anexar PDF"}
        </Button>
      )}
    </div>
  );
}
