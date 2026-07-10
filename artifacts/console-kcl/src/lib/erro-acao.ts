import { isConnectivityError, ApiError } from "@workspace/api-client-react";

export type ToastErroAcao = {
  variant: "destructive";
  title: string;
  description?: string;
};

const CONEXAO_TITULO = "Sem conexão com o servidor";
const CONEXAO_DESCRICAO =
  "Não conseguimos falar com o servidor. Verifique a internet e tente novamente — sua alteração não foi salva.";

function mensagemServidor(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  const data = error.data;
  if (data && typeof data === "object" && "message" in data) {
    const msg = (data as Record<string, unknown>).message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return undefined;
}

/**
 * Monta o toast de erro de uma ação (mutação) do Console.
 *
 * Quando a falha for de conectividade (servidor inacessível, gateway fora),
 * mostra uma mensagem clara de "sem conexão" para que a secretária saiba que a
 * alteração não chegou ao servidor — distinta de um erro real de validação ou
 * de negócio, que mantém o texto específico do `fallback`.
 *
 * Para outros erros de API (ex.: 409 CPF duplicado), usa a mensagem do servidor
 * quando disponível, em vez do texto genérico do fallback.
 */
export function toastErroAcao(
  error: unknown,
  fallback: { title: string; description?: string },
): ToastErroAcao {
  if (isConnectivityError(error)) {
    return {
      variant: "destructive",
      title: CONEXAO_TITULO,
      description: CONEXAO_DESCRICAO,
    };
  }
  const serverMsg = mensagemServidor(error);
  return {
    variant: "destructive",
    title: fallback.title,
    description: serverMsg ?? fallback.description,
  };
}
