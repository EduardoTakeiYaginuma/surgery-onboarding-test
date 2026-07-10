import {
  getObterConfigNotificacaoQueryKey,
  isConnectivityError,
  useDefinirConfigNotificacao,
  useObterConfigNotificacao,
} from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConnectionError } from "@/components/connection-error";
import { DiscardChangesDialog } from "@/components/discard-changes-dialog";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ThemeToggle } from "@/components/theme-toggle";
import { fonts } from "@/constants/fonts";
import { useColors } from "@/hooks/useColors";
import { useDialogs } from "@/hooks/useDialogs";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { noticeErroEnvio } from "@/lib/erros";

const WEB_TOP_INSET = 67;
const WEB_BOTTOM_INSET = 34;

export default function AvisosDaEquipe() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { notify } = useDialogs();

  const topPad = Platform.OS === "web" ? WEB_TOP_INSET : insets.top;
  const bottomPad = (Platform.OS === "web" ? WEB_BOTTOM_INSET : insets.bottom) + 32;

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useObterConfigNotificacao({
    query: { queryKey: getObterConfigNotificacaoQueryKey() },
  });
  const salvar = useDefinirConfigNotificacao();

  const indisponivel = isError && isConnectivityError(error) && !data;

  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [silenciada, setSilenciada] = useState<boolean | null>(null);
  const [baseline, setBaseline] = useState<{
    webhookUrl: string;
    silenciada: boolean;
  } | null>(null);

  useEffect(() => {
    if (data && webhookUrl === null) {
      setWebhookUrl(data.webhookUrl ?? "");
      setSilenciada(data.silenciada);
      setBaseline({ webhookUrl: data.webhookUrl ?? "", silenciada: data.silenciada });
    }
  }, [data, webhookUrl]);

  const dirty =
    baseline !== null &&
    webhookUrl !== null &&
    silenciada !== null &&
    (webhookUrl.trim() !== baseline.webhookUrl.trim() ||
      silenciada !== baseline.silenciada);

  const { allowLeave, guardNavigation, dialogProps } = useUnsavedChanges(dirty, {
    message:
      "Você mexeu nos avisos da equipe e ainda não salvou. Se sair agora, as mudanças serão perdidas.",
  });

  const semDestino = (webhookUrl ?? "").trim() === "";

  const onSalvar = () => {
    if (webhookUrl === null || silenciada === null || salvar.isPending) return;
    const limpo = webhookUrl.trim();
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    salvar.mutate(
      { data: { webhookUrl: limpo || null, silenciada } },
      {
        onSuccess: (res) => {
          setWebhookUrl(res.webhookUrl ?? "");
          setSilenciada(res.silenciada);
          setBaseline({ webhookUrl: res.webhookUrl ?? "", silenciada: res.silenciada });
          queryClient.invalidateQueries({
            queryKey: getObterConfigNotificacaoQueryKey(),
          });
          if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          allowLeave();
          router.back();
        },
        onError: (err) => {
          notify(
            noticeErroEnvio(err, {
              title: "Não foi possível salvar",
              message:
                "Confira o destino (precisa ser uma URL https://...) e tente de novo.",
            }),
          );
        },
      },
    );
  };

  if (indisponivel) {
    return (
      <ConnectionError onRetry={() => refetch()} isRetrying={isLoading || isRefetching} />
    );
  }

  const carregando =
    isLoading || webhookUrl === null || silenciada === null;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: topPad + 10, backgroundColor: colors.background, borderBottomColor: colors.card },
        ]}
      >
        <View style={styles.headerLeft}>
          <Pressable onPress={() => guardNavigation(() => router.back())} hitSlop={12} testID="voltar">
            <Feather name="arrow-left" size={22} color={colors.mutedForeground} />
          </Pressable>
          <View style={[styles.headerDivider, { backgroundColor: colors.card }]} />
          <Text style={[styles.headerBrand, { color: colors.mutedForeground }]}>
            AVISOS DA EQUIPE
          </Text>
        </View>
        <ThemeToggle />
      </View>

      {carregando ? (
        <View style={[styles.center, { paddingTop: 80 }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <KeyboardAwareScrollViewCompat
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: bottomPad }}
          showsVerticalScrollIndicator={false}
          bottomOffset={20}
        >
          <Text style={[styles.title, { color: colors.foreground }]}>
            Avisos de contrato à equipe
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Assim que uma paciente assina ou recusa o contrato, avisamos a equipe no
            destino definido aqui — sem ninguém precisar ficar de olho na home. Funciona
            com qualquer webhook de entrada (Slack, Discord ou uma ponte para o WhatsApp).
          </Text>

          {/* Destino do aviso */}
          <View style={[styles.secao, { borderColor: colors.card }]}>
            <Text style={[styles.secaoTitulo, { color: colors.foreground }]}>
              Destino do aviso
            </Text>
            <Text style={[styles.secaoHint, { color: colors.mutedForeground }]}>
              Cole a URL do webhook de entrada do canal que deve receber os avisos. Deixe
              em branco para não enviar nenhum aviso.
            </Text>
            <TextInput
              value={webhookUrl}
              onChangeText={setWebhookUrl}
              placeholder="https://hooks.slack.com/services/..."
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.input,
                {
                  backgroundColor: colors.card,
                  color: colors.foreground,
                  borderColor: colors.borderStrong,
                },
              ]}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              testID="input-webhook"
            />
          </View>

          {/* Liga/desliga */}
          <View style={[styles.switchRow, { borderColor: colors.card, backgroundColor: colors.card }]}>
            <View style={{ flex: 1 }}>
              <View style={styles.switchTitleRow}>
                <Feather
                  name={silenciada ? "bell-off" : "bell"}
                  size={16}
                  color={silenciada ? colors.mutedForeground : colors.primary}
                />
                <Text style={[styles.switchLabel, { color: colors.foreground }]}>
                  Avisos {silenciada ? "pausados" : "ativos"}
                </Text>
              </View>
              <Text style={[styles.switchHint, { color: colors.mutedForeground }]}>
                {silenciada
                  ? "Os avisos estão pausados. O destino continua guardado — é só reativar quando quiser."
                  : "A equipe recebe um aviso a cada contrato assinado ou recusado."}
              </Text>
            </View>
            <Switch
              value={!silenciada}
              onValueChange={(ativo) => setSilenciada(!ativo)}
              trackColor={{ false: colors.borderStrong, true: colors.primary }}
              thumbColor={colors.ivory}
              testID="switch-avisos"
            />
          </View>

          {semDestino && !silenciada ? (
            <Text style={[styles.aviso, { color: colors.mutedForeground }]}>
              Sem um destino salvo, nenhum aviso será enviado mesmo com os avisos ativos.
            </Text>
          ) : null}

          <View style={styles.footer}>
            <Pressable
              onPress={onSalvar}
              disabled={salvar.isPending || !dirty}
              testID="salvar-avisos"
              style={({ pressed }) => [
                styles.salvarBtn,
                {
                  backgroundColor: colors.ivory,
                  opacity: pressed || salvar.isPending || !dirty ? 0.6 : 1,
                },
              ]}
            >
              <Feather name="check" size={16} color={colors.ivoryForeground} />
              <Text style={[styles.salvarText, { color: colors.ivoryForeground }]}>
                {salvar.isPending ? "Salvando..." : "Salvar avisos"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => guardNavigation(() => router.back())}
              hitSlop={8}
              style={styles.cancelarBtn}
            >
              <Text style={[styles.cancelarText, { color: colors.mutedForeground }]}>
                Cancelar
              </Text>
            </Pressable>
          </View>
        </KeyboardAwareScrollViewCompat>
      )}

      <DiscardChangesDialog {...dialogProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  headerDivider: { width: 1, height: 22 },
  headerBrand: { fontFamily: fonts.expanded, fontSize: 13, letterSpacing: 2.5 },

  title: { fontFamily: fonts.serifLight, fontSize: 30, letterSpacing: -0.5 },
  subtitle: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 28 },

  secao: { borderWidth: 1, padding: 18, gap: 12, marginBottom: 16 },
  secaoTitulo: { fontFamily: fonts.serif, fontSize: 20 },
  secaoHint: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  input: {
    height: 50,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontFamily: fonts.mono,
    fontSize: 14,
  },

  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    padding: 18,
  },
  switchTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  switchLabel: { fontFamily: fonts.sansMedium, fontSize: 16 },
  switchHint: { fontFamily: fonts.sans, fontSize: 12, marginTop: 6, lineHeight: 17 },

  aviso: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, marginTop: 12 },

  footer: { marginTop: 28, gap: 12 },
  salvarBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
  },
  salvarText: { fontFamily: fonts.sansMedium, fontSize: 15 },
  cancelarBtn: { height: 44, alignItems: "center", justifyContent: "center" },
  cancelarText: { fontFamily: fonts.sansMedium, fontSize: 14 },
});
