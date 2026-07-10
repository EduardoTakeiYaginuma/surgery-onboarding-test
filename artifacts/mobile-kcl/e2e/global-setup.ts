import type { FullConfig } from "@playwright/test";

/**
 * Verifies the shared dev servers the e2e suite depends on are reachable before
 * any test runs, so failures point at "start the workflow" instead of cryptic
 * navigation timeouts.
 */
async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const apiDomain = process.env.REPLIT_DEV_DOMAIN;
  const expoDomain = process.env.REPLIT_EXPO_DEV_DOMAIN;

  if (!apiDomain) {
    throw new Error("REPLIT_DEV_DOMAIN is not set — cannot reach the API server.");
  }

  const apiHealth = `https://${apiDomain}/api/healthz`;
  if (!(await reachable(apiHealth))) {
    throw new Error(
      `API server not reachable at ${apiHealth}. ` +
        'Start the "artifacts/api-server: API Server" workflow before running the e2e tests.',
    );
  }

  const expoStatus = `https://${expoDomain}/status`;
  if (!(await reachable(expoStatus))) {
    throw new Error(
      `Expo dev server not reachable at ${expoStatus}. ` +
        'Start the "artifacts/mobile-kcl: expo" workflow before running the e2e tests.',
    );
  }
}
