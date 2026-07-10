import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { fonts } from "@/constants/fonts";
import { useColors } from "@/hooks/useColors";
import { formatDate } from "@/lib/format";

type Mode = "date" | "time";

const pad = (n: number) => String(n).padStart(2, "0");

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Turn the stored string value into a Date for the picker's initial value. */
function valueToDate(mode: Mode, value: string): Date {
  if (mode === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  }
  if (mode === "time" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    const [h, mm] = value.split(":").map(Number);
    const d = new Date();
    d.setHours(h, mm, 0, 0);
    return d;
  }
  const now = new Date();
  if (mode === "date") now.setHours(12, 0, 0, 0);
  return now;
}

/**
 * Cross-platform date / time field for the registration form.
 *
 * - iOS: taps reveal an inline spinner picker with a "Concluir" button.
 * - Android: taps open the native calendar / clock dialog imperatively.
 * - Web (Expo preview): falls back to a native HTML date/time input so the
 *   field still works in the browser, since the native module renders nothing
 *   on web.
 *
 * The value is always kept in ISO `YYYY-MM-DD` (date) or `HH:MM` (time) so the
 * API contract is unchanged.
 */
export function DateTimeField({
  mode,
  value,
  onChange,
  placeholder,
  error,
  testID,
  minimumDate,
}: {
  mode: Mode;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  error?: boolean;
  testID?: string;
  /** Earliest selectable date (date mode only). Applies on iOS, Android & web. */
  minimumDate?: Date;
}) {
  const colors = useColors();
  const [showIos, setShowIos] = useState(false);

  const borderColor = error ? colors.destructive : colors.borderStrong;

  if (Platform.OS === "web") {
    // react-native-web renders through react-dom, so a raw DOM input gives us a
    // real browser calendar / clock picker in the Expo web preview.
    return React.createElement("input", {
      type: mode === "date" ? "date" : "time",
      value,
      "data-testid": testID,
      min: mode === "date" && minimumDate ? toIsoDate(minimumDate) : undefined,
      onChange: (e: { target: { value: string } }) => onChange(e.target.value),
      style: {
        height: 50,
        boxSizing: "border-box",
        width: "100%",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor,
        backgroundColor: colors.card,
        color: colors.foreground,
        paddingLeft: 14,
        paddingRight: 14,
        fontFamily: fonts.mono,
        fontSize: 15,
        borderRadius: colors.radius,
        outline: "none",
      },
    });
  }

  const current = valueToDate(mode, value);

  const handleChange = (
    event: { type?: string },
    selected?: Date | undefined
  ) => {
    if (Platform.OS === "android") {
      setShowIos(false);
      if (event.type === "set" && selected) {
        onChange(mode === "date" ? toIsoDate(selected) : toTime(selected));
      }
      return;
    }
    if (selected) {
      onChange(mode === "date" ? toIsoDate(selected) : toTime(selected));
    }
  };

  const open = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode,
        is24Hour: true,
        minimumDate: mode === "date" ? minimumDate : undefined,
        onChange: handleChange,
      });
    } else {
      setShowIos((s) => !s);
    }
  };

  const display = value
    ? mode === "date"
      ? formatDate(value)
      : value
    : placeholder;

  return (
    <View>
      <Pressable
        onPress={open}
        testID={testID}
        style={[
          styles.input,
          { backgroundColor: colors.card, borderColor },
        ]}
      >
        <Text
          style={[
            styles.value,
            { color: value ? colors.foreground : colors.mutedForeground },
          ]}
        >
          {display}
        </Text>
        <Feather
          name={mode === "date" ? "calendar" : "clock"}
          size={18}
          color={colors.mutedForeground}
        />
      </Pressable>

      {Platform.OS === "ios" && showIos ? (
        <View style={[styles.iosPanel, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}>
          <DateTimePicker
            value={current}
            mode={mode}
            display="spinner"
            is24Hour
            minimumDate={mode === "date" ? minimumDate : undefined}
            themeVariant={colors.background === "#0A1729" ? "dark" : "light"}
            onChange={handleChange}
          />
          <Pressable
            onPress={() => setShowIos(false)}
            style={styles.iosDone}
            testID={testID ? `${testID}-concluir` : undefined}
          >
            <Text style={[styles.iosDoneText, { color: colors.primary }]}>Concluir</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 50,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  value: { fontFamily: fonts.mono, fontSize: 15 },
  iosPanel: { borderWidth: 1, marginTop: 8 },
  iosDone: { alignItems: "flex-end", paddingHorizontal: 16, paddingBottom: 12 },
  iosDoneText: { fontFamily: fonts.sansMedium, fontSize: 15 },
});
