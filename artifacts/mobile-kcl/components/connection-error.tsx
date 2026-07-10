import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EstratosLogo } from "@/components/brand";
import { fonts } from "@/constants/fonts";
import { useColors } from "@/hooks/useColors";

type ConnectionErrorProps = {
  onRetry: () => void;
  isRetrying?: boolean;
};

/**
 * Friendly "we can't reach the server right now" view for data-driven mobile
 * screens. Shown only for connectivity errors (network down / server
 * restarting / gateway 5xx) — genuine not-found / invalid cases keep their own
 * wording. Mirrors the Console web behavior (task #42) in the mobile register.
 */
export function ConnectionError({ onRetry, isRetrying = false }: ConnectionErrorProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = (Platform.OS === "web" ? 67 : insets.top) + 12;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: topPad }]}>
      <View style={styles.content}>
        <EstratosLogo size={28} />
        <Feather name="wifi-off" size={26} color={colors.mutedForeground} style={styles.icon} />
        <Text style={[styles.title, { color: colors.foreground }]}>
          Sem conexão com o servidor
        </Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          Não foi possível carregar os dados agora. Isso costuma ser temporário —
          seus dados estão seguros. Tente novamente em instantes.
        </Text>

        <Pressable
          onPress={onRetry}
          disabled={isRetrying}
          style={[
            styles.retryBtn,
            { backgroundColor: colors.ivory, opacity: isRetrying ? 0.6 : 1 },
          ]}
          testID="connection-retry"
        >
          {isRetrying ? (
            <ActivityIndicator size="small" color={colors.ivoryForeground} />
          ) : (
            <Feather name="refresh-cw" size={16} color={colors.ivoryForeground} />
          )}
          <Text style={[styles.retryText, { color: colors.ivoryForeground }]}>
            {isRetrying ? "Tentando..." : "Tentar novamente"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  content: { alignItems: "center", gap: 14, maxWidth: 420 },
  icon: { marginTop: 4 },
  title: { fontFamily: fonts.serifLight, fontSize: 28, textAlign: "center", marginTop: 4 },
  body: { fontFamily: fonts.sans, fontSize: 15, textAlign: "center", lineHeight: 22 },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
    height: 50,
    marginTop: 12,
    alignSelf: "stretch",
  },
  retryText: { fontFamily: fonts.sansMedium, fontSize: 15 },
});
