import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useListarContratoModelos,
  getListarContratoModelosQueryKey,
  useListarContratosGeracao,
  getListarContratosGeracaoQueryKey,
  useListarVariaveisContrato,
  getListarVariaveisContratoQueryKey,
  useObterDocumentoContexto,
  getObterDocumentoContextoQueryKey,
  useGerarContrato,
  preverContrato,
  useRevisarPreviaContrato,
  type PreviaContratoInput,
  useEditarContratoGeracao,
  useDefinirDecisoesContrato,
  useAprovarEEnviarContrato,
  useUploadContrato,
  useObterPaciente,
  getObterPacienteQueryKey,
  useObterConfig,
  useListarMedicos,
  useAtualizarPaciente,
  getListarPacientesQueryKey,
  getResumoPacientesQueryKey,
  getListarHistoricoPacienteQueryKey,
  type ContratoGeracao,
  type ContratoModelo,
  type RelatorioRevisao,
  type DecisaoRegiaoInput,
  type DocumentoContextoGrupo,
  type Paciente,
  type Medico,
  type PacienteUpdate,
} from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { MEDICO_PERSONALIZADO, diasUteisAntes } from "@/lib/paciente-form-utils";
import {
  Sparkles,
  Send,
  Check,
  AlertTriangle,
  FileText,
  ShieldCheck,
  ScrollText,
  GitCompare,
  Loader2,
  RotateCcw,
  RefreshCw,
  ClipboardList,
  Download,
  SquarePen,
  CircleCheck,
  Circle,
  Wallet,
  Plus,
  Upload,
  FileUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EditorDocumento } from "@/components/editor-documento";
import { DecisoesPainel } from "@/components/decisoes-painel";
import { CriacaoIaDocumento } from "@/components/criacao-ia-documento";
import { RefinamentoIaPanel } from "@/components/refinamento-ia-panel";
import { useUpload } from "@workspace/object-storage-web";
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
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

/** Upload de contrato pronto: só PDF, limite de 20 MB (alinhado ao backend). */
const TIPO_PDF = "application/pdf";
const TAMANHO_MAXIMO_DOC = 20 * 1024 * 1024;

/**
 * Botão de download do PDF do documento (rascunho ou já aprovado). Aponta para o
 * endpoint que renderiza o PDF a partir do corpo SALVO no servidor; por isso,
 * com edições não salvas (`desabilitado`), fica inativo com a dica de salvar
 * antes — evitando baixar uma versão diferente da que está na tela. É só leitura
 * (não envia nada para fora).
 */
function BaixarPdf({ id, desabilitado }: { id: number; desabilitado: boolean }) {
  const base =
    "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-none border text-sm font-medium transition-colors";
  if (desabilitado) {
    return (
      <span
        aria-disabled="true"
        title="Salve as edições para baixar a versão atual"
        className={`${base} border-border/60 text-muted-foreground/40 cursor-default`}
      >
        <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
        Baixar PDF
      </span>
    );
  }
  return (
    <a
      href={`/api/contratos/${id}/pdf`}
      download
      className={`${base} border-border bg-transparent text-foreground hover:bg-background`}
    >
      <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
      Baixar PDF
    </a>
  );
}

const FRENTE_ICONE = {
  clausulas: ScrollText,
  consistencia: GitCompare,
  conformidade: ShieldCheck,
} as const;

/** Rótulo humano do papel do signatário. */
function rotuloPapel(papel: string): string {
  switch (papel) {
    case "paciente":
      return "Paciente";
    case "representante":
      return "Representante legal";
    case "medico":
      return "Médico";
    default:
      return papel;
  }
}

interface ParteAssinatura {
  papel: string;
  nome: string;
  email: string;
  status: "assinado" | "pendente" | "recusado";
  em: string | null;
}

/**
 * Visualização POR PARTE do documento enviado: "criado → assinado por cada
 * signatário". Consulta o status ao vivo da Autentique (endpoint por geração,
 * que casa cada assinatura ao seu papel). Só aparece após o envio.
 */
export function PainelAssinaturas({
  geracaoId,
  enviado,
}: {
  geracaoId: number;
  enviado: boolean;
}) {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["contrato-assinaturas-geracao", geracaoId],
    queryFn: async () => {
      const r = await fetch(`/api/contratos/${geracaoId}/assinaturas`);
      if (!r.ok) throw new Error("Falha ao carregar assinaturas");
      return (await r.json()) as {
        enviado: boolean;
        disponivel: boolean;
        partes: ParteAssinatura[];
      };
    },
    enabled: enviado,
    refetchOnWindowFocus: true,
  });

  if (!enviado) return null;

  const partes = data?.partes ?? [];

  return (
    <div className="border border-border/60 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-expanded text-[10px] tracking-widest uppercase text-foreground">
          Andamento das assinaturas
        </h4>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-[10px] font-expanded uppercase tracking-widest"
        >
          <RefreshCw
            className={`w-3 h-3 ${isFetching ? "animate-spin text-accent" : ""}`}
            strokeWidth={1.5}
          />
          Atualizar
        </button>
      </div>

      <ol className="space-y-3">
        {/* Documento criado — sempre concluído quando enviado. */}
        <li className="flex items-center gap-3">
          <CircleCheck className="w-4 h-4 text-accent shrink-0" strokeWidth={1.8} />
          <span className="text-sm text-foreground font-light">
            Documento criado na Autentique
          </span>
        </li>

        {partes.length === 0 && data?.disponivel === false && (
          <li className="text-[11px] text-muted-foreground/70 font-light pl-7">
            Não foi possível ler o status na Autentique agora. Tente atualizar.
          </li>
        )}

        {partes.map((p, i) => {
          const assinado = p.status === "assinado";
          const recusado = p.status === "recusado";
          return (
            <li key={`${p.papel}-${i}`} className="flex items-start gap-3">
              {assinado ? (
                <CircleCheck className="w-4 h-4 text-accent shrink-0 mt-0.5" strokeWidth={1.8} />
              ) : recusado ? (
                <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" strokeWidth={2} />
              ) : (
                <span className="w-4 h-4 rounded-full border border-amber-500/60 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground font-light">
                  {assinado
                    ? "Assinado por"
                    : recusado
                      ? "Recusado por"
                      : "Aguardando"}{" "}
                  <span className="text-muted-foreground">
                    {rotuloPapel(p.papel)}
                  </span>
                </p>
                <p className="text-[11px] text-muted-foreground/70 font-light truncate">
                  {p.nome || p.email || "—"}
                  {assinado && p.em
                    ? ` · ${format(parseISO(p.em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
                    : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function statusVisual(status: ContratoGeracao["status"]) {
  switch (status) {
    case "rascunho":
      return { label: "Rascunho", className: "text-muted-foreground border-border" };
    case "aprovado":
      return { label: "Aprovado", className: "text-accent border-accent/40" };
    case "enviado":
      return { label: "Enviado à Autentique", className: "text-accent border-accent/40" };
    case "falha_envio":
      return { label: "Falha no envio", className: "text-red-400 border-red-400/40" };
  }
}

/**
 * Prévia do documento renderizada como HTML ESTÁTICO (não o editor). Preserva os
 * marcadores `<span data-var="chave">` do backend — usados para rolar até e
 * destacar o trecho quando o operador foca o campo correspondente na ficha
 * (`focoChave`). Reusa a "folha" e os estilos `.editor-doc` para ficar idêntica
 * ao documento final.
 */
function PreviaDocumento({
  html,
  focoChave,
}: {
  html: string;
  focoChave: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const cont = ref.current;
    if (!cont || !focoChave) return;
    const alvo = cont.querySelector<HTMLElement>(`[data-var="${focoChave}"]`);
    if (!alvo) return;
    alvo.scrollIntoView({ behavior: "smooth", block: "center" });
    alvo.classList.add("var-foco");
    const t = setTimeout(() => alvo.classList.remove("var-foco"), 1800);
    return () => clearTimeout(t);
  }, [focoChave, html]);
  return (
    <div className="overflow-hidden border border-border bg-muted/20">
      <div className="px-3 py-4 sm:px-6 sm:py-6">
        <div
          ref={ref}
          className="editor-doc mx-auto w-full max-w-[44rem] border border-border/50 bg-background px-6 py-8 shadow-sm sm:px-10 sm:py-10"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}

function RelatorioIa({ relatorio }: { relatorio: RelatorioRevisao }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" strokeWidth={1.5} />
          <span className="font-expanded text-[10px] tracking-widest uppercase text-muted-foreground">
            Revisão de IA
          </span>
        </div>
        {relatorio.alertas > 0 ? (
          <Badge
            variant="outline"
            className="rounded-none font-expanded text-[9px] uppercase tracking-widest px-3 py-1 border text-amber-500 border-amber-500/40 inline-flex items-center"
          >
            <AlertTriangle className="w-3 h-3 mr-1.5" strokeWidth={2} />
            {relatorio.alertas} {relatorio.alertas === 1 ? "ponto de atenção" : "pontos de atenção"}
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="rounded-none font-expanded text-[9px] uppercase tracking-widest px-3 py-1 border text-accent border-accent/40 inline-flex items-center"
          >
            <Check className="w-3 h-3 mr-1.5" strokeWidth={2.5} />
            Sem alertas
          </Badge>
        )}
      </div>

      <p className="text-sm text-muted-foreground font-light leading-relaxed border-l-2 border-border pl-4">
        {relatorio.resumoGeral}
      </p>

      <div className="space-y-4">
        {relatorio.frentes.map((frente) => {
          const Icone = FRENTE_ICONE[frente.chave] ?? FileText;
          return (
            <div key={frente.chave} className="border border-border/60 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Icone className="w-4 h-4 text-accent" strokeWidth={1.5} />
                <h4 className="font-expanded text-[10px] tracking-widest uppercase text-foreground">
                  {frente.titulo}
                </h4>
              </div>
              <p className="text-xs text-muted-foreground font-light leading-relaxed">
                {frente.resumo}
              </p>
              {frente.itens.length > 0 && (
                <ul className="space-y-2.5 pt-1">
                  {frente.itens.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      {item.status === "atencao" ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" strokeWidth={2} />
                      ) : (
                        <Check className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" strokeWidth={2} />
                      )}
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-xs text-foreground font-light leading-snug">
                          <span className="font-medium">{item.rotulo}:</span> {item.observacao}
                        </p>
                        {item.sugestao && (
                          <p className="text-[11px] text-accent/90 font-light leading-snug">
                            Sugestão: {item.sugestao}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <p className="font-mono text-[10px] text-muted-foreground/50 uppercase tracking-wider">
        {relatorio.modelo} · {format(parseISO(relatorio.geradoEm), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
      </p>
    </div>
  );
}

type DocumentoTipo = ContratoGeracao["tipo"];

/** Textos por tipo de documento (contrato vs termo). Ambos masculinos em PT. */
const TEXTOS: Record<
  DocumentoTipo,
  {
    nome: string;
    Nome: string;
    plural: string;
    vazioGerados: string;
    criadoAutentique: string;
  }
> = {
  contrato: {
    nome: "contrato",
    Nome: "Contrato",
    plural: "Contratos gerados",
    vazioGerados: "Nenhum contrato gerado ainda para esta paciente.",
    criadoAutentique:
      "Contrato criado na Autentique. O acompanhamento de status fica na seção abaixo.",
  },
  termo: {
    nome: "termo de consentimento",
    Nome: "Termo de consentimento",
    plural: "Termos (TCLE) gerados",
    vazioGerados:
      "Nenhum termo de consentimento gerado ainda para esta paciente.",
    criadoAutentique:
      "Termo de consentimento criado na Autentique. O acompanhamento de status fica na seção abaixo.",
  },
};

/**
 * Resumo (somente leitura) dos dados já resolvidos e formatados pelo servidor —
 * a MESMA fonte do PDF, então nunca diverge do documento final. Reutilizado pela
 * ficha do termo (TCLE) e pela confirmação ("o que vai no contrato") da ficha
 * editável. Para o termo ocultamos o grupo de Valores (consentimento não trata
 * de pagamento). Reage às invalidações de `getObterDocumentoContexto`, logo se
 * atualiza sozinho assim que a ficha editável salva.
 */
function ResumoDocumentoResolvido({
  pacienteId,
  tipo,
}: {
  pacienteId: number;
  tipo: DocumentoTipo;
}) {
  const {
    data: grupos,
    isLoading,
    isError,
  } = useObterDocumentoContexto(pacienteId, {
    query: { queryKey: getObterDocumentoContextoQueryKey(pacienteId) },
  });

  const grupablesVisiveis = useMemo<DocumentoContextoGrupo[]>(
    () =>
      (grupos ?? []).filter((g) =>
        tipo === "termo" ? g.chave !== "valores" : true,
      ),
    [grupos, tipo],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-24 bg-background rounded-none" />
        <Skeleton className="h-16 w-full bg-background rounded-none" />
      </div>
    );
  }
  if (isError) {
    return (
      <p className="text-xs text-muted-foreground/70 font-light border border-dashed border-border p-4">
        Não foi possível carregar os dados da paciente. Você ainda pode gerar o
        rascunho — os dados são preenchidos no servidor.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      {grupablesVisiveis.map((grupo) => (
        <div key={grupo.chave} className="space-y-3">
          <h5 className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground/70 border-b border-border/40 pb-2">
            {grupo.titulo}
          </h5>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3.5">
            {grupo.campos.map((campo) => {
              const vazio = campo.valor.trim() === "" || campo.valor === "—";
              const largo = campo.valor.length > 36;
              return (
                <div
                  key={campo.rotulo}
                  className={`space-y-0.5 min-w-0 ${largo ? "sm:col-span-2" : ""}`}
                >
                  <dt className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground/60">
                    {campo.rotulo}
                  </dt>
                  <dd
                    className={`text-sm font-light leading-snug break-words ${
                      vazio
                        ? "text-muted-foreground/40 italic"
                        : "text-foreground"
                    }`}
                  >
                    {campo.valor}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
    </div>
  );
}

/**
 * Ficha (somente leitura) dos dados que vão preencher a primeira versão do
 * documento. Usada para o TERMO (TCLE), que é só leitura: a equipe corrige na
 * página da paciente, se necessário. (O contrato usa `FichaContratoEditavel`.)
 */
function FichaInputs({
  pacienteId,
  tipo,
}: {
  pacienteId: number;
  tipo: DocumentoTipo;
}) {
  const t = TEXTOS[tipo];
  const [, setLocation] = useLocation();

  return (
    <div className="border border-border/60 p-5 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-accent" strokeWidth={1.5} />
            <h4 className="font-expanded text-[10px] tracking-widest uppercase text-foreground">
              Confira antes de gerar
            </h4>
          </div>
          <p className="text-xs text-muted-foreground font-light leading-relaxed">
            São os principais dados que preenchem a primeira versão do {t.nome}.
            Campos vazios aparecem como "—". Se algo estiver errado, corrija na
            página da paciente e volte.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setLocation(`/paciente/${pacienteId}`)}
          className="rounded-none border-border bg-transparent hover:bg-background text-muted-foreground hover:text-accent h-9 px-3 gap-2 shrink-0"
        >
          <SquarePen className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span className="font-expanded text-[9px] tracking-widest uppercase">
            Editar dados
          </span>
        </Button>
      </div>

      <ResumoDocumentoResolvido pacienteId={pacienteId} tipo={tipo} />
    </div>
  );
}

/** Subconjunto dos dados da paciente que a vendedora ajusta direto no contrato. */
const fichaContratoSchema = z
  .object({
    procedimentos: z
      .array(z.string())
      .min(1, "Escolha ou descreva ao menos um procedimento."),
    valorSinal: z.coerce.number().min(0, "Valor inválido"),
    valorPendente: z.coerce.number().min(0, "Valor inválido").default(0),
    dataPagamentoPendente: z.string().default(""),
    medicoId: z.string().default(MEDICO_PERSONALIZADO),
    medica: z.string().min(1, "Médica é obrigatória"),
    crm: z.string().default(""),
    rqe: z.string().default(""),
    clinica: z.string().default(""),
  })
  .refine(
    (d) =>
      !(d.valorPendente > 0) || d.dataPagamentoPendente.trim().length > 0,
    {
      path: ["dataPagamentoPendente"],
      message: "Informe o vencimento do saldo pendente.",
    },
  );

type FichaContratoValues = z.infer<typeof fichaContratoSchema>;

/** Converte os dados persistidos da paciente nos valores da ficha do contrato. */
function valoresFichaContrato(p: Paciente): FichaContratoValues {
  return {
    procedimentos: p.procedimentos,
    valorSinal: p.valorSinal,
    valorPendente: p.valorPendente,
    dataPagamentoPendente: p.dataPagamentoPendente ?? "",
    medicoId: p.medicoId != null ? String(p.medicoId) : MEDICO_PERSONALIZADO,
    medica: p.medica,
    crm: p.crm,
    rqe: p.rqe,
    clinica: p.clinica,
  };
}

/** Item da lista de prontidão exibida antes de liberar "Gerar rascunho". */
export type ItemProntidao = { rotulo: string; ok: boolean };
export type ProntidaoContrato = {
  ok: boolean;
  sujo: boolean;
  itens: ItemProntidao[];
};

/**
 * Ficha EDITÁVEL do contrato: a vendedora ajusta pagamento, procedimentos e
 * médica/clínica sem sair para a página da paciente. Salva via PATCH
 * /pacientes/:id (mesmo endpoint da edição completa) e o resumo abaixo —
 * resolvido pelo servidor, fonte do PDF — se atualiza ao salvar. Reporta a
 * prontidão (checklist de boas práticas) para o pai travar a geração enquanto
 * houver pendências ou edições não salvas.
 */
function FichaContratoEditavel({
  pacienteId,
  onProntidaoChange,
  onCampoFoco,
  onValoresChange,
}: {
  pacienteId: number;
  onProntidaoChange: (p: ProntidaoContrato) => void;
  /** Avisa qual variável ({{chave}}) o campo focado corresponde, para a prévia
   *  rolar até o trecho. `null` ao sair do campo. */
  onCampoFoco?: (chave: string | null) => void;
  /** Emite os valores ATUAIS da ficha (mesmo não salvos) para a prévia ao vivo. */
  onValoresChange?: (valores: FichaContratoValues) => void;
}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: detalhe } = useObterPaciente(pacienteId, {
    query: { queryKey: getObterPacienteQueryKey(pacienteId) },
  });
  const p = detalhe?.paciente;
  const { data: config } = useObterConfig();
  const { data: medicosAtivos } = useListarMedicos();
  const atualizar = useAtualizarPaciente();

  const [procedimentoCustom, setProcedimentoCustom] = useState("");

  const form = useForm<FichaContratoValues>({
    resolver: zodResolver(fichaContratoSchema),
    defaultValues: {
      procedimentos: [],
      valorSinal: 0,
      valorPendente: 0,
      dataPagamentoPendente: "",
      medicoId: MEDICO_PERSONALIZADO,
      medica: "",
      crm: "",
      rqe: "",
      clinica: "",
    },
  });

  // Espelha a edição completa: o médico vinculado (mesmo inativo) aparece na
  // lista para não desvincular quem já está no cadastro da paciente.
  const medicosEdicao = useMemo<Medico[]>(() => {
    const lista = medicosAtivos ?? [];
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
  }, [medicosAtivos, p]);

  // Carrega os valores salvos UMA vez (assim como o editor da paciente). Sem
  // isso, um reset a cada refetch descartaria as edições em andamento.
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    if (!pronto && p && config && medicosAtivos) {
      setPronto(true);
      form.reset(valoresFichaContrato(p));
    }
  }, [pronto, p, config, medicosAtivos, form]);

  // Espelha os valores ATUAIS do formulário para a prévia ao vivo — inclusive
  // edições ainda não salvas. Só após carregar (`pronto`), para a prévia não
  // piscar com os valores-padrão vazios antes do reset.
  useEffect(() => {
    if (!pronto || !onValoresChange) return;
    onValoresChange(form.getValues());
    const sub = form.watch((valores) =>
      onValoresChange(valores as FichaContratoValues),
    );
    return () => sub.unsubscribe();
  }, [pronto, form, onValoresChange]);

  const dirty = pronto && form.formState.isDirty;

  const medicoSelecionado = form.watch("medicoId");
  const personalizado = medicoSelecionado === MEDICO_PERSONALIZADO;
  const procedimentos = form.watch("procedimentos") ?? [];
  const valorSinal = form.watch("valorSinal");
  const valorPendente = form.watch("valorPendente");
  const dataPagamentoPendente = form.watch("dataPagamentoPendente");
  const medica = form.watch("medica");
  const crm = form.watch("crm");
  const clinica = form.watch("clinica");

  // Pré-preenche o vencimento do saldo (N dias úteis antes da cirurgia) quando há
  // saldo em aberto e o campo está vazio. O valor digitado é sempre preservado.
  // O servidor já calcula esse vencimento ao salvar (POST/PATCH), então na prática
  // um paciente pendente sempre carrega com data. Esta sugestão é defesa-em-camadas:
  // por isso marcamos `shouldDirty: true` — se algum paciente pendente chegar SEM
  // vencimento salvo, a sugestão deixa a ficha "suja", travando a geração até que a
  // vendedora salve (a data persistida é a fonte da verdade do PDF, não a sugestão
  // local). Para pacientes normais (já com data), o efeito não dispara e nada suja.
  const diasUteisVencimento = config?.vencimentoSaldoDiasUteisAntes;
  const dataCirurgia = p?.dataCirurgia ?? "";
  const [vencimentoSugerido, setVencimentoSugerido] = useState(false);
  useEffect(() => {
    if (diasUteisVencimento == null || !pronto) return;
    const atual = form.getValues("dataPagamentoPendente");
    if (valorPendente > 0 && !atual && dataCirurgia) {
      form.setValue(
        "dataPagamentoPendente",
        diasUteisAntes(dataCirurgia, diasUteisVencimento),
        { shouldValidate: true, shouldDirty: true },
      );
      setVencimentoSugerido(true);
    }
  }, [pronto, valorPendente, diasUteisVencimento, dataCirurgia, form]);

  const camposMedicoCls = (extra = "") =>
    `bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 text-foreground placeholder:text-muted-foreground/50 ${extra} ${personalizado ? "" : "opacity-60 cursor-not-allowed"}`;

  // Vencimento mínimo do seletor: por padrão hoje (evita escolher datas passadas
  // por engano ao criar uma cobrança nova). Mas se o paciente já está atrasado
  // (a data salva é anterior a hoje), o `min` recua para essa data para não travar
  // a edição/manutenção de pacientes que já pagam em atraso. Usamos a data
  // PERSISTIDA (não a digitada) para que o `min` não "avance" durante a sessão se
  // a vendedora trocar a data por uma futura e quiser voltar à original atrasada.
  const hojeISO = format(new Date(), "yyyy-MM-dd");
  const vencimentoPersistido = p?.dataPagamentoPendente ?? "";
  const minVencimento =
    vencimentoPersistido && vencimentoPersistido < hojeISO
      ? vencimentoPersistido
      : hojeISO;

  const quitado = (valorPendente ?? 0) <= 0;
  const itProced = procedimentos.length > 0;
  const itMedica =
    medica.trim().length > 0 && crm.trim().length > 0 && clinica.trim().length > 0;
  const itPagamento =
    ((valorSinal ?? 0) > 0 || (valorPendente ?? 0) > 0) &&
    (quitado || dataPagamentoPendente.trim().length > 0);
  const itDataCirurgia = !!dataCirurgia;
  const itSemEdicoes = !dirty;

  const itens = useMemo<ItemProntidao[]>(
    () => [
      { rotulo: "Procedimentos definidos", ok: itProced },
      { rotulo: "Médica, CRM e clínica preenchidos", ok: itMedica },
      {
        rotulo: quitado
          ? "Valor pago informado"
          : "Pagamento com vencimento do saldo",
        ok: itPagamento,
      },
      { rotulo: "Data da cirurgia definida", ok: itDataCirurgia },
      { rotulo: "Sem edições pendentes (salve antes de gerar)", ok: itSemEdicoes },
    ],
    [itProced, itMedica, itPagamento, itDataCirurgia, itSemEdicoes, quitado],
  );

  const tudoOk = itProced && itMedica && itPagamento && itDataCirurgia && itSemEdicoes;
  const prontidao = useMemo<ProntidaoContrato>(
    () => ({ ok: tudoOk, sujo: dirty, itens }),
    [tudoOk, dirty, itens],
  );
  useEffect(() => {
    onProntidaoChange(prontidao);
  }, [prontidao, onProntidaoChange]);

  function alternarTemplate(chave: string) {
    const tpl = config?.procedimentos.find((x) => x.chave === chave);
    if (!tpl) return;
    const atuais = form.getValues("procedimentos") ?? [];
    if (atuais.includes(tpl.nome)) {
      form.setValue("procedimentos", atuais.filter((n) => n !== tpl.nome), {
        shouldValidate: true,
        shouldDirty: true,
      });
    } else {
      form.setValue("procedimentos", [...atuais, tpl.nome], {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
  }

  function adicionarProcedimentoCustom() {
    const nome = procedimentoCustom.trim();
    if (!nome) return;
    const atuais = form.getValues("procedimentos") ?? [];
    if (!atuais.includes(nome)) {
      form.setValue("procedimentos", [...atuais, nome], {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
    setProcedimentoCustom("");
  }

  function removerProcedimento(nome: string) {
    const atuais = form.getValues("procedimentos") ?? [];
    form.setValue("procedimentos", atuais.filter((n) => n !== nome), {
      shouldValidate: true,
      shouldDirty: true,
    });
  }

  // "Marcar como quitado": o saldo pendente passa a integrar o valor pago, zera o
  // pendente e limpa o vencimento (valorSinal = total PAGO, não um sinal).
  function marcarComoQuitado() {
    const pago = Number(form.getValues("valorSinal")) || 0;
    const pendente = Number(form.getValues("valorPendente")) || 0;
    form.setValue("valorSinal", pago + pendente, {
      shouldValidate: true,
      shouldDirty: true,
    });
    form.setValue("valorPendente", 0, { shouldValidate: true, shouldDirty: true });
    form.setValue("dataPagamentoPendente", "", {
      shouldValidate: true,
      shouldDirty: true,
    });
    setVencimentoSugerido(false);
  }

  function onSubmit(values: FichaContratoValues) {
    if (!p) return;
    const temPendente = values.valorPendente > 0;
    const medicoIdResolvido =
      values.medicoId === MEDICO_PERSONALIZADO
        ? null
        : /^\d+$/.test(values.medicoId)
          ? Number(values.medicoId)
          : (p.medicoId ?? null);
    const patch: PacienteUpdate = {
      procedimentos: values.procedimentos,
      valorSinal: values.valorSinal,
      valorPendente: values.valorPendente,
      dataPagamentoPendente:
        temPendente && values.dataPagamentoPendente
          ? values.dataPagamentoPendente
          : null,
      medicoId: medicoIdResolvido,
      medica: values.medica,
      crm: values.crm,
      rqe: values.rqe,
      clinica: values.clinica,
    };
    atualizar.mutate(
      { id: pacienteId, data: patch },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getObterPacienteQueryKey(pacienteId),
          });
          queryClient.invalidateQueries({
            queryKey: getObterDocumentoContextoQueryKey(pacienteId),
          });
          queryClient.invalidateQueries({
            queryKey: getListarPacientesQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getResumoPacientesQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getListarHistoricoPacienteQueryKey(pacienteId),
          });
          form.reset(values);
          toast({
            title: "Dados do contrato salvos",
            description:
              "O resumo abaixo já reflete o que vai no documento.",
          });
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Não foi possível salvar",
            description: "Confira a conexão e tente novamente.",
          });
        },
      },
    );
  }

  return (
    <div className="border border-border/60 p-5 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-accent" strokeWidth={1.5} />
            <h4 className="font-expanded text-[10px] tracking-widest uppercase text-foreground">
              Dados do contrato
            </h4>
          </div>
          <p className="text-xs text-muted-foreground font-light leading-relaxed">
            Ajuste aqui o pagamento, os procedimentos e a médica/clínica do
            contrato. Para mudar nome, CPF, telefone ou a data da cirurgia, use
            "Editar tudo" na página da paciente.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setLocation(`/paciente/${pacienteId}`)}
          className="rounded-none border-border bg-transparent hover:bg-background text-muted-foreground hover:text-accent h-9 px-3 gap-2 shrink-0"
        >
          <SquarePen className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span className="font-expanded text-[9px] tracking-widest uppercase">
            Editar tudo
          </span>
        </Button>
      </div>

      {!pronto ? (
        <div className="space-y-4">
          <Skeleton className="h-4 w-24 bg-background rounded-none" />
          <Skeleton className="h-16 w-full bg-background rounded-none" />
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Pagamento */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-accent" strokeWidth={1.5} />
                  <span className="font-expanded text-[10px] tracking-widest uppercase text-muted-foreground">
                    Pagamento
                  </span>
                </div>
                {quitado ? (
                  <Badge
                    variant="outline"
                    className="rounded-none font-expanded text-[9px] uppercase tracking-widest px-3 py-1 border text-accent border-accent/40 inline-flex items-center"
                  >
                    <Check className="w-3 h-3 mr-1.5" strokeWidth={2.5} />
                    Pago
                  </Badge>
                ) : (
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="rounded-none font-expanded text-[9px] uppercase tracking-widest px-3 py-1 border text-amber-500 border-amber-500/40 inline-flex items-center"
                    >
                      <AlertTriangle className="w-3 h-3 mr-1.5" strokeWidth={2} />
                      Pendente
                    </Badge>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={marcarComoQuitado}
                      className="rounded-none border-accent/40 bg-transparent hover:bg-background text-accent h-8 px-3 gap-1.5"
                    >
                      <CircleCheck className="w-3.5 h-3.5" strokeWidth={1.5} />
                      <span className="font-expanded text-[9px] tracking-widest uppercase">
                        Marcar como quitado
                      </span>
                    </Button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="valorSinal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">
                        Valor pago (R$)
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          className="bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 font-mono text-foreground"
                          {...field}
                          onFocus={() => onCampoFoco?.("valorPago")}
                        />
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
                      <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">
                        Valor pendente (R$)
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          className="bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 font-mono text-foreground"
                          {...field}
                          onFocus={() => onCampoFoco?.("valorPendente")}
                        />
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
                    <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">
                      Vencimento do saldo
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        min={minVencimento}
                        disabled={!(valorPendente > 0)}
                        className="bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 font-mono text-foreground [color-scheme:light] dark:[color-scheme:dark] disabled:opacity-40"
                        {...field}
                        onChange={(e) => {
                          setVencimentoSugerido(false);
                          field.onChange(e);
                        }}
                        onFocus={() => onCampoFoco?.("dataPagamento")}
                      />
                    </FormControl>
                    {vencimentoSugerido &&
                      diasUteisVencimento != null &&
                      valorPendente > 0 && (
                        <p className="text-muted-foreground/60 font-mono text-[10px] tracking-wide">
                          Sugerido: {diasUteisVencimento}{" "}
                          {diasUteisVencimento === 1 ? "dia útil" : "dias úteis"}{" "}
                          antes da cirurgia
                        </p>
                      )}
                    <FormMessage className="font-mono text-xs text-red-400" />
                  </FormItem>
                )}
              />
            </div>

            {/* Procedimentos */}
            <FormField
              control={form.control}
              name="procedimentos"
              render={({ field }) => {
                const selecionados = field.value ?? [];
                return (
                  <FormItem>
                    <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">
                      Procedimentos
                    </FormLabel>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {config?.procedimentos.map((proc) => {
                        const ativo = selecionados.includes(proc.nome);
                        return (
                          <button
                            key={proc.chave}
                            type="button"
                            onClick={() => alternarTemplate(proc.chave)}
                            title={proc.descricao}
                            className={`text-left rounded-none px-3 py-2 text-sm font-light border transition-colors ${
                              ativo
                                ? "border-accent bg-card text-foreground"
                                : "border-border bg-card/30 text-muted-foreground hover:text-foreground hover:border-accent/40"
                            }`}
                          >
                            {proc.nome}
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

            {/* Médica e clínica */}
            <div className="pt-1 flex items-center gap-4">
              <span className="font-expanded text-[10px] tracking-widest text-muted-foreground uppercase">
                Médica e clínica
              </span>
              <div className="flex-1 h-px bg-card/50"></div>
            </div>

            <FormField
              control={form.control}
              name="medicoId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">
                    Médico responsável
                  </FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      // O Radix Select dispara um onValueChange("") espúrio logo
                      // após a troca; nenhum item válido tem valor "" — ignoramos
                      // para não desvincular a médica da paciente.
                      if (!v) return;
                      field.onChange(v);
                      if (v !== MEDICO_PERSONALIZADO) {
                        const m = medicosEdicao.find((x) => String(x.id) === v);
                        if (m) {
                          form.setValue("medica", m.nome, {
                            shouldValidate: true,
                            shouldDirty: true,
                          });
                          form.setValue("crm", m.crm, { shouldDirty: true });
                          form.setValue("rqe", m.rqe, { shouldDirty: true });
                          form.setValue("clinica", m.clinica, {
                            shouldDirty: true,
                          });
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
                      {medicosEdicao.map((m) => (
                        <SelectItem
                          key={m.id}
                          value={String(m.id)}
                          className="focus:bg-card focus:text-foreground rounded-none"
                        >
                          {m.nome}
                          {!m.ativo ? " (inativo)" : m.padrao ? " · padrão" : ""}
                        </SelectItem>
                      ))}
                      <SelectItem
                        value={MEDICO_PERSONALIZADO}
                        className="focus:bg-card focus:text-foreground rounded-none"
                      >
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
                  <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">
                    Médica
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex: Dra. Karla Caetano Lobo"
                      readOnly={!personalizado}
                      className={camposMedicoCls()}
                      {...field}
                      onFocus={() => onCampoFoco?.("medica")}
                    />
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
                    <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">
                      CRM
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ex: CRM-SP 123456"
                        readOnly={!personalizado}
                        className={camposMedicoCls("font-mono")}
                        {...field}
                        onFocus={() => onCampoFoco?.("crm")}
                      />
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
                    <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">
                      RQE
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ex: RQE 54321"
                        readOnly={!personalizado}
                        className={camposMedicoCls("font-mono")}
                        {...field}
                        onFocus={() => onCampoFoco?.("rqe")}
                      />
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
                  <FormLabel className="text-muted-foreground font-expanded text-[10px] tracking-widest uppercase">
                    Clínica
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex: KCL"
                      readOnly={!personalizado}
                      className={camposMedicoCls()}
                      {...field}
                      onFocus={() => onCampoFoco?.("clinica")}
                    />
                  </FormControl>
                  <FormMessage className="font-mono text-xs text-red-400" />
                </FormItem>
              )}
            />

            <div className="flex items-center gap-4 flex-wrap pt-1">
              <Button
                type="submit"
                disabled={!dirty || atualizar.isPending}
                className="rounded-none bg-primary hover:bg-primary/90 text-primary-foreground h-11 px-5 font-medium gap-2 disabled:opacity-40"
              >
                {atualizar.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Check className="w-4 h-4" strokeWidth={1.5} />
                )}
                {atualizar.isPending ? "Salvando..." : "Salvar dados do contrato"}
              </Button>
              {dirty && (
                <span className="text-amber-500 font-mono text-[11px] tracking-wide inline-flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2} />
                  Você tem alterações não salvas
                </span>
              )}
            </div>
          </form>
        </Form>
      )}

      {/* Checklist de prontidão (boas práticas antes de gerar) */}
      <div className="border border-border/60 bg-card/20 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-accent" strokeWidth={1.5} />
          <span className="font-expanded text-[10px] tracking-widest uppercase text-foreground">
            Pronto para gerar?
          </span>
        </div>
        <ul className="space-y-2">
          {itens.map((it) => (
            <li key={it.rotulo} className="flex items-start gap-2.5">
              {it.ok ? (
                <CircleCheck
                  className="w-4 h-4 text-accent shrink-0 mt-0.5"
                  strokeWidth={2}
                />
              ) : (
                <Circle
                  className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-0.5"
                  strokeWidth={2}
                />
              )}
              <span
                className={`text-sm font-light leading-snug ${
                  it.ok ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {it.rotulo}
              </span>
            </li>
          ))}
        </ul>
        {!tudoOk && (
          <p className="text-[11px] text-muted-foreground/70 font-light leading-relaxed border-t border-border/40 pt-2.5">
            Conclua os itens acima para liberar "Gerar rascunho".
          </p>
        )}
      </div>

      {/* Resumo resolvido pelo servidor — o que realmente vai no contrato. */}
      <div className="space-y-3">
        <h5 className="font-expanded text-[10px] tracking-widest uppercase text-muted-foreground border-b border-border/40 pb-2">
          O que vai no contrato
        </h5>
        <ResumoDocumentoResolvido pacienteId={pacienteId} tipo="contrato" />
      </div>
    </div>
  );
}

export function GeradorDocumento({
  pacienteId,
  pacienteNome,
  tipo,
  documentoJaVinculado,
}: {
  pacienteId: number;
  pacienteNome: string;
  tipo: DocumentoTipo;
  documentoJaVinculado: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = TEXTOS[tipo];

  // Modelos filtrados pelo tipo no servidor; chave de cache inclui o tipo para
  // que os geradores de contrato e de termo não compartilhem o mesmo cache.
  const { data: modelos, isLoading: loadingModelos } = useListarContratoModelos(
    { tipo },
    { query: { queryKey: getListarContratoModelosQueryKey({ tipo }) } },
  );
  const {
    data: geracoes,
    isLoading: loadingGeracoes,
    isError: erroGeracoes,
  } = useListarContratosGeracao(pacienteId, {
    query: { queryKey: getListarContratosGeracaoQueryKey(pacienteId) },
  });

  const { data: variaveis } = useListarVariaveisContrato({
    query: { queryKey: getListarVariaveisContratoQueryKey() },
  });

  // E-mail cadastrado do paciente — default do signatário no envio à Autentique
  // (antes vinha vazio e a equipe acabava usando o próprio e-mail).
  const { data: pacienteDetalhe } = useObterPaciente(pacienteId, {
    query: { queryKey: getObterPacienteQueryKey(pacienteId) },
  });
  const pacienteEmail = pacienteDetalhe?.paciente?.email ?? "";

  // Médicos ativos: para completar CRM/RQE/clínica da médica na via de IA quando
  // o snapshot da paciente veio vazio (cadastro anterior ao preenchimento do RQE
  // no cadastro da médica). Espelha o fallback do servidor, para o campo já
  // aparecer preenchido no formulário — nunca sobrescreve um valor já existente.
  const { data: medicosAtivos } = useListarMedicos();
  const pacienteParaIa = useMemo(() => {
    const p = pacienteDetalhe?.paciente;
    if (!p) return null;
    const vazio = (v?: string | null) => !v || !v.trim();
    if (
      p.medicoId == null ||
      (!vazio(p.medica) && !vazio(p.crm) && !vazio(p.rqe) && !vazio(p.clinica))
    )
      return p;
    const m = (medicosAtivos ?? []).find((x) => x.id === p.medicoId);
    if (!m) return p;
    return {
      ...p,
      medica: vazio(p.medica) ? m.nome : p.medica,
      crm: vazio(p.crm) ? m.crm : p.crm,
      rqe: vazio(p.rqe) ? m.rqe : p.rqe,
      clinica: vazio(p.clinica) ? m.clinica : p.clinica,
    };
  }, [pacienteDetalhe, medicosAtivos]);

  const gerar = useGerarContrato();
  const editar = useEditarContratoGeracao();
  const definirDecisoes = useDefinirDecisoesContrato();
  const revisarPrevia = useRevisarPreviaContrato();
  const aprovar = useAprovarEEnviarContrato();
  const uploadContrato = useUploadContrato();
  const { uploadFile } = useUpload();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [enviandoUpload, setEnviandoUpload] = useState(false);

  const modelosVigentes = useMemo(
    () => (modelos ?? []).filter((m: ContratoModelo) => m.vigente),
    [modelos],
  );

  // A listagem de gerações é única por paciente (contém os dois tipos);
  // separamos por tipo no cliente.
  const geracoesDoTipo = useMemo(
    () => (geracoes ?? []).filter((g) => g.tipo === tipo),
    [geracoes, tipo],
  );

  const [selecionadaId, setSelecionadaId] = useState<number | null>(null);
  // Prontidão reportada pela ficha editável do contrato (só existe para
  // `tipo === "contrato"`); trava a geração enquanto há pendências/edições.
  const [prontidao, setProntidao] = useState<ProntidaoContrato | null>(null);
  // corpoEdit guarda o HTML atual do editor; baseline é o HTML serializado
  // inicial (emitido pelo editor ao montar) usado para detectar edições. O
  // resetNonce força a remontagem do editor ao "Desfazer", recarregando o
  // conteúdo pristino sem mexer no cursor durante a digitação.
  const [corpoEdit, setCorpoEdit] = useState<string>("");
  const [baseline, setBaseline] = useState<string>("");
  const [resetNonce, setResetNonce] = useState(0);
  const [aprovadoPor, setAprovadoPor] = useState<string>("");
  const [emailSignatario, setEmailSignatario] = useState<string>("");
  const [confirmarEnvio, setConfirmarEnvio] = useState(false);
  // Segundo signatário: contrato → representante legal da empresa; termo → médico.
  // Campos preenchidos antes do envio; o último valor é lembrado (localStorage)
  // para não redigitar a cada paciente.
  const papelSegundo = tipo === "contrato" ? "representante" : "medico";
  const rotuloSegundo =
    tipo === "contrato" ? "Representante legal da empresa" : "Médico";
  const sig2Key = `camada:signatario2:${tipo}`;
  const lerSig2 = (): { nome?: string; email?: string } => {
    try {
      return JSON.parse(localStorage.getItem(sig2Key) ?? "{}");
    } catch {
      return {};
    }
  };
  const [segundoNome, setSegundoNome] = useState<string>(
    () => lerSig2().nome ?? "",
  );
  const [segundoEmail, setSegundoEmail] = useState<string>(
    () => lerSig2().email ?? "",
  );
  // Signatários ADICIONAIS (além do paciente e do representante/médico).
  // Cada um assina por e-mail. Começa vazio; a equipe adiciona sob demanda.
  // Não é lembrado entre pacientes (varia caso a caso), diferente do 2º.
  const [signatariosExtra, setSignatariosExtra] = useState<
    { nome: string; email: string }[]
  >([]);
  // Variável ({{chave}}) do campo que a ficha está focando — a prévia rola até o
  // trecho correspondente e o destaca. `null` quando nenhum campo está em foco.
  const [campoFoco, setCampoFoco] = useState<string | null>(null);
  // Confirmação de "Atualizar com os dados da ficha" (regera e descarta edições
  // manuais de texto do rascunho).
  const [confirmarRegerar, setConfirmarRegerar] = useState(false);

  // WIZARD (pré-geração): Informações → Texto → Revisão IA (opcional) → Gerar.
  // O progresso é PERSISTIDO por paciente/tipo (sessionStorage), então navegar
  // para fora e voltar retoma onde parou — sem perder o texto revisado nem pular
  // para "Gerar". Limpo ao gerar o contrato.
  const wizardKey = `camada:wizard-contrato:${pacienteId}:${tipo}`;
  function lerWizard(): {
    etapa?: "informacoes" | "texto" | "revisao";
    decisoesEscolhidas?: DecisaoRegiaoInput[];
    corpoPreGen?: string;
    modoWizard?: boolean;
    fluxo?: "escolha" | "gerar" | "ia";
  } {
    try {
      return JSON.parse(sessionStorage.getItem(wizardKey) ?? "{}");
    } catch {
      return {};
    }
  }
  // Caminho escolhido ao iniciar um documento: "escolha" mostra a bifurcação
  // (criar com IA × subir PDF pronto); "ia" segue o formulário/IA. O upload não
  // tem etapa própria — cria a geração e cai direto na confirmação. O valor
  // legado "gerar" (motor de cláusulas, hoje oculto) é coagido para "escolha"
  // para que sessões antigas não caiam no assistente descontinuado.
  const [fluxo, setFluxo] = useState<"escolha" | "gerar" | "ia">(() => {
    const f = lerWizard().fluxo;
    return f === "ia" ? "ia" : "escolha";
  });
  const [etapa, setEtapa] = useState<"informacoes" | "texto" | "revisao">(
    () => lerWizard().etapa ?? "informacoes",
  );
  // Decisões escolhidas na etapa 1 (client-side) — alimentam a prévia e a geração.
  const [decisoesEscolhidas, setDecisoesEscolhidas] = useState<
    DecisaoRegiaoInput[]
  >(() => lerWizard().decisoesEscolhidas ?? []);
  // Texto revisado na etapa 2 (semeado da prévia).
  const [corpoPreGen, setCorpoPreGen] = useState<string>(
    () => lerWizard().corpoPreGen ?? "",
  );
  // Relatório do feedback opcional de IA (etapa 3); null = ainda não pedido.
  // Transitório — não é persistido (basta pedir de novo).
  const [relatorioPreGen, setRelatorioPreGen] = useState<RelatorioRevisao | null>(
    null,
  );
  // Força o ASSISTENTE (prévia ao vivo) mesmo quando já existe rascunho gerado —
  // acionado por "Criar novo documento". Sem isso, uma paciente com rascunho cai
  // direto na visão pós-geração (instantâneo), onde o Valor Pago não reflete.
  const [modoWizard, setModoWizard] = useState(() => lerWizard().modoWizard ?? false);

  // Persiste o progresso do assistente (sobrevive à remontagem ao navegar).
  useEffect(() => {
    try {
      sessionStorage.setItem(
        wizardKey,
        JSON.stringify({ etapa, decisoesEscolhidas, corpoPreGen, modoWizard, fluxo }),
      );
    } catch {
      // sessionStorage indisponível (modo privado/quota) — segue sem persistir.
    }
  }, [wizardKey, etapa, decisoesEscolhidas, corpoPreGen, modoWizard, fluxo]);

  const selecionada = useMemo<ContratoGeracao | null>(() => {
    if (selecionadaId === null) {
      return geracoesDoTipo.length > 0 ? geracoesDoTipo[0] : null;
    }
    return geracoesDoTipo.find((g) => g.id === selecionadaId) ?? null;
  }, [geracoesDoTipo, selecionadaId]);

  function invalidarGeracoes() {
    queryClient.invalidateQueries({
      queryKey: getListarContratosGeracaoQueryKey(pacienteId),
    });
  }

  // Pré-preenche o e-mail do signatário com o e-mail do paciente ao abrir um
  // rascunho para envio. Uma vez por documento (ref evita reescrever se a equipe
  // já ajustou o campo); a Autentique não envia e-mail quando o destinatário é o
  // próprio dono da conta, então o default tem que ser o e-mail do paciente.
  const emailPrefillId = useRef<number | null>(null);
  useEffect(() => {
    if (
      selecionada &&
      selecionada.status === "rascunho" &&
      pacienteEmail &&
      emailPrefillId.current !== selecionada.id
    ) {
      emailPrefillId.current = selecionada.id;
      setEmailSignatario(pacienteEmail);
    }
  }, [selecionada, pacienteEmail]);

  // Default do nome do médico (2º signatário do TERMO) a partir do cadastro,
  // quando o campo ainda não foi preenchido/lembrado.
  const medicaCadastro = pacienteDetalhe?.paciente?.medica ?? "";
  useEffect(() => {
    if (tipo === "termo" && !segundoNome && medicaCadastro) {
      setSegundoNome(medicaCadastro);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medicaCadastro, tipo]);

  // Mostra o ASSISTENTE (prévia ao vivo + etapas) quando não há rascunho OU
  // quando o operador pediu "Criar novo documento". Caso contrário, mostra a
  // visão pós-geração do rascunho selecionado.
  const emWizard = selecionada === null || modoWizard;
  // Bifurcação inicial (gerar × subir PDF pronto): substitui a ficha/assistente.
  const naEscolha = emWizard && fluxo === "escolha";

  function reiniciarWizard() {
    setEtapa("informacoes");
    setDecisoesEscolhidas([]);
    setCorpoPreGen("");
    setRelatorioPreGen(null);
    setFluxo("escolha");
    setModoWizard(true);
  }

  // Caminho de UPLOAD: sobe o PDF pronto ao armazenamento, registra a geração de
  // upload e cai direto na visão pós-geração (confirmar → enviar à Autentique).
  // Sem pré-geração, sem edição, sem revisão de IA — como o time pediu.
  async function handleSubirContrato(file: File) {
    if (file.type !== TIPO_PDF) {
      toast({
        variant: "destructive",
        title: "Formato não aceito",
        description: "Envie o contrato em PDF.",
      });
      return;
    }
    if (file.size > TAMANHO_MAXIMO_DOC) {
      toast({
        variant: "destructive",
        title: "Arquivo muito grande",
        description: "O limite é de 20 MB.",
      });
      return;
    }
    setEnviandoUpload(true);
    try {
      const enviado = await uploadFile(file);
      if (!enviado) throw new Error("Falha no envio do arquivo.");
      const nova = await uploadContrato.mutateAsync({
        id: pacienteId,
        data: {
          tipo,
          objectPath: enviado.objectPath,
          nomeArquivo: file.name,
          contentType: TIPO_PDF,
          tamanho: file.size,
        },
      });
      invalidarGeracoes();
      setModoWizard(false);
      setFluxo("escolha");
      setSelecionadaId(nova.id);
      try {
        sessionStorage.removeItem(wizardKey);
      } catch {
        // ok — sessionStorage indisponível
      }
      toast({
        title: `${t.Nome} enviado`,
        description: "Confira o PDF e confirme para enviar à assinatura.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Não foi possível subir o contrato",
        description: "Tente novamente em instantes.",
      });
    } finally {
      setEnviandoUpload(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  }

  // Via IA: documento redigido criado com sucesso. Igual ao upload — sai do
  // assistente e cai na visão pós-geração do rascunho, para revisar/refinar/enviar.
  function handleGeradoIa(nova: ContratoGeracao) {
    invalidarGeracoes();
    setModoWizard(false);
    setFluxo("escolha");
    setSelecionadaId(nova.id);
    try {
      sessionStorage.removeItem(wizardKey);
    } catch {
      // ok — sessionStorage indisponível
    }
  }

  // Após um refino por IA, o corpo muda no servidor: recarrega as gerações e força
  // o editor a reinicializar (a key inclui resetNonce) com o novo texto.
  function handleRefinadoIa() {
    invalidarGeracoes();
    setResetNonce((n) => n + 1);
  }

  // Para o contrato, exigimos a ficha pronta (boas práticas) antes de gerar.
  const geracaoTravada = tipo === "contrato" && !(prontidao?.ok ?? false);

  async function handleGerar() {
    if (geracaoTravada) {
      const faltantes = (prontidao?.itens ?? [])
        .filter((it) => !it.ok)
        .map((it) => it.rotulo);
      toast({
        variant: "destructive",
        title: "Confira a ficha antes de gerar",
        description:
          faltantes.length > 0
            ? `Pendências: ${faltantes.join("; ")}.`
            : "Conclua os itens da ficha do contrato.",
      });
      return;
    }
    try {
      const nova = await gerar.mutateAsync({
        id: pacienteId,
        data: {
          tipo,
          // Texto já revisado (etapa 2) e decisões escolhidas (etapa 1), quando houver.
          ...(corpoPreGen ? { corpo: corpoPreGen } : {}),
          ...(decisoesEscolhidas.length > 0
            ? { decisoes: decisoesEscolhidas }
            : {}),
        },
      });
      invalidarGeracoes();
      setModoWizard(false);
      setSelecionadaId(nova.id);
      try {
        sessionStorage.removeItem(wizardKey);
      } catch {
        // ok — sessionStorage indisponível
      }
      toast({
        title: "Contrato gerado",
        description: `O ${t.nome} foi criado a partir do que você revisou. Aprove para enviar.`,
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Não foi possível gerar",
        description: "Confira se há um modelo vigente e tente de novo.",
      });
    }
  }

  // Etapa 1 → 2: leva o texto resolvido (com dados + decisões) para o editor.
  function handleProsseguirTexto() {
    if (geracaoTravada) {
      toast({
        title: "Confira a ficha antes de prosseguir",
        description: "Conclua e salve os itens da ficha do contrato.",
      });
      return;
    }
    if (previa) setCorpoPreGen(previa.corpo);
    setRelatorioPreGen(null);
    setEtapa("texto");
  }

  // Etapa 3 (opcional): feedback de IA sobre o texto atual — nunca bloqueia.
  async function handlePedirFeedback() {
    if (!previa) return;
    try {
      const relatorio = await revisarPrevia.mutateAsync({
        id: pacienteId,
        data: { tipo, titulo: previa.titulo, corpo: corpoPreGen || previa.corpo },
      });
      setRelatorioPreGen(relatorio);
    } catch {
      toast({
        variant: "destructive",
        title: "A revisão de IA falhou",
        description:
          "Você pode gerar o contrato mesmo assim ou tentar o feedback de novo.",
      });
    }
  }

  // Upload não tem editor — nunca fica "sujo" (o baseline pode ter sobrado de
  // um rascunho gerado visto antes).
  const corpoSujo =
    selecionada !== null &&
    !selecionada.arquivoObjectPath &&
    baseline !== "" &&
    corpoEdit !== baseline;
  const editavel = selecionada?.status === "rascunho";

  // Decisões do motor de cláusulas desta geração (vazio para modelos sem regiões
  // tipadas). Pendências travam a aprovação — como no protótipo.
  const decisoes = useMemo(() => selecionada?.decisoes ?? [], [selecionada]);
  const pendenciasDecisao = decisoes.filter((d) => !d.confirmado).length;

  // Prévia AO VIVO do documento — resolve o modelo-base com os valores ATUAIS da
  // ficha (mesmo não salvos), com debounce, SEM gerar rascunho. Só quando não há
  // geração selecionada e existe modelo vigente.
  const [fichaValores, setFichaValores] = useState<FichaContratoValues | null>(
    null,
  );
  const [valoresDebounced, setValoresDebounced] =
    useState<FichaContratoValues | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setValoresDebounced(fichaValores), 300);
    return () => clearTimeout(t);
  }, [fichaValores]);

  const previaBody = useMemo<PreviaContratoInput>(() => {
    const v = valoresDebounced;
    const base: PreviaContratoInput = v
      ? {
          tipo,
          procedimentos: v.procedimentos,
          valorSinal: String(v.valorSinal ?? 0),
          valorPendente: String(v.valorPendente ?? 0),
          dataPagamentoPendente: v.dataPagamentoPendente || null,
          medica: v.medica,
          crm: v.crm,
          rqe: v.rqe,
          clinica: v.clinica,
        }
      : { tipo };
    return decisoesEscolhidas.length > 0
      ? { ...base, decisoes: decisoesEscolhidas }
      : base;
  }, [valoresDebounced, tipo, decisoesEscolhidas]);

  const { data: previa, isFetching: previaCarregando } = useQuery({
    queryKey: ["previa-contrato", pacienteId, previaBody],
    queryFn: () => preverContrato(pacienteId, previaBody),
    enabled: emWizard && modelosVigentes.length > 0,
  });

  // Decisões pendentes na PRÉVIA (etapa 1) — travam o "Prosseguir".
  const pendenciasPrevia = (previa?.decisoes ?? []).filter(
    (d) => !d.confirmado,
  ).length;

  // Regera o rascunho a partir do modelo com os dados SALVOS da paciente (e as
  // decisões já confirmadas), trazendo mudanças da ficha para dentro do texto.
  // Descarta ajustes manuais de texto — por isso passa por confirmação.
  async function handleRegerarComDados() {
    if (!selecionada) return;
    setConfirmarRegerar(false);
    const previas: DecisaoRegiaoInput[] = decisoes
      .filter((d) => d.confirmado)
      .map((d) => ({
        id: d.id,
        tipo: d.tipo,
        valor: d.valor,
        incluido: d.incluido,
      }));
    try {
      await definirDecisoes.mutateAsync({
        id: selecionada.id,
        data: { decisoes: previas },
      });
      await queryClient.invalidateQueries({
        queryKey: getListarContratosGeracaoQueryKey(pacienteId),
      });
      setResetNonce((n) => n + 1);
      toast({
        title: "Documento atualizado",
        description:
          "O texto foi regerado com os dados salvos da ficha. Ajustes manuais de texto foram descartados.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Não foi possível atualizar",
        description: "O rascunho está intacto. Tente de novo em instantes.",
      });
    }
  }

  async function handleAplicarDecisoes(previas: DecisaoRegiaoInput[]) {
    if (!selecionada) return;
    if (corpoSujo) {
      toast({
        title: "Há edições de texto não salvas",
        description:
          "Salve ou reverta o texto antes de mudar decisões — aplicar decisões regera o documento e descartaria os ajustes manuais.",
      });
      return;
    }
    try {
      await definirDecisoes.mutateAsync({
        id: selecionada.id,
        data: { decisoes: previas },
      });
      await queryClient.invalidateQueries({
        queryKey: getListarContratosGeracaoQueryKey(pacienteId),
      });
      // Remonta o editor com o corpo regenerado (numeração/variantes atualizadas).
      setResetNonce((n) => n + 1);
    } catch {
      toast({
        variant: "destructive",
        title: "Não foi possível aplicar as decisões",
        description: "O rascunho está intacto. Tente de novo em instantes.",
      });
    }
  }

  async function handleSalvarEdicao() {
    if (!selecionada || !corpoSujo || htmlVazio(corpoEdit)) return;
    try {
      await editar.mutateAsync({ id: selecionada.id, data: { corpo: corpoEdit } });
      // O backend preenche variáveis recém-inseridas ({{...}}) com os dados da
      // paciente, então o corpo salvo pode diferir do editado. Recarregamos a
      // geração e remontamos o editor (resetNonce) para exibir o texto final — o
      // onReady da nova montagem define a baseline, zerando corpoSujo.
      await queryClient.invalidateQueries({
        queryKey: getListarContratosGeracaoQueryKey(pacienteId),
      });
      setResetNonce((n) => n + 1);
      toast({ title: "Rascunho salvo", description: "As alterações foram guardadas." });
    } catch {
      toast({
        variant: "destructive",
        title: "Não foi possível salvar",
        description: "Tente de novo em instantes.",
      });
    }
  }

  // Signatários montados a partir dos campos do formulário (por tipo de doc).
  const signatariosEnvio = [
    { papel: "paciente", nome: pacienteNome, email: emailSignatario.trim() },
    { papel: papelSegundo, nome: segundoNome.trim(), email: segundoEmail.trim() },
    ...signatariosExtra.map((s) => ({
      papel: "adicional",
      nome: s.nome.trim(),
      email: s.email.trim(),
    })),
  ];
  // Envio liberado só com nome + e-mail de TODAS as partes (inclui adicionais).
  const signatariosCompletos = signatariosEnvio.every(
    (s) => s.nome !== "" && s.email !== "",
  );

  async function handleAprovarEEnviar() {
    if (!selecionada || aprovadoPor.trim() === "" || !signatariosCompletos) return;
    setConfirmarEnvio(false);
    try {
      await aprovar.mutateAsync({
        id: selecionada.id,
        data: {
          aprovadoPor: aprovadoPor.trim(),
          signatarios: signatariosEnvio,
        },
      });
      // Lembra o 2º signatário (representante/médico) para os próximos envios.
      try {
        localStorage.setItem(
          sig2Key,
          JSON.stringify({ nome: segundoNome.trim(), email: segundoEmail.trim() }),
        );
      } catch {
        // localStorage indisponível — segue sem lembrar.
      }
      invalidarGeracoes();
      queryClient.invalidateQueries({ queryKey: getObterPacienteQueryKey(pacienteId) });
      setAprovadoPor("");
      setEmailSignatario("");
      setSignatariosExtra([]);
      toast({
        title: `${t.Nome} enviado`,
        description: "O documento foi criado na Autentique e vinculado à paciente.",
      });
    } catch {
      invalidarGeracoes();
      queryClient.invalidateQueries({ queryKey: getObterPacienteQueryKey(pacienteId) });
      toast({
        variant: "destructive",
        title: "Falha ao enviar à Autentique",
        description:
          "A aprovação foi registrada, mas o envio falhou. Os dados da paciente estão intactos — tente enviar de novo.",
      });
    }
  }

  const enviando = aprovar.isPending;

  // PRÉVIA do documento (coluna direita, fixa). Mostra o editor do rascunho na
  // visão pós-geração; nas etapas do assistente, a prévia ao vivo / editor / etc.
  const previewPane = emWizard && fluxo === "ia" ? (
    // Via IA (formulário à esquerda): a prévia do documento só existe depois de
    // gerar — aqui mostramos uma orientação em vez da prévia do motor.
    <div className="border border-dashed border-border/70 p-10 text-center min-h-[420px] flex flex-col items-center justify-center gap-3">
      <Sparkles className="w-8 h-8 text-muted-foreground/40" strokeWidth={1.2} />
      <p className="text-sm text-muted-foreground font-light max-w-xs leading-relaxed">
        Preencha o formulário ao lado e clique em <b>Gerar {t.nome} com IA</b>. O
        documento aparece aqui para você revisar, pedir ajustes e enviar.
      </p>
    </div>
  ) : selecionada && !modoWizard && selecionada.arquivoObjectPath ? (
    // Contrato de UPLOAD: sem editor — o PDF pronto é a fonte da verdade.
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-expanded text-[10px] tracking-widest uppercase text-foreground">
          {selecionada.titulo}
        </h4>
        {(() => {
          const v = statusVisual(selecionada.status);
          return (
            <span className={`font-expanded text-[9px] tracking-widest uppercase border px-2 py-0.5 ${v.className}`}>
              {v.label}
            </span>
          );
        })()}
      </div>

      <div className="flex items-center gap-2 text-muted-foreground/70">
        <FileText className="w-3.5 h-3.5 text-accent shrink-0" strokeWidth={1.5} />
        <span className="text-[11px] font-light truncate">
          {selecionada.arquivoNome ?? "Contrato enviado (PDF)"}
        </span>
      </div>

      {/* Visualização inline do PDF enviado (mesmo endpoint do download, em modo
          inline). Same-origin: o navegador manda os cookies como no link. */}
      <iframe
        key={`pdf-${selecionada.id}`}
        src={`/api/contratos/${selecionada.id}/pdf?inline=1`}
        title={selecionada.arquivoNome ?? "Contrato enviado"}
        className="w-full h-[560px] border border-border/60 bg-background"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <BaixarPdf id={selecionada.id} desabilitado={false} />
        <p className="text-[11px] text-muted-foreground/70 font-light">
          Contrato pronto — não editável no sistema. Confira o PDF antes de enviar.
        </p>
      </div>

      {selecionada.aprovadoPor && selecionada.aprovadoEm && (
        <p className="font-mono text-[10px] text-muted-foreground/60 uppercase tracking-wider border-t border-border/40 pt-3">
          Aprovado por {selecionada.aprovadoPor} em{" "}
          {format(parseISO(selecionada.aprovadoEm), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
        </p>
      )}
      {selecionada.status === "falha_envio" && selecionada.erroEnvio && (
        <p className="text-[11px] text-red-400 font-light border border-red-400/30 p-3 leading-relaxed">
          Último erro de envio: {selecionada.erroEnvio}
        </p>
      )}
    </div>
  ) : selecionada && !modoWizard ? (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-expanded text-[10px] tracking-widest uppercase text-foreground">
          {selecionada.titulo}
        </h4>
        {(() => {
          const v = statusVisual(selecionada.status);
          return (
            <span className={`font-expanded text-[9px] tracking-widest uppercase border px-2 py-0.5 ${v.className}`}>
              {v.label}
            </span>
          );
        })()}
      </div>

      <EditorDocumento
        key={`${tipo}-${selecionada.id}-${resetNonce}`}
        value={selecionada.corpo}
        onChange={setCorpoEdit}
        onReady={(html) => {
          setBaseline(html);
          setCorpoEdit(html);
        }}
        readOnly={!editavel}
        variaveis={editavel ? (variaveis ?? []) : []}
      />

      {editavel ? (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                variant="outline"
                onClick={handleSalvarEdicao}
                disabled={!corpoSujo || htmlVazio(corpoEdit) || editar.isPending}
                className="rounded-none border-border bg-transparent hover:bg-background h-10 px-5 font-medium"
              >
                {editar.isPending ? "Salvando..." : "Salvar edições"}
              </Button>
              {corpoSujo && (
                <Button
                  variant="ghost"
                  onClick={() => setResetNonce((n) => n + 1)}
                  className="rounded-none h-10 px-3 text-muted-foreground hover:text-foreground gap-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
                  Reverter alterações
                </Button>
              )}
            </div>
            <BaixarPdf id={selecionada.id} desabilitado={corpoSujo} />
          </div>

          {/* Atualizar com os dados da ficha: regera o texto com os dados SALVOS
              (traz mudanças como Valor Pago para dentro do documento). Descarta
              ajustes manuais — confirma antes. Bloqueado se a ficha tem edições
              não salvas (senão traria dados antigos). Não se aplica a docs de IA
              (sem modelo/ficha — para mudanças, use "Pedir alteração à IA"). */}
          {selecionada.origem !== "ia" ? (
            <>
              <div className="flex items-center gap-2 border-t border-border/40 pt-2.5">
                <Button
                  variant="ghost"
                  onClick={() =>
                    prontidao?.sujo
                      ? toast({
                          title: "Salve a ficha primeiro",
                          description:
                            "Há dados não salvos na ficha. Salve-os e depois atualize o documento.",
                        })
                      : setConfirmarRegerar(true)
                  }
                  disabled={definirDecisoes.isPending}
                  className="rounded-none h-9 px-3 text-muted-foreground hover:text-foreground gap-2 text-[12px]"
                >
                  {definirDecisoes.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
                  )}
                  Atualizar com os dados da ficha
                </Button>
              </div>

              <p className="text-[11px] text-muted-foreground/70 font-light leading-relaxed">
                Você está editando o <b>rascunho desta paciente</b> — o modelo do
                sistema não é alterado. Este texto é um instantâneo: ao mudar dados
                na ficha (ex.: Valor pago), salve e use <b>Atualizar com os dados da
                ficha</b> para trazê-los (isso regera o texto e descarta ajustes
                manuais).
              </p>
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground/70 font-light leading-relaxed border-t border-border/40 pt-2.5">
              Documento redigido por IA. Edite o texto à mão aqui ou use{" "}
              <b>Pedir alteração à IA</b> para reescrever trechos preservando o
              restante.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BaixarPdf id={selecionada.id} desabilitado={false} />
          {selecionada.status !== "rascunho" && (
            <p className="text-[11px] text-muted-foreground/70 font-light">
              Documento já aprovado — o conteúdo não pode mais ser editado.
            </p>
          )}
        </div>
      )}

      {selecionada.aprovadoPor && selecionada.aprovadoEm && (
        <p className="font-mono text-[10px] text-muted-foreground/60 uppercase tracking-wider border-t border-border/40 pt-3">
          Aprovado por {selecionada.aprovadoPor} em{" "}
          {format(parseISO(selecionada.aprovadoEm), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
        </p>
      )}
      {selecionada.status === "falha_envio" && selecionada.erroEnvio && (
        <p className="text-[11px] text-red-400 font-light border border-red-400/30 p-3 leading-relaxed">
          Último erro de envio: {selecionada.erroEnvio}
        </p>
      )}
    </div>
  ) : etapa === "texto" ? (
    // ETAPA 2 — texto editável (semeado da prévia). Edições ficam em corpoPreGen.
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-expanded text-[10px] tracking-widest uppercase text-foreground">
          {previa?.titulo ?? t.Nome}
        </h4>
        <span className="font-expanded text-[9px] tracking-widest uppercase border border-accent/40 text-accent px-2 py-0.5">
          Etapa 2 · texto editável
        </span>
      </div>
      <EditorDocumento
        key={`texto-${tipo}-${pacienteId}`}
        value={corpoPreGen}
        onChange={setCorpoPreGen}
        onReady={(html) => setCorpoPreGen(html)}
        variaveis={variaveis ?? []}
      />
      <p className="text-[11px] text-muted-foreground/70 font-light leading-relaxed">
        Edite qualquer trecho — inclusive fora das variáveis. Nada foi gerado
        ainda; o contrato só é criado ao final.
      </p>
    </div>
  ) : etapa === "revisao" ? (
    // ETAPA 3 — prévia (somente leitura) do texto que será gerado.
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-expanded text-[10px] tracking-widest uppercase text-foreground">
          {previa?.titulo ?? t.Nome}
        </h4>
        <span className="font-expanded text-[9px] tracking-widest uppercase border border-border/60 text-muted-foreground px-2 py-0.5">
          Etapa 3 · pronto para gerar
        </span>
      </div>
      <PreviaDocumento html={corpoPreGen || previa?.corpo || ""} focoChave={null} />
    </div>
  ) : !naEscolha && previa ? (
    // ETAPA 1 — prévia ao vivo (somente leitura), com vínculo campo↔trecho.
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-expanded text-[10px] tracking-widest uppercase text-foreground">
          {previa.titulo}
        </h4>
        <span className="font-expanded text-[9px] tracking-widest uppercase border border-border/60 text-muted-foreground px-2 py-0.5">
          Prévia ao vivo
        </span>
      </div>
      {/* HTML estático (não o editor) para preservar os marcadores data-var e
          permitir rolar/destacar o trecho do campo focado na ficha. */}
      <PreviaDocumento html={previa.corpo} focoChave={campoFoco} />
      <p className="text-[11px] text-muted-foreground/70 font-light leading-relaxed">
        Prévia com os dados atuais da paciente. Confirme as informações ao lado e
        clique em <b>Prosseguir</b> para revisar o texto.
      </p>
    </div>
  ) : (
    <div className="border border-dashed border-border/70 p-10 text-center min-h-[420px] flex flex-col items-center justify-center gap-3">
      {previaCarregando ? (
        <Loader2 className="w-6 h-6 text-muted-foreground/40 animate-spin" strokeWidth={1.5} />
      ) : (
        <FileText className="w-8 h-8 text-muted-foreground/40" strokeWidth={1.2} />
      )}
      <p className="text-sm text-muted-foreground font-light max-w-xs leading-relaxed">
        {previaCarregando
          ? "Montando a prévia do documento..."
          : modelosVigentes.length === 0
            ? "A prévia aparece aqui quando houver um modelo-base vigente (ative em “Modelos de documento”)."
            : "A prévia do documento aparece aqui."}
      </p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Split principal — DADOS do contrato à esquerda, PRÉVIA do documento à
          direita (fixa), no mesmo padrão da tela da paciente. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <div className="space-y-6 lg:order-1 min-w-0">
      {/* BIFURCAÇÃO INICIAL — antes da pré-geração, escolher entre gerar pelo
          sistema ou subir um contrato pronto (PDF feito por fora). */}
      {naEscolha && (
        <div className="space-y-4">
          {modoWizard && selecionada && (
            <button
              type="button"
              onClick={() => {
                setModoWizard(false);
                setFluxo("escolha");
              }}
              className="text-[11px] font-light text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3 h-3" strokeWidth={1.5} />
              Cancelar e voltar ao documento gerado
            </button>
          )}
          <div className="space-y-1">
            <h3 className="font-serif text-xl font-light tracking-tight text-foreground">
              Como você quer criar o {t.nome}?
            </h3>
            <p className="text-sm text-muted-foreground font-light leading-relaxed">
              Crie com IA (preencha um formulário e a IA redige) ou suba um
              {" "}{t.nome} pronto feito por fora — este vai direto para a assinatura.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Criar com IA — formulário + ChatGPT redige o documento */}
            <button
              type="button"
              onClick={() => setFluxo("ia")}
              className="group text-left border border-border/60 hover:border-accent/60 bg-transparent hover:bg-background transition-colors p-5 space-y-3"
            >
              <Sparkles className="w-5 h-5 text-accent" strokeWidth={1.5} />
              <div className="space-y-1">
                <h4 className="font-expanded text-[10px] tracking-widest uppercase text-foreground">
                  Criar com IA
                </h4>
                <p className="text-xs text-muted-foreground font-light leading-relaxed">
                  Preencha um formulário e a IA redige o {t.nome} seguindo o padrão
                  da clínica. Você revisa, pede ajustes por chat e envia.
                </p>
              </div>
            </button>

            {/* Subir contrato pronto */}
            <div className="border border-border/60 bg-transparent p-5 space-y-3">
              <FileUp className="w-5 h-5 text-accent" strokeWidth={1.5} />
              <div className="space-y-1">
                <h4 className="font-expanded text-[10px] tracking-widest uppercase text-foreground">
                  Subir contrato pronto
                </h4>
                <p className="text-xs text-muted-foreground font-light leading-relaxed">
                  Envie o PDF feito por fora. Sem edição no sistema — segue direto
                  para conferência e envio à assinatura.
                </p>
              </div>
              <input
                ref={uploadInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleSubirContrato(file);
                }}
              />
              <Button
                onClick={() => uploadInputRef.current?.click()}
                disabled={enviandoUpload}
                className="w-full rounded-none bg-primary hover:bg-primary/90 text-primary-foreground h-11 font-medium gap-2"
              >
                {enviandoUpload ? (
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Upload className="w-4 h-4" strokeWidth={1.5} />
                )}
                {enviandoUpload ? "Enviando..." : "Escolher PDF"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* VIA IA (simples): formulário → ChatGPT redige o documento. Ao gerar,
          cai na visão pós-geração para revisar/refinar/enviar. */}
      {emWizard && fluxo === "ia" && (
        <CriacaoIaDocumento
          pacienteId={pacienteId}
          tipo={tipo}
          paciente={pacienteParaIa}
          onGerado={handleGeradoIa}
          onCancelar={() => setFluxo("escolha")}
        />
      )}

      {/* Ficha de inputs da primeira versão (somente leitura). Oculta na via IA
          (formulário próprio) e nos documentos redigidos por IA. */}
      {!naEscolha &&
        fluxo !== "ia" &&
        selecionada?.origem !== "ia" &&
        (tipo === "contrato" ? (
          <FichaContratoEditavel
            pacienteId={pacienteId}
            onProntidaoChange={setProntidao}
            onCampoFoco={setCampoFoco}
            onValoresChange={setFichaValores}
          />
        ) : (
          <FichaInputs pacienteId={pacienteId} tipo={tipo} />
        ))}

      {/* Stepper guia: orienta a ordem sem travá-la. A etapa ativa é derivada do
          estado real (há rascunho selecionado? status?). Champanhe só em fio:
          círculos e linhas usam o dourado apenas como borda/traço, nunca fundo.
          Oculto na bifurcação inicial e para contratos de upload (sem etapas). */}
      {!naEscolha && !selecionada?.arquivoObjectPath &&
      fluxo !== "ia" && selecionada?.origem !== "ia" &&
      (() => {
        const etapaIdx = !emWizard
          ? 3
          : etapa === "informacoes"
            ? 0
            : etapa === "texto"
              ? 1
              : 2;
        const passos = ["Informações", "Revisar texto", "Revisão IA", "Gerar"];
        return (
          <ol className="flex items-center gap-1 overflow-x-auto pb-1">
            {passos.map((label, i) => {
              const concluido = i < etapaIdx;
              const ativo = i === etapaIdx;
              return (
                <li key={label} className="flex items-center gap-1 shrink-0">
                  <div className="flex items-center gap-2 px-0.5">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full border font-mono text-[9px] ${
                        ativo
                          ? "border-accent text-accent"
                          : concluido
                            ? "border-accent/40 text-accent/70"
                            : "border-border text-muted-foreground/40"
                      }`}
                    >
                      {concluido ? (
                        <Check className="h-3 w-3" strokeWidth={2.5} />
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span
                      className={`font-expanded text-[9px] uppercase tracking-widest whitespace-nowrap ${
                        ativo
                          ? "text-foreground"
                          : concluido
                            ? "text-muted-foreground"
                            : "text-muted-foreground/40"
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                  {i < passos.length - 1 && (
                    <span
                      aria-hidden
                      className={`h-px w-4 sm:w-8 ${
                        concluido ? "bg-accent/30" : "bg-border"
                      }`}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        );
      })()}

      {/* WIZARD (pré-geração): Informações → Texto → Revisão IA → Gerar.
          Aparece ao escolher "Gerar pelo sistema" (não no upload). */}
      {emWizard && fluxo === "gerar" &&
        (loadingModelos ? (
          <Skeleton className="h-12 w-full bg-background rounded-none" />
        ) : modelosVigentes.length === 0 ? (
          <p className="text-sm text-muted-foreground/70 font-light border border-dashed border-border p-4">
            Nenhum modelo-base vigente para este tipo. O modelo-base vem como
            rascunho (inativo) — ative-o em "Modelos de documento" para começar.
          </p>
        ) : (
          <div className="space-y-4">
            {modoWizard && selecionada && (
              <button
                type="button"
                onClick={() => setModoWizard(false)}
                className="text-[11px] font-light text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3 h-3" strokeWidth={1.5} />
                Cancelar e voltar ao documento gerado
              </button>
            )}
            {etapa === "informacoes" && (
              <>
                {(previa?.decisoes ?? []).length > 0 && (
                  <DecisoesPainel
                    decisoes={previa?.decisoes ?? []}
                    onAplicar={(previas) => setDecisoesEscolhidas(previas)}
                    aplicando={previaCarregando}
                  />
                )}
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={handleProsseguirTexto}
                    disabled={geracaoTravada || !previa || pendenciasPrevia > 0}
                    className="rounded-none bg-primary hover:bg-primary/90 text-primary-foreground h-12 px-6 font-medium gap-2 disabled:opacity-40"
                  >
                    Prosseguir para revisar o texto
                  </Button>
                  {geracaoTravada ? (
                    <p className="text-[11px] text-amber-500 font-light inline-flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={2} />
                      Conclua e salve a ficha do contrato acima para prosseguir.
                    </p>
                  ) : pendenciasPrevia > 0 ? (
                    <p className="text-[11px] text-amber-500 font-light inline-flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={2} />
                      Confirme {pendenciasPrevia} decisã{pendenciasPrevia > 1 ? "ões" : "o"} acima para prosseguir.
                    </p>
                  ) : null}
                </div>
              </>
            )}

            {etapa === "texto" && (
              <div className="space-y-3">
                <p className="text-muted-foreground/80 font-light text-sm leading-relaxed">
                  Revise o texto ao lado. Você pode alterar qualquer trecho —
                  inclusive fora das variáveis. Nada é gerado ainda.
                </p>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setEtapa("informacoes")}
                    className="rounded-none border-border bg-transparent hover:bg-background h-11 px-5 font-medium gap-2"
                  >
                    <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
                    Voltar
                  </Button>
                  <Button
                    onClick={() => setEtapa("revisao")}
                    className="rounded-none bg-primary hover:bg-primary/90 text-primary-foreground h-11 px-5 font-medium flex-1"
                  >
                    Prosseguir
                  </Button>
                </div>
              </div>
            )}

            {etapa === "revisao" && (
              <div className="space-y-4">
                <div className="border border-border/60 p-5 space-y-3">
                  <div className="space-y-1">
                    <h4 className="font-expanded text-[10px] tracking-widest uppercase text-foreground">
                      Revisão de IA (opcional)
                    </h4>
                    <p className="text-xs text-muted-foreground font-light leading-relaxed">
                      Se quiser, peça um feedback da IA sobre cláusulas,
                      consistência e conformidade (LGPD / CFM / CDC). É só apoio —
                      nunca impede a geração.
                    </p>
                  </div>
                  {relatorioPreGen && <RelatorioIa relatorio={relatorioPreGen} />}
                  <Button
                    variant="outline"
                    onClick={handlePedirFeedback}
                    disabled={revisarPrevia.isPending}
                    className="w-full rounded-none border-accent/40 bg-transparent hover:bg-background text-accent hover:text-accent h-11 font-medium gap-2 disabled:opacity-40"
                  >
                    {revisarPrevia.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                    ) : (
                      <Sparkles className="w-4 h-4" strokeWidth={1.5} />
                    )}
                    {revisarPrevia.isPending
                      ? "Analisando..."
                      : relatorioPreGen
                        ? "Pedir feedback de novo"
                        : "Pedir feedback da IA"}
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setEtapa("texto")}
                    className="rounded-none border-border bg-transparent hover:bg-background h-12 px-5 font-medium gap-2"
                  >
                    <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
                    Voltar para editar
                  </Button>
                  <Button
                    onClick={handleGerar}
                    disabled={gerar.isPending || geracaoTravada}
                    className="rounded-none bg-primary hover:bg-primary/90 text-primary-foreground h-12 px-5 font-medium flex-1 gap-2 disabled:opacity-40"
                  >
                    {gerar.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                    ) : (
                      <FileText className="w-4 h-4" strokeWidth={1.5} />
                    )}
                    {gerar.isPending ? "Gerando..." : "Gerar contrato"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}

      {/* Lista de gerações + visão pós-geração (oculta durante o assistente) */}
      {!emWizard &&
        (loadingGeracoes ? (
        <Skeleton className="h-16 w-full bg-background rounded-none" />
      ) : erroGeracoes ? (
        <p className="text-sm text-muted-foreground/70 font-light border-t border-border/60 pt-6">
          Não foi possível carregar os documentos gerados.
        </p>
      ) : geracoesDoTipo.length > 0 ? (
        <div className="border-t border-border/60 pt-6 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="font-expanded text-[10px] tracking-widest text-muted-foreground uppercase">
              {t.plural}
            </h3>
            <Button
              variant="outline"
              onClick={reiniciarWizard}
              className="rounded-none border-accent/40 bg-transparent hover:bg-background text-accent hover:text-accent h-8 px-3 gap-1.5 text-[11px] font-medium"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.8} />
              Criar novo documento
            </Button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {geracoesDoTipo.map((g) => {
              const v = statusVisual(g.status);
              const ativa = selecionada?.id === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSelecionadaId(g.id)}
                  className={`text-left border px-3 py-2 transition-colors ${
                    ativa
                      ? "border-accent/60 bg-background"
                      : "border-border/60 bg-transparent hover:border-border"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-expanded text-[9px] tracking-widest uppercase text-accent">
                      {g.arquivoObjectPath
                        ? "PDF enviado"
                        : g.origem === "ia"
                          ? "Criado por IA"
                          : `${g.modeloProcedimento} v${g.modeloVersao}`}
                    </span>
                    <span className={`font-expanded text-[8px] tracking-widest uppercase border px-1.5 py-0.5 ${v.className}`}>
                      {v.label}
                    </span>
                  </div>
                  <p className="font-mono text-[10px] text-muted-foreground/60 mt-1">
                    {format(parseISO(g.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </p>
                </button>
              );
            })}
          </div>

          {selecionada && (
            <div className="space-y-5 pt-2">
                {/* Decisões do motor de cláusulas (auto-inferir + confirmar).
                    Só aparece quando o modelo tem regiões tipadas. */}
                {editavel && decisoes.length > 0 && (
                  <DecisoesPainel
                    decisoes={decisoes}
                    onAplicar={handleAplicarDecisoes}
                    aplicando={definirDecisoes.isPending}
                  />
                )}

                {/* Refino por chat — só para documentos redigidos por IA. */}
                {editavel && selecionada.origem === "ia" && (
                  <RefinamentoIaPanel
                    geracaoId={selecionada.id}
                    conversa={selecionada.conversaIa}
                    onRefinado={handleRefinadoIa}
                  />
                )}

                {editavel && (
                  <div className="border border-border/60 p-5 space-y-4">
                    <div className="space-y-1">
                      <h4 className="font-expanded text-[10px] tracking-widest uppercase text-foreground">
                        Aprovar e enviar à Autentique
                      </h4>
                      <p className="text-xs text-muted-foreground font-light leading-relaxed">
                        Ao aprovar, o {t.nome} é criado na Autentique e vinculado à
                        paciente. Registramos quem aprovou e quando. Esta etapa é
                        obrigatória — nada vai à Autentique sem ela.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground">
                          Quem está aprovando
                        </label>
                        <Input
                          value={aprovadoPor}
                          onChange={(e) => setAprovadoPor(e.target.value)}
                          placeholder="Seu nome (auditoria)"
                          className="rounded-none h-11 bg-background border-transparent"
                        />
                      </div>

                      {/* Signatários do documento (assinam na Autentique). Contrato:
                          paciente + representante legal. Termo: paciente + médico. */}
                      <div className="border-t border-border/40 pt-3 space-y-3">
                        <p className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground">
                          Signatários
                        </p>

                        {/* 1) Paciente */}
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-light text-muted-foreground/80">
                            Paciente · <span className="text-foreground">{pacienteNome}</span>
                          </label>
                          <Input
                            type="email"
                            value={emailSignatario}
                            onChange={(e) => setEmailSignatario(e.target.value)}
                            placeholder="E-mail do paciente"
                            className="rounded-none h-11 bg-background border-transparent"
                          />
                        </div>

                        {/* 2) Representante legal (contrato) ou Médico (termo) */}
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-light text-muted-foreground/80">
                            {rotuloSegundo}
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Input
                              value={segundoNome}
                              onChange={(e) => setSegundoNome(e.target.value)}
                              placeholder="Nome"
                              className="rounded-none h-11 bg-background border-transparent"
                            />
                            <Input
                              type="email"
                              value={segundoEmail}
                              onChange={(e) => setSegundoEmail(e.target.value)}
                              placeholder="E-mail"
                              className="rounded-none h-11 bg-background border-transparent"
                            />
                          </div>
                        </div>

                        {/* 3+) Signatários adicionais (opcionais). Cada um assina
                            por e-mail, como os demais. */}
                        {signatariosExtra.map((sig, i) => (
                          <div key={i} className="space-y-1.5">
                            <label className="text-[11px] font-light text-muted-foreground/80">
                              Signatário adicional {i + 1}
                            </label>
                            <div className="flex items-center gap-2">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1">
                                <Input
                                  value={sig.nome}
                                  onChange={(e) =>
                                    setSignatariosExtra((atual) =>
                                      atual.map((s, j) =>
                                        j === i ? { ...s, nome: e.target.value } : s,
                                      ),
                                    )
                                  }
                                  placeholder="Nome"
                                  className="rounded-none h-11 bg-background border-transparent"
                                />
                                <Input
                                  type="email"
                                  value={sig.email}
                                  onChange={(e) =>
                                    setSignatariosExtra((atual) =>
                                      atual.map((s, j) =>
                                        j === i ? { ...s, email: e.target.value } : s,
                                      ),
                                    )
                                  }
                                  placeholder="E-mail"
                                  className="rounded-none h-11 bg-background border-transparent"
                                />
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  setSignatariosExtra((atual) =>
                                    atual.filter((_, j) => j !== i),
                                  )
                                }
                                aria-label="Remover signatário"
                                className="rounded-none h-11 w-11 shrink-0 text-muted-foreground hover:text-foreground"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setSignatariosExtra((atual) => [
                              ...atual,
                              { nome: "", email: "" },
                            ])
                          }
                          className="rounded-none h-9 gap-1.5 text-[11px] font-light text-muted-foreground hover:text-foreground px-0"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Adicionar signatário
                        </Button>

                        <p className="text-[10px] text-muted-foreground/60 font-light leading-relaxed">
                          Cada signatário recebe o documento por e-mail para assinar.
                          Não use o e-mail da conta Autentique (não recebe o convite).
                        </p>
                      </div>
                    </div>

                    <ul className="space-y-2 border-t border-border/40 pt-4">
                      {[
                        ...(decisoes.length > 0
                          ? [
                              {
                                ok: pendenciasDecisao === 0,
                                label:
                                  pendenciasDecisao === 0
                                    ? "Decisões confirmadas"
                                    : `Confirme ${pendenciasDecisao} decisã${pendenciasDecisao > 1 ? "ões" : "o"} acima`,
                              },
                            ]
                          : []),
                        {
                          ok: !corpoSujo,
                          label: corpoSujo
                            ? "Salve o rascunho antes de aprovar"
                            : "Rascunho salvo",
                        },
                        {
                          ok: aprovadoPor.trim() !== "",
                          label:
                            aprovadoPor.trim() !== ""
                              ? "Aprovador informado"
                              : "Informe quem está aprovando",
                        },
                        {
                          ok: signatariosCompletos,
                          label: signatariosCompletos
                            ? "Signatários preenchidos"
                            : `Preencha nome e e-mail de todos os signatários (paciente, ${tipo === "contrato" ? "representante legal" : "médico"} e adicionais)`,
                        },
                      ].map((item, i) => (
                        <li
                          key={i}
                          className="flex items-center gap-2 text-[11px] font-light"
                        >
                          {item.ok ? (
                            <CircleCheck
                              className="w-3.5 h-3.5 text-accent shrink-0"
                              strokeWidth={1.8}
                            />
                          ) : (
                            <span className="w-3.5 h-3.5 rounded-full border border-amber-500/60 shrink-0" />
                          )}
                          <span
                            className={
                              item.ok ? "text-muted-foreground" : "text-amber-500"
                            }
                          >
                            {item.label}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      onClick={() => setConfirmarEnvio(true)}
                      disabled={
                        aprovadoPor.trim() === "" ||
                        !signatariosCompletos ||
                        corpoSujo ||
                        enviando ||
                        pendenciasDecisao > 0
                      }
                      className="w-full rounded-none bg-primary hover:bg-primary/90 text-primary-foreground h-12 font-medium gap-2"
                    >
                      {enviando ? (
                        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                      ) : (
                        <Send className="w-4 h-4" strokeWidth={1.5} />
                      )}
                      {enviando ? "Enviando..." : "Aprovar e enviar à Autentique"}
                    </Button>
                  </div>
                )}

                {selecionada.status === "enviado" && (
                  <div className="border border-accent/30 p-5 flex items-start gap-3">
                    <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" strokeWidth={2.5} />
                    <p className="text-sm text-foreground font-light leading-relaxed">
                      {t.criadoAutentique}
                    </p>
                  </div>
                )}

                {/* Visualização por parte: criado → assinado por cada signatário. */}
                <PainelAssinaturas
                  geracaoId={selecionada.id}
                  enviado={selecionada.status === "enviado"}
                />
            </div>
          )}
        </div>
      ) : (
        !loadingGeracoes && (
          <p className="text-sm text-muted-foreground/70 font-light border-t border-border/60 pt-6">
            {t.vazioGerados}
            {documentoJaVinculado
              ? " Já existe um documento vinculado manualmente — veja o status abaixo."
              : ""}
          </p>
        )
      ))}
        </div>

        {/* COLUNA DIREITA — prévia do documento (fixa, rola por dentro; assim o
            "pular até o campo" acontece dentro da prévia sem mexer na ficha). */}
        <div className="lg:order-2 min-w-0 space-y-3 lg:sticky lg:top-24 lg:max-h-[calc(100dvh_-_7rem)] lg:overflow-y-auto">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-accent rotate-45" aria-hidden />
            <span className="font-expanded text-[10px] tracking-widest uppercase text-muted-foreground">
              Prévia do documento
            </span>
          </div>
          {previewPane}
        </div>
      </div>

      <AlertDialog open={confirmarEnvio} onOpenChange={setConfirmarEnvio}>
        <AlertDialogContent className="rounded-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-xl font-light tracking-tight">
              Aprovar e enviar à Autentique?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-light leading-relaxed">
              O documento será criado na Autentique e vinculado à paciente. Esta
              ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <dl className="border border-border/60 divide-y divide-border/40 text-sm">
            {[
              { rotulo: "Paciente", valor: pacienteNome },
              { rotulo: "Documento", valor: t.nome },
              {
                rotulo: selecionada?.arquivoObjectPath ? "Arquivo" : "Modelo",
                valor: selecionada
                  ? selecionada.arquivoObjectPath
                    ? (selecionada.arquivoNome ?? "PDF enviado")
                    : `${selecionada.modeloProcedimento} v${selecionada.modeloVersao}`
                  : "—",
              },
              { rotulo: "Aprovado por", valor: aprovadoPor.trim() || "—" },
            ].map((linha) => (
              <div
                key={linha.rotulo}
                className="flex items-center justify-between gap-4 px-4 py-2.5"
              >
                <dt className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground">
                  {linha.rotulo}
                </dt>
                <dd className="text-foreground font-light text-right truncate">
                  {linha.valor}
                </dd>
              </div>
            ))}
          </dl>

          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none">Cancelar</AlertDialogCancel>
            <Button
              onClick={handleAprovarEEnviar}
              className="rounded-none bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Confirmar e enviar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmarRegerar} onOpenChange={setConfirmarRegerar}>
        <AlertDialogContent className="rounded-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-xl font-light tracking-tight">
              Atualizar o documento com os dados da ficha?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-light leading-relaxed">
              O texto será regerado a partir do modelo com os dados salvos da
              paciente e as decisões confirmadas. Quaisquer ajustes manuais de
              texto feitos neste rascunho serão descartados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none">Cancelar</AlertDialogCancel>
            <Button
              onClick={handleRegerarComDados}
              className="rounded-none bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Atualizar documento
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
