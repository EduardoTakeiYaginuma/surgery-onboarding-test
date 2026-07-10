import { PHONE } from "./_data";

/*
 * "O que a paciente vê" — a faithful, self-contained preview of the patient's
 * public page, rendered in the editorial LIGHT theme (Dra. Karla, Linho/Marfim,
 * champagne só em fio). This is fixed content shared by every layout variant;
 * variants decide WHERE to dock this phone, never how it looks inside.
 *
 * Colors are hardcoded to the patient editorial palette (independent of the
 * Console tokens) so the phone reads correctly whether the Console around it is
 * light or dark.
 */

const EDITORIAL = {
  bg: "#EDE5D3",
  surface: "#F4F1E8",
  text: "#0A1729",
  muted: "#5B6472",
  accent: "#8A6B33",
  line: "rgba(138,107,51,0.35)",
};

export function PhonePreview({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <div
        className="mx-auto w-full max-w-[340px] rounded-[2.25rem] p-2 shadow-2xl"
        style={{ background: EDITORIAL.text }}
      >
        <div
          className="relative overflow-hidden rounded-[1.75rem]"
          style={{ background: EDITORIAL.bg, color: EDITORIAL.text }}
        >
          {/* notch */}
          <div className="flex justify-center pt-3">
            <div className="h-1.5 w-20 rounded-full" style={{ background: "rgba(10,23,41,0.18)" }} />
          </div>

          <div className="max-h-[640px] overflow-y-auto px-6 pb-10 pt-6">
            {/* header / clínica */}
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 items-center justify-center font-['Spectral'] text-lg"
                style={{ border: `1px solid ${EDITORIAL.line}`, color: EDITORIAL.accent }}
              >
                K
              </div>
              <div className="leading-tight">
                <div className="font-['Archivo_Expanded'] text-[8px] uppercase tracking-[0.22em]" style={{ color: EDITORIAL.muted }}>
                  {PHONE.clinica}
                </div>
                <div className="font-['Archivo'] text-[11px]" style={{ color: EDITORIAL.text }}>
                  {PHONE.medica}
                </div>
              </div>
            </div>

            {/* editorial greeting */}
            <div className="mt-9">
              <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-[0.22em]" style={{ color: EDITORIAL.muted }}>
                Para
              </div>
              <h1 className="mt-2 font-['Spectral'] text-4xl font-light leading-[1.05]" style={{ color: EDITORIAL.text }}>
                {PHONE.saudacao}
              </h1>
              <div className="mt-4 flex items-center gap-2 font-['Archivo'] text-[13px]" style={{ color: EDITORIAL.muted }}>
                <span className="inline-block h-1.5 w-1.5 rotate-45" style={{ background: EDITORIAL.accent }} />
                {PHONE.procedimentos.join(" · ")}
              </div>
            </div>

            {/* countdown */}
            <div className="mt-8 p-5" style={{ background: EDITORIAL.surface, borderTop: `1px solid ${EDITORIAL.line}` }}>
              <div className="font-['Archivo_Expanded'] text-[8px] uppercase tracking-[0.22em]" style={{ color: EDITORIAL.muted }}>
                Faltam
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-['Spectral'] text-5xl font-light" style={{ color: EDITORIAL.accent }}>
                  {PHONE.diasRestantes}
                </span>
                <span className="font-['Archivo'] text-sm" style={{ color: EDITORIAL.text }}>dias</span>
              </div>
              <div className="mt-2 font-['IBM_Plex_Mono'] text-[12px]" style={{ color: EDITORIAL.muted }}>
                {PHONE.dataCirurgia} · {PHONE.horario}
              </div>
            </div>

            {/* agora — confirmações */}
            <div className="mt-8">
              <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-[0.22em]" style={{ color: EDITORIAL.accent }}>
                Agora
              </div>
              <div className="mt-4 space-y-3">
                {PHONE.confirmacoes.map((c) => (
                  <div key={c.rotulo} className="flex items-start gap-3">
                    <span
                      className="mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center text-[10px]"
                      style={{
                        border: `1px solid ${c.ok ? EDITORIAL.accent : EDITORIAL.line}`,
                        color: EDITORIAL.accent,
                      }}
                    >
                      {c.ok ? "✓" : ""}
                    </span>
                    <div className="leading-tight">
                      <div className="font-['Archivo'] text-[13px]" style={{ color: EDITORIAL.text }}>{c.rotulo}</div>
                      <div className="font-['IBM_Plex_Mono'] text-[11px]" style={{ color: EDITORIAL.muted }}>{c.valor}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* sua médica */}
            <div className="mt-8 p-5" style={{ background: EDITORIAL.surface }}>
              <div className="font-['Archivo_Expanded'] text-[8px] uppercase tracking-[0.22em]" style={{ color: EDITORIAL.muted }}>
                Sua médica
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div
                  className="flex h-12 w-12 items-center justify-center font-['Spectral'] text-xl"
                  style={{ border: `1px solid ${EDITORIAL.line}`, color: EDITORIAL.accent }}
                >
                  KC
                </div>
                <div className="leading-tight">
                  <div className="font-['Spectral'] text-[15px]" style={{ color: EDITORIAL.text }}>{PHONE.medica}</div>
                  <div className="font-['IBM_Plex_Mono'] text-[10px]" style={{ color: EDITORIAL.muted }}>
                    {PHONE.crm} · {PHONE.rqe}
                  </div>
                </div>
              </div>
            </div>

            {/* no dia */}
            <div className="mt-8">
              <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-[0.22em]" style={{ color: EDITORIAL.muted }}>
                No dia
              </div>
              <div className="mt-3 space-y-1">
                <div className="font-['Spectral'] text-[15px]" style={{ color: EDITORIAL.text }}>{PHONE.hospital}</div>
                <div className="font-['Archivo'] text-[12px] leading-relaxed" style={{ color: EDITORIAL.muted }}>{PHONE.local}</div>
                <div className="pt-2 font-['Archivo'] text-[12px] leading-relaxed" style={{ color: EDITORIAL.muted }}>
                  {PHONE.instrucoesChegada}
                </div>
              </div>
            </div>

            <div className="mt-8 pt-5 text-center font-['IBM_Plex_Mono'] text-[10px]" style={{ borderTop: `1px solid ${EDITORIAL.line}`, color: EDITORIAL.muted }}>
              {PHONE.equipe} · {PHONE.equipeTelefone}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PhonePreview;
