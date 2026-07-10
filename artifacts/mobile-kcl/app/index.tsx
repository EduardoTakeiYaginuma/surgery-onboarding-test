import {
  getListarPacientesArquivadosQueryKey,
  getListarPacientesQueryKey,
  getResumoPacientesQueryKey,
  useListarPacientes,
  useListarPacientesArquivados,
  useRegistrarLembrete,
  useResumoPacientes,
  isConnectivityError,
  type Paciente,
} from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  type GestureResponderEvent,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ContratoBadge, EstratosLogo, MarcoBadge } from "@/components/brand";
import { ConnectionError } from "@/components/connection-error";
import { ThemeToggle } from "@/components/theme-toggle";
import { fonts } from "@/constants/fonts";
import { useColors } from "@/hooks/useColors";
import { useDialogs } from "@/hooks/useDialogs";
import { useOperador } from "@/hooks/useOperador";
import { formatDate } from "@/lib/format";
import { linkLembreteWhatsApp, precisaAlertaAbertura } from "@/lib/patient-tools";

const WEB_TOP_INSET = 67;
const WEB_BOTTOM_INSET = 34;

// Vermelho contido do alerta "não abriu" — legível nos dois registros (claro
// e escuro), espelhando o tom de aviso do Console web.
const ALERTA_COR = "#E06A6A";
const ALERTA_BORDA = "rgba(224,106,106,0.45)";

export default function ConsoleHome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const topPad = (Platform.OS === "web" ? WEB_TOP_INSET : insets.top) + 12;
  const bottomPad = (Platform.OS === "web" ? WEB_BOTTOM_INSET : insets.bottom) + 110;

  const {
    data: resumo,
    isLoading: loadingResumo,
  } = useResumoPacientes();
  const [aba, setAba] = useState<"ativos" | "arquivados">("ativos");

  const {
    data: ativos,
    isLoading: loadingAtivos,
    isError: erroAtivos,
    error: errorAtivos,
    refetch: refetchAtivos,
  } = useListarPacientes();
  const {
    data: arquivados,
    isLoading: loadingArquivados,
    isError: erroArquivados,
    error: errorArquivados,
    refetch: refetchArquivados,
  } = useListarPacientesArquivados();

  const pacientes = aba === "ativos" ? ativos : arquivados;
  const loadingPacientes = aba === "ativos" ? loadingAtivos : loadingArquivados;
  const isError = aba === "ativos" ? erroAtivos : erroArquivados;
  const errorObj = aba === "ativos" ? errorAtivos : errorArquivados;

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListarPacientesQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListarPacientesArquivadosQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getResumoPacientesQueryKey() }),
    ]);
    await Promise.all([refetchAtivos(), refetchArquivados()]);
    setRefreshing(false);
  }, [queryClient, refetchAtivos, refetchArquivados]);

  const stats = [
    { label: "Total", value: resumo?.total ?? 0, color: colors.foreground },
    { label: "Aguardando contrato", value: resumo?.aguardandoContrato ?? 0, color: colors.mutedForeground },
    { label: "Contratos pendentes", value: resumo?.contratosPendentes ?? 0, color: colors.primary },
    { label: "Termos pendentes", value: resumo?.termosPendentes ?? 0, color: colors.primary },
  ];

  const goNew = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/novo");
  };

  // Registra o lembrete enviado pela equipe e credita quem o disparou, para que
  // o "Lembrado por X" apareça no card (web e móvel) e dois atendentes não façam
  // o mesmo follow-up. Identidade leve capturada uma vez neste aparelho.
  const registrarLembrete = useRegistrarLembrete();
  const { operador, carregado: operadorCarregado, salvar: salvarOperador } = useOperador();
  const { notify } = useDialogs();
  const [identAberto, setIdentAberto] = useState(false);
  const [identRascunho, setIdentRascunho] = useState("");
  const [identPendente, setIdentPendente] = useState<Paciente | null>(null);

  const enviarLembrete = useCallback(
    (item: Paciente, autor: string | null) => {
      // Abre o WhatsApp primeiro; o registro do lembrete é best-effort em seguida.
      Linking.openURL(linkLembreteWhatsApp(item)).catch(() => {
        /* silencioso — se o WhatsApp não abrir, não há o que fazer aqui */
      });
      registrarLembrete.mutate(
        { id: item.id, data: autor ? { autor } : undefined },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListarPacientesQueryKey() });
          },
          onError: () => {
            void notify({
              title: "Não foi possível registrar o lembrete",
              message: "O WhatsApp foi aberto, mas o registro falhou. Tente novamente.",
            });
          },
        },
      );
    },
    [registrarLembrete, queryClient, notify],
  );

  const lembrarWhatsApp = (e: GestureResponderEvent, item: Paciente) => {
    // Evita que o toque borbulhe para o card e dispare a navegação (Expo web).
    e.stopPropagation();
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Ainda lendo a identidade salva (AsyncStorage): ignora o toque para não
    // perguntar o nome à toa quando já existe um salvo neste aparelho.
    if (!operadorCarregado) return;
    // Sem identidade ainda neste aparelho: pergunta quem está enviando antes de
    // abrir o WhatsApp e registrar o lembrete.
    if (!operador) {
      setIdentRascunho("");
      setIdentPendente(item);
      setIdentAberto(true);
      return;
    }
    enviarLembrete(item, operador);
  };

  const fecharIdent = () => {
    setIdentAberto(false);
    setIdentPendente(null);
  };

  const confirmarIdentidade = () => {
    const nome = identRascunho.trim();
    if (!nome || !identPendente) return;
    salvarOperador(nome);
    const item = identPendente;
    fecharIdent();
    enviarLembrete(item, nome);
  };

  const Header = (
    <View>
      <View style={styles.brandRow}>
        <EstratosLogo size={22} />
        <Text style={[styles.brandName, { color: colors.foreground }]}>CAMADA</Text>
        <Text style={[styles.brandSub, { color: colors.mutedForeground }]}>
          OPERAÇÃO KCL · DRA. KARLA
        </Text>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => router.push("/contrato-modelos")}
          hitSlop={12}
          testID="modelos-documento"
          accessibilityRole="button"
          accessibilityLabel="Modelos de documento"
          style={styles.brandIconBtn}
        >
          <Feather name="file-text" size={18} color={colors.mutedForeground} />
        </Pressable>
        <Pressable
          onPress={() => router.push("/avisos")}
          hitSlop={12}
          testID="avisos-equipe"
          accessibilityRole="button"
          accessibilityLabel="Avisos da equipe"
          style={styles.brandIconBtn}
        >
          <Feather name="bell" size={18} color={colors.mutedForeground} />
        </Pressable>
        <ThemeToggle />
      </View>

      <Text style={[styles.title, { color: colors.foreground }]}>Console de Operação</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        Gestão de handoff e preparo cirúrgico.
      </Text>

      {/* Resumo strip */}
      <View style={[styles.statStrip, { backgroundColor: colors.card }]}>
        {stats.map((s) => (
          <View key={s.label} style={[styles.statCell, { backgroundColor: colors.background }]}>
            {loadingResumo ? (
              <View style={[styles.statSkeleton, { backgroundColor: colors.card }]} />
            ) : (
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            )}
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
              {s.label.toUpperCase()}
            </Text>
          </View>
        ))}
      </View>

      <View style={[styles.tabsRow, { borderBottomColor: colors.card }]}>
        {(["ativos", "arquivados"] as const).map((key) => {
          const selected = aba === key;
          return (
            <Pressable
              key={key}
              onPress={() => setAba(key)}
              testID={`aba-${key}`}
              style={styles.tab}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: selected ? colors.primary : colors.mutedForeground },
                ]}
              >
                {key === "ativos" ? "PACIENTES ATIVOS" : "ARQUIVADOS"}
              </Text>
              {selected ? (
                <View style={[styles.tabUnderline, { backgroundColor: colors.primary }]} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const renderItem = ({ item }: { item: Paciente }) => (
    <Pressable
      onPress={() => router.push({ pathname: "/paciente/[id]", params: { id: item.id } })}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: pressed ? "rgba(201,169,110,0.4)" : "transparent" },
      ]}
      testID={`paciente-${item.id}`}
    >
      <View style={styles.cardBody}>
        <View style={styles.cardNameRow}>
          <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>
            {item.nome}
          </Text>
          <MarcoBadge marco={item.marcoAtual} rotulo={item.marcoAtualRotulo} />
        </View>
        <View style={styles.cardBadgeRow}>
          <ContratoBadge status={item.contratoStatus} />
          {item.termoAutentiqueId && item.termoStatus !== "assinado" ? (
            <ContratoBadge status={item.termoStatus} prefix="TCLE" />
          ) : null}
          {precisaAlertaAbertura(item) ? (
            <View style={[styles.alertaBadge, { borderColor: ALERTA_BORDA }]}>
              <Feather name="alert-triangle" size={9} color={ALERTA_COR} />
              <Text style={[styles.alertaBadgeText, { color: ALERTA_COR }]}>NÃO ABRIU</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.cardMetaRow}>
          <Text style={[styles.cardMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
            {item.procedimentos.join(" · ")}
          </Text>
          <View style={[styles.dot, { backgroundColor: "rgba(151,163,180,0.4)" }]} />
          <Text style={[styles.cardDate, { color: colors.mutedForeground }]}>
            {formatDate(item.dataCirurgia)} · {item.horario}
          </Text>
        </View>
        {precisaAlertaAbertura(item) && item.telefone ? (
          <>
            <Pressable
              onPress={(e) => lembrarWhatsApp(e, item)}
              testID={`lembrar-whatsapp-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Lembrar ${item.nome} pelo WhatsApp`}
              hitSlop={6}
              style={({ pressed }) => [
                styles.lembreteBtn,
                { borderColor: ALERTA_BORDA, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="message-circle" size={13} color={ALERTA_COR} />
              <Text style={[styles.lembreteBtnText, { color: ALERTA_COR }]}>
                {item.lembreteEnviadoEm ? "Lembrar de novo" : "Lembrar pelo WhatsApp"}
              </Text>
            </Pressable>
            {item.lembreteEnviadoEm ? (
              <Text
                style={[styles.lembradoPorText, { color: colors.mutedForeground }]}
                testID={`lembrado-por-${item.id}`}
              >
                {item.lembradoPor
                  ? `Lembrado por ${item.lembradoPor} em ${formatDate(item.lembreteEnviadoEm)}`
                  : `Lembrado em ${formatDate(item.lembreteEnviadoEm)}`}
              </Text>
            ) : null}
          </>
        ) : null}
      </View>
      <Feather name="arrow-right" size={20} color={colors.primary} />
    </Pressable>
  );

  if (isError && isConnectivityError(errorObj) && !pacientes) {
    return <ConnectionError onRetry={onRefresh} isRetrying={refreshing} />;
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        data={pacientes ?? []}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        ListHeaderComponent={Header}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: topPad, paddingBottom: bottomPad }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          loadingPacientes ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : isError ? (
            <View style={[styles.emptyBox, { borderColor: colors.card }]}>
              <Feather name="wifi-off" size={22} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Não foi possível carregar os pacientes.
              </Text>
              <Pressable onPress={onRefresh} style={[styles.retryBtn, { borderColor: colors.borderStrong }]}>
                <Text style={[styles.retryText, { color: colors.foreground }]}>Tentar novamente</Text>
              </Pressable>
            </View>
          ) : (
            <View style={[styles.emptyBox, { borderColor: colors.card }]}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {aba === "ativos"
                  ? "Nenhum paciente no momento."
                  : "Nenhum processo arquivado."}
              </Text>
            </View>
          )
        }
      />

      {/* FAB — Novo paciente */}
      {aba === "ativos" ? (
        <Pressable
          onPress={goNew}
          testID="novo-paciente"
          style={({ pressed }) => [
            styles.fab,
            {
              backgroundColor: colors.ivory,
              bottom: (Platform.OS === "web" ? WEB_BOTTOM_INSET : insets.bottom) + 20,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ]}
        >
          <Feather name="plus" size={20} color={colors.ivoryForeground} />
          <Text style={[styles.fabText, { color: colors.ivoryForeground }]}>Novo paciente</Text>
        </Pressable>
      ) : null}

      {/* Identidade do operador — pergunta uma vez quem está enviando o lembrete,
          para creditar o follow-up. Reutilizada nas próximas vezes. */}
      <Modal
        visible={identAberto}
        transparent
        animationType="fade"
        onRequestClose={fecharIdent}
      >
        <Pressable style={styles.identOverlay} onPress={fecharIdent}>
          <Pressable
            style={[styles.identCard, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.identTitle, { color: colors.foreground }]}>
              Quem está enviando?
            </Text>
            <Text style={[styles.identBody, { color: colors.mutedForeground }]}>
              Seu nome fica registrado no lembrete para a equipe saber quem fez o follow-up. Guardamos só neste aparelho.
            </Text>
            <TextInput
              value={identRascunho}
              onChangeText={setIdentRascunho}
              placeholder="Seu nome"
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.identInput,
                { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.borderStrong },
              ]}
              autoFocus
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={confirmarIdentidade}
              testID="ident-operador-input"
            />
            <View style={styles.identActions}>
              <Pressable
                onPress={fecharIdent}
                testID="ident-operador-cancelar"
                style={({ pressed }) => [
                  styles.identCancelBtn,
                  { borderColor: colors.borderStrong, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.identCancelText, { color: colors.foreground }]}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={confirmarIdentidade}
                disabled={!identRascunho.trim()}
                testID="ident-operador-confirmar"
                style={({ pressed }) => [
                  styles.identConfirmBtn,
                  { backgroundColor: colors.ivory, opacity: !identRascunho.trim() ? 0.5 : pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={[styles.identConfirmText, { color: colors.ivoryForeground }]}>
                  Enviar lembrete
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 28 },
  brandIconBtn: { padding: 2 },
  brandName: { fontFamily: fonts.expanded, fontSize: 14, letterSpacing: 3 },
  brandSub: { fontFamily: fonts.expanded, fontSize: 9, letterSpacing: 1.5, flexShrink: 1 },
  title: { fontFamily: fonts.serifLight, fontSize: 34, letterSpacing: -0.5 },
  subtitle: { fontFamily: fonts.sans, fontSize: 14, marginTop: 4 },

  statStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 1,
    padding: 1,
    marginTop: 28,
  },
  statCell: {
    flexGrow: 1,
    flexBasis: "32%",
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: { fontFamily: fonts.mono, fontSize: 26, marginBottom: 4 },
  statSkeleton: { width: 28, height: 26, marginBottom: 4 },
  statLabel: { fontFamily: fonts.expanded, fontSize: 9, letterSpacing: 1.5 },

  tabsRow: {
    flexDirection: "row",
    gap: 24,
    marginTop: 32,
    marginBottom: 14,
    borderBottomWidth: 1,
  },
  tab: { paddingBottom: 12 },
  tabText: { fontFamily: fonts.expanded, fontSize: 11, letterSpacing: 2 },
  tabUnderline: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -1,
    height: 1.5,
  },

  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    borderWidth: 1,
  },
  cardBody: { flex: 1, gap: 6 },
  cardNameRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardBadgeRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  cardName: { fontFamily: fonts.serif, fontSize: 20, flexShrink: 1 },
  cardMetaRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardMeta: { fontFamily: fonts.sans, fontSize: 13, flexShrink: 1 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  cardDate: { fontFamily: fonts.mono, fontSize: 12 },

  alertaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  alertaBadgeText: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1 },
  lembreteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 4,
    alignSelf: "flex-start",
  },
  lembreteBtnText: {
    fontFamily: fonts.expanded,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  lembradoPorText: {
    fontFamily: fonts.sans,
    fontSize: 11,
    marginTop: 4,
  },

  identOverlay: {
    flex: 1,
    backgroundColor: "rgba(10,23,41,0.6)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  identCard: {
    width: "100%",
    maxWidth: 380,
    borderWidth: 1,
    padding: 24,
    gap: 12,
  },
  identTitle: { fontFamily: fonts.serifLight, fontSize: 22 },
  identBody: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 21 },
  identInput: {
    height: 50,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontFamily: fonts.sans,
    fontSize: 15,
  },
  identActions: { marginTop: 4, gap: 10 },
  identCancelBtn: {
    height: 48,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  identCancelText: { fontFamily: fonts.sansMedium, fontSize: 14 },
  identConfirmBtn: {
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  identConfirmText: { fontFamily: fonts.sansMedium, fontSize: 15 },

  center: { paddingVertical: 48, alignItems: "center" },
  emptyBox: {
    borderWidth: 1,
    borderStyle: "dashed",
    paddingVertical: 48,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 14,
  },
  emptyText: { fontFamily: fonts.sans, fontSize: 14, textAlign: "center" },
  retryBtn: { borderWidth: 1, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { fontFamily: fonts.sansMedium, fontSize: 13 },

  fab: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    height: 52,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  fabText: { fontFamily: fonts.sansMedium, fontSize: 15 },
});
