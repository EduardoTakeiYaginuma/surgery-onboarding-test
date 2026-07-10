import {
  getListarContratoModelosQueryKey,
  getListarVariaveisContratoQueryKey,
  isConnectivityError,
  useAtualizarContratoModelo,
  useCriarContratoModelo,
  useListarContratoModelos,
  useListarVariaveisContrato,
  useRemoverContratoModelo,
  useRestaurarContratoModeloPadrao,
  type ContratoModelo,
} from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
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

const GRUPOS: { tipo: ContratoModelo["tipo"]; titulo: string }[] = [
  { tipo: "contrato", titulo: "Contratos" },
  { tipo: "termo", titulo: "Termos de consentimento (TCLE)" },
];

type FormState = {
  tipo: ContratoModelo["tipo"];
  procedimento: string;
  titulo: string;
  corpo: string;
  vigente: boolean;
  observacoes: string;
};

const VAZIO: FormState = {
  tipo: "contrato",
  procedimento: "",
  titulo: "",
  corpo: "",
  vigente: true,
  observacoes: "",
};

export default function ContratoModelos() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { confirm, notify } = useDialogs();

  const topPad = Platform.OS === "web" ? WEB_TOP_INSET : insets.top;
  const bottomPad = (Platform.OS === "web" ? WEB_BOTTOM_INSET : insets.bottom) + 32;

  const {
    data: modelos,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useListarContratoModelos(undefined, {
    query: { queryKey: getListarContratoModelosQueryKey() },
  });
  const { data: variaveis } = useListarVariaveisContrato({
    query: { queryKey: getListarVariaveisContratoQueryKey() },
  });

  const criar = useCriarContratoModelo();
  const atualizar = useAtualizarContratoModelo();
  const remover = useRemoverContratoModelo();
  const restaurar = useRestaurarContratoModeloPadrao();

  const [restaurandoId, setRestaurandoId] = useState<number | null>(null);
  const [removendoId, setRemovendoId] = useState<number | null>(null);

  const [editorAberto, setEditorAberto] = useState(false);
  const [editando, setEditando] = useState<ContratoModelo | null>(null);
  const [form, setForm] = useState<FormState>(VAZIO);
  // Snapshot do formulário ao abrir o editor, para detectar edições não salvas.
  const [formInicial, setFormInicial] = useState<FormState>(VAZIO);
  // Posição do cursor no corpo, para inserir variáveis exatamente onde a equipe
  // está digitando (e não só no fim). Atualizada via onSelectionChange.
  const [corpoSelecao, setCorpoSelecao] = useState({ start: 0, end: 0 });
  const [corpoFocado, setCorpoFocado] = useState(false);
  const [inseridaChave, setInseridaChave] = useState<string | null>(null);

  const indisponivel = isError && isConnectivityError(error) && !modelos;
  const salvando = criar.isPending || atualizar.isPending;

  const invalidarLista = () =>
    queryClient.invalidateQueries({ queryKey: getListarContratoModelosQueryKey() });

  function abrirNovo() {
    setEditando(null);
    setForm(VAZIO);
    setFormInicial(VAZIO);
    setCorpoSelecao({ start: 0, end: 0 });
    setCorpoFocado(false);
    setEditorAberto(true);
  }

  function abrirEdicao(m: ContratoModelo) {
    setEditando(m);
    const inicial: FormState = {
      tipo: m.tipo,
      procedimento: m.procedimento,
      titulo: m.titulo,
      corpo: m.corpo,
      vigente: m.vigente,
      observacoes: m.observacoes ?? "",
    };
    setForm(inicial);
    setFormInicial(inicial);
    setCorpoSelecao({ start: m.corpo.length, end: m.corpo.length });
    setCorpoFocado(false);
    setEditorAberto(true);
  }

  function fecharEditor() {
    if (salvando) return;
    setEditorAberto(false);
    setEditando(null);
    setForm(VAZIO);
    setFormInicial(VAZIO);
  }

  // Há edições não salvas enquanto o editor está aberto e algum campo difere do
  // snapshot capturado ao abrir. Passamos `dirty` direto ao guard (sem ref),
  // conforme a ressalva do React Compiler em useUnsavedChanges.
  const dirty =
    editorAberto &&
    (form.tipo !== formInicial.tipo ||
      form.procedimento !== formInicial.procedimento ||
      form.titulo !== formInicial.titulo ||
      form.corpo !== formInicial.corpo ||
      form.vigente !== formInicial.vigente ||
      form.observacoes !== formInicial.observacoes);

  const { guardNavigation, dialogProps } = useUnsavedChanges(dirty);

  const formValido =
    form.procedimento.trim() !== "" &&
    form.titulo.trim() !== "" &&
    form.corpo.trim() !== "";

  // Insere {{chave}} na posição do cursor (ou no fim, se o corpo não estiver em
  // foco). Espelha o seletor de variáveis do Console web — lá copia para a área
  // de transferência; aqui, mais útil no celular, insere direto no texto.
  function inserirVariavel(chave: string) {
    const token = `{{${chave}}}`;
    setForm((f) => {
      const usaCursor = corpoFocado;
      const inicio = usaCursor ? corpoSelecao.start : f.corpo.length;
      const fim = usaCursor ? corpoSelecao.end : f.corpo.length;
      const antes = f.corpo.slice(0, inicio);
      const depois = f.corpo.slice(fim);
      const novoCorpo = antes + token + depois;
      const cursor = inicio + token.length;
      setCorpoSelecao({ start: cursor, end: cursor });
      return { ...f, corpo: novoCorpo };
    });
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInseridaChave(chave);
    setTimeout(
      () => setInseridaChave((atual) => (atual === chave ? null : atual)),
      1400,
    );
  }

  async function salvar() {
    if (!formValido || salvando) return;
    const payload = {
      tipo: form.tipo,
      procedimento: form.procedimento.trim(),
      titulo: form.titulo.trim(),
      corpo: form.corpo,
      vigente: form.vigente,
      observacoes: form.observacoes.trim() || null,
    };
    try {
      if (editando) {
        await atualizar.mutateAsync({ id: editando.id, data: payload });
      } else {
        await criar.mutateAsync({ data: payload });
      }
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidarLista();
      setEditorAberto(false);
      setEditando(null);
      setForm(VAZIO);
      notify(
        editando
          ? {
              title: "Modelo atualizado",
              message: "Uma nova versão do modelo-base foi salva.",
            }
          : {
              title: "Modelo criado",
              message: "O modelo-base já pode ser usado para gerar contratos.",
            },
      );
    } catch (err) {
      notify(
        noticeErroEnvio(err, {
          title: "Não foi possível salvar",
          message: "Confira os campos obrigatórios e tente de novo.",
        }),
      );
    }
  }

  const onRemover = async (m: ContratoModelo) => {
    const ok = await confirm({
      title: "Remover este modelo?",
      message: `${m.titulo} (${m.procedimento}) não estará mais disponível para gerar novos contratos. Contratos já criados não são afetados.`,
      confirmText: "Remover",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRemovendoId(m.id);
    remover.mutate(
      { id: m.id },
      {
        onSuccess: () => {
          invalidarLista();
          if (Platform.OS !== "web")
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setRemovendoId(null);
          notify({
            title: "Modelo removido",
            message:
              "O modelo-base não estará mais disponível para novos contratos.",
          });
        },
        onError: (err: unknown) => {
          setRemovendoId(null);
          notify(
            noticeErroEnvio(err, {
              title: "Não foi possível remover",
              message: "Tente de novo em instantes.",
            }),
          );
        },
      },
    );
  };

  const onRestaurar = async (m: ContratoModelo) => {
    const ok = await confirm({
      title: "Restaurar ao modelo de fábrica?",
      message: `O texto atual de ${m.titulo} (${m.procedimento}) será substituído pelo modelo de fábrica mais recente. Qualquer edição feita pela equipe será perdida e o modelo ficará não vigente — revise e marque como vigente antes de gerar documentos. Contratos já criados não são afetados.`,
      confirmText: "Restaurar",
      cancelText: "Cancelar",
    });
    if (!ok) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRestaurandoId(m.id);
    restaurar.mutate(
      { id: m.id, data: { confirmar: true } },
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({
            queryKey: getListarContratoModelosQueryKey(),
          });
          if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          setRestaurandoId(null);
          notify({
            title: "Modelo restaurado",
            message:
              "O texto de fábrica voltou. Revise e marque como vigente antes de gerar documentos.",
          });
        },
        onError: (err: unknown) => {
          setRestaurandoId(null);
          notify(
            noticeErroEnvio(err, {
              title: "Não foi possível restaurar",
              message:
                "Este modelo pode ter sido criado manualmente (sem texto de fábrica). Tente de novo em instantes.",
            }),
          );
        },
      },
    );
  };

  const renderCard = (m: ContratoModelo) => {
    const restaurandoEste = restaurar.isPending && restaurandoId === m.id;
    const removendoEste = remover.isPending && removendoId === m.id;
    const ocupado = restaurandoEste || removendoEste;
    return (
      <View
        key={m.id}
        style={[styles.card, { borderColor: colors.card }]}
        testID={`modelo-${m.id}`}
      >
        <View style={styles.cardHead}>
          <Text style={[styles.cardProc, { color: colors.primary }]}>
            {m.procedimento.toUpperCase()}
          </Text>
          <Text style={[styles.cardVersao, { color: colors.mutedForeground }]}>
            v{m.versao}
          </Text>
          {!m.vigente ? (
            <View style={[styles.inativoBadge, { borderColor: colors.borderStrong }]}>
              <Text style={[styles.inativoText, { color: colors.mutedForeground }]}>
                INATIVO
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.cardTitulo, { color: colors.foreground }]}>
          {m.titulo}
        </Text>
        {m.observacoes ? (
          <Text
            style={[styles.cardObs, { color: colors.mutedForeground }]}
            numberOfLines={2}
          >
            {m.observacoes}
          </Text>
        ) : null}
        <View style={styles.cardActions}>
          <Pressable
            onPress={() => abrirEdicao(m)}
            disabled={ocupado}
            testID={`editar-${m.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Editar ${m.titulo}`}
            style={({ pressed }) => [
              styles.acaoBtn,
              { borderColor: colors.borderStrong, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Feather name="edit-3" size={14} color={colors.foreground} />
            <Text style={[styles.acaoText, { color: colors.foreground }]}>Editar</Text>
          </Pressable>
          <Pressable
            onPress={() => onRestaurar(m)}
            disabled={ocupado}
            testID={`restaurar-${m.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Restaurar ${m.titulo} ao modelo de fábrica`}
            style={({ pressed }) => [
              styles.acaoBtn,
              { borderColor: colors.borderStrong, opacity: pressed || restaurandoEste ? 0.6 : 1 },
            ]}
          >
            <Feather name="rotate-ccw" size={14} color={colors.primary} />
            <Text style={[styles.acaoText, { color: colors.foreground }]}>
              {restaurandoEste ? "Restaurando..." : "Restaurar"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onRemover(m)}
            disabled={ocupado}
            testID={`remover-${m.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Remover ${m.titulo}`}
            style={({ pressed }) => [
              styles.acaoIconBtn,
              { borderColor: colors.borderStrong, opacity: pressed || removendoEste ? 0.6 : 1 },
            ]}
          >
            <Feather name="trash-2" size={15} color={colors.destructive} />
          </Pressable>
        </View>
      </View>
    );
  };

  if (indisponivel) {
    return (
      <ConnectionError onRetry={() => refetch()} isRetrying={isLoading || isRefetching} />
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
          <Pressable onPress={() => router.back()} hitSlop={12} testID="voltar">
            <Feather name="arrow-left" size={22} color={colors.mutedForeground} />
          </Pressable>
          <View style={[styles.headerDivider, { backgroundColor: colors.card }]} />
          <Text style={[styles.headerBrand, { color: colors.mutedForeground }]}>
            MODELOS DE DOCUMENTO
          </Text>
        </View>
        <ThemeToggle />
      </View>

      {isLoading ? (
        <View style={[styles.center, { paddingTop: 80 }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: bottomPad }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.title, { color: colors.foreground }]}>
            Modelos-base de contrato e termo
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Cada procedimento tem um contrato-base e um termo de consentimento
            (TCLE) aprovados. Crie, edite ou remova modelos e use chaves entre{" "}
            <Text style={[styles.subtitleMono, { color: colors.primary }]}>{"{{ }}"}</Text>{" "}
            para os campos preenchidos automaticamente. Restaurar volta o modelo
            ao texto de fábrica mais recente — ele fica não vigente até você
            revisar.
          </Text>

          <Pressable
            onPress={abrirNovo}
            testID="novo-modelo"
            accessibilityRole="button"
            accessibilityLabel="Novo modelo"
            style={({ pressed }) => [
              styles.novoBtn,
              { backgroundColor: colors.ivory, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Feather name="plus" size={16} color={colors.ivoryForeground} />
            <Text style={[styles.novoText, { color: colors.ivoryForeground }]}>
              Novo modelo
            </Text>
          </Pressable>

          {isError ? (
            <View style={[styles.emptyBox, { borderColor: colors.card }]}>
              <Feather name="alert-triangle" size={22} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Não foi possível carregar os modelos.
              </Text>
              <Pressable onPress={() => refetch()} style={[styles.retryBtn, { borderColor: colors.borderStrong }]}>
                <Text style={[styles.retryText, { color: colors.foreground }]}>
                  Tentar novamente
                </Text>
              </Pressable>
            </View>
          ) : !modelos || modelos.length === 0 ? (
            <View style={[styles.emptyBox, { borderColor: colors.card }]}>
              <Feather name="file-text" size={22} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Nenhum modelo cadastrado ainda. Crie o primeiro modelo-base para
                começar a gerar contratos.
              </Text>
            </View>
          ) : (
            GRUPOS.map((grupo) => {
              const itens = modelos.filter((m) => m.tipo === grupo.tipo);
              if (itens.length === 0) return null;
              return (
                <View key={grupo.tipo} style={styles.grupo}>
                  <Text
                    style={[
                      styles.grupoTitulo,
                      { color: colors.mutedForeground, borderBottomColor: colors.card },
                    ]}
                  >
                    {grupo.titulo.toUpperCase()}
                  </Text>
                  {itens.map(renderCard)}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <Modal
        visible={editorAberto}
        animationType="slide"
        transparent={false}
        onRequestClose={() => guardNavigation(fecharEditor)}
      >
        <View style={[styles.screen, { backgroundColor: colors.background }]}>
          <View
            style={[
              styles.header,
              { paddingTop: topPad + 10, backgroundColor: colors.background, borderBottomColor: colors.card },
            ]}
          >
            <View style={styles.headerLeft}>
              <Pressable
                onPress={() => guardNavigation(fecharEditor)}
                hitSlop={12}
                testID="editor-cancelar"
              >
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </Pressable>
              <View style={[styles.headerDivider, { backgroundColor: colors.card }]} />
              <Text style={[styles.headerBrand, { color: colors.mutedForeground }]}>
                {editando ? "EDITAR MODELO" : "NOVO MODELO"}
              </Text>
            </View>
            <Pressable
              onPress={salvar}
              disabled={!formValido || salvando}
              testID="editor-salvar"
              accessibilityRole="button"
              accessibilityLabel={editando ? "Salvar nova versão" : "Criar modelo"}
              style={({ pressed }) => [
                styles.salvarBtn,
                {
                  backgroundColor: colors.ivory,
                  opacity: !formValido || salvando ? 0.45 : pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[styles.salvarText, { color: colors.ivoryForeground }]}>
                {salvando ? "Salvando..." : editando ? "Salvar" : "Criar"}
              </Text>
            </Pressable>
          </View>

          <KeyboardAwareScrollViewCompat
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 22, paddingBottom: bottomPad }}
            showsVerticalScrollIndicator={false}
            bottomOffset={20}
          >
            <Text style={[styles.editorTitle, { color: colors.foreground }]}>
              {editando ? "Editar modelo-base" : "Novo modelo-base"}
            </Text>
            <Text style={[styles.editorSub, { color: colors.mutedForeground }]}>
              {editando
                ? "Salvar gera uma nova versão do modelo. Contratos já criados não são afetados."
                : "Defina o procedimento, o título e o corpo. Toque numa variável abaixo para inseri-la no corpo."}
            </Text>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                TIPO DE DOCUMENTO
              </Text>
              <View style={styles.tipoRow}>
                {GRUPOS.map((g) => {
                  const ativo = form.tipo === g.tipo;
                  const desabilitado = !!editando;
                  return (
                    <Pressable
                      key={g.tipo}
                      onPress={() =>
                        !desabilitado && setForm((f) => ({ ...f, tipo: g.tipo }))
                      }
                      disabled={desabilitado}
                      testID={`tipo-${g.tipo}`}
                      style={[
                        styles.tipoChip,
                        {
                          borderColor: ativo ? colors.primary : colors.borderStrong,
                          backgroundColor: ativo ? colors.card : "transparent",
                          opacity: desabilitado && !ativo ? 0.4 : 1,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.tipoChipText,
                          { color: ativo ? colors.foreground : colors.mutedForeground },
                        ]}
                      >
                        {g.tipo === "contrato" ? "Contrato" : "Termo (TCLE)"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {editando ? (
                <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
                  O tipo não muda ao editar — crie um novo modelo para o outro tipo.
                </Text>
              ) : null}
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                PROCEDIMENTO
              </Text>
              <TextInput
                value={form.procedimento}
                onChangeText={(t) => setForm((f) => ({ ...f, procedimento: t }))}
                placeholder="Ex.: Blefaroplastia"
                placeholderTextColor={colors.mutedForeground}
                style={[
                  styles.input,
                  { borderColor: colors.borderStrong, color: colors.foreground, backgroundColor: colors.card },
                ]}
                autoCapitalize="words"
                testID="input-procedimento"
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                TÍTULO DO DOCUMENTO
              </Text>
              <TextInput
                value={form.titulo}
                onChangeText={(t) => setForm((f) => ({ ...f, titulo: t }))}
                placeholder="Ex.: Contrato de prestação de serviços — Blefaroplastia"
                placeholderTextColor={colors.mutedForeground}
                style={[
                  styles.input,
                  { borderColor: colors.borderStrong, color: colors.foreground, backgroundColor: colors.card },
                ]}
                autoCapitalize="sentences"
                testID="input-titulo"
              />
            </View>

            <View
              style={[styles.switchRow, { borderColor: colors.card, backgroundColor: colors.card }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.switchLabel, { color: colors.foreground }]}>
                  Modelo vigente
                </Text>
                <Text style={[styles.switchHint, { color: colors.mutedForeground }]}>
                  {form.vigente
                    ? "Disponível para gerar documentos."
                    : "Guardado, mas não aparece na geração."}
                </Text>
              </View>
              <Switch
                value={form.vigente}
                onValueChange={(v) => setForm((f) => ({ ...f, vigente: v }))}
                trackColor={{ false: colors.borderStrong, true: colors.primary }}
                thumbColor={colors.ivory}
                testID="switch-vigente"
              />
            </View>

            {variaveis && variaveis.length > 0 ? (
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                  VARIÁVEIS DISPONÍVEIS
                </Text>
                <Text style={[styles.fieldHint, { color: colors.mutedForeground, marginTop: 0, marginBottom: 10 }]}>
                  Toque para inserir a chave no corpo. Tudo que não for variável é
                  mantido exatamente como escrito.
                </Text>
                <View style={styles.variaveisWrap}>
                  {variaveis.map((v) => {
                    const inserida = inseridaChave === v.chave;
                    return (
                      <Pressable
                        key={v.chave}
                        onPress={() => inserirVariavel(v.chave)}
                        testID={`variavel-${v.chave}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Inserir variável ${v.chave}: ${v.descricao}`}
                        style={({ pressed }) => [
                          styles.variavelChip,
                          {
                            borderColor: inserida ? colors.primary : colors.borderStrong,
                            backgroundColor: colors.card,
                            opacity: pressed ? 0.7 : 1,
                          },
                        ]}
                      >
                        <Feather
                          name={inserida ? "check" : "plus"}
                          size={12}
                          color={colors.primary}
                        />
                        <Text style={[styles.variavelChave, { color: colors.primary }]}>
                          {`{{${v.chave}}}`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                CORPO DO DOCUMENTO
              </Text>
              <TextInput
                value={form.corpo}
                onChangeText={(t) => setForm((f) => ({ ...f, corpo: t }))}
                onSelectionChange={(e) => setCorpoSelecao(e.nativeEvent.selection)}
                onFocus={() => setCorpoFocado(true)}
                onBlur={() => setCorpoFocado(false)}
                placeholder={"CONTRATO DE PRESTAÇÃO DE SERVIÇOS MÉDICOS\n\nCONTRATANTE: {{nome}}, inscrita no CPF sob o nº {{cpf}}..."}
                placeholderTextColor={colors.mutedForeground}
                style={[
                  styles.corpoInput,
                  { borderColor: colors.borderStrong, color: colors.foreground, backgroundColor: colors.card },
                ]}
                multiline
                textAlignVertical="top"
                autoCapitalize="sentences"
                testID="input-corpo"
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
                OBSERVAÇÕES INTERNAS (OPCIONAL)
              </Text>
              <TextInput
                value={form.observacoes}
                onChangeText={(t) => setForm((f) => ({ ...f, observacoes: t }))}
                placeholder="Nota de uso interno — não aparece no contrato"
                placeholderTextColor={colors.mutedForeground}
                style={[
                  styles.input,
                  { borderColor: colors.borderStrong, color: colors.foreground, backgroundColor: colors.card },
                ]}
                autoCapitalize="sentences"
                testID="input-observacoes"
              />
            </View>
          </KeyboardAwareScrollViewCompat>
        </View>
        <DiscardChangesDialog {...dialogProps} />
      </Modal>
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
  subtitle: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 20 },
  subtitleMono: { fontFamily: fonts.mono, fontSize: 13 },

  novoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
    marginBottom: 28,
  },
  novoText: { fontFamily: fonts.sansMedium, fontSize: 15 },

  grupo: { marginBottom: 28 },
  grupoTitulo: {
    fontFamily: fonts.expanded,
    fontSize: 10,
    letterSpacing: 2,
    borderBottomWidth: 1,
    paddingBottom: 8,
    marginBottom: 12,
  },

  card: { borderWidth: 1, padding: 18, gap: 8, marginBottom: 10 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  cardProc: { fontFamily: fonts.expanded, fontSize: 10, letterSpacing: 2 },
  cardVersao: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1 },
  inativoBadge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  inativoText: { fontFamily: fonts.expanded, fontSize: 9, letterSpacing: 1.5 },
  cardTitulo: { fontFamily: fonts.serif, fontSize: 18, lineHeight: 24 },
  cardObs: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },

  cardActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  acaoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  acaoText: { fontFamily: fonts.sansMedium, fontSize: 13 },
  acaoIconBtn: {
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  salvarBtn: {
    paddingHorizontal: 18,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  salvarText: { fontFamily: fonts.sansMedium, fontSize: 14 },

  editorTitle: { fontFamily: fonts.serifLight, fontSize: 26, letterSpacing: -0.5 },
  editorSub: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, marginTop: 6, marginBottom: 24 },

  field: { marginBottom: 20 },
  fieldLabel: { fontFamily: fonts.expanded, fontSize: 10, letterSpacing: 1.5, marginBottom: 8 },
  fieldHint: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, marginTop: 8 },
  input: {
    height: 50,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontFamily: fonts.sans,
    fontSize: 16,
  },
  corpoInput: {
    minHeight: 240,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: fonts.mono,
    fontSize: 13,
    lineHeight: 20,
  },

  tipoRow: { flexDirection: "row", gap: 10 },
  tipoChip: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  tipoChipText: { fontFamily: fonts.sansMedium, fontSize: 14 },

  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  switchLabel: { fontFamily: fonts.sansMedium, fontSize: 15 },
  switchHint: { fontFamily: fonts.sans, fontSize: 12, marginTop: 3, lineHeight: 17 },

  variaveisWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  variavelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  variavelChave: { fontFamily: fonts.mono, fontSize: 12 },

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
});
