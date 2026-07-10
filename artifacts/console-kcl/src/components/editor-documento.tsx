import {
  useEditor,
  EditorContent,
  Extension,
  Node,
  mergeAttributes,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { normalizarParaHtml } from "@workspace/secoes";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Undo2,
  Redo2,
  Heading1,
  Heading2,
  Heading3,
  Pilcrow,
  Braces,
  ChevronDown,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/** Variável `{{chave}}` que pode ser inserida no cursor pelo editor. */
export interface VariavelDocumento {
  chave: string;
  descricao: string;
}

interface EditorDocumentoProps {
  /** Conteúdo inicial (HTML canônico ou texto puro legado — é normalizado). */
  value: string;
  /** Emite o HTML a cada alteração. */
  onChange?: (html: string) => void;
  /**
   * Emite o HTML SERIALIZADO inicial, uma vez, logo após a montagem. É a
   * baseline confiável para detectar edições: o TipTap reserializa o HTML (ex.:
   * parágrafos alinhados à esquerda perdem o atributo de estilo), então comparar
   * com a string de entrada normalizada acusaria "sujo" sem nenhuma edição.
   * Para recarregar/desfazer, remonte o componente via `key`.
   */
  onReady?: (html: string) => void;
  /** Quando verdadeiro, o conteúdo não pode ser editado. */
  readOnly?: boolean;
  /** Variáveis disponíveis para inserir no cursor (oculta o menu se vazio). */
  variaveis?: VariavelDocumento[];
  /** Classe extra para a área editável. */
  className?: string;
  /** Altura mínima da área editável (px). */
  minHeight?: number;
}

const VARIAVEL_RE = /\{\{\s*[\w.]+\s*\}\}/g;

/**
 * Realça visualmente as `{{variáveis}}` como "pílulas" para que a equipe veja,
 * de relance, quais trechos serão preenchidos automaticamente com os dados da
 * paciente. É puramente visual (decoração do ProseMirror) — NÃO altera o texto
 * nem o HTML serializado, então a baseline/dirty e a substituição no servidor
 * continuam idênticas.
 */
const RealcarVariaveis = Extension.create({
  name: "realcarVariaveis",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("realcarVariaveis"),
        props: {
          decorations(state) {
            const decoracoes: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              const texto = node.text;
              VARIAVEL_RE.lastIndex = 0;
              let m: RegExpExecArray | null;
              while ((m = VARIAVEL_RE.exec(texto)) !== null) {
                const inicio = pos + m.index;
                const fim = inicio + m[0].length;
                decoracoes.push(
                  Decoration.inline(inicio, fim, { class: "editor-variavel" }),
                );
              }
            });
            return DecorationSet.create(state.doc, decoracoes);
          },
        },
      }),
    ];
  },
});

/**
 * Nó de bloco que PRESERVA os wrappers `<div data-regiao>` do motor de cláusulas
 * (variante/opcional/livre) ao carregar e ao salvar — sem ele, o StarterKit
 * desembrulharia as divs e a marcação de região (e o realce visual) se perderia
 * no round-trip. É puramente estrutural: os atributos `data-*` viajam intactos e
 * o CSS (`.doc-regiao[data-regiao=...]`) pinta a borda e o rótulo de cada tipo.
 * A troca de variante / liga-desliga acontece no painel de Decisões, não aqui —
 * dentro do editor a região é só destaque visual + área de texto editável.
 */
const RegiaoDoc = Node.create({
  name: "regiaoDoc",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    const attr = (nome: string) => ({
      default: null as string | null,
      parseHTML: (el: HTMLElement) => el.getAttribute(nome),
      renderHTML: (attrs: Record<string, unknown>) => {
        const chave = nome.replace("data-", "");
        const valor = attrs[chave];
        return valor ? { [nome]: String(valor) } : {};
      },
    });
    return {
      regiao: attr("data-regiao"),
      id: attr("data-id"),
      rotulo: attr("data-rotulo"),
      decidido: attr("data-decidido"),
      incluido: attr("data-incluido"),
      editado: attr("data-editado"),
    };
  },
  parseHTML() {
    return [{ tag: "div[data-regiao]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "doc-regiao" }), 0];
  },
});

function BotaoBarra({
  ativo,
  desabilitado,
  onClick,
  titulo,
  children,
}: {
  ativo?: boolean;
  desabilitado?: boolean;
  onClick: () => void;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      aria-pressed={ativo}
      disabled={desabilitado}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center border transition-colors disabled:opacity-30 disabled:cursor-default ${
        ativo
          ? "border-accent/60 bg-accent/15 text-accent"
          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-background"
      }`}
    >
      {children}
    </button>
  );
}

function Separador() {
  return <span className="mx-0.5 h-5 w-px self-center bg-border/60" />;
}

/**
 * Menu de variáveis com busca — para campos como `{{nomePaciente}}` que serão
 * substituídos no servidor. A busca filtra por chave ou descrição; ao escolher,
 * insere o token `{{chave}}` no cursor e devolve o foco ao editor.
 */
function MenuVariaveis({
  editor,
  variaveis,
}: {
  editor: Editor;
  variaveis: VariavelDocumento[];
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Inserir variável"
          aria-label="Inserir variável"
          onMouseDown={(e) => e.preventDefault()}
          className="flex h-8 items-center gap-1.5 border border-transparent px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        >
          <Braces className="h-3.5 w-3.5" strokeWidth={1.8} />
          Variável
          <ChevronDown className="h-3 w-3 opacity-60" strokeWidth={1.8} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 rounded-none p-0">
        {/* O campo de busca recebe o foco ao abrir (filtrar digitando); o cursor
            do documento é preservado no estado e restaurado por `.focus()` ao
            inserir, então a variável sempre entra na posição correta. */}
        <Command className="rounded-none">
          <CommandInput placeholder="Buscar variável..." className="h-10" />
          <CommandList>
            <CommandEmpty className="py-4 text-center text-xs font-light text-muted-foreground">
              Nenhuma variável encontrada.
            </CommandEmpty>
            <CommandGroup>
              {variaveis.map((v) => (
                <CommandItem
                  key={v.chave}
                  value={`${v.chave} ${v.descricao}`}
                  onSelect={() => {
                    editor
                      .chain()
                      .focus()
                      .insertContent(`{{${v.chave}}}`)
                      .run();
                    setAberto(false);
                  }}
                  className="flex flex-col items-start gap-0.5 rounded-none"
                >
                  <code className="font-mono text-xs text-accent">{`{{${v.chave}}}`}</code>
                  <span className="text-[11px] font-light text-muted-foreground">
                    {v.descricao}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function Barra({
  editor,
  variaveis,
}: {
  editor: Editor;
  variaveis?: VariavelDocumento[];
}) {
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-0.5 border-b border-border/60 bg-muted/40 p-1 backdrop-blur supports-[backdrop-filter]:bg-muted/60">
      <BotaoBarra
        titulo="Negrito"
        ativo={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-3.5 w-3.5" strokeWidth={2} />
      </BotaoBarra>
      <BotaoBarra
        titulo="Itálico"
        ativo={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-3.5 w-3.5" strokeWidth={2} />
      </BotaoBarra>
      <BotaoBarra
        titulo="Sublinhado"
        ativo={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="h-3.5 w-3.5" strokeWidth={2} />
      </BotaoBarra>

      <Separador />

      <BotaoBarra
        titulo="Parágrafo"
        ativo={editor.isActive("paragraph")}
        onClick={() => editor.chain().focus().setParagraph().run()}
      >
        <Pilcrow className="h-3.5 w-3.5" strokeWidth={1.8} />
      </BotaoBarra>
      <BotaoBarra
        titulo="Título 1"
        ativo={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 className="h-3.5 w-3.5" strokeWidth={1.8} />
      </BotaoBarra>
      <BotaoBarra
        titulo="Título 2"
        ativo={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="h-3.5 w-3.5" strokeWidth={1.8} />
      </BotaoBarra>
      <BotaoBarra
        titulo="Título 3"
        ativo={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="h-3.5 w-3.5" strokeWidth={1.8} />
      </BotaoBarra>

      <Separador />

      <BotaoBarra
        titulo="Lista com marcadores"
        ativo={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-3.5 w-3.5" strokeWidth={1.8} />
      </BotaoBarra>
      <BotaoBarra
        titulo="Lista numerada"
        ativo={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-3.5 w-3.5" strokeWidth={1.8} />
      </BotaoBarra>

      <Separador />

      <BotaoBarra
        titulo="Alinhar à esquerda"
        ativo={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
      >
        <AlignLeft className="h-3.5 w-3.5" strokeWidth={1.8} />
      </BotaoBarra>
      <BotaoBarra
        titulo="Centralizar"
        ativo={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
      >
        <AlignCenter className="h-3.5 w-3.5" strokeWidth={1.8} />
      </BotaoBarra>
      <BotaoBarra
        titulo="Alinhar à direita"
        ativo={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
      >
        <AlignRight className="h-3.5 w-3.5" strokeWidth={1.8} />
      </BotaoBarra>
      <BotaoBarra
        titulo="Justificar"
        ativo={editor.isActive({ textAlign: "justify" })}
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}
      >
        <AlignJustify className="h-3.5 w-3.5" strokeWidth={1.8} />
      </BotaoBarra>

      <Separador />

      <BotaoBarra
        titulo="Desfazer"
        desabilitado={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 className="h-3.5 w-3.5" strokeWidth={1.8} />
      </BotaoBarra>
      <BotaoBarra
        titulo="Refazer"
        desabilitado={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 className="h-3.5 w-3.5" strokeWidth={1.8} />
      </BotaoBarra>

      {variaveis && variaveis.length > 0 && (
        <>
          <Separador />
          <MenuVariaveis editor={editor} variaveis={variaveis} />
        </>
      )}
    </div>
  );
}

/**
 * Editor WYSIWYG de documento jurídico (contrato/TCLE). O formato canônico é
 * HTML — o mesmo compartilhado por geração, revisão de IA e PDF. O valor inicial
 * é normalizado (texto puro legado vira HTML) e o componente emite HTML a cada
 * edição. As `{{variáveis}}` vivem como texto (realçadas só visualmente) e são
 * substituídas na geração.
 *
 * O conteúdo é tratado de forma NÃO controlada: para trocar o documento exibido,
 * o consumidor deve remontar o componente via `key` — assim o cursor nunca pula
 * a cada tecla. Mudanças externas só são reinjetadas quando o `value` diverge do
 * que já está no editor (ex.: "Reverter alterações" volta à baseline).
 */
export function EditorDocumento({
  value,
  onChange,
  onReady,
  readOnly = false,
  variaveis,
  className,
  minHeight = 420,
}: EditorDocumentoProps) {
  const [pronto, setPronto] = useState(false);

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      // StarterKit já empacota Underline; desligamos lá e registramos o pacote
      // standalone aqui para deixar o suporte a sublinhado explícito (evitando
      // o erro de extensão duplicada que ocorreria ao registrar os dois).
      StarterKit.configure({ underline: false }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      RealcarVariaveis,
      RegiaoDoc,
    ],
    content: normalizarParaHtml(value),
    editorProps: {
      attributes: {
        class: `editor-doc focus:outline-none ${className ?? ""}`,
        style: `min-height: ${minHeight}px`,
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange?.(ed.getHTML());
    },
    onCreate: ({ editor: ed }) => {
      setPronto(true);
      // Baseline serializada: o consumidor compara contra ela para saber se há
      // edições. Conteúdo só muda por remontagem (key), nunca por sync de prop.
      onReady?.(ed.getHTML());
    },
  });

  // Mantém o modo de edição em sincronia com a prop.
  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  if (!editor) return null;

  return (
    <div className="overflow-hidden border border-border bg-muted/20">
      {!readOnly && pronto && <Barra editor={editor} variaveis={variaveis} />}
      {/* Superfície tipo "folha": largura de leitura confortável, centrada
          sobre um fundo levemente recuado, para o documento parecer papel. */}
      <div className="px-3 py-4 sm:px-6 sm:py-6">
        <div className="mx-auto w-full max-w-[44rem] border border-border/50 bg-background px-6 py-8 shadow-sm sm:px-10 sm:py-10">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
