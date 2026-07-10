import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { type PaginaPacienteTema, type SecaoConteudo } from "@workspace/api-client-react";
import { type IdentidadeMedica } from "@workspace/secoes";

import {
  PaginaPreview,
  type PreviewConfirmacoes,
  type PreviewDados,
  type PreviewPagamento,
} from "@/components/secoes-preview";
import { fonts } from "@/constants/fonts";
import { useColors } from "@/hooks/useColors";
import { ThemeScope } from "@/hooks/useTheme";
import { contagemRegressiva, diasAteCirurgia, etapaAtual } from "@/lib/patient-tools";

/** Limites do controle fino de dias até a cirurgia na pré-visualização. */
const DIAS_MIN = -7;
const DIAS_MAX_PADRAO = 30;

/**
 * Os 5 momentos da jornada que a equipe pode simular na pré-visualização —
 * alinhados a `etapaAtual` (mesmos índices), espelhando o Console web. Cada um
 * traz um nº representativo de dias até a cirurgia para mover a contagem
 * regressiva junto com a etapa.
 */
const ETAPAS_JORNADA: { rotulo: string; dias: number }[] = [
  { rotulo: "Reserva confirmada", dias: 21 },
  { rotulo: "7 a 10 dias antes", dias: 7 },
  { rotulo: "Véspera", dias: 1 },
  { rotulo: "Dia da cirurgia", dias: 0 },
  { rotulo: "Pós-operatório", dias: -3 },
];

/**
 * Prévia da página da paciente com controle fino do momento da jornada — o
 * espelho móvel do modal de pré-visualização do Console web. A equipe pode
 * pular para um marco (atalhos) ou ajustar um nº exato de dias até a cirurgia;
 * a etapa, o destaque da linha do tempo e a contagem regressiva derivam todos
 * do mesmo dia efetivo, então atalhos e controle ficam sempre em sincronia.
 *
 * O controle vive no registro do Console (chrome da equipe); só a prévia em si
 * é embrulhada no `ThemeScope` com o tema da paciente. Sem persistência — é um
 * espelho visual, igual à versão web.
 */
export function PaginaPreviewSimulada({
  secoes,
  tema,
  dataCirurgia,
  identidade,
  dados,
  pagamento,
  confirmacoes,
}: {
  secoes: SecaoConteudo[];
  tema: PaginaPacienteTema;
  /** Data da cirurgia em ISO (yyyy-mm-dd), base do dia real. */
  dataCirurgia: string;
  /**
   * Cabeçalho de identidade da médica, repassado à prévia (capa/identidade).
   * A simulação só move a etapa/contagem; estes dados refletem o caso real.
   */
  identidade?: IdentidadeMedica;
  /** Dados da cirurgia (capa + grid de fatos), repassados à prévia. */
  dados?: PreviewDados;
  /** Situação financeira (linha de honorários), repassada à prévia. */
  pagamento?: PreviewPagamento;
  /** Situação de contrato/termo (bloco "Agora"/"Tudo certo"), repassada à prévia. */
  confirmacoes?: PreviewConfirmacoes;
}) {
  const colors = useColors();

  // `null` = usa os dias reais calculados pela data da cirurgia. Como esta tela
  // só é montada quando a seção "Página da paciente" é aberta, o estado começa
  // sempre no momento real.
  const [diasSimulado, setDiasSimulado] = useState<number | null>(null);

  const diasReais = diasAteCirurgia(dataCirurgia);
  // O controle precisa alcançar o dia real mesmo quando a cirurgia está distante.
  const diasMax = Math.max(DIAS_MAX_PADRAO, diasReais);
  // Dia efetivo: o simulado quando há um, senão o real. Etapa, destaque e
  // contagem derivam dele — então atalhos e controle nunca divergem.
  const diasEfetivos = diasSimulado ?? diasReais;
  const passoAtual = etapaAtual(diasEfetivos);
  const contagem = contagemRegressiva(diasEfetivos);
  const simulando = diasSimulado !== null && diasEfetivos !== diasReais;

  const ajustarDias = (valor: number) => {
    if (Number.isNaN(valor)) return;
    setDiasSimulado(Math.min(diasMax, Math.max(DIAS_MIN, Math.round(valor))));
  };

  return (
    <View>
      <View style={styles.controle}>
        <Text style={[styles.controleLabel, { color: colors.primary }]}>
          SIMULAR MOMENTO DA JORNADA
        </Text>

        <View style={styles.atalhos}>
          {ETAPAS_JORNADA.map((etapa, idx) => {
            const ativo = idx === passoAtual;
            return (
              <Pressable
                key={etapa.rotulo}
                onPress={() => ajustarDias(etapa.dias)}
                accessibilityRole="button"
                accessibilityState={{ selected: ativo }}
                testID={`simular-etapa-${idx}`}
                style={[
                  styles.atalho,
                  ativo
                    ? { backgroundColor: colors.primary, borderColor: colors.primary }
                    : { borderColor: colors.borderStrong },
                ]}
              >
                <Text
                  style={[
                    styles.atalhoText,
                    { color: ativo ? colors.primaryForeground : colors.mutedForeground },
                  ]}
                >
                  {etapa.rotulo}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.diasRow}>
          <Text style={[styles.diasLabel, { color: colors.primary }]}>DIAS ATÉ A CIRURGIA</Text>
          <View style={styles.stepper}>
            <Pressable
              onPress={() => ajustarDias(diasEfetivos - 1)}
              disabled={diasEfetivos <= DIAS_MIN}
              accessibilityLabel="Diminuir um dia"
              testID="simular-menos"
              style={({ pressed }) => [
                styles.stepBtn,
                { borderColor: colors.borderStrong, opacity: diasEfetivos <= DIAS_MIN ? 0.4 : pressed ? 0.6 : 1 },
              ]}
            >
              <Feather name="minus" size={16} color={colors.foreground} />
            </Pressable>
            <TextInput
              value={String(diasEfetivos)}
              onChangeText={(t) => {
                const n = parseInt(t.replace(/[^0-9-]/g, ""), 10);
                if (!Number.isNaN(n)) ajustarDias(n);
              }}
              keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "number-pad"}
              accessibilityLabel="Dias até a cirurgia"
              testID="simular-dias"
              style={[styles.diasInput, { color: colors.foreground, borderColor: colors.borderStrong }]}
            />
            <Pressable
              onPress={() => ajustarDias(diasEfetivos + 1)}
              disabled={diasEfetivos >= diasMax}
              accessibilityLabel="Aumentar um dia"
              testID="simular-mais"
              style={({ pressed }) => [
                styles.stepBtn,
                { borderColor: colors.borderStrong, opacity: diasEfetivos >= diasMax ? 0.4 : pressed ? 0.6 : 1 },
              ]}
            >
              <Feather name="plus" size={16} color={colors.foreground} />
            </Pressable>
          </View>
        </View>

        <Text style={[styles.contagem, { color: colors.mutedForeground }]} testID="simular-contagem">
          {contagem}
          {simulando ? " · simulado" : ""}
        </Text>
      </View>

      <ThemeScope theme={tema === "dark" ? "dark" : "light"}>
        <PaginaPreview
          secoes={secoes}
          identidade={identidade}
          dados={dados}
          pagamento={pagamento}
          confirmacoes={confirmacoes}
          passoAtual={passoAtual}
        />
      </ThemeScope>
    </View>
  );
}

const styles = StyleSheet.create({
  controle: { gap: 10, paddingBottom: 16 },
  controleLabel: { fontFamily: fonts.expanded, fontSize: 9, letterSpacing: 1.5 },
  atalhos: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  atalho: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  atalhoText: { fontFamily: fonts.expanded, fontSize: 9, letterSpacing: 1.2 },
  diasRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 2 },
  diasLabel: { fontFamily: fonts.expanded, fontSize: 9, letterSpacing: 1.5, flexShrink: 1 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn: { width: 36, height: 36, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  diasInput: {
    width: 56,
    height: 36,
    borderWidth: 1,
    textAlign: "center",
    fontFamily: fonts.mono,
    fontSize: 15,
    paddingVertical: 0,
  },
  contagem: { fontFamily: fonts.mono, fontSize: 11 },
});
