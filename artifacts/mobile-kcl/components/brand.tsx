import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";

import { fonts } from "@/constants/fonts";
import { useColors } from "@/hooks/useColors";
import { paletaDoMarco, rotuloDoMarco } from "@/lib/jornada-equipe";

export function EstratosLogo({ size = 24 }: { size?: number }) {
  const colors = useColors();
  const scale = size / 24;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={0} y={4} width={8} height={2} fill={colors.primary} />
      <Rect x={0} y={11} width={16} height={2} fill={colors.foreground} />
      <Rect x={0} y={18} width={24} height={2} fill={colors.foreground} />
    </Svg>
  );
}

/**
 * Badge do marco atual da jornada da equipe (10 marcos derivados no servidor).
 * O rótulo e a chave vêm do DTO da paciente; a paleta por fase fica em
 * `lib/jornada-equipe`. Substitui o antigo StageBadge do funil de 4 etapas.
 */
export function MarcoBadge({
  marco,
  rotulo,
}: {
  marco: string | null;
  rotulo: string | null;
}) {
  const colors = useColors();
  const palette = paletaDoMarco(marco, colors);

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.badgeText, { color: palette.fg }]} numberOfLines={1}>
        {rotuloDoMarco(rotulo).toUpperCase()}
      </Text>
    </View>
  );
}

const CONTRATO_LABEL: Record<string, string> = {
  assinado: "Assinado",
  pendente: "Pendente",
  recusado: "Recusado",
  indisponivel: "Indisponível",
};

/**
 * Status badge for contrato / termo (TCLE), mirroring the web Console's
 * `contratoVisual` mapping. Pass `prefix="TCLE"` to label a termo badge.
 */
export function ContratoBadge({
  status,
  prefix,
}: {
  status: string | null;
  prefix?: string;
}) {
  const colors = useColors();

  const palette = (() => {
    switch (status) {
      case "assinado":
        return { fg: colors.foreground, border: "rgba(201,169,110,0.6)" };
      case "pendente":
        return { fg: colors.primary, border: "rgba(201,169,110,0.4)" };
      case "recusado":
        return { fg: "#E06A6A", border: "rgba(224,106,106,0.45)" };
      case "indisponivel":
        return { fg: colors.mutedForeground, border: "rgba(151,163,180,0.3)" };
      default:
        return { fg: colors.mutedForeground, border: colors.borderStrong };
    }
  })();

  const label = status ? CONTRATO_LABEL[status] ?? "—" : "—";

  return (
    <View style={[styles.badge, { borderColor: palette.border }]}>
      <Text style={[styles.badgeText, { color: palette.fg }]} numberOfLines={1}>
        {prefix ? `${prefix} ${label}` : label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
  },
});
