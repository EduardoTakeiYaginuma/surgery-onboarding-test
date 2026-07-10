/**
 * Identidade leve do operador no app móvel — espelha
 * `artifacts/console-kcl/src/lib/operador.ts` do Console web.
 *
 * O Console é compartilhado pela equipe (sem usuários autenticados), mas
 * precisamos creditar quem disparou cada follow-up (ex.: lembrete por WhatsApp)
 * para não duplicar o contato. Guardamos o nome de quem está usando o app neste
 * aparelho no AsyncStorage e enviamos junto com a ação. Aqui o armazenamento é
 * assíncrono (AsyncStorage), então o get/set retornam Promises.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "kcl-console-operador";

/** Nome do operador salvo neste aparelho, ou null se ainda não informado. */
export async function getOperador(): Promise<string | null> {
  try {
    const v = (await AsyncStorage.getItem(STORAGE_KEY))?.trim();
    return v ? v : null;
  } catch {
    return null;
  }
}

/** Salva (ou limpa) o nome do operador deste aparelho. */
export async function setOperador(nome: string | null): Promise<void> {
  try {
    const limpo = nome?.trim();
    if (limpo) {
      await AsyncStorage.setItem(STORAGE_KEY, limpo);
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // AsyncStorage indisponível: seguimos sem identidade.
  }
}
