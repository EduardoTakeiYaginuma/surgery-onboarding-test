import {
  getListarPacientesQueryKey,
  getResumoPacientesQueryKey,
  isConnectivityError,
  useCriarPaciente,
  useListarMedicos,
  useObterConfig,
  useObterConteudoPadrao,
} from "@workspace/api-client-react";
import { mensagemServidor } from "@/lib/erros";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EstratosLogo } from "@/components/brand";
import { ConnectionError } from "@/components/connection-error";
import { DateTimeField } from "@/components/date-time-field";
import { DiscardChangesDialog } from "@/components/discard-changes-dialog";
import { PaginaPreview } from "@/components/secoes-preview";
import { ThemeToggle } from "@/components/theme-toggle";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { fonts } from "@/constants/fonts";
import { useColors } from "@/hooks/useColors";
import { ThemeScope } from "@/hooks/useTheme";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import {
  apenasDigitos,
  formatCpf,
  formatTelefone,
  isValidCpf,
  isValidTelefone,
} from "@/lib/format";
import {
  DADOS_PREVIEW_EXEMPLO,
  identidadeDoMedico,
  resolverSecoesPreview,
  type DadosPreview,
} from "@/lib/secoes-preview";

const WEB_TOP_INSET = 67;
const WEB_BOTTOM_INSET = 34;

/**
 * Sugestões de procedimentos comuns — atalho de digitação. O campo continua
 * livre; a secretária pode adicionar qualquer outro procedimento à mão.
 */
const PROCEDIMENTOS_SUGESTOES = [
  "Blefaroplastia Superior",
  "Blefaroplastia Inferior",
  "Cantopexia / Cantoplastia",
  "Temporal Lifting (Brow Lift)",
  "Lipoenxertia Facial",
  "Laser de CO2 Fracionado (Resurfacing)",
  "Correção de Ptose Palpebral",
];

const ETAPAS = [
  {
    chave: "paciente",
    titulo: "Paciente",
    descricao: "Quem é a paciente e como falamos com ela.",
  },
  {
    chave: "cirurgia",
    titulo: "Cirurgia",
    descricao: "Onde, quando e o que será feito.",
  },
  {
    chave: "pagamento",
    titulo: "Pagamento",
    descricao: "Valores e vencimento do saldo, se houver.",
  },
  {
    chave: "revisar",
    titulo: "Revisar",
    descricao: "Confira tudo antes de gerar o handoff.",
  },
] as const;

const ULTIMA_ETAPA = ETAPAS.length - 1;

function formatarDataBR(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function formatarMoeda(valor: number): string {
  return `R$ ${valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function NovoPaciente() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const criar = useCriarPaciente();
  const {
    data: config,
    isLoading: loadingConfig,
    isError: erroConfig,
    error: errorConfig,
    refetch: refetchConfig,
    isRefetching: refetchingConfig,
  } = useObterConfig();
  const { data: medicos } = useListarMedicos();
  const { data: conteudoPadrao } = useObterConteudoPadrao();
  const medicosAtivos = (medicos ?? []).filter((m) => m.ativo);
  const medicoPadraoId = medicosAtivos.find((m) => m.padrao)?.id ?? null;

  const topPad = Platform.OS === "web" ? WEB_TOP_INSET : insets.top;
  const bottomPad = (Platform.OS === "web" ? WEB_BOTTOM_INSET : insets.bottom) + 24;

  const [etapa, setEtapa] = useState(0);
  const [validar, setValidar] = useState(false);

  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [procedimentos, setProcedimentos] = useState<string[]>([]);
  const [procedimentoCustom, setProcedimentoCustom] = useState("");
  const [valorSinal, setValorSinal] = useState("");
  const [valorPendente, setValorPendente] = useState("");
  const [dataPagamentoPendente, setDataPagamentoPendente] = useState("");
  const [dataCirurgia, setDataCirurgia] = useState("");
  const [horario, setHorario] = useState("");
  const [laser, setLaser] = useState(false);
  const [local, setLocal] = useState("Avant Moema");
  const [equipeAnestesia, setEquipeAnestesia] = useState("Zenicare");
  const [equipeAnestesiaTelefone, setEquipeAnestesiaTelefone] = useState("(11) 95080-2525");
  // null = usar o médico padrão definido no Console (não conta como alteração).
  const [medicoId, setMedicoId] = useState<number | null>(null);
  const medicoSelecionadoId = medicoId ?? medicoPadraoId;

  const dirty =
    nome.trim() !== "" ||
    cpf !== "" ||
    telefone !== "" ||
    procedimentos.length > 0 ||
    procedimentoCustom.trim() !== "" ||
    valorSinal.trim() !== "" ||
    valorPendente.trim() !== "" ||
    dataPagamentoPendente.trim() !== "" ||
    dataCirurgia.trim() !== "" ||
    horario.trim() !== "" ||
    laser ||
    local !== "Avant Moema" ||
    equipeAnestesia !== "Zenicare" ||
    equipeAnestesiaTelefone !== "(11) 95080-2525" ||
    (medicoId !== null && medicoId !== medicoPadraoId);
  const { allowLeave, guardNavigation, dialogProps } = useUnsavedChanges(dirty);

  const configIndisponivel = erroConfig && isConnectivityError(errorConfig) && !config;
  const erroEnvioConexao = criar.isError && isConnectivityError(criar.error);

  const onHospital = (val: string) => {
    setLocal(val);
    const h = config?.hospitais.find((x) => x.chave === val);
    if (h?.sinalSugerido != null && valorSinal.trim() === "") {
      setValorSinal(String(h.sinalSugerido));
    }
  };

  const toggleProcedimento = (nome: string) => {
    setProcedimentos((prev) =>
      prev.includes(nome) ? prev.filter((n) => n !== nome) : [...prev, nome]
    );
  };
  const adicionarProcedimentoCustom = () => {
    const nome = procedimentoCustom.trim();
    if (!nome) return;
    setProcedimentos((prev) => (prev.includes(nome) ? prev : [...prev, nome]));
    setProcedimentoCustom("");
  };
  const removerProcedimento = (nome: string) => {
    setProcedimentos((prev) => prev.filter((n) => n !== nome));
  };

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const valorNumber = Number(valorSinal.replace(",", "."));
  const valorPendenteNumber =
    valorPendente.trim() === "" ? 0 : Number(valorPendente.replace(",", "."));
  const temPendente = valorPendenteNumber > 0;
  const errors = {
    nome: nome.trim().length === 0,
    cpf: !isValidCpf(cpf),
    telefone: !isValidTelefone(telefone),
    procedimentos: procedimentos.length === 0,
    valorSinal: !valorSinal || Number.isNaN(valorNumber) || valorNumber <= 0,
    valorPendente:
      valorPendente.trim() !== "" && (Number.isNaN(valorPendenteNumber) || valorPendenteNumber < 0),
    dataPagamentoPendente: temPendente && dataPagamentoPendente.trim() === "",
    dataCirurgia: dataCirurgia.trim() === "",
    horario: false,
  };

  const etapaTemErros = (i: number): boolean => {
    if (i === 0) return errors.nome || errors.cpf || errors.telefone;
    if (i === 1) return errors.procedimentos || errors.dataCirurgia;
    if (i === 2)
      return errors.valorSinal || errors.valorPendente || errors.dataPagamentoPendente;
    return false;
  };

  const hospitalNome =
    config?.hospitais.find((h) => h.chave === local)?.nome ?? local;
  // Equipe de anestesia é texto livre: nome e telefone vêm direto do formulário.
  const equipeNome = equipeAnestesia.trim() || DADOS_PREVIEW_EXEMPLO.equipe;
  const medicoNome =
    medicosAtivos.find((m) => m.id === medicoSelecionadoId)?.nome ?? "Padrão da clínica";

  // Prévia da página da paciente na etapa "Revisar": resolve o conteúdo padrão
  // (mesma fonte do api-server/Console web) com os valores digitados no
  // formulário. Campos ainda vazios caem no exemplo, espelhando o wizard web.
  const medicoRealNome = medicosAtivos.find(
    (m) => m.id === medicoSelecionadoId,
  )?.nome;
  const dadosPreviewNovo = useMemo<DadosPreview>(
    () => ({
      nome: nome.trim() || DADOS_PREVIEW_EXEMPLO.nome,
      dataCirurgia: dataCirurgia || DADOS_PREVIEW_EXEMPLO.dataCirurgia,
      horario: horario || DADOS_PREVIEW_EXEMPLO.horario,
      hospital: hospitalNome,
      local: hospitalNome,
      medica: medicoRealNome ?? DADOS_PREVIEW_EXEMPLO.medica,
      equipe: equipeNome,
      equipeTelefone: equipeAnestesiaTelefone.trim() || DADOS_PREVIEW_EXEMPLO.equipeTelefone,
      instrucoesChegada: DADOS_PREVIEW_EXEMPLO.instrucoesChegada,
      valorPago: Number.isFinite(valorNumber) ? valorNumber : 0,
      valorPendente: Number.isFinite(valorPendenteNumber) ? valorPendenteNumber : 0,
      dataPagamentoPendente: dataPagamentoPendente.trim() || null,
    }),
    [
      nome,
      dataCirurgia,
      horario,
      hospitalNome,
      equipeNome,
      equipeAnestesiaTelefone,
      medicoRealNome,
      valorNumber,
      valorPendenteNumber,
      dataPagamentoPendente,
    ],
  );
  const secoesPadrao = conteudoPadrao?.secoes ?? [];
  const secoesPreview = useMemo(
    () => resolverSecoesPreview(secoesPadrao, dadosPreviewNovo),
    [secoesPadrao, dadosPreviewNovo],
  );
  const temaPreview = config?.temaPadrao === "dark" ? "dark" : "light";

  // Cabeçalho de identidade da prévia: vem do médico selecionado (ou padrão da
  // clínica); sem médico cai no exemplo. Espelha a prévia do Console web.
  const identidadePreview = useMemo(
    () =>
      identidadeDoMedico(
        medicosAtivos.find((m) => m.id === medicoSelecionadoId),
      ),
    [medicosAtivos, medicoSelecionadoId],
  );

  const irParaEtapa = (i: number) => {
    if (i > etapa) return;
    setValidar(false);
    setEtapa(i);
  };

  const avancar = () => {
    if (etapaTemErros(etapa)) {
      setValidar(true);
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setValidar(false);
    setEtapa((e) => Math.min(e + 1, ULTIMA_ETAPA));
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const voltar = () => {
    setValidar(false);
    setEtapa((e) => Math.max(e - 1, 0));
  };

  const handleSubmit = () => {
    if (etapaTemErros(0) || etapaTemErros(1) || etapaTemErros(2)) {
      setValidar(true);
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    criar.mutate(
      {
        data: {
          nome: nome.trim(),
          cpf,
          telefone,
          procedimentos: procedimentos.map((p) => p.trim()).filter(Boolean),
          valorSinal: valorNumber,
          valorPendente: valorPendenteNumber,
          dataPagamentoPendente: temPendente && dataPagamentoPendente ? dataPagamentoPendente : null,
          dataCirurgia,
          horario: horario || undefined,
          laser,
          local,
          equipeAnestesia,
          equipeAnestesiaTelefone: equipeAnestesiaTelefone.trim() || null,
          medicoId: medicoSelecionadoId ?? undefined,
        },
      },
      {
        onSuccess: (detalhe) => {
          if (Platform.OS !== "web")
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          allowLeave();
          queryClient.invalidateQueries({ queryKey: getListarPacientesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getResumoPacientesQueryKey() });
          router.replace({ pathname: "/paciente/[id]", params: { id: detalhe.paciente.id } });
        },
      }
    );
  };

  if (configIndisponivel) {
    return <ConnectionError onRetry={() => refetchConfig()} isRetrying={loadingConfig || refetchingConfig} />;
  }

  const etapaAtual = ETAPAS[etapa];
  const ehRevisao = etapa === ULTIMA_ETAPA;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 10, borderBottomColor: colors.card }]}>
        <View style={styles.headerLeft}>
          <EstratosLogo size={20} />
          <Text style={[styles.headerTitle, { color: colors.mutedForeground }]}>NOVO HANDOFF</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <ThemeToggle />
          <Pressable onPress={() => guardNavigation(() => router.back())} hitSlop={12} testID="fechar">
            <Feather name="x" size={22} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      <View style={[styles.stepBar, { borderBottomColor: colors.card }]}>
        <StepIndicator etapa={etapa} onStepPress={irParaEtapa} />
      </View>

      <KeyboardAwareScrollViewCompat
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: bottomPad }}
        showsVerticalScrollIndicator={false}
        bottomOffset={20}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>{etapaAtual.titulo}</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {etapaAtual.descricao}
        </Text>

        {etapa === 0 ? (
          <>
            <Field label="Nome completo" error={validar && errors.nome} errorText="Informe o nome do paciente.">
              <TextInput
                value={nome}
                onChangeText={setNome}
                placeholder="Maria Silva"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, inputColors(colors, validar && errors.nome)]}
                autoCapitalize="words"
                testID="input-nome"
              />
            </Field>

            <Field label="CPF" error={validar && errors.cpf} errorText="Informe um CPF válido.">
              <TextInput
                value={formatCpf(cpf)}
                onChangeText={(t) => setCpf(apenasDigitos(t))}
                placeholder="000.000.000-00"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, styles.mono, inputColors(colors, validar && errors.cpf)]}
                keyboardType="number-pad"
                maxLength={14}
                testID="input-cpf"
              />
            </Field>

            <Field
              label="Telefone / WhatsApp"
              error={validar && errors.telefone}
              errorText="Informe um telefone válido com DDD."
            >
              <TextInput
                value={formatTelefone(telefone)}
                onChangeText={(t) => setTelefone(apenasDigitos(t))}
                placeholder="(11) 90000-0000"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, styles.mono, inputColors(colors, validar && errors.telefone)]}
                keyboardType="phone-pad"
                maxLength={15}
                testID="input-telefone"
              />
            </Field>
          </>
        ) : null}

        {etapa === 1 ? (
          <>
            <Field
              label="Procedimentos"
              error={validar && errors.procedimentos}
              errorText="Escolha ou descreva ao menos um procedimento."
            >
              <MultiChipGroup
                options={[
                  ...PROCEDIMENTOS_SUGESTOES,
                  ...(config?.procedimentos ?? [])
                    .map((p) => p.nome)
                    .filter((nome) => !PROCEDIMENTOS_SUGESTOES.includes(nome)),
                ].map((nome) => ({ value: nome, label: nome }))}
                selected={procedimentos}
                onToggle={toggleProcedimento}
              />
              <View style={styles.customRow}>
                <TextInput
                  value={procedimentoCustom}
                  onChangeText={setProcedimentoCustom}
                  onSubmitEditing={adicionarProcedimentoCustom}
                  placeholder="Outro procedimento"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, styles.customInput, inputColors(colors, false)]}
                  autoCapitalize="sentences"
                  returnKeyType="done"
                  testID="input-procedimento"
                />
                <Pressable
                  onPress={adicionarProcedimentoCustom}
                  style={[styles.addBtn, { borderColor: colors.borderStrong, backgroundColor: colors.card }]}
                  testID="add-procedimento"
                >
                  <Feather name="plus" size={18} color={colors.foreground} />
                </Pressable>
              </View>
              {procedimentos.length > 0 ? (
                <View style={styles.selectedChips}>
                  {procedimentos.map((nome) => (
                    <Pressable
                      key={nome}
                      onPress={() => removerProcedimento(nome)}
                      style={[styles.selectedChip, { backgroundColor: colors.card, borderColor: colors.primary }]}
                      testID={`procedimento-sel-${nome}`}
                    >
                      <Text style={[styles.selectedChipText, { color: colors.foreground }]}>{nome}</Text>
                      <Feather name="x" size={14} color={colors.mutedForeground} />
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </Field>

            <Field label="Hospital">
              <ChipGroup
                options={(config?.hospitais ?? []).map((h) => ({ value: h.chave, label: h.nome }))}
                value={local}
                onChange={onHospital}
              />
            </Field>

            <View style={styles.row}>
              <View style={styles.col}>
                <Field
                  label="Data da cirurgia"
                  error={validar && errors.dataCirurgia}
                  errorText="Escolha a data da cirurgia."
                >
                  <DateTimeField
                    mode="date"
                    value={dataCirurgia}
                    onChange={setDataCirurgia}
                    placeholder="Escolher data"
                    error={validar && errors.dataCirurgia}
                    minimumDate={hoje}
                    testID="input-data"
                  />
                </Field>
              </View>
              <View style={styles.col}>
                <Field label="Horário">
                  <DateTimeField
                    mode="time"
                    value={horario}
                    onChange={setHorario}
                    placeholder="Escolher hora"
                    testID="input-horario"
                  />
                </Field>
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.col}>
                <Field label="Equipe de anestesia">
                  <TextInput
                    value={equipeAnestesia}
                    onChangeText={setEquipeAnestesia}
                    placeholder="Zenicare"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.input, inputColors(colors, false)]}
                    autoCapitalize="words"
                    testID="input-equipe-anestesia"
                  />
                </Field>
              </View>
              <View style={styles.col}>
                <Field label="Telefone da anestesia">
                  <TextInput
                    value={equipeAnestesiaTelefone}
                    onChangeText={setEquipeAnestesiaTelefone}
                    placeholder="(11) 95080-2525"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.input, inputColors(colors, false)]}
                    keyboardType="phone-pad"
                    testID="input-equipe-anestesia-telefone"
                  />
                </Field>
              </View>
            </View>

            {medicosAtivos.length > 0 ? (
              <Field label="Médico responsável">
                <ChipGroup
                  options={medicosAtivos.map((m) => ({
                    value: String(m.id),
                    label: m.padrao ? `${m.nome} (padrão)` : m.nome,
                  }))}
                  value={medicoSelecionadoId != null ? String(medicoSelecionadoId) : ""}
                  onChange={(v) => setMedicoId(Number(v))}
                />
              </Field>
            ) : null}

            <View style={[styles.switchRow, { borderColor: colors.card, backgroundColor: colors.card }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.switchLabel, { color: colors.foreground }]}>Laser CO₂</Text>
                <Text style={[styles.switchHint, { color: colors.mutedForeground }]}>
                  Adiciona preparos e avisos específicos do laser.
                </Text>
              </View>
              <Switch
                value={laser}
                onValueChange={setLaser}
                trackColor={{ false: colors.borderStrong, true: colors.primary }}
                thumbColor={colors.ivory}
                testID="switch-laser"
              />
            </View>
          </>
        ) : null}

        {etapa === 2 ? (
          <>
            <Field
              label="Valor pago (R$)"
              error={validar && errors.valorSinal}
              errorText="Informe um valor maior que zero."
            >
              <TextInput
                value={valorSinal}
                onChangeText={setValorSinal}
                placeholder="1500"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, styles.mono, inputColors(colors, validar && errors.valorSinal)]}
                keyboardType="decimal-pad"
                testID="input-valor"
              />
            </Field>

            <Field
              label="Valor pendente (R$)"
              error={validar && errors.valorPendente}
              errorText="Use um valor igual ou maior que zero."
            >
              <TextInput
                value={valorPendente}
                onChangeText={setValorPendente}
                placeholder="0"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, styles.mono, inputColors(colors, validar && errors.valorPendente)]}
                keyboardType="decimal-pad"
                testID="input-valor-pendente"
              />
            </Field>

            {temPendente ? (
              <Field
                label="Vencimento do saldo"
                error={validar && errors.dataPagamentoPendente}
                errorText="Escolha o vencimento do saldo."
              >
                <DateTimeField
                  mode="date"
                  value={dataPagamentoPendente}
                  onChange={setDataPagamentoPendente}
                  placeholder="Escolher data"
                  error={validar && errors.dataPagamentoPendente}
                  minimumDate={hoje}
                  testID="input-data-pendente"
                />
              </Field>
            ) : null}
          </>
        ) : null}

        {ehRevisao ? (
          <View>
            <GrupoRevisao titulo="Paciente" onEditar={() => irParaEtapa(0)}>
              <LinhaRevisao rotulo="Nome" valor={nome.trim() || "—"} />
              <LinhaRevisao rotulo="CPF" valor={cpf ? formatCpf(cpf) : "—"} mono />
              <LinhaRevisao
                rotulo="Telefone"
                valor={telefone ? formatTelefone(telefone) : "—"}
                mono
              />
            </GrupoRevisao>

            <GrupoRevisao titulo="Cirurgia" onEditar={() => irParaEtapa(1)}>
              <LinhaRevisao rotulo="Hospital" valor={hospitalNome} />
              <LinhaRevisao
                rotulo="Procedimentos"
                valor={procedimentos.length > 0 ? procedimentos.join(", ") : "—"}
              />
              <LinhaRevisao
                rotulo="Data"
                valor={dataCirurgia ? formatarDataBR(dataCirurgia) : "—"}
                mono
              />
              <LinhaRevisao rotulo="Horário" valor={horario || "—"} mono />
              <LinhaRevisao rotulo="Equipe de anestesia" valor={equipeNome} />
              {medicosAtivos.length > 0 ? (
                <LinhaRevisao rotulo="Médico" valor={medicoNome} />
              ) : null}
              <LinhaRevisao rotulo="Laser CO₂" valor={laser ? "Sim" : "Não"} />
            </GrupoRevisao>

            <GrupoRevisao titulo="Pagamento" onEditar={() => irParaEtapa(2)}>
              <LinhaRevisao
                rotulo="Valor pago"
                valor={Number.isFinite(valorNumber) ? formatarMoeda(valorNumber) : "—"}
                mono
              />
              <LinhaRevisao
                rotulo="Valor pendente"
                valor={formatarMoeda(valorPendenteNumber)}
                mono
              />
              {temPendente ? (
                <LinhaRevisao
                  rotulo="Vencimento do saldo"
                  valor={dataPagamentoPendente ? formatarDataBR(dataPagamentoPendente) : "—"}
                  mono
                />
              ) : null}
            </GrupoRevisao>

            <GrupoRevisao titulo="Página da paciente">
              <Text style={[styles.previewHint, { color: colors.mutedForeground }]}>
                É exatamente isto que a paciente verá ao abrir o link.
              </Text>
              <View style={[styles.previewFrame, { borderColor: colors.card }]}>
                {secoesPreview.length > 0 ? (
                  <ThemeScope theme={temaPreview}>
                    <PaginaPreview secoes={secoesPreview} identidade={identidadePreview} />
                  </ThemeScope>
                ) : (
                  <Text style={[styles.previewEmpty, { color: colors.mutedForeground }]}>
                    Nenhum conteúdo configurado para a página.
                  </Text>
                )}
              </View>
            </GrupoRevisao>

            {erroEnvioConexao ? (
              <View style={[styles.errorBanner, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}>
                <Feather name="wifi-off" size={16} color={colors.mutedForeground} />
                <View style={{ flex: 1, gap: 10 }}>
                  <Text style={[styles.errorBannerText, { color: colors.foreground }]}>
                    Sem conexão com o servidor. Nada foi perdido — toque para tentar enviar novamente.
                  </Text>
                  <Pressable
                    onPress={handleSubmit}
                    disabled={criar.isPending}
                    style={[styles.retryInline, { borderColor: colors.borderStrong }]}
                    testID="reenviar"
                  >
                    <Feather name="refresh-cw" size={14} color={colors.foreground} />
                    <Text style={[styles.retryInlineText, { color: colors.foreground }]}>
                      Tentar novamente
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : criar.isError ? (
              <View style={[styles.errorBanner, { backgroundColor: "rgba(122,31,31,0.25)", borderColor: colors.destructive }]}>
                <Feather name="alert-triangle" size={16} color={colors.destructiveForeground} />
                <Text style={[styles.errorBannerText, { color: colors.destructiveForeground }]}>
                  {mensagemServidor(criar.error) ?? "Não foi possível registrar o paciente. Verifique os dados e tente novamente."}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </KeyboardAwareScrollViewCompat>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: (Platform.OS === "web" ? WEB_BOTTOM_INSET : insets.bottom) + 14,
            borderTopColor: colors.card,
            backgroundColor: colors.background,
          },
        ]}
      >
        {etapa > 0 ? (
          <Pressable
            onPress={voltar}
            disabled={criar.isPending}
            testID="voltar"
            style={({ pressed }) => [
              styles.navBtn,
              styles.navBtnGhost,
              { borderColor: colors.borderStrong, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.navBtnGhostText, { color: colors.foreground }]}>Voltar</Text>
          </Pressable>
        ) : null}

        {ehRevisao ? (
          <Pressable
            onPress={handleSubmit}
            disabled={criar.isPending}
            testID="salvar"
            style={({ pressed }) => [
              styles.navBtn,
              { backgroundColor: colors.ivory, opacity: pressed || criar.isPending ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.navBtnText, { color: colors.ivoryForeground }]}>
              {criar.isPending ? "Gerando handoff..." : "Registrar e gerar handoff"}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={avancar}
            testID="avancar"
            style={({ pressed }) => [
              styles.navBtn,
              { backgroundColor: colors.ivory, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.navBtnText, { color: colors.ivoryForeground }]}>Avançar</Text>
          </Pressable>
        )}
      </View>

      <DiscardChangesDialog {...dialogProps} />
    </View>
  );
}

function inputColors(colors: ReturnType<typeof useColors>, error: boolean) {
  return {
    backgroundColor: colors.card,
    color: colors.foreground,
    borderColor: error ? colors.destructive : colors.borderStrong,
  };
}

function StepIndicator({
  etapa,
  onStepPress,
}: {
  etapa: number;
  onStepPress: (i: number) => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.stepRow} accessibilityLabel="Progresso do cadastro">
      {ETAPAS.map((e, i) => {
        const done = i < etapa;
        const current = i === etapa;
        const clickable = i < etapa;
        const corLinha = done ? colors.primary : colors.borderStrong;
        const corDiamante = current
          ? colors.primary
          : done
            ? colors.primary
            : colors.borderStrong;
        const corNumero = current || done ? colors.primary : colors.mutedForeground;
        const corTitulo = current
          ? colors.foreground
          : done
            ? colors.mutedForeground
            : colors.mutedForeground;
        return (
          <React.Fragment key={e.chave}>
            <Pressable
              disabled={!clickable}
              onPress={() => clickable && onStepPress(i)}
              style={styles.stepItem}
              testID={`step-${e.chave}`}
            >
              <View style={[styles.diamond, { borderColor: corDiamante }]}>
                <Text style={[styles.diamondNum, { color: corNumero }]}>{i + 1}</Text>
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  { color: corTitulo, opacity: current || done ? 1 : 0.55 },
                ]}
              >
                {e.titulo}
              </Text>
            </Pressable>
            {i < ETAPAS.length - 1 ? (
              <View style={[styles.stepLine, { backgroundColor: corLinha }]} />
            ) : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

function GrupoRevisao({
  titulo,
  onEditar,
  children,
}: {
  titulo: string;
  onEditar?: () => void;
  children: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={styles.grupoRevisao}>
      <View style={styles.grupoHeader}>
        <Text style={[styles.grupoTitulo, { color: colors.primary }]}>{titulo.toUpperCase()}</Text>
        <View style={[styles.grupoLinha, { backgroundColor: colors.borderStrong }]} />
        {onEditar ? (
          <Pressable onPress={onEditar} hitSlop={10} testID={`editar-${titulo.toLowerCase()}`}>
            <Text style={[styles.grupoEditar, { color: colors.mutedForeground }]}>Editar</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={[styles.grupoCard, { backgroundColor: colors.card }]}>{children}</View>
    </View>
  );
}

function LinhaRevisao({
  rotulo,
  valor,
  mono,
}: {
  rotulo: string;
  valor: string;
  mono?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={styles.linhaRevisao}>
      <Text style={[styles.linhaRotulo, { color: colors.mutedForeground }]}>{rotulo}</Text>
      <Text
        style={[
          styles.linhaValor,
          { color: colors.foreground, fontFamily: mono ? fonts.mono : fonts.sans },
        ]}
      >
        {valor}
      </Text>
    </View>
  );
}

function ChipGroup({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const colors = useColors();
  if (options.length === 0) return null;
  return (
    <View style={styles.chips}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.chip,
              {
                backgroundColor: selected ? colors.ivory : colors.card,
                borderColor: selected ? colors.ivory : colors.borderStrong,
              },
            ]}
            testID={`chip-${opt.value}`}
          >
            <Text
              style={[
                styles.chipText,
                {
                  color: selected ? colors.ivoryForeground : colors.mutedForeground,
                  fontFamily: selected ? fonts.sansMedium : fonts.sans,
                },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MultiChipGroup({
  options,
  selected,
  onToggle,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const colors = useColors();
  if (options.length === 0) return null;
  return (
    <View style={styles.chips}>
      {options.map((opt) => {
        const isSelected = selected.includes(opt.value);
        return (
          <Pressable
            key={opt.value}
            onPress={() => onToggle(opt.value)}
            style={[
              styles.chip,
              {
                backgroundColor: isSelected ? colors.ivory : colors.card,
                borderColor: isSelected ? colors.ivory : colors.borderStrong,
              },
            ]}
            testID={`chip-procedimento-${opt.value}`}
          >
            <Text
              style={[
                styles.chipText,
                {
                  color: isSelected ? colors.ivoryForeground : colors.mutedForeground,
                  fontFamily: isSelected ? fonts.sansMedium : fonts.sans,
                },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Field({
  label,
  error,
  errorText,
  children,
}: {
  label: string;
  error?: boolean;
  errorText?: string;
  children: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label.toUpperCase()}</Text>
      {children}
      {error && errorText ? (
        <Text style={[styles.fieldError, { color: colors.primary }]}>{errorText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerTitle: { fontFamily: fonts.expanded, fontSize: 12, letterSpacing: 2.5 },

  stepBar: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  stepRow: { flexDirection: "row", alignItems: "center" },
  stepItem: { flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 0 },
  diamond: {
    width: 22,
    height: 22,
    borderWidth: 1,
    transform: [{ rotate: "45deg" }],
    alignItems: "center",
    justifyContent: "center",
  },
  diamondNum: {
    transform: [{ rotate: "-45deg" }],
    fontFamily: fonts.mono,
    fontSize: 11,
  },
  stepLabel: {
    fontFamily: fonts.expanded,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  stepLine: { height: 1, flex: 1, marginHorizontal: 8 },

  title: { fontFamily: fonts.serifLight, fontSize: 30, letterSpacing: -0.5 },
  subtitle: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, marginTop: 6, marginBottom: 28 },

  field: { marginBottom: 20 },
  fieldLabel: { fontFamily: fonts.expanded, fontSize: 10, letterSpacing: 1.5, marginBottom: 8 },
  input: {
    height: 50,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontFamily: fonts.sans,
    fontSize: 16,
  },
  mono: { fontFamily: fonts.mono, fontSize: 15 },
  fieldError: { fontFamily: fonts.sans, fontSize: 12, marginTop: 6 },

  row: { flexDirection: "row", gap: 12 },
  col: { flex: 1 },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1 },
  chipText: { fontSize: 14 },

  customRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  customInput: { flex: 1 },
  addBtn: {
    width: 50,
    height: 50,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  selectedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  selectedChipText: { fontFamily: fonts.sans, fontSize: 14 },

  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    padding: 16,
    marginTop: 4,
    marginBottom: 12,
  },
  switchLabel: { fontFamily: fonts.sansMedium, fontSize: 15 },
  switchHint: { fontFamily: fonts.sans, fontSize: 12, marginTop: 3, lineHeight: 17 },

  grupoRevisao: { marginBottom: 24 },
  grupoHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  grupoTitulo: { fontFamily: fonts.expanded, fontSize: 10, letterSpacing: 1.5 },
  grupoLinha: { height: 1, flex: 1 },
  grupoEditar: { fontFamily: fonts.sansMedium, fontSize: 12 },
  grupoCard: { borderWidth: 0, paddingHorizontal: 16, paddingVertical: 4 },
  previewHint: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, paddingVertical: 10 },
  previewFrame: { borderWidth: 1, marginBottom: 12, overflow: "hidden" },
  previewEmpty: { fontFamily: fonts.sans, fontSize: 13, padding: 16 },
  linhaRevisao: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 12,
  },
  linhaRotulo: { fontFamily: fonts.sans, fontSize: 13, flexShrink: 0, maxWidth: "45%" },
  linhaValor: { fontSize: 14, flex: 1, textAlign: "right" },

  errorBanner: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, padding: 14, marginBottom: 4 },
  errorBannerText: { fontFamily: fonts.sans, fontSize: 13, flex: 1, lineHeight: 19 },
  retryInline: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retryInlineText: { fontFamily: fonts.sansMedium, fontSize: 13 },

  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  navBtn: {
    flex: 1,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  navBtnText: { fontFamily: fonts.sansMedium, fontSize: 16 },
  navBtnGhost: { borderWidth: 1, backgroundColor: "transparent" },
  navBtnGhostText: { fontFamily: fonts.sansMedium, fontSize: 16 },
});
