/**
 * Camada brand tokens — dual register.
 *
 * Mirrors the sibling web artifact (artifacts/console-kcl/src/index.css):
 *  - `dark`  = Meia-noite & Marinho-profundo (the Console's default identity)
 *  - `light` = Linho & Marfim (brandbook-compliant light register)
 *
 * The active palette is chosen by the user's explicit theme choice via the
 * ThemeProvider (hooks/useTheme), not the device appearance setting.
 *
 * Champagne ("só em fio") stays an accent/hairline only — never a fill. On the
 * light register champagne text uses the darker #8A6B33 per the playbook.
 */

const darkBrand = {
  // Legacy aliases (kept for backward compatibility)
  text: "#F4F1E8",
  tint: "#C9A96E",

  // Core surfaces — Meia-noite
  background: "#0A1729",
  foreground: "#F4F1E8", // Marfim

  // Cards / elevated surfaces — Marinho-profundo
  card: "#11294A",
  cardForeground: "#F4F1E8",

  // Primary action color — Champanhe (used as accent text/numerals, never fill)
  primary: "#C9A96E",
  primaryForeground: "#0A1729",

  // Ivory call-to-action surface (high-emphasis buttons)
  ivory: "#F4F1E8",
  ivoryForeground: "#0A1729",

  // Secondary surfaces
  secondary: "#1B3A63",
  secondaryForeground: "#F4F1E8",

  // Muted / subdued elements — Brisa
  muted: "#11294A",
  mutedForeground: "#97A3B4",

  // Body text inside generated blocks
  bodyText: "#E2E8F0",

  // Accent highlights — Champanhe
  accent: "#C9A96E",
  accentForeground: "#0A1729",

  // Destructive actions
  destructive: "#7A1F1F",
  destructiveForeground: "#F4F1E8",

  // Borders and input outlines
  border: "#11294A",
  borderStrong: "#1B3A63",
  input: "#11294A",
};

const lightBrand: typeof darkBrand = {
  // Legacy aliases
  text: "#0A1729",
  tint: "#8A6B33",

  // Core surfaces — Linho
  background: "#EBE5D5",
  foreground: "#0A1729", // Meia-noite

  // Cards / elevated surfaces — Marfim
  card: "#F4F1E8",
  cardForeground: "#0A1729",

  // Primary action color — Meia-noite (high-emphasis button fill on light)
  primary: "#0A1729",
  primaryForeground: "#F4F1E8",

  // Ivory call-to-action surface — Meia-noite fill on light, Marfim text
  ivory: "#0A1729",
  ivoryForeground: "#F4F1E8",

  // Secondary surfaces — Marfim
  secondary: "#F4F1E8",
  secondaryForeground: "#0A1729",

  // Muted / subdued elements
  muted: "#DED3BA",
  mutedForeground: "#11294A",

  // Body text inside generated blocks
  bodyText: "#11294A",

  // Accent highlights — champanhe escurecido para texto sobre claro
  accent: "#8A6B33",
  accentForeground: "#0A1729",

  // Destructive actions
  destructive: "#EF4343",
  destructiveForeground: "#FFFFFF",

  // Borders and input outlines — champanhe em fio
  border: "#C9A96E",
  borderStrong: "#8A6B33",
  input: "#F4F1E8",
};

const colors = {
  light: lightBrand,
  dark: darkBrand,

  // Border radius (in px). The web brand uses --radius: 0rem (square corners).
  radius: 0,
};

export default colors;
