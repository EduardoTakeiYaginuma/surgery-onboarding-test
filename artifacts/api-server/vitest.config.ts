import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // USE_PGLITE=1 faz o @workspace/db usar um Postgres em memória (PGlite) em
    // vez de conectar no banco real — nenhum teste grava em produção.
    // LOG_LEVEL silencia o logger pino-http (mantém a saída limpa).
    env: { LOG_LEVEL: "silent", USE_PGLITE: "1" },
    // Cria o PGlite e aplica o schema antes de cada arquivo de teste.
    setupFiles: ["./src/test-setup.ts"],
    // Cada arquivo roda isolado (padrão) → um banco PGlite limpo por arquivo.
    // Serial mantém o comportamento determinístico dos testes de integração.
    fileParallelism: false,
  },
  resolve: {
    // Resolve @workspace/* packages to their TypeScript source (the same
    // "workspace" export condition tsc uses), so tests run against source.
    conditions: ["workspace"],
  },
});
