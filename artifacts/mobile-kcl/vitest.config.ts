import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Apenas testes unitários (node-safe). Os e2e do Playwright ficam fora.
    include: ["lib/**/*.test.ts"],
  },
});
