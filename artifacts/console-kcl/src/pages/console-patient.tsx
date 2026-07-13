import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useObterPaciente,
  useAprovarPaciente,
  useAtualizarPaciente,
  useObterConfig,
  useListarHistoricoPaciente,
  useArquivarPaciente,
  useRestaurarPaciente,
  useListarVendedoras,
  useListarMedicos,
  useListarTimeline,
  useAdicionarNota,
  useObterConteudoPaciente,
  useAtualizarConteudoPaciente,
  useRemoverConteudoPaciente,
  useObterAtividadePaciente,
  useListarDocumentos,
  useListarContratosGeracao,
  getListarContratosGeracaoQueryKey,
  useRegistrarDocumento,
  useRemoverDocumento,
  useObterPedidoExames,
  useRemoverPedidoExames,
  getObterPedidoExamesQueryKey,
  useObterReceitaPreparoPele,
  useRemoverReceitaPreparoPele,
  getObterReceitaPreparoPeleQueryKey,
  useObterReceituarioPosop,
  useRemoverReceituarioPosop,
  getObterReceituarioPosopQueryKey,
  getObterPacienteQueryKey,
  getListarPacientesQueryKey,
  getListarPacientesArquivadosQueryKey,
  getResumoPacientesQueryKey,
  getListarTimelineQueryKey,
  getListarHistoricoPacienteQueryKey,
  getObterConteudoPacienteQueryKey,
  getObterAtividadePacienteQueryKey,
  getListarDocumentosQueryKey,
  isConnectivityError,
  ApiError,
  type SecaoConteudo,
  type ConfigOperacional,
  type Paciente,
  type Medico,
  type PacienteUpdate,
  type DocumentoPaciente
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { apenasDigitos, validarCpf, validarTelefone, formatarCpf, formatarTelefone, formatarData } from "@/lib/br-validacao";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PainelAssinaturas } from "@/components/gerador-contrato";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { EstratosLogo } from "./console-home";
import { ConnectionErrorConsole } from "@/components/connection-error";
import { SecoesEditor } from "@/components/secoes-editor";
import { PreviaPaginaPaciente } from "@/components/previa-pagina-paciente";
import { BuscaContatoTwenty } from "@/components/busca-contato-twenty";
import { DADOS_PREVIEW_EXEMPLO, type DadosPreview } from "@/lib/secoes-preview";
import { camposLocaisDeConfig } from "@workspace/secoes";
import { toastErroAcao } from "@/lib/erro-acao";
import { PosOpStaff } from "@/components/posop-staff";
import { PosOpMarcos } from "@/components/posop-marcos";
import { corDoMarco, rotuloDoMarco, ajudaDoMarco } from "@/lib/jornada-equipe";
import { ThemeToggle } from "@/components/theme-toggle";
import { DiscardChangesDialog } from "@/components/discard-changes-dialog";
import { Copy, ChevronDown, Check, ArrowLeft, ExternalLink, Pencil, ArrowRight, RefreshCw, FileSignature, Plus, X, Archive, RotateCcw, Eye, Download, FileText, Trash2, UploadCloud, CalendarClock, FilePlus, Settings2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { MEDICO_PERSONALIZADO, diasUteisAntes } from "@/lib/paciente-form-utils";
const SEM_VENDEDORA = "__nenhuma__";
// Opção "digitar um local novo" no seletor de hospital (texto livre → cria/reusa
// um local no backend). Distingue-se de um id de local da lista.
const LOCAL_LIVRE = "__local_livre__";

const editSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  // CPF opcional (igual ao cadastro): vazio é aceito; se preenchido, precisa ser válido.
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
  // Identidade vinda do contato do Twenty. O nome é somente-leitura no editor:
  // só muda ao escolher outro contato pela busca (que preenche estes campos).
  email: z.string().default(""),
  twentyContactId: z.string().default(""),
  // Identidade complementar (opcional): não vem do Twenty, editável à mão.
  rg: z.string().default(""),
  nascimento: z.string().default(""),
  endereco: z.string().default(""),
  procedimentos: z.array(z.string()).min(1, "Escolha ou descreva ao menos um procedimento."),
  dataCirurgia: z.string().min(1, "Data é obrigatória"),
  horario: z.string().default("06:00"),
  valorSinal: z.coerce.number().min(0, "Valor inválido"),
  valorPendente: z.coerce.number().min(0, "Valor inválido").default(0),
  dataPagamentoPendente: z.string().default(""),
  laser: z.boolean().default(false),
  local: z.string().min(1, "Local é obrigatório"),
  localEndereco: z.string().default(""),
  // Id do local escolhido da lista configurável ("" = texto livre, que cria/reusa
  // um local no backend a partir de `local`/`localEndereco`).
  localId: z.string().default(""),
  equipeAnestesia: z.string().min(1, "Informe a equipe de anestesia."),
  equipeAnestesiaTelefone: z.string().default(""),
  medicoId: z.string().default(MEDICO_PERSONALIZADO),
  medica: z.string().min(1, "Médica é obrigatória"),
  crm: z.string().default(""),
  rqe: z.string().default(""),
  clinica: z.string().default(""),
}).refine((d) => !(d.valorPendente > 0) || d.dataPagamentoPendente.trim().length > 0, {
  path: ["dataPagamentoPendente"],
  message: "Informe o vencimento do saldo pendente.",
});

/** Converte os dados persistidos da paciente nos valores do formulário de edição. */
function valoresDaPaciente(p: Paciente): z.infer<typeof editSchema> {
  return {
    nome: p.nome,
    cpf: p.cpf,
    telefone: p.telefone,
    email: p.email ?? "",
    twentyContactId: p.twentyContactId ?? "",
    rg: p.rg ?? "",
    nascimento: p.nascimento ?? "",
    endereco: p.endereco ?? "",
    procedimentos: p.procedimentos,
    dataCirurgia: p.dataCirurgia,
    horario: p.horario,
    valorSinal: p.valorSinal,
    valorPendente: p.valorPendente,
    dataPagamentoPendente: p.dataPagamentoPendente ?? "",
    laser: p.laser,
    local: p.local,
    localEndereco: p.localEndereco ?? "",
    localId: p.localId != null ? String(p.localId) : "",
    equipeAnestesia: p.equipeAnestesia ?? "",
    equipeAnestesiaTelefone: p.equipeAnestesiaTelefone ?? "",
    medicoId: p.medicoId != null ? String(p.medicoId) : MEDICO_PERSONALIZADO,
    medica: p.medica,
    crm: p.crm,
    rqe: p.rqe,
    clinica: p.clinica,
  };
}

/**
 * Campos editáveis dos dados da paciente, reutilizados no modal "Editar dados"
 * e no editor lado a lado da etapa Fechamento (mesma instância de `form`).
 */
function CamposEdicaoPaciente({
  form,
  config,
  medicos,
}: {
  form: UseFormReturn<z.infer<typeof editSchema>>;
  config: ConfigOperacional | undefined;
  medicos: Medico[];
}) {
  const [procedimentoCustom, setProcedimentoCustom] = useState("");
  const medicoSelecionado = form.watch("medicoId");
  const personalizado = medicoSelecionado === MEDICO_PERSONALIZADO;

  // Pré-preenche o vencimento do saldo com N dias úteis antes da cirurgia
  // (configuração operacional vinda do /config) quando o campo está vazio e há
  // saldo em aberto. O valor digitado pela equipe é preservado (nunca sobrescrito).
  //
  // Só sugerimos DEPOIS que a /config carregou (valor numérico). Se gravássemos
  // um padrão fixo antes da config chegar, ela carregaria com outro valor (ex.: 3)
  // mas o campo já não estaria vazio — a sugestão nunca seria corrigida e ficaria
  // divergente da dica. Sem fallback aqui, a sugestão simplesmente aguarda a config.
  const diasUteisVencimento = config?.vencimentoSaldoDiasUteisAntes;
  const dataCirurgiaWatch = form.watch("dataCirurgia");
  const valorPendenteWatch = form.watch("valorPendente");
  // Indica que o vencimento exibido foi sugerido automaticamente (não digitado
  // pela equipe). Some assim que o campo é editado manualmente.
  const [vencimentoSugerido, setVencimentoSugerido] = useState(false);
  useEffect(() => {
    if (diasUteisVencimento == null) return;
    const vencimentoAtual = form.getValues("dataPagamentoPendente");
    if (valorPendenteWatch > 0 && !vencimentoAtual && dataCirurgiaWatch) {
      form.setValue(
        "dataPagamentoPendente",
        diasUteisAntes(dataCirurgiaWatch, diasUteisVencimento),
        { shouldValidate: false, shouldDirty: false },
      );
      setVencimentoSugerido(true);
    }
  }, [dataCirurgiaWatch, valorPendenteWatch, diasUteisVencimento, form]);
  const camposMedicoCls = (extra = "") =>
    `bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 text-foreground placeholder:text-muted-foreground/50 ${extra} ${personalizado ? "" : "opacity-60 cursor-not-allowed"}`;

  function alternarTemplate(chave: string) {
    const tpl = config?.procedimentos.find((p) => p.chave === chave);
    if (!tpl) return;
    const atuais = form.getValues("procedimentos") ?? [];
    if (atuais.includes(tpl.nome)) {
      form.setValue("procedimentos", atuais.filter((n) => n !== tpl.nome), { shouldValidate: true });
    } else {
      form.setValue("procedimentos", [...atuais, tpl.nome], { shouldValidate: true });
    }
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

  function removerProcedimento(nome: string) {
    const atuais = form.getValues("procedimentos") ?? [];
    form.setValue("procedimentos", atuais.filter((n) => n !== nome), { shouldValidate: true });
  }

  return (
    <>
      <FormField
        control={form.control}
        name="nome"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">Nome do paciente</FormLabel>
            <FormControl>
              {/* Somente-leitura: o nome é a identidade da ficha e vem do contato
                  do Twenty. Para mudá-lo, troca-se o contato na busca abaixo. */}
              <Input
                readOnly
                tabIndex={-1}
                aria-readonly="true"
                placeholder="Escolha um contato do Twenty abaixo"
                className="bg-card border-transparent rounded-none h-12 text-foreground placeholder:text-muted-foreground/50 opacity-70 cursor-not-allowed focus-visible:ring-0"
                {...field}
              />
            </FormControl>
            <p className="text-muted-foreground/70 text-[11px] font-light pt-1">
              O nome vem do contato do Twenty e não pode ser editado à mão. Para
              trocar o paciente, use a busca abaixo.
            </p>
            <FormMessage className="font-mono text-xs text-red-400" />
          </FormItem>
        )}
      />
      <BuscaContatoTwenty form={form} modo="edicao" />
      <FormField
        control={form.control}
        name="cpf"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">CPF</FormLabel>
            <FormControl>
              <Input
                inputMode="numeric"
                placeholder="000.000.000-00"
                maxLength={14}
                className="bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 font-mono text-foreground placeholder:text-muted-foreground/50"
                {...field}
                value={formatarCpf(field.value)}
                onChange={(e) => field.onChange(apenasDigitos(e.target.value))}
              />
            </FormControl>
            <FormMessage className="font-mono text-xs text-red-400" />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="telefone"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">Telefone / WhatsApp</FormLabel>
            <FormControl>
              <Input
                inputMode="numeric"
                placeholder="(11) 90000-0000"
                maxLength={15}
                className="bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 font-mono text-foreground placeholder:text-muted-foreground/50"
                {...field}
                value={formatarTelefone(field.value)}
                onChange={(e) => field.onChange(apenasDigitos(e.target.value))}
              />
            </FormControl>
            <FormMessage className="font-mono text-xs text-red-400" />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="rg"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">RG (opcional)</FormLabel>
            <FormControl>
              <Input
                placeholder="00.000.000-0"
                className="bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 text-foreground placeholder:text-muted-foreground/50"
                {...field}
              />
            </FormControl>
            <FormMessage className="font-mono text-xs text-red-400" />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="nascimento"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">Data de nascimento (opcional)</FormLabel>
            <FormControl>
              <Input
                inputMode="numeric"
                placeholder="dd/mm/aaaa"
                maxLength={10}
                className="bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 text-foreground placeholder:text-muted-foreground/50"
                {...field}
                value={formatarData(field.value)}
                onChange={(e) => field.onChange(formatarData(e.target.value))}
              />
            </FormControl>
            <FormMessage className="font-mono text-xs text-red-400" />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="endereco"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">Endereço (opcional)</FormLabel>
            <FormControl>
              <Input
                placeholder="Rua, nº, bairro, cidade/UF"
                className="bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 text-foreground placeholder:text-muted-foreground/50"
                {...field}
              />
            </FormControl>
            <FormMessage className="font-mono text-xs text-red-400" />
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
              <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">Procedimentos</FormLabel>
              <div className="flex flex-wrap gap-2 pt-1">
                {config?.procedimentos.map((p) => {
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
              <FormMessage className="font-mono text-xs text-red-400" />
            </FormItem>
          );
        }}
      />
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="valorSinal"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">Valor pago (R$)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" className="bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 font-mono text-foreground" {...field} />
              </FormControl>
              <FormMessage className="font-mono text-xs text-red-400" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="valorPendente"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">Valor pendente (R$)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" className="bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 font-mono text-foreground" {...field} />
              </FormControl>
              <FormMessage className="font-mono text-xs text-red-400" />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={form.control}
        name="dataPagamentoPendente"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">Vencimento do saldo</FormLabel>
            <FormControl>
              <Input
                type="date"
                min={format(new Date(), "yyyy-MM-dd")}
                disabled={!(form.watch("valorPendente") > 0)}
                className="bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 font-mono text-foreground [color-scheme:light] dark:[color-scheme:dark] disabled:opacity-40"
                {...field}
                onChange={(e) => {
                  setVencimentoSugerido(false);
                  field.onChange(e);
                }}
              />
            </FormControl>
            {vencimentoSugerido && diasUteisVencimento != null && form.watch("valorPendente") > 0 && (
              <p className="text-muted-foreground/60 font-mono text-[10px] tracking-wide">
                Sugerido: {diasUteisVencimento} {diasUteisVencimento === 1 ? "dia útil" : "dias úteis"} antes da cirurgia
              </p>
            )}
            <FormMessage className="font-mono text-xs text-red-400" />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="dataCirurgia"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">Data da cirurgia</FormLabel>
              <FormControl>
                <Input type="date" className="bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 font-mono text-foreground [color-scheme:light] dark:[color-scheme:dark]" {...field} />
              </FormControl>
              <FormMessage className="font-mono text-xs text-red-400" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="horario"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">Horário</FormLabel>
              <FormControl>
                <Input type="time" className="bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 font-mono text-foreground [color-scheme:light] dark:[color-scheme:dark]" {...field} />
              </FormControl>
              <FormMessage className="font-mono text-xs text-red-400" />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={form.control}
        name="laser"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between rounded-none border border-border bg-card/30 p-4 h-16 mt-2">
            <div className="space-y-0.5">
              <FormLabel className="text-foreground text-base font-light">Laser CO₂ no dia?</FormLabel>
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

      <div className="pt-2 flex items-center gap-4">
        <span className="font-expanded text-[10px] tracking-widest text-muted-foreground uppercase">Médica e clínica</span>
        <div className="flex-1 h-px bg-card/50"></div>
      </div>

      <FormField
        control={form.control}
        name="localId"
        render={({ field }) => {
          const hospitais = config?.hospitais ?? [];
          const livre = field.value === "" || field.value === LOCAL_LIVRE;
          return (
            <FormItem>
              <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">Hospital / Local</FormLabel>
              <Select
                value={field.value === "" ? undefined : field.value}
                onValueChange={(v) => {
                  if (v === "") return;
                  field.onChange(v);
                  if (v === LOCAL_LIVRE) {
                    form.setValue("local", "", { shouldValidate: true });
                    form.setValue("localEndereco", "");
                  } else {
                    const h = hospitais.find((x) => String(x.id) === v);
                    form.setValue("local", h?.nome ?? "", { shouldValidate: true });
                    form.setValue("localEndereco", "");
                  }
                }}
              >
                <FormControl>
                  <SelectTrigger className="bg-card border-transparent focus:ring-1 focus:ring-ring rounded-none h-12 text-foreground">
                    <SelectValue placeholder="Selecione o hospital / local" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent className="bg-background border-border text-foreground rounded-none">
                  {hospitais.map((h) => (
                    <SelectItem key={h.id} value={String(h.id)} className="focus:bg-card focus:text-foreground rounded-none">
                      {h.nome}
                    </SelectItem>
                  ))}
                  <SelectItem value={LOCAL_LIVRE} className="focus:bg-card focus:text-foreground rounded-none">
                    Outro (digitar novo local)
                  </SelectItem>
                </SelectContent>
              </Select>
              {livre && (
                <div className="space-y-3 pt-2">
                  <FormField
                    control={form.control}
                    name="local"
                    render={({ field: lf }) => (
                      <FormItem>
                        <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">Nome do local</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Ex: Avant Moema Day Hospital"
                            className="bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 text-foreground"
                            {...lf}
                          />
                        </FormControl>
                        <FormMessage className="font-mono text-xs text-red-400" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="localEndereco"
                    render={({ field: ef }) => (
                      <FormItem>
                        <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">Endereço do local</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Ex: Av. Copacabana, 112, 3º andar — Moema, São Paulo"
                            className="bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 text-foreground"
                            {...ef}
                          />
                        </FormControl>
                        <FormMessage className="font-mono text-xs text-red-400" />
                      </FormItem>
                    )}
                  />
                </div>
              )}
              <FormMessage className="font-mono text-xs text-red-400" />
            </FormItem>
          );
        }}
      />

      <FormField
        control={form.control}
        name="equipeAnestesia"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">Equipe de anestesia</FormLabel>
            <FormControl>
              <Input
                placeholder="Ex: Zenicare"
                className="bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 text-foreground"
                {...field}
              />
            </FormControl>
            <FormMessage className="font-mono text-xs text-red-400" />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="equipeAnestesiaTelefone"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">Telefone da anestesia</FormLabel>
            <FormControl>
              <Input
                placeholder="Ex: (11) 95080-2525"
                className="bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 font-mono text-foreground"
                {...field}
              />
            </FormControl>
            <FormMessage className="font-mono text-xs text-red-400" />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="medicoId"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">Médico responsável</FormLabel>
            <Select
              value={field.value}
              onValueChange={(v) => {
                // O Radix Select dispara um onValueChange("") espúrio logo após o
                // valor controlado mudar (o <option> nativo correspondente ainda
                // não está registrado no <select> oculto no instante da troca), o
                // que zerava o médico salvo. Nenhum item válido tem valor "" —
                // ids e "__personalizado__" são sempre não-vazios — então ignoramos
                // emissões vazias para não desvincular a médica da paciente.
                if (!v) return;
                field.onChange(v);
                if (v !== MEDICO_PERSONALIZADO) {
                  const m = medicos.find((x) => String(x.id) === v);
                  if (m) {
                    form.setValue("medica", m.nome, { shouldValidate: true, shouldDirty: true });
                    form.setValue("crm", m.crm, { shouldDirty: true });
                    form.setValue("rqe", m.rqe, { shouldDirty: true });
                    form.setValue("clinica", m.clinica, { shouldDirty: true });
                  }
                }
              }}
            >
              <FormControl>
                <SelectTrigger className="bg-card border-transparent focus:ring-1 focus:ring-ring rounded-none h-12 text-foreground">
                  <SelectValue placeholder="Selecione o médico" />
                </SelectTrigger>
              </FormControl>
              <SelectContent className="bg-background border-border text-foreground rounded-none">
                {medicos.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)} className="focus:bg-card focus:text-foreground rounded-none">
                    {m.nome}
                    {!m.ativo ? " (inativo)" : m.padrao ? " · padrão" : ""}
                  </SelectItem>
                ))}
                <SelectItem value={MEDICO_PERSONALIZADO} className="focus:bg-card focus:text-foreground rounded-none">
                  Personalizado (preencher manualmente)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground/70 font-light mt-1.5">
              {personalizado
                ? "Os dados abaixo serão usados como estão na página da paciente."
                : "Nome, CRM, RQE e clínica vêm do cadastro do médico (somente leitura)."}
            </p>
            <FormMessage className="font-mono text-xs text-red-400" />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="medica"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">Médica</FormLabel>
            <FormControl>
              <Input placeholder="Ex: Dra. Karla Caetano Lobo" readOnly={!personalizado} className={camposMedicoCls()} {...field} />
            </FormControl>
            <FormMessage className="font-mono text-xs text-red-400" />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="crm"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">CRM</FormLabel>
              <FormControl>
                <Input placeholder="Ex: CRM-SP 123456" readOnly={!personalizado} className={camposMedicoCls("font-mono")} {...field} />
              </FormControl>
              <FormMessage className="font-mono text-xs text-red-400" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="rqe"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">RQE</FormLabel>
              <FormControl>
                <Input placeholder="Ex: RQE 54321" readOnly={!personalizado} className={camposMedicoCls("font-mono")} {...field} />
              </FormControl>
              <FormMessage className="font-mono text-xs text-red-400" />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="clinica"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">Clínica</FormLabel>
            <FormControl>
              <Input placeholder="Ex: KCL" readOnly={!personalizado} className={camposMedicoCls()} {...field} />
            </FormControl>
            <FormMessage className="font-mono text-xs text-red-400" />
          </FormItem>
        )}
      />
    </>
  );
}

export default function ConsolePatient({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data, isLoading, isError, error, refetch, isRefetching } = useObterPaciente(id, { 
    query: { enabled: !!id, queryKey: getObterPacienteQueryKey(id) } 
  });
  // Signatários do contrato ("por quem já foi assinado"). Endpoint JSON fora do
  // contrato OpenAPI (leitura ao vivo na Autentique), por isso via fetch cru.
  const temContratoAutentique = !!data?.paciente.contratoAutentiqueId;
  const {
    data: assinaturasContrato,
    isFetching: carregandoAssinaturas,
    refetch: refetchAssinaturas,
  } = useQuery({
    queryKey: ["contrato-assinaturas", id],
    enabled: !!id && temContratoAutentique,
    queryFn: async (): Promise<{
      disponivel: boolean;
      assinaturas: Array<{
        nome: string | null;
        email: string | null;
        status: "assinado" | "recusado" | "pendente";
        em: string | null;
      }>;
    }> => {
      const resp = await fetch(`/api/pacientes/${id}/contrato/assinaturas`);
      if (!resp.ok) throw new Error("Falha ao carregar assinaturas");
      return resp.json();
    },
  });

  // Gerações do paciente — usadas para o painel de assinaturas POR PARTE (com
  // papéis) de cada tipo. Pegamos a última ENVIADA de contrato e de termo.
  const { data: geracoesPaciente } = useListarContratosGeracao(id, {
    query: { enabled: !!id, queryKey: getListarContratosGeracaoQueryKey(id) },
  });
  const ultimaEnviada = (tipo: "contrato" | "termo") =>
    (geracoesPaciente ?? [])
      .filter((g) => g.tipo === tipo && g.status === "enviado")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  const geracaoContratoEnviada = ultimaEnviada("contrato");
  const geracaoTermoEnviada = ultimaEnviada("termo");

  const { data: vendedoras } = useListarVendedoras();
  const { data: medicosAtivos } = useListarMedicos();
  // Lista à parte (inclui inativos) só para a PRÉVIA resolver foto/logo do médico
  // vinculado mesmo se ele estiver inativo — a página pública faz o mesmo
  // (obterPorId ignora `ativo`). O seletor de médico NÃO usa esta lista, para não
  // oferecer médicos inativos em novas seleções.
  const { data: medicosComFotos } = useListarMedicos({ incluirInativos: true });
  // Lista para o seletor de médico: ativos + o médico atualmente vinculado caso
  // já esteja inativo (para não sumir da seleção desta paciente).
  const medicosEdicao = useMemo<Medico[]>(() => {
    const lista = medicosAtivos ?? [];
    const p = data?.paciente;
    if (p?.medicoId != null && !lista.some((m) => m.id === p.medicoId)) {
      const atual: Medico = {
        id: p.medicoId,
        nome: p.medica,
        crm: p.crm,
        rqe: p.rqe,
        clinica: p.clinica,
        padrao: false,
        ativo: false,
        fotoUrl: null,
        logoUrl: null,
        createdAt: "",
        updatedAt: "",
      };
      return [atual, ...lista];
    }
    return lista;
  }, [medicosAtivos, data?.paciente]);
  const { data: timeline, isLoading: loadingTimeline } = useListarTimeline(id, {
    query: { enabled: !!id, queryKey: getListarTimelineQueryKey(id) },
  });

  const aprovarPaciente = useAprovarPaciente();
  const atualizarPaciente = useAtualizarPaciente();
  const { data: config } = useObterConfig();
  const { data: historico, isLoading: loadingHistorico } = useListarHistoricoPaciente(id, {
    query: { enabled: !!id, queryKey: getListarHistoricoPacienteQueryKey(id) }
  });
  const { data: conteudo, isLoading: loadingConteudo } = useObterConteudoPaciente(id, {
    query: { enabled: !!id, queryKey: getObterConteudoPacienteQueryKey(id) }
  });
  const atualizarConteudo = useAtualizarConteudoPaciente();
  const removerConteudo = useRemoverConteudoPaciente();

  const arquivarPaciente = useArquivarPaciente();
  const restaurarPaciente = useRestaurarPaciente();
  const adicionarNota = useAdicionarNota();

  const { data: atividade, isLoading: loadingAtividade } = useObterAtividadePaciente(id, {
    query: { enabled: !!id, queryKey: getObterAtividadePacienteQueryKey(id) }
  });

  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  // Split-view: em telas estreitas alterna entre a página (prévia) e as edições;
  // em telas largas os dois lados aparecem juntos. `abaAtiva` controla qual grupo
  // de ações está visível no painel direito.
  const [painelMovel, setPainelMovel] = useState<"pagina" | "edicoes">("edicoes");
  const [abaAtiva, setAbaAtiva] = useState("dados");
  const [contratoLinkInput, setContratoLinkInput] = useState("");
  const [linkManualInput, setLinkManualInput] = useState("");
  const [prazoOverrideInput, setPrazoOverrideInput] = useState("");
  const [contratoBaixando, setContratoBaixando] = useState<null | "abrir" | "baixar">(null);
  const [termoLinkInput, setTermoLinkInput] = useState("");
  const [linkTermoManualInput, setLinkTermoManualInput] = useState("");
  const [prazoTermoOverrideInput, setPrazoTermoOverrideInput] = useState("");
  const [termoBaixando, setTermoBaixando] = useState<null | "abrir" | "baixar">(null);

  async function acessarContrato(modo: "abrir" | "baixar") {
    setContratoBaixando(modo);
    // Abre uma aba em branco de forma síncrona para não esbarrar no bloqueio de
    // pop-up (o fetch é assíncrono e perderia o gesto do usuário).
    const janela = modo === "abrir" ? window.open("", "_blank") : null;
    try {
      const url = `/api/pacientes/${id}/contrato/download${modo === "baixar" ? "?download=1" : ""}`;
      const resp = await fetch(url, { headers: { accept: "application/pdf" } });
      if (!resp.ok) {
        // Lança um ApiError para que o tratamento de erro (catch) consiga
        // distinguir uma falha de conexão (status 0/502/503/504) de uma
        // indisponibilidade real do contrato, via `toastErroAcao`.
        throw new ApiError(resp, null, { method: "GET", url });
      }
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      if (modo === "abrir") {
        if (janela) janela.location.href = blobUrl;
        else window.open(blobUrl, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `contrato-${data?.paciente.nome ?? "assinado"}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (error) {
      janela?.close();
      toast(
        toastErroAcao(error, {
          title: "Contrato indisponível no momento",
          description: "Não foi possível abrir o documento assinado. Tente novamente em instantes.",
        }),
      );
    } finally {
      setContratoBaixando(null);
    }
  }

  const [conteudoSecoes, setConteudoSecoes] = useState<SecaoConteudo[] | null>(null);
  const [editandoConteudo, setEditandoConteudo] = useState(false);
  const [descartarAberto, setDescartarAberto] = useState(false);
  const acaoPendente = useRef<() => void>(() => {});

  useEffect(() => {
    if (conteudo && conteudoSecoes === null) setConteudoSecoes(conteudo.secoes);
  }, [conteudo, conteudoSecoes]);

  const conteudoDirty =
    editandoConteudo &&
    conteudoSecoes !== null &&
    !!conteudo &&
    JSON.stringify(conteudoSecoes) !== JSON.stringify(conteudo.secoes);

  // Navegação para fora da paciente: confirma o descarte se houver edições de
  // dados OU de conteúdo não salvas (o guarda do botão Voltar usa a mesma regra).
  function tentarSair(acao: () => void) {
    if (conteudoDirty || edicaoDadosDirty) {
      acaoPendente.current = acao;
      setDescartarAberto(true);
    } else {
      acao();
    }
  }

  function tentarDescartar(acao: () => void) {
    if (conteudoDirty) {
      acaoPendente.current = acao;
      setDescartarAberto(true);
    } else {
      acao();
    }
  }

  function salvarConteudoPaciente() {
    if (!conteudoSecoes) return;
    atualizarConteudo.mutate(
      { id, data: { secoes: conteudoSecoes } },
      {
        onSuccess: (res) => {
          setConteudoSecoes(res.secoes);
          setEditandoConteudo(false);
          queryClient.invalidateQueries({ queryKey: getObterConteudoPacienteQueryKey(id) });
          toast({
            title: "Conteúdo personalizado salvo",
            description: "Esta paciente verá esta versão na página dela.",
          });
        },
        onError: (error) => {
          toast(
            toastErroAcao(error, {
              title: "Não foi possível salvar",
              description: "Tente novamente em instantes.",
            }),
          );
        },
      }
    );
  }

  function reverterConteudoPaciente() {
    removerConteudo.mutate(
      { id },
      {
        onSuccess: (res) => {
          setConteudoSecoes(res.secoes);
          setEditandoConteudo(false);
          queryClient.invalidateQueries({ queryKey: getObterConteudoPacienteQueryKey(id) });
          toast({
            title: "Conteúdo revertido ao padrão",
            description: "A personalização desta paciente foi removida.",
          });
        },
        onError: (error) => {
          toast(
            toastErroAcao(error, {
              title: "Não foi possível reverter",
              description: "Tente novamente em instantes.",
            }),
          );
        },
      }
    );
  }

  useEffect(() => {
    setContratoLinkInput(data?.paciente.contratoAutentiqueId ?? "");
  }, [data?.paciente.contratoAutentiqueId]);

  useEffect(() => {
    setLinkManualInput(data?.paciente.contratoLinkAssinaturaManual ?? "");
  }, [data?.paciente.contratoLinkAssinaturaManual]);

  useEffect(() => {
    setPrazoOverrideInput(data?.paciente.contratoPrazoOverride ?? "");
  }, [data?.paciente.contratoPrazoOverride]);

  useEffect(() => {
    setTermoLinkInput(data?.paciente.termoAutentiqueId ?? "");
  }, [data?.paciente.termoAutentiqueId]);

  useEffect(() => {
    setLinkTermoManualInput(data?.paciente.termoLinkAssinaturaManual ?? "");
  }, [data?.paciente.termoLinkAssinaturaManual]);

  useEffect(() => {
    setPrazoTermoOverrideInput(data?.paciente.termoPrazoOverride ?? "");
  }, [data?.paciente.termoPrazoOverride]);

  async function acessarTermo(modo: "abrir" | "baixar") {
    setTermoBaixando(modo);
    const janela = modo === "abrir" ? window.open("", "_blank") : null;
    try {
      const url = `/api/pacientes/${id}/termo/download${modo === "baixar" ? "?download=1" : ""}`;
      const resp = await fetch(url, { headers: { accept: "application/pdf" } });
      if (!resp.ok) {
        throw new ApiError(resp, null, { method: "GET", url });
      }
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      if (modo === "abrir") {
        if (janela) janela.location.href = blobUrl;
        else window.open(blobUrl, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `termo-consentimento-${data?.paciente.nome ?? "assinado"}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (error) {
      janela?.close();
      toast(
        toastErroAcao(error, {
          title: "Termo indisponível no momento",
          description: "Não foi possível abrir o documento assinado. Tente novamente em instantes.",
        }),
      );
    } finally {
      setTermoBaixando(null);
    }
  }

  function mutarCamposContrato(patch: PacienteUpdate, mensagem: string) {
    atualizarPaciente.mutate(
      { id, data: patch },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getObterPacienteQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListarPacientesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getResumoPacientesQueryKey() });
          toast({ title: mensagem });
        },
        onError: (error) => {
          toast(
            toastErroAcao(error, {
              title: "Não foi possível salvar o contrato",
              description: "Tente novamente em instantes.",
            }),
          );
        },
      }
    );
  }

  function mutarContrato(link: string | null, mensagem: string) {
    mutarCamposContrato({ contratoLink: link }, mensagem);
  }

  function mutarCamposTermo(patch: PacienteUpdate, mensagem: string) {
    atualizarPaciente.mutate(
      { id, data: patch },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getObterPacienteQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListarPacientesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getResumoPacientesQueryKey() });
          toast({ title: mensagem });
        },
        onError: (error) => {
          toast(
            toastErroAcao(error, {
              title: "Não foi possível salvar o termo",
              description: "Tente novamente em instantes.",
            }),
          );
        },
      }
    );
  }

  function mutarTermo(link: string | null, mensagem: string) {
    mutarCamposTermo({ termoLink: link }, mensagem);
  }

  const TIPO_PDF = "application/pdf";
  const TAMANHO_MAXIMO_DOC = 20 * 1024 * 1024;
  const documentosQuery = useListarDocumentos(id);
  const documentos = (documentosQuery.data ?? []) as DocumentoPaciente[];
  const registrarDocumento = useRegistrarDocumento();
  const removerDocumento = useRemoverDocumento();
  const { uploadFile } = useUpload();
  const documentoInputRef = useRef<HTMLInputElement>(null);
  const [enviandoDocumento, setEnviandoDocumento] = useState(false);
  const [documentoAcao, setDocumentoAcao] = useState<string | null>(null);
  const [removendoDocumento, setRemovendoDocumento] = useState<number | null>(null);

  function formatarTamanho(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function enviarDocumento(file: File) {
    if (file.type !== TIPO_PDF) {
      toast({
        title: "Formato não aceito",
        description: "Envie apenas arquivos PDF.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > TAMANHO_MAXIMO_DOC) {
      toast({
        title: "Arquivo muito grande",
        description: "O limite é de 20 MB por documento.",
        variant: "destructive",
      });
      return;
    }
    setEnviandoDocumento(true);
    try {
      const enviado = await uploadFile(file);
      if (!enviado) throw new Error("Falha no envio do arquivo.");
      await new Promise<void>((resolve, reject) => {
        registrarDocumento.mutate(
          {
            id,
            data: {
              objectPath: enviado.objectPath,
              rotulo: file.name.replace(/\.pdf$/i, ""),
              nomeArquivo: file.name,
              contentType: TIPO_PDF,
              tamanho: file.size,
            },
          },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getListarDocumentosQueryKey(id) });
              queryClient.invalidateQueries({ queryKey: getObterPacienteQueryKey(id) });
              queryClient.invalidateQueries({ queryKey: getListarTimelineQueryKey(id) });
              queryClient.invalidateQueries({ queryKey: getListarHistoricoPacienteQueryKey(id) });
              toast({ title: "Documento anexado", description: file.name });
              resolve();
            },
            onError: (error) => reject(error),
          },
        );
      });
    } catch (error) {
      toast(
        toastErroAcao(error, {
          title: "Não foi possível anexar o documento",
          description: "Tente novamente em instantes.",
        }),
      );
    } finally {
      setEnviandoDocumento(false);
      if (documentoInputRef.current) documentoInputRef.current.value = "";
    }
  }

  async function acessarDocumento(doc: DocumentoPaciente, modo: "abrir" | "baixar") {
    setDocumentoAcao(`${doc.id}:${modo}`);
    const janela = modo === "abrir" ? window.open("", "_blank") : null;
    try {
      const url = `/api/pacientes/${id}/documentos/${doc.id}/download${modo === "baixar" ? "?download=1" : ""}`;
      const resp = await fetch(url, { headers: { accept: "application/pdf" } });
      if (!resp.ok) throw new ApiError(resp, null, { method: "GET", url });
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      if (modo === "abrir") {
        if (janela) janela.location.href = blobUrl;
        else window.open(blobUrl, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = doc.nomeArquivo;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (error) {
      janela?.close();
      toast(
        toastErroAcao(error, {
          title: "Documento indisponível no momento",
          description: "Não foi possível abrir o arquivo. Tente novamente em instantes.",
        }),
      );
    } finally {
      setDocumentoAcao(null);
    }
  }

  function excluirDocumento(doc: DocumentoPaciente) {
    setRemovendoDocumento(doc.id);
    removerDocumento.mutate(
      { id, documentoId: doc.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListarDocumentosQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getObterPacienteQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListarTimelineQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListarHistoricoPacienteQueryKey(id) });
          toast({ title: "Documento removido" });
        },
        onError: (error) => {
          toast(
            toastErroAcao(error, {
              title: "Não foi possível remover",
              description: "Tente novamente em instantes.",
            }),
          );
        },
        onSettled: () => setRemovendoDocumento(null),
      },
    );
  }

  // ----- Pedido de exames (PDF, um por paciente) -----
  const pedidoExamesQuery = useObterPedidoExames(id);
  const pedidoExames = pedidoExamesQuery.data?.pedidoExames ?? null;
  const removerPedidoExames = useRemoverPedidoExames();
  const pedidoExamesInputRef = useRef<HTMLInputElement>(null);
  const [enviandoPedidoExames, setEnviandoPedidoExames] = useState(false);
  const [pedidoExamesAcao, setPedidoExamesAcao] = useState<"abrir" | "baixar" | null>(null);
  const [removendoPedidoExames, setRemovendoPedidoExames] = useState(false);

  async function enviarPedidoExames(file: File) {
    if (file.type !== TIPO_PDF) {
      toast({
        title: "Formato não aceito",
        description: "Envie apenas arquivos PDF.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > TAMANHO_MAXIMO_DOC) {
      toast({
        title: "Arquivo muito grande",
        description: "O limite é de 20 MB.",
        variant: "destructive",
      });
      return;
    }
    setEnviandoPedidoExames(true);
    try {
      // Upload multipart direto (bucket próprio de pedidos de exames).
      const form = new FormData();
      form.append("arquivo", file, file.name);
      const url = `/api/pacientes/${id}/pedido-exames`;
      const resp = await fetch(url, { method: "POST", body: form });
      if (!resp.ok) throw new ApiError(resp, null, { method: "POST", url });
      queryClient.invalidateQueries({ queryKey: getObterPedidoExamesQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListarTimelineQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListarHistoricoPacienteQueryKey(id) });
      toast({ title: "Pedido de exames anexado", description: file.name });
    } catch (error) {
      toast(
        toastErroAcao(error, {
          title: "Não foi possível anexar o pedido de exames",
          description: "Tente novamente em instantes.",
        }),
      );
    } finally {
      setEnviandoPedidoExames(false);
      if (pedidoExamesInputRef.current) pedidoExamesInputRef.current.value = "";
    }
  }

  async function acessarPedidoExames(modo: "abrir" | "baixar") {
    if (!pedidoExames) return;
    setPedidoExamesAcao(modo);
    const janela = modo === "abrir" ? window.open("", "_blank") : null;
    try {
      const url = `/api/pacientes/${id}/pedido-exames/download${modo === "baixar" ? "?download=1" : ""}`;
      const resp = await fetch(url, { headers: { accept: "application/pdf" } });
      if (!resp.ok) throw new ApiError(resp, null, { method: "GET", url });
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      if (modo === "abrir") {
        if (janela) janela.location.href = blobUrl;
        else window.open(blobUrl, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = pedidoExames.nomeArquivo;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (error) {
      janela?.close();
      toast(
        toastErroAcao(error, {
          title: "Pedido de exames indisponível no momento",
          description: "Não foi possível abrir o arquivo. Tente novamente em instantes.",
        }),
      );
    } finally {
      setPedidoExamesAcao(null);
    }
  }

  function excluirPedidoExames() {
    setRemovendoPedidoExames(true);
    removerPedidoExames.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getObterPedidoExamesQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListarTimelineQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListarHistoricoPacienteQueryKey(id) });
          toast({ title: "Pedido de exames removido" });
        },
        onError: (error) => {
          toast(
            toastErroAcao(error, {
              title: "Não foi possível remover",
              description: "Tente novamente em instantes.",
            }),
          );
        },
        onSettled: () => setRemovendoPedidoExames(false),
      },
    );
  }

  // Upload do PDF de pedido de exames (dado por paciente). Renderizado DENTRO do
  // bloco da seção "Exames Pré-Operatórios" no editor (via `slotPreparo`), logo
  // após a lista de exames — junto do conteúdo a que pertence.
  const uploadPedidoExamesUI = (
    <div className="space-y-3">
      <input
        ref={pedidoExamesInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void enviarPedidoExames(file);
        }}
      />
      {pedidoExamesQuery.isLoading ? (
        <Skeleton className="h-14 w-full bg-background rounded-none" />
      ) : pedidoExames ? (
        <div className="flex items-center justify-between gap-4 p-3 flex-wrap bg-background border border-border">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="w-5 h-5 text-accent shrink-0" strokeWidth={1.5} />
            <div className="min-w-0">
              <p className="text-sm text-foreground font-medium truncate">{pedidoExames.nomeArquivo}</p>
              <p className="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-wider truncate">
                {formatarTamanho(pedidoExames.tamanho)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => acessarPedidoExames("abrir")}
              disabled={pedidoExamesAcao !== null}
              className="h-8 px-3 rounded-none bg-transparent border border-border hover:bg-card text-muted-foreground hover:text-foreground"
            >
              <Eye className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
              <span className="font-expanded text-[9px] uppercase tracking-widest">
                {pedidoExamesAcao === "abrir" ? "Abrindo" : "Abrir"}
              </span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => acessarPedidoExames("baixar")}
              disabled={pedidoExamesAcao !== null}
              className="h-8 px-3 rounded-none bg-transparent border border-border hover:bg-card text-muted-foreground hover:text-foreground"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
              <span className="font-expanded text-[9px] uppercase tracking-widest">
                {pedidoExamesAcao === "baixar" ? "Baixando" : "Baixar"}
              </span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => pedidoExamesInputRef.current?.click()}
              disabled={enviandoPedidoExames}
              className="h-8 px-3 rounded-none bg-transparent border border-border hover:bg-card text-muted-foreground hover:text-foreground"
            >
              <UploadCloud className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
              <span className="font-expanded text-[9px] uppercase tracking-widest">
                {enviandoPedidoExames ? "Enviando" : "Trocar"}
              </span>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={removendoPedidoExames}
                  className="h-8 px-3 rounded-none bg-transparent border border-border hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-none">
                <AlertDialogHeader>
                  <AlertDialogTitle>Remover o pedido de exames?</AlertDialogTitle>
                  <AlertDialogDescription>
                    O PDF deixará de aparecer na página da paciente. Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-none">Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={excluirPedidoExames}
                    className="rounded-none bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  >
                    Remover
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4 flex-wrap border border-dashed border-border p-3">
          <p className="text-sm text-muted-foreground font-light">
            Nenhum pedido de exames anexado. Apenas PDF, até 20 MB.
          </p>
          <Button
            onClick={() => pedidoExamesInputRef.current?.click()}
            disabled={enviandoPedidoExames}
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-9 px-4 font-medium shrink-0"
          >
            <UploadCloud className="w-4 h-4 mr-2" strokeWidth={1.5} />
            {enviandoPedidoExames ? "Enviando..." : "Anexar PDF"}
          </Button>
        </div>
      )}
    </div>
  );

  // ----- Receita de preparo da pele (PDF, uma por paciente) -----
  const receitaQuery = useObterReceitaPreparoPele(id);
  const receita = receitaQuery.data?.receitaPreparoPele ?? null;
  const removerReceita = useRemoverReceitaPreparoPele();
  const receitaInputRef = useRef<HTMLInputElement>(null);
  const [enviandoReceita, setEnviandoReceita] = useState(false);
  const [receitaAcao, setReceitaAcao] = useState<"abrir" | "baixar" | null>(null);
  const [removendoReceita, setRemovendoReceita] = useState(false);

  async function enviarReceita(file: File) {
    if (file.type !== TIPO_PDF) {
      toast({ title: "Formato não aceito", description: "Envie apenas arquivos PDF.", variant: "destructive" });
      return;
    }
    if (file.size > TAMANHO_MAXIMO_DOC) {
      toast({ title: "Arquivo muito grande", description: "O limite é de 20 MB.", variant: "destructive" });
      return;
    }
    setEnviandoReceita(true);
    try {
      const form = new FormData();
      form.append("arquivo", file, file.name);
      const url = `/api/pacientes/${id}/receita-preparo-pele`;
      const resp = await fetch(url, { method: "POST", body: form });
      if (!resp.ok) throw new ApiError(resp, null, { method: "POST", url });
      queryClient.invalidateQueries({ queryKey: getObterReceitaPreparoPeleQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListarTimelineQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListarHistoricoPacienteQueryKey(id) });
      toast({ title: "Receita anexada", description: file.name });
    } catch (error) {
      toast(
        toastErroAcao(error, {
          title: "Não foi possível anexar a receita",
          description: "Tente novamente em instantes.",
        }),
      );
    } finally {
      setEnviandoReceita(false);
      if (receitaInputRef.current) receitaInputRef.current.value = "";
    }
  }

  async function acessarReceita(modo: "abrir" | "baixar") {
    if (!receita) return;
    setReceitaAcao(modo);
    const janela = modo === "abrir" ? window.open("", "_blank") : null;
    try {
      const url = `/api/pacientes/${id}/receita-preparo-pele/download${modo === "baixar" ? "?download=1" : ""}`;
      const resp = await fetch(url, { headers: { accept: "application/pdf" } });
      if (!resp.ok) throw new ApiError(resp, null, { method: "GET", url });
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      if (modo === "abrir") {
        if (janela) janela.location.href = blobUrl;
        else window.open(blobUrl, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = receita.nomeArquivo;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (error) {
      janela?.close();
      toast(
        toastErroAcao(error, {
          title: "Receita indisponível no momento",
          description: "Não foi possível abrir o arquivo. Tente novamente em instantes.",
        }),
      );
    } finally {
      setReceitaAcao(null);
    }
  }

  function excluirReceita() {
    setRemovendoReceita(true);
    removerReceita.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getObterReceitaPreparoPeleQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListarTimelineQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListarHistoricoPacienteQueryKey(id) });
          toast({ title: "Receita removida" });
        },
        onError: (error) => {
          toast(
            toastErroAcao(error, {
              title: "Não foi possível remover",
              description: "Tente novamente em instantes.",
            }),
          );
        },
        onSettled: () => setRemovendoReceita(false),
      },
    );
  }

  // Upload do PDF da receita (dado por paciente). Renderizado DENTRO do bloco da
  // seção "Preparo da Pele" no editor (via `slotPreparoPele`), após os produtos.
  const uploadReceitaUI = (
    <div className="space-y-3">
      <input
        ref={receitaInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void enviarReceita(file);
        }}
      />
      {receitaQuery.isLoading ? (
        <Skeleton className="h-14 w-full bg-background rounded-none" />
      ) : receita ? (
        <div className="flex items-center justify-between gap-4 p-3 flex-wrap bg-background border border-border">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="w-5 h-5 text-accent shrink-0" strokeWidth={1.5} />
            <div className="min-w-0">
              <p className="text-sm text-foreground font-medium truncate">{receita.nomeArquivo}</p>
              <p className="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-wider truncate">
                {formatarTamanho(receita.tamanho)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => acessarReceita("abrir")}
              disabled={receitaAcao !== null}
              className="h-8 px-3 rounded-none bg-transparent border border-border hover:bg-card text-muted-foreground hover:text-foreground"
            >
              <Eye className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
              <span className="font-expanded text-[9px] uppercase tracking-widest">
                {receitaAcao === "abrir" ? "Abrindo" : "Abrir"}
              </span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => acessarReceita("baixar")}
              disabled={receitaAcao !== null}
              className="h-8 px-3 rounded-none bg-transparent border border-border hover:bg-card text-muted-foreground hover:text-foreground"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
              <span className="font-expanded text-[9px] uppercase tracking-widest">
                {receitaAcao === "baixar" ? "Baixando" : "Baixar"}
              </span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => receitaInputRef.current?.click()}
              disabled={enviandoReceita}
              className="h-8 px-3 rounded-none bg-transparent border border-border hover:bg-card text-muted-foreground hover:text-foreground"
            >
              <UploadCloud className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
              <span className="font-expanded text-[9px] uppercase tracking-widest">
                {enviandoReceita ? "Enviando" : "Trocar"}
              </span>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={removendoReceita}
                  className="h-8 px-3 rounded-none bg-transparent border border-border hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-none">
                <AlertDialogHeader>
                  <AlertDialogTitle>Remover a receita?</AlertDialogTitle>
                  <AlertDialogDescription>
                    O PDF deixará de aparecer na página da paciente. Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-none">Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={excluirReceita}
                    className="rounded-none bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  >
                    Remover
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4 flex-wrap border border-dashed border-border p-3">
          <p className="text-sm text-muted-foreground font-light">
            Nenhuma receita anexada. Apenas PDF, até 20 MB.
          </p>
          <Button
            onClick={() => receitaInputRef.current?.click()}
            disabled={enviandoReceita}
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-9 px-4 font-medium shrink-0"
          >
            <UploadCloud className="w-4 h-4 mr-2" strokeWidth={1.5} />
            {enviandoReceita ? "Enviando..." : "Anexar PDF"}
          </Button>
        </div>
      )}
    </div>
  );

  // ----- Receituário pós-operatório (PDF, um por paciente) -----
  const receituarioQuery = useObterReceituarioPosop(id);
  const receituario = receituarioQuery.data?.receituarioPosop ?? null;
  const removerReceituario = useRemoverReceituarioPosop();
  const receituarioInputRef = useRef<HTMLInputElement>(null);
  const [enviandoReceituario, setEnviandoReceituario] = useState(false);
  const [receituarioAcao, setReceituarioAcao] = useState<"abrir" | "baixar" | null>(null);
  const [removendoReceituario, setRemovendoReceituario] = useState(false);

  async function enviarReceituario(file: File) {
    if (file.type !== TIPO_PDF) {
      toast({ title: "Formato não aceito", description: "Envie apenas arquivos PDF.", variant: "destructive" });
      return;
    }
    if (file.size > TAMANHO_MAXIMO_DOC) {
      toast({ title: "Arquivo muito grande", description: "O limite é de 20 MB.", variant: "destructive" });
      return;
    }
    setEnviandoReceituario(true);
    try {
      const form = new FormData();
      form.append("arquivo", file, file.name);
      const url = `/api/pacientes/${id}/receituario-posop`;
      const resp = await fetch(url, { method: "POST", body: form });
      if (!resp.ok) throw new ApiError(resp, null, { method: "POST", url });
      queryClient.invalidateQueries({ queryKey: getObterReceituarioPosopQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListarTimelineQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListarHistoricoPacienteQueryKey(id) });
      toast({ title: "Receituário anexado", description: file.name });
    } catch (error) {
      toast(
        toastErroAcao(error, {
          title: "Não foi possível anexar o receituário",
          description: "Tente novamente em instantes.",
        }),
      );
    } finally {
      setEnviandoReceituario(false);
      if (receituarioInputRef.current) receituarioInputRef.current.value = "";
    }
  }

  async function acessarReceituario(modo: "abrir" | "baixar") {
    if (!receituario) return;
    setReceituarioAcao(modo);
    const janela = modo === "abrir" ? window.open("", "_blank") : null;
    try {
      const url = `/api/pacientes/${id}/receituario-posop/download${modo === "baixar" ? "?download=1" : ""}`;
      const resp = await fetch(url, { headers: { accept: "application/pdf" } });
      if (!resp.ok) throw new ApiError(resp, null, { method: "GET", url });
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      if (modo === "abrir") {
        if (janela) janela.location.href = blobUrl;
        else window.open(blobUrl, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = receituario.nomeArquivo;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (error) {
      janela?.close();
      toast(
        toastErroAcao(error, {
          title: "Receituário indisponível no momento",
          description: "Não foi possível abrir o arquivo. Tente novamente em instantes.",
        }),
      );
    } finally {
      setReceituarioAcao(null);
    }
  }

  function excluirReceituario() {
    setRemovendoReceituario(true);
    removerReceituario.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getObterReceituarioPosopQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListarTimelineQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListarHistoricoPacienteQueryKey(id) });
          toast({ title: "Receituário removido" });
        },
        onError: (error) => {
          toast(
            toastErroAcao(error, {
              title: "Não foi possível remover",
              description: "Tente novamente em instantes.",
            }),
          );
        },
        onSettled: () => setRemovendoReceituario(false),
      },
    );
  }

  // Upload do PDF do receituário (dado por paciente). Renderizado DENTRO do bloco
  // da seção "Receituário Pós-Operatório" no editor (via `slotReceituario`).
  const uploadReceituarioUI = (
    <div className="space-y-3">
      <input
        ref={receituarioInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void enviarReceituario(file);
        }}
      />
      {receituarioQuery.isLoading ? (
        <Skeleton className="h-14 w-full bg-background rounded-none" />
      ) : receituario ? (
        <div className="flex items-center justify-between gap-4 p-3 flex-wrap bg-background border border-border">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="w-5 h-5 text-accent shrink-0" strokeWidth={1.5} />
            <div className="min-w-0">
              <p className="text-sm text-foreground font-medium truncate">{receituario.nomeArquivo}</p>
              <p className="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-wider truncate">
                {formatarTamanho(receituario.tamanho)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => acessarReceituario("abrir")}
              disabled={receituarioAcao !== null}
              className="h-8 px-3 rounded-none bg-transparent border border-border hover:bg-card text-muted-foreground hover:text-foreground"
            >
              <Eye className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
              <span className="font-expanded text-[9px] uppercase tracking-widest">
                {receituarioAcao === "abrir" ? "Abrindo" : "Abrir"}
              </span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => acessarReceituario("baixar")}
              disabled={receituarioAcao !== null}
              className="h-8 px-3 rounded-none bg-transparent border border-border hover:bg-card text-muted-foreground hover:text-foreground"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
              <span className="font-expanded text-[9px] uppercase tracking-widest">
                {receituarioAcao === "baixar" ? "Baixando" : "Baixar"}
              </span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => receituarioInputRef.current?.click()}
              disabled={enviandoReceituario}
              className="h-8 px-3 rounded-none bg-transparent border border-border hover:bg-card text-muted-foreground hover:text-foreground"
            >
              <UploadCloud className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
              <span className="font-expanded text-[9px] uppercase tracking-widest">
                {enviandoReceituario ? "Enviando" : "Trocar"}
              </span>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={removendoReceituario}
                  className="h-8 px-3 rounded-none bg-transparent border border-border hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-none">
                <AlertDialogHeader>
                  <AlertDialogTitle>Remover o receituário?</AlertDialogTitle>
                  <AlertDialogDescription>
                    O PDF deixará de aparecer na página da paciente. Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-none">Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={excluirReceituario}
                    className="rounded-none bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  >
                    Remover
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4 flex-wrap border border-dashed border-border p-3">
          <p className="text-sm text-muted-foreground font-light">
            Nenhum receituário anexado. Apenas PDF, até 20 MB.
          </p>
          <Button
            onClick={() => receituarioInputRef.current?.click()}
            disabled={enviandoReceituario}
            className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-9 px-4 font-medium shrink-0"
          >
            <UploadCloud className="w-4 h-4 mr-2" strokeWidth={1.5} />
            {enviandoReceituario ? "Enviando..." : "Anexar PDF"}
          </Button>
        </div>
      )}
    </div>
  );

  const [notaTitulo, setNotaTitulo] = useState("");
  const [notaDescricao, setNotaDescricao] = useState("");

  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      nome: "",
      cpf: "",
      telefone: "",
      email: "",
      twentyContactId: "",
      rg: "",
      nascimento: "",
      endereco: "",
      procedimentos: [],
      dataCirurgia: "",
      horario: "06:00",
      valorSinal: 0,
      valorPendente: 0,
      dataPagamentoPendente: "",
      laser: false,
      local: "",
      localEndereco: "",
      equipeAnestesia: "",
      equipeAnestesiaTelefone: "",
      medicoId: MEDICO_PERSONALIZADO,
      medica: "",
      crm: "",
      rqe: "",
      clinica: "",
    },
  });

  // Inicializa o formulário com os dados da paciente assim que carregam, para
  // que a edição (no painel lateral) já apareça preenchida. `formPronto` também
  // distingue "ainda carregando" de "pronto para editar" na prévia ao vivo.
  const [formPronto, setFormPronto] = useState(false);
  // Só inicializamos o formulário DEPOIS que as opções dos seletores chegam
  // (`config.hospitais` para o hospital e `medicosAtivos` para o médico). O
  // `<Select>` do Radix só consegue exibir o valor salvo se o `<SelectItem>`
  // correspondente já estiver montado no momento em que `value` é definido —
  // se resetássemos antes das opções carregarem, o gatilho ficaria preso no
  // placeholder "Selecione…" mesmo com hospital/médico já gravados na paciente.
  useEffect(() => {
    if (data && config && medicosAtivos && !formPronto) {
      setFormPronto(true);
      form.reset(valoresDaPaciente(data.paciente));
    }
  }, [data, config, medicosAtivos, formPronto, form]);

  // O formulário fica sempre montado no painel; qualquer alteração não salva
  // arma o guarda de descarte (navegação interna + botão Voltar do navegador).
  const edicaoDadosDirty = formPronto && form.formState.isDirty;

  useUnsavedChanges(conteudoDirty || edicaoDadosDirty, () => {
    acaoPendente.current = () => setLocation("/");
    setDescartarAberto(true);
  });

  // Prévia ao vivo: enquanto o formulário não está pronto, mostra os dados
  // salvos da paciente; depois, reflete em tempo real os campos editáveis que
  // estão sendo digitados, resolvendo hospital/equipe/telefone pela /config —
  // os mesmos valores que a página real da paciente exibe. Esse mesmo objeto
  // alimenta a prévia e a substituição de variáveis do editor de seções.
  const valoresEdit = form.watch();
  const dadosPreview = useMemo<DadosPreview>(() => {
    const p = data?.paciente;
    if (!p) return DADOS_PREVIEW_EXEMPLO;
    // O seletor de hospital do formulário, assim como o de médico, nem sempre
    // reflete o valor salvo (pode ficar vazio). Uma seleção explícita tem
    // prioridade, mas caímos no `local` salvo da paciente quando ela falta —
    // assim a prévia mostra o mesmo hospital/endereço que a página pública.
    const localChave = (formPronto && valoresEdit.local) || p.local;
    // Hospital e endereço são texto livre: a prévia mostra exatamente o que foi
    // digitado (espelha o backend `perfilLocalDoPaciente`). O `camposLocaisDeConfig`
    // abaixo ainda resolve equipe/instruções de chegada por chave conhecida.
    const localEnd = (
      (formPronto ? (valoresEdit.localEndereco ?? "") : (p.localEndereco ?? "")) || ""
    ).trim();
    // O mapeamento config → campos de hospital/equipe vive na fonte única
    // (`camposLocaisDeConfig`), partilhada com o app móvel e exercitada pelo
    // teste de equivalência do api-server — a prévia lê os mesmos valores que a
    // página pública (nome do hospital, "Nome — Endereço", telefone, chegada).
    const locais = camposLocaisDeConfig(
      {
        localChave,
        equipeNome: (formPronto && valoresEdit.equipeAnestesia) || p.equipeAnestesia,
        equipeTelefone:
          (formPronto
            ? (valoresEdit.equipeAnestesiaTelefone ?? "")
            : (p.equipeAnestesiaTelefone ?? "")) || "",
        instrucoesChegadaPadrao: DADOS_PREVIEW_EXEMPLO.instrucoesChegada,
      },
      config,
    );
    // Foto e logo vêm do cadastro da médica (não são campos do formulário); a
    // página pública resolve as mesmas URLs assinadas a partir do médico ligado
    // à paciente. O seletor de médico do formulário nem sempre reflete o médico
    // salvo (pode ficar vazio); então uma seleção explícita no formulário tem
    // prioridade, mas caímos no médico vinculado à paciente quando ela falta —
    // assim a prévia mostra a mesma foto/logo que a página pública.
    const medicoIdForm = formPronto ? valoresEdit.medicoId : "";
    const medicoIdSel =
      medicoIdForm ||
      (p.medicoId != null ? String(p.medicoId) : MEDICO_PERSONALIZADO);
    const medicoRec =
      medicoIdSel && medicoIdSel !== MEDICO_PERSONALIZADO
        ? (medicosComFotos ?? medicosEdicao).find(
            (m) => String(m.id) === medicoIdSel,
          )
        : undefined;
    return {
      nome: (formPronto ? valoresEdit.nome?.trim() : p.nome) || p.nome,
      dataCirurgia: (formPronto && valoresEdit.dataCirurgia) || p.dataCirurgia,
      horario: (formPronto && valoresEdit.horario) || p.horario,
      hospital: localChave,
      local: localEnd ? `${localChave} — ${localEnd}` : localChave,
      medica: (formPronto ? valoresEdit.medica : p.medica) || p.medica,
      equipe: locais.equipe,
      equipeTelefone: locais.equipeTelefone,
      instrucoesChegada: locais.instrucoesChegada,
      // Valores financeiros: refletem o form ao vivo quando pronto (a paciente
      // verá o mesmo `{{valorReserva}}`/`{{statusHonorarios}}` que a página pública).
      valorPago: formPronto ? (valoresEdit.valorSinal ?? p.valorSinal) : p.valorSinal,
      valorPendente: formPronto ? (valoresEdit.valorPendente ?? p.valorPendente) : p.valorPendente,
      dataPagamentoPendente: formPronto
        ? valoresEdit.dataPagamentoPendente || null
        : p.dataPagamentoPendente,
      procedimentos: formPronto ? (valoresEdit.procedimentos ?? p.procedimentos) : p.procedimentos,
      crm: (formPronto ? valoresEdit.crm : p.crm) || p.crm,
      rqe: (formPronto ? valoresEdit.rqe : p.rqe) || p.rqe,
      clinica: (formPronto ? valoresEdit.clinica : p.clinica) || p.clinica,
      medicoFotoUrl: medicoRec?.fotoUrl ?? null,
      medicoLogoUrl: medicoRec?.logoUrl ?? null,
      // Estado real do bloco "Agora", lido do registro salvo da paciente. Contrato
      // e termo não são campos do formulário (têm fluxo próprio), então vêm sempre
      // de `p`. O pagamento é editável, então reflete os valores ao vivo do form
      // quando ele está pronto — mantendo a prévia fiel ao que a paciente verá.
      contratoStatus: p.contratoStatus,
      contratoPrazo: p.contratoPrazo,
      contratoAssinadoEm: p.contratoAssinadoEm,
      termoStatus: p.termoStatus,
      termoPrazo: p.termoPrazo,
      termoAssinadoEm: p.termoAssinadoEm,
      pagamentoQuitado:
        (formPronto ? (valoresEdit.valorPendente ?? 0) : (p.valorPendente ?? 0)) <= 0,
      pagamentoVencimento: formPronto
        ? valoresEdit.dataPagamentoPendente || null
        : p.dataPagamentoPendente,
    };
  }, [formPronto, valoresEdit, config, data?.paciente, medicosEdicao, medicosComFotos]);

  function onSaveEdit(values: z.infer<typeof editSchema>) {
    const { medicoId, localId, ...resto } = values;
    const temPendente = values.valorPendente > 0;
    // Resolve o médico a gravar com segurança: "Personalizado" desvincula (null),
    // um id numérico vincula; qualquer valor inesperado (ex.: "" — vide o
    // onValueChange espúrio do Radix) NÃO zera o vínculo — preserva o médico já
    // salvo na paciente em vez de gravar Number("") === 0 (id inválido).
    const medicoIdResolvido =
      medicoId === MEDICO_PERSONALIZADO
        ? null
        : /^\d+$/.test(medicoId)
          ? Number(medicoId)
          : (data?.paciente.medicoId ?? null);
    atualizarPaciente.mutate(
      {
        id,
        data: {
          ...resto,
          dataPagamentoPendente:
            temPendente && values.dataPagamentoPendente ? values.dataPagamentoPendente : null,
          medicoId: medicoIdResolvido,
          // Local: id da lista OU null (texto livre → backend cria/reusa o local).
          localId: localId && localId !== LOCAL_LIVRE ? Number(localId) : null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getObterPacienteQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListarPacientesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getResumoPacientesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListarHistoricoPacienteQueryKey(id) });
          // Limpa o estado "dirty" após salvar — o formulário continua montado
          // no painel lateral depois de gravar.
          form.reset(values);
          toast({
            title: "Dados atualizados",
            description: "As alterações foram salvas e registradas no histórico.",
          });
        },
        onError: (error) => {
          toast(
            toastErroAcao(error, {
              title: "Não foi possível salvar",
              description: "Tente novamente em instantes.",
            }),
          );
        },
      }
    );
  }

  if (isError) {
    if (isConnectivityError(error)) {
      return <ConnectionErrorConsole onRetry={() => refetch()} isRetrying={isRefetching} />;
    }
    return (
      <div className="min-h-[100dvh] bg-background text-foreground flex flex-col items-center justify-center p-4 selection:bg-accent/30">
        <EstratosLogo className="text-accent mb-6 opacity-50" />
        <h1 className="font-serif text-3xl mb-2 font-light text-foreground">Paciente não encontrado</h1>
        <p className="text-muted-foreground mb-8 text-center max-w-md font-light">O ID fornecido não corresponde a nenhum handoff ativo no console.</p>
        <Button asChild variant="outline" className="rounded-none border-border bg-transparent hover:bg-card text-foreground h-12 px-8 font-medium">
          <Link href="/">Voltar ao Console</Link>
        </Button>
      </div>
    );
  }

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedStates(prev => ({ ...prev, [key]: true }));
    toast({
      title: "Copiado para a área de transferência",
      description: "O texto está pronto para ser colado no WhatsApp.",
      duration: 2000,
    });
    setTimeout(() => setCopiedStates(prev => ({ ...prev, [key]: false })), 2000);
  };

  const invalidarPaciente = () => {
    queryClient.invalidateQueries({ queryKey: getObterPacienteQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListarPacientesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getResumoPacientesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListarTimelineQueryKey(id) });
  };

  const handleAprovar = () => {
    aprovarPaciente.mutate({ id }, {
      onSuccess: () => {
        invalidarPaciente();
        toast({
          title: "Handoff aprovado",
          description: "O link foi enviado à paciente.",
        });
      },
      onError: (error) => {
        toast(
          toastErroAcao(error, {
            title: "Não foi possível aprovar o handoff",
            description: "Tente novamente em instantes.",
          }),
        );
      },
    });
  };

  const handleVendedora = (valor: string) => {
    atualizarPaciente.mutate(
      { id, data: { vendedoraId: valor === SEM_VENDEDORA ? null : Number(valor) } },
      {
        onSuccess: () => {
          invalidarPaciente();
          toast({ title: "Responsável atualizada" });
        },
        onError: (error) => {
          toast(
            toastErroAcao(error, {
              title: "Não foi possível atualizar a responsável",
              description: "Tente novamente em instantes.",
            }),
          );
        },
      },
    );
  };

  const handleArquivar = () => {
    arquivarPaciente.mutate({ id }, {
      onSuccess: () => {
        invalidarPaciente();
        queryClient.invalidateQueries({ queryKey: getListarPacientesArquivadosQueryKey() });
        toast({ title: "Processo arquivado", description: "Você pode restaurá-lo a qualquer momento." });
      },
      onError: (error) => {
        toast(
          toastErroAcao(error, {
            title: "Não foi possível arquivar",
            description: "Tente novamente em instantes.",
          }),
        );
      },
    });
  };

  const handleRestaurar = () => {
    restaurarPaciente.mutate({ id }, {
      onSuccess: () => {
        invalidarPaciente();
        queryClient.invalidateQueries({ queryKey: getListarPacientesArquivadosQueryKey() });
        toast({ title: "Processo restaurado" });
      },
      onError: (error) => {
        toast(
          toastErroAcao(error, {
            title: "Não foi possível restaurar",
            description: "Tente novamente em instantes.",
          }),
        );
      },
    });
  };

  const handleAdicionarNota = () => {
    const titulo = notaTitulo.trim();
    if (!titulo) return;
    adicionarNota.mutate(
      { id, data: { titulo, descricao: notaDescricao.trim() || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListarTimelineQueryKey(id) });
          setNotaTitulo("");
          setNotaDescricao("");
          toast({ title: "Nota adicionada" });
        },
        onError: (error) => {
          toast(
            toastErroAcao(error, {
              title: "Não foi possível adicionar a nota",
              description: "Tente novamente em instantes.",
            }),
          );
        },
      },
    );
  };

  const contratoVisual = (status: string | null) => {
    switch (status) {
      case "assinado": return { label: "Assinado", className: "bg-card text-foreground border-accent/60" };
      case "pendente": return { label: "Pendente", className: "bg-card text-accent border-accent/40" };
      case "recusado": return { label: "Recusado", className: "bg-card text-red-300 border-red-400/40" };
      case "indisponivel": return { label: "Indisponível", className: "bg-card text-muted-foreground border-muted-foreground/30" };
      default: return { label: "—", className: "bg-transparent text-muted-foreground border-border" };
    }
  };

  // Situação do prazo de assinatura (mesma régua do alerta da home). Só faz
  // sentido enquanto o contrato não está assinado.
  const statusPrazoAssinatura = () => {
    const prazo = data?.paciente.contratoPrazo;
    if (!prazo) return null;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dias = Math.ceil((parseISO(prazo).getTime() - hoje.getTime()) / 86_400_000);
    const limite = config?.prazoAssinaturaDiasAntes ?? 2;
    if (data?.paciente.contratoStatus === "assinado") {
      return { label: "Contrato já assinado", className: "text-accent border-accent/40" };
    }
    if (dias <= 0) return { label: "Prazo vencido", className: "text-red-300 border-red-400/40" };
    if (dias <= limite) return { label: `Faltam ${dias} ${dias === 1 ? "dia" : "dias"}`, className: "text-accent border-accent/40" };
    return { label: `Faltam ${dias} dias`, className: "text-muted-foreground border-muted-foreground/30" };
  };

  const CopyBtn = ({ text, id: key }: { text: string, id: string }) => (
    <Button 
      variant="ghost" 
      size="sm" 
      onClick={() => handleCopy(text, key)}
      className="absolute top-3 right-3 h-8 px-3 rounded-none bg-background/80 backdrop-blur border border-border hover:bg-card hover:text-foreground text-muted-foreground transition-all group/copy z-10"
    >
      {copiedStates[key] ? <Check className="w-3.5 h-3.5 text-accent" /> : <Copy className="w-3.5 h-3.5 group-hover/copy:text-accent transition-colors" />}
      <span className="ml-2 font-expanded text-[9px] uppercase tracking-widest">{copiedStates[key] ? 'Copiado' : 'Copiar'}</span>
    </Button>
  );

  const SectionHeader = ({ num, title, desc }: { num: string, title: string, desc?: string }) => (
    <div className="mb-6 space-y-2">
      <div className="flex items-center gap-4">
        <span className="font-mono text-sm text-accent">{num}</span>
        <h2 className="font-expanded text-[10px] tracking-widest text-muted-foreground uppercase">{title}</h2>
        <div className="flex-1 h-px bg-card/50"></div>
      </div>
      {desc && <p className="text-muted-foreground/80 font-light text-sm leading-relaxed pl-9">{desc}</p>}
    </div>
  );

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
  };

  const ativas = vendedoras?.filter((v) => v.ativo) ?? [];
  const arquivado = data?.paciente.arquivado ?? false;
  const vendedoraValor = data?.paciente.vendedoraId
    ? String(data.paciente.vendedoraId)
    : SEM_VENDEDORA;
  return (
    <div className="min-h-[100dvh] bg-background text-foreground pb-24 font-sans selection:bg-accent/30">
      <header className="border-b border-border bg-background/90 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => tentarSair(() => setLocation("/"))}
              className="text-muted-foreground hover:text-accent transition-colors p-2 -ml-2"
            >
              <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
            </button>
            <div className="w-px h-6 bg-card"></div>
            <span className="font-expanded tracking-widest text-xs font-medium text-muted-foreground">CONSOLE</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {data && (
              <Badge
                variant="outline"
                title={ajudaDoMarco(data.paciente.marcoAtual).detalhe}
                className={`rounded-none font-expanded text-[9px] uppercase tracking-widest px-3 py-1 border ${corDoMarco(data.paciente.marcoAtual)}`}
              >
                {rotuloDoMarco(data.paciente.marcoAtualRotulo)}
              </Badge>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 mt-12 space-y-16">
        {isLoading ? (
          <div className="space-y-10">
            <Skeleton className="h-20 w-3/4 bg-card rounded-none" />
            <Skeleton className="h-64 w-full bg-card rounded-none" />
          </div>
        ) : data ? (
          <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-16">
            <motion.header variants={itemVariants} className="space-y-6">
              {arquivado && (
                <div className="inline-flex items-center gap-2 border border-muted-foreground/30 px-3 py-1 text-muted-foreground">
                  <Archive className="w-3 h-3" />
                  <span className="font-expanded text-[9px] uppercase tracking-widest">Arquivado</span>
                </div>
              )}
              {!loadingAtividade && atividade && (
                <div
                  className={`inline-flex items-center gap-3 border px-4 py-2 ${
                    atividade.abriu
                      ? "border-accent/50 bg-accent/10"
                      : "border-border bg-card/40"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rotate-45 shrink-0 ${
                      atividade.abriu ? "bg-accent" : "bg-muted-foreground"
                    }`}
                  ></span>
                  {atividade.abriu ? (
                    <span className="text-sm font-light text-foreground">
                      Abriu o link
                      {atividade.primeiraAbertura && (
                        <span className="text-muted-foreground">
                          {" "}· 1ª vez em {format(parseISO(atividade.primeiraAbertura), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                      )}
                      <span className="text-muted-foreground">
                        {" "}· {atividade.totalAberturas} {atividade.totalAberturas === 1 ? "abertura" : "aberturas"}
                      </span>
                    </span>
                  ) : (
                    <span className="text-sm font-light text-muted-foreground">
                      Ainda não abriu o link
                    </span>
                  )}
                </div>
              )}
              {/* Sinais da própria página: confirmação de leitura + progresso do
                  checklist de preparo marcado pela paciente. */}
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`inline-flex items-center gap-2 border px-4 py-2 ${
                    data.paciente.leituraConfirmadaEm
                      ? "border-accent/50 bg-accent/10"
                      : "border-border bg-card/40"
                  }`}
                >
                  {data.paciente.leituraConfirmadaEm ? (
                    <Check className="w-3.5 h-3.5 text-accent shrink-0" strokeWidth={2.5} />
                  ) : (
                    <span className="w-1.5 h-1.5 rotate-45 bg-muted-foreground shrink-0" />
                  )}
                  {data.paciente.leituraConfirmadaEm ? (
                    <span className="text-sm font-light text-foreground">
                      Confirmou a leitura
                      <span className="text-muted-foreground">
                        {" "}· {format(parseISO(data.paciente.leituraConfirmadaEm), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </span>
                  ) : (
                    <span className="text-sm font-light text-muted-foreground">
                      Ainda não confirmou a leitura
                    </span>
                  )}
                </span>
                {(() => {
                  const marcados = Object.values(data.paciente.preparoConcluido ?? {}).filter(Boolean).length;
                  if (marcados === 0) return null;
                  return (
                    <span className="inline-flex items-center gap-2 border border-border bg-card/40 px-4 py-2">
                      <span className="w-1.5 h-1.5 rotate-45 bg-accent shrink-0" />
                      <span className="text-sm font-light text-foreground">
                        Preparo
                        <span className="text-muted-foreground">
                          {" "}· {marcados} {marcados === 1 ? "item marcado" : "itens marcados"}
                        </span>
                      </span>
                    </span>
                  );
                })()}
              </div>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
                <div className="space-y-6">
                  <h1 className="font-serif text-5xl md:text-6xl font-light tracking-tight text-foreground leading-none">{data.paciente.nome}</h1>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-muted-foreground font-light">
                    <span className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-accent rounded-none rotate-45"></span>
                      {data.paciente.procedimentos.join(" · ")}
                    </span>
                    <span className="font-mono text-sm opacity-80">{format(parseISO(data.paciente.dataCirurgia), "dd/MM/yyyy")} · {data.paciente.horario}</span>
                    {data.paciente.cpf && (
                      <span className="font-mono text-sm opacity-80">CPF {formatarCpf(data.paciente.cpf)}</span>
                    )}
                    {data.paciente.telefone && (
                      <span className="font-mono text-sm opacity-80">{formatarTelefone(data.paciente.telefone)}</span>
                    )}
                    {data.paciente.laser && (
                      <span className="font-expanded text-[9px] uppercase tracking-widest border border-accent/50 px-2 py-0.5 text-foreground">
                        Laser CO₂
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {/* Sub-checks do 1º marco "Contrato & Pagamento" — paralelos, sem
                  ordem imposta. Só o contrato assinado (todas as partes) libera o
                  avanço do funil; o pagamento é acompanhado à parte. */}
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground">
                  Contrato &amp; Pagamento
                </span>
                {[
                  { ok: data.paciente.contratoStatus === "assinado", label: "Contrato assinado" },
                  { ok: data.paciente.valorSinal > 0, label: "Pagamento recebido" },
                ].map((c) => (
                  <span
                    key={c.label}
                    className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-expanded text-[9px] uppercase tracking-widest ${
                      c.ok ? "border-accent/50 text-foreground" : "border-border text-muted-foreground"
                    }`}
                  >
                    {c.ok ? (
                      <Check className="w-3 h-3 text-accent" strokeWidth={2.5} />
                    ) : (
                      <span className="w-1.5 h-1.5 rotate-45 bg-muted-foreground/50" />
                    )}
                    {c.label}
                  </span>
                ))}
              </div>
              {/* Responsável + arquivar/restaurar */}
              <div className="flex flex-col sm:flex-row sm:items-end gap-4 pt-2">
                <div className="space-y-2 flex-1 max-w-xs">
                  <span className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground">Vendedora responsável</span>
                  <Select value={vendedoraValor} onValueChange={handleVendedora} disabled={atualizarPaciente.isPending}>
                    <SelectTrigger className="bg-card border-transparent focus:ring-1 focus:ring-ring rounded-none h-11 text-foreground">
                      <SelectValue placeholder="Selecionar responsável" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border-border text-foreground rounded-none">
                      <SelectItem value={SEM_VENDEDORA} className="focus:bg-card focus:text-foreground">Sem responsável</SelectItem>
                      {ativas.map((v) => (
                        <SelectItem key={v.id} value={String(v.id)} className="focus:bg-card focus:text-foreground">{v.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {arquivado ? (
                  <Button
                    onClick={handleRestaurar}
                    disabled={restaurarPaciente.isPending}
                    variant="outline"
                    className="rounded-none border-border bg-transparent hover:bg-card text-foreground h-11 px-6"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" /> Restaurar
                  </Button>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="rounded-none border-border bg-transparent hover:bg-card text-muted-foreground hover:text-foreground h-11 px-6">
                        <Archive className="w-4 h-4 mr-2" /> Arquivar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-background border border-border text-foreground rounded-none">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-serif text-2xl font-light text-foreground">Arquivar processo?</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground font-light">
                          O processo de {data.paciente.nome} sairá da lista de ativos, mas nada será apagado. Você pode restaurá-lo a qualquer momento.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-none border-border bg-transparent hover:bg-card text-foreground">Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleArquivar} className="rounded-none bg-primary hover:bg-primary/90 text-primary-foreground">Arquivar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </motion.header>

            {/* Link público da paciente — sempre visível e em destaque */}
            <motion.div variants={itemVariants} className="border border-accent/40 bg-accent/5 p-6 space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-accent rotate-45"></span>
                <span className="font-expanded text-[10px] tracking-widest uppercase text-muted-foreground">Link da paciente</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <code className="flex-1 font-mono text-sm text-foreground bg-background border border-border px-4 py-3 truncate">
                  {data.saidas.link}
                </code>
                <div className="flex gap-2 shrink-0">
                  <Button
                    onClick={() => handleCopy(data.saidas.link, "link-topo")}
                    className="rounded-none bg-primary hover:bg-primary/90 text-primary-foreground h-11 px-5 font-medium"
                  >
                    {copiedStates["link-topo"] ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                    {copiedStates["link-topo"] ? "Copiado" : "Copiar link"}
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="rounded-none border-border bg-transparent hover:bg-card text-foreground h-11 px-5 font-medium"
                  >
                    <a href={data.saidas.link} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4 mr-2" strokeWidth={1.5} /> Abrir
                    </a>
                  </Button>
                </div>
              </div>
            </motion.div>

            {/* Status — aprovação (link ainda não enviado) ou handoff já aprovado */}
            {!data.paciente.linkEnviadoEm ? (
              <motion.div variants={itemVariants} className="bg-card relative p-8 space-y-6 overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-accent"></div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                  <div className="space-y-2">
                    <h3 className="font-serif text-2xl text-foreground">Revise e aprove</h3>
                    <p className="text-muted-foreground font-light max-w-xl leading-relaxed">
                      Confira os dados e os blocos de mensagem nas abas ao lado. Se estiver tudo certo, aprove — só depois disso o link fica liberado para entregar à paciente.
                    </p>
                  </div>
                  <Button
                    onClick={handleAprovar}
                    disabled={aprovarPaciente.isPending}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-none h-12 px-8 w-full sm:w-auto transition-all shrink-0"
                  >
                    {aprovarPaciente.isPending ? "Aprovando..." : "Aprovar e enviar"}
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div variants={itemVariants} className="border border-accent/30 p-6 flex items-start gap-4">
                <Check className="w-5 h-5 text-accent mt-0.5 shrink-0" strokeWidth={1.5} />
                <div className="space-y-1">
                  <p className="text-foreground font-light">Handoff aprovado.</p>
                  <p className="text-muted-foreground font-light text-sm leading-relaxed">
                    Copie a mensagem da <span className="text-foreground">Entrega Principal</span> (aba Entrega) e envie pelo WhatsApp da paciente.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Alternância em telas estreitas: Página (prévia) ou Edições (ações) */}
            <div className="flex lg:hidden border border-border">
              <button
                type="button"
                onClick={() => setPainelMovel("pagina")}
                className={`flex-1 h-11 font-expanded text-[10px] tracking-widest uppercase transition-colors ${painelMovel === "pagina" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground"}`}
              >
                Página
              </button>
              <button
                type="button"
                onClick={() => setPainelMovel("edicoes")}
                className={`flex-1 h-11 font-expanded text-[10px] tracking-widest uppercase transition-colors ${painelMovel === "edicoes" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground"}`}
              >
                Edições
              </button>
            </div>

            {/* SPLIT-VIEW — prévia ao vivo (esquerda) + ações em abas (direita) */}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] gap-8 items-start">
              {/* ESQUERDA — prévia da página da paciente */}
              <div className={`${painelMovel === "pagina" ? "block" : "hidden"} lg:block lg:sticky lg:top-24 space-y-3`}>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-accent rotate-45"></span>
                  <span className="font-expanded text-[10px] tracking-widest uppercase text-muted-foreground">O que a paciente vê</span>
                </div>
                <PreviaPaginaPaciente
                  secoes={conteudoSecoes ?? []}
                  dados={dadosPreview}
                  documentos={documentos}
                  onAbrirDocumento={acessarDocumento}
                  documentoAcao={documentoAcao}
                  pedidoExames={
                    pedidoExames
                      ? { token: "", nomeArquivo: pedidoExames.nomeArquivo, tamanho: pedidoExames.tamanho }
                      : null
                  }
                  receitaPreparoPele={
                    receita
                      ? { token: "", nomeArquivo: receita.nomeArquivo, tamanho: receita.tamanho }
                      : null
                  }
                  receituarioPosop={
                    receituario
                      ? { token: "", nomeArquivo: receituario.nomeArquivo, tamanho: receituario.tamanho }
                      : null
                  }
                  tema={data.paciente.tema}
                />
              </div>

              {/* DIREITA — edições e ações organizadas em abas */}
              <div className={`${painelMovel === "edicoes" ? "block" : "hidden"} lg:block`}>
                <Tabs value={abaAtiva} onValueChange={setAbaAtiva} className="w-full">
                  <TabsList className="flex flex-wrap h-auto justify-start gap-1 rounded-none bg-card/40 p-1.5 w-full">
                    <TabsTrigger value="dados" className="rounded-none font-expanded text-[10px] tracking-widest uppercase px-3 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none">Dados</TabsTrigger>
                    <TabsTrigger value="entrega" className="rounded-none font-expanded text-[10px] tracking-widest uppercase px-3 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none">Entrega</TabsTrigger>
                    <TabsTrigger value="acompanhamento" className="rounded-none font-expanded text-[10px] tracking-widest uppercase px-3 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none">Acompanhamento</TabsTrigger>
                    <TabsTrigger value="contrato" className="rounded-none font-expanded text-[10px] tracking-widest uppercase px-3 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none">Contrato</TabsTrigger>
                    <TabsTrigger value="termo" className="rounded-none font-expanded text-[10px] tracking-widest uppercase px-3 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none">Termo</TabsTrigger>
                    <TabsTrigger value="documentos" className="rounded-none font-expanded text-[10px] tracking-widest uppercase px-3 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none">Documentos</TabsTrigger>
                    <TabsTrigger value="conteudo" className="rounded-none font-expanded text-[10px] tracking-widest uppercase px-3 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none">Conteúdo</TabsTrigger>
                    <TabsTrigger value="historico" className="rounded-none font-expanded text-[10px] tracking-widest uppercase px-3 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none">Histórico</TabsTrigger>
                    <TabsTrigger value="posop" className="rounded-none font-expanded text-[10px] tracking-widest uppercase px-3 py-2 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none">Pós-op</TabsTrigger>
                  </TabsList>

                  {/* ABA DADOS — edição com prévia ao vivo ao lado */}
                  <TabsContent value="dados" className="mt-6 focus-visible:outline-none">
                    <div className="bg-card p-8 space-y-6">
                      <div className="space-y-2">
                        <h3 className="font-serif text-2xl text-foreground">Dados da paciente</h3>
                        <p className="text-muted-foreground font-light leading-relaxed">
                          Ajuste o que precisar — a prévia mostra, em tempo real, o que a paciente vai ver. As alterações ficam registradas no histórico.
                        </p>
                      </div>
                      <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSaveEdit)} className="space-y-6">
                          <CamposEdicaoPaciente form={form} config={config} medicos={medicosEdicao} />
                          <div className="flex flex-col sm:flex-row gap-3">
                            <Button
                              type="submit"
                              disabled={atualizarPaciente.isPending || !form.formState.isDirty}
                              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-12 text-base font-medium"
                            >
                              {atualizarPaciente.isPending ? "Salvando..." : "Salvar alterações"}
                            </Button>
                            {form.formState.isDirty && (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => data && form.reset(valoresDaPaciente(data.paciente))}
                                className="rounded-none border-border bg-transparent hover:bg-card text-muted-foreground hover:text-foreground h-12 px-6 font-medium"
                              >
                                Descartar
                              </Button>
                            )}
                          </div>
                        </form>
                      </Form>
                    </div>
                  </TabsContent>

                  <TabsContent value="entrega" className="space-y-16 mt-6 focus-visible:outline-none">
              <motion.div variants={itemVariants} className="border border-border bg-card/20 p-6 space-y-4">
                <h3 className="font-expanded text-[10px] tracking-widest text-muted-foreground uppercase">Como entregar — passo a passo</h3>
                <ol className="space-y-3">
                  {[
                    "Copie a mensagem da Entrega Principal (o link já vem junto) e cole no WhatsApp da paciente.",
                    "Envie os blocos dos Envios Operacionais aos grupos do centro cirúrgico e da anestesia.",
                    "Use o Fallback Manual só se o link não abrir para a paciente.",
                  ].map((step, idx) => (
                    <li key={idx} className="flex gap-4 text-muted-foreground font-light text-sm leading-relaxed">
                      <span className="font-mono text-accent shrink-0">{String(idx + 1).padStart(2, "0")}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </motion.div>

              {/* SECTION 1: ENTREGA PRINCIPAL */}
              <motion.section variants={itemVariants}>
                <SectionHeader
                  num="01"
                  title="Entrega Principal"
                  desc="Esta é a mensagem que vai direto para a paciente. É o passo mais importante — comece por aqui."
                />
                <Card className="bg-card border-l-2 border-l-accent border-y-transparent border-r-transparent rounded-none relative">
                  <CardContent className="p-0">
                    <div className="relative p-8 pt-12 space-y-8">
                      <CopyBtn text={`${data.saidas.mensagemUnica}\n\n${data.saidas.link}`} id="msg-unica" />
                      <div className="whitespace-pre-line text-foreground font-light leading-relaxed text-lg">
                        {data.saidas.mensagemUnica}
                      </div>
                    </div>
                    <div className="bg-background p-5 border-t border-border flex items-center justify-between group/link">
                      <span className="font-mono text-sm text-accent truncate mr-4">{data.saidas.link}</span>
                      <a href={data.saidas.link} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-accent transition-colors shrink-0 p-2 -m-2">
                        <ExternalLink className="w-4 h-4" strokeWidth={1.5} />
                      </a>
                    </div>
                  </CardContent>
                </Card>
                <div className="mt-4 flex items-start gap-3 text-muted-foreground font-light text-sm leading-relaxed">
                  <span className="text-accent font-mono mt-0.5 shrink-0">→</span>
                  <p>
                    <span className="text-foreground">O que acontece em seguida:</span> toque em "Copiar" (o link já vai junto) e cole no WhatsApp da paciente. Ela abre o link e vê todas as orientações de preparo.
                  </p>
                </div>
              </motion.section>

              {/* SECTION 2: FALLBACK */}
              <motion.section variants={itemVariants}>
                <SectionHeader
                  num="02"
                  title="Fallback Manual"
                  desc="Use só se o link não funcionar para a paciente. Aqui ficam os blocos para enviar as orientações manualmente, um a um."
                />
                <Collapsible className="border border-border bg-background">
                  <CollapsibleTrigger className="w-full flex items-center justify-between p-6 hover:bg-card/30 transition-colors group">
                    <span className="font-serif text-xl text-muted-foreground group-hover:text-foreground transition-colors">Visualizar blocos de contingência</span>
                    <ChevronDown className="w-5 h-5 text-muted-foreground group-data-[state=open]:rotate-180 transition-transform stroke-[1.5]" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-t border-border bg-card/10">
                    <div className="divide-y divide-border">
                      <div className="relative p-8 pt-14">
                        <div className="absolute top-4 left-8">
                          <span className="font-expanded text-[9px] tracking-widest text-muted-foreground uppercase">Bloco A6</span>
                        </div>
                        <CopyBtn text={data.saidas.a6} id="a6" />
                        <div className="text-base font-light whitespace-pre-line text-foreground/90 leading-relaxed">
                          {data.saidas.a6}
                        </div>
                      </div>
                      
                      <div className="bg-background flex items-center justify-center gap-4 py-4 px-8 opacity-60">
                        <span className="font-expanded text-[9px] tracking-widest text-muted-foreground uppercase">Anexar o PDF da NF</span>
                      </div>

                      <div className="relative p-8 pt-14">
                        <div className="absolute top-4 left-8">
                          <span className="font-expanded text-[9px] tracking-widest text-muted-foreground uppercase">Bloco A7</span>
                        </div>
                        <CopyBtn text={data.saidas.a7} id="a7" />
                        <div className="text-base font-light whitespace-pre-line text-foreground/90 leading-relaxed">
                          {data.saidas.a7}
                        </div>
                      </div>

                      <div className="p-8 bg-background">
                        <h4 className="font-expanded text-[9px] tracking-widest text-muted-foreground uppercase mb-5">Checklist Medx</h4>
                        <ul className="space-y-4">
                          {data.saidas.checklistMedx.filter(i => i.incluido).map((item, idx) => (
                            <li key={idx} className="flex items-start gap-4 text-base font-light text-muted-foreground">
                              <div className="w-1.5 h-1.5 bg-accent rotate-45 mt-2 shrink-0"></div>
                              <span className={!item.sempre ? "text-foreground bg-card px-2 py-0.5 -ml-2 -mt-0.5" : ""}>
                                {item.titulo}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="relative p-8 pt-14">
                        <div className="absolute top-4 left-8">
                          <span className="font-expanded text-[9px] tracking-widest text-muted-foreground uppercase">Bloco A8</span>
                        </div>
                        <CopyBtn text={data.saidas.a8} id="a8" />
                        <div className="text-base font-light whitespace-pre-line text-foreground/90 leading-relaxed">
                          {data.saidas.a8}
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </motion.section>

              {/* SECTION 3: ENVIOS OPERACIONAIS */}
              <motion.section variants={itemVariants} className="space-y-6">
                <SectionHeader
                  num="03"
                  title="Envios Operacionais"
                  desc="Avisos internos da equipe — não vão para a paciente. Copie e envie cada bloco ao grupo do centro cirúrgico e ao da anestesia."
                />
                
                {data.saidas.avisoOperacional && (
                  <div className="border border-accent/30 p-5 flex items-start gap-4">
                    <span className="text-accent font-mono mt-0.5">!</span>
                    <p className="text-sm text-foreground font-light leading-relaxed">{data.saidas.avisoOperacional}</p>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-6">
                  <Card className="bg-card border-transparent rounded-none relative">
                    <CardContent className="p-6 pt-14">
                      <div className="absolute top-5 left-6">
                        <span className="font-expanded text-[9px] tracking-widest text-muted-foreground uppercase">Centro Cirúrgico</span>
                      </div>
                      <CopyBtn text={data.saidas.a4} id="a4" />
                      <div className="whitespace-pre-line text-sm text-foreground/90 leading-relaxed font-mono">
                        {data.saidas.a4}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-card border-transparent rounded-none relative">
                    <CardContent className="p-6 pt-14">
                      <div className="absolute top-5 left-6">
                        <span className="font-expanded text-[9px] tracking-widest text-muted-foreground uppercase">Anestesia</span>
                      </div>
                      <CopyBtn text={data.saidas.a5} id="a5" />
                      <div className="whitespace-pre-line text-sm text-foreground/90 leading-relaxed font-mono">
                        {data.saidas.a5}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </motion.section>
                  </TabsContent>

                  <TabsContent value="acompanhamento" className="space-y-16 mt-6 focus-visible:outline-none">
              {/* SECTION 4: ACOMPANHAMENTO */}
              <motion.section variants={itemVariants} className="space-y-6">
                <SectionHeader num="04" title="Acompanhamento" />

                <div className="bg-card/40 border border-border p-6 space-y-4">
                  <Input
                    value={notaTitulo}
                    onChange={(e) => setNotaTitulo(e.target.value)}
                    placeholder="Título da nota (ex: Paciente confirmou exames)"
                    className="bg-background border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-11 text-foreground placeholder:text-muted-foreground/50"
                  />
                  <Textarea
                    value={notaDescricao}
                    onChange={(e) => setNotaDescricao(e.target.value)}
                    placeholder="Detalhes (opcional)"
                    className="bg-background border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none text-foreground placeholder:text-muted-foreground/50 min-h-[80px]"
                  />
                  <Button
                    onClick={handleAdicionarNota}
                    disabled={adicionarNota.isPending || !notaTitulo.trim()}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-11 px-6"
                  >
                    <Plus className="w-4 h-4 mr-2" /> Adicionar nota
                  </Button>
                </div>

                <div className="relative pl-8 space-y-8 pt-2">
                  {loadingTimeline ? (
                    Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full bg-card rounded-none" />)
                  ) : timeline && timeline.length > 0 ? (
                    <>
                      <div className="absolute left-[3px] top-3 bottom-3 w-px bg-card"></div>
                      {timeline.map((evento) => (
                        <div key={evento.id} className="relative">
                          <div className={`absolute -left-[29px] top-1.5 w-2 h-2 rotate-45 ${evento.automatico ? "bg-accent" : "bg-muted-foreground"}`}></div>
                          <div className="space-y-1.5">
                            <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1">
                              <span className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground">
                                {evento.tipo === "lembrete_whatsapp"
                                  ? evento.autor
                                    ? `Lembrete · por ${evento.autor}`
                                    : "Lembrete"
                                  : evento.automatico
                                    ? "Automático"
                                    : "Nota"}
                              </span>
                              <span className="font-mono text-xs text-muted-foreground/60">
                                {format(parseISO(evento.createdAt), "dd/MM/yyyy HH:mm")}
                              </span>
                            </div>
                            <h4 className="font-serif text-xl text-foreground">{evento.titulo}</h4>
                            {evento.descricao && (
                              <p className="font-light text-muted-foreground leading-relaxed whitespace-pre-line">{evento.descricao}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <p className="text-muted-foreground font-light -ml-8">Nenhum evento registrado ainda.</p>
                  )}
                </div>
              </motion.section>

              <motion.section variants={itemVariants}>
                <SectionHeader
                  num="05"
                  title="Atividade da paciente"
                  desc="O que a paciente abriu, baixou e marcou no link entregue."
                />
                {loadingAtividade ? (
                  <Skeleton className="h-24 w-full bg-card rounded-none" />
                ) : atividade && atividade.eventos.length > 0 ? (
                  <ol className="relative border-l border-card ml-2 space-y-8">
                    {atividade.eventos.map((evento) => (
                      <li key={evento.id} className="relative pl-8">
                        <span className="absolute -left-[5px] top-1.5 w-2 h-2 bg-accent rotate-45"></span>
                        <time className="font-mono text-xs text-muted-foreground">
                          {format(parseISO(evento.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </time>
                        <p className="mt-2 text-sm text-foreground font-light">{evento.descricao}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="border border-dashed border-card py-10 text-center">
                    <p className="text-muted-foreground font-light">Nenhuma atividade registrada até o momento.</p>
                  </div>
                )}
              </motion.section>

                  </TabsContent>

                  <TabsContent value="contrato" className="space-y-16 mt-6 focus-visible:outline-none">
              {/* SECTION 6: CONTRATO (AUTENTIQUE) — acompanhamento do status.
                  A geração (modelo → IA → aprovação → Autentique) agora vive na
                  área dedicada "Geração de documentos" (/documentos). */}
              <motion.section variants={itemVariants}>
                <SectionHeader num="06" title="Status do contrato (Autentique)" />
                <Card className="bg-card border-transparent rounded-none">
                  <CardContent className="p-8 space-y-6">
                    <div className="border border-border/60 bg-background/40 p-4 flex items-center justify-between gap-4 flex-wrap">
                      <p className="text-sm text-muted-foreground font-light leading-relaxed">
                        {data.paciente.contratoAutentiqueId ? (
                          <>
                            Contrato já gerado e enviado à{" "}
                            <span className="text-foreground">Autentique</span>. Aqui você acompanha o link e o status da assinatura.
                          </>
                        ) : (
                          <>
                            A geração de contratos foi movida para a área{" "}
                            <span className="text-foreground">Geração de documentos</span>. Aqui você acompanha o link e o status da assinatura.
                          </>
                        )}
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => setLocation(`/documentos?paciente=${id}&tipo=contrato`)}
                        className="rounded-none border-border bg-transparent hover:bg-background text-muted-foreground hover:text-accent h-10 px-4 gap-2 shrink-0"
                      >
                        <FilePlus className="w-4 h-4" strokeWidth={1.5} />
                        {data.paciente.contratoAutentiqueId ? "Gerar novo contrato" : "Gerar contrato"}
                      </Button>
                    </div>
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-4 flex-wrap">
                        <Badge variant="outline" className={`rounded-none font-expanded text-[9px] uppercase tracking-widest px-3 py-1 border inline-flex items-center ${contratoVisual(data.paciente.contratoStatus).className}`}>
                          {data.paciente.contratoStatus === "assinado" && <Check className="w-3 h-3 mr-1.5 text-accent" strokeWidth={2.5} />}
                          {contratoVisual(data.paciente.contratoStatus).label}
                        </Badge>
                        {data.paciente.contratoStatus === "assinado" && data.paciente.contratoAssinadoEm && (
                          <span className="font-mono text-xs text-muted-foreground">
                            Assinado em {format(parseISO(data.paciente.contratoAssinadoEm), "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                        )}
                      </div>
                      {data.paciente.contratoAutentiqueId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            refetch();
                            refetchAssinaturas();
                          }}
                          disabled={isRefetching}
                          className="h-8 px-3 rounded-none bg-transparent border border-border hover:bg-background text-muted-foreground hover:text-foreground"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 mr-2 ${isRefetching ? "animate-spin text-accent" : ""}`} strokeWidth={1.5} />
                          <span className="font-expanded text-[9px] uppercase tracking-widest">Atualizar</span>
                        </Button>
                      )}
                    </div>

                    {data.paciente.contratoStatus === "assinado" && (
                      <div className="flex flex-col sm:flex-row gap-3 pt-1">
                        <Button
                          onClick={() => acessarContrato("abrir")}
                          disabled={contratoBaixando !== null}
                          className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-11 px-6 font-medium"
                        >
                          <Eye className="w-4 h-4 mr-2" strokeWidth={1.5} />
                          {contratoBaixando === "abrir" ? "Abrindo..." : "Abrir contrato"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => acessarContrato("baixar")}
                          disabled={contratoBaixando !== null}
                          className="rounded-none border-border bg-transparent hover:bg-background text-muted-foreground hover:text-foreground h-11 px-6 font-medium"
                        >
                          <Download className="w-4 h-4 mr-2" strokeWidth={1.5} />
                          {contratoBaixando === "baixar" ? "Baixando..." : "Baixar PDF"}
                        </Button>
                      </div>
                    )}

                    {/* Contrato já gerado e ainda não assinado: dá acesso ao
                        documento no painel da Autentique (onde a equipe vê o PDF
                        gerado e acompanha as assinaturas). O bloco acima cobre o
                        caso "assinado" com o PDF assinado. */}
                    {data.paciente.contratoAutentiqueId && data.paciente.contratoStatus !== "assinado" && (
                      <div className="flex flex-col sm:flex-row gap-3 pt-1">
                        <Button
                          variant="outline"
                          onClick={() => window.open(`https://painel.autentique.com.br/documentos/${data.paciente.contratoAutentiqueId}`, "_blank", "noopener,noreferrer")}
                          className="rounded-none border-border bg-transparent hover:bg-background text-muted-foreground hover:text-foreground h-11 px-6 font-medium"
                        >
                          <ExternalLink className="w-4 h-4 mr-2" strokeWidth={1.5} />
                          Ver contrato na Autentique
                        </Button>
                      </div>
                    )}

                    {/* Assinaturas POR PARTE (com papéis): quando há uma geração
                        enviada, usa o painel do gerador (criado → cada parte). */}
                    {geracaoContratoEnviada && (
                      <div className="border-t border-border/60 pt-6">
                        <PainelAssinaturas geracaoId={geracaoContratoEnviada.id} enviado />
                      </div>
                    )}

                    {/* Fallback (contrato vinculado manualmente, sem geração):
                        lista simples de signatários da Autentique. */}
                    {!geracaoContratoEnviada && temContratoAutentique && (assinaturasContrato?.assinaturas.length ?? 0) > 0 && (
                      <div className="border-t border-border/60 pt-6 space-y-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <h3 className="font-expanded text-[10px] tracking-widest text-muted-foreground uppercase">Assinaturas</h3>
                          {carregandoAssinaturas && (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-accent" strokeWidth={1.5} />
                          )}
                        </div>
                        <ul className="space-y-2">
                          {assinaturasContrato!.assinaturas.map((a, i) => (
                            <li
                              key={i}
                              className="flex items-center justify-between gap-3 flex-wrap border border-border/60 bg-background/40 px-4 py-3"
                            >
                              <div className="min-w-0">
                                <p className="text-sm text-foreground font-light truncate">
                                  {a.nome ?? a.email ?? `Signatário ${i + 1}`}
                                </p>
                                {a.nome && a.email && (
                                  <p className="text-xs text-muted-foreground/70 font-mono truncate">{a.email}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                {a.status === "assinado" && a.em && (
                                  <span className="font-mono text-xs text-muted-foreground">
                                    {format(parseISO(a.em), "dd/MM/yyyy", { locale: ptBR })}
                                  </span>
                                )}
                                <Badge variant="outline" className={`rounded-none font-expanded text-[9px] uppercase tracking-widest px-3 py-1 border inline-flex items-center ${contratoVisual(a.status).className}`}>
                                  {a.status === "assinado" && <Check className="w-3 h-3 mr-1.5 text-accent" strokeWidth={2.5} />}
                                  {a.status === "assinado" ? "Assinou" : a.status === "recusado" ? "Recusou" : "Aguardando"}
                                </Badge>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {data.paciente.contratoStatus === "indisponivel" && (
                      <p className="text-sm text-muted-foreground font-light leading-relaxed">
                        Não foi possível ler o status na Autentique. Verifique se o link/ID está correto e se o documento ainda existe.
                      </p>
                    )}

                    {/* Link de assinatura (para a paciente) */}
                    <div className="border-t border-border/60 pt-6 space-y-4">
                      <div className="space-y-1">
                        <h3 className="font-expanded text-[10px] tracking-widest text-muted-foreground uppercase">Link de assinatura</h3>
                        <p className="text-muted-foreground/80 font-light text-sm leading-relaxed">
                          Link que a paciente usa para assinar. Preenchido automaticamente pela Autentique; informe um link manual para sobrescrever.
                        </p>
                      </div>

                      {data.paciente.contratoLinkAssinatura ? (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          <code className="flex-1 min-w-0 truncate bg-background border border-border px-3 py-3 font-mono text-xs text-foreground">
                            {data.paciente.contratoLinkAssinatura}
                          </code>
                          <div className="flex gap-3 shrink-0">
                            <Button
                              variant="outline"
                              onClick={() => window.open(data.paciente.contratoLinkAssinatura!, "_blank")}
                              className="rounded-none border-border bg-transparent hover:bg-background text-muted-foreground hover:text-foreground h-11 px-5 font-medium"
                            >
                              <ExternalLink className="w-4 h-4 mr-2" strokeWidth={1.5} />
                              Abrir
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleCopy(data.paciente.contratoLinkAssinatura!, "link-assinatura")}
                              className="rounded-none border-border bg-transparent hover:bg-background text-muted-foreground hover:text-foreground h-11 px-5 font-medium"
                            >
                              {copiedStates["link-assinatura"] ? <Check className="w-4 h-4 mr-2 text-accent" /> : <Copy className="w-4 h-4 mr-2" />}
                              {copiedStates["link-assinatura"] ? "Copiado" : "Copiar"}
                            </Button>
                          </div>
                        </div>
                      ) : data.paciente.contratoAutentiqueId ? (
                        <p className="text-sm text-muted-foreground/70 font-light leading-relaxed">
                          O contrato foi gerado, mas a Autentique ainda não retornou o link curto de assinatura. Abra o documento em{" "}
                          <span className="text-foreground">Ver contrato na Autentique</span> para reenviar por lá, ou informe um link manual em <span className="text-foreground">Ajustes avançados</span>.
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground/70 font-light">
                          Nenhum link de assinatura disponível ainda.
                        </p>
                      )}
                    </div>

                    {/* Prazo de assinatura */}
                    <div className="border-t border-border/60 pt-6 space-y-4">
                      <div className="space-y-1">
                        <h3 className="font-expanded text-[10px] tracking-widest text-muted-foreground uppercase">Prazo de assinatura</h3>
                        <p className="text-muted-foreground/80 font-light text-sm leading-relaxed">
                          Padrão: {config?.prazoAssinaturaDiasAntes ?? 2} dias antes da cirurgia. Defina uma data específica para sobrescrever apenas esta paciente.
                        </p>
                      </div>

                      {(() => {
                        const sp = statusPrazoAssinatura();
                        if (!data.paciente.contratoPrazo) return null;
                        return (
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="inline-flex items-center font-mono text-sm text-foreground">
                              <CalendarClock className="w-4 h-4 mr-2 text-muted-foreground/60" strokeWidth={1.5} />
                              {format(parseISO(data.paciente.contratoPrazo), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                            {sp && (
                              <Badge variant="outline" className={`rounded-none font-expanded text-[9px] uppercase tracking-widest px-3 py-1 border bg-card ${sp.className}`}>
                                {sp.label}
                              </Badge>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Ajustes avançados — controles administrativos opcionais,
                        recolhidos por padrão para reduzir a densidade. Nada aqui
                        envia ou altera a Autentique (somente leitura). */}
                    <Collapsible className="border-t border-border/60">
                      <CollapsibleTrigger className="w-full flex items-center justify-between py-5 group">
                        <span className="flex items-center gap-2 font-expanded text-[10px] tracking-widest text-muted-foreground uppercase">
                          <Settings2 className="w-4 h-4 text-muted-foreground/60" strokeWidth={1.5} />
                          Ajustes avançados
                        </span>
                        <ChevronDown className="w-4 h-4 text-muted-foreground group-data-[state=open]:rotate-180 transition-transform" strokeWidth={1.5} />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-8 pb-2">
                        {/* Link de assinatura manual */}
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <h4 className="font-expanded text-[9px] tracking-widest text-muted-foreground uppercase">Link de assinatura manual</h4>
                            <p className="text-muted-foreground/70 font-light text-xs leading-relaxed">Sobrescreve o link automático que a paciente usa para assinar.</p>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative flex-1">
                              <FileSignature className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" strokeWidth={1.5} />
                              <Input
                                value={linkManualInput}
                                onChange={(e) => setLinkManualInput(e.target.value)}
                                placeholder="Link manual (opcional) — sobrescreve o automático"
                                className="bg-background border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 pl-10 text-foreground placeholder:text-muted-foreground/40 font-mono text-sm"
                              />
                            </div>
                            <div className="flex gap-3">
                              <Button
                                onClick={() => mutarCamposContrato({ contratoLinkAssinaturaManual: linkManualInput.trim() || null }, "Link de assinatura salvo")}
                                disabled={atualizarPaciente.isPending || linkManualInput.trim() === (data.paciente.contratoLinkAssinaturaManual ?? "")}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-12 px-6 font-medium shrink-0"
                              >
                                {atualizarPaciente.isPending ? "Salvando..." : "Salvar"}
                              </Button>
                              {data.paciente.contratoLinkAssinaturaManual && (
                                <Button
                                  variant="outline"
                                  onClick={() => mutarCamposContrato({ contratoLinkAssinaturaManual: null }, "Link manual removido")}
                                  disabled={atualizarPaciente.isPending}
                                  className="rounded-none border-border bg-transparent hover:bg-background text-muted-foreground hover:text-foreground h-12 px-5 font-medium shrink-0"
                                >
                                  Limpar
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Prazo personalizado */}
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <h4 className="font-expanded text-[9px] tracking-widest text-muted-foreground uppercase">Prazo personalizado</h4>
                            <p className="text-muted-foreground/70 font-light text-xs leading-relaxed">Sobrescreve o padrão de {config?.prazoAssinaturaDiasAntes ?? 2} dias antes da cirurgia apenas para esta paciente.</p>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative flex-1 sm:max-w-xs">
                              <Input
                                type="date"
                                min={format(new Date(), "yyyy-MM-dd")}
                                value={prazoOverrideInput}
                                onChange={(e) => setPrazoOverrideInput(e.target.value)}
                                className="bg-background border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 text-foreground placeholder:text-muted-foreground/40 font-mono text-sm"
                              />
                            </div>
                            <div className="flex gap-3">
                              <Button
                                onClick={() => mutarCamposContrato({ contratoPrazoOverride: prazoOverrideInput.trim() || null }, "Prazo de assinatura salvo")}
                                disabled={atualizarPaciente.isPending || prazoOverrideInput.trim() === (data.paciente.contratoPrazoOverride ?? "")}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-12 px-6 font-medium shrink-0"
                              >
                                {atualizarPaciente.isPending ? "Salvando..." : "Salvar"}
                              </Button>
                              {data.paciente.contratoPrazoOverride && (
                                <Button
                                  variant="outline"
                                  onClick={() => mutarCamposContrato({ contratoPrazoOverride: null }, "Prazo personalizado removido")}
                                  disabled={atualizarPaciente.isPending}
                                  className="rounded-none border-border bg-transparent hover:bg-background text-muted-foreground hover:text-foreground h-12 px-5 font-medium shrink-0"
                                >
                                  Usar padrão
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Vincular documento da Autentique */}
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <h4 className="font-expanded text-[9px] tracking-widest text-muted-foreground uppercase">Vincular documento da Autentique</h4>
                            <p className="text-muted-foreground/70 font-light text-xs leading-relaxed">Cole o link do contrato na Autentique (ou o ID do documento). O status é consultado automaticamente, somente leitura — nada é enviado ou alterado.</p>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative flex-1">
                              <FileSignature className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" strokeWidth={1.5} />
                              <Input
                                value={contratoLinkInput}
                                onChange={(e) => setContratoLinkInput(e.target.value)}
                                placeholder="https://painel.autentique.com.br/documentos/..."
                                className="bg-background border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 pl-10 text-foreground placeholder:text-muted-foreground/40 font-mono text-sm"
                              />
                            </div>
                            <div className="flex gap-3">
                              <Button
                                onClick={() => mutarContrato(contratoLinkInput.trim() || null, "Contrato salvo")}
                                disabled={atualizarPaciente.isPending || contratoLinkInput.trim() === (data.paciente.contratoAutentiqueId ?? "")}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-12 px-6 font-medium shrink-0"
                              >
                                {atualizarPaciente.isPending ? "Salvando..." : "Salvar"}
                              </Button>
                              {data.paciente.contratoAutentiqueId && (
                                <Button
                                  variant="outline"
                                  onClick={() => mutarContrato(null, "Vínculo do contrato removido")}
                                  disabled={atualizarPaciente.isPending}
                                  className="rounded-none border-border bg-transparent hover:bg-background text-muted-foreground hover:text-foreground h-12 px-5 font-medium shrink-0"
                                >
                                  Limpar
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    {data.paciente.contratoVerificadoEm && (
                      <p className="font-mono text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                        Última verificação: {format(parseISO(data.paciente.contratoVerificadoEm), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </motion.section>
                  </TabsContent>

                  <TabsContent value="termo" className="space-y-16 mt-6 focus-visible:outline-none">
              {/* SECTION 7: TERMO DE CONSENTIMENTO (TCLE) — acompanhamento do status.
                  A geração agora vive na área "Geração de documentos" (/documentos). */}
              <motion.section variants={itemVariants}>
                <SectionHeader num="07" title="Termo de Consentimento (TCLE)" />
                <Card className="bg-card border-transparent rounded-none">
                  <CardContent className="p-8 space-y-6">
                    <div className="border border-border/60 bg-background/40 p-4 flex items-center justify-between gap-4 flex-wrap">
                      <p className="text-sm text-muted-foreground font-light leading-relaxed">
                        A geração do termo foi movida para a área{" "}
                        <span className="text-foreground">Geração de documentos</span>. Aqui você acompanha o link e o status da assinatura.
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => setLocation(`/documentos?paciente=${id}&tipo=termo`)}
                        className="rounded-none border-border bg-transparent hover:bg-background text-muted-foreground hover:text-accent h-10 px-4 gap-2 shrink-0"
                      >
                        <FilePlus className="w-4 h-4" strokeWidth={1.5} />
                        Gerar termo
                      </Button>
                    </div>
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-4 flex-wrap">
                        <Badge variant="outline" className={`rounded-none font-expanded text-[9px] uppercase tracking-widest px-3 py-1 border inline-flex items-center ${contratoVisual(data.paciente.termoStatus).className}`}>
                          {data.paciente.termoStatus === "assinado" && <Check className="w-3 h-3 mr-1.5 text-accent" strokeWidth={2.5} />}
                          {contratoVisual(data.paciente.termoStatus).label}
                        </Badge>
                        {data.paciente.termoStatus === "assinado" && data.paciente.termoAssinadoEm && (
                          <span className="font-mono text-xs text-muted-foreground">
                            Assinado em {format(parseISO(data.paciente.termoAssinadoEm), "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                        )}
                      </div>
                      {data.paciente.termoAutentiqueId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => refetch()}
                          disabled={isRefetching}
                          className="h-8 px-3 rounded-none bg-transparent border border-border hover:bg-background text-muted-foreground hover:text-foreground"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 mr-2 ${isRefetching ? "animate-spin text-accent" : ""}`} strokeWidth={1.5} />
                          <span className="font-expanded text-[9px] uppercase tracking-widest">Atualizar</span>
                        </Button>
                      )}
                    </div>

                    {/* Assinaturas POR PARTE do termo (paciente + médico). */}
                    {geracaoTermoEnviada && (
                      <PainelAssinaturas geracaoId={geracaoTermoEnviada.id} enviado />
                    )}

                    {data.paciente.termoStatus === "assinado" && (
                      <div className="flex flex-col sm:flex-row gap-3 pt-1">
                        <Button
                          onClick={() => acessarTermo("abrir")}
                          disabled={termoBaixando !== null}
                          className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-11 px-6 font-medium"
                        >
                          <Eye className="w-4 h-4 mr-2" strokeWidth={1.5} />
                          {termoBaixando === "abrir" ? "Abrindo..." : "Abrir termo"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => acessarTermo("baixar")}
                          disabled={termoBaixando !== null}
                          className="rounded-none border-border bg-transparent hover:bg-background text-muted-foreground hover:text-foreground h-11 px-6 font-medium"
                        >
                          <Download className="w-4 h-4 mr-2" strokeWidth={1.5} />
                          {termoBaixando === "baixar" ? "Baixando..." : "Baixar PDF"}
                        </Button>
                      </div>
                    )}

                    {data.paciente.termoStatus === "indisponivel" && (
                      <p className="text-sm text-muted-foreground font-light leading-relaxed">
                        Não foi possível ler o status na Autentique. Verifique se o link/ID está correto e se o documento ainda existe.
                      </p>
                    )}

                    {/* Link de assinatura do termo (para a paciente) */}
                    <div className="border-t border-border/60 pt-6 space-y-4">
                      <div className="space-y-1">
                        <h3 className="font-expanded text-[10px] tracking-widest text-muted-foreground uppercase">Link de assinatura</h3>
                        <p className="text-muted-foreground/80 font-light text-sm leading-relaxed">
                          Link que a paciente usa para assinar o TCLE. Preenchido automaticamente pela Autentique; informe um link manual para sobrescrever.
                        </p>
                      </div>

                      {data.paciente.termoLinkAssinatura ? (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          <code className="flex-1 min-w-0 truncate bg-background border border-border px-3 py-3 font-mono text-xs text-foreground">
                            {data.paciente.termoLinkAssinatura}
                          </code>
                          <div className="flex gap-3 shrink-0">
                            <Button
                              variant="outline"
                              onClick={() => window.open(data.paciente.termoLinkAssinatura!, "_blank")}
                              className="rounded-none border-border bg-transparent hover:bg-background text-muted-foreground hover:text-foreground h-11 px-5 font-medium"
                            >
                              <ExternalLink className="w-4 h-4 mr-2" strokeWidth={1.5} />
                              Abrir
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleCopy(data.paciente.termoLinkAssinatura!, "link-assinatura-termo")}
                              className="rounded-none border-border bg-transparent hover:bg-background text-muted-foreground hover:text-foreground h-11 px-5 font-medium"
                            >
                              {copiedStates["link-assinatura-termo"] ? <Check className="w-4 h-4 mr-2 text-accent" /> : <Copy className="w-4 h-4 mr-2" />}
                              {copiedStates["link-assinatura-termo"] ? "Copiado" : "Copiar"}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground/70 font-light">
                          Nenhum link de assinatura disponível ainda.
                        </p>
                      )}
                    </div>

                    {/* Prazo de assinatura do termo */}
                    <div className="border-t border-border/60 pt-6 space-y-4">
                      <div className="space-y-1">
                        <h3 className="font-expanded text-[10px] tracking-widest text-muted-foreground uppercase">Prazo de assinatura</h3>
                        <p className="text-muted-foreground/80 font-light text-sm leading-relaxed">
                          Padrão: {config?.prazoAssinaturaDiasAntes ?? 2} dias antes da cirurgia. Defina uma data específica para sobrescrever apenas este termo.
                        </p>
                      </div>

                      {data.paciente.termoPrazo && (
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="inline-flex items-center font-mono text-sm text-foreground">
                            <CalendarClock className="w-4 h-4 mr-2 text-muted-foreground/60" strokeWidth={1.5} />
                            {format(parseISO(data.paciente.termoPrazo), "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Ajustes avançados — controles administrativos opcionais,
                        recolhidos por padrão para reduzir a densidade. Nada aqui
                        envia ou altera a Autentique (somente leitura). */}
                    <Collapsible className="border-t border-border/60">
                      <CollapsibleTrigger className="w-full flex items-center justify-between py-5 group">
                        <span className="flex items-center gap-2 font-expanded text-[10px] tracking-widest text-muted-foreground uppercase">
                          <Settings2 className="w-4 h-4 text-muted-foreground/60" strokeWidth={1.5} />
                          Ajustes avançados
                        </span>
                        <ChevronDown className="w-4 h-4 text-muted-foreground group-data-[state=open]:rotate-180 transition-transform" strokeWidth={1.5} />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-8 pb-2">
                        {/* Link de assinatura manual */}
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <h4 className="font-expanded text-[9px] tracking-widest text-muted-foreground uppercase">Link de assinatura manual</h4>
                            <p className="text-muted-foreground/70 font-light text-xs leading-relaxed">Sobrescreve o link automático que a paciente usa para assinar o TCLE.</p>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative flex-1">
                              <FileSignature className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" strokeWidth={1.5} />
                              <Input
                                value={linkTermoManualInput}
                                onChange={(e) => setLinkTermoManualInput(e.target.value)}
                                placeholder="Link manual (opcional) — sobrescreve o automático"
                                className="bg-background border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 pl-10 text-foreground placeholder:text-muted-foreground/40 font-mono text-sm"
                              />
                            </div>
                            <div className="flex gap-3">
                              <Button
                                onClick={() => mutarCamposTermo({ termoLinkAssinaturaManual: linkTermoManualInput.trim() || null }, "Link de assinatura do termo salvo")}
                                disabled={atualizarPaciente.isPending || linkTermoManualInput.trim() === (data.paciente.termoLinkAssinaturaManual ?? "")}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-12 px-6 font-medium shrink-0"
                              >
                                {atualizarPaciente.isPending ? "Salvando..." : "Salvar"}
                              </Button>
                              {data.paciente.termoLinkAssinaturaManual && (
                                <Button
                                  variant="outline"
                                  onClick={() => mutarCamposTermo({ termoLinkAssinaturaManual: null }, "Link manual do termo removido")}
                                  disabled={atualizarPaciente.isPending}
                                  className="rounded-none border-border bg-transparent hover:bg-background text-muted-foreground hover:text-foreground h-12 px-5 font-medium shrink-0"
                                >
                                  Limpar
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Prazo personalizado */}
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <h4 className="font-expanded text-[9px] tracking-widest text-muted-foreground uppercase">Prazo personalizado</h4>
                            <p className="text-muted-foreground/70 font-light text-xs leading-relaxed">Sobrescreve o padrão de {config?.prazoAssinaturaDiasAntes ?? 2} dias antes da cirurgia apenas para este termo.</p>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative flex-1 sm:max-w-xs">
                              <Input
                                type="date"
                                min={format(new Date(), "yyyy-MM-dd")}
                                value={prazoTermoOverrideInput}
                                onChange={(e) => setPrazoTermoOverrideInput(e.target.value)}
                                className="bg-background border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 text-foreground placeholder:text-muted-foreground/40 font-mono text-sm"
                              />
                            </div>
                            <div className="flex gap-3">
                              <Button
                                onClick={() => mutarCamposTermo({ termoPrazoOverride: prazoTermoOverrideInput.trim() || null }, "Prazo do termo salvo")}
                                disabled={atualizarPaciente.isPending || prazoTermoOverrideInput.trim() === (data.paciente.termoPrazoOverride ?? "")}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-12 px-6 font-medium shrink-0"
                              >
                                {atualizarPaciente.isPending ? "Salvando..." : "Salvar"}
                              </Button>
                              {data.paciente.termoPrazoOverride && (
                                <Button
                                  variant="outline"
                                  onClick={() => mutarCamposTermo({ termoPrazoOverride: null }, "Prazo personalizado do termo removido")}
                                  disabled={atualizarPaciente.isPending}
                                  className="rounded-none border-border bg-transparent hover:bg-background text-muted-foreground hover:text-foreground h-12 px-5 font-medium shrink-0"
                                >
                                  Usar padrão
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Vincular documento da Autentique */}
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <h4 className="font-expanded text-[9px] tracking-widest text-muted-foreground uppercase">Vincular documento da Autentique</h4>
                            <p className="text-muted-foreground/70 font-light text-xs leading-relaxed">Cole o link do TCLE na Autentique (ou o ID do documento). O status é consultado automaticamente, somente leitura — nada é enviado ou alterado.</p>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative flex-1">
                              <FileSignature className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" strokeWidth={1.5} />
                              <Input
                                value={termoLinkInput}
                                onChange={(e) => setTermoLinkInput(e.target.value)}
                                placeholder="https://painel.autentique.com.br/documentos/..."
                                className="bg-background border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 pl-10 text-foreground placeholder:text-muted-foreground/40 font-mono text-sm"
                              />
                            </div>
                            <div className="flex gap-3">
                              <Button
                                onClick={() => mutarTermo(termoLinkInput.trim() || null, "TCLE salvo")}
                                disabled={atualizarPaciente.isPending || termoLinkInput.trim() === (data.paciente.termoAutentiqueId ?? "")}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-12 px-6 font-medium shrink-0"
                              >
                                {atualizarPaciente.isPending ? "Salvando..." : "Salvar"}
                              </Button>
                              {data.paciente.termoAutentiqueId && (
                                <Button
                                  variant="outline"
                                  onClick={() => mutarTermo(null, "Vínculo do TCLE removido")}
                                  disabled={atualizarPaciente.isPending}
                                  className="rounded-none border-border bg-transparent hover:bg-background text-muted-foreground hover:text-foreground h-12 px-5 font-medium shrink-0"
                                >
                                  Limpar
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    {data.paciente.termoVerificadoEm && (
                      <p className="font-mono text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                        Última verificação: {format(parseISO(data.paciente.termoVerificadoEm), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </motion.section>
                  </TabsContent>

                  <TabsContent value="documentos" className="space-y-16 mt-6 focus-visible:outline-none">
              {/* SECTION 8: DOCUMENTOS (PDF) */}
              <motion.section variants={itemVariants}>
                <SectionHeader
                  num="08"
                  title="Documentos (PDF)"
                  desc="Pedidos médicos e outros PDFs que a paciente poderá abrir e baixar na página dela. Apenas PDF, até 20 MB."
                />
                <Card className="bg-card border-transparent rounded-none">
                  <CardContent className="p-8 space-y-6">
                    <input
                      ref={documentoInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void enviarDocumento(file);
                      }}
                    />
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <p className="text-muted-foreground font-light text-sm leading-relaxed max-w-xl">
                        Os arquivos ficam disponíveis na página pública da paciente para abrir ou baixar.
                      </p>
                      <Button
                        onClick={() => documentoInputRef.current?.click()}
                        disabled={enviandoDocumento}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-none h-11 px-6 font-medium shrink-0"
                      >
                        <UploadCloud className="w-4 h-4 mr-2" strokeWidth={1.5} />
                        {enviandoDocumento ? "Enviando..." : "Anexar PDF"}
                      </Button>
                    </div>

                    {documentosQuery.isLoading ? (
                      <Skeleton className="h-16 w-full bg-background rounded-none" />
                    ) : documentos.length === 0 ? (
                      <div className="border border-dashed border-border px-6 py-10 text-center">
                        <FileText className="w-6 h-6 mx-auto mb-3 text-muted-foreground/50" strokeWidth={1.5} />
                        <p className="text-sm text-muted-foreground font-light">
                          Nenhum documento anexado ainda.
                        </p>
                      </div>
                    ) : (
                      <ul className="divide-y divide-border border border-border">
                        {documentos.map((doc) => (
                          <li
                            key={doc.id}
                            className="flex items-center justify-between gap-4 p-4 flex-wrap bg-background"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <FileText className="w-5 h-5 text-accent shrink-0" strokeWidth={1.5} />
                              <div className="min-w-0">
                                <p className="text-sm text-foreground font-medium truncate">{doc.rotulo}</p>
                                <p className="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-wider truncate">
                                  {doc.nomeArquivo} · {formatarTamanho(doc.tamanho)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => acessarDocumento(doc, "abrir")}
                                disabled={documentoAcao !== null}
                                className="h-8 px-3 rounded-none bg-transparent border border-border hover:bg-card text-muted-foreground hover:text-foreground"
                              >
                                <Eye className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
                                <span className="font-expanded text-[9px] uppercase tracking-widest">
                                  {documentoAcao === `${doc.id}:abrir` ? "Abrindo" : "Abrir"}
                                </span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => acessarDocumento(doc, "baixar")}
                                disabled={documentoAcao !== null}
                                className="h-8 px-3 rounded-none bg-transparent border border-border hover:bg-card text-muted-foreground hover:text-foreground"
                              >
                                <Download className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
                                <span className="font-expanded text-[9px] uppercase tracking-widest">
                                  {documentoAcao === `${doc.id}:baixar` ? "Baixando" : "Baixar"}
                                </span>
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={removendoDocumento === doc.id}
                                    className="h-8 px-3 rounded-none bg-transparent border border-border hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="rounded-none">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remover documento?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      "{doc.rotulo}" deixará de aparecer na página da paciente. Esta ação não pode ser desfeita.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel className="rounded-none">Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => excluirDocumento(doc)}
                                      className="rounded-none bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                    >
                                      Remover
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </motion.section>

                  </TabsContent>

                  <TabsContent value="conteudo" className="space-y-16 mt-6 focus-visible:outline-none">
              {/* SECTION 8: CONTEÚDO DA PÁGINA */}
              <motion.section variants={itemVariants}>
                <SectionHeader
                  num="08"
                  title="Conteúdo da Página"
                  desc="O que esta paciente vê na página pública. Por padrão herda o conteúdo global; você pode personalizar só para ela."
                />
                <Card className="bg-card border-transparent rounded-none">
                  <CardContent className="p-8 space-y-6">
                    {loadingConteudo || !conteudoSecoes ? (
                      <Skeleton className="h-24 w-full bg-background rounded-none" />
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          <Badge
                            variant="outline"
                            className={`rounded-none font-expanded text-[9px] uppercase tracking-widest px-3 py-1 border ${
                              conteudo?.personalizado
                                ? "bg-card text-accent border-accent/60"
                                : "bg-card text-muted-foreground border-muted-foreground/30"
                            }`}
                          >
                            {conteudo?.personalizado ? "Personalizado" : "Padrão global"}
                          </Badge>
                          {!editandoConteudo && (
                            <div className="flex gap-3">
                              <Button
                                variant="outline"
                                onClick={() => setEditandoConteudo(true)}
                                className="rounded-none border-border bg-transparent hover:bg-background text-muted-foreground hover:text-foreground h-10 px-5 font-medium"
                              >
                                <Pencil className="w-3.5 h-3.5 mr-2" strokeWidth={1.5} />
                                Personalizar
                              </Button>
                              {conteudo?.personalizado && (
                                <Button
                                  variant="outline"
                                  onClick={reverterConteudoPaciente}
                                  disabled={removerConteudo.isPending}
                                  className="rounded-none border-border bg-transparent hover:bg-background text-muted-foreground hover:text-foreground h-10 px-5 font-medium"
                                >
                                  <RotateCcw className="w-3.5 h-3.5 mr-2" strokeWidth={1.5} />
                                  {removerConteudo.isPending ? "Revertendo..." : "Reverter ao padrão"}
                                </Button>
                              )}
                            </div>
                          )}
                        </div>

                        {editandoConteudo ? (
                          <div className="space-y-6">
                            <SecoesEditor
                              secoes={conteudoSecoes}
                              onChange={setConteudoSecoes}
                              dadosPreview={dadosPreview}
                              slotPreparo={uploadPedidoExamesUI}
                              slotPreparoPele={uploadReceitaUI}
                              slotReceituario={uploadReceituarioUI}
                            />
                            <div className="flex items-center justify-end gap-3 border-t border-border pt-6">
                              <Button
                                variant="outline"
                                onClick={() =>
                                  tentarDescartar(() => {
                                    setConteudoSecoes(conteudo?.secoes ?? []);
                                    setEditandoConteudo(false);
                                  })
                                }
                                disabled={atualizarConteudo.isPending}
                                className="rounded-none border-border bg-transparent hover:bg-background text-muted-foreground hover:text-foreground h-11 px-6 font-medium"
                              >
                                Cancelar
                              </Button>
                              <Button
                                onClick={salvarConteudoPaciente}
                                disabled={atualizarConteudo.isPending}
                                className="rounded-none bg-primary hover:bg-primary/90 text-primary-foreground font-medium h-11 px-6"
                              >
                                {atualizarConteudo.isPending ? "Salvando..." : "Salvar personalização"}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-muted-foreground font-light text-sm leading-relaxed">
                              {conteudo?.personalizado
                                ? "Esta paciente tem um conteúdo personalizado. Reverter ao padrão remove a personalização."
                                : "Esta paciente segue o conteúdo padrão global. Ao personalizar, você edita uma cópia só dela."}
                            </p>
                            <ul className="flex flex-wrap gap-2 pt-2">
                              {conteudoSecoes.map((s) => (
                                <li
                                  key={s.id}
                                  className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground border border-border px-2.5 py-1"
                                >
                                  {s.titulo || s.tipo}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </motion.section>

                  </TabsContent>

                  <TabsContent value="historico" className="space-y-16 mt-6 focus-visible:outline-none">
              {/* SECTION 9: HISTÓRICO DE EDIÇÕES */}
              <motion.section variants={itemVariants}>
                <SectionHeader num="09" title="Histórico de Edições" />
                {loadingHistorico ? (
                  <Skeleton className="h-24 w-full bg-card rounded-none" />
                ) : historico && historico.length > 0 ? (
                  <ol className="relative border-l border-border ml-2 space-y-8">
                    {historico.map((registro) => (
                      <li key={registro.id} className="relative pl-8">
                        <span className="absolute -left-[5px] top-1.5 w-2 h-2 bg-accent rotate-45"></span>
                        <time className="font-mono text-xs text-muted-foreground">
                          {format(parseISO(registro.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </time>
                        <ul className="mt-3 space-y-2">
                          {registro.alteracoes.map((alt, idx) => (
                            <li key={idx} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                              <span className="font-expanded text-[9px] tracking-widest text-muted-foreground uppercase">{alt.rotulo}</span>
                              <span className="text-muted-foreground font-light line-through opacity-70">{alt.de}</span>
                              <ArrowRight className="w-3.5 h-3.5 text-accent" strokeWidth={1.5} />
                              <span className="text-foreground font-light">{alt.para}</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="border border-dashed border-border py-10 text-center">
                    <p className="text-muted-foreground font-light">Nenhuma edição registrada até o momento.</p>
                  </div>
                )}
              </motion.section>

                  </TabsContent>

                  <TabsContent value="posop" className="space-y-16 mt-6 focus-visible:outline-none">
              {/* SECTION 9: MARCOS PÓS-OPERATÓRIOS (manuais) */}
              <motion.section variants={itemVariants} className="space-y-6">
                <SectionHeader
                  num="09"
                  title="Marcos pós-operatórios"
                  desc="Marque a retirada de pontos e os retornos conforme acontecem. São o único trecho da jornada da equipe registrado manualmente."
                />
                <PosOpMarcos paciente={data.paciente} jornada={config?.jornadaEquipe ?? []} />
              </motion.section>

              {/* SECTION 10: CHECK-INS DE RECUPERAÇÃO — oculta por enquanto.
                  Reative removendo o `false &&` quando o fluxo de check-ins
                  (fotos da paciente / status por dia) entrar em uso. */}
              {false && (
              <motion.section variants={itemVariants} className="space-y-6">
                <SectionHeader
                  num="10"
                  title="Check-ins de recuperação"
                  desc="Acompanhamento por dia (foto, retorno, NPS). A paciente envia as fotos pela página dela; aqui você marca status, anota e sinaliza atenção."
                />
                <PosOpStaff pacienteId={id} />
              </motion.section>
              )}
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </motion.div>
        ) : null}
      </main>

      <DiscardChangesDialog
        open={descartarAberto}
        onOpenChange={setDescartarAberto}
        onConfirm={() => {
          setDescartarAberto(false);
          acaoPendente.current();
        }}
      />
    </div>
  );
}