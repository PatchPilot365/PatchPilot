---
title: Production Deploy
parent: Getting Started
nav_order: 2
---

# Development with real infra, and production deploy

## Development against real Postgres + Redis

Use this path when you want the full database-backed experience — real
persistence, real job queue — but aren't ready to connect a real Microsoft
365 tenant yet.

```bash
cp .env.example .env        # set secrets, DATABASE_URL, REDIS_URL, DEMO_MODE=false
pnpm infra:dev:up           # docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:seed                # loads the same demo tenants/devices/vulns fixtures
pnpm dev
```

See [Requirements]({{ "/requirements/" | relative_url }}) for what every
`.env` variable does before you fill it in.

## Production (full self-hosted stack)

This is the real deployment: Docker Compose brings up every service behind a
reverse proxy that provisions its own TLS certificate.

```bash
cp .env.example .env        # set PP_DOMAIN, secrets, POSTGRES_PASSWORD, DEMO_MODE=false
docker compose -f infra/docker-compose.yml --env-file .env up -d --build
```

Services brought up: `caddy` (TLS via Let's Encrypt) in front of `web`
(the compiled SPA served by nginx) and `api` (Fastify), plus `worker`,
`postgres`, `redis`, and `ollama`. Point your domain's DNS at the host and
Caddy provisions the certificate automatically — no manual certificate
handling.

Once the stack is up, continue to [Pairing]({{ "/getting-started/pairing/" | relative_url }})
to connect it to a real Microsoft 365 tenant.

### Where to host for testing a real login

There are two fundamentally different ways to run PatchPilot, and only the
second needs a public host at all:

- **UI and onboarding only** — stay in `DEMO_MODE=true`
  ([Demo Mode]({{ "/getting-started/demo-mode/" | relative_url }})). Sign-in
  is bypassed, no Entra app, no hosting required.
- **Real sign-in with the On-Behalf-Of token exchange** — needs a reachable
  HTTPS **redirect URI** that exactly matches what's registered in the Entra
  app and written in `.env` (`AUTH_REDIRECT_URI` / `PUBLIC_URL` /
  `CORS_ORIGINS`). The only exception: `http://localhost` is allowed for
  development.

> **A static host (including GitHub Pages) cannot run PatchPilot itself.**
> Completing the OAuth code-for-token exchange happens server-side using a
> client secret that must never reach the browser. A static host can only
> serve the SPA shell — sign-in would be broken, since there's no server
> there to hold the secret. You need a host that can run the Node/Docker
> stack.

| Option | Public URL? | Cost | When to use |
| --- | --- | --- | --- |
| **Localhost** | No (your browser only) | Free | Solo testing against **your own MSP tenant**. Register `http://localhost:<port>/auth/callback`. Can't be reached by a separate customer tenant for consent. |
| **Tunnel** (Cloudflare Tunnel / ngrok) | Yes | Free | Run the stack locally, expose a public HTTPS URL. Lets you test the real multi-tenant GDAP consent flow with a separate test customer tenant. Prefer a **stable hostname** (Cloudflare Tunnel on a domain you own) — a free ngrok subdomain changes on every restart, forcing you to re-edit the app registration and `.env` each time. |
| **VPS + domain** | Yes | A few $/month | Closest to production. Point DNS at the host and run the Docker Compose command above; Caddy auto-provisions the TLS certificate. |

**Recommendation:** validate the UI in Demo Mode first, use **localhost**
for single-tenant sign-in/OBO testing, and reach for a **Cloudflare Tunnel**
only when you need to exercise the real customer-consent path without
renting a server.

### Keeping the worker/API alive on localhost

`pnpm dev` (via `tsx watch`) restarts automatically on a file save, but not
if the process crashes on its own — for the worker, that leaves every
remediation job stuck at `queued` until someone notices and restarts it by
hand. `infra/docker-compose.yml` already recovers from this
(`restart: unless-stopped`), but plain `pnpm dev` on localhost doesn't. Run
`pnpm --filter @patchpilot/worker dev:resilient` (and the same for
`@patchpilot/api`) to run the same source under a small crash-restart
supervisor instead — no file-watch hot reload, but it comes back on its own
if it crashes.

## AI features (optional)

Off by default (`AI_FEATURES_ENABLED=false`). The model runs entirely inside
your own Compose stack — the `ollama` container has no published port and
makes no calls out to the internet at inference time.

```bash
# 1. Set in .env: AI_FEATURES_ENABLED=true
# 2. Bring the stack up (or restart it) so the ollama container exists
docker compose -f infra/docker-compose.yml --env-file .env up -d
# 3. One-time model pull — needs host internet access for this step only,
#    never again after. Weights persist in the ollama_data volume.
docker compose -f infra/docker-compose.yml --env-file .env exec ollama ollama pull llama3.1:8b
```

`OLLAMA_MODEL` defaults to `llama3.1:8b` (Meta, USA) — deliberately not a
PRC-origin model, since vendor provenance for the model weights matters
independently of network isolation when the box handles MSP client security
data. Minimum recommended: 8 vCPU / 16GB RAM. On beefier hardware, pull
`llama3.1:70b` instead and set `OLLAMA_MODEL` to match — no code change
needed, though a GPU is strongly recommended at that size.

## Useful scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run web + api + worker with hot reload |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | Type-check every package |
| `pnpm test` | Run the test suite |
| `pnpm infra:dev:up` / `pnpm infra:dev:down` | Start/stop dev Postgres + Redis |
| `pnpm db:generate` | Generate a Drizzle migration from the schema |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Seed demo tenants/devices/vulnerabilities |

{: .warning }
> `pnpm db:seed` unconditionally wipes and reloads the database's demo
> tables. Never run it against an instance holding real onboarded tenants.
