/**
 * Hook de identidade do operador para o app móvel. Carrega o nome salvo no
 * AsyncStorage no mount e o mantém em estado, persistindo as alterações — para
 * que a UI reaja sem recarregar. Espelha o `useOperador` do Console web, mas com
 * carregamento assíncrono (AsyncStorage).
 */
import { useCallback, useEffect, useState } from "react";

import { getOperador, setOperador } from "@/lib/operador";

export function useOperador(): {
  operador: string | null;
  carregado: boolean;
  salvar: (nome: string | null) => void;
} {
  const [operador, setOperadorState] = useState<string | null>(null);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    let ativo = true;
    getOperador().then((nome) => {
      if (!ativo) return;
      setOperadorState(nome);
      setCarregado(true);
    });
    return () => {
      ativo = false;
    };
  }, []);

  const salvar = useCallback((nome: string | null) => {
    const limpo = nome?.trim() || null;
    setOperadorState(limpo);
    void setOperador(limpo);
  }, []);

  return { operador, carregado, salvar };
}
