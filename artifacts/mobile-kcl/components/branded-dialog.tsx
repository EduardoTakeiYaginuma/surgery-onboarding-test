import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { fonts } from "@/constants/fonts";
import { useColors } from "@/hooks/useColors";

/**
 * Camada-styled dialog shared by every confirmation and notice on the mobile
 * Console. Replaces React Native's OS-default Alert / the browser's
 * window.confirm — both unstyled and off-brand — with a single branded RN Modal
 * that renders consistently on native and web.
 *
 * Two shapes:
 *  - confirm: a cancel + confirm pair (pass `cancelText` + `onConfirm`). Set
 *    `destructive` to tint the confirm action with the destructive token.
 *  - notice: a single dismiss button (omit `cancelText`/`onConfirm`).
 *
 * The unsaved-changes guard and the imperative useDialogs() provider both drive
 * this component; screens never instantiate it directly.
 */
export function BrandedDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  message,
  cancelText,
  confirmText = "Entendi",
  destructive = false,
  confirmTestID,
  cancelTestID,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm?: () => void;
  title: string;
  message?: string;
  cancelText?: string;
  confirmText?: string;
  destructive?: boolean;
  confirmTestID?: string;
  cancelTestID?: string;
}) {
  const colors = useColors();
  const isConfirm = !!cancelText;

  const confirmBg = destructive ? colors.destructive : colors.ivory;
  const confirmFg = destructive ? colors.destructiveForeground : colors.ivoryForeground;

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={() => onOpenChange(false)}
    >
      <Pressable style={styles.overlay} onPress={() => onOpenChange(false)}>
        <Pressable
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          {message ? (
            <Text style={[styles.body, { color: colors.mutedForeground }]}>{message}</Text>
          ) : null}

          <View style={styles.actions}>
            {isConfirm ? (
              <Pressable
                onPress={() => onOpenChange(false)}
                testID={cancelTestID}
                style={({ pressed }) => [
                  styles.cancelBtn,
                  { borderColor: colors.borderStrong, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[styles.cancelText, { color: colors.foreground }]}>{cancelText}</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => {
                if (onConfirm) onConfirm();
                else onOpenChange(false);
              }}
              testID={confirmTestID}
              style={({ pressed }) => [
                styles.confirmBtn,
                { backgroundColor: confirmBg, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={[styles.confirmText, { color: confirmFg }]}>{confirmText}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10,23,41,0.6)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderWidth: 1,
    padding: 24,
    gap: 12,
  },
  title: { fontFamily: fonts.serifLight, fontSize: 22 },
  body: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 21 },
  actions: { marginTop: 12, gap: 10 },
  cancelBtn: {
    height: 48,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { fontFamily: fonts.sansMedium, fontSize: 14 },
  confirmBtn: {
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmText: { fontFamily: fonts.sansMedium, fontSize: 15 },
});
