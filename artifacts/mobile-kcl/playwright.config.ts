import { execSync } from "node:child_process";

import { defineConfig } from "@playwright/test";

/**
 * E2E tests for the Console KCL mobile companion (Expo web target).
 *
 * These run against the SHARED, already-running dev servers:
 *   - the Expo dev server  ("artifacts/mobile-kcl: expo" workflow)
 *   - the API server       ("artifacts/api-server: API Server" workflow)
 * and the shared development database. `e2e/global-setup.ts` fails fast with a
 * clear message if either server is not reachable.
 *
 * The browser is the Nix-provided system Chromium (resolved via `which chromium`)
 * so no Playwright browser download is required. Override with
 * PLAYWRIGHT_CHROMIUM_PATH if needed.
 */

function resolveChromium(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  try {
    return execSync("which chromium", { encoding: "utf8" }).trim() || undefined;
  } catch {
    return undefined;
  }
}

const expoDomain = process.env.REPLIT_EXPO_DEV_DOMAIN;
if (!expoDomain) {
  throw new Error(
    "REPLIT_EXPO_DEV_DOMAIN is not set. Run the e2e tests inside the Replit workspace " +
      "with the mobile Expo dev server running.",
  );
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `https://${expoDomain}`,
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
    permissions: ["clipboard-read", "clipboard-write"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 400, height: 720 },
    launchOptions: { executablePath: resolveChromium() },
  },
});
