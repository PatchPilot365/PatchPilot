---
title: Manual Deployment
parent: Getting Started
nav_order: 2
---

# Manual Deployment

Manual Deployment is **self-hosting**: you provision the machine — your own
Azure subscription without the ARM template, your own on-prem hardware, or a
third-party host — and run PatchPilot365's Docker Compose stack on it
yourself. Use this if you don't want a machine created and billed
automatically the way [Azure Deployment]({{ "/getting-started/azure-deploy/" | relative_url }})
does it, or if your infrastructure has to live somewhere other than Azure.

{: .warning }
> **Support does not extend to self-hosted deployments.** You're responsible
> for provisioning, securing, updating, and backing up your own
> infrastructure. For a supported, guided setup where we own the
> provisioning, use [Azure Deployment]({{ "/getting-started/azure-deploy/" | relative_url }})
> instead.

There's no from-scratch install script for this path yet — today, "manual
deployment" means using the Docker Compose file yourself on any Ubuntu host
you provide (a VM, bare metal, or a third-party host) and following the
steps below. For full technical detail beyond what's here, see the
[repository README](https://github.com/PatchPilot365/PatchPilot#readme).

## Deploy the stack

Docker Compose brings up every service behind a reverse proxy that
provisions its own TLS certificate.

```bash
git clone https://github.com/PatchPilot365/PatchPilot.git
cd PatchPilot
cp .env.example .env        # set PP_DOMAIN, secrets, POSTGRES_PASSWORD, DEMO_MODE=false
docker compose -f infra/docker-compose.yml --env-file .env up -d --build
```

See [Requirements]({{ "/requirements/" | relative_url }}) for what every
`.env` variable does before you fill it in.

Services brought up: `caddy` (TLS via Let's Encrypt) in front of `web`
(the compiled SPA served by nginx) and `api` (Fastify), plus `worker`,
`postgres`, `redis`, and `ollama`. Point your domain's DNS at the host and
Caddy provisions the certificate automatically — no manual certificate
handling.

Once the stack is up, continue to [Pairing]({{ "/getting-started/pairing/" | relative_url }})
to connect it to a real Microsoft 365 tenant.

### Redirect URI

Real sign-in (the On-Behalf-Of token exchange) needs a reachable HTTPS
**redirect URI** that exactly matches what's registered in the Entra app and
written in `.env` (`AUTH_REDIRECT_URI` / `PUBLIC_URL` / `CORS_ORIGINS`).
`http://localhost` is the only exception, for local testing.

> **A static host (including GitHub Pages) cannot run PatchPilot365 itself.**
> Completing the OAuth code-for-token exchange happens server-side using a
> client secret that must never reach the browser. A static host can only
> serve the SPA shell — sign-in would be broken, since there's no server
> there to hold the secret. You need a host that can run the Docker stack.

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
| `pnpm build` | Build all packages |
| `pnpm db:generate` | Generate a Drizzle migration from the schema |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Seed demo tenants/devices/vulnerabilities |

{: .warning }
> `pnpm db:seed` unconditionally wipes and reloads the database's demo
> tables. Never run it against an instance holding real onboarded tenants.

For a contributor/development workflow (local hot reload, running against
dev Postgres/Redis, the full test suite), see the
[repository README](https://github.com/PatchPilot365/PatchPilot#readme)
instead — this page only covers standing up a real deployment.
