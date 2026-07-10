import { isConnectivityError, ApiError } from "@workspace/api-client-react";

type Notice = { title: string; message?: string };

/**
 * Extrai a mensagem de erro do servidor quando disponível (ex.: 409 CPF
 * duplicado). Retorna undefined para erros sem corpo legível.
 */
export function mensagemServidor(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  const data = error.data;
  if (data && typeof data === "object" && "message" in data) {
    const msg = (data as Record<string, unknown>).message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return undefined;
}

/**
 * Picks the right branded `notify` copy for a failed mutation. Connectivity
 * failures (network down / server restarting / gateway 5xx) get the friendly
 * "Sem conexão com o servidor" wording — mirroring the load-time
 * <ConnectionError> and the novo.tsx submit banner — so a secretary is never
 * misled into thinking their data was rejected. For other API errors, uses the
 * server message when available (ex.: CPF duplicado).
 */
export function noticeErroEnvio(error: unknown, fallback: Notice): Notice {
  if (isConnectivityError(error)) {
    return {
      title: "Sem conexão com o servidor",
      message: "Nada foi perdido. Tente novamente em instantes.",
    };
  }
  const serverMsg = mensagemServidor(error);
  return { title: fallback.title, message: serverMsg ?? fallback.message };
}
