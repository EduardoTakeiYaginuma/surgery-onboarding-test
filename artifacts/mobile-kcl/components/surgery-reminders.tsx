/**
 * Componente invisível que mantém os lembretes de cirurgia em dia e trata o
 * toque na notificação (deep-link para a tela da paciente).
 *
 * Só deve ser montado em plataformas nativas — em web as notificações locais
 * não são suportadas (ver `isNotificationsSupported`).
 */
import { useListarPacientes } from "@workspace/api-client-react";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";

import { pacienteIdFromResponse, syncSurgeryReminders } from "@/lib/notifications";

export function SurgeryReminders() {
  const { data: pacientes } = useListarPacientes();

  // Reagenda sempre que a lista de pacientes ativas muda. O pedido de permissão
  // acontece de forma graciosa dentro de syncSurgeryReminders na primeira vez.
  useEffect(() => {
    if (pacientes) {
      void syncSurgeryReminders(pacientes);
    }
  }, [pacientes]);

  // Abre a paciente correspondente quando o app é aberto via notificação
  // (inclui o caso de cold start, pois o hook retorna a resposta inicial).
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const pacienteId = pacienteIdFromResponse(response);
    if (pacienteId != null) {
      router.push({ pathname: "/paciente/[id]", params: { id: String(pacienteId) } });
    }
  }, [response]);

  return null;
}
