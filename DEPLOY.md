# Deploy

O app são **duas peças** que precisam de hosts diferentes:

| Peça | Host | Motivo |
|---|---|---|
| **Backend** `api-server` (Express) | **Render** (free) | Servidor Node persistente (`app.listen`), sem timeout curto; faz upload, gera PDF e chama IA |
| **Frontend** `console-kcl` (Vite/React) | **Vercel** | Site estático — é para isso que o Vercel serve |

> Há também um `railway.json` no repo, caso queira usar Railway em vez de
> Render (tem crédito). Os dois são intercambiáveis — escolha um host para o
> backend.

> ⚠️ **Não** faça deploy do `api-server` no Vercel. O Vercel roda funções
> serverless (stateless, timeout curto), e o backend é um servidor Express de
> pé — não encaixa sem reescrever o código.

O frontend chama a API como caminho relativo `/api/...` (mesmo domínio). Por
isso o `vercel.json` faz **rewrite de `/api` para a URL do backend** no Railway.

---

## Parte 1 — Backend no Render

O `render.yaml` (na raiz) é um Blueprint que já define build, start e as
variáveis:
- build: `corepack enable && pnpm install --frozen-lockfile && node artifacts/api-server/build.mjs`
- start: `node --enable-source-maps artifacts/api-server/dist/index.mjs`
- Node 22, `healthCheckPath: /api/healthz`

Passo a passo:
1. Render → **New** → **Blueprint** → conecte o repo
   `EduardoTakeiYaginuma/surgery-onboarding-test`, branch `main`. O Render lê o
   `render.yaml` automaticamente.
2. **Variáveis de ambiente:** o Blueprint declara as chaves como `sync: false`
   (não vão para o repo). O Render vai pedir para você preenchê-las — copie os
   valores do seu `.env` local: `DATABASE_URL`, `BASE_PATH`,
   `AUTENTIQUE_API_TOKEN`, `TOKEN_LUMEXA`, `SUPABASE_*`, `OPEN_AI_KEY`,
   `AI_INTEGRATIONS_OPENAI_*`, `CONTRATO_REVISAO_MODELO`, etc.
   - **NÃO** setar `PORT` — o Render injeta a porta e o app lê `process.env.PORT`.
3. Deploy. A URL sai como `https://surgery-onboarding-test-api.onrender.com`.
4. Teste: `GET https://SEU-HOST.onrender.com/api/healthz` deve retornar
   `{"status":"ok"}`.

> ⏱️ No plano free, o serviço **dorme após ~15 min** inativo; o primeiro
> request depois disso demora ~30-60s (cold start). Normal para teste.

---

## Parte 2 — Frontend no Vercel

O `vercel.json` (na raiz) já define install, build, output e rewrites:
- install: `pnpm install --frozen-lockfile`
- build: `BASE_PATH=/ PORT=3000 pnpm --filter @workspace/console-kcl build`
  (o `vite.config.ts` exige `PORT` e `BASE_PATH` no ambiente mesmo no build;
  `PORT` só é usado pelo dev server, é inócuo aqui)
- output: `artifacts/console-kcl/dist/public`

Passo a passo:
1. **Antes**, edite o `vercel.json`: troque `SUBSTITUA-PELO-HOST-DO-BACKEND`
   pelo host do Render (ex.: `surgery-onboarding-test-api.onrender.com`).
   Commit + push.
2. Vercel → **New Project** → importe o mesmo repo,
   `EduardoTakeiYaginuma/surgery-onboarding-test`, branch `main`.
3. **Root Directory:** deixe a **raiz do repo**. Não aponte para
   `artifacts/console-kcl` — o `vercel.json` já builda a partir da raiz.
4. **Framework Preset:** Other (o `vercel.json` já define `framework: null`).
5. Deploy. As chamadas `/api/*` serão encaminhadas ao backend no Railway pelo
   rewrite.

---

## Como o `/api` liga as duas peças

`vercel.json`:
```json
"rewrites": [
  { "source": "/api/:path*", "destination": "https://SEU-HOST-RENDER/api/:path*" },
  { "source": "/(.*)",        "destination": "/index.html" }
]
```

Requisição do usuário `/api/medicos` → Vercel encaminha para
`https://SEU-HOST-RENDER/api/medicos` → rota do backend `/api/medicos`. O
fallback de SPA (`/(.*)` → `index.html`) cobre o roteamento client-side.
