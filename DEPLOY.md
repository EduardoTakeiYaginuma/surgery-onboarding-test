# Deploy no Vercel

## Arquitetura (importante)

O app foi desenhado para **front e backend no mesmo domínio**. O frontend
(`artifacts/console-kcl`) chama a API como caminho relativo `/api/...`
(`import.meta.env.BASE_URL + "api/..."`) — ele **não** aponta para uma URL
absoluta de backend. Portanto, para o app funcionar no Vercel, o `/api`
precisa ser encaminhado (rewrite/proxy) para uma instância do `api-server`
hospedada em algum lugar.

O `api-server` (Express) **não** roda como site estático no Vercel — hospede-o
à parte (Railway, Render, Fly, uma VM, ou Vercel Functions com adaptação) e
aponte o rewrite de `/api` para a URL pública dele.

## Configuração do projeto no Vercel

- **Root Directory:** raiz do repositório (deixe como está — o `vercel.json`
  já cuida do build a partir da raiz do monorepo). Não aponte para a subpasta
  do app.
- **Framework Preset:** Other (o `vercel.json` já define `framework: null`).
- O `vercel.json` na raiz já define install, build e output:
  - install: `pnpm install --frozen-lockfile`
  - build: `BASE_PATH=/ PORT=3000 pnpm --filter @workspace/console-kcl build`
    (o `vite.config.ts` exige `PORT` e `BASE_PATH` no ambiente, mesmo no build —
    por isso vão inline; `PORT` só é usado pelo dev server, é inócuo no build)
  - output: `artifacts/console-kcl/dist/public`

## O que você precisa ajustar

Em `vercel.json`, troque `SUBSTITUA-PELO-HOST-DO-BACKEND` pela URL pública do
`api-server` (ex.: `https://surgery-api.up.railway.app`). Sem isso, as chamadas
`/api/*` vão cair no fallback do SPA e retornar HTML em vez de JSON.

## Backend: variáveis de ambiente

O `api-server` precisa das mesmas chaves do `.env` local (que **não** está
versionado). Configure no host do backend: `DATABASE_URL`, `PORT`, `BASE_PATH`,
`AUTENTIQUE_API_TOKEN`, `TOKEN_LUMEXA`, `SUPABASE_*`, `OPEN_AI_KEY`,
`AI_INTEGRATIONS_OPENAI_*`, `CONTRATO_REVISAO_MODELO`, etc.
