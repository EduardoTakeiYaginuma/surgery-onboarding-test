import { eq } from "drizzle-orm";
import { db, configNotificacaoTable } from "@workspace/db";

const SINGLETON_ID = 1;

/**
 * Configuração dos avisos de contrato à equipe — destino do webhook e o
 * liga/desliga (silenciada). Singleton (id = 1).
 *
 * Quando nada foi salvo ainda, devolve os padrões neutros (sem destino, não
 * silenciada). O fallback para variáveis de ambiente é resolvido por quem
 * consome (ver `notificacoes.ts`), não aqui.
 */
export interface ConfigNotificacao {
  /** Destino do aviso (Slack/Discord/ponte WhatsApp). null = sem destino salvo. */
  webhookUrl: string | null;
  /** true → avisos pausados sem perder o destino salvo. */
  silenciada: boolean;
}

export interface NotificacaoConfigRepository {
  obter(): Promise<ConfigNotificacao>;
  salvar(config: ConfigNotificacao): Promise<ConfigNotificacao>;
}

class DrizzleNotificacaoConfigRepository
  implements NotificacaoConfigRepository
{
  async obter(): Promise<ConfigNotificacao> {
    const [row] = await db
      .select()
      .from(configNotificacaoTable)
      .where(eq(configNotificacaoTable.id, SINGLETON_ID));
    return {
      webhookUrl: row?.webhookUrl ?? null,
      silenciada: row?.silenciada ?? false,
    };
  }

  async salvar(config: ConfigNotificacao): Promise<ConfigNotificacao> {
    const webhookUrl = config.webhookUrl?.trim() || null;
    const [row] = await db
      .insert(configNotificacaoTable)
      .values({
        id: SINGLETON_ID,
        webhookUrl,
        silenciada: config.silenciada,
      })
      .onConflictDoUpdate({
        target: configNotificacaoTable.id,
        set: { webhookUrl, silenciada: config.silenciada, updatedAt: new Date() },
      })
      .returning();
    return { webhookUrl: row.webhookUrl ?? null, silenciada: row.silenciada };
  }
}

export const notificacaoConfigRepo: NotificacaoConfigRepository =
  new DrizzleNotificacaoConfigRepository();
