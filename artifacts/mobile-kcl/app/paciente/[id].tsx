import {
  getListarDocumentosQueryKey,
  getListarPacientesArquivadosQueryKey,
  getListarPacientesQueryKey,
  getListarTimelineQueryKey,
  getObterConteudoPacienteQueryKey,
  getObterPacienteQueryKey,
  getObterPaginaPacienteQueryKey,
  getResumoPacientesQueryKey,
  useAdicionarNota,
  useAprovarPaciente,
  useArquivarPaciente,
  useListarDocumentos,
  useListarMedicos,
  useListarTimeline,
  useMarcarMarcoManual,
  useObterConfig,
  useObterConteudoPaciente,
  useObterPaciente,
  useObterPaginaPaciente,
  useAtualizarPaciente,
  useRegistrarDocumento,
  useRemoverDocumento,
  useRestaurarPaciente,
  isConnectivityError,
  type DocumentoPaciente,
  type MarcoManualEntradaMarco,
  type PacienteContratoStatus,
  type PacienteTermoStatus,
  type PacienteUpdate,
  type SecaoConteudo,
} from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EstratosLogo, MarcoBadge } from "@/components/brand";
import { ConnectionError } from "@/components/connection-error";
import { DateTimeField } from "@/components/date-time-field";
import { DiscardChangesDialog } from "@/components/discard-changes-dialog";
import { PaginaPreviewSimulada } from "@/components/pagina-preview-simulada";
import { ThemeToggle } from "@/components/theme-toggle";
import { fonts } from "@/constants/fonts";
import { useColors } from "@/hooks/useColors";
import { useDialogs } from "@/hooks/useDialogs";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { noticeErroEnvio } from "@/lib/erros";
import { formatDate, formatDateTime } from "@/lib/format";
import { identidadeDaPaciente } from "@/lib/secoes-preview";
import { carimboDoMarco } from "@/lib/jornada-equipe";

const TIPO_PDF = "application/pdf";
const TAMANHO_MAXIMO_DOC = 20 * 1024 * 1024;

function formatarTamanhoDoc(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatarMoeda(valor: number): string {
  return `R$ ${valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function descreverContrato(
  status: PacienteContratoStatus,
  assinadoEm: string | null,
): string {
  switch (status) {
    case "assinado":
      return assinadoEm ? `Assinado em ${formatDate(assinadoEm)}` : "Assinado";
    case "pendente":
      return "Aguardando assinatura";
    case "recusado":
      return "Assinatura recusada";
    case "indisponivel":
      return "Status indisponível no momento";
    default:
      return "Sem contrato vinculado";
  }
}

function descreverTermo(
  status: PacienteTermoStatus,
  assinadoEm: string | null,
): string {
  switch (status) {
    case "assinado":
      return assinadoEm ? `Assinado em ${formatDate(assinadoEm)}` : "Assinado";
    case "pendente":
      return "Aguardando assinatura";
    case "recusado":
      return "Assinatura recusada";
    case "indisponivel":
      return "Status indisponível no momento";
    default:
      return "Sem termo vinculado";
  }
}

const WEB_TOP_INSET = 67;
const WEB_BOTTOM_INSET = 34;

export default function ConsolePaciente() {
  const colors = useColors();
  const { confirm, notify } = useDialogs();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);

  const topPad = Platform.OS === "web" ? WEB_TOP_INSET : insets.top;
  const bottomPad = (Platform.OS === "web" ? WEB_BOTTOM_INSET : insets.bottom) + 32;

  const { data, isLoading, isError, error, refetch, isRefetching } = useObterPaciente(id, {
    query: { enabled: !!id, queryKey: getObterPacienteQueryKey(id) },
  });
  const { data: timeline, isLoading: loadingTimeline } = useListarTimeline(id, {
    query: { enabled: !!id, queryKey: getListarTimelineQueryKey(id) },
  });
  const aprovar = useAprovarPaciente();
  const arquivar = useArquivarPaciente();
  const restaurar = useRestaurarPaciente();
  const adicionarNota = useAdicionarNota();
  const atualizarPaciente = useAtualizarPaciente();
  const { data: config } = useObterConfig();
  const marcarMarco = useMarcarMarcoManual();

  const documentosQuery = useListarDocumentos(id, {
    query: { enabled: !!id, queryKey: getListarDocumentosQueryKey(id) },
  });
  const documentos = (documentosQuery.data ?? []) as DocumentoPaciente[];
  const registrarDocumento = useRegistrarDocumento();
  const removerDocumento = useRemoverDocumento();
  const [enviandoDocumento, setEnviandoDocumento] = useState(false);
  const [documentoAcao, setDocumentoAcao] = useState<string | null>(null);

  const tokenPublico = data?.paciente.tokenPublico ?? "";
  const { data: pagina, isLoading: loadingPagina } = useObterPaginaPaciente(tokenPublico, {
    query: { enabled: !!tokenPublico, queryKey: getObterPaginaPacienteQueryKey(tokenPublico) },
  });
  const { data: conteudo } = useObterConteudoPaciente(id, {
    query: { enabled: !!id, queryKey: getObterConteudoPacienteQueryKey(id) },
  });
  // Inclui inativos para que a foto/logo do médico ligado à paciente apareça
  // mesmo se ele estiver inativo — igual ao Console web e à página pública.
  const { data: medicos } = useListarMedicos({ incluirInativos: true });

  // Cabeçalho de identidade da prévia: nome/CRM/RQE/clínica do registro da
  // paciente; foto/logo do médico ligado a ela (resolvido por id, incluindo
  // inativos), espelhando a prévia do Console web.
  const identidade = React.useMemo(() => {
    if (!data) return undefined;
    const medico = (medicos ?? []).find((m) => m.id === data.paciente.medicoId);
    return identidadeDaPaciente(data.paciente, medico);
  }, [data, medicos]);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [paginaOpen, setPaginaOpen] = useState(false);
  const [notaTitulo, setNotaTitulo] = useState("");
  const [notaDescricao, setNotaDescricao] = useState("");

  const [termoLinkInput, setTermoLinkInput] = useState("");
  const [termoLinkManualInput, setTermoLinkManualInput] = useState("");
  const [termoPrazoOverrideInput, setTermoPrazoOverrideInput] = useState("");
  const [termoBaixando, setTermoBaixando] = useState<null | "abrir" | "baixar">(null);

  const [valorSinalInput, setValorSinalInput] = useState("");
  const [valorPendenteInput, setValorPendenteInput] = useState("");
  const [dataPagamentoPendenteInput, setDataPagamentoPendenteInput] = useState("");
  const [pagamentoValidar, setPagamentoValidar] = useState(false);

  const termoAutentiqueId = data?.paciente.termoAutentiqueId ?? "";
  const termoLinkAssinaturaManual = data?.paciente.termoLinkAssinaturaManual ?? "";
  const termoPrazoOverride = data?.paciente.termoPrazoOverride ?? "";
  useEffect(() => {
    setTermoLinkInput(termoAutentiqueId);
  }, [termoAutentiqueId]);
  useEffect(() => {
    setTermoLinkManualInput(termoLinkAssinaturaManual);
  }, [termoLinkAssinaturaManual]);
  useEffect(() => {
    setTermoPrazoOverrideInput(termoPrazoOverride);
  }, [termoPrazoOverride]);

  const valorSinalServer = data?.paciente.valorSinal ?? 0;
  const valorPendenteServer = data?.paciente.valorPendente ?? 0;
  const dataPagamentoPendenteServer = data?.paciente.dataPagamentoPendente ?? "";
  useEffect(() => {
    setValorSinalInput(String(valorSinalServer));
  }, [valorSinalServer]);
  useEffect(() => {
    setValorPendenteInput(String(valorPendenteServer));
  }, [valorPendenteServer]);
  useEffect(() => {
    setDataPagamentoPendenteInput(dataPagamentoPendenteServer);
  }, [dataPagamentoPendenteServer]);

  const notaDirty = notaTitulo.trim() !== "" || notaDescricao.trim() !== "";
  const { allowLeave, guardNavigation, dialogProps } = useUnsavedChanges(notaDirty, {
    message:
      "Você começou uma nota que ainda não foi adicionada. Se sair agora, ela será perdida.",
  });

  const invalidarPaciente = () => {
    queryClient.invalidateQueries({ queryKey: getObterPacienteQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListarPacientesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListarPacientesArquivadosQueryKey() });
    queryClient.invalidateQueries({ queryKey: getResumoPacientesQueryKey() });
  };

  const handleAdicionarNota = () => {
    const titulo = notaTitulo.trim();
    if (!titulo || adicionarNota.isPending) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    adicionarNota.mutate(
      { id, data: { titulo, descricao: notaDescricao.trim() || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListarTimelineQueryKey(id) });
          setNotaTitulo("");
          setNotaDescricao("");
        },
        onError: (error) => {
          notify(
            noticeErroEnvio(error, {
              title: "Não foi possível adicionar a nota",
              message: "Tente novamente em instantes.",
            }),
          );
        },
      }
    );
  };

  const mutarCamposTermo = (patch: PacienteUpdate, mensagem: string) => {
    if (atualizarPaciente.isPending) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    atualizarPaciente.mutate(
      { id, data: patch },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getObterPacienteQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListarPacientesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getResumoPacientesQueryKey() });
          notify({ title: mensagem });
        },
        onError: (error) => {
          notify(
            noticeErroEnvio(error, {
              title: "Não foi possível salvar o termo",
              message: "Tente novamente em instantes.",
            }),
          );
        },
      }
    );
  };

  const mutarTermo = (link: string | null, mensagem: string) =>
    mutarCamposTermo({ termoLink: link }, mensagem);

  const handleSalvarPagamento = async () => {
    const sinalNum = Number(valorSinalInput.replace(",", "."));
    const pendenteNum = valorPendenteInput.trim() === "" ? 0 : Number(valorPendenteInput.replace(",", "."));
    const temPendente = pendenteNum > 0;
    const erroSinal = !valorSinalInput || Number.isNaN(sinalNum) || sinalNum <= 0;
    const erroPendente = valorPendenteInput.trim() !== "" && (Number.isNaN(pendenteNum) || pendenteNum < 0);
    const erroData = temPendente && dataPagamentoPendenteInput.trim() === "";
    if (erroSinal || erroPendente || erroData) {
      setPagamentoValidar(true);
      return;
    }
    if (atualizarPaciente.isPending) return;

    // Guard against accidentally lowering the recorded paid amount — this could
    // silently understate how much the patient has already paid.
    if (valorSinalServer > 0 && sinalNum < valorSinalServer) {
      const ok = await confirm({
        title: "Reduzir o valor pago?",
        message: `O valor pago registrado é ${formatarMoeda(valorSinalServer)}. Você está prestes a reduzi-lo para ${formatarMoeda(sinalNum)}. Confirme se isso está correto.`,
        confirmText: "Reduzir mesmo assim",
        cancelText: "Cancelar",
        destructive: true,
      });
      if (!ok) return;
    }

    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    atualizarPaciente.mutate(
      {
        id,
        data: {
          valorSinal: sinalNum,
          valorPendente: pendenteNum,
          dataPagamentoPendente: temPendente ? dataPagamentoPendenteInput : null,
        },
      },
      {
        onSuccess: () => {
          setPagamentoValidar(false);
          invalidarPaciente();
          notify({ title: "Pagamento atualizado" });
        },
        onError: (error) => {
          notify(
            noticeErroEnvio(error, {
              title: "Não foi possível salvar o pagamento",
              message: "Tente novamente em instantes.",
            }),
          );
        },
      }
    );
  };

  const acessarTermo = async (modo: "abrir" | "baixar") => {
    if (termoBaixando) return;
    setTermoBaixando(modo);
    try {
      const base = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
      const url = `${base}/api/pacientes/${id}/termo/download${modo === "baixar" ? "?download=1" : ""}`;
      await Linking.openURL(url);
    } catch {
      notify({
        title: "Termo indisponível no momento",
        message: "Não foi possível abrir o documento assinado. Tente novamente em instantes.",
      });
    } finally {
      setTermoBaixando(null);
    }
  };

  const handleArquivar = async () => {
    const run = () => {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      arquivar.mutate(
        { id },
        {
          onSuccess: () => {
            allowLeave();
            invalidarPaciente();
            router.back();
          },
          onError: (error) => {
            notify(
              noticeErroEnvio(error, {
                title: "Não foi possível arquivar",
                message: "Tente novamente em instantes.",
              }),
            );
          },
        }
      );
    };
    const ok = await confirm({
      title: "Arquivar processo?",
      message: `O processo de ${data?.paciente.nome ?? "esta paciente"} sairá da lista de ativos, mas nada será apagado. Você pode restaurá-lo a qualquer momento.`,
      confirmText: "Arquivar",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (ok) run();
  };

  const handleRestaurar = () => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    restaurar.mutate(
      { id },
      {
        onSuccess: () => {
          invalidarPaciente();
        },
        onError: (error) => {
          notify(
            noticeErroEnvio(error, {
              title: "Não foi possível restaurar",
              message: "Tente novamente em instantes.",
            }),
          );
        },
      }
    );
  };

  const handleCopy = async (text: string, key: string) => {
    await Clipboard.setStringAsync(text);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCopiedId(key);
    setTimeout(() => setCopiedId((c) => (c === key ? null : c)), 2000);
  };

  const handleShare = async (message: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await Share.share({ message });
    } catch {
      // user dismissed the share sheet — no-op
    }
  };

  const handleAprovar = () => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    aprovar.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getObterPacienteQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListarPacientesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getResumoPacientesQueryKey() });
        },
        onError: (error) => {
          notify(
            noticeErroEnvio(error, {
              title: "Não foi possível aprovar",
              message: "Tente novamente em instantes.",
            }),
          );
        },
      }
    );
  };

  const handleMarcarMarco = (marco: MarcoManualEntradaMarco, concluido: boolean) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    marcarMarco.mutate(
      { id, data: { marco, concluido } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getObterPacienteQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListarPacientesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getResumoPacientesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListarTimelineQueryKey(id) });
        },
        onError: (error) => {
          notify(
            noticeErroEnvio(error, {
              title: "Não foi possível atualizar o marco",
              message: "Tente novamente em instantes.",
            }),
          );
        },
      },
    );
  };

  const handleAnexarDocumento = async () => {
    if (enviandoDocumento) return;
    const picked = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    const nomeArquivo = asset.name || "documento.pdf";
    const tamanho = asset.size ?? 0;

    const ehPdf =
      asset.mimeType === TIPO_PDF || /\.pdf$/i.test(nomeArquivo);
    if (!ehPdf) {
      notify({ title: "Formato não aceito", message: "Envie apenas arquivos PDF." });
      return;
    }
    if (tamanho > TAMANHO_MAXIMO_DOC) {
      notify({ title: "Arquivo muito grande", message: "O limite é de 20 MB por documento." });
      return;
    }

    setEnviandoDocumento(true);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      // Fluxo de upload por URL pré-assinada — espelha @workspace/object-storage-web (web).
      const base = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
      const urlResp = await fetch(`${base}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nomeArquivo, size: tamanho, contentType: TIPO_PDF }),
      });
      if (!urlResp.ok) throw new Error("Falha ao preparar o envio.");
      const { uploadURL, objectPath } = (await urlResp.json()) as {
        uploadURL: string;
        objectPath: string;
      };

      const fileResp = await fetch(asset.uri);
      const blob = await fileResp.blob();
      const putResp = await fetch(uploadURL, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": TIPO_PDF },
      });
      if (!putResp.ok) throw new Error("Falha no envio do arquivo.");

      await new Promise<void>((resolve, reject) => {
        registrarDocumento.mutate(
          {
            id,
            data: {
              objectPath,
              rotulo: nomeArquivo.replace(/\.pdf$/i, ""),
              nomeArquivo,
              contentType: TIPO_PDF,
              tamanho,
            },
          },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getListarDocumentosQueryKey(id) });
              queryClient.invalidateQueries({ queryKey: getObterPacienteQueryKey(id) });
              queryClient.invalidateQueries({ queryKey: getListarTimelineQueryKey(id) });
              if (Platform.OS !== "web")
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              resolve();
            },
            onError: (error) => reject(error),
          }
        );
      });
    } catch (error) {
      notify(
        noticeErroEnvio(error, {
          title: "Não foi possível anexar o documento",
          message: "Tente novamente em instantes.",
        }),
      );
    } finally {
      setEnviandoDocumento(false);
    }
  };

  const handleAbrirDocumento = async (doc: DocumentoPaciente) => {
    if (documentoAcao) return;
    setDocumentoAcao(`${doc.id}:abrir`);
    try {
      const base = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
      const url = `${base}/api/pacientes/${id}/documentos/${doc.id}/download`;
      await Linking.openURL(url);
    } catch {
      notify({ title: "Não foi possível abrir o documento", message: "Tente novamente em instantes." });
    } finally {
      setDocumentoAcao(null);
    }
  };

  const handleRemoverDocumento = async (doc: DocumentoPaciente) => {
    const run = () => {
      setDocumentoAcao(`${doc.id}:remover`);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      removerDocumento.mutate(
        { id, documentoId: doc.id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListarDocumentosQueryKey(id) });
            queryClient.invalidateQueries({ queryKey: getObterPacienteQueryKey(id) });
            queryClient.invalidateQueries({ queryKey: getListarTimelineQueryKey(id) });
          },
          onError: (error) => {
            notify(
              noticeErroEnvio(error, {
                title: "Não foi possível remover",
                message: "Tente novamente em instantes.",
              }),
            );
          },
          onSettled: () => setDocumentoAcao(null),
        }
      );
    };
    const ok = await confirm({
      title: "Remover documento?",
      message: `"${doc.rotulo}" deixará de aparecer para a paciente. O arquivo será apagado.`,
      confirmText: "Remover",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (ok) run();
  };

  const Header = (
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
        <Text style={[styles.headerBrand, { color: colors.mutedForeground }]}>CONSOLE</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <ThemeToggle />
        {data ? (
          <MarcoBadge
            marco={data.paciente.marcoAtual}
            rotulo={data.paciente.marcoAtualRotulo}
          />
        ) : null}
      </View>
    </View>
  );

  if (isError) {
    if (isConnectivityError(error)) {
      return <ConnectionError onRetry={() => refetch()} isRetrying={isRefetching} />;
    }
    return (
      <View style={[styles.screen, styles.centerScreen, { backgroundColor: colors.background }]}>
        <EstratosLogo size={28} />
        <Text style={[styles.errTitle, { color: colors.foreground }]}>Paciente não encontrado</Text>
        <Text style={[styles.errBody, { color: colors.mutedForeground }]}>
          O ID fornecido não corresponde a nenhum handoff ativo no console.
        </Text>
        <Pressable onPress={() => router.replace("/")} style={[styles.retryBtn, { borderColor: colors.borderStrong }]}>
          <Text style={[styles.retryText, { color: colors.foreground }]}>Voltar ao Console</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {Header}
      {isLoading || !data ? (
        <View style={[styles.center, { paddingTop: 80 }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: bottomPad }}
          showsVerticalScrollIndicator={false}
        >
          {/* Patient identity */}
          <Text style={[styles.name, { color: colors.foreground }]}>{data.paciente.nome}</Text>
          <View style={styles.metaWrap}>
            <View style={styles.metaItem}>
              <View style={[styles.diamond, { backgroundColor: colors.primary }]} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                {data.paciente.procedimentos.join(" · ")}
              </Text>
            </View>
            <Text style={[styles.metaDate, { color: colors.mutedForeground }]}>
              {formatDate(data.paciente.dataCirurgia)} · {data.paciente.horario}
            </Text>
            {data.paciente.laser ? (
              <View style={[styles.laserTag, { borderColor: "rgba(151,163,180,0.3)" }]}>
                <Text style={[styles.laserText, { color: colors.primary }]}>LASER CO₂</Text>
              </View>
            ) : null}
          </View>

          {/* Médico responsável & contrato — referência rápida da secretária */}
          <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}>
            <View style={styles.infoRow}>
              <Feather name="user" size={15} color={colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>MÉDICO RESPONSÁVEL</Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>{data.paciente.medica}</Text>
                <Text style={[styles.infoMeta, { color: colors.mutedForeground }]}>
                  CRM {data.paciente.crm} · RQE {data.paciente.rqe}
                </Text>
              </View>
            </View>

            <View style={[styles.infoSep, { backgroundColor: colors.borderStrong }]} />

            <View style={styles.infoRow}>
              <Feather name="file-text" size={15} color={colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>CONTRATO</Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>
                  {descreverContrato(data.paciente.contratoStatus, data.paciente.contratoAssinadoEm)}
                </Text>
                {data.paciente.contratoStatus !== "assinado" &&
                data.paciente.contratoStatus !== "recusado" &&
                (data.paciente.contratoAutentiqueId ||
                  data.paciente.contratoLinkAssinaturaManual) &&
                data.paciente.contratoPrazo ? (
                  <Text style={[styles.infoMeta, { color: colors.primary }]}>
                    Assinar até {formatDate(data.paciente.contratoPrazo)}
                  </Text>
                ) : null}
              </View>
            </View>

            {data.paciente.contratoStatus !== "assinado" &&
            data.paciente.contratoStatus !== "recusado" &&
            data.paciente.contratoLinkAssinatura ? (
              <>
                <View style={[styles.linkBox, { backgroundColor: colors.background, borderColor: colors.card }]}>
                  <Text style={[styles.linkText, { color: colors.primary }]} numberOfLines={1}>
                    {data.paciente.contratoLinkAssinatura}
                  </Text>
                  <Pressable
                    onPress={() => Linking.openURL(data.paciente.contratoLinkAssinatura!)}
                    hitSlop={10}
                  >
                    <Feather name="external-link" size={16} color={colors.mutedForeground} />
                  </Pressable>
                </View>
                <ActionRow
                  onCopy={() => handleCopy(data.paciente.contratoLinkAssinatura!, "contrato-link")}
                  onShare={() => handleShare(data.paciente.contratoLinkAssinatura!)}
                  copied={copiedId === "contrato-link"}
                />
              </>
            ) : null}
          </View>

          {/* Archived banner + restore */}
          {data.paciente.arquivado ? (
            <View style={[styles.archivedBanner, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}>
              <View style={styles.archivedBannerHead}>
                <Feather name="archive" size={16} color={colors.mutedForeground} />
                <Text style={[styles.archivedBannerTitle, { color: colors.mutedForeground }]}>
                  PROCESSO ARQUIVADO
                </Text>
              </View>
              <Text style={[styles.archivedBannerBody, { color: colors.mutedForeground }]}>
                Este processo saiu da lista de ativos. Nada foi apagado — restaure para voltar a operá-lo.
              </Text>
              <Pressable
                onPress={handleRestaurar}
                disabled={restaurar.isPending}
                testID="restaurar"
                style={({ pressed }) => [
                  styles.restoreBtn,
                  { borderColor: colors.borderStrong, opacity: pressed || restaurar.isPending ? 0.7 : 1 },
                ]}
              >
                <Feather name="rotate-ccw" size={15} color={colors.foreground} />
                <Text style={[styles.restoreText, { color: colors.foreground }]}>
                  {restaurar.isPending ? "Restaurando..." : "Restaurar processo"}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {/* Review banner */}
          {!data.paciente.linkEnviadoEm ? (
            <View style={[styles.banner, { backgroundColor: colors.card, borderLeftColor: colors.primary }]}>
              <Text style={[styles.bannerTitle, { color: colors.foreground }]}>Revisão de Handoff</Text>
              <Text style={[styles.bannerBody, { color: colors.mutedForeground }]}>
                Revise os blocos abaixo. Se tudo estiver correto, aprove para disparar ao paciente.
              </Text>
              <Pressable
                onPress={handleAprovar}
                disabled={aprovar.isPending}
                testID="aprovar"
                style={({ pressed }) => [
                  styles.approveBtn,
                  { backgroundColor: colors.ivory, opacity: pressed || aprovar.isPending ? 0.85 : 1 },
                ]}
              >
                <Text style={[styles.approveText, { color: colors.ivoryForeground }]}>
                  {aprovar.isPending ? "Aprovando..." : "Aprovar e enviar"}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {/* SECTION 01 — Entrega Principal */}
          <SectionTitle index="01" active label="Entrega Principal" />
          <View style={[styles.mainCard, { backgroundColor: colors.card, borderLeftColor: colors.primary }]}>
            <Text style={[styles.mainMessage, { color: colors.foreground }]}>
              {data.saidas.mensagemUnica}
            </Text>
            <View style={[styles.linkBox, { backgroundColor: colors.background, borderColor: colors.card }]}>
              <Text style={[styles.linkText, { color: colors.primary }]} numberOfLines={1}>
                {data.saidas.link}
              </Text>
              <Pressable onPress={() => Linking.openURL(data.saidas.link)} hitSlop={10}>
                <Feather name="external-link" size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <ActionRow
              onCopy={() => handleCopy(`${data.saidas.mensagemUnica}\n\n${data.saidas.link}`, "msg")}
              onShare={() => handleShare(`${data.saidas.mensagemUnica}\n\n${data.saidas.link}`)}
              copied={copiedId === "msg"}
            />
          </View>

          {/* PÁGINA DA PACIENTE — conteúdo editável resolvido (override ?? padrão, variáveis já substituídas) */}
          <View
            testID="pagina-secao"
            style={[styles.collapsible, { borderColor: colors.card, backgroundColor: colors.background }]}
          >
            <Pressable
              onPress={() => setPaginaOpen((o) => !o)}
              style={styles.collapsibleHead}
              testID="toggle-pagina"
            >
              <View style={styles.collapsibleHeadLeft}>
                <Feather name="eye" size={15} color={colors.mutedForeground} />
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PÁGINA DA PACIENTE</Text>
                {conteudo ? (
                  <View
                    style={[
                      styles.paginaBadge,
                      {
                        borderColor: conteudo.personalizado ? "rgba(201,169,110,0.6)" : "rgba(151,163,180,0.3)",
                        backgroundColor: colors.card,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.paginaBadgeText,
                        { color: conteudo.personalizado ? colors.primary : colors.mutedForeground },
                      ]}
                    >
                      {conteudo.personalizado ? "PERSONALIZADO" : "PADRÃO"}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Feather name={paginaOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
            </Pressable>

            {paginaOpen ? (
              <View style={[styles.collapsibleBody, { borderTopColor: colors.card }]}>
                {loadingPagina || !pagina ? (
                  <View style={[styles.center, { paddingVertical: 16 }]}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : pagina.secoes.length > 0 ? (
                  <PaginaPreviewSimulada
                    secoes={pagina.secoes}
                    tema={pagina.tema}
                    dataCirurgia={pagina.dataCirurgia}
                    identidade={identidade}
                    dados={{
                      primeiroNome: pagina.primeiroNome,
                      dataCirurgia: pagina.dataCirurgia,
                      horario: pagina.horario,
                      procedimentos: pagina.procedimentos,
                      local: pagina.local,
                      equipeAnestesia: pagina.equipeAnestesia,
                    }}
                    pagamento={pagina.pagamento}
                    confirmacoes={{
                      contratoStatus: pagina.contratoStatus,
                      contratoPrazo: pagina.contratoPrazo,
                      contratoAssinadoEm: pagina.contratoAssinadoEm,
                      termoStatus: pagina.termoStatus,
                      termoPrazo: pagina.termoPrazo,
                      termoAssinadoEm: pagina.termoAssinadoEm,
                    }}
                  />
                ) : (
                  <Text style={[styles.timelineEmpty, { color: colors.mutedForeground }]}>
                    Nenhum conteúdo configurado para esta página.
                  </Text>
                )}
                <Pressable
                  onPress={() => router.push(`/paciente/conteudo/${id}`)}
                  testID="personalizar-conteudo"
                  style={({ pressed }) => [
                    styles.personalizarBtn,
                    { borderColor: colors.borderStrong, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Feather name="edit-3" size={15} color={colors.foreground} />
                  <Text style={[styles.personalizarText, { color: colors.foreground }]}>
                    {conteudo?.personalizado ? "Editar conteúdo personalizado" : "Personalizar conteúdo"}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {/* SECTION 02 — Fallback Manual (collapsible) */}
          <View style={[styles.collapsible, { borderColor: colors.card, backgroundColor: colors.background }]}>
            <Pressable
              onPress={() => setFallbackOpen((o) => !o)}
              style={styles.collapsibleHead}
              testID="toggle-fallback"
            >
              <View style={styles.collapsibleHeadLeft}>
                <Text style={[styles.indexMuted, { color: colors.mutedForeground }]}>02</Text>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>FALLBACK MANUAL</Text>
              </View>
              <Feather
                name={fallbackOpen ? "chevron-up" : "chevron-down"}
                size={18}
                color={colors.mutedForeground}
              />
            </Pressable>

            {fallbackOpen ? (
              <View style={[styles.collapsibleBody, { borderTopColor: colors.card }]}>
                <Block
                  text={data.saidas.a6}
                  copied={copiedId === "a6"}
                  onCopy={() => handleCopy(data.saidas.a6, "a6")}
                  onShare={() => handleShare(data.saidas.a6)}
                />
                <Divider label="ANEXAR O PDF DA NF" />
                <Block
                  text={data.saidas.a7}
                  copied={copiedId === "a7"}
                  onCopy={() => handleCopy(data.saidas.a7, "a7")}
                  onShare={() => handleShare(data.saidas.a7)}
                />
                <View style={[styles.checklist, { borderColor: colors.card, backgroundColor: colors.background }]}>
                  <Text style={[styles.checklistTitle, { color: colors.primary }]}>CHECKLIST MEDX</Text>
                  {data.saidas.checklistMedx
                    .filter((i) => i.incluido)
                    .map((item, idx) => (
                      <View key={idx} style={styles.checklistRow}>
                        <Text style={[styles.checklistBullet, { color: colors.primary }]}>·</Text>
                        <Text
                          style={[
                            styles.checklistText,
                            { color: item.sempre ? colors.mutedForeground : colors.foreground },
                          ]}
                        >
                          {item.titulo}
                        </Text>
                      </View>
                    ))}
                </View>
                <Block
                  text={data.saidas.a8}
                  copied={copiedId === "a8"}
                  onCopy={() => handleCopy(data.saidas.a8, "a8")}
                  onShare={() => handleShare(data.saidas.a8)}
                />
              </View>
            ) : null}
          </View>

          {/* SECTION 03 — Envios Operacionais */}
          <SectionTitle index="03" label="Envios Operacionais" />
          {data.saidas.avisoOperacional ? (
            <View style={[styles.aviso, { backgroundColor: "rgba(201,169,110,0.1)", borderColor: "rgba(201,169,110,0.3)" }]}>
              <Text style={[styles.avisoMark, { color: colors.primary }]}>!</Text>
              <Text style={[styles.avisoText, { color: colors.foreground }]}>{data.saidas.avisoOperacional}</Text>
            </View>
          ) : null}

          <OpCard
            title="CENTRO CIRÚRGICO"
            text={data.saidas.a4}
            copied={copiedId === "a4"}
            onCopy={() => handleCopy(data.saidas.a4, "a4")}
            onShare={() => handleShare(data.saidas.a4)}
          />
          <OpCard
            title="ANESTESIA"
            text={data.saidas.a5}
            copied={copiedId === "a5"}
            onCopy={() => handleCopy(data.saidas.a5, "a5")}
            onShare={() => handleShare(data.saidas.a5)}
          />

          {/* SECTION 04 — Acompanhamento (timeline notes) */}
          <SectionTitle index="04" label="Acompanhamento" />
          <View style={[styles.notaForm, { borderColor: colors.card }]}>
            <TextInput
              value={notaTitulo}
              onChangeText={setNotaTitulo}
              placeholder="Título da nota (ex: Paciente confirmou exames)"
              placeholderTextColor="rgba(151,163,180,0.5)"
              style={[styles.notaInput, { backgroundColor: colors.background, color: colors.foreground }]}
            />
            <TextInput
              value={notaDescricao}
              onChangeText={setNotaDescricao}
              placeholder="Detalhes (opcional)"
              placeholderTextColor="rgba(151,163,180,0.5)"
              multiline
              style={[
                styles.notaInput,
                styles.notaTextarea,
                { backgroundColor: colors.background, color: colors.foreground },
              ]}
            />
            <Pressable
              onPress={handleAdicionarNota}
              disabled={adicionarNota.isPending || !notaTitulo.trim()}
              testID="adicionar-nota"
              style={({ pressed }) => [
                styles.notaBtn,
                {
                  backgroundColor: colors.ivory,
                  opacity: pressed || adicionarNota.isPending || !notaTitulo.trim() ? 0.6 : 1,
                },
              ]}
            >
              <Feather name="plus" size={15} color={colors.ivoryForeground} />
              <Text style={[styles.notaBtnText, { color: colors.ivoryForeground }]}>
                {adicionarNota.isPending ? "Adicionando..." : "Adicionar nota"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.timeline}>
            {loadingTimeline ? (
              <View style={[styles.center, { paddingVertical: 24 }]}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : timeline && timeline.length > 0 ? (
              <View style={styles.timelineList}>
                <View style={[styles.timelineSpine, { backgroundColor: colors.card }]} />
                {timeline.map((evento) => (
                  <View key={evento.id} style={styles.timelineRow}>
                    <View
                      style={[
                        styles.timelineDot,
                        { backgroundColor: evento.automatico ? colors.primary : colors.mutedForeground },
                      ]}
                    />
                    <View style={styles.timelineBody}>
                      <View style={styles.timelineMeta}>
                        <Text style={[styles.timelineKind, { color: colors.mutedForeground }]}>
                          {evento.automatico ? "AUTOMÁTICO" : "NOTA"}
                        </Text>
                        <Text style={[styles.timelineDate, { color: "rgba(151,163,180,0.6)" }]}>
                          {formatDateTime(evento.createdAt)}
                        </Text>
                      </View>
                      <Text style={[styles.timelineTitle, { color: colors.foreground }]}>
                        {evento.titulo}
                      </Text>
                      {evento.descricao ? (
                        <Text style={[styles.timelineDesc, { color: colors.mutedForeground }]}>
                          {evento.descricao}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.timelineEmpty, { color: colors.mutedForeground }]}>
                Nenhum evento registrado ainda.
              </Text>
            )}
          </View>

          {/* SECTION 05 — Termo de Consentimento (TCLE) */}
          <SectionTitle index="05" label="Termo de Consentimento (TCLE)" />
          <View style={[styles.termoCard, { backgroundColor: colors.card, borderColor: colors.card }]}>
            <View style={styles.termoStatusRow}>
              <View
                style={[
                  styles.termoBadge,
                  {
                    borderColor:
                      data.paciente.termoStatus === "assinado"
                        ? "rgba(201,169,110,0.6)"
                        : "rgba(151,163,180,0.3)",
                  },
                ]}
              >
                {data.paciente.termoStatus === "assinado" ? (
                  <Feather name="check" size={12} color={colors.primary} />
                ) : null}
                <Text
                  style={[
                    styles.termoBadgeText,
                    {
                      color:
                        data.paciente.termoStatus === "assinado"
                          ? colors.primary
                          : colors.mutedForeground,
                    },
                  ]}
                >
                  {descreverTermo(data.paciente.termoStatus, data.paciente.termoAssinadoEm)}
                </Text>
              </View>
            </View>

            {data.paciente.termoStatus === "assinado" ? (
              <View style={styles.termoDownloadRow}>
                <Pressable
                  onPress={() => acessarTermo("abrir")}
                  disabled={termoBaixando !== null}
                  testID="termo-abrir"
                  style={({ pressed }) => [
                    styles.termoBtnPrimary,
                    {
                      backgroundColor: colors.ivory,
                      opacity: pressed || termoBaixando !== null ? 0.7 : 1,
                    },
                  ]}
                >
                  <Feather name="eye" size={15} color={colors.ivoryForeground} />
                  <Text style={[styles.termoBtnPrimaryText, { color: colors.ivoryForeground }]}>
                    {termoBaixando === "abrir" ? "Abrindo..." : "Abrir termo"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => acessarTermo("baixar")}
                  disabled={termoBaixando !== null}
                  testID="termo-baixar"
                  style={({ pressed }) => [
                    styles.termoBtnOutline,
                    {
                      borderColor: colors.borderStrong,
                      opacity: pressed || termoBaixando !== null ? 0.7 : 1,
                    },
                  ]}
                >
                  <Feather name="download" size={15} color={colors.foreground} />
                  <Text style={[styles.termoBtnOutlineText, { color: colors.foreground }]}>
                    {termoBaixando === "baixar" ? "Baixando..." : "Baixar PDF"}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {data.paciente.termoStatus === "indisponivel" ? (
              <Text style={[styles.termoHint, { color: colors.mutedForeground }]}>
                Não foi possível ler o status na Autentique. Verifique se o link/ID está correto e se
                o documento ainda existe.
              </Text>
            ) : null}

            {/* Link de assinatura para a paciente */}
            <View style={[styles.termoBlock, { borderTopColor: colors.borderStrong }]}>
              <Text style={[styles.termoBlockLabel, { color: colors.mutedForeground }]}>
                LINK DE ASSINATURA
              </Text>
              <Text style={[styles.termoBlockDesc, { color: colors.mutedForeground }]}>
                Link que a paciente usa para assinar o TCLE. Preenchido automaticamente pela
                Autentique; informe um link manual para sobrescrever.
              </Text>
              {data.paciente.termoLinkAssinatura ? (
                <>
                  <View style={[styles.linkBox, { backgroundColor: colors.background, borderColor: colors.card }]}>
                    <Text style={[styles.linkText, { color: colors.primary }]} numberOfLines={1}>
                      {data.paciente.termoLinkAssinatura}
                    </Text>
                    <Pressable
                      onPress={() => Linking.openURL(data.paciente.termoLinkAssinatura!)}
                      hitSlop={10}
                    >
                      <Feather name="external-link" size={16} color={colors.mutedForeground} />
                    </Pressable>
                  </View>
                  <ActionRow
                    onCopy={() => handleCopy(data.paciente.termoLinkAssinatura!, "termo-link-assinatura")}
                    onShare={() => handleShare(data.paciente.termoLinkAssinatura!)}
                    copied={copiedId === "termo-link-assinatura"}
                  />
                </>
              ) : (
                <Text style={[styles.termoEmpty, { color: colors.mutedForeground }]}>
                  Nenhum link de assinatura disponível ainda.
                </Text>
              )}
              <TextInput
                value={termoLinkManualInput}
                onChangeText={setTermoLinkManualInput}
                placeholder="Link manual (opcional) — sobrescreve o automático"
                placeholderTextColor="rgba(151,163,180,0.5)"
                autoCapitalize="none"
                autoCorrect={false}
                testID="termo-link-manual-input"
                style={[styles.termoInput, { backgroundColor: colors.background, color: colors.foreground }]}
              />
              <View style={styles.termoActions}>
                <Pressable
                  onPress={() =>
                    mutarCamposTermo(
                      { termoLinkAssinaturaManual: termoLinkManualInput.trim() || null },
                      "Link de assinatura do termo salvo",
                    )
                  }
                  disabled={
                    atualizarPaciente.isPending ||
                    termoLinkManualInput.trim() === termoLinkAssinaturaManual
                  }
                  testID="termo-link-manual-salvar"
                  style={({ pressed }) => [
                    styles.termoBtnPrimary,
                    {
                      backgroundColor: colors.ivory,
                      opacity:
                        pressed ||
                        atualizarPaciente.isPending ||
                        termoLinkManualInput.trim() === termoLinkAssinaturaManual
                          ? 0.6
                          : 1,
                    },
                  ]}
                >
                  <Text style={[styles.termoBtnPrimaryText, { color: colors.ivoryForeground }]}>
                    {atualizarPaciente.isPending ? "Salvando..." : "Salvar"}
                  </Text>
                </Pressable>
                {termoLinkAssinaturaManual ? (
                  <Pressable
                    onPress={() =>
                      mutarCamposTermo({ termoLinkAssinaturaManual: null }, "Link manual do termo removido")
                    }
                    disabled={atualizarPaciente.isPending}
                    style={({ pressed }) => [
                      styles.termoBtnOutline,
                      { borderColor: colors.borderStrong, opacity: pressed || atualizarPaciente.isPending ? 0.6 : 1 },
                    ]}
                  >
                    <Text style={[styles.termoBtnOutlineText, { color: colors.foreground }]}>Limpar</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* Prazo de assinatura */}
            <View style={[styles.termoBlock, { borderTopColor: colors.borderStrong }]}>
              <Text style={[styles.termoBlockLabel, { color: colors.mutedForeground }]}>
                PRAZO DE ASSINATURA
              </Text>
              <Text style={[styles.termoBlockDesc, { color: colors.mutedForeground }]}>
                Padrão: 2 dias antes da cirurgia. Defina uma data específica (AAAA-MM-DD) para
                sobrescrever apenas este termo.
              </Text>
              {data.paciente.termoPrazo ? (
                <Text style={[styles.termoMeta, { color: colors.foreground }]}>
                  <Feather name="calendar" size={13} color={colors.mutedForeground} />{" "}
                  {formatDate(data.paciente.termoPrazo)}
                </Text>
              ) : null}
              <TextInput
                value={termoPrazoOverrideInput}
                onChangeText={setTermoPrazoOverrideInput}
                placeholder="AAAA-MM-DD"
                placeholderTextColor="rgba(151,163,180,0.5)"
                autoCapitalize="none"
                autoCorrect={false}
                testID="termo-prazo-input"
                style={[styles.termoInput, { backgroundColor: colors.background, color: colors.foreground }]}
              />
              <View style={styles.termoActions}>
                <Pressable
                  onPress={() =>
                    mutarCamposTermo(
                      { termoPrazoOverride: termoPrazoOverrideInput.trim() || null },
                      "Prazo do termo salvo",
                    )
                  }
                  disabled={
                    atualizarPaciente.isPending ||
                    termoPrazoOverrideInput.trim() === termoPrazoOverride
                  }
                  testID="termo-prazo-salvar"
                  style={({ pressed }) => [
                    styles.termoBtnPrimary,
                    {
                      backgroundColor: colors.ivory,
                      opacity:
                        pressed ||
                        atualizarPaciente.isPending ||
                        termoPrazoOverrideInput.trim() === termoPrazoOverride
                          ? 0.6
                          : 1,
                    },
                  ]}
                >
                  <Text style={[styles.termoBtnPrimaryText, { color: colors.ivoryForeground }]}>
                    {atualizarPaciente.isPending ? "Salvando..." : "Salvar"}
                  </Text>
                </Pressable>
                {termoPrazoOverride ? (
                  <Pressable
                    onPress={() =>
                      mutarCamposTermo({ termoPrazoOverride: null }, "Prazo personalizado do termo removido")
                    }
                    disabled={atualizarPaciente.isPending}
                    style={({ pressed }) => [
                      styles.termoBtnOutline,
                      { borderColor: colors.borderStrong, opacity: pressed || atualizarPaciente.isPending ? 0.6 : 1 },
                    ]}
                  >
                    <Text style={[styles.termoBtnOutlineText, { color: colors.foreground }]}>Usar padrão</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* Vínculo do TCLE (link/ID Autentique) */}
            <View style={[styles.termoBlock, { borderTopColor: colors.borderStrong }]}>
              <Text style={[styles.termoBlockDesc, { color: colors.mutedForeground }]}>
                Cole o link do TCLE na Autentique (ou o ID do documento). O status é consultado
                automaticamente, somente leitura — nada é enviado ou alterado.
              </Text>
              <TextInput
                value={termoLinkInput}
                onChangeText={setTermoLinkInput}
                placeholder="https://painel.autentique.com.br/documentos/..."
                placeholderTextColor="rgba(151,163,180,0.5)"
                autoCapitalize="none"
                autoCorrect={false}
                testID="termo-link-input"
                style={[styles.termoInput, { backgroundColor: colors.background, color: colors.foreground }]}
              />
              <View style={styles.termoActions}>
                <Pressable
                  onPress={() => mutarTermo(termoLinkInput.trim() || null, "TCLE salvo")}
                  disabled={atualizarPaciente.isPending || termoLinkInput.trim() === termoAutentiqueId}
                  testID="termo-link-salvar"
                  style={({ pressed }) => [
                    styles.termoBtnPrimary,
                    {
                      backgroundColor: colors.ivory,
                      opacity:
                        pressed ||
                        atualizarPaciente.isPending ||
                        termoLinkInput.trim() === termoAutentiqueId
                          ? 0.6
                          : 1,
                    },
                  ]}
                >
                  <Text style={[styles.termoBtnPrimaryText, { color: colors.ivoryForeground }]}>
                    {atualizarPaciente.isPending ? "Salvando..." : "Salvar"}
                  </Text>
                </Pressable>
                {termoAutentiqueId ? (
                  <Pressable
                    onPress={() => mutarTermo(null, "Vínculo do TCLE removido")}
                    disabled={atualizarPaciente.isPending}
                    style={({ pressed }) => [
                      styles.termoBtnOutline,
                      { borderColor: colors.borderStrong, opacity: pressed || atualizarPaciente.isPending ? 0.6 : 1 },
                    ]}
                  >
                    <Text style={[styles.termoBtnOutlineText, { color: colors.foreground }]}>Limpar</Text>
                  </Pressable>
                ) : null}
              </View>
              {data.paciente.termoVerificadoEm ? (
                <Text style={[styles.termoVerificado, { color: colors.mutedForeground }]}>
                  Última verificação: {formatDateTime(data.paciente.termoVerificadoEm)}
                </Text>
              ) : null}
            </View>
          </View>

          {/* SECTION 06 — Documentos (PDF) */}
          <SectionTitle index="06" label="Documentos (PDF)" />
          <Text style={[styles.docHint, { color: colors.mutedForeground }]}>
            Anexe pedidos médicos em PDF (até 20 MB). A paciente vê e baixa pela página dela.
          </Text>
          <Pressable
            onPress={handleAnexarDocumento}
            disabled={enviandoDocumento}
            testID="anexar-documento"
            style={({ pressed }) => [
              styles.docUploadBtn,
              {
                borderColor: colors.borderStrong,
                opacity: pressed || enviandoDocumento ? 0.7 : 1,
              },
            ]}
          >
            <Feather
              name={enviandoDocumento ? "loader" : "upload"}
              size={15}
              color={colors.foreground}
            />
            <Text style={[styles.docUploadText, { color: colors.foreground }]}>
              {enviandoDocumento ? "Enviando..." : "Anexar PDF"}
            </Text>
          </Pressable>

          <View style={styles.docList}>
            {documentosQuery.isLoading ? (
              <View style={[styles.center, { paddingVertical: 16 }]}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : documentos.length === 0 ? (
              <Text style={[styles.timelineEmpty, { color: colors.mutedForeground }]}>
                Nenhum documento anexado ainda.
              </Text>
            ) : (
              documentos.map((doc) => (
                <View
                  key={doc.id}
                  style={[styles.docCard, { backgroundColor: colors.card, borderColor: colors.card }]}
                >
                  <View style={styles.docCardHead}>
                    <Feather name="file-text" size={16} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.docCardTitle, { color: colors.foreground }]} numberOfLines={2}>
                        {doc.rotulo}
                      </Text>
                      <Text style={[styles.docCardMeta, { color: colors.mutedForeground }]}>
                        PDF · {formatarTamanhoDoc(doc.tamanho)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.docCardActions}>
                    <Pressable
                      onPress={() => handleAbrirDocumento(doc)}
                      disabled={documentoAcao !== null}
                      testID={`abrir-documento-${doc.id}`}
                      style={({ pressed }) => [
                        styles.docActionBtn,
                        { borderColor: colors.borderStrong, opacity: pressed || documentoAcao !== null ? 0.7 : 1 },
                      ]}
                    >
                      <Feather name="external-link" size={14} color={colors.foreground} />
                      <Text style={[styles.docActionText, { color: colors.foreground }]}>
                        {documentoAcao === `${doc.id}:abrir` ? "Abrindo" : "Abrir"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleRemoverDocumento(doc)}
                      disabled={documentoAcao !== null}
                      testID={`remover-documento-${doc.id}`}
                      style={({ pressed }) => [
                        styles.docActionBtn,
                        { borderColor: "rgba(151,163,180,0.3)", opacity: pressed || documentoAcao !== null ? 0.7 : 1 },
                      ]}
                    >
                      <Feather name="trash-2" size={14} color={colors.mutedForeground} />
                      <Text style={[styles.docActionText, { color: colors.mutedForeground }]}>
                        {documentoAcao === `${doc.id}:remover` ? "Removendo" : "Remover"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* SECTION 07 — Pagamento */}
          <SectionTitle index="07" label="Pagamento" />
          <View style={[styles.termoCard, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}>
            {/* Valor pago (sinal) */}
            <View style={styles.pagamentoField}>
              <Text style={[styles.termoBlockLabel, { color: colors.mutedForeground }]}>
                VALOR PAGO (R$)
              </Text>
              <TextInput
                value={valorSinalInput}
                onChangeText={(v) => { setValorSinalInput(v); setPagamentoValidar(false); }}
                placeholder="0"
                placeholderTextColor="rgba(151,163,180,0.5)"
                keyboardType="decimal-pad"
                testID="pagamento-valor-sinal"
                style={[
                  styles.termoInput,
                  {
                    backgroundColor: colors.background,
                    color: colors.foreground,
                    borderColor:
                      pagamentoValidar &&
                      (!valorSinalInput ||
                        Number.isNaN(Number(valorSinalInput.replace(",", "."))) ||
                        Number(valorSinalInput.replace(",", ".")) <= 0)
                        ? colors.destructive
                        : colors.borderStrong,
                    borderWidth: 1,
                  },
                ]}
              />
              {pagamentoValidar &&
              (!valorSinalInput ||
                Number.isNaN(Number(valorSinalInput.replace(",", "."))) ||
                Number(valorSinalInput.replace(",", ".")) <= 0) ? (
                <Text style={[styles.termoBlockDesc, { color: colors.destructive }]}>
                  Informe um valor maior que zero.
                </Text>
              ) : null}
            </View>

            {/* Saldo pendente */}
            <View style={[styles.pagamentoField, styles.pagamentoFieldBorder, { borderTopColor: colors.borderStrong }]}>
              <Text style={[styles.termoBlockLabel, { color: colors.mutedForeground }]}>
                SALDO PENDENTE (R$)
              </Text>
              <TextInput
                value={valorPendenteInput}
                onChangeText={(v) => {
                  setValorPendenteInput(v);
                  setPagamentoValidar(false);
                  const n = v.trim() === "" ? 0 : Number(v.replace(",", "."));
                  if (n <= 0) setDataPagamentoPendenteInput("");
                }}
                placeholder="0"
                placeholderTextColor="rgba(151,163,180,0.5)"
                keyboardType="decimal-pad"
                testID="pagamento-valor-pendente"
                style={[
                  styles.termoInput,
                  {
                    backgroundColor: colors.background,
                    color: colors.foreground,
                    borderColor:
                      pagamentoValidar &&
                      valorPendenteInput.trim() !== "" &&
                      (Number.isNaN(Number(valorPendenteInput.replace(",", "."))) ||
                        Number(valorPendenteInput.replace(",", ".")) < 0)
                        ? colors.destructive
                        : colors.borderStrong,
                    borderWidth: 1,
                  },
                ]}
              />
            </View>

            {/* Vencimento — only when pending balance > 0 */}
            {(valorPendenteInput.trim() !== "" &&
              Number(valorPendenteInput.replace(",", ".")) > 0) ? (
              <View style={[styles.pagamentoField, styles.pagamentoFieldBorder, { borderTopColor: colors.borderStrong }]}>
                <Text style={[styles.termoBlockLabel, { color: colors.mutedForeground }]}>
                  VENCIMENTO DO SALDO
                </Text>
                <DateTimeField
                  mode="date"
                  value={dataPagamentoPendenteInput}
                  onChange={(v) => { setDataPagamentoPendenteInput(v); setPagamentoValidar(false); }}
                  placeholder="Escolher data"
                  error={pagamentoValidar && dataPagamentoPendenteInput.trim() === ""}
                  testID="pagamento-data-pendente"
                />
                {pagamentoValidar && dataPagamentoPendenteInput.trim() === "" ? (
                  <Text style={[styles.termoBlockDesc, { color: colors.destructive }]}>
                    Escolha o vencimento do saldo.
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* Save */}
            <View style={[styles.pagamentoField, styles.pagamentoFieldBorder, { borderTopColor: colors.borderStrong }]}>
              <View style={styles.termoActions}>
                <Pressable
                  onPress={handleSalvarPagamento}
                  disabled={atualizarPaciente.isPending}
                  testID="pagamento-salvar"
                  style={({ pressed }) => [
                    styles.termoBtnPrimary,
                    {
                      backgroundColor: colors.ivory,
                      opacity: pressed || atualizarPaciente.isPending ? 0.6 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.termoBtnPrimaryText, { color: colors.ivoryForeground }]}>
                    {atualizarPaciente.isPending ? "Salvando..." : "Salvar"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* SECTION 08 — Marcos pós-operatórios (manuais) */}
          {!data.paciente.arquivado ? (
            <>
              <SectionTitle index="08" label="Marcos pós-operatórios" />
              <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}>
                <Text style={[styles.posopHint, { color: colors.mutedForeground }]}>
                  Marque a retirada de pontos e os retornos conforme acontecem. São o
                  único trecho da jornada da equipe registrado manualmente.
                </Text>
                {(config?.jornadaEquipe ?? [])
                  .filter((m) => !m.automatico)
                  .map((m, i) => {
                    const chave = m.chave as MarcoManualEntradaMarco;
                    const carimbo = carimboDoMarco(data.paciente, chave);
                    const concluido = carimbo != null;
                    return (
                      <View
                        key={m.chave}
                        style={[
                          styles.posopRow,
                          i > 0 ? { borderTopWidth: 1, borderTopColor: colors.borderStrong } : null,
                        ]}
                      >
                        <View style={{ flex: 1, paddingRight: 12 }}>
                          <Text style={[styles.posopLabel, { color: colors.foreground }]}>
                            {m.rotulo}
                          </Text>
                          <Text
                            style={[
                              styles.posopMeta,
                              { color: concluido ? colors.primary : colors.mutedForeground },
                            ]}
                          >
                            {concluido ? `Marcado em ${formatDate(carimbo!)}` : "Ainda não marcado"}
                          </Text>
                        </View>
                        <Switch
                          value={concluido}
                          onValueChange={(v) => handleMarcarMarco(chave, v)}
                          disabled={marcarMarco.isPending}
                          testID={`marco-${m.chave}`}
                          trackColor={{ false: colors.borderStrong, true: colors.primary }}
                          thumbColor={colors.background}
                        />
                      </View>
                    );
                  })}
              </View>
            </>
          ) : null}

          {/* Archive (active patients only) */}
          {!data.paciente.arquivado ? (
            <Pressable
              onPress={handleArquivar}
              disabled={arquivar.isPending}
              testID="arquivar"
              style={({ pressed }) => [
                styles.archiveBtn,
                { borderColor: colors.card, opacity: pressed || arquivar.isPending ? 0.7 : 1 },
              ]}
            >
              <Feather name="archive" size={15} color={colors.mutedForeground} />
              <Text style={[styles.archiveText, { color: colors.mutedForeground }]}>
                {arquivar.isPending ? "Arquivando..." : "Arquivar processo"}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}

      <DiscardChangesDialog {...dialogProps} />
    </View>
  );
}

function SectionTitle({ index, label, active }: { index: string; label: string; active?: boolean }) {
  const colors = useColors();
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={[styles.sectionIndex, { color: active ? colors.primary : colors.mutedForeground }]}>
        {index}
      </Text>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

function ActionRow({
  onCopy,
  onShare,
  copied,
}: {
  onCopy: () => void;
  onShare: () => void;
  copied: boolean;
}) {
  const colors = useColors();
  return (
    <View style={styles.actionRow}>
      <Pressable
        onPress={onCopy}
        style={({ pressed }) => [
          styles.actionBtn,
          { borderColor: colors.borderStrong, opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <Feather name={copied ? "check" : "copy"} size={15} color={copied ? colors.primary : colors.mutedForeground} />
        <Text style={[styles.actionText, { color: copied ? colors.primary : colors.mutedForeground }]}>
          {copied ? "COPIADO" : "COPIAR"}
        </Text>
      </Pressable>
      <Pressable
        onPress={onShare}
        style={({ pressed }) => [
          styles.actionBtn,
          styles.shareBtn,
          { backgroundColor: colors.ivory, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Feather name="share-2" size={15} color={colors.ivoryForeground} />
        <Text style={[styles.actionText, { color: colors.ivoryForeground }]}>ENVIAR</Text>
      </Pressable>
    </View>
  );
}

function Block({
  text,
  onCopy,
  onShare,
  copied,
}: {
  text: string;
  onCopy: () => void;
  onShare: () => void;
  copied: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[styles.block, { backgroundColor: colors.card }]}>
      <Text style={[styles.blockText, { color: colors.bodyText }]}>{text}</Text>
      <ActionRow onCopy={onCopy} onShare={onShare} copied={copied} />
    </View>
  );
}

function OpCard({
  title,
  text,
  onCopy,
  onShare,
  copied,
}: {
  title: string;
  text: string;
  onCopy: () => void;
  onShare: () => void;
  copied: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[styles.opCard, { backgroundColor: colors.card }]}>
      <Text style={[styles.opTitle, { color: colors.primary }]}>{title}</Text>
      <Text style={[styles.opText, { color: colors.bodyText }]}>{text}</Text>
      <ActionRow onCopy={onCopy} onShare={onShare} copied={copied} />
    </View>
  );
}

function Divider({ label }: { label: string }) {
  const colors = useColors();
  return (
    <View style={styles.dividerRow}>
      <View style={[styles.dividerLine, { backgroundColor: "rgba(151,163,180,0.3)" }]} />
      <Text style={[styles.dividerLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={[styles.dividerLine, { backgroundColor: "rgba(151,163,180,0.3)" }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  centerScreen: { alignItems: "center", justifyContent: "center", padding: 24, gap: 14 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
  headerDivider: { width: 1, height: 22 },
  headerBrand: { fontFamily: fonts.expanded, fontSize: 13, letterSpacing: 2.5 },

  name: { fontFamily: fonts.serifLight, fontSize: 40, letterSpacing: -0.5 },
  metaWrap: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 14, marginTop: 14 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  diamond: { width: 6, height: 6, transform: [{ rotate: "45deg" }] },
  metaText: { fontFamily: fonts.sans, fontSize: 14 },
  metaDate: { fontFamily: fonts.mono, fontSize: 13 },
  laserTag: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  laserText: { fontFamily: fonts.expanded, fontSize: 9, letterSpacing: 1.5 },

  banner: { borderLeftWidth: 2, padding: 20, marginTop: 28, gap: 8 },
  bannerTitle: { fontFamily: fonts.serif, fontSize: 19 },
  bannerBody: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  approveBtn: { height: 48, alignItems: "center", justifyContent: "center", marginTop: 10 },
  approveText: { fontFamily: fonts.sansMedium, fontSize: 15 },

  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 36, marginBottom: 16 },
  sectionIndex: { fontFamily: fonts.mono, fontSize: 14 },
  sectionLabel: { fontFamily: fonts.expanded, fontSize: 11, letterSpacing: 2 },

  mainCard: { borderLeftWidth: 4, padding: 22, gap: 18 },
  mainMessage: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 23 },
  infoCard: { borderWidth: 1, padding: 18, gap: 14, marginTop: 20 },
  infoRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  infoLabel: { fontFamily: fonts.expanded, fontSize: 10, letterSpacing: 1.5, marginBottom: 5 },
  infoValue: { fontFamily: fonts.sansMedium, fontSize: 15 },
  infoMeta: { fontFamily: fonts.mono, fontSize: 12, marginTop: 4 },
  infoSep: { height: 1, opacity: 0.6 },
  posopHint: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, marginBottom: 4 },
  posopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  posopLabel: { fontFamily: fonts.sansMedium, fontSize: 15 },
  posopMeta: { fontFamily: fonts.mono, fontSize: 12, marginTop: 4 },
  linkBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  linkText: { fontFamily: fonts.mono, fontSize: 13, flex: 1 },

  actionRow: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    height: 40,
    paddingHorizontal: 16,
    borderWidth: 1,
    flex: 1,
  },
  shareBtn: { borderWidth: 0 },
  actionText: { fontFamily: fonts.expanded, fontSize: 11, letterSpacing: 1.5 },

  collapsible: { borderWidth: 1, marginTop: 32 },
  collapsibleHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 18 },
  collapsibleHeadLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1, flexWrap: "wrap" },
  indexMuted: { fontFamily: fonts.mono, fontSize: 14 },
  collapsibleBody: { borderTopWidth: 1, padding: 16, gap: 20 },

  paginaBadge: { borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  paginaBadgeText: { fontFamily: fonts.expanded, fontSize: 8, letterSpacing: 1.2 },
  personalizarBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 46,
    borderWidth: 1,
  },
  personalizarText: { fontFamily: fonts.sansMedium, fontSize: 14 },

  block: { padding: 16, gap: 16 },
  blockText: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 21 },

  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, opacity: 0.7 },
  dividerLine: { height: 1, flex: 1 },
  dividerLabel: { fontFamily: fonts.expanded, fontSize: 9, letterSpacing: 1.5 },

  checklist: { borderWidth: 1, padding: 18, gap: 12 },
  checklistTitle: { fontFamily: fonts.expanded, fontSize: 10, letterSpacing: 1.5, marginBottom: 2 },
  checklistRow: { flexDirection: "row", gap: 10 },
  checklistBullet: { fontFamily: fonts.sans, fontSize: 14 },
  checklistText: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, flex: 1 },

  aviso: { flexDirection: "row", gap: 12, borderWidth: 1, padding: 16, marginBottom: 16 },
  avisoMark: { fontFamily: fonts.sansBold, fontSize: 18, lineHeight: 20 },
  avisoText: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, flex: 1 },

  opCard: { padding: 18, gap: 14, marginBottom: 12 },
  opTitle: { fontFamily: fonts.expanded, fontSize: 10, letterSpacing: 1.5 },
  opText: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 20 },

  errTitle: { fontFamily: fonts.serif, fontSize: 24, marginTop: 8 },
  errBody: { fontFamily: fonts.sans, fontSize: 14, textAlign: "center", lineHeight: 21 },
  retryBtn: { borderWidth: 1, paddingHorizontal: 20, paddingVertical: 12, marginTop: 8 },
  retryText: { fontFamily: fonts.sansMedium, fontSize: 13 },

  archivedBanner: { borderWidth: 1, padding: 18, marginTop: 24, gap: 10 },
  archivedBannerHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  archivedBannerTitle: { fontFamily: fonts.expanded, fontSize: 10, letterSpacing: 1.5 },
  archivedBannerBody: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  restoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    borderWidth: 1,
    marginTop: 4,
  },
  restoreText: { fontFamily: fonts.sansMedium, fontSize: 14 },

  notaForm: { borderWidth: 1, padding: 16, gap: 12 },
  notaInput: {
    fontFamily: fonts.sans,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 46,
  },
  notaTextarea: { minHeight: 80, textAlignVertical: "top" },
  notaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 46,
  },
  notaBtnText: { fontFamily: fonts.sansMedium, fontSize: 15 },

  timeline: { marginTop: 24 },
  timelineList: { paddingLeft: 8 },
  timelineSpine: { position: "absolute", left: 3, top: 6, bottom: 6, width: 1 },
  timelineRow: { flexDirection: "row", gap: 16, marginBottom: 24 },
  timelineDot: { width: 8, height: 8, marginTop: 5, marginLeft: -1, transform: [{ rotate: "45deg" }] },
  timelineBody: { flex: 1, gap: 6 },
  timelineMeta: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 12 },
  timelineKind: { fontFamily: fonts.expanded, fontSize: 9, letterSpacing: 1.5 },
  timelineDate: { fontFamily: fonts.mono, fontSize: 11 },
  timelineTitle: { fontFamily: fonts.serif, fontSize: 18 },
  timelineDesc: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20 },
  timelineEmpty: { fontFamily: fonts.sans, fontSize: 14 },

  archiveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 46,
    borderWidth: 1,
    marginTop: 36,
  },
  archiveText: { fontFamily: fonts.expanded, fontSize: 11, letterSpacing: 1.5 },

  docHint: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  docUploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 46,
    borderWidth: 1,
  },
  docUploadText: { fontFamily: fonts.expanded, fontSize: 11, letterSpacing: 1.5 },
  docList: { marginTop: 16, gap: 12 },
  docCard: { borderWidth: 1, padding: 14, gap: 12 },
  docCardHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  docCardTitle: { fontFamily: fonts.serif, fontSize: 16 },
  docCardMeta: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.5, marginTop: 3 },
  docCardActions: { flexDirection: "row", gap: 10 },
  docActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 40,
    borderWidth: 1,
  },
  docActionText: { fontFamily: fonts.expanded, fontSize: 10, letterSpacing: 1.2 },

  termoCard: { borderWidth: 1, padding: 18, gap: 18 },
  pagamentoField: { gap: 10 },
  pagamentoFieldBorder: { borderTopWidth: 1, paddingTop: 16 },
  termoStatusRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12 },
  termoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  termoBadgeText: { fontFamily: fonts.expanded, fontSize: 9, letterSpacing: 1.2 },
  termoDownloadRow: { flexDirection: "row", gap: 10 },
  termoHint: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  termoBlock: { borderTopWidth: 1, paddingTop: 16, gap: 12 },
  termoBlockLabel: { fontFamily: fonts.expanded, fontSize: 10, letterSpacing: 1.5 },
  termoBlockDesc: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  termoEmpty: { fontFamily: fonts.sans, fontSize: 13 },
  termoMeta: { fontFamily: fonts.mono, fontSize: 13 },
  termoVerificado: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.5 },
  termoInput: {
    fontFamily: fonts.mono,
    fontSize: 13,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 46,
  },
  termoActions: { flexDirection: "row", gap: 10 },
  termoBtnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 46,
    paddingHorizontal: 20,
    flex: 1,
  },
  termoBtnPrimaryText: { fontFamily: fonts.sansMedium, fontSize: 14 },
  termoBtnOutline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 46,
    paddingHorizontal: 18,
    borderWidth: 1,
  },
  termoBtnOutlineText: { fontFamily: fonts.sansMedium, fontSize: 14 },
});
