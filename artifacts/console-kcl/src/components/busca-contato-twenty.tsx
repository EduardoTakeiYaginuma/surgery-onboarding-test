import { useState } from "react";
import {
  type UseFormReturn,
  type FieldValues,
  type Path,
} from "react-hook-form";
import { Search, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatarCpf, formatarTelefone } from "@/lib/br-validacao";

const LABEL_CLS =
  "text-muted-foreground font-expanded text-[10px] tracking-widest uppercase";
const INPUT_CLS =
  "bg-card border-transparent focus-visible:ring-1 focus-visible:ring-ring rounded-none h-12 text-foreground placeholder:text-muted-foreground/50";
const MSG_CLS = "font-mono text-xs text-red-400";

/** Contato (paciente) do Twenty como o endpoint /pacientes/contatos-twenty devolve. */
export interface ContatoTwenty {
  twentyContactId: string;
  nome: string;
  telefone: string;
  email: string;
  cpf: string;
  cidade: string;
}

/** Campos do formulário que a busca preenche a partir do contato escolhido. */
export interface CamposContatoTwenty {
  nome: string;
  cpf: string;
  telefone: string;
  email: string;
  twentyContactId: string;
}

/**
 * Busca a paciente no Twenty (por nome ou telefone) e preenche
 * nome/telefone/CPF/e-mail, além de vincular a ficha à pessoa REAL do CRM
 * (twentyContactId).
 *
 * - `modo="cadastro"`: vínculo é opcional (quem quer, cadastra à mão) e é
 *   possível desvincular.
 * - `modo="edicao"`: o nome vem SEMPRE do contato do Twenty — a única forma de
 *   trocar o paciente é escolhendo outro contato aqui (não há desvincular).
 */
export function BuscaContatoTwenty<T extends CamposContatoTwenty & FieldValues>({
  form,
  modo = "cadastro",
}: {
  form: UseFormReturn<T>;
  modo?: "cadastro" | "edicao";
}) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ContatoTwenty[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Em edição, "Trocar contato" reabre a busca sem perder o vínculo atual até
  // que um novo contato seja escolhido.
  const [trocando, setTrocando] = useState(false);
  const vinculado = form.watch("twentyContactId" as Path<T>) as string;

  // O `setValue` genérico exige caminhos tipados; os nomes dos campos são fixos
  // (garantidos por `CamposContatoTwenty`), então estreitamos aqui.
  const set = (
    name: keyof CamposContatoTwenty,
    value: string,
    opts?: { shouldValidate?: boolean; shouldDirty?: boolean },
  ) =>
    form.setValue(
      name as Path<T>,
      value as T[Path<T>],
      opts,
    );

  async function buscar() {
    const q = termo.trim();
    if (!q) return;
    setBuscando(true);
    setErro(null);
    try {
      const digitos = q.replace(/\D/g, "");
      // 8+ dígitos → parece telefone; senão busca por nome.
      const param =
        digitos.length >= 8
          ? `telefone=${encodeURIComponent(digitos)}`
          : `nome=${encodeURIComponent(q)}`;
      const resp = await fetch(
        `${import.meta.env.BASE_URL}api/pacientes/contatos-twenty?${param}`,
      );
      if (!resp.ok) throw new Error("falha");
      const j = (await resp.json()) as { contatos?: ContatoTwenty[] };
      setResultados(j.contatos ?? []);
    } catch {
      setErro(
        "Não foi possível buscar no Twenty agora. Tente novamente em instantes.",
      );
      setResultados(null);
    } finally {
      setBuscando(false);
    }
  }

  function selecionar(c: ContatoTwenty) {
    // O nome é a identidade da ficha: sempre vem do contato (mesmo "(sem nome)"
    // não deve sobrescrever com vazio — mas o Twenty sempre traz nome).
    if (c.nome) set("nome", c.nome, { shouldValidate: true, shouldDirty: true });
    if (c.telefone)
      set("telefone", c.telefone, { shouldValidate: true, shouldDirty: true });
    if (c.cpf) set("cpf", c.cpf, { shouldValidate: true, shouldDirty: true });
    set("email", c.email ?? "", { shouldDirty: true });
    set("twentyContactId", c.twentyContactId, { shouldDirty: true });
    setResultados(null);
    setTermo("");
    setTrocando(false);
  }

  function desvincular() {
    set("twentyContactId", "", { shouldDirty: true });
    set("email", "", { shouldDirty: true });
  }

  // Em edição, mostrar o resumo do vínculo enquanto não estiver trocando.
  const mostrarVinculo = !!vinculado && !trocando;

  return (
    <div className="border border-border bg-card/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Search className="w-3.5 h-3.5 text-accent" strokeWidth={1.5} />
        <span className={LABEL_CLS}>
          {modo === "edicao"
            ? "Paciente vinculada ao Twenty"
            : "Buscar paciente no Twenty (opcional)"}
        </span>
      </div>
      {mostrarVinculo ? (
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-xs font-light text-foreground">
            <Check className="w-3.5 h-3.5 text-accent" strokeWidth={2} />
            Vinculada a um paciente do Twenty — dados puxados abaixo.
          </span>
          {modo === "edicao" ? (
            <button
              type="button"
              onClick={() => {
                setTrocando(true);
                setResultados(null);
                setTermo("");
              }}
              className="text-muted-foreground hover:text-accent text-[10px] font-expanded tracking-widest uppercase"
            >
              Trocar contato
            </button>
          ) : (
            <button
              type="button"
              onClick={desvincular}
              className="text-muted-foreground hover:text-accent text-[10px] font-expanded tracking-widest uppercase"
            >
              Desvincular
            </button>
          )}
        </div>
      ) : (
        <>
          {modo === "edicao" && (
            <p className="text-muted-foreground text-xs font-light">
              O nome do paciente vem do contato do Twenty. Para trocar o paciente
              desta ficha, escolha outro contato abaixo.
            </p>
          )}
          <div className="flex items-center gap-2">
            <Input
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void buscar();
                }
              }}
              placeholder="Nome ou telefone da paciente"
              className={INPUT_CLS}
            />
            <Button
              type="button"
              onClick={() => void buscar()}
              disabled={buscando || !termo.trim()}
              className="rounded-none h-12 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {buscando ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </Button>
            {modo === "edicao" && trocando && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setTrocando(false);
                  setResultados(null);
                  setTermo("");
                }}
                className="rounded-none h-12 shrink-0 text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </Button>
            )}
          </div>
          {erro && <p className={MSG_CLS}>{erro}</p>}
          {resultados && resultados.length === 0 && (
            <p className="text-muted-foreground text-xs font-light">
              {modo === "edicao"
                ? "Nenhum paciente encontrado. Refine a busca."
                : "Nenhum paciente encontrado. Refine a busca ou cadastre à mão."}
            </p>
          )}
          {resultados && resultados.length > 0 && (
            <ul className="max-h-52 overflow-y-auto divide-y divide-border border border-border">
              {resultados.map((c) => (
                <li key={c.twentyContactId}>
                  <button
                    type="button"
                    onClick={() => selecionar(c)}
                    className="w-full text-left px-3 py-2 hover:bg-card transition-colors"
                  >
                    <div className="text-sm font-light text-foreground truncate">
                      {c.nome || "(sem nome)"}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground/80 truncate">
                      {[
                        c.telefone ? formatarTelefone(c.telefone) : null,
                        c.cpf ? `CPF ${formatarCpf(c.cpf)}` : null,
                        c.email || null,
                      ]
                        .filter(Boolean)
                        .join("  ·  ") || "sem contato cadastrado"}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
