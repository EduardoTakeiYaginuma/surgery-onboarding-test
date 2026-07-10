# Integração com a Autentique

Referência da integração de assinatura de contratos/termos com a Autentique
neste projeto: modo sandbox, formas de entrega (e-mail × link), como se definem
os signatários, verificação de identidade e o estado atual do app.

> Endpoint usado: `https://api.autentique.com.br/v2/graphql` (GraphQL).
> A chave fica no secret `AUTENTIQUE_API_TOKEN` e nunca vai ao frontend.

Arquivos relevantes:
- Escrita (criação de documento): `artifacts/api-server/src/lib/autentique-criar.ts`
- Leitura (status de assinatura, somente leitura): `artifacts/api-server/src/lib/autentique.ts`
- Formulário de envio (define signatários): `artifacts/console-kcl/src/components/gerador-contrato.tsx`

---

## 1. Modo sandbox × produção

A criação de documento aceita o argumento `sandbox: true` no `createDocument`.

| Aspecto | `sandbox: true` | Produção (default) |
|---|---|---|
| Consome crédito | ❌ Não | ✅ Sim |
| Validade jurídica | ❌ Não (é teste) | ✅ Sim |
| Ciclo de vida | Apagado após alguns dias | Permanente |
| Listagem | Só com `showSandbox`/`onlySandbox` | Normal |
| Envia e-mail | **Não é suprimido pelo sandbox** (ver seção 2) | idem |

**Importante:** o sandbox da Autentique controla cobrança/validade, **não**
controla se o signatário recebe e-mail. Por isso, neste app, o modo sandbox
também **suprime e-mails** (ver abaixo).

**Estado atual (IMPLEMENTADO):** controlado pela env var **`AUTENTIQUE_SANDBOX`**:

- `AUTENTIQUE_SANDBOX=true` → cria em sandbox (`sandbox: true` na mutation) **e**
  força entrega por link em TODOS os signatários, ignorando os e-mails — assim
  nenhum paciente real é notificado durante os testes.
- Ausente ou `false` → **produção**: `sandbox: false` e a entrega por e-mail
  volta a valer (com e-mail → e-mail; sem e-mail → link).

Cada criação registra no log qual modo foi usado (SANDBOX × PRODUÇÃO).
Implementação em `artifacts/api-server/src/lib/autentique-criar.ts`; comportamento
travado por testes em `autentique-criar.test.ts`.

- No **Render** (ambiente de teste): `AUTENTIQUE_SANDBOX=true` já vem no
  `render.yaml`.
- No **`.env` local**: `AUTENTIQUE_SANDBOX=true`.

---

## 2. Entrega: e-mail × link (`delivery_method`)

Quem decide se a pessoa recebe e-mail é o **campo `email` de cada signatário**,
não o sandbox.

- **Com `email`** → a Autentique envia o link de assinatura **por e-mail** para
  aquele endereço (comportamento padrão).
- **Sem `email`** → usa `delivery_method: "DELIVERY_METHOD_LINK"`: **não envia
  nada** e devolve um `short_link` para você repassar como quiser (WhatsApp,
  copiar/colar etc.). A Autentique também suporta `DELIVERY_METHOD_WHATSAPP` e
  `DELIVERY_METHOD_SMS`, mas este app só usa e-mail e link.

Lógica no código (`autentique-criar.ts`):

```ts
const signers = args.signatarios.map((s) => {
  const email = s.email?.trim();
  return email
    ? { name: s.nome, email, action: "SIGN" }                  // entrega por e-mail
    : { name: s.nome, action: "SIGN",
        delivery_method: "DELIVERY_METHOD_LINK" };             // entrega por link
});
```

O app **sempre captura** o `short_link` retornado (campo `linkAssinatura`),
mesmo quando manda por e-mail — então o link do documento fica disponível para
visualizar/copiar de qualquer forma.

---

## 3. Como se definem os signatários

Na API, os signatários são o array **`signers`**. Cada item tem:

- **`name`** — obrigatório; identifica o signatário (inclusive na resposta).
- **`action`** — papel. `SIGN` (assinar) é o padrão; existem também
  `SIGN_AS_A_WITNESS` (testemunha), `APPROVE` (aprovar), `RECOGNIZE`.
- **`email`** — **opcional**. Sem ele → entrega por link (seção 2).

Exemplo (dois signatários, por link, sem e-mail):

```json
{
  "document": { "name": "Contrato exemplo" },
  "signers": [
    { "name": "Fulano de Tal", "action": "SIGN" },
    { "name": "Ciclana Silva", "action": "SIGN" }
  ]
}
```

Cada signatário recebe **o seu próprio `short_link`**. A resposta traz
`signatures[]` na **mesma ordem** do `signers` enviado; associa-se o link à
pessoa pela ordem / pelo `name`. Ou seja: **um link por pessoa**.

### Como o app monta os signatários

Na tela "Aprovar e Enviar" do gerador (`gerador-contrato.tsx`), a lista é:

1. **Paciente** (fixo) — nome do cadastro; e-mail pré-preenchido com o do
   paciente.
2. **Segundo signatário** (fixo por tipo de documento):
   - Contrato → **Representante legal da empresa**
   - Termo → **Médico**
   - Nome + e-mail são lembrados (localStorage) para não redigitar a cada
     paciente.
3. **Signatários adicionais** (sob demanda) — a equipe adiciona/remove quantos
   quiser, cada um com nome + e-mail.

> **Limitação atual do formulário:** o botão de envio só libera com **nome +
> e-mail de TODAS as partes** preenchidos. Na prática, pela tela de hoje **não
> dá para usar o modo link puro** (o backend suporta, o frontend exige e-mail).

> **Limitação atual da captura de link:** o app guarda **apenas um** link (o
> primeiro retornado) e a query não pede o `name` de cada assinatura. Com
> **1 signatário por link** funciona bem; com **2+ por link**, os links
> individuais das demais pessoas não ficam acessíveis pela tela sem ajuste.

---

## 4. Segurança / verificação de identidade

Assinatura por link **sem verificação** = **qualquer pessoa com o link consegue
assinar** como aquele signatário. A garantia é só a **posse do link** (fator
fraco). O e-mail sozinho também é fraco (vale "quem controla a caixa"). Os dois,
isolados, são **assinatura eletrônica simples**.

Para amarrar a identidade, a Autentique tem o campo **`security_verifications`**
por signatário:

| Tipo | Exige |
|---|---|
| `SMS` | código enviado por SMS para um celular |
| `PF_FACIAL` | selfie validada pelo SERPRO contra as fotos do governo |
| `LIVE` | foto do documento + selfie + prova de vida |
| `BIOMETRIC_AND_TEXT_EXTRACTION` | foto do documento comparada com selfie |
| `UPLOAD` | anexar frente e verso de um documento com foto |
| `MANUAL` | anexar documento + selfie; aprovação/rejeição manual |

Exemplo:

```json
"signers": [
  { "name": "Paciente", "action": "SIGN",
    "security_verifications": [ { "type": "PF_FACIAL" } ] }
]
```

Com verificação configurada, ter o link/e-mail deixa de bastar — quem prova a
identidade é quem assina.

**Trilha de auditoria (sempre registrada):** IP, geolocalização (país, estado,
cidade, lat/long), data/hora de visualização/assinatura/recusa. Isso é
**evidência** posterior — não *impede* o assinante errado no momento.

**Estado atual do app:** **não** configura `security_verifications`. Logo, hoje
não há prova de identidade extra em nenhum dos modos — vale só quem tem o
link / a caixa de e-mail.

---

## 5. Como assinar (fluxo de teste)

1. Documento criado → a Autentique devolve o `short_link` do signatário.
2. Alguém abre o `short_link` e assina na página da Autentique (não existe
   assinatura automática).
3. O caminho de leitura (`autentique.ts`) faz polling do status e o app reflete
   "assinado".

Para testar **sem incomodar o paciente**, use **o seu próprio e-mail** nos
campos de signatário (nunca o e-mail real do paciente). Documento em sandbox
assina igual, mas sem valer juridicamente.

---

## 6. Recomendações / próximos passos

Status:

- [x] **Sandbox por env var** — `AUTENTIQUE_SANDBOX` liga/desliga o
  `sandbox` no `createDocument`. Default seguro = produção (`false`).
- [x] **Proteção de teste** — com `AUTENTIQUE_SANDBOX=true`, força modo link e
  ignora e-mails, tornando impossível notificar um paciente real nos testes.
- [ ] **Modo link no frontend** — tornar o e-mail opcional (ou toggle "enviar
  por e-mail" × "gerar link") para viabilizar o `DELIVERY_METHOD_LINK` pela tela.
- [ ] **Capturar link por signatário** — pedir `name` + `short_link` de cada
  assinatura na query e guardar todos, para distribuir o link certo a cada
  pessoa quando houver 2+ signatários por link.
- [ ] **Verificação de identidade** — permitir configurar `security_verifications`
  por signatário (ex.: `PF_FACIAL` no paciente, ou `SMS`) para contratos reais.

---

## Referências

Código:
- `artifacts/api-server/src/lib/autentique-criar.ts` — criação (mutation `createDocument`, montagem de `signers`, captura de `short_link`).
- `artifacts/api-server/src/lib/autentique.ts` — consulta de status (somente leitura).
- `artifacts/console-kcl/src/components/gerador-contrato.tsx` — formulário que define os signatários.

Documentação Autentique:
- Criando um documento: https://docs.autentique.com.br/api/mutations/criando-um-documento
- Sandbox/testes: https://docs.autentique.com.br/api/integration-basics/sandbox-testes
- Assinando um documento: https://docs.autentique.com.br/api/mutations/assinando-um-documento
