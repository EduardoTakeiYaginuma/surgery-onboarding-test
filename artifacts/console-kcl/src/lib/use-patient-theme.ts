import { useCallback, useEffect, useRef, useState } from "react";
import { useDefinirTemaPaciente } from "@workspace/api-client-react";

export type PatientTheme = "light" | "dark";

/**
 * The public patient page keeps its own persisted theme choice, fully separate
 * from the Console's stored theme (`kcl-console-theme`). A patient toggling dark
 * never alters the secretary's Console default, and vice-versa.
 *
 * Persistence has two layers, both scoped to the patient token so two different
 * patients on the same shared device never inherit each other's choice:
 *  - localStorage (`kcl-paciente-theme:<token>`) is the device-local fast path
 *    so the chosen register paints immediately, before the server response.
 *  - The server (keyed to the patient token) is the cross-device source of
 *    truth: when a saved choice comes back from the page payload it wins over
 *    the local value, so the register follows the patient onto any new device.
 *
 * Precedence: server `light|dark` wins once it arrives. Until then the
 * token-scoped local value applies. With neither (first ever open, or a
 * different patient on this device), it falls back to the clinic-configured
 * default register (`defaultTheme`, itself defaulting to light).
 */
const STORAGE_PREFIX = "kcl-paciente-theme";

function chaveLocal(token: string): string | null {
  return token ? `${STORAGE_PREFIX}:${token}` : null;
}

export function usePatientTheme(
  token: string,
  serverTheme?: PatientTheme | null,
  defaultTheme: PatientTheme = "light",
) {
  const [theme, setThemeState] = useState<PatientTheme>(defaultTheme);
  const { mutate: salvarTema } = useDefinirTemaPaciente();

  // Once the patient has made (or restored) an explicit choice for THIS token
  // the late-arriving server payload must not override it. Reset on token
  // change so a different patient on the same device starts fresh.
  const escolhaFixada = useRef(false);

  // Reset + device-local fast path, re-run whenever the token changes. A
  // different patient must never inherit the previous patient's register, so we
  // start from light and only apply this token's own saved value.
  useEffect(() => {
    escolhaFixada.current = false;
    let inicial: PatientTheme = defaultTheme;
    const chave = chaveLocal(token);
    if (chave) {
      try {
        const raw = localStorage.getItem(chave);
        if (raw === "light" || raw === "dark") inicial = raw;
      } catch {
        /* ignore availability errors */
      }
    }
    setThemeState(inicial);
  }, [token, defaultTheme]);

  // Cross-device source of truth: the saved server choice wins once, and is
  // mirrored back into this token's localStorage so the device stays in sync.
  // A null server value means "never chosen" — we leave the configured default
  // (or the token-scoped local value) untouched.
  useEffect(() => {
    if (escolhaFixada.current) return;
    if (serverTheme === "light" || serverTheme === "dark") {
      escolhaFixada.current = true;
      setThemeState(serverTheme);
      const chave = chaveLocal(token);
      if (chave) {
        try {
          localStorage.setItem(chave, serverTheme);
        } catch {
          /* ignore quota/availability errors */
        }
      }
    }
  }, [serverTheme, token]);

  const setTheme = useCallback(
    (next: PatientTheme) => {
      escolhaFixada.current = true;
      setThemeState(next);
      const chave = chaveLocal(token);
      if (chave) {
        try {
          localStorage.setItem(chave, next);
        } catch {
          /* ignore quota/availability errors */
        }
      }
      if (token) {
        // Best-effort persistence; the local choice already applied, so a
        // failed save just means it won't follow to another device yet.
        salvarTema({ token, data: { tema: next } });
      }
    },
    [token, salvarTema],
  );

  const toggle = useCallback(
    () => setTheme(theme === "dark" ? "light" : "dark"),
    [theme, setTheme],
  );

  return { theme, setTheme, toggle };
}
