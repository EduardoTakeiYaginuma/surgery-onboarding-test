import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";

/** Resolved palette actually applied to the UI. */
export type ThemeName = "dark" | "light";
/** User-selectable mode: the two explicit choices plus "follow the OS". */
export type ThemeMode = "dark" | "light" | "system";

const STORAGE_KEY = "kcl-mobile-theme";

type ThemeContextValue = {
  /** Resolved palette (dark/light), with "system" already collapsed. */
  theme: ThemeName;
  /** The user's chosen mode, including "system". */
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  /** Cycles Escuro → Claro → Sistema → Escuro. */
  cycleMode: () => void;
  /** True once the persisted choice has been read from storage. */
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  mode: "dark",
  setMode: () => {},
  cycleMode: () => {},
  ready: false,
});

const CYCLE: ThemeMode[] = ["dark", "light", "system"];

/**
 * Holds the user's theme mode (default dark — the Console identity) and persists
 * it across app restarts via AsyncStorage. When the mode is "system" the
 * resolved palette follows the OS appearance and flips live as the device
 * switches between day and night.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");
  const [ready, setReady] = useState(false);
  const systemScheme = useColorScheme();

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value === "light" || value === "dark" || value === "system") {
          setModeState(value);
        }
      })
      .finally(() => setReady(true));
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  const cycleMode = () => {
    setMode(CYCLE[(CYCLE.indexOf(mode) + 1) % CYCLE.length]);
  };

  const theme: ThemeName =
    mode === "system" ? (systemScheme === "light" ? "light" : "dark") : mode;

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, mode, setMode, cycleMode, ready }),
    [theme, mode, ready],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useThemePreference() {
  return useContext(ThemeContext);
}

/**
 * Provides a fixed, read-only theme to its subtree, overriding the ambient
 * Console choice. Used to render the patient-page preview in the register the
 * patient actually saved (server `tema`), independent of the secretary's
 * Console light/dark. The setters are intentional no-ops — the preview only
 * mirrors the patient's choice and never persists from here.
 */
export function ThemeScope({
  theme,
  children,
}: {
  theme: ThemeName;
  children: React.ReactNode;
}) {
  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      mode: theme,
      setMode: () => {},
      cycleMode: () => {},
      ready: true,
    }),
    [theme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
