import { useMemo } from "react";
import {
  type SecaoConteudo,
  type DocumentoPaciente,
} from "@workspace/api-client-react";
import { FileText, Eye, Download } from "lucide-react";
import coverPhoto from "@assets/image_1782503830851.webp";
import {
  SecoesPublicas,
  Tracado,
  type PedidoExamesResumo,
  type ReceitaPreparoPeleResumo,
  type ReceituarioPosopResumo,
} from "@/components/secoes-publicas";
import {
  SurgeryFactsGrid,
  LogoClinicaLockup,
  MedicaIdentidade,
} from "@/components/patient-page-sections";
import { etapaAtual, contagemRegressiva, linkMapa } from "@/lib/patient-tools";
import { resolverSecoesPreview, type DadosPreview } from "@/lib/secoes-preview";
import { formatarReais } from "@workspace/secoes";
import { differenceInCalendarDays, parseISO } from "date-fns";

/**
 * Tela da paciente renderizada como um espelho visual da página pública
 * (`/p/:token`): capa editorial com a contagem regressiva, bloco "Sua médica",
 * card "Sua cirurgia" e as seções de preparo via o renderizador compartilhado
 * (`resolverSecoesPreview` + `SecoesPublicas`). Vive dentro do território de tema
 * claro/escuro `.paciente`. É read-only e ao vivo, sem persistência nem ações:
 * serve para a secretária ver, enquanto digita, o que a paciente vai receber.
 *
 * Espelha o cabeçalho (logo + nome da clínica) e o bloco "Sua médica" (foto +
 * CRM/RQE) da página pública, com os mesmos fallbacks (logo → emblema "K"; foto
 * → iniciais). Os PDFs anexados aparecem na seção "Documentos e exames" quando
 * há algum; o resto que a prévia ainda não carrega (status de contrato/pagamento)
 * segue omitido com elegância — nunca inventado.
 */
function formatarTamanhoDoc(bytes: number): string {
  if (!bytes || bytes <= 0) return "PDF";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function PaginaPacienteScreen({
  secoes,
  dados,
  documentos = [],
  onAbrirDocumento,
  documentoAcao = null,
  pedidoExames = null,
  receitaPreparoPele = null,
  receituarioPosop = null,
}: {
  secoes: SecaoConteudo[];
  dados: DadosPreview;
  documentos?: DocumentoPaciente[];
  onAbrirDocumento?: (doc: DocumentoPaciente, modo: "abrir" | "baixar") => void;
  documentoAcao?: string | null;
  pedidoExames?: PedidoExamesResumo | null;
  receitaPreparoPele?: ReceitaPreparoPeleResumo | null;
  receituarioPosop?: ReceituarioPosopResumo | null;
}) {
  const resolvidas = useMemo(() => resolverSecoesPreview(secoes, dados), [secoes, dados]);
  // Mesmo split da página pública real (public-patient.tsx): contatos e política
  // vão para o fim, depois das seções de preparo/documentos — assim a ordem da
  // prévia bate exatamente com a que a paciente vê.
  const secoesSecundarias = useMemo(
    () => resolvidas.filter((s) => s.tipo === "contatos" || s.tipo === "politica"),
    [resolvidas],
  );
  const secoesPrincipais = useMemo(
    () => resolvidas.filter((s) => s.tipo !== "contatos" && s.tipo !== "politica"),
    [resolvidas],
  );

  const dias = useMemo(() => {
    try {
      return differenceInCalendarDays(parseISO(dados.dataCirurgia), new Date());
    } catch {
      return 0;
    }
  }, [dados.dataCirurgia]);

  const passoAtual = etapaAtual(dias);
  const contagem = contagemRegressiva(dias);
  const dataFmt = useMemo(() => {
    const [ano, mes, dia] = dados.dataCirurgia.split("-");
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : dados.dataCirurgia;
  }, [dados.dataCirurgia]);
  const primeiroNome = dados.nome.trim().split(/\s+/)[0] ?? dados.nome;
  const procedimentos = dados.procedimentos.filter((p) => p.trim().length > 0);

  return (
    <div
      data-testid="previa-pagina-paciente"
      className="min-h-full bg-[var(--pp-bg)] text-[var(--pp-text)] font-sans selection:bg-[var(--pp-accent)]/20"
    >
      {/* ============ CAPA ============ */}
      <header
        className="pp-slab pt-9 pb-10 px-6"
        style={{
          backgroundImage: `linear-gradient(rgba(10,23,41,.80),rgba(10,23,41,.93)),url(${coverPhoto})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <LogoClinicaLockup
            variant="preview"
            clinica={dados.clinica ?? ""}
            medicoLogoUrl={dados.medicoLogoUrl ?? null}
          />
          <Tracado />
        </div>

        <div className="mt-10">
          <p className="font-expanded text-[9px] tracking-[0.22em] uppercase opacity-70">
            Olá, {primeiroNome}
            {dias > 1 ? " — faltam" : ""}
          </p>
          <div className="flex items-baseline gap-3 mt-2 pb-3 border-b border-[var(--pp-accent)] w-max">
            {dias > 1 ? (
              <>
                <span className="font-mono font-medium leading-none text-[56px]">{dias}</span>
                <span className="font-serif italic font-light text-[22px]">dias</span>
              </>
            ) : (
              <span className="font-serif italic font-light text-[28px]">{contagem}</span>
            )}
          </div>
          <p className="font-mono text-xs mt-4 opacity-70">
            para a sua cirurgia · {dataFmt} · {dados.horario}
          </p>
        </div>
      </header>

      <main className="px-6">
        {/* ============ MÉDICA ============ */}
        <section className="flex items-center gap-4 py-8 border-b border-[var(--pp-accent)]/15">
          <MedicaIdentidade
            variant="preview"
            medica={dados.medica}
            crm={dados.crm ?? ""}
            rqe={dados.rqe ?? ""}
            medicoFotoUrl={dados.medicoFotoUrl ?? null}
          />
        </section>

        {/* ============ SUA CIRURGIA ============ */}
        {/* O bloco "Agora"/"Tudo certo" e a lista de confirmações foram removidos
            (espelha a página pública); o saldo pendente aparece abaixo dos fatos. */}
        {procedimentos.length > 0 && (
          <section className="py-10 space-y-6 border-b border-[var(--pp-accent)]/20">
            <SurgeryFactsGrid
              variant="preview"
              procedimentos={procedimentos}
              dataFmt={dataFmt}
              horario={dados.horario}
              localNome={dados.hospital || dados.local}
              mapaHref={dados.local ? linkMapa(dados.local, "") : null}
              anestesia={dados.equipe}
            />

            {/* Saldo pendente dos honorários — espelha a página pública. */}
            {!dados.pagamentoQuitado && (
              <p className="font-light leading-relaxed text-[var(--pp-accent)] text-sm">
                Você ainda tem um saldo de{" "}
                <span className="font-mono">{formatarReais(dados.valorPendente)}</span> pendente.
              </p>
            )}
          </section>
        )}

        {/* ============ PREPARO (seções principais) ============ */}
        <div className="py-10 space-y-16">
          {resolvidas.length === 0 ? (
            <div className="py-6 text-center">
              <p className="font-light text-[var(--pp-text)]/60 max-w-xs mx-auto leading-relaxed text-sm">
                Nenhuma seção para pré-visualizar ainda. Adicione seções no conteúdo para vê-las aqui.
              </p>
            </div>
          ) : secoesPrincipais.length > 0 ? (
            <SecoesPublicas
              secoes={secoesPrincipais}
              passoAtual={passoAtual}
              feito={{}}
              toggle={() => {}}
              primeiroNome={primeiroNome}
              dataFmt={dataFmt}
              horario={dados.horario}
              animar={false}
              pedidoExames={pedidoExames}
              receitaPreparoPele={receitaPreparoPele}
              receituarioPosop={receituarioPosop}
            />
          ) : null}
        </div>

        {/* ============ DOCUMENTOS ============ */}
        {documentos.length > 0 && (
          <section className="py-10 space-y-6 border-t border-[var(--pp-accent)]/20">
            <div className="flex items-center gap-4">
              <h3 className="font-serif text-2xl text-[var(--pp-accent)] italic">
                Documentos e exames
              </h3>
              <div className="flex-1 h-px bg-[var(--pp-accent)]/20"></div>
            </div>
            <div className="space-y-4">
              {documentos.map((doc) => (
                <div
                  key={doc.id}
                  className="border border-[var(--pp-accent)]/20 p-5"
                >
                  <div className="flex items-start gap-4 mb-4">
                    <FileText className="w-5 h-5 text-[var(--pp-accent)] shrink-0 mt-1 stroke-[1.5]" />
                    <div className="min-w-0">
                      <p className="font-medium leading-relaxed break-words">
                        {doc.rotulo}
                      </p>
                      <p className="font-mono text-[11px] opacity-50 mt-1">
                        PDF · {formatarTamanhoDoc(doc.tamanho)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => onAbrirDocumento?.(doc, "abrir")}
                      disabled={!onAbrirDocumento || documentoAcao !== null}
                      className="group flex items-center justify-center gap-3 bg-[var(--pp-surface)] border border-[var(--pp-accent)]/25 hover:border-[var(--pp-accent)]/70 transition-colors px-4 py-3 disabled:opacity-60"
                    >
                      <Eye className="w-4 h-4 text-[var(--pp-accent)] stroke-[1.5] shrink-0" />
                      <span className="font-expanded text-[10px] tracking-widest uppercase text-[var(--pp-text)]">
                        {documentoAcao === `${doc.id}:abrir` ? "Abrindo..." : "Ver"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onAbrirDocumento?.(doc, "baixar")}
                      disabled={!onAbrirDocumento || documentoAcao !== null}
                      className="group flex items-center justify-center gap-3 bg-[var(--pp-surface)] border border-[var(--pp-accent)]/25 hover:border-[var(--pp-accent)]/70 transition-colors px-4 py-3 disabled:opacity-60"
                    >
                      <Download className="w-4 h-4 text-[var(--pp-accent)] stroke-[1.5] shrink-0" />
                      <span className="font-expanded text-[10px] tracking-widest uppercase text-[var(--pp-text)]">
                        {documentoAcao === `${doc.id}:baixar` ? "Baixando..." : "Baixar"}
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ============ SECUNDÁRIO (contatos + política, no fim) ============ */}
        {secoesSecundarias.length > 0 && (
          <section className="py-10 space-y-16 border-t border-[var(--pp-accent)]/20">
            <SecoesPublicas
              secoes={secoesSecundarias}
              passoAtual={passoAtual}
              feito={{}}
              toggle={() => {}}
              primeiroNome={primeiroNome}
              dataFmt={dataFmt}
              horario={dados.horario}
              animar={false}
            />
          </section>
        )}
      </main>
    </div>
  );
}

/**
 * Prévia ao vivo embutível (não-modal) da página da paciente, dentro de uma
 * moldura de celular com a identidade do Console. Reaproveita os componentes de
 * render reais e respeita o registro claro/escuro `.paciente`, espelhando o tema
 * que a própria paciente escolheu (`tema`; null → claro) — igual ao app móvel,
 * independente do claro/escuro do Console.
 */
export function PreviaPaginaPaciente({
  secoes,
  dados,
  documentos = [],
  onAbrirDocumento,
  documentoAcao = null,
  pedidoExames = null,
  receitaPreparoPele = null,
  receituarioPosop = null,
  tema = null,
  className = "",
}: {
  secoes: SecaoConteudo[];
  dados: DadosPreview;
  documentos?: DocumentoPaciente[];
  onAbrirDocumento?: (doc: DocumentoPaciente, modo: "abrir" | "baixar") => void;
  documentoAcao?: string | null;
  pedidoExames?: PedidoExamesResumo | null;
  receitaPreparoPele?: ReceitaPreparoPeleResumo | null;
  receituarioPosop?: ReceituarioPosopResumo | null;
  tema?: "light" | "dark" | null;
  className?: string;
}) {
  // O território claro/escuro espelha a escolha salva da paciente (null → claro).
  const temaClasse = `paciente${tema === "dark" ? " paciente-dark" : ""}`;

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center gap-3">
        <span className="font-expanded text-[10px] tracking-widest text-muted-foreground uppercase">
          O que a paciente recebe
        </span>
        <div className="flex-1 h-px bg-card/50"></div>
      </div>

      <div className="mx-auto w-full max-w-[380px]">
        <div className="relative rounded-[2.5rem] border border-border bg-card p-2.5 shadow-2xl">
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 h-5 w-28 rounded-b-2xl bg-card z-10"></div>
          <div className={`${temaClasse} relative h-[560px] sm:h-[640px] overflow-y-auto overflow-x-hidden rounded-[1.9rem] bg-[var(--pp-bg)]`}>
            <PaginaPacienteScreen
              secoes={secoes}
              dados={dados}
              documentos={documentos}
              onAbrirDocumento={onAbrirDocumento}
              documentoAcao={documentoAcao}
              pedidoExames={pedidoExames}
              receitaPreparoPele={receitaPreparoPele}
              receituarioPosop={receituarioPosop}
            />
          </div>
        </div>
        <p className="mt-3 text-center font-mono text-[10px] text-muted-foreground/70">
          Prévia ao vivo · rola dentro da moldura
        </p>
      </div>
    </div>
  );
}
