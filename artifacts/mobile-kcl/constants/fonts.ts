/**
 * Camada brand typography.
 *
 * Mirrors the web artifact's font stack:
 *  - Spectral (serif) for patient names and page titles
 *  - Archivo (sans) for UI / body
 *  - Archivo + wide tracking for "expanded" uppercase labels (the web uses
 *    Archivo Expanded, which is not available as a static Google Font on
 *    mobile — the expanded look is reproduced via letterSpacing)
 *  - IBM Plex Mono for data, codes, dates and values
 */
export const fonts = {
  serifLight: "Spectral_300Light",
  serif: "Spectral_400Regular",
  serifMedium: "Spectral_500Medium",

  sans: "Archivo_400Regular",
  sansMedium: "Archivo_500Medium",
  sansSemibold: "Archivo_600SemiBold",
  sansBold: "Archivo_700Bold",

  // Used for the uppercase, wide-tracked brand labels.
  expanded: "Archivo_600SemiBold",

  mono: "IBMPlexMono_400Regular",
  monoMedium: "IBMPlexMono_500Medium",
} as const;
