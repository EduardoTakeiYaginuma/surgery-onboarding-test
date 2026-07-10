import { useRef, useState } from "react";
import {
  useListarCheckinsPublico,
  getListarCheckinsPublicoQueryKey,
  type CheckinPublico,
  type CheckinTipo,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { secaoMotion } from "@/components/secoes-publicas";
import { Camera, CheckCircle2, Clock, Stethoscope, Star } from "lucide-react";

const ICONE_TIPO: Record<CheckinTipo, typeof Camera> = {
  foto: Camera,
  retorno: Stethoscope,
  nps: Star,
};

const TITULO_TIPO: Record<CheckinTipo, string> = {
  foto: "Foto da evolução",
  retorno: "Retorno presencial",
  nps: "Como você avalia",
};

const LEGENDA_TIPO: Record<CheckinTipo, string> = {
  foto: "Envie uma foto para acompanharmos sua recuperação.",
  retorno: "Consulta de acompanhamento com a equipe.",
  nps: "Em breve pediremos sua avaliação por aqui.",
};

/** Sobe a foto da paciente via multipart — fora do contrato OpenAPI (binário). */
async function enviarFoto(
  token: string,
  checkinId: number,
  arquivo: File,
): Promise<void> {
  const form = new FormData();
  form.append("foto", arquivo);
  const url = `${import.meta.env.BASE_URL}api/publico/${encodeURIComponent(
    token,
  )}/checkins/${checkinId}/foto`;
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    let mensagem = "Não foi possível enviar a foto. Tente novamente.";
    try {
      const corpo = (await res.json()) as { message?: string };
      if (corpo?.message) mensagem = corpo.message;
    } catch {
      // resposta sem corpo JSON — mantém a mensagem padrão
    }
    throw new Error(mensagem);
  }
}

function UploaderFoto({
  token,
  checkin,
  onEnviado,
}: {
  token: string;
  checkin: CheckinPublico;
  onEnviado: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const handleArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setErro(null);
    setEnviando(true);
    try {
      await enviarFoto(token, checkin.id, arquivo);
      onEnviado();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível enviar.");
    } finally {
      setEnviando(false);
    }
  };

  if (checkin.fotoUrl) {
    return (
      <div className="space-y-3">
        <a
          href={checkin.fotoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-fit"
        >
          <img
            src={checkin.fotoUrl}
            alt="Foto enviada"
            className="max-h-56 border border-[var(--pp-accent)]/30 object-cover"
          />
        </a>
        <div className="flex items-center gap-2 text-[var(--pp-accent)] text-sm font-light">
          <CheckCircle2 className="w-4 h-4" strokeWidth={1.5} />
          Foto enviada. Obrigada!
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        onChange={handleArquivo}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={enviando}
        className="group inline-flex items-center gap-3 bg-[var(--pp-surface)] border border-[var(--pp-accent)]/30 hover:border-[var(--pp-accent)]/70 transition-colors px-6 py-4 disabled:opacity-60"
      >
        <Camera className="w-4 h-4 text-[var(--pp-accent)] stroke-[1.5]" />
        <span className="font-expanded text-[10px] tracking-widest uppercase text-[var(--pp-text)]">
          {enviando ? "Enviando…" : "Enviar foto"}
        </span>
      </button>
      {erro && (
        <p className="font-light text-sm text-[var(--pp-accent)]">{erro}</p>
      )}
    </div>
  );
}

function CheckinPublicoItem({
  token,
  checkin,
  onEnviado,
}: {
  token: string;
  checkin: CheckinPublico;
  onEnviado: () => void;
}) {
  const Icone = ICONE_TIPO[checkin.tipo];
  const concluido = checkin.status === "concluido";
  return (
    <div className="relative pl-8">
      <span
        className={`absolute left-0 top-1.5 w-2 h-2 rotate-45 ${
          concluido ? "bg-[var(--pp-accent)]" : "bg-[var(--pp-text)]/30"
        }`}
      />
      <div className="space-y-3">
        <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1">
          <span className="font-mono text-xs text-[var(--pp-accent)]">
            Dia {checkin.dia}
          </span>
          {concluido && (
            <span className="inline-flex items-center gap-1 font-expanded text-[9px] tracking-widest uppercase text-[var(--pp-accent)]">
              <CheckCircle2 className="w-3 h-3" strokeWidth={2} /> Concluído
            </span>
          )}
        </div>
        <h3 className="font-serif text-2xl text-[var(--pp-text)] flex items-center gap-3">
          <Icone className="w-5 h-5 text-[var(--pp-accent)] stroke-[1.5]" />
          {TITULO_TIPO[checkin.tipo]}
        </h3>
        <p className="font-light text-[var(--pp-text)]/70 leading-relaxed">
          {LEGENDA_TIPO[checkin.tipo]}
        </p>
        {checkin.tipo === "foto" && (
          <UploaderFoto token={token} checkin={checkin} onEnviado={onEnviado} />
        )}
      </div>
    </div>
  );
}

/**
 * Bloco "Meu acompanhamento" da página pública da paciente (tema claro / Dra.
 * Karla). Lista os check-ins pós-op e permite o envio de fotos da evolução.
 * Some silenciosamente quando ainda não há check-ins definidos.
 */
export function PosOpPublico({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const { data: checkins } = useListarCheckinsPublico(token, {
    query: {
      enabled: !!token,
      queryKey: getListarCheckinsPublicoQueryKey(token),
    },
  });

  if (!checkins || checkins.length === 0) return null;

  const recarregar = () =>
    queryClient.invalidateQueries({
      queryKey: getListarCheckinsPublicoQueryKey(token),
    });

  return (
    <motion.section
      {...secaoMotion}
      className="relative py-12 space-y-8 border-t border-[var(--pp-accent)]/20"
    >
      {/* Hairline champanhe alinhado ao topo, sobre o border-t (igual às demais
          seções da página). Fica aqui — e não no pai — para que a moldura só
          apareça quando há check-ins (o componente retorna null quando vazio). */}
      <div className="absolute top-0 left-0 w-10 h-px bg-[var(--pp-accent)]" aria-hidden="true" />
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Clock className="w-4 h-4 text-[var(--pp-accent)] stroke-[1.5]" />
          <span className="font-expanded text-[10px] tracking-widest uppercase text-[var(--pp-text)]/60">
            Meu acompanhamento
          </span>
        </div>
        <h2 className="font-serif text-3xl text-[var(--pp-text)]">
          Sua recuperação, passo a passo
        </h2>
      </div>

      <div className="relative space-y-10">
        <div className="absolute left-[3px] top-2 bottom-2 w-px bg-[var(--pp-accent)]/20" />
        {checkins.map((c) => (
          <CheckinPublicoItem
            key={c.id}
            token={token}
            checkin={c}
            onEnviado={recarregar}
          />
        ))}
      </div>
    </motion.section>
  );
}
