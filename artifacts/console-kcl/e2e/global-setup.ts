import type { FullConfig } from "@playwright/test";

/**
 * Verifies the shared dev servers the e2e suite depends on are reachable before
 * any test runs, so failures point at "start the workflow" instead of cryptic
 * navigation timeouts. The Console and the API share the proxy origin
 * (REPLIT_DEV_DOMAIN): the Console at "/" and the API at "/api".
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
  const appDomain = process.env.REPLIT_DEV_DOMAIN;

  if (!appDomain) {
    throw new Error("REPLIT_DEV_DOMAIN is not set — cannot reach the Console or API.");
  }

  const apiHealth = `https://${appDomain}/api/healthz`;
  if (!(await reachable(apiHealth))) {
    throw new Error(
      `API server not reachable at ${apiHealth}. ` +
        'Start the "artifacts/api-server: API Server" workflow before running the e2e tests.',
    );
  }

  const consoleHome = `https://${appDomain}/`;
  if (!(await reachable(consoleHome))) {
    throw new Error(
      `Console web app not reachable at ${consoleHome}. ` +
        'Start the "artifacts/console-kcl: web" workflow before running the e2e tests.',
    );
  }
}
