import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { fonts } from "@/constants/fonts";
import { useColors } from "@/hooks/useColors";
import { useThemePreference, type ThemeMode } from "@/hooks/useTheme";

const META: Record<
  ThemeMode,
  { label: string; icon: keyof typeof Feather.glyphMap }
> = {
  dark: { label: "Escuro", icon: "moon" },
  light: { label: "Claro", icon: "sun" },
  system: { label: "Sistema", icon: "smartphone" },
};

export function ThemeToggle({ size = 18 }: { size?: number }) {
  const colors = useColors();
  const { mode, cycleMode } = useThemePreference();
  const { label, icon } = META[mode];

  return (
    <Pressable
      onPress={cycleMode}
      hitSlop={12}
      style={styles.row}
      testID="theme-toggle"
      accessibilityRole="button"
      accessibilityLabel={`Tema: ${label}. Tocar para alternar`}
    >
      <Feather name={icon} size={size} color={colors.mutedForeground} />
      <Text style={[styles.label, { color: colors.mutedForeground }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  label: {
    fontFamily: fonts.expanded,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
});
