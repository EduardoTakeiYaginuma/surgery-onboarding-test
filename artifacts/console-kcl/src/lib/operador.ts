/**
 * Identidade leve do operador do Console — sem login/servidor.
 *
 * O Console é compartilhado pela equipe (sem usuários autenticados), mas
 * precisamos creditar quem disparou cada follow-up (ex.: lembrete por WhatsApp)
 * para não duplicar o contato. Guardamos o nome de quem está usando o Console
 * neste navegador no localStorage e enviamos junto com a ação.
 */
import { useCallback, useState } from "react";

const STORAGE_KEY = "kcl-console-operador";

/** Nome do operador salvo neste navegador, ou null se ainda não informado. */
export function getOperador(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)?.trim();
    return v ? v : null;
  } catch {
    return null;
  }
}

/** Salva (ou limpa) o nome do operador deste navegador. */
export function setOperador(nome: string | null): void {
  try {
    const limpo = nome?.trim();
    if (limpo) {
      localStorage.setItem(STORAGE_KEY, limpo);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage indisponível (modo privado): seguimos sem identidade.
  }
}

/**
 * Hook de identidade do operador para componentes. Mantém o nome em estado e o
 * persiste no localStorage, para que a UI reaja a mudanças sem recarregar.
 */
export function useOperador(): {
  operador: string | null;
  salvar: (nome: string | null) => void;
} {
  const [operador, setOperadorState] = useState<string | null>(() =>
    getOperador(),
  );
  const salvar = useCallback((nome: string | null) => {
    setOperador(nome);
    setOperadorState(getOperador());
  }, []);
  return { operador, salvar };
}
