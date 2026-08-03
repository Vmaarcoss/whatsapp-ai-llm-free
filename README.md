# WhatsApp AI Boilerplate (Claude)

Boilerplate reutilizável de atendimento por WhatsApp com IA (Claude).  
Arquitetura em camadas atrás de interfaces: troque provider, store ou cliente sem reescrever o núcleo.

**Trocar de cliente = editar só `src/config/business.ts`.**

---

## Arquitetura

```
src/
├── providers/          # WhatsApp (interface + Baileys MVP + Meta stub)
├── store/              # Conversas + mini-CRM (interface + JSON file MVP + Postgres stub)
├── core/
│   ├── types.ts        # Message interna
│   ├── normalizer.ts   # payload provider → Message
│   ├── engine.ts       # Claude (tools, thinking adaptive)
│   └── router.ts       # auto-resposta vs handoff
├── config/
│   └── business.ts     # ⭐ persona, FAQ, regras, tools — muda por cliente
├── server.ts           # HTTP: /health + /webhook (Meta)
└── index.ts            # bootstrap
```

| Camada | Interface | Implementações MVP | Troca via |
|--------|-----------|--------------------|-----------|
| WhatsApp | `WhatsAppProvider` | Baileys (pairing + QR) | `PROVIDER=baileys\|meta` |
| Persistência | `ConversationStore` | JSON file (`./data/store.json`) | `STORE=sqlite\|postgres` |
| IA | — | Claude (`@anthropic-ai/sdk`) | `MODEL=...` |
| Negócio | — | `businessConfig` | editar `config/business.ts` |

> O nome da env `STORE=sqlite` permanece por compatibilidade. A implementação MVP é um arquivo JSON puro (zero dependência nativa). Substitua por `better-sqlite3` real quando precisar de performance.

---

## Pré-requisitos

- Node.js ≥ 20
- Conta Anthropic (chave API)
- (Baileys) Número de WhatsApp para parear
- (Meta) App no Meta for Developers + número Cloud API (opcional)

---

## Setup rápido (Baileys)

```bash
# 1. Instalar
npm install

# 2. Configurar env
cp .env.example .env
# Edite .env:
#   ANTHROPIC_API_KEY=sk-ant-...
#   BAILEYS_PHONE=5511999998888   # só dígitos, com DDI

# 3. Rodar em dev (tsx, sem build)
npm run dev
```

### Parear o WhatsApp (Baileys)

1. Ao subir, se `BAILEYS_PHONE` estiver preenchido e não houver sessão em `data/baileys-auth`, o terminal mostra um **pairing code de 8 dígitos**.
2. No celular: **WhatsApp → Aparelhos conectados → Conectar um aparelho → Conectar com número de telefone** → digite o código.
3. Alternativa: se aparecer QR no terminal, escaneie normalmente.
4. Sessão fica em `data/baileys-auth` — **não precisa logar de novo** após restart.

Para forçar novo pareamento:

```bash
rm -rf data/baileys-auth
npm run dev
```

---

## Meta Cloud API (webhook)

1. No `.env`:
   ```
   PROVIDER=meta
   META_ACCESS_TOKEN=...
   META_PHONE_NUMBER_ID=...
   META_VERIFY_TOKEN=meu_token_secreto
   META_APP_SECRET=...          # para validar assinatura
   ```

2. Exponha HTTPS (Meta exige). Em dev use **cloudflared** (túnel grátis):

   ```bash
   # Instale: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
   cloudflared tunnel --url http://localhost:3000
   ```

   Copie a URL `https://….trycloudflare.com` e configure no painel da Meta:

   - Callback URL: `https://….trycloudflare.com/webhook`
   - Verify token: o mesmo de `META_VERIFY_TOKEN`

3. Suba o app (`npm run dev`). O GET `/webhook` responde o challenge; POST processa mensagens.

---

## Trocar PROVIDER / STORE / MODEL

| Variável | Valores | Efeito |
|----------|---------|--------|
| `PROVIDER` | `baileys` (default) / `meta` | Qual implementação de WhatsApp |
| `STORE` | `sqlite` (default) / `postgres` | Qual store (Postgres ainda é stub) |
| `MODEL` | `claude-opus-4-8` (default) | Modelo Claude |

Reinicie o processo após alterar.

---

## Tools (client-side)

Habilitadas em `config/business.ts` → `toolsHabilitadas`.

| Tool | O que faz |
|------|-----------|
| `escalar_para_humano` | Marca handoff, envia `mensagemHandoff`, loga no console (MVP). Bot para de responder aquele chat. |
| `registrar_lead` | Grava nome/telefone/interesse em `data/store.json` (mini-CRM). |

Para adicionar uma tool nova (ex.: consultar pedido):

1. Defina em `ALL_TOOLS` em `engine.ts`.
2. Trate no switch de execução de tools.
3. Habilite em `businessConfig.toolsHabilitadas`.

---

## Scripts

```bash
npm run dev        # tsx (hot, sem compile)
npm run build      # tsc → dist/
npm start          # node dist/index.js
npm run typecheck  # tsc --noEmit
```

---

## Teste manual ponta a ponta (Baileys)

1. Configure `.env` com `ANTHROPIC_API_KEY` e `BAILEYS_PHONE`.
2. `npm run dev` → pareie o WhatsApp.
3. Envie uma mensagem do celular para o número pareado, por exemplo:
   - “Qual o horário de atendimento?” → deve responder com o FAQ.
   - “Quero falar com um humano” → deve escalar (log `🚨 HANDOFF` + mensagem de transição).
   - “Meu nome é João, telefone 11999998888, interesse em visita técnica” → deve registrar lead.
4. Confira `data/store.json` e o console.

---

## Notas de produção / escala

- **Sem fila no MVP**: processamento síncrono. Para volume alto, coloque uma fila (BullMQ/Redis) entre provider e router.
- **Handoff**: no MVP só log + flag no store. Conecte um painel (webhook, Slack, dashboard) no `router.ts` onde está o `console.log` de HANDOFF.
- **Postgres / SQLite real**: implemente `PostgresStore` ou troque `SqliteStore` por `better-sqlite3` quando precisar de múltiplas instâncias ou alto volume.
- **Docker**: não obrigatório. Se quiser, monte volume em `./data` para persistir auth + store.
- **Meta assinatura**: sempre configure `META_APP_SECRET` em produção.

---

## Licença

MIT — use, revenda e adapte livremente.
