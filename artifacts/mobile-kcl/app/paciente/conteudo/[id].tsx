import {
  getObterConteudoPacienteQueryKey,
  getObterPacienteQueryKey,
  getObterPaginaPacienteQueryKey,
  useListarMedicos,
  useObterConfig,
  useObterConteudoPaciente,
  useObterPaciente,
  useObterPaginaPaciente,
  useAtualizarConteudoPaciente,
  useRemoverConteudoPaciente,
  isConnectivityError,
  type SecaoConteudo,
} from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DiscardChangesDialog } from "@/components/discard-changes-dialog";
import { PaginaPreview } from "@/components/secoes-preview";
import { SecoesEditor } from "@/components/secoes-editor";
import { ThemeToggle } from "@/components/theme-toggle";
import { fonts } from "@/constants/fonts";
import { useColors } from "@/hooks/useColors";
import { useDialogs } from "@/hooks/useDialogs";
import { ThemeScope } from "@/hooks/useTheme";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { ConnectionError } from "@/components/connection-error";
import { noticeErroEnvio } from "@/lib/erros";
import {
  dadosDaPaciente,
  identidadeDaPaciente,
  resolverSecoesPreview,
} from "@/lib/secoes-preview";

const WEB_TOP_INSET = 67;
const WEB_BOTTOM_INSET = 34;

export default function EditarConteudoPaciente() {
  const colors = useColors();
  const { confirm, notify } = useDialogs();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);

  const topPad = Platform.OS === "web" ? WEB_TOP_INSET : insets.top;
  const bottomPad = (Platform.OS === "web" ? WEB_BOTTOM_INSET : insets.bottom) + 32;

  const { data: paciente } = useObterPaciente(id, {
    query: { enabled: !!id, queryKey: getObterPacienteQueryKey(id) },
  });
  const {
    data: conteudo,
    isLoading,
    isError: erroConteudo,
    error: errorConteudo,
    refetch: refetchConteudo,
    isRefetching: refetchingConteudo,
  } = useObterConteudoPaciente(id, {
    query: { enabled: !!id, queryKey: getObterConteudoPacienteQueryKey(id) },
  });
  const { data: config } = useObterConfig();
  // Inclui inativos para que a foto/logo do médico ligado à paciente apareça
  // mesmo se ele estiver inativo — igual ao Console web e à página pública.
  const { data: medicos } = useListarMedicos({ incluirInativos: true });

  const conteudoIndisponivel =
    erroConteudo && isConnectivityError(errorConteudo) && !conteudo;

  const atualizar = useAtualizarConteudoPaciente();
  const remover = useRemoverConteudoPaciente();

  const [secoes, setSecoes] = useState<SecaoConteudo[] | null>(null);
  const [modo, setModo] = useState<"editar" | "previa">("editar");

  useEffect(() => {
    if (conteudo && secoes === null) setSecoes(conteudo.secoes);
  }, [conteudo, secoes]);

  const dirty =
    secoes !== null &&
    conteudo != null &&
    JSON.stringify(secoes) !== JSON.stringify(conteudo.secoes);

  const { allowLeave, guardNavigation, dialogProps } = useUnsavedChanges(dirty, {
    message:
      "Você tem edições de conteúdo que ainda não foram salvas. Se sair agora, elas serão perdidas.",
  });

  const tokenPublico = paciente?.paciente.tokenPublico ?? "";

  // Só busca a página pública para espelhar o registro (claro/escuro) que a
  // paciente escolheu — o conteúdo em si vem das edições locais, não daqui.
  const { data: pagina } = useObterPaginaPaciente(tokenPublico, {
    query: { enabled: !!tokenPublico, queryKey: getObterPaginaPacienteQueryKey(tokenPublico) },
  });

  // Resolve as seções em edição com os dados reais da paciente — mesma fonte
  // (`@workspace/secoes`) usada pelo api-server e pelo Console web, então a prévia
  // é idêntica ao que a paciente recebe.
  const secoesResolvidas = useMemo<SecaoConteudo[]>(() => {
    if (!secoes || !paciente) return [];
    return resolverSecoesPreview(secoes, dadosDaPaciente(paciente.paciente, config));
  }, [secoes, paciente, config]);

  // Cabeçalho de identidade da prévia: nome/CRM/RQE/clínica do registro da
  // paciente; foto/logo do médico ligado a ela (resolvido por id, incluindo
  // inativos), espelhando a prévia do Console web.
  const identidade = useMemo(() => {
    if (!paciente) return undefined;
    const medico = (medicos ?? []).find(
      (m) => m.id === paciente.paciente.medicoId,
    );
    return identidadeDaPaciente(paciente.paciente, medico);
  }, [paciente, medicos]);

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: getObterConteudoPacienteQueryKey(id) });
    if (tokenPublico) {
      queryClient.invalidateQueries({ queryKey: getObterPaginaPacienteQueryKey(tokenPublico) });
    }
  };

  const salvar = () => {
    if (!secoes || atualizar.isPending) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    atualizar.mutate(
      { id, data: { secoes } },
      {
        onSuccess: (res) => {
          setSecoes(res.secoes);
          invalidar();
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          allowLeave();
          router.back();
        },
        onError: (error) => {
          notify(
            noticeErroEnvio(error, {
              title: "Não foi possível salvar",
              message: "Tente novamente em instantes.",
            }),
          );
        },
      }
    );
  };

  const reverter = async () => {
    const run = () => {
      if (remover.isPending) return;
      remover.mutate(
        { id },
        {
          onSuccess: (res) => {
            setSecoes(res.secoes);
            invalidar();
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            allowLeave();
            router.back();
          },
          onError: (error) => {
            notify(
              noticeErroEnvio(error, {
                title: "Não foi possível reverter",
                message: "Tente novamente em instantes.",
              }),
            );
          },
        }
      );
    };
    const ok = await confirm({
      title: "Reverter ao padrão?",
      message:
        "A personalização desta paciente será removida e ela voltará a seguir o conteúdo padrão global.",
      confirmText: "Reverter",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (ok) run();
  };

  const personalizado = conteudo?.personalizado ?? false;

  if (conteudoIndisponivel) {
    return (
      <ConnectionError
        onRetry={() => refetchConteudo()}
        isRetrying={isLoading || refetchingConteudo}
      />
    );
  }

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
          <Text style={[styles.headerBrand, { color: colors.mutedForeground }]}>CONTEÚDO DA PÁGINA</Text>
        </View>
        <View style={styles.headerRight}>
        <ThemeToggle />
        <View
          style={[
            styles.badge,
            {
              borderColor: personalizado ? "rgba(201,169,110,0.6)" : "rgba(151,163,180,0.3)",
              backgroundColor: colors.card,
            },
          ]}
        >
          <Text style={[styles.badgeText, { color: personalizado ? colors.primary : colors.mutedForeground }]}>
            {personalizado ? "PERSONALIZADO" : "PADRÃO GLOBAL"}
          </Text>
        </View>
        </View>
      </View>

      {isLoading || !secoes ? (
        <View style={[styles.center, { paddingTop: 80 }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: bottomPad }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.lede, { color: colors.mutedForeground }]}>
            {personalizado
              ? "Esta paciente tem um conteúdo personalizado. Reverter ao padrão remove a personalização."
              : "Esta paciente segue o conteúdo padrão global. Ao salvar, você cria uma cópia só dela."}
          </Text>

          <View style={[styles.segmented, { borderColor: colors.card }]}>
            {(["editar", "previa"] as const).map((m) => {
              const ativo = modo === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setModo(m)}
                  testID={`modo-${m}`}
                  style={[
                    styles.segmentedItem,
                    { backgroundColor: ativo ? colors.card : "transparent" },
                  ]}
                >
                  <Feather
                    name={m === "editar" ? "edit-3" : "eye"}
                    size={13}
                    color={ativo ? colors.foreground : colors.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.segmentedText,
                      { color: ativo ? colors.foreground : colors.mutedForeground },
                    ]}
                  >
                    {m === "editar" ? "EDITAR" : "PRÉ-VISUALIZAR"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {modo === "editar" ? (
            <View style={styles.editorWrap}>
              <SecoesEditor secoes={secoes} onChange={setSecoes} />
            </View>
          ) : (
            <View style={styles.previewWrap}>
              <Text style={[styles.previewNota, { color: colors.mutedForeground }]}>
                É assim que {paciente?.paciente.nome ?? "a paciente"} vê o conteúdo. As variáveis estão
                preenchidas com os dados reais do processo.
              </Text>
              <View style={[styles.previewMolde, { borderColor: colors.card }]}>
                {secoesResolvidas.length > 0 ? (
                  <ThemeScope theme={pagina?.tema === "dark" ? "dark" : "light"}>
                    <PaginaPreview
                      secoes={secoesResolvidas}
                      identidade={identidade}
                      dados={
                        pagina
                          ? {
                              primeiroNome: pagina.primeiroNome,
                              dataCirurgia: pagina.dataCirurgia,
                              horario: pagina.horario,
                              procedimentos: pagina.procedimentos,
                              local: pagina.local,
                              equipeAnestesia: pagina.equipeAnestesia,
                            }
                          : undefined
                      }
                      pagamento={pagina?.pagamento}
                    />
                  </ThemeScope>
                ) : (
                  <Text style={[styles.previewVazio, { color: colors.mutedForeground }]}>
                    Nenhuma seção para pré-visualizar ainda. Adicione seções no editor para vê-las aqui.
                  </Text>
                )}
              </View>
            </View>
          )}

          <View style={styles.footer}>
            <Pressable
              onPress={salvar}
              disabled={atualizar.isPending}
              testID="salvar-conteudo"
              style={({ pressed }) => [
                styles.salvarBtn,
                { backgroundColor: colors.ivory, opacity: pressed || atualizar.isPending ? 0.7 : 1 },
              ]}
            >
              <Feather name="check" size={16} color={colors.ivoryForeground} />
              <Text style={[styles.salvarText, { color: colors.ivoryForeground }]}>
                {atualizar.isPending ? "Salvando..." : "Salvar personalização"}
              </Text>
            </Pressable>

            {personalizado ? (
              <Pressable
                onPress={reverter}
                disabled={remover.isPending}
                testID="reverter-conteudo"
                style={({ pressed }) => [
                  styles.reverterBtn,
                  { borderColor: colors.borderStrong, opacity: pressed || remover.isPending ? 0.7 : 1 },
                ]}
              >
                <Feather name="rotate-ccw" size={15} color={colors.foreground} />
                <Text style={[styles.reverterText, { color: colors.foreground }]}>
                  {remover.isPending ? "Revertendo..." : "Reverter ao padrão"}
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => guardNavigation(() => router.back())}
              hitSlop={8}
              style={styles.cancelarBtn}
            >
              <Text style={[styles.cancelarText, { color: colors.mutedForeground }]}>Cancelar</Text>
            </Pressable>
          </View>
        </ScrollView>
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
  headerRight: { flexDirection: "row", alignItems: "center", gap: 16 },
  headerDivider: { width: 1, height: 22 },
  headerBrand: { fontFamily: fonts.expanded, fontSize: 13, letterSpacing: 2.5 },
  badge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontFamily: fonts.expanded, fontSize: 9, letterSpacing: 1.5 },

  lede: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, marginBottom: 20 },
  editorWrap: { gap: 20 },

  segmented: { flexDirection: "row", borderWidth: 1, padding: 3, marginBottom: 20 },
  segmentedItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    height: 40,
  },
  segmentedText: { fontFamily: fonts.expanded, fontSize: 10, letterSpacing: 1.5 },

  previewWrap: { gap: 14 },
  previewNota: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  previewMolde: { borderWidth: 1 },
  previewVazio: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, padding: 24, textAlign: "center" },

  footer: { marginTop: 28, gap: 12 },
  salvarBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
  },
  salvarText: { fontFamily: fonts.sansMedium, fontSize: 15 },
  reverterBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderWidth: 1,
  },
  reverterText: { fontFamily: fonts.sansMedium, fontSize: 14 },
  cancelarBtn: { height: 44, alignItems: "center", justifyContent: "center" },
  cancelarText: { fontFamily: fonts.sansMedium, fontSize: 14 },
});
