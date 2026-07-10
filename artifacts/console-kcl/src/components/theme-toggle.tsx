import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

// Cycle order matches the mobile Console: Escuro → Claro → Sistema → Escuro.
const ORDER = ["dark", "light", "system"] as const;
type ThemeMode = (typeof ORDER)[number];

const META: Record<ThemeMode, { label: string; Icon: typeof Moon }> = {
  dark: { label: "Escuro", Icon: Moon },
  light: { label: "Claro", Icon: Sun },
  system: { label: "Sistema", Icon: Monitor },
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Before mount the persisted choice is unknown; default to the dark identity.
  const mode: ThemeMode = mounted && theme && theme in META
    ? (theme as ThemeMode)
    : "dark";
  const { label, Icon } = META[mode];

  const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Tema: ${label}. Mudar para ${META[next].label}`}
      className="flex items-center gap-2 text-muted-foreground hover:text-accent transition-colors text-xs font-light"
    >
      <Icon className="w-4 h-4" strokeWidth={1.5} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
