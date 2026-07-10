/**
 * Lembretes locais de cirurgia.
 *
 * Agenda uma notificação na véspera de cada cirurgia (09:00 do dia anterior),
 * de modo que a secretária seja avisada mesmo sem abrir o app. Ao tocar na
 * notificação, o app abre a tela da paciente correspondente.
 *
 * Tudo aqui é local (expo-notifications), sem servidor de push: as datas vêm do
 * campo Paciente.dataCirurgia já existente.
 */
import type { Paciente } from "@workspace/api-client-react";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Notificações locais só funcionam de forma confiável em iOS/Android.
export const isNotificationsSupported = Platform.OS !== "web";

const ANDROID_CHANNEL_ID = "lembretes-cirurgia";
// Horário (local) do lembrete no dia anterior à cirurgia.
const REMINDER_HOUR = 9;

// Como a notificação se apresenta com o app em primeiro plano.
if (isNotificationsSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Garante o canal Android (obrigatório para notificações agendadas). */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "Lembretes de cirurgia",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/**
 * Pede permissão de notificação de forma graciosa: só dispara o prompt do
 * sistema quando ainda não foi decidido. Retorna se está concedida.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isNotificationsSupported) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/** Data/hora do lembrete (véspera às 09:00) ou null se a data for inválida. */
function reminderDateFor(paciente: Paciente): Date | null {
  // dataCirurgia chega como YYYY-MM-DD.
  const [y, m, d] = paciente.dataCirurgia.split("T")[0].split("-").map(Number);
  if (!y || !m || !d) return null;
  const reminder = new Date(y, m - 1, d, REMINDER_HOUR, 0, 0, 0);
  reminder.setDate(reminder.getDate() - 1);
  if (Number.isNaN(reminder.getTime())) return null;
  return reminder;
}

/**
 * Recria os lembretes a partir da lista de pacientes ativas. Cancela tudo o que
 * estava agendado e reagenda apenas cirurgias futuras (véspera ainda no futuro),
 * evitando duplicatas a cada sincronização.
 */
export async function syncSurgeryReminders(pacientes: Paciente[]): Promise<void> {
  if (!isNotificationsSupported) return;
  const granted = await ensureNotificationPermission();
  if (!granted) return;

  await ensureAndroidChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();

  const now = Date.now();
  for (const paciente of pacientes) {
    if (paciente.arquivado) continue;
    const when = reminderDateFor(paciente);
    if (!when || when.getTime() <= now) continue;

    const procedimentos = paciente.procedimentos.join(" · ");
    const horario = paciente.horario ? ` às ${paciente.horario}` : "";

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Cirurgia amanhã · ${paciente.nome}`,
        body: procedimentos
          ? `${procedimentos}${horario}. Confira o preparo no Console.`
          : `Confira o preparo no Console${horario}.`,
        data: { pacienteId: paciente.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: when,
        channelId: Platform.OS === "android" ? ANDROID_CHANNEL_ID : undefined,
      },
    });
  }
}

/** Lê o id da paciente embutido em uma resposta de notificação, se houver. */
export function pacienteIdFromResponse(
  response: Notifications.NotificationResponse | null | undefined,
): number | null {
  const raw = response?.notification.request.content.data?.pacienteId;
  const id = typeof raw === "string" ? Number(raw) : raw;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}
