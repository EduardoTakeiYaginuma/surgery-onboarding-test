import { useState } from "react";
import {
  useGerarIaDocumento,
  type ContratoGeracao,
  type FormularioDocumentoIa,
  type Paciente,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles, RotateCcw, Plus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PROCEDIMENTOS_SUGESTOES } from "@/lib/procedimentos-sugestoes";

type Tipo = "contrato" | "termo";

interface Props {
  pacienteId: number;
  tipo: Tipo;
  paciente?: Paciente | null;
  /** Chamado com a geração criada — o pai seleciona o rascunho e mostra a revisão. */
  onGerado: (g: ContratoGeracao) => void;
  /** Volta para a bifurcação (escolher como criar). */
  onCancelar: () => void;
}

const LABEL = "font-expanded text-[9px] tracking-widest uppercase text-muted-foreground";
const INPUT = "rounded-none h-11 bg-background border-transparent";

/**
 * Via SIMPLES de criação: um formulário coleta os dados e o ChatGPT redige o
 * documento (contrato/termo) seguindo o padrão dos documentos-exemplo da clínica.
 * Não usa o motor de cláusulas nem modelos — o corpo vem pronto da IA.
 */
export function CriacaoIaDocumento({
  pacienteId,
  tipo,
  paciente,
  onGerado,
  onCancelar,
}: Props) {
  const { toast } = useToast();
  const gerar = useGerarIaDocumento();
  const doc = tipo === "termo" ? "termo" : "contrato";

  const [nome, setNome] = useState(paciente?.nome ?? "");
  const [genero, setGenero] = useState<"feminino" | "masculino">("feminino");
  const [cpf, setCpf] = useState(paciente?.cpf ?? "");
  const [rg, setRg] = useState(paciente?.rg ?? "");
  const [nascimento, setNascimento] = useState(paciente?.nascimento ?? "");
  const [endereco, setEndereco] = useState(paciente?.endereco ?? "");
  const [email, setEmail] = useState(paciente?.email ?? "");
  const [telefone, setTelefone] = useState(paciente?.telefone ?? "");
  const [medica, setMedica] = useState(paciente?.medica ?? "");
  const [crm, setCrm] = useState(paciente?.crm ?? "");
  const [rqe, setRqe] = useState(paciente?.rqe ?? "");
  const [cidadeMedica, setCidadeMedica] = useState("");
  const [procedimentos, setProcedimentos] = useState<string[]>(
    () => paciente?.procedimentos ?? [],
  );
  // Painel "Novo procedimento" (sugestões + campo livre), oculto por padrão.
  const [adicionandoProcedimento, setAdicionandoProcedimento] = useState(false);
  const [procedimentoCustom, setProcedimentoCustom] = useState("");
  const [cidade, setCidade] = useState("");
  const [data, setData] = useState("");

  // Contrato
  const [foro, setForo] = useState("");
  const [dataProcedimento, setDataProcedimento] = useState(
    paciente?.dataCirurgia ?? "",
  );
  const [localProcedimento, setLocalProcedimento] = useState("");
  const [valorTotal, setValorTotal] = useState("");
  const [valorSinal, setValorSinal] = useState(paciente?.valorSinal ?? "");
  const [valorSaldo, setValorSaldo] = useState(paciente?.valorPendente ?? "");
  const [vencimentoSaldo, setVencimentoSaldo] = useState(
    paciente?.dataPagamentoPendente ?? "",
  );
  const [condicoesComerciais, setCondicoesComerciais] = useState("");
  const [responsavelFinanceiro, setResponsavelFinanceiro] = useState("");

  // Termo
  const [autorizaImagem, setAutorizaImagem] = useState(true);

  function adicionarProcedimento(p: string) {
    const nome = p.trim();
    if (!nome) return;
    setProcedimentos((atual) =>
      atual.includes(nome) ? atual : [...atual, nome],
    );
  }

  function removerProcedimento(p: string) {
    setProcedimentos((atual) => atual.filter((x) => x !== p));
  }

  function adicionarProcedimentoCustom() {
    adicionarProcedimento(procedimentoCustom);
    setProcedimentoCustom("");
  }

  async function handleGerar() {
    if (!nome.trim()) {
      toast({ variant: "destructive", title: "Informe o nome da paciente." });
      return;
    }
    if (procedimentos.length === 0) {
      toast({
        variant: "destructive",
        title: "Selecione ao menos um procedimento.",
      });
      return;
    }
    const formulario: FormularioDocumentoIa = {
      nome: nome.trim(),
      genero,
      procedimentos,
      medica: medica.trim(),
      ...(cpf.trim() ? { cpf: cpf.trim() } : {}),
      ...(rg.trim() ? { rg: rg.trim() } : {}),
      ...(nascimento.trim() ? { nascimento: nascimento.trim() } : {}),
      ...(endereco.trim() ? { endereco: endereco.trim() } : {}),
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(telefone.trim() ? { telefone: telefone.trim() } : {}),
      ...(crm.trim() ? { crm: crm.trim() } : {}),
      ...(rqe.trim() ? { rqe: rqe.trim() } : {}),
      ...(cidadeMedica.trim() ? { cidadeMedica: cidadeMedica.trim() } : {}),
      ...(cidade.trim() ? { cidade: cidade.trim() } : {}),
      ...(data.trim() ? { data: data.trim() } : {}),
      ...(tipo === "contrato"
        ? {
            ...(foro.trim() ? { foro: foro.trim() } : {}),
            ...(dataProcedimento.trim()
              ? { dataProcedimento: dataProcedimento.trim() }
              : {}),
            ...(localProcedimento.trim()
              ? { localProcedimento: localProcedimento.trim() }
              : {}),
            ...(valorTotal.trim() ? { valorTotal: valorTotal.trim() } : {}),
            ...(String(valorSinal).trim() ? { valorSinal: String(valorSinal) } : {}),
            ...(String(valorSaldo).trim() ? { valorSaldo: String(valorSaldo) } : {}),
            ...(vencimentoSaldo.trim()
              ? { vencimentoSaldo: vencimentoSaldo.trim() }
              : {}),
            ...(condicoesComerciais.trim()
              ? { condicoesComerciais: condicoesComerciais.trim() }
              : {}),
            ...(responsavelFinanceiro.trim()
              ? { responsavelFinanceiro: responsavelFinanceiro.trim() }
              : {}),
          }
        : { autorizaImagem }),
    };
    try {
      const nova = await gerar.mutateAsync({
        id: pacienteId,
        data: { tipo, formulario },
      });
      onGerado(nova);
      toast({
        title: `${tipo === "termo" ? "Termo" : "Contrato"} gerado pela IA`,
        description: "Revise o documento abaixo, peça ajustes ou aprove para enviar.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Não foi possível gerar o documento",
        description: "A IA não respondeu agora. Tente novamente em instantes.",
      });
    }
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onCancelar}
        className="text-[11px] font-light text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
      >
        <RotateCcw className="w-3 h-3" strokeWidth={1.5} />
        Voltar
      </button>

      <div className="space-y-1">
        <h3 className="font-serif text-xl font-light tracking-tight text-foreground">
          Criar {doc} com IA
        </h3>
        <p className="text-sm text-muted-foreground font-light leading-relaxed">
          Preencha os dados abaixo. A IA redige o {doc} seguindo fielmente o padrão
          dos documentos da clínica — você revisa e ajusta antes de enviar.
        </p>
      </div>

      <div className="space-y-4 border border-border/60 p-5">
        {/* Identificação */}
        <p className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground">
          Identificação da paciente
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Nome completo" value={nome} onChange={setNome} />
          <div className="space-y-1.5">
            <label className={LABEL}>Gênero (concordância)</label>
            <div className="flex gap-2">
              {(["feminino", "masculino"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGenero(g)}
                  className={`flex-1 h-11 border text-[11px] font-light capitalize transition-colors ${
                    genero === g
                      ? "border-accent/60 bg-background text-foreground"
                      : "border-border/60 bg-transparent text-muted-foreground hover:border-border"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <Campo label="CPF" value={cpf} onChange={setCpf} />
          <Campo label="RG" value={rg} onChange={setRg} />
          <Campo label="Data de nascimento" value={nascimento} onChange={setNascimento} placeholder="dd/mm/aaaa" />
          <Campo label="Tel / WhatsApp" value={telefone} onChange={setTelefone} />
          <Campo label="E-mail" value={email} onChange={setEmail} />
          <Campo
            label="Endereço completo"
            value={endereco}
            onChange={setEndereco}
            placeholder="Rua, nº, bairro, cidade/UF"
          />
        </div>

        {/* Médica */}
        <p className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground border-t border-border/40 pt-4">
          Médica responsável
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Médica" value={medica} onChange={setMedica} />
          <Campo label="Cidade de atendimento" value={cidadeMedica} onChange={setCidadeMedica} />
          <Campo label="CRM" value={crm} onChange={setCrm} />
          <Campo label="RQE" value={rqe} onChange={setRqe} />
        </div>

        {/* Procedimentos */}
        <p className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground border-t border-border/40 pt-4">
          Procedimentos
        </p>

        {/* Procedimentos já cadastrados na paciente */}
        {procedimentos.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {procedimentos.map((p) => (
              <span
                key={p}
                className="inline-flex items-center gap-2 rounded-none border border-accent/40 bg-background px-3 py-1.5 text-[12px] font-light text-foreground"
              >
                {p}
                <button
                  type="button"
                  onClick={() => removerProcedimento(p)}
                  aria-label={`Remover ${p}`}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[12px] font-light text-muted-foreground">
            Nenhum procedimento adicionado ainda.
          </p>
        )}

        {/* Botão + painel para adicionar um novo procedimento */}
        {!adicionandoProcedimento ? (
          <button
            type="button"
            onClick={() => setAdicionandoProcedimento(true)}
            className="inline-flex items-center gap-1.5 text-[11px] font-light text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
            Novo procedimento
          </button>
        ) : (
          <div className="space-y-3 border border-border/60 p-4">
            <p className="font-mono text-[10px] tracking-wide text-muted-foreground/70">
              Sugestões — clique para adicionar
            </p>
            <div className="flex flex-wrap gap-2">
              {PROCEDIMENTOS_SUGESTOES.filter(
                (s) => !procedimentos.includes(s),
              ).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => adicionarProcedimento(s)}
                  className="text-left rounded-none border border-border/60 bg-transparent px-3 py-2 text-[12px] font-light text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Input
                value={procedimentoCustom}
                onChange={(e) => setProcedimentoCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    adicionarProcedimentoCustom();
                  }
                }}
                placeholder="Outro procedimento (texto livre)"
                className={INPUT}
              />
              <Button
                type="button"
                onClick={adicionarProcedimentoCustom}
                className="rounded-none h-11 px-4 shrink-0 bg-background hover:bg-background/70 text-foreground border border-accent/30 inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                Adicionar
              </Button>
            </div>
            <button
              type="button"
              onClick={() => setAdicionandoProcedimento(false)}
              className="text-[11px] font-light text-muted-foreground hover:text-foreground transition-colors"
            >
              Concluir
            </button>
          </div>
        )}

        {tipo === "contrato" ? (
          <>
            {/* Procedimento: data/local */}
            <p className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground border-t border-border/40 pt-4">
              Procedimento e foro
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Data prevista do procedimento" value={dataProcedimento} onChange={setDataProcedimento} placeholder="dd/mm/aaaa" />
              <Campo label="Local do procedimento" value={localProcedimento} onChange={setLocalProcedimento} />
              <Campo label="Foro (comarca)" value={foro} onChange={setForo} placeholder="Ex.: São Paulo/SP" />
            </div>

            {/* Pagamento enxuto + texto livre */}
            <p className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground border-t border-border/40 pt-4">
              Pagamento
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Valor total dos honorários" value={valorTotal} onChange={setValorTotal} placeholder="Ex.: 13500" />
              <Campo label="Sinal / valor já pago" value={String(valorSinal)} onChange={setValorSinal} />
              <Campo label="Saldo em aberto" value={String(valorSaldo)} onChange={setValorSaldo} />
              <Campo label="Vencimento do saldo" value={vencimentoSaldo} onChange={setVencimentoSaldo} placeholder="dd/mm/aaaa" />
            </div>
            <div className="space-y-1.5">
              <label className={LABEL}>Condições comerciais (texto livre)</label>
              <textarea
                value={condicoesComerciais}
                onChange={(e) => setCondicoesComerciais(e.target.value)}
                rows={5}
                placeholder="Descreva descontos, forma de pagamento (PIX à vista, sinal + saldo, cartão parcelado), validade da condição, desconto extraordinário, cláusula de exames pré-op, flexibilidade de reagendamento, custos de terceiros… A IA transforma isso nas cláusulas da Seção III seguindo o padrão."
                className="w-full rounded-none bg-background border border-transparent focus:border-border p-3 text-sm font-light leading-relaxed resize-y"
              />
            </div>
            <Campo
              label="Responsável financeiro (se houver)"
              value={responsavelFinanceiro}
              onChange={setResponsavelFinanceiro}
            />

            {/* Fecho */}
            <p className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground border-t border-border/40 pt-4">
              Assinatura
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Cidade da assinatura" value={cidade} onChange={setCidade} />
              <Campo label="Data da assinatura" value={data} onChange={setData} placeholder="dd/mm/aaaa" />
            </div>
          </>
        ) : (
          <>
            <p className="font-expanded text-[9px] tracking-widest uppercase text-muted-foreground border-t border-border/40 pt-4">
              Registro
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Cidade do registro" value={cidade} onChange={setCidade} />
              <Campo label="Data do registro" value={data} onChange={setData} placeholder="dd/mm/aaaa (ou deixe vazio)" />
            </div>
            <label className="flex items-center gap-2 text-[12px] font-light text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={autorizaImagem}
                onChange={(e) => setAutorizaImagem(e.target.checked)}
                className="accent-current"
              />
              Autoriza uso de imagem para fins científicos/ilustrativos (LGPD)
            </label>
          </>
        )}
      </div>

      <Button
        onClick={handleGerar}
        disabled={gerar.isPending}
        className="w-full rounded-none bg-primary hover:bg-primary/90 text-primary-foreground h-12 font-medium gap-2"
      >
        {gerar.isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
        ) : (
          <Sparkles className="w-4 h-4" strokeWidth={1.5} />
        )}
        {gerar.isPending ? "Gerando com IA…" : `Gerar ${doc} com IA`}
      </Button>
    </div>
  );
}

/** Campo de texto simples com rótulo no padrão Camada. */
function Campo({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className={LABEL}>{label}</label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={INPUT}
      />
    </div>
  );
}
