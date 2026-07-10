import { execSync } from "node:child_process";

import { defineConfig } from "@playwright/test";

/**
 * E2E tests for the web Console (Console do Pré-Op · KCL).
 *
 * These run against the SHARED, already-running dev servers:
 *   - the Console Vite dev server ("artifacts/console-kcl: web" workflow)
 *   - the API server             ("artifacts/api-server: API Server" workflow)
 * and the shared development database. `e2e/global-setup.ts` fails fast with a
 * clear message if either server is not reachable.
 *
 * The Console is served at the root path "/" of the shared proxy domain
 * (REPLIT_DEV_DOMAIN), so the API lives under the same origin at "/api".
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

const appDomain = process.env.REPLIT_DEV_DOMAIN;
if (!appDomain) {
  throw new Error(
    "REPLIT_DEV_DOMAIN is not set. Run the e2e tests inside the Replit workspace " +
      "with the Console web dev server running.",
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
    baseURL: `https://${appDomain}`,
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 800 },
    launchOptions: { executablePath: resolveChromium() },
  },
});
