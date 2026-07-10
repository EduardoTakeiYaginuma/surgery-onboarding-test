import { type SecaoConteudo } from "@workspace/api-client-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, FileText, CheckCircle2, MessageCircle, Phone, Check, Download, AlertTriangle, Sun } from "lucide-react";
import { motion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";
import { ehTelefone, linkWhatsApp, linkTelefone, type TipoEventoPaciente } from "@/lib/patient-tools";
import { formatarContatoTelefone } from "@/lib/br-validacao";

/**
 * Callback opcional para registrar uma interação da paciente. Opcional porque a
 * pré-visualização no Console reutiliza estes componentes sem rastreamento.
 */
export type RegistrarEvento = (tipo: TipoEventoPaciente, rotulo?: string) => void;

export const reveal: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const } },
};

export const stagger: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

export const secaoMotion = {
  variants: reveal,
  initial: "hidden" as const,
  whileInView: "show" as const,
  viewport: { once: true, amount: 0.2 },
};

/**
 * Traçado da blefaroplastia — the editorial signature stroke. Sits on the dark
 * cover, so its colors map to the slab's roles (Linho line + champagne fio).
 * Shared between the public patient page and the Console live preview.
 */
export function Tracado() {
  return (
    <svg width="62" height="30" viewBox="0 0 64 30" aria-hidden="true" className="shrink-0 opacity-90">
      <path d="M6 19 Q32 4 58 19" fill="none" stroke="var(--pp-on-strong)" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M16 24 Q32 16.5 48 24"
        fill="none"
        stroke="var(--pp-accent)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeDasharray="0.1 4.2"
      />
    </svg>
  );
}

/** Selo C — médica-parceira mark (playbook v02). Champagne fio + ink "C". */
export function SeloC() {
  return (
    <svg width="36" height="36" viewBox="0 0 100 100" aria-hidden="true" className="shrink-0">
      <circle cx="50" cy="50" r="46" fill="none" stroke="var(--pp-accent)" strokeWidth="2.4" />
      <circle cx="50" cy="50" r="39.5" fill="none" stroke="var(--pp-accent)" strokeWidth="1" opacity="0.6" />
      <text x="50" y="61" textAnchor="middle" fontFamily="Spectral, serif" fontSize="46" fill="var(--pp-text)">
        C
      </text>
      <rect x="40.5" y="70" width="9" height="2.3" fill="var(--pp-accent)" />
      <rect x="40.5" y="75" width="15" height="2.3" fill="var(--pp-accent)" />
    </svg>
  );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <h3 className="font-serif text-3xl md:text-4xl text-[var(--pp-accent)] italic">{children}</h3>
      <div className="flex-1 h-px bg-[var(--pp-accent)]/20"></div>
    </div>
  );
}

export function Timeline({ secao, passoAtual }: { secao: SecaoConteudo; passoAtual: number }) {
  const etapas = secao.etapas ?? [];
  return (
    <div className="space-y-12">
      <SectionHeading>{secao.titulo}</SectionHeading>
      <div className="relative pl-8 md:pl-10 space-y-16">
        <div className="absolute left-[11px] md:left-[15px] top-3 bottom-3 w-px bg-[var(--pp-accent)]/20"></div>
        {etapas.map((item, idx) => {
          const passado = idx < passoAtual;
          const atual = idx === passoAtual;
          return (
            <div key={idx} className={cn("relative", !atual && !passado && "opacity-60")}>
              <div
                className={cn(
                  "absolute -left-[37px] md:-left-[41px] top-1.5 w-6 h-6 rounded-full z-10 flex items-center justify-center transition-colors",
                  atual
                    ? "bg-[var(--pp-strong)] border border-[var(--pp-strong)]"
                    : passado
                      ? "bg-[var(--pp-accent)] border border-[var(--pp-accent)]"
                      : "bg-[var(--pp-bg)] border border-[var(--pp-accent)]/30",
                )}
              >
                {passado ? (
                  <Check className="w-3 h-3 text-[var(--pp-on-strong)]" strokeWidth={2.5} />
                ) : atual ? (
                  <div className="w-2 h-2 bg-[var(--pp-bg)] rounded-full"></div>
                ) : (
                  <div className="w-1.5 h-1.5 bg-[var(--pp-accent)]/50 rounded-full"></div>
                )}
              </div>
              <div className="space-y-3">
                <div className="flex items-baseline flex-wrap gap-x-4 gap-y-2">
                  <span className="font-expanded text-[9px] tracking-widest uppercase text-[var(--pp-accent)]">
                    {item.quando}
                  </span>
                  {item.data && <span className="font-mono text-xs opacity-60">{item.data}</span>}
                  {atual && (
                    <span className="font-expanded text-[8px] tracking-widest uppercase text-[var(--pp-on-strong)] bg-[var(--pp-strong)] px-2 py-1">
                      Etapa atual
                    </span>
                  )}
                </div>
                <h4 className={cn("font-serif text-2xl", atual && "text-[var(--pp-text)]")}>{item.titulo}</h4>
                <p className="font-light opacity-80 leading-relaxed md:text-lg">{item.descricao}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Callback para baixar o PDF único da lista completa de medicamentos. */
export type BaixarListaMedicamentos = (arquivoToken: string) => void;

/**
 * Seção "Suspensão de Medicamentos" (`tipo: "suspensao_medicamentos"`) — linha
 * do tempo agrupada por janela de antecedência. Cada grupo mostra o rótulo
 * ("21 dias antes"), a data-limite resolvida ("ATÉ dd/mm", calculada a partir do
 * `offsetDias` relativo à cirurgia) e a lista de medicamentos (marca em destaque
 * + princípio ativo esmaecido). Abaixo: o callout de aviso (`aviso`) e, quando a
 * clínica anexou o PDF (`arquivo`), o botão de download. Fonte única para a
 * página pública e a prévia — sem PDF anexado, o botão não aparece.
 */
export function SuspensaoMedicamentos({
  secao,
  onBaixar,
  baixando,
}: {
  secao: SecaoConteudo;
  onBaixar?: BaixarListaMedicamentos;
  baixando?: boolean;
}) {
  const grupos = secao.grupos ?? [];
  const arquivo = secao.arquivo;
  return (
    <div className="space-y-10">
      <SectionHeading>{secao.titulo}</SectionHeading>

      {secao.corpo ? (
        <p className="whitespace-pre-line font-light leading-relaxed opacity-80 md:text-lg -mt-4">
          {secao.corpo}
        </p>
      ) : null}

      <div className="relative pl-8 md:pl-10 space-y-12">
        <div className="absolute left-[11px] md:left-[15px] top-3 bottom-3 w-px bg-[var(--pp-accent)]/20"></div>
        {grupos.map((grupo, idx) => (
          <div key={idx} className="relative">
            <div className="absolute -left-[37px] md:-left-[41px] top-1.5 w-6 h-6 rounded-full z-10 flex items-center justify-center bg-[var(--pp-bg)] border border-[var(--pp-accent)]/30">
              <div className="w-1.5 h-1.5 bg-[var(--pp-accent)]/50 rounded-full"></div>
            </div>
            <div className="space-y-3">
              <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1">
                <span className="font-expanded text-[9px] tracking-widest uppercase text-[var(--pp-accent)]">
                  {grupo.quando}
                </span>
                {grupo.data && (
                  <span className="font-expanded text-[9px] tracking-widest uppercase text-[var(--pp-accent)] opacity-70">
                    — até <span className="font-mono">{grupo.data}</span>
                  </span>
                )}
              </div>
              <ul className="space-y-1.5">
                {(grupo.medicamentos ?? []).map((m, i) => (
                  <li key={i} className="font-light leading-relaxed md:text-lg">
                    <span className="font-medium text-[var(--pp-text)]">{m.marca}</span>
                    {m.principio ? <span className="opacity-50"> ({m.principio})</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      {secao.aviso ? (
        <div className="flex items-start gap-3 bg-[var(--pp-accent)]/10 border border-[var(--pp-accent)]/20 px-5 py-4">
          <AlertTriangle className="w-4 h-4 text-[var(--pp-accent)] stroke-[1.5] shrink-0 mt-0.5" />
          <p className="whitespace-pre-line font-light text-sm md:text-base leading-relaxed">{secao.aviso}</p>
        </div>
      ) : null}

      {/* PDF único com a lista completa — some quando a clínica não anexou arquivo. */}
      {arquivo ? (
        onBaixar ? (
          <button
            type="button"
            onClick={() => onBaixar(arquivo.token)}
            disabled={!!baixando}
            className="inline-flex items-center gap-2.5 border border-[var(--pp-accent)]/40 hover:border-[var(--pp-accent)] px-5 py-3 transition-colors disabled:opacity-50 font-expanded text-[10px] tracking-widest uppercase text-[var(--pp-accent)]"
          >
            <Download className="w-4 h-4 stroke-[1.5]" />
            {baixando ? "Baixando…" : "Baixar Lista Completa (PDF)"}
          </button>
        ) : (
          <div className="inline-flex items-center gap-2.5 border border-[var(--pp-accent)]/40 px-5 py-3 font-expanded text-[10px] tracking-widest uppercase text-[var(--pp-accent)] opacity-80">
            <Download className="w-4 h-4 stroke-[1.5]" />
            Baixar Lista Completa (PDF)
          </div>
        )
      ) : null}
    </div>
  );
}

export function ListaMarcavel({
  secao,
  prefixo,
  feito,
  toggle,
}: {
  secao: SecaoConteudo;
  prefixo: string;
  feito: Record<string, boolean>;
  toggle: (key: string) => void;
}) {
  const itens = secao.itens ?? [];
  return (
    <section className="space-y-8">
      <h3 className="font-serif text-3xl text-[var(--pp-accent)] flex items-center gap-3">
        <CheckCircle2 className="w-6 h-6 stroke-[1]" /> {secao.titulo}
      </h3>
      <ul className="space-y-2">
        {itens.map((item, idx) => {
          const key = `${prefixo}:${item}`;
          const done = !!feito[key];
          return (
            <li key={idx}>
              <button
                type="button"
                onClick={() => toggle(key)}
                className="group flex gap-4 w-full text-left font-light leading-relaxed py-1"
              >
                <span
                  className={cn(
                    "w-5 h-5 border flex items-center justify-center shrink-0 transition-colors mt-0.5",
                    done ? "bg-[var(--pp-strong)] border-[var(--pp-strong)]" : "border-[var(--pp-accent)]/40 group-hover:border-[var(--pp-accent)]",
                  )}
                >
                  {done && <Check className="w-3 h-3 text-[var(--pp-on-strong)]" strokeWidth={2.5} />}
                </span>
                <span className={cn("transition-opacity", done && "line-through opacity-40")}>{item}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function DocumentosMarcavel({
  secao,
  feito,
  toggle,
}: {
  secao: SecaoConteudo;
  feito: Record<string, boolean>;
  toggle: (key: string) => void;
}) {
  const itens = secao.itens ?? [];
  return (
    <section className="space-y-8">
      <h3 className="font-serif text-3xl text-[var(--pp-accent)] flex items-center gap-3">
        <FileText className="w-6 h-6 stroke-[1]" /> {secao.titulo}
      </h3>
      {secao.corpo ? (
        <p className="font-light opacity-80 leading-relaxed md:text-lg">{secao.corpo}</p>
      ) : null}
      <div className="bg-[var(--pp-surface)] p-8 space-y-5 shadow-sm">
        <p className="font-expanded text-[9px] tracking-widest uppercase text-[var(--pp-accent)]">Levar no dia</p>
        <div className="space-y-1 pt-2">
          {itens.map((item, idx) => {
            const key = `doc:${item}`;
            const done = !!feito[key];
            return (
              <button
                key={idx}
                type="button"
                onClick={() => toggle(key)}
                className="group flex items-start gap-4 w-full text-left font-light border-b border-[var(--pp-accent)]/10 py-3 last:border-0"
              >
                <span
                  className={cn(
                    "w-5 h-5 border flex items-center justify-center shrink-0 transition-colors mt-0.5",
                    done ? "bg-[var(--pp-strong)] border-[var(--pp-strong)]" : "border-[var(--pp-accent)]/40 group-hover:border-[var(--pp-accent)]",
                  )}
                >
                  {done && <Check className="w-3 h-3 text-[var(--pp-on-strong)]" strokeWidth={2.5} />}
                </span>
                <span className={cn("leading-relaxed transition-opacity", done && "line-through opacity-40")}>
                  {item}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function Politica({ secao }: { secao: SecaoConteudo; onEvento?: RegistrarEvento }) {
  // Renderizada sempre aberta (sem clique), igual à prévia. O `corpo` usa
  // `whitespace-pre-line` para preservar as quebras de linha do texto.
  return (
    <div className="space-y-6">
      <SectionHeading>{secao.titulo}</SectionHeading>
      <div className="whitespace-pre-line font-light leading-relaxed opacity-80 md:text-lg">
        {secao.corpo}
      </div>
    </div>
  );
}

/** Metadados mínimos do PDF de pedido de exames exibidos na seção de preparo. */
export type PedidoExamesResumo = {
  token: string;
  nomeArquivo: string;
  tamanho: number;
};

export type AcessarPedidoExames = (modo: "abrir" | "baixar") => void;

/**
 * Seção "Exames Pré-Operatórios" (`tipo: "preparo"`) — bloco recolhível
 * (accordion). Ao abrir mostra: a descrição (`corpo`), a lista de exames
 * (`itens`, marcáveis), um aviso de WhatsApp e o botão para baixar o PDF com o
 * pedido de todos os exames (anexado por paciente). Fica recolhido por padrão
 * para não poluir a página. Fonte única para a página pública e a prévia.
 */
export function Preparo({
  secao,
  feito,
  toggle,
  pedidoExames,
  onAcessarPedidoExames,
  pedidoExamesAcao,
  onEvento,
}: {
  secao: SecaoConteudo;
  feito: Record<string, boolean>;
  toggle: (key: string) => void;
  pedidoExames?: PedidoExamesResumo | null;
  onAcessarPedidoExames?: AcessarPedidoExames;
  /** Estado de carregamento do botão do PDF, quando ativo. */
  pedidoExamesAcao?: "abrir" | "baixar" | null;
  onEvento?: RegistrarEvento;
}) {
  const itens = secao.itens ?? [];
  return (
    <Collapsible
      className="bg-[var(--pp-surface)] hover:bg-[var(--pp-surface)]/80 transition-colors"
      onOpenChange={(aberto) => {
        if (aberto) onEvento?.("preparo", secao.titulo);
      }}
    >
      <CollapsibleTrigger className="w-full flex items-center justify-between p-8 group gap-4 text-left">
        <span className="flex items-center gap-3 min-w-0">
          <FileText className="w-6 h-6 stroke-[1] text-[var(--pp-accent)] shrink-0" />
          <span className="font-serif text-2xl md:text-3xl text-[var(--pp-accent)] italic truncate">
            {secao.titulo}
          </span>
        </span>
        <ChevronDown className="w-6 h-6 text-[var(--pp-accent)] opacity-60 group-data-[state=open]:rotate-180 transition-transform stroke-[1.5] shrink-0" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-8 pb-8 border-t border-[var(--pp-accent)]/10">
        <div className="pt-6 space-y-6">
          {secao.corpo ? (
            <p className="font-light opacity-80 leading-relaxed md:text-lg">{secao.corpo}</p>
          ) : null}

          {/* Lista de exames — cada item marcável (a paciente vai riscando o que já fez). */}
          <div className="space-y-1">
            {itens.map((item, idx) => {
              const key = `exame:${item}`;
              const done = !!feito[key];
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggle(key)}
                  className="group flex items-start gap-4 w-full text-left font-light border-b border-[var(--pp-accent)]/10 py-3 last:border-0"
                >
                  <span
                    className={cn(
                      "w-5 h-5 border flex items-center justify-center shrink-0 transition-colors mt-0.5",
                      done
                        ? "bg-[var(--pp-strong)] border-[var(--pp-strong)]"
                        : "border-[var(--pp-accent)]/40 group-hover:border-[var(--pp-accent)]",
                    )}
                  >
                    {done && <Check className="w-3 h-3 text-[var(--pp-on-strong)]" strokeWidth={2.5} />}
                  </span>
                  <span className={cn("leading-relaxed transition-opacity", done && "line-through opacity-40")}>
                    {item}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Aviso: enviar resultados pelo WhatsApp. */}
          <div className="flex items-start gap-3 bg-[var(--pp-accent)]/10 border border-[var(--pp-accent)]/20 px-5 py-4">
            <MessageCircle className="w-4 h-4 text-[var(--pp-accent)] stroke-[1.5] shrink-0 mt-0.5" />
            <p className="font-light text-sm md:text-base leading-relaxed">
              Quando os resultados estiverem prontos,{" "}
              <span className="font-medium">envie-os para nós pelo WhatsApp</span> para que
              possamos anexar ao seu prontuário antes da cirurgia.
            </p>
          </div>

          {/* PDF com o pedido de todos os exames (anexado por paciente). */}
          {pedidoExames ? (
            onAcessarPedidoExames ? (
              <button
                type="button"
                onClick={() => onAcessarPedidoExames("baixar")}
                disabled={pedidoExamesAcao != null}
                className="inline-flex items-center gap-2.5 border border-[var(--pp-accent)]/40 hover:border-[var(--pp-accent)] px-5 py-3 transition-colors disabled:opacity-50 font-expanded text-[10px] tracking-widest uppercase text-[var(--pp-accent)]"
              >
                <Download className="w-4 h-4 stroke-[1.5]" />
                {pedidoExamesAcao === "baixar" ? "Baixando…" : "Baixar Pedido de Exames (PDF)"}
              </button>
            ) : (
              <div className="inline-flex items-center gap-2.5 border border-[var(--pp-accent)]/40 px-5 py-3 font-expanded text-[10px] tracking-widest uppercase text-[var(--pp-accent)] opacity-80">
                <Download className="w-4 h-4 stroke-[1.5]" />
                Baixar Pedido de Exames (PDF)
              </div>
            )
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Metadados mínimos do PDF de receita de preparo da pele exibidos na seção. */
export type ReceitaPreparoPeleResumo = {
  token: string;
  nomeArquivo: string;
  tamanho: number;
};

export type AcessarReceitaPreparoPele = (modo: "abrir" | "baixar") => void;

/**
 * Seção "Preparo da Pele" (`tipo: "preparo_pele"`) — bloco recolhível. Ao abrir
 * mostra: a descrição (`corpo`), a lista de produtos (`produtos`, numerados, com
 * instrução/início/tag) e o botão para baixar o PDF da receita (anexada por
 * paciente). Recolhido por padrão. Fonte única para a página pública e a prévia.
 */
export function PreparoPele({
  secao,
  receita,
  onAcessarReceita,
  receitaAcao,
  onEvento,
}: {
  secao: SecaoConteudo;
  receita?: ReceitaPreparoPeleResumo | null;
  onAcessarReceita?: AcessarReceitaPreparoPele;
  receitaAcao?: "abrir" | "baixar" | null;
  onEvento?: RegistrarEvento;
}) {
  const produtos = secao.produtos ?? [];
  return (
    <Collapsible
      className="bg-[var(--pp-surface)] hover:bg-[var(--pp-surface)]/80 transition-colors"
      onOpenChange={(aberto) => {
        if (aberto) onEvento?.("preparo", secao.titulo);
      }}
    >
      <CollapsibleTrigger className="w-full flex items-center justify-between p-8 group gap-4 text-left">
        <span className="flex items-center gap-3 min-w-0">
          <FileText className="w-6 h-6 stroke-[1] text-[var(--pp-accent)] shrink-0" />
          <span className="font-serif text-2xl md:text-3xl text-[var(--pp-accent)] italic truncate">
            {secao.titulo}
          </span>
        </span>
        <ChevronDown className="w-6 h-6 text-[var(--pp-accent)] opacity-60 group-data-[state=open]:rotate-180 transition-transform stroke-[1.5] shrink-0" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-8 pb-8 border-t border-[var(--pp-accent)]/10">
        <div className="pt-6 space-y-6">
          {secao.corpo ? (
            <p className="font-light opacity-80 leading-relaxed md:text-lg">{secao.corpo}</p>
          ) : null}

          {/* Produtos numerados — cada um em um card. */}
          <div className="space-y-4">
            {produtos.map((produto, idx) => (
              <div
                key={idx}
                className="bg-[var(--pp-bg)] border border-[var(--pp-accent)]/15 p-6 space-y-3"
              >
                <h4 className="font-serif text-xl md:text-2xl leading-tight">
                  {idx + 1}. {produto.nome}
                </h4>
                {produto.instrucao ? (
                  <p className="font-light opacity-80 leading-relaxed">{produto.instrucao}</p>
                ) : null}
                {produto.inicio ? (
                  <p className="font-light opacity-80 leading-relaxed">{produto.inicio}</p>
                ) : null}
                {produto.tag ? (
                  <span className="inline-block bg-[var(--pp-surface)] border border-[var(--pp-accent)]/20 px-3 py-1.5 font-mono text-xs text-[var(--pp-accent)]">
                    {produto.tag}
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          {/* PDF com a receita completa (anexada por paciente). */}
          {receita ? (
            onAcessarReceita ? (
              <button
                type="button"
                onClick={() => onAcessarReceita("baixar")}
                disabled={receitaAcao != null}
                className="inline-flex items-center gap-2.5 border border-[var(--pp-accent)]/40 hover:border-[var(--pp-accent)] px-5 py-3 transition-colors disabled:opacity-50 font-expanded text-[10px] tracking-widest uppercase text-[var(--pp-accent)]"
              >
                <Download className="w-4 h-4 stroke-[1.5]" />
                {receitaAcao === "baixar" ? "Baixando…" : "Baixar Receita Preparo da Pele (PDF)"}
              </button>
            ) : (
              <div className="inline-flex items-center gap-2.5 border border-[var(--pp-accent)]/40 px-5 py-3 font-expanded text-[10px] tracking-widest uppercase text-[var(--pp-accent)] opacity-80">
                <Download className="w-4 h-4 stroke-[1.5]" />
                Baixar Receita Preparo da Pele (PDF)
              </div>
            )
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Metadados mínimos do PDF de receituário pós-operatório exibidos na seção. */
export type ReceituarioPosopResumo = {
  token: string;
  nomeArquivo: string;
  tamanho: number;
};

export type AcessarReceituarioPosop = (modo: "abrir" | "baixar") => void;

/**
 * Seção "Receituário Pós-Operatório" (`tipo: "receituario_posop"`) — bloco
 * recolhível. Ao abrir mostra: a descrição (`corpo`), a lista de medicações
 * (`medicacoes`: nome, instrução, via em itálico), o callout de aviso (`aviso`)
 * e o botão para baixar o PDF do receituário (anexado por paciente). Recolhido
 * por padrão. Fonte única para a página pública e a prévia.
 */
export function Receituario({
  secao,
  receituario,
  onAcessarReceituario,
  receituarioAcao,
  onEvento,
}: {
  secao: SecaoConteudo;
  receituario?: ReceituarioPosopResumo | null;
  onAcessarReceituario?: AcessarReceituarioPosop;
  receituarioAcao?: "abrir" | "baixar" | null;
  onEvento?: RegistrarEvento;
}) {
  const medicacoes = secao.medicacoes ?? [];
  return (
    <Collapsible
      className="bg-[var(--pp-surface)] hover:bg-[var(--pp-surface)]/80 transition-colors"
      onOpenChange={(aberto) => {
        if (aberto) onEvento?.("preparo", secao.titulo);
      }}
    >
      <CollapsibleTrigger className="w-full flex items-center justify-between p-8 group gap-4 text-left">
        <span className="flex items-center gap-3 min-w-0">
          <FileText className="w-6 h-6 stroke-[1] text-[var(--pp-accent)] shrink-0" />
          <span className="font-serif text-2xl md:text-3xl text-[var(--pp-accent)] italic truncate">
            {secao.titulo}
          </span>
        </span>
        <ChevronDown className="w-6 h-6 text-[var(--pp-accent)] opacity-60 group-data-[state=open]:rotate-180 transition-transform stroke-[1.5] shrink-0" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-8 pb-8 border-t border-[var(--pp-accent)]/10">
        <div className="pt-6 space-y-6">
          {secao.corpo ? (
            <p className="font-light opacity-80 leading-relaxed md:text-lg">{secao.corpo}</p>
          ) : null}

          {/* Medicações — cada uma em um card. */}
          <div className="space-y-4">
            {medicacoes.map((med, idx) => (
              <div
                key={idx}
                className="bg-[var(--pp-bg)] border border-[var(--pp-accent)]/15 p-6 space-y-2"
              >
                <h4 className="font-serif text-xl md:text-2xl leading-tight">{med.nome}</h4>
                <p className="font-light opacity-80 leading-relaxed">
                  {med.instrucao}
                  {med.via ? <span className="italic opacity-70"> ({med.via})</span> : null}
                </p>
              </div>
            ))}
          </div>

          {/* Aviso (ex.: indicações de protetor solar). */}
          {secao.aviso ? (
            <div className="flex items-start gap-3 bg-[var(--pp-accent)]/10 border border-[var(--pp-accent)]/20 px-5 py-4">
              <Sun className="w-4 h-4 text-[var(--pp-accent)] stroke-[1.5] shrink-0 mt-0.5" />
              <p className="whitespace-pre-line font-light text-sm md:text-base leading-relaxed">
                {secao.aviso}
              </p>
            </div>
          ) : null}

          {/* PDF do receituário completo (anexado por paciente). */}
          {receituario ? (
            onAcessarReceituario ? (
              <button
                type="button"
                onClick={() => onAcessarReceituario("baixar")}
                disabled={receituarioAcao != null}
                className="inline-flex items-center gap-2.5 border border-[var(--pp-accent)]/40 hover:border-[var(--pp-accent)] px-5 py-3 transition-colors disabled:opacity-50 font-expanded text-[10px] tracking-widest uppercase text-[var(--pp-accent)]"
              >
                <Download className="w-4 h-4 stroke-[1.5]" />
                {receituarioAcao === "baixar" ? "Baixando…" : "Baixar Receituário Pós-Operatório (PDF)"}
              </button>
            ) : (
              <div className="inline-flex items-center gap-2.5 border border-[var(--pp-accent)]/40 px-5 py-3 font-expanded text-[10px] tracking-widest uppercase text-[var(--pp-accent)] opacity-80">
                <Download className="w-4 h-4 stroke-[1.5]" />
                Baixar Receituário Pós-Operatório (PDF)
              </div>
            )
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function Contatos({
  secao,
  primeiroNome,
  dataFmt,
  horario,
  onEvento,
}: {
  secao: SecaoConteudo;
  primeiroNome: string;
  dataFmt: string;
  horario: string;
  onEvento?: RegistrarEvento;
}) {
  const contatos = secao.contatos ?? [];
  return (
    <div className="p-8 border border-[var(--pp-accent)]/20 space-y-6">
      <div className="space-y-2">
        <h4 className="font-serif text-2xl text-[var(--pp-accent)]">{secao.titulo}</h4>
        <p className="opacity-70 font-light">Estamos à disposição para qualquer dúvida.</p>
      </div>
      <div className="space-y-3">
        {contatos.map((contato, idx) => {
          const telefone = ehTelefone(contato.valor);
          const ehWhats = telefone && /whats/i.test(contato.rotulo);
          if (ehWhats) {
            return (
              <a
                key={idx}
                href={linkWhatsApp(contato.valor, primeiroNome, dataFmt, horario)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onEvento?.("whatsapp", contato.rotulo)}
                className="group flex items-center justify-between gap-4 bg-[var(--pp-surface)] border border-[var(--pp-accent)]/25 hover:border-[var(--pp-accent)]/70 transition-colors px-6 py-4"
              >
                <div className="flex items-center gap-3">
                  <MessageCircle className="w-4 h-4 text-[var(--pp-accent)] stroke-[1.5] shrink-0" />
                  <span className="font-expanded text-[10px] tracking-widest uppercase text-[var(--pp-text)]">
                    {contato.rotulo}
                  </span>
                </div>
                <span className="font-mono text-sm">{formatarContatoTelefone(contato.valor)}</span>
              </a>
            );
          }
          if (telefone) {
            return (
              <a
                key={idx}
                href={linkTelefone(contato.valor)}
                onClick={() => onEvento?.("ligacao", contato.rotulo)}
                className="group flex items-center justify-between gap-4 bg-[var(--pp-surface)] border border-[var(--pp-accent)]/25 hover:border-[var(--pp-accent)]/70 transition-colors px-6 py-4"
              >
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-[var(--pp-accent)] stroke-[1.5] shrink-0" />
                  <span className="font-expanded text-[10px] tracking-widest uppercase text-[var(--pp-text)]">
                    {contato.rotulo}
                  </span>
                </div>
                <span className="font-mono text-sm">{formatarContatoTelefone(contato.valor)}</span>
              </a>
            );
          }
          return (
            <div
              key={idx}
              className="flex items-center justify-between gap-3 text-sm px-6 py-4 border border-[var(--pp-accent)]/15"
            >
              <span className="font-expanded text-[9px] tracking-widest uppercase text-[var(--pp-accent)]">
                {contato.rotulo}
              </span>
              <span className="font-mono text-base opacity-60">{contato.valor}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Texto({ secao }: { secao: SecaoConteudo }) {
  return (
    <div className="space-y-6">
      <SectionHeading>{secao.titulo}</SectionHeading>
      <div className="whitespace-pre-line font-light leading-relaxed opacity-80 md:text-lg">
        {secao.corpo}
      </div>
    </div>
  );
}

/**
 * Renderiza a lista de seções editáveis exatamente como a página pública da
 * paciente. Usado tanto pela página pública real quanto pela pré-visualização
 * no Console. Quando `animar` é falso (pré-visualização em modal), as seções
 * aparecem imediatamente, sem depender do scroll/viewport.
 */
export function SecoesPublicas({
  secoes,
  passoAtual,
  feito,
  toggle,
  primeiroNome,
  dataFmt,
  horario,
  animar = true,
  onEvento,
  pedidoExames,
  onAcessarPedidoExames,
  pedidoExamesAcao,
  receitaPreparoPele,
  onAcessarReceita,
  receitaAcao,
  receituarioPosop,
  onAcessarReceituario,
  receituarioAcao,
  onBaixarListaMedicamentos,
  listaMedicamentosBaixando,
}: {
  secoes: SecaoConteudo[];
  passoAtual: number;
  feito: Record<string, boolean>;
  toggle: (key: string) => void;
  primeiroNome: string;
  dataFmt: string;
  horario: string;
  animar?: boolean;
  onEvento?: RegistrarEvento;
  /** PDF de pedido de exames (um por paciente) exibido na seção de preparo. */
  pedidoExames?: PedidoExamesResumo | null;
  onAcessarPedidoExames?: AcessarPedidoExames;
  pedidoExamesAcao?: "abrir" | "baixar" | null;
  /** PDF de receita de preparo da pele (um por paciente) exibido na seção preparo_pele. */
  receitaPreparoPele?: ReceitaPreparoPeleResumo | null;
  onAcessarReceita?: AcessarReceitaPreparoPele;
  receitaAcao?: "abrir" | "baixar" | null;
  /** PDF de receituário pós-operatório (um por paciente) exibido na seção receituario_posop. */
  receituarioPosop?: ReceituarioPosopResumo | null;
  onAcessarReceituario?: AcessarReceituarioPosop;
  receituarioAcao?: "abrir" | "baixar" | null;
  /** Download do PDF único da lista de medicamentos (seção suspensao_medicamentos). */
  onBaixarListaMedicamentos?: BaixarListaMedicamentos;
  listaMedicamentosBaixando?: boolean;
}) {
  const motionProps = animar
    ? secaoMotion
    : { variants: reveal, initial: false as const, animate: "show" as const };

  return (
    <>
      {secoes.map((secao) => {
        if (secao.tipo === "linha_do_tempo") {
          return (
            <motion.section key={secao.id} {...motionProps}>
              <Timeline secao={secao} passoAtual={passoAtual} />
            </motion.section>
          );
        }
        if (secao.tipo === "lista") {
          return (
            <motion.div key={secao.id} {...motionProps} className="pt-8 border-t border-[var(--pp-accent)]/20">
              <ListaMarcavel secao={secao} prefixo="prep" feito={feito} toggle={toggle} />
            </motion.div>
          );
        }
        if (secao.tipo === "documentos") {
          return (
            <motion.div key={secao.id} {...motionProps} className="pt-8 border-t border-[var(--pp-accent)]/20">
              <DocumentosMarcavel secao={secao} feito={feito} toggle={toggle} />
            </motion.div>
          );
        }
        if (secao.tipo === "preparo") {
          return (
            <motion.section key={secao.id} {...motionProps} className="pt-8 border-t border-[var(--pp-accent)]/20">
              <Preparo
                secao={secao}
                feito={feito}
                toggle={toggle}
                pedidoExames={pedidoExames}
                onAcessarPedidoExames={onAcessarPedidoExames}
                pedidoExamesAcao={pedidoExamesAcao}
                onEvento={onEvento}
              />
            </motion.section>
          );
        }
        if (secao.tipo === "suspensao_medicamentos") {
          return (
            <motion.section key={secao.id} {...motionProps} className="pt-8 border-t border-[var(--pp-accent)]/20">
              <SuspensaoMedicamentos
                secao={secao}
                onBaixar={onBaixarListaMedicamentos}
                baixando={listaMedicamentosBaixando}
              />
            </motion.section>
          );
        }
        if (secao.tipo === "preparo_pele") {
          return (
            <motion.section key={secao.id} {...motionProps} className="pt-8 border-t border-[var(--pp-accent)]/20">
              <PreparoPele
                secao={secao}
                receita={receitaPreparoPele}
                onAcessarReceita={onAcessarReceita}
                receitaAcao={receitaAcao}
                onEvento={onEvento}
              />
            </motion.section>
          );
        }
        if (secao.tipo === "receituario_posop") {
          return (
            <motion.section key={secao.id} {...motionProps} className="pt-8 border-t border-[var(--pp-accent)]/20">
              <Receituario
                secao={secao}
                receituario={receituarioPosop}
                onAcessarReceituario={onAcessarReceituario}
                receituarioAcao={receituarioAcao}
                onEvento={onEvento}
              />
            </motion.section>
          );
        }
        if (secao.tipo === "politica") {
          return (
            <motion.section key={secao.id} {...motionProps} className="pt-8 border-t border-[var(--pp-accent)]/20">
              <Politica secao={secao} onEvento={onEvento} />
            </motion.section>
          );
        }
        if (secao.tipo === "contatos") {
          return (
            <motion.section key={secao.id} {...motionProps}>
              <Contatos secao={secao} primeiroNome={primeiroNome} dataFmt={dataFmt} horario={horario} onEvento={onEvento} />
            </motion.section>
          );
        }
        return (
          <motion.section key={secao.id} {...motionProps}>
            <Texto secao={secao} />
          </motion.section>
        );
      })}
    </>
  );
}
