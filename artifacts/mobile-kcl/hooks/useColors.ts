import colors from "@/constants/colors";
import { useThemePreference } from "@/hooks/useTheme";

/**
 * Returns the design tokens for the active theme.
 *
 * The active palette follows the user's explicit choice (held by the
 * ThemeProvider), defaulting to the dark "Console" register. The returned
 * object contains all color tokens for the active palette plus
 * scheme-independent values like `radius`.
 */
export function useColors() {
  const { theme } = useThemePreference();
  const palette = theme === "dark" ? colors.dark : colors.light;
  return { ...palette, radius: colors.radius };
}
