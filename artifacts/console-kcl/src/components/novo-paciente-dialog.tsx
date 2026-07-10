import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCriarPaciente,
  useRestaurarPaciente,
  useObterConteudoPadrao,
  useAtualizarConteudoPaciente,
  getObterConteudoPadraoQueryKey,
  getListarPacientesQueryKey,
  getListarPacientesArquivadosQueryKey,
  getResumoPacientesQueryKey,
  ApiError,
  type ConfigOperacional,
  type Vendedora,
  type Medico,
  type ConflitoCpf,
  type PacienteArquivadoResumo,
  type SecaoConteudo,
} from "@workspace/api-client-react";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock, Plus, X, HelpCircle, Eye, FileText, UploadCloud, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { PROCEDIMENTOS_SUGESTOES } from "@/lib/procedimentos-sugestoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  apenasDigitos,
  validarCpf,
  validarTelefone,
  formatarCpf,
  formatarTelefone,
} from "@/lib/br-validacao";
import { toastErroAcao } from "@/lib/erro-acao";
import { useToast } from "@/hooks/use-toast";
import { PreviaPaginaPaciente } from "@/components/previa-pagina-paciente";
import { SecoesEditor } from "@/components/secoes-editor";
import { BuscaContatoTwenty } from "@/components/busca-contato-twenty";
import { DADOS_PREVIEW_EXEMPLO, type DadosPreview } from "@/lib/secoes-preview";

export const SEM_VENDEDORA = "__nenhuma__";
export const SEM_MEDICO = "__sem_medico__";

/** Formata bytes de forma curta (B / KB / MB) para o rótulo do arquivo. */
function formatarTamanhoArquivo(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const FieldHint = ({ children }: { children: React.ReactNode }) => (
  <p className="text-muted-foreground/70 font-light text-xs leading-relaxed pt-1.5">{children}</p>
);

export const InfoHint = ({ children }: { children: React.ReactNode }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        className="inline-flex items-center justify-center text-muted-foreground/60 hover:text-accent transition-colors align-middle"
        aria-label="Mais informações"
      >
        <HelpCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
      </button>
    </TooltipTrigger>
    <TooltipContent className="max-w-[260px] bg-card border border-accent/30 text-foreground rounded-none font-light text-xs leading-relaxed">
      {children}
    </TooltipContent>
  </Tooltip>
);

export const formSchema = z.object({
  nome: z.string().min(1, "Informe o nome completo da paciente."),
  // CPF é opcional (o Twenty nem sempre tem). Vazio é aceito; se preenchido,
  // precisa ser um CPF válido.
  cpf: z
    .string()
    .refine(
      (v) => apenasDigitos(v).length === 0 || validarCpf(v),
      "CPF inválido (confira os dígitos).",
    ),
  telefone: z
    .string()
    .refine((v) => apenasDigitos(v).length > 0, "Informe o telefone.")
    .refine((v) => validarTelefone(v), "Telefone inválido (use DDD + número)."),
  procedimentos: z.array(z.string()).min(1, "Escolha ou descreva ao menos um procedimento."),
  dataCirurgia: z
    .string()
    .min(1, "Escolha a data da cirurgia.")
    .refine((v) => !dataNoPassado(v), "A data da cirurgia não pode estar no passado."),
  horario: z.string().min(1, "Informe o horário da cirurgia."),
  valorSinal: z.coerce.number().min(0, "Valor inválido"),
  valorPendente: z.coerce.number().min(0, "Valor inválido").default(0),
  dataPagamentoPendente: z.string().default(""),
  laser: z.boolean().default(false),
  local: z.string().min(1, "Informe o hospital / local da cirurgia."),
  localEndereco: z.string().default(""),
  equipeAnestesia: z.string().min(1, "Informe a equipe de anestesia."),
  equipeAnestesiaTelefone: z.string().default(""),
  vendedoraId: z.string().default(SEM_VENDEDORA),
  medicoId: z.string().default(SEM_MEDICO),
  // Opcionais, preenchidos pela busca de contatos no Twenty (podem ficar vazios).
  email: z.string().default(""),
  twentyContactId: z.string().default(""),
  // Identidade complementar (opcional): não vêm do Twenty, digitados à mão.
  rg: z.string().default(""),
  nascimento: z.string().default(""),
  endereco: z.string().default(""),
}).refine((d) => !(d.valorPendente > 0) || d.dataPagamentoPendente.trim().length > 0, {
  path: ["dataPagamentoPendente"],
  message: "Informe o vencimento do saldo pendente.",
});

type FormValues = z.infer<typeof formSchema>;

const ETAPAS = [
  { chave: "paciente", titulo: "Paciente", descricao: "Quem é a paciente e quem está cuidando dela." },
  { chave: "cirurgia", titulo: "Cirurgia", descricao: "Onde, quando e o que será feito." },
  { chave: "pagamento", titulo: "Pagamento", descricao: "Valores e vencimento do saldo, se houver." },
  { chave: "revisar", titulo: "Revisar", descricao: "Confira os dados — a prévia ao lado mostra a página da paciente." },
  { chave: "conteudo", titulo: "Conteúdo", descricao: "Edite o conteúdo da página, se quiser — a prévia ao lado atualiza." },
] as const;

const CAMPOS_POR_ETAPA: (keyof FormValues)[][] = [
  ["nome", "cpf", "telefone", "vendedoraId", "medicoId"],
  ["local", "procedimentos", "dataCirurgia", "horario", "equipeAnestesia", "laser"],
  ["valorSinal", "valorPendente", "dataPagamentoPendente"],
];

const ULTIMA_ETAPA = ETAPAS.length - 1;

const LABEL_CLS = "text-muted-foreground font-expanded text-[10px] tracking-widest uppercase";
const INPUT_CLS = "bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 text-foreground placeholder:text-muted-foreground/50";
const SELECT_TRIGGER_CLS = "bg-card border-transparent focus:ring-1 focus:ring-ring rounded-none h-12 text-foreground";
const SELECT_CONTENT_CLS = "bg-background border-border text-foreground rounded-none";
const SELECT_ITEM_CLS = "focus:bg-card focus:text-foreground rounded-none";
const MSG_CLS = "font-mono text-xs text-red-400";

const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTOS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

function parseDataValor(valor: string): Date | undefined {
  if (!valor) return undefined;
  const d = parse(valor, "yyyy-MM-dd", new Date());
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Hoje à meia-noite no fuso local — base para bloquear datas passadas. */
function inicioDeHoje(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Verdadeiro quando a data ISO `yyyy-MM-dd` é anterior a hoje. */
function dataNoPassado(valor: string): boolean {
  const d = parseDataValor(valor);
  if (!d) return false;
  d.setHours(0, 0, 0, 0);
  return d.getTime() < inicioDeHoje().getTime();
}

/**
 * Seletor de data com calendário em popover, no padrão escuro Camada (sem o
 * controle nativo `type="date"`). Guarda o valor como ISO `yyyy-MM-dd`.
 */
function SeletorData({
  value,
  onChange,
  disabled,
  ariaLabel,
  placeholder = "Escolher data",
  bloquearPassado = false,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  placeholder?: string;
  bloquearPassado?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const selecionada = parseDataValor(value);
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          className="flex w-full items-center justify-between gap-2 bg-card border border-transparent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 px-3 font-mono text-sm text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className={selecionada ? "text-foreground" : "text-muted-foreground/50"}>
            {selecionada ? format(selecionada, "dd/MM/yyyy") : placeholder}
          </span>
          <CalendarIcon className="w-4 h-4 text-muted-foreground/60 shrink-0" strokeWidth={1.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0 bg-popover border-border rounded-none">
        <Calendar
          mode="single"
          locale={ptBR}
          selected={selecionada}
          defaultMonth={selecionada}
          disabled={bloquearPassado ? { before: inicioDeHoje() } : undefined}
          onSelect={(d) => {
            onChange(d ? format(d, "yyyy-MM-dd") : "");
            setAberto(false);
          }}
          classNames={{ today: "text-accent font-medium" }}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Seletor de horário em popover (colunas de hora e minuto), no padrão Camada —
 * champagne só no numeral/fio do item ativo. Guarda o valor como `HH:mm`.
 */
function SeletorHorario({
  value,
  onChange,
  placeholder = "Escolher horário",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [hora, minuto] = value ? value.split(":") : ["", ""];
  const horaAtivaRef = useRef<HTMLButtonElement>(null);
  const minutoAtivoRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!aberto) return;
    // Rola até o valor já selecionado ao abrir, deixando claro que há mais opções.
    const t = window.setTimeout(() => {
      horaAtivaRef.current?.scrollIntoView({ block: "center" });
      minutoAtivoRef.current?.scrollIntoView({ block: "center" });
    }, 0);
    return () => window.clearTimeout(t);
  }, [aberto]);
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Escolher horário da cirurgia"
          className="flex w-full items-center justify-between gap-2 bg-card border border-transparent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 px-3 font-mono text-sm text-foreground"
        >
          <span className={value ? "text-foreground" : "text-muted-foreground/50"}>
            {value || placeholder}
          </span>
          <Clock className="w-4 h-4 text-muted-foreground/60 shrink-0" strokeWidth={1.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0 bg-popover border-border rounded-none">
        <div className="flex divide-x divide-border">
          <div className="scroll-visivel flex flex-col max-h-56 overflow-y-auto px-1 py-1 w-16">
            <span className="font-expanded text-[8px] tracking-widest uppercase text-muted-foreground/60 text-center py-1 sticky top-0 bg-popover">Hora</span>
            {HORAS.map((hh) => {
              const ativo = hh === hora;
              return (
                <button
                  key={hh}
                  ref={ativo ? horaAtivaRef : undefined}
                  type="button"
                  onClick={() => onChange(`${hh}:${minuto || "00"}`)}
                  className={cn(
                    "font-mono text-sm py-1.5 text-center transition-colors border-l-2",
                    ativo
                      ? "border-accent text-accent bg-card"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-card",
                  )}
                >
                  {hh}
                </button>
              );
            })}
          </div>
          <div className="scroll-visivel flex flex-col max-h-56 overflow-y-auto px-1 py-1 w-16">
            <span className="font-expanded text-[8px] tracking-widest uppercase text-muted-foreground/60 text-center py-1 sticky top-0 bg-popover">Min</span>
            {MINUTOS.map((mm) => {
              const ativo = mm === minuto;
              return (
                <button
                  key={mm}
                  ref={ativo ? minutoAtivoRef : undefined}
                  type="button"
                  onClick={() => onChange(`${hora || "00"}:${mm}`)}
                  className={cn(
                    "font-mono text-sm py-1.5 text-center transition-colors border-l-2",
                    ativo
                      ? "border-accent text-accent bg-card"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-card",
                  )}
                >
                  {mm}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StepIndicator({
  etapa,
  onStepClick,
}: {
  etapa: number;
  onStepClick: (i: number) => void;
}) {
  return (
    <nav aria-label="Progresso do cadastro" className="flex items-center gap-1">
      {ETAPAS.map((e, i) => {
        const done = i < etapa;
        const current = i === etapa;
        const clickable = i < etapa;
        return (
          <Fragment key={e.chave}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepClick(i)}
              aria-current={current ? "step" : undefined}
              className={cn("group flex items-center gap-2 shrink-0", clickable ? "cursor-pointer" : "cursor-default")}
            >
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rotate-45 border transition-colors",
                  current ? "border-accent" : done ? "border-accent/60" : "border-muted-foreground/30",
                )}
              >
                <span
                  className={cn(
                    "-rotate-45 font-mono text-[11px] leading-none",
                    current || done ? "text-accent" : "text-muted-foreground/40",
                  )}
                >
                  {i + 1}
                </span>
              </span>
              <span
                className={cn(
                  "font-expanded text-[9px] tracking-[0.15em] uppercase leading-none hidden sm:inline",
                  current
                    ? "text-foreground"
                    : done
                      ? "text-muted-foreground group-hover:text-foreground"
                      : "text-muted-foreground/40",
                )}
              >
                {e.titulo}
              </span>
            </button>
            {i < ETAPAS.length - 1 && (
              <span className={cn("h-px flex-1 mx-1.5", done ? "bg-accent/40" : "bg-muted-foreground/20")} />
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

function GrupoRevisao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="font-expanded text-[10px] tracking-widest uppercase text-accent">{titulo}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      {children}
    </div>
  );
}

function CamposPaciente({
  form,
  ativas,
  medicos,
}: {
  form: UseFormReturn<FormValues>;
  ativas: Vendedora[];
  medicos: Medico[];
}) {
  const medicoPadrao = medicos.find((m) => m.padrao);
  return (
    <>
      <BuscaContatoTwenty form={form} />
      <FormField
        control={form.control}
        name="vendedoraId"
        render={({ field }) => (
          <FormItem>
            <FormLabel className={LABEL_CLS}>Vendedora Responsável</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger className={SELECT_TRIGGER_CLS}>
                  <SelectValue placeholder="Selecione a vendedora" />
                </SelectTrigger>
              </FormControl>
              <SelectContent className={SELECT_CONTENT_CLS}>
                <SelectItem value={SEM_VENDEDORA} className={SELECT_ITEM_CLS}>
                  Sem responsável
                </SelectItem>
                {ativas.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)} className={SELECT_ITEM_CLS}>
                    {v.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage className={MSG_CLS} />
          </FormItem>
        )}
      />
      {medicos.length > 0 && (
        <FormField
          control={form.control}
          name="medicoId"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={LABEL_CLS}>Médico responsável</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className={SELECT_TRIGGER_CLS}>
                    <SelectValue placeholder="Selecione o médico" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent className={SELECT_CONTENT_CLS}>
                  {medicos.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)} className={SELECT_ITEM_CLS}>
                      {m.nome}{m.padrao ? " (padrão)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldHint>
                Aparece na página da paciente e nas mensagens.
                {medicoPadrao ? ` Padrão: ${medicoPadrao.nome}.` : ""}
              </FieldHint>
              <FormMessage className={MSG_CLS} />
            </FormItem>
          )}
        />
      )}
      <FormField
        control={form.control}
        name="nome"
        render={({ field }) => (
          <FormItem>
            <FormLabel className={LABEL_CLS}>Nome do paciente</FormLabel>
            <FormControl>
              <Input placeholder="Ex: Maria Silva" className={INPUT_CLS} {...field} />
            </FormControl>
            <FieldHint>Nome completo, como aparecerá na página da paciente.</FieldHint>
            <FormMessage className={MSG_CLS} />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="cpf"
        render={({ field }) => (
          <FormItem>
            <FormLabel className={LABEL_CLS}>CPF (opcional)</FormLabel>
            <FormControl>
              <Input
                inputMode="numeric"
                placeholder="000.000.000-00"
                maxLength={14}
                className={cn(INPUT_CLS, "font-mono")}
                {...field}
                value={formatarCpf(field.value)}
                onChange={(e) => field.onChange(apenasDigitos(e.target.value))}
              />
            </FormControl>
            <FieldHint>Apenas para uso interno da equipe — não aparece na página da paciente.</FieldHint>
            <FormMessage className={MSG_CLS} />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="telefone"
        render={({ field }) => (
          <FormItem>
            <FormLabel className={LABEL_CLS}>Telefone / WhatsApp</FormLabel>
            <FormControl>
              <Input
                inputMode="numeric"
                placeholder="(11) 90000-0000"
                maxLength={15}
                className={cn(INPUT_CLS, "font-mono")}
                {...field}
                value={formatarTelefone(field.value)}
                onChange={(e) => field.onChange(apenasDigitos(e.target.value))}
              />
            </FormControl>
            <FieldHint>Apenas para uso interno da equipe — não aparece na página da paciente.</FieldHint>
            <FormMessage className={MSG_CLS} />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="rg"
        render={({ field }) => (
          <FormItem>
            <FormLabel className={LABEL_CLS}>RG (opcional)</FormLabel>
            <FormControl>
              <Input placeholder="00.000.000-0" className={INPUT_CLS} {...field} />
            </FormControl>
            <FieldHint>Usado nos documentos (contrato/termo). Uso interno.</FieldHint>
            <FormMessage className={MSG_CLS} />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="nascimento"
        render={({ field }) => (
          <FormItem>
            <FormLabel className={LABEL_CLS}>Data de nascimento (opcional)</FormLabel>
            <FormControl>
              <Input placeholder="dd/mm/aaaa" className={INPUT_CLS} {...field} />
            </FormControl>
            <FieldHint>Usada nos documentos (contrato/termo). Uso interno.</FieldHint>
            <FormMessage className={MSG_CLS} />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="endereco"
        render={({ field }) => (
          <FormItem>
            <FormLabel className={LABEL_CLS}>Endereço (opcional)</FormLabel>
            <FormControl>
              <Input
                placeholder="Rua, nº, bairro, cidade/UF"
                className={INPUT_CLS}
                {...field}
              />
            </FormControl>
            <FieldHint>Endereço residencial — usado nos documentos. Uso interno.</FieldHint>
            <FormMessage className={MSG_CLS} />
          </FormItem>
        )}
      />
    </>
  );
}

function CamposCirurgia({
  form,
  config,
}: {
  form: UseFormReturn<FormValues>;
  config: ConfigOperacional | undefined;
}) {
  const [procedimentoCustom, setProcedimentoCustom] = useState("");

  function alternarTemplate(chave: string) {
    const tpl = config?.procedimentos.find((p) => p.chave === chave);
    if (!tpl) return;
    const atuais = form.getValues("procedimentos") ?? [];
    if (atuais.includes(tpl.nome)) {
      form.setValue("procedimentos", atuais.filter((n) => n !== tpl.nome), { shouldValidate: true });
      return;
    }
    form.setValue("procedimentos", [...atuais, tpl.nome], { shouldValidate: true });
    if (tpl.laserSugerido) form.setValue("laser", true);
    if (tpl.horarioSugerido && !form.getValues("horario")) form.setValue("horario", tpl.horarioSugerido);
    if (tpl.sinalSugerido != null && !form.getValues("valorSinal")) form.setValue("valorSinal", tpl.sinalSugerido);
  }

  function adicionarProcedimentoCustom() {
    const nome = procedimentoCustom.trim();
    if (!nome) return;
    const atuais = form.getValues("procedimentos") ?? [];
    if (!atuais.includes(nome)) {
      form.setValue("procedimentos", [...atuais, nome], { shouldValidate: true });
    }
    setProcedimentoCustom("");
  }

  /** Sugestão de procedimento comum: um clique preenche/remove do campo. */
  function alternarSugestao(nome: string) {
    const atuais = form.getValues("procedimentos") ?? [];
    if (atuais.includes(nome)) {
      form.setValue("procedimentos", atuais.filter((n) => n !== nome), { shouldValidate: true });
    } else {
      form.setValue("procedimentos", [...atuais, nome], { shouldValidate: true });
    }
  }

  function removerProcedimento(nome: string) {
    const atuais = form.getValues("procedimentos") ?? [];
    form.setValue("procedimentos", atuais.filter((n) => n !== nome), { shouldValidate: true });
  }

  return (
    <>
      <FormField
        control={form.control}
        name="local"
        render={({ field }) => (
          <FormItem>
            <FormLabel className={LABEL_CLS}>Hospital / Local</FormLabel>
            <FormControl>
              <Input
                placeholder="Ex: Avant Moema Day Hospital"
                className={INPUT_CLS}
                {...field}
              />
            </FormControl>
            <FieldHint>Onde a cirurgia será realizada. Texto livre — pode digitar qualquer local.</FieldHint>
            <FormMessage className={MSG_CLS} />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="localEndereco"
        render={({ field }) => (
          <FormItem>
            <FormLabel className={LABEL_CLS}>Endereço do local</FormLabel>
            <FormControl>
              <Input
                placeholder="Ex: Av. Copacabana, 112, 3º andar — Moema, São Paulo"
                className={INPUT_CLS}
                {...field}
              />
            </FormControl>
            <FieldHint>Aparece na página da paciente e nas mensagens. Opcional.</FieldHint>
            <FormMessage className={MSG_CLS} />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="procedimentos"
        render={({ field }) => {
          const selecionados = field.value ?? [];
          return (
            <FormItem>
              <FormLabel className={cn(LABEL_CLS, "flex items-center gap-2")}>
                Procedimentos
                <InfoHint>Campo livre. Clique numa sugestão para preencher ou digite o procedimento no campo abaixo e toque em Adicionar. Pode incluir mais de um.</InfoHint>
              </FormLabel>
              <p className="font-mono text-[10px] tracking-wide text-muted-foreground/60 pt-1">
                Sugestões — clique para preencher
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {PROCEDIMENTOS_SUGESTOES.map((nome) => {
                  const ativo = selecionados.includes(nome);
                  return (
                    <button
                      key={nome}
                      type="button"
                      onClick={() => alternarSugestao(nome)}
                      className={`text-left rounded-none px-3 py-2 text-sm font-light border transition-colors ${
                        ativo
                          ? "border-accent bg-card text-foreground"
                          : "border-border bg-card/30 text-muted-foreground hover:text-foreground hover:border-accent/40"
                      }`}
                    >
                      {nome}
                    </button>
                  );
                })}
                {config?.procedimentos
                  .filter((p) => !PROCEDIMENTOS_SUGESTOES.includes(p.nome as (typeof PROCEDIMENTOS_SUGESTOES)[number]))
                  .map((p) => {
                    const ativo = selecionados.includes(p.nome);
                    return (
                      <button
                        key={p.chave}
                        type="button"
                        onClick={() => alternarTemplate(p.chave)}
                        title={p.descricao}
                        className={`text-left rounded-none px-3 py-2 text-sm font-light border transition-colors ${
                          ativo
                            ? "border-accent bg-card text-foreground"
                            : "border-border bg-card/30 text-muted-foreground hover:text-foreground hover:border-accent/40"
                        }`}
                      >
                        {p.nome}
                      </button>
                    );
                  })}
              </div>
              <div className="flex gap-2 pt-2">
                <Input
                  value={procedimentoCustom}
                  onChange={(e) => setProcedimentoCustom(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      adicionarProcedimentoCustom();
                    }
                  }}
                  placeholder="Outro procedimento"
                  className="bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-11 text-foreground placeholder:text-muted-foreground/50"
                />
                <Button
                  type="button"
                  onClick={adicionarProcedimentoCustom}
                  className="bg-card hover:bg-card/70 text-foreground border border-accent/30 rounded-none h-11 px-4 shrink-0 inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                  Adicionar
                </Button>
              </div>
              {selecionados.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-3">
                  {selecionados.map((nome) => (
                    <span
                      key={nome}
                      className="inline-flex items-center gap-2 rounded-none border border-accent/40 bg-card px-3 py-1.5 text-sm font-light text-foreground"
                    >
                      {nome}
                      <button
                        type="button"
                        onClick={() => removerProcedimento(nome)}
                        aria-label={`Remover ${nome}`}
                        className="text-muted-foreground hover:text-accent transition-colors"
                      >
                        <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <FieldHint>Digite cada procedimento e toque em Adicionar — pode incluir vários.</FieldHint>
              <FormMessage className={MSG_CLS} />
            </FormItem>
          );
        }}
      />
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="dataCirurgia"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={LABEL_CLS}>Data da cirurgia</FormLabel>
              <FormControl>
                <SeletorData
                  value={field.value}
                  onChange={field.onChange}
                  ariaLabel="Escolher data da cirurgia"
                  bloquearPassado
                />
              </FormControl>
              <FieldHint>Dia da cirurgia.</FieldHint>
              <FormMessage className={MSG_CLS} />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="horario"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={LABEL_CLS}>Horário</FormLabel>
              <FormControl>
                <SeletorHorario value={field.value} onChange={field.onChange} />
              </FormControl>
              <FieldHint>Horário marcado da cirurgia.</FieldHint>
              <FormMessage className={MSG_CLS} />
            </FormItem>
          )}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="equipeAnestesia"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={LABEL_CLS}>Equipe de anestesia</FormLabel>
              <FormControl>
                <Input placeholder="Ex: Zenicare" className={INPUT_CLS} {...field} />
              </FormControl>
              <FieldHint>Equipe responsável pela anestesia.</FieldHint>
              <FormMessage className={MSG_CLS} />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="equipeAnestesiaTelefone"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={LABEL_CLS}>Telefone da anestesia</FormLabel>
              <FormControl>
                <Input placeholder="Ex: (11) 95080-2525" className={cn(INPUT_CLS, "font-mono")} {...field} />
              </FormControl>
              <FieldHint>Telefone exibido na página da paciente.</FieldHint>
              <FormMessage className={MSG_CLS} />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={form.control}
        name="laser"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between rounded-none border border-border bg-card/30 p-4 mt-2">
            <div className="space-y-1 pr-4">
              <FormLabel className="text-foreground text-base font-light">Laser CO₂ no dia?</FormLabel>
              <p className="text-muted-foreground/70 font-light text-xs leading-relaxed">Ative se o laser CO₂ será usado na mesma cirurgia.</p>
            </div>
            <FormControl>
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                className="data-[state=checked]:bg-primary"
              />
            </FormControl>
          </FormItem>
        )}
      />
    </>
  );
}

function CamposPagamento({ form }: { form: UseFormReturn<FormValues> }) {
  const temPendente = form.watch("valorPendente") > 0;
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="valorSinal"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={LABEL_CLS}>Valor pago (R$)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" className={cn(INPUT_CLS, "font-mono")} {...field} />
              </FormControl>
              <FieldHint>Valor já pago pela paciente. Deixe 0 se ainda não houve.</FieldHint>
              <FormMessage className={MSG_CLS} />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="valorPendente"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={LABEL_CLS}>Valor pendente (R$)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" className={cn(INPUT_CLS, "font-mono")} {...field} />
              </FormControl>
              <FieldHint>Saldo em aberto. Deixe 0 se estiver quitado.</FieldHint>
              <FormMessage className={MSG_CLS} />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={form.control}
        name="dataPagamentoPendente"
        render={({ field }) => (
          <FormItem>
            <FormLabel className={LABEL_CLS}>Vencimento do saldo</FormLabel>
            <FormControl>
              <SeletorData
                value={field.value}
                onChange={field.onChange}
                disabled={!temPendente}
                ariaLabel="Escolher vencimento do saldo"
                bloquearPassado
              />
            </FormControl>
            <FieldHint>Data prevista para o pagamento do saldo. Só quando houver pendência.</FieldHint>
            <FormMessage className={MSG_CLS} />
          </FormItem>
        )}
      />
    </>
  );
}

export function NovoPacienteDialog({
  open,
  onOpenChange,
  config,
  ativas,
  medicos,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ConfigOperacional | undefined;
  ativas: Vendedora[];
  medicos: Medico[];
}) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [etapa, setEtapa] = useState(0);
  const criarPaciente = useCriarPaciente();
  const restaurarPaciente = useRestaurarPaciente();
  const atualizarConteudo = useAtualizarConteudoPaciente();
  // Conteúdo editável durante a criação. `null` = ainda não mexeu → a paciente
  // segue o padrão global ao vivo (sem override). Ao editar, guardamos as seções
  // e, na confirmação, gravamos um override só desse paciente.
  const [secoesEdit, setSecoesEdit] = useState<SecaoConteudo[] | null>(null);
  const [conteudoDirty, setConteudoDirty] = useState(false);
  // PDF do pedido de exames escolhido durante a criação. Como a rota é por
  // paciente (que ainda não existe), o arquivo fica retido e é enviado logo após
  // criar a paciente, junto do override de conteúdo.
  const [pedidoExamesFile, setPedidoExamesFile] = useState<File | null>(null);
  const pedidoExamesInputRef = useRef<HTMLInputElement>(null);
  // Cobre a janela pós-criação (salvar conteúdo + anexar PDF) para não permitir
  // um segundo submit enquanto finalizamos.
  const [finalizando, setFinalizando] = useState(false);
  // Cadastro arquivado encontrado pelo mesmo CPF — guardado para oferecer a
  // restauração (ou um novo cadastro) em vez de um 409 confuso.
  const [conflitoArquivado, setConflitoArquivado] =
    useState<PacienteArquivadoResumo | null>(null);
  const { data: conteudoPadrao } = useObterConteudoPadrao({
    query: { queryKey: getObterConteudoPadraoQueryKey() },
  });

  const medicoPadraoId = medicos.find((m) => m.padrao)?.id;
  const defaultValues = useMemo<FormValues>(
    () => ({
      nome: "",
      cpf: "",
      telefone: "",
      procedimentos: [],
      dataCirurgia: "",
      horario: "",
      valorSinal: 0,
      valorPendente: 0,
      dataPagamentoPendente: "",
      laser: false,
      local: "",
      localEndereco: "",
      // Texto livre: pré-preenche com a equipe usada hoje (a secretária edita se mudar).
      equipeAnestesia: "Zenicare",
      equipeAnestesiaTelefone: "(11) 95080-2525",
      vendedoraId: SEM_VENDEDORA,
      medicoId: medicoPadraoId != null ? String(medicoPadraoId) : SEM_MEDICO,
      email: "",
      twentyContactId: "",
      rg: "",
      nascimento: "",
      endereco: "",
    }),
    [config, medicoPadraoId],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  useEffect(() => {
    if (open) {
      setEtapa(0);
      setSecoesEdit(null);
      setConteudoDirty(false);
      setPedidoExamesFile(null);
      setFinalizando(false);
    }
  }, [open]);

  // O formulário fica sempre montado na home, então o react-hook-form lê os
  // `defaultValues` uma única vez — no carregamento da página. Em uma primeira
  // carga lenta (config/medicos ainda sem cache), o médico padrão e a equipe
  // única ainda não existem nesse momento, e o formulário nasce sem eles. Quando
  // o diálogo abre (ou quando os dados chegam com o diálogo já aberto), e desde
  // que a equipe ainda não tenha mexido em nada, reaplicamos os defaults para que
  // o médico "padrão" e a equipe única apareçam pré-selecionados.
  useEffect(() => {
    if (open && !form.formState.isDirty) {
      form.reset(defaultValues);
    }
  }, [open, defaultValues, form]);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setEtapa(0);
      form.reset(defaultValues);
    }
  }

  async function avancar() {
    const campos = CAMPOS_POR_ETAPA[etapa];
    const valido = await form.trigger(campos);
    if (valido) setEtapa((e) => Math.min(e + 1, ULTIMA_ETAPA));
  }

  function voltar() {
    setEtapa((e) => Math.max(e - 1, 0));
  }

  function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault();
    if (etapa < ULTIMA_ETAPA) {
      void avancar();
    } else {
      void form.handleSubmit(handleConfirm)();
    }
  }

  function irParaPaciente(id: number) {
    queryClient.invalidateQueries({ queryKey: getListarPacientesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getResumoPacientesQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getListarPacientesArquivadosQueryKey(),
    });
    onOpenChange(false);
    setEtapa(0);
    form.reset(defaultValues);
    setLocation(`/paciente/${id}`);
  }

  // `permitirCpfArquivado` força a criação de um novo cadastro mesmo havendo um
  // arquivado com o mesmo CPF (paciente que voltou para um novo procedimento).
  function submeterCadastro(values: FormValues, permitirCpfArquivado = false) {
    const { vendedoraId, medicoId, ...resto } = values;
    const temPendente = values.valorPendente > 0;
    criarPaciente.mutate(
      {
        data: {
          ...resto,
          permitirCpfArquivado,
          dataPagamentoPendente:
            temPendente && values.dataPagamentoPendente ? values.dataPagamentoPendente : null,
          vendedoraId: vendedoraId === SEM_VENDEDORA ? null : Number(vendedoraId),
          medicoId: medicoId === SEM_MEDICO ? null : Number(medicoId),
        },
      },
      {
        onSuccess: async (res) => {
          const novoId = res.paciente.id;
          setFinalizando(true);
          // Só grava override quando a equipe editou o conteúdo na revisão. Sem
          // edição, a paciente segue o padrão global ao vivo (sem override).
          if (conteudoDirty && secoesEdit) {
            try {
              await atualizarConteudo.mutateAsync({
                id: novoId,
                data: { secoes: secoesEdit },
              });
            } catch {
              // A paciente já foi criada — não perde o cadastro. Avisa que o
              // conteúdo personalizado não salvou; dá pra editar na página dela.
              toast({
                title: "Paciente criada, mas o conteúdo personalizado não salvou",
                description: "Abra a página da paciente e ajuste o conteúdo por lá.",
                variant: "destructive",
              });
            }
          }
          // Anexa o PDF do pedido de exames retido na criação (rota por paciente,
          // por isso só agora que temos o id). Best-effort: a paciente já existe.
          if (pedidoExamesFile) {
            try {
              const fd = new FormData();
              fd.append("arquivo", pedidoExamesFile, pedidoExamesFile.name);
              const resp = await fetch(`/api/pacientes/${novoId}/pedido-exames`, {
                method: "POST",
                body: fd,
              });
              if (!resp.ok) throw new Error("upload_failed");
            } catch {
              toast({
                title: "Paciente criada, mas o pedido de exames não anexou",
                description: "Anexe o PDF na página da paciente.",
                variant: "destructive",
              });
            }
          }
          setFinalizando(false);
          irParaPaciente(novoId);
        },
        onError: (error) => {
          // Um cadastro arquivado com o mesmo CPF não é um erro: abrimos a
          // escolha "restaurar ou criar novo" em vez do toast de falha.
          if (
            error instanceof ApiError &&
            error.status === 409 &&
            error.data &&
            (error.data as ConflitoCpf).codigo === "cpf_arquivado" &&
            (error.data as ConflitoCpf).pacienteArquivado
          ) {
            setConflitoArquivado(
              (error.data as ConflitoCpf).pacienteArquivado ?? null,
            );
            return;
          }
          toast(
            toastErroAcao(error, {
              title: "Não foi possível cadastrar a paciente",
              description: "Tente novamente em instantes.",
            }),
          );
        },
      },
    );
  }

  function handleConfirm(values: FormValues) {
    submeterCadastro(values);
  }

  function handleRestaurarArquivado() {
    const alvo = conflitoArquivado;
    if (!alvo) return;
    restaurarPaciente.mutate(
      { id: alvo.id },
      {
        onSuccess: () => {
          setConflitoArquivado(null);
          irParaPaciente(alvo.id);
        },
        onError: (error) => {
          toast(
            toastErroAcao(error, {
              title: "Não foi possível restaurar o cadastro",
              description: "Tente novamente em instantes.",
            }),
          );
        },
      },
    );
  }

  function handleCriarNovoMesmoCpf() {
    setConflitoArquivado(null);
    submeterCadastro(form.getValues(), true);
  }

  const valoresForm = form.watch();
  const secoesPadrao = conteudoPadrao?.secoes ?? [];
  // O que a prévia mostra e o editor edita: as seções já editadas, ou o padrão
  // global enquanto a equipe não mexeu.
  const secoesEfetivas = secoesEdit ?? secoesPadrao;
  const dadosPreviewNovo = useMemo<DadosPreview>(() => {
    // Hospital e endereço são texto livre — a prévia mostra o que foi digitado
    // (espelha o backend `perfilLocalDoPaciente`). Instruções de chegada só saem
    // quando o nome digitado casa com um hospital conhecido do catálogo.
    const localNome = valoresForm.local?.trim() || "";
    const localEnd = valoresForm.localEndereco?.trim() || "";
    const hospitalConhecido = config?.hospitais.find((h) => h.chave === localNome);
    // Equipe de anestesia é texto livre: nome e telefone vêm direto do formulário.
    const equipeNome = valoresForm.equipeAnestesia?.trim() || "";
    const equipeTelefone = valoresForm.equipeAnestesiaTelefone?.trim() || "";
    return {
      nome: valoresForm.nome?.trim() || "Paciente",
      dataCirurgia: valoresForm.dataCirurgia || DADOS_PREVIEW_EXEMPLO.dataCirurgia,
      horario: valoresForm.horario || "06:00",
      hospital: localNome || DADOS_PREVIEW_EXEMPLO.hospital,
      local: localNome ? (localEnd ? `${localNome} — ${localEnd}` : localNome) : "",
      medica: DADOS_PREVIEW_EXEMPLO.medica,
      equipe: equipeNome || DADOS_PREVIEW_EXEMPLO.equipe,
      equipeTelefone: equipeTelefone || DADOS_PREVIEW_EXEMPLO.equipeTelefone,
      instrucoesChegada:
        hospitalConhecido?.instrucoesChegada ?? DADOS_PREVIEW_EXEMPLO.instrucoesChegada,
      valorPago: Number(valoresForm.valorSinal) || 0,
      valorPendente: Number(valoresForm.valorPendente) || 0,
      dataPagamentoPendente: valoresForm.dataPagamentoPendente?.trim() || null,
      procedimentos: valoresForm.procedimentos ?? [],
    };
  }, [valoresForm, config]);

  const etapaAtual = ETAPAS[etapa];
  // As duas últimas etapas (Revisar dados → Conteúdo) usam o layout de duas
  // colunas com a prévia sempre fixa à direita.
  const ehRevisaoDados = etapa === ULTIMA_ETAPA - 1;
  const ehConteudo = etapa === ULTIMA_ETAPA;
  const ehDuasColunas = ehRevisaoDados || ehConteudo;

  function selecionarPedidoExames(file: File) {
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
    setPedidoExamesFile(file);
    if (pedidoExamesInputRef.current) pedidoExamesInputRef.current.value = "";
  }

  // Upload do PDF de pedido de exames dentro da seção "Exames Pré-Operatórios"
  // do editor (via `slotPreparo`). Aqui o arquivo fica retido e é enviado após
  // criar a paciente (a rota exige o id, que ainda não existe neste passo).
  const slotPreparoNovo = (
    <div className="space-y-3">
      <input
        ref={pedidoExamesInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) selecionarPedidoExames(file);
        }}
      />
      {pedidoExamesFile ? (
        <div className="flex items-center justify-between gap-4 p-3 flex-wrap bg-background border border-border">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="w-5 h-5 text-accent shrink-0" strokeWidth={1.5} />
            <div className="min-w-0">
              <p className="text-sm text-foreground font-medium truncate">{pedidoExamesFile.name}</p>
              <p className="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-wider truncate">
                {formatarTamanhoArquivo(pedidoExamesFile.size)} · anexa ao criar
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => pedidoExamesInputRef.current?.click()}
              className="h-8 px-3 rounded-none bg-transparent border border-border hover:bg-card text-muted-foreground hover:text-foreground"
            >
              <UploadCloud className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
              <span className="font-expanded text-[9px] uppercase tracking-widest">Trocar</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPedidoExamesFile(null)}
              className="h-8 px-3 rounded-none bg-transparent border border-border hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4 flex-wrap border border-dashed border-border p-3">
          <p className="text-sm text-muted-foreground font-light">
            Nenhum pedido de exames anexado. Apenas PDF, até 20 MB.
          </p>
          <Button
            type="button"
            onClick={() => pedidoExamesInputRef.current?.click()}
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-9 px-4 font-medium shrink-0"
          >
            <UploadCloud className="w-4 h-4 mr-2" strokeWidth={1.5} />
            Anexar PDF
          </Button>
        </div>
      )}
    </div>
  );

  const colunaFormulario = (
    <div
      className={cn(
        // Rola sempre e cabe na tela: sem isto, as etapas mais altas estouram o
        // DialogContent (overflow-hidden) e o scroll da página fica quebrado.
        // min-h-0 permite a coluna encolher e rolar dentro do grid da revisão.
        "p-8 overflow-y-auto max-h-[85vh] min-h-0",
        ehDuasColunas && "border-b lg:border-b-0 lg:border-r border-border",
      )}
    >
      <DialogHeader className="mb-5">
        <DialogTitle className="font-serif text-3xl font-light text-foreground">
          {etapaAtual.titulo}
        </DialogTitle>
        <p className="text-muted-foreground font-light text-sm pt-1">{etapaAtual.descricao}</p>
      </DialogHeader>
      <StepIndicator etapa={etapa} onStepClick={setEtapa} />
      <Form {...form}>
        <form onSubmit={handleSubmitForm} className="space-y-6 mt-7">
          {etapa === 0 && <CamposPaciente form={form} ativas={ativas} medicos={medicos} />}
          {etapa === 1 && <CamposCirurgia form={form} config={config} />}
          {etapa === 2 && <CamposPagamento form={form} />}
          {ehRevisaoDados && (
            <div className="space-y-8">
              <GrupoRevisao titulo="Paciente">
                <CamposPaciente form={form} ativas={ativas} medicos={medicos} />
              </GrupoRevisao>
              <GrupoRevisao titulo="Cirurgia">
                <CamposCirurgia form={form} config={config} />
              </GrupoRevisao>
              <GrupoRevisao titulo="Pagamento">
                <CamposPagamento form={form} />
              </GrupoRevisao>
            </div>
          )}
          {ehConteudo && (
            <SecoesEditor
              secoes={secoesEfetivas}
              onChange={(s) => {
                setSecoesEdit(s);
                setConteudoDirty(true);
              }}
              dadosPreview={dadosPreviewNovo}
              slotPreparo={slotPreparoNovo}
            />
          )}
          <div className="flex gap-3 pt-2">
            {etapa > 0 && (
              <Button
                type="button"
                onClick={voltar}
                disabled={criarPaciente.isPending}
                className="flex-1 bg-transparent hover:bg-card text-foreground border border-border rounded-none h-12 text-base font-medium"
              >
                Voltar
              </Button>
            )}
            {ehConteudo ? (
              <Button
                type="submit"
                disabled={criarPaciente.isPending || atualizarConteudo.isPending || finalizando}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-12 text-base font-medium"
              >
                {criarPaciente.isPending || atualizarConteudo.isPending || finalizando
                  ? "Gerando..."
                  : "Confirmar e gerar link"}
              </Button>
            ) : (
              <Button
                type="submit"
                className={cn(
                  "bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-12 text-base font-medium",
                  etapa > 0 ? "flex-1" : "w-full",
                )}
              >
                {ehRevisaoDados ? "Prosseguir" : "Avançar"}
              </Button>
            )}
          </div>
        </form>
      </Form>
    </div>
  );

  const ocupado = criarPaciente.isPending || restaurarPaciente.isPending;
  const dataArquivadoFmt = conflitoArquivado
    ? (parseDataValor(conflitoArquivado.dataCirurgia)
        ? format(parseDataValor(conflitoArquivado.dataCirurgia)!, "dd/MM/yyyy")
        : conflitoArquivado.dataCirurgia)
    : "";

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className={cn(
            "bg-background border border-border text-foreground rounded-none p-0 overflow-hidden shadow-2xl",
            ehDuasColunas ? "sm:max-w-[1040px]" : "sm:max-w-[520px]",
          )}
        >
          <div className="h-1 w-full bg-accent" />
          {ehDuasColunas ? (
            <div className="grid lg:grid-cols-2 max-h-[85vh]">
              {colunaFormulario}
              <div className="bg-muted/30 flex flex-col max-h-[85vh] min-h-0">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
                  <Eye className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
                  <span className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground">
                    Prévia da página
                  </span>
                  {conteudoDirty && (
                    <span className="text-[11px] text-accent">• personalizado</span>
                  )}
                </div>
                <div className="p-6 overflow-y-auto min-h-0 flex items-start justify-center">
                  <PreviaPaginaPaciente
                    secoes={secoesEfetivas}
                    dados={dadosPreviewNovo}
                    tema={config?.temaPadrao ?? null}
                  />
                </div>
              </div>
            </div>
          ) : (
            colunaFormulario
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={conflitoArquivado !== null}
        onOpenChange={(aberto) => {
          if (!aberto && !ocupado) setConflitoArquivado(null);
        }}
      >
        <AlertDialogContent className="bg-background border border-border text-foreground rounded-none">
          <div className="h-1 w-full bg-accent -mt-6 -mx-6 mb-1" style={{ width: "calc(100% + 3rem)" }} />
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl font-light text-foreground">
              Cadastro arquivado com este CPF
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground font-light text-sm leading-relaxed">
              Já existe um cadastro arquivado de{" "}
              <span className="text-foreground font-medium">
                {conflitoArquivado?.nome}
              </span>
              {dataArquivadoFmt ? ` (cirurgia em ${dataArquivadoFmt})` : ""} com
              este CPF. Você pode restaurar o cadastro anterior — mantendo todo o
              histórico — ou criar um novo cadastro, caso a paciente esteja
              voltando para um novo procedimento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <Button
              type="button"
              onClick={handleCriarNovoMesmoCpf}
              disabled={ocupado}
              className="bg-transparent hover:bg-card text-foreground border border-border rounded-none h-11 text-sm font-medium"
            >
              Criar novo cadastro
            </Button>
            <Button
              type="button"
              onClick={handleRestaurarArquivado}
              disabled={ocupado}
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-11 text-sm font-medium"
            >
              {restaurarPaciente.isPending ? "Restaurando..." : "Restaurar cadastro"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
