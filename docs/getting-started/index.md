---
title: Getting Started
nav_order: 2
has_children: true
---

# Getting Started

There are four ways to run PatchPilot, depending on what you're trying to
do. Pick the one that matches your goal — you can always move to a more
complete path later.

| Path | Needs | Best for |
| --- | --- | --- |
| [Demo Mode]({{ "/getting-started/demo-mode/" | relative_url }}) | Node 22+, pnpm 9+ | Clicking through the console with zero setup. No database, no Entra app, no real tenant. |
| [Development with real infra]({{ "/getting-started/production-deploy/" | relative_url }}#development-against-real-postgres--redis) | The above + Docker | Working against a real Postgres/Redis-backed instance while still not needing an Entra app. |
| [Production deploy]({{ "/getting-started/production-deploy/" | relative_url }}#production-full-self-hosted-stack) | A server (VPS, MSP infra, or on-prem) + Docker | Running PatchPilot for real, with a real Microsoft 365 tenant connected. |
| [Azure one-click deploy]({{ "/getting-started/azure-deploy/" | relative_url }}) | An Azure subscription | Production, without hand-provisioning a server yourself. |

Every path that connects a real tenant ends the same way: the
[pairing step]({{ "/getting-started/pairing/" | relative_url }}), where a
Global Administrator runs one PowerShell script that creates the Entra app
registration and hands your running instance real credentials.

## Non-negotiables

These hold regardless of which path you choose:

1. **Fully self-hosted** — Docker Compose; no managed cloud dependency.
2. **Tokens stay server-side** — the browser only ever holds a session
   cookie, never a Microsoft Graph token.
3. **Every Graph call is audited** — engineer, tenant, endpoint, method,
   a hash of the payload (never the raw payload), response status, latency,
   timestamp.
4. **Graceful licensing degradation** — PatchPilot never shows a button for
   a feature the tenant isn't licensed for.
5. **Per-tenant isolation** — token cache, job queue, and audit log are all
   keyed by tenant.
6. **Read-only first** — a new tenant integration starts read-only; write
   actions are opted in per tenant.
7. **`scripts/Deploy-PatchPilot.ps1` is the canonical way to create the
   Entra app registration.** The in-app "Sync permissions" action can
   refresh scopes on an app the script already created, but never creates
   one itself.
8. **Secrets live in `.env`** with locked-down file permissions.
