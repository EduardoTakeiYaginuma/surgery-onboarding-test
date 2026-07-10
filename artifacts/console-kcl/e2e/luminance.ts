import { expect, type Locator } from "@playwright/test";

/**
 * Shared computed-color helpers for the light/dark regression guards. Rather
 * than eyeball screenshots, the theme specs assert on COMPUTED colors so a
 * future change that re-introduces a hardcoded color (a surface stuck in the
 * wrong register, or unreadable same-tone text) fails deterministically.
 */

/** Perceived luminance (0 dark … 1 light) of an element's own background. */
export async function bgLuminance(locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
    const [r, g, b] = m;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  });
}

/** Perceived luminance (0 dark … 1 light) of an element's text color. */
export async function textLuminance(locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    const m = getComputedStyle(el).color.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
    const [r, g, b] = m;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  });
}

/**
 * Asserts a surface matches the active mode: its background sits on the right
 * side of the light/dark divide AND its text keeps readable contrast against it.
 */
export async function expectSurfaceMatchesMode(
  mode: "dark" | "light",
  surface: Locator,
  text: Locator,
): Promise<void> {
  const bg = await bgLuminance(surface);
  const fg = await textLuminance(text);
  if (mode === "dark") {
    expect(bg, "dark surface should have a dark background").toBeLessThan(0.4);
    expect(fg, "dark surface text should be light").toBeGreaterThan(0.5);
  } else {
    expect(bg, "light surface should have a light background").toBeGreaterThan(0.55);
    expect(fg, "light surface text should be dark").toBeLessThan(0.45);
  }
  // Guards against same-tone (unreadable) text regardless of mode.
  expect(Math.abs(bg - fg), "text must keep contrast against its background").toBeGreaterThan(0.3);
}
