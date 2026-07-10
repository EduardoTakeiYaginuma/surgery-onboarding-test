#!/usr/bin/env bash
# Reinicia o backend (api-server) SEMPRE com o código atual.
# Contorna o problema do pnpm no Mac: NÃO chama pnpm. Usa só o Node do sistema.
#   1) rebuilda o bundle com `node build.mjs` (esbuild, ~0.3s) — bundla o src do
#      api-server E o src de todas as libs @workspace/* (todas resolvem de ./src).
#   2) sobe o bundle com `node --env-file`.
# Requisito único: node_modules já instalado (o `pnpm install` é o passo que
# quebra no Mac, não o build). Pule o rebuild com: ./restart-back.sh --no-build
#
# Uso:
#   ./restart-back.sh            # rebuilda + sobe (recomendado)
#   ./restart-back.sh --no-build # sobe o bundle atual sem rebuildar
# Ctrl+C para parar.

set -euo pipefail

# Diretório deste script (raiz do surgery-onboarding), independente de onde é chamado.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$ROOT/artifacts/api-server"
ENV_FILE="$ROOT/.env"
BUNDLE="$API_DIR/dist/index.mjs"

# Porta do .env (default 5000).
PORT="$(grep -E '^PORT=' "$ENV_FILE" | head -1 | cut -d= -f2 | tr -d '[:space:]')"
PORT="${PORT:-5000}"

[ -f "$ENV_FILE" ] || { echo ".env não encontrado: $ENV_FILE"; exit 1; }

# Rebuild (a menos que --no-build), pra garantir que sobe o código atual.
if [ "${1:-}" != "--no-build" ]; then
  echo "Rebuildando bundle (node build.mjs)..."
  ( cd "$API_DIR" && node build.mjs )
fi

[ -f "$BUNDLE" ] || { echo "Bundle não encontrado: $BUNDLE (rode sem --no-build)"; exit 1; }

# Mata qualquer processo já ocupando a porta (restart limpo).
if lsof -ti tcp:"$PORT" >/dev/null 2>&1; then
  echo "Matando processo na porta $PORT..."
  lsof -ti tcp:"$PORT" | xargs kill -9 2>/dev/null || true
  sleep 1
fi

echo "Subindo api-server na porta $PORT (Ctrl+C para parar)..."
cd "$API_DIR"
exec node --env-file="$ENV_FILE" --enable-source-maps "$BUNDLE"
