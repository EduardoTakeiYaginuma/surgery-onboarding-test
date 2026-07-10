import { useState } from "react";
import { format, parseISO } from "date-fns";
import { CheckCircle2, Navigation } from "lucide-react";
import { type IdentidadeMedica, iniciaisMedica } from "@workspace/secoes";
import { SeloC } from "@/components/secoes-publicas";

/**
 * Seções visuais COMPARTILHADAS entre a página pública da paciente
 * (`pages/public-patient.tsx`, `/p/:token`) e a prévia ao vivo do Console
 * (`components/previa-pagina-paciente.tsx`).
 *
 * FONTE ÚNICA — leia antes de mexer. O grid de fatos ("Sua cirurgia") e a lista
 * de confirmações ("Agora") já viveram duplicados à mão nos dois lugares e
 * divergiam a cada ajuste ("o preview do link não condiz com a realidade do
 * link"). Para impedir essa deriva, a marcação destes blocos mora SÓ aqui.
 * Qualquer mudança visual deve ser feita neste arquivo — nunca recriar a
 * marcação na prévia.
 *
 * `variant` apenas ajusta a escala tipográfica: "page" (página responsiva
 * completa) vs "preview" (moldura estreita de celular dentro do Console). Os
 * dois registros de tema claro/escuro `.paciente` (`--pp-*`) já são herdados do
 * contêiner, então as cores são idênticas em ambos os usos.
 */

export type VarianteSecao = "page" | "preview";

function fmtData(iso: string): string {
  try {
    return format(parseISO(iso), "dd/MM/yyyy");
  } catch {
    return iso;
  }
}

/** Linha de confirmação (✓) no bloco "Agora". */
function LinhaConfirmada({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 font-light">
      <CheckCircle2 className="w-4 h-4 text-[var(--pp-accent)] stroke-[1.5] shrink-0" />
      <span>{children}</span>
    </li>
  );
}

/** Linha pendente (○) no bloco "Agora". */
function LinhaPendente({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 font-light">
      <span className="w-3.5 h-3.5 rounded-full border border-[var(--pp-accent)] shrink-0" />
      <span className="opacity-90">{children}</span>
    </li>
  );
}

/**
 * Considera que existe documento (contrato/termo) quando o status é um estado
 * acionável. `null`/`undefined` (sem documento) e `"ausente"` (registro do
 * Console para "ainda não enviado") não geram linha — espelha a página pública,
 * que recebe `null` nesses casos e por isso omite a linha. Nunca inventa estado.
 */
function temDocumento(status?: string | null): boolean {
  return status != null && status !== "ausente";
}

/** Há texto útil (não nulo/indefinido e não só espaços)? */
function temTexto(valor?: string | null): boolean {
  return typeof valor === "string" && valor.trim() !== "";
}

/**
 * Lista de confirmações do bloco "Agora", idêntica à da página pública. Recebe
 * os dados crus e deriva a exibição aqui (a mesma régua nos dois lugares). NENHUMA
 * linha é fixa: cada uma só aparece quando há dado real, para nunca afirmar algo
 * que o registro não confirma (hoje data/hora e local são obrigatórios, mas se um
 * dia deixarem de ser, a linha simplesmente não aparece em vez de mentir):
 * - data/hora: quando há data de cirurgia (com horário → "Data e horário
 *   confirmados"; sem horário → "Data confirmada");
 * - local: quando há local definido;
 * - contrato/termo: quando há um status acionável;
 * - honorários: quando `pagamentoQuitado` é informado (a prévia genérica, sem
 *   paciente real, omite a linha em vez de inventar um estado de pagamento).
 */
export function AgoraConfirmacoes({
  dataCirurgia,
  horario,
  local,
  contratoStatus,
  contratoPrazo,
  contratoAssinadoEm,
  termoStatus,
  termoPrazo,
  termoAssinadoEm,
  pagamentoQuitado,
  pagamentoVencimento,
}: {
  dataCirurgia?: string | null;
  horario?: string | null;
  local?: string | null;
  contratoStatus?: string | null;
  contratoPrazo?: string | null;
  contratoAssinadoEm?: string | null;
  termoStatus?: string | null;
  termoPrazo?: string | null;
  termoAssinadoEm?: string | null;
  pagamentoQuitado?: boolean;
  pagamentoVencimento?: string | null;
}) {
  const contratoAssinado = contratoStatus === "assinado";
  const termoAssinado = termoStatus === "assinado";
  const temData = temTexto(dataCirurgia);
  const temHorario = temTexto(horario);
  const temLocal = temTexto(local);

  return (
    <ul className="space-y-4">
      {temData ? (
        <LinhaConfirmada>
          {temHorario ? "Data e horário confirmados" : "Data confirmada"}
        </LinhaConfirmada>
      ) : null}
      {temLocal ? <LinhaConfirmada>Local da cirurgia definido</LinhaConfirmada> : null}

      {contratoAssinado ? (
        <LinhaConfirmada>
          Contrato assinado
          {contratoAssinadoEm ? ` em ${fmtData(contratoAssinadoEm)}` : ""}
        </LinhaConfirmada>
      ) : temDocumento(contratoStatus) ? (
        <LinhaPendente>
          Contrato ·{" "}
          {contratoPrazo ? `assinar até ${fmtData(contratoPrazo)}` : "aguardando assinatura"}
        </LinhaPendente>
      ) : null}

      {termoAssinado ? (
        <LinhaConfirmada>
          Termo de consentimento assinado
          {termoAssinadoEm ? ` em ${fmtData(termoAssinadoEm)}` : ""}
        </LinhaConfirmada>
      ) : temDocumento(termoStatus) ? (
        <LinhaPendente>
          Termo de consentimento ·{" "}
          {termoPrazo ? `assinar até ${fmtData(termoPrazo)}` : "aguardando assinatura"}
        </LinhaPendente>
      ) : null}

      {pagamentoQuitado !== undefined &&
        (pagamentoQuitado ? (
          <LinhaConfirmada>Honorários · pagamento confirmado</LinhaConfirmada>
        ) : (
          <LinhaPendente>
            Honorários ·{" "}
            {pagamentoVencimento ? `pagar até ${fmtData(pagamentoVencimento)}` : "pagamento pendente"}
          </LinhaPendente>
        ))}
    </ul>
  );
}

/**
 * Bloco "Sua cirurgia": eyebrow "Sua cirurgia" + grid de fatos, idêntico ao da
 * página pública. O(s) PROCEDIMENTO(S) entra(m) como a primeira célula do grid
 * (antes ficavam num título grande logo acima da tabela, o que confundia — dava a
 * impressão de duas informações separadas). Agora tudo vive na mesma tabela:
 * PROCEDIMENTO(S) / DATA / HORÁRIO / LOCAL / ANESTESIA. Retorna um fragmento com o
 * eyebrow e o `<dl>` como irmãos diretos, para que o `space-y` da `<section>` que
 * o envolve distribua o espaçamento igual nos dois lugares.
 *
 * `mapaHref` é opcional: quando presente, mostra o link "ver no mapa" (a página
 * pública liga o evento via `onMapa`). A célula de ANESTESIA só aparece quando há
 * equipe definida.
 */
export function SurgeryFactsGrid({
  variant,
  procedimentos,
  dataFmt,
  horario,
  localNome,
  mapaHref,
  onMapa,
  anestesia,
}: {
  variant: VarianteSecao;
  procedimentos: string[];
  dataFmt: string;
  horario: string;
  localNome: string;
  mapaHref?: string | null;
  onMapa?: () => void;
  anestesia?: string | null;
}) {
  const procedimentoClasse =
    variant === "preview"
      ? "font-serif text-lg italic leading-snug"
      : "font-serif text-xl md:text-2xl italic leading-snug";

  return (
    <>
      {/* Título no mesmo padrão das demais seções (serifado itálico + hairline),
          via SectionHeading. Escala menor na prévia para caber na moldura. */}
      <div className="flex items-center gap-4">
        <h3
          className={`font-serif italic text-[var(--pp-accent)] ${
            variant === "preview" ? "text-2xl" : "text-3xl md:text-4xl"
          }`}
        >
          Sua cirurgia
        </h3>
        <div className="flex-1 h-px bg-[var(--pp-accent)]/20" />
      </div>

      {/* Grid de fatos em 2 colunas — o gap de 1px sobre o fundo accent vira a linha do grid.
          O(s) procedimento(s) abrem o grid ocupando a linha inteira. */}
      <dl
        className="grid grid-cols-2 max-[560px]:grid-cols-1 border border-[var(--pp-accent)]/15"
        style={{ gap: "1px", background: "var(--pp-accent)", opacity: 1 }}
      >
        <div className="bg-[var(--pp-surface)] px-4 py-4 col-span-2 max-[560px]:col-span-1">
          <dt className="font-expanded text-[9px] tracking-[.18em] uppercase text-[var(--pp-text)] opacity-50">
            {procedimentos.length > 1 ? "Procedimentos" : "Procedimento"}
          </dt>
          <dd className={`mt-1.5 ${procedimentoClasse}`}>{procedimentos.join(" · ")}</dd>
        </div>
        <div className="bg-[var(--pp-surface)] px-4 py-4">
          <dt className="font-expanded text-[9px] tracking-[.18em] uppercase text-[var(--pp-text)] opacity-50">
            Data
          </dt>
          <dd className="mt-1.5 font-mono text-[15px]">{dataFmt}</dd>
        </div>
        <div className="bg-[var(--pp-surface)] px-4 py-4">
          <dt className="font-expanded text-[9px] tracking-[.18em] uppercase text-[var(--pp-text)] opacity-50">
            Horário
          </dt>
          <dd className="mt-1.5 font-mono text-[15px]">{horario}</dd>
        </div>
        <div className="bg-[var(--pp-surface)] px-4 py-4">
          <dt className="font-expanded text-[9px] tracking-[.18em] uppercase text-[var(--pp-text)] opacity-50">
            Local
          </dt>
          <dd className="mt-1.5 text-[15px]">
            <span className="block">{localNome}</span>
            {mapaHref ? (
              <a
                href={mapaHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onMapa}
                className="inline-flex items-center gap-1 mt-1 font-mono text-[11px] text-[var(--pp-accent)] border-b border-[var(--pp-accent)]/40 hover:border-[var(--pp-accent)] pb-0.5 transition-colors"
              >
                <Navigation className="w-3 h-3 stroke-[1.5]" />
                ver no mapa
              </a>
            ) : null}
          </dd>
        </div>
        {anestesia ? (
          <div className="bg-[var(--pp-surface)] px-4 py-4">
            <dt className="font-expanded text-[9px] tracking-[.18em] uppercase text-[var(--pp-text)] opacity-50">
              Anestesia
            </dt>
            <dd className="mt-1.5 text-[15px]">{anestesia}</dd>
          </div>
        ) : null}
      </dl>
    </>
  );
}

/**
 * Cabeçalho de identidade da médica — logo + nome da clínica + subtítulo. FONTE
 * ÚNICA do bloco, usado pela capa da página pública (`public-patient.tsx`) e pela
 * prévia do Console (`previa-pagina-paciente.tsx`). Renderiza só o conteúdo do
 * lockup (`<div class="flex ...">`); cada chamador mantém o seu invólucro (a flex
 * externa com o `Tracado`). Mostra a imagem do logo quando houver; senão, cai no
 * emblema "K". O nome da clínica aparece quando informado.
 *
 * `variant` só ajusta a escala: "page" (página responsiva) vs "preview" (moldura
 * estreita de celular). Tipado por `Pick<IdentidadeMedica>` para que acrescentar
 * um campo de cabeçalho ao catálogo force ambos os chamadores a fornecê-lo.
 */
export function LogoClinicaLockup({
  variant,
  clinica,
  medicoLogoUrl,
}: { variant: VarianteSecao } & Pick<
  IdentidadeMedica,
  "clinica" | "medicoLogoUrl"
>) {
  const ehPagina = variant === "page";
  const [falhou, setFalhou] = useState(false);
  const mostrarLogo = Boolean(medicoLogoUrl) && !falhou;
  return (
    <div className="flex items-center gap-3">
      {mostrarLogo ? (
        <img
          src={medicoLogoUrl ?? undefined}
          alt={clinica}
          className={`${ehPagina ? "h-11" : "h-9"} w-auto object-contain shrink-0`}
          onError={() => setFalhou(true)}
        />
      ) : (
        <div
          className={`${ehPagina ? "w-11 h-11 text-base" : "w-9 h-9 text-sm"} border border-[var(--pp-accent)] flex items-center justify-center font-serif shrink-0`}
        >
          K
        </div>
      )}
      <div className="leading-tight">
        {clinica ? (
          <div className={`font-serif ${ehPagina ? "text-xl" : "text-base"}`}>
            {clinica}
          </div>
        ) : null}
        <div className="font-mono text-[10px] tracking-wide opacity-60 mt-0.5">
          Acompanhamento pré-operatório
        </div>
      </div>
    </div>
  );
}

/**
 * Bloco "Sua médica" — foto + nome + CRM/RQE + selo Camada. FONTE ÚNICA, usado
 * pela seção médica da página pública e pela prévia do Console. Retorna um
 * fragmento (foto + bloco de texto como irmãos diretos) para que a `<section>`
 * flex de cada chamador alinhe igual; o chamador também adiciona a `SectionHairline`
 * quando quiser. Mostra a foto quando houver; senão, cai nas iniciais. A linha
 * CRM/RQE aparece quando ambos estão presentes.
 *
 * `variant` só ajusta a escala. Tipado por `Pick<IdentidadeMedica>` para que
 * acrescentar um campo de cabeçalho force ambos os chamadores a fornecê-lo.
 */
export function MedicaIdentidade({
  variant,
  medica,
  crm,
  rqe,
  medicoFotoUrl,
}: { variant: VarianteSecao } & Pick<
  IdentidadeMedica,
  "medica" | "crm" | "rqe" | "medicoFotoUrl"
>) {
  const ehPagina = variant === "page";
  const [falhou, setFalhou] = useState(false);
  const mostrarFoto = Boolean(medicoFotoUrl) && !falhou;
  return (
    <>
      <div
        className={`${ehPagina ? "w-[104px] h-[132px]" : "w-[68px] h-[88px]"} border border-[var(--pp-accent)]/40 flex items-center justify-center shrink-0 overflow-hidden bg-[var(--pp-surface)]`}
        aria-hidden="true"
      >
        {mostrarFoto ? (
          <img
            src={medicoFotoUrl ?? undefined}
            alt=""
            className="w-full h-full object-cover"
            style={{ objectPosition: "50% 24%" }}
            onError={() => setFalhou(true)}
          />
        ) : (
          <span
            className={`font-serif ${ehPagina ? "text-3xl" : "text-2xl"} tracking-wide text-[var(--pp-accent)]`}
          >
            {iniciaisMedica(medica)}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="font-expanded text-[9px] tracking-widest uppercase text-[var(--pp-accent)] mb-1">
          Sua médica
        </p>
        <h2 className={`font-serif ${ehPagina ? "text-2xl" : "text-xl"} leading-tight`}>
          {medica}
        </h2>
        {crm && rqe ? (
          <p className={`font-mono ${ehPagina ? "text-xs" : "text-[10px]"} opacity-60 mt-1.5`}>
            CRM {crm} · RQE {rqe}
          </p>
        ) : null}
        <div className={`flex items-center ${ehPagina ? "gap-3 mt-4" : "gap-2 mt-3"}`}>
          <SeloC />
          <span
            className={`font-mono ${ehPagina ? "text-[10px]" : "text-[9px]"} tracking-wider uppercase text-[var(--pp-accent)]`}
          >
            Médica-parceira · Camada
          </span>
        </div>
      </div>
    </>
  );
}
