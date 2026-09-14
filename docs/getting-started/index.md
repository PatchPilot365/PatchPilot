---
title: Getting Started
nav_order: 2
has_children: true
---

# Getting Started

There are a few ways to run PatchPilot365, depending on what you're trying
to do. Pick the one that matches your goal — you can always move to a more
complete path later.

| Path | Needs | Best for |
| --- | --- | --- |
| [Azure Deployment]({{ "/getting-started/azure-deploy/" | relative_url }}) | An Azure subscription | The primary, supported way to run PatchPilot365 for real, without hand-provisioning a server yourself. |
| [Manual Deployment]({{ "/getting-started/manual-deployment/" | relative_url }}) | Your own Azure subscription, on-prem hardware, or a third-party host + Docker | Self-hosting on infrastructure you provision and manage yourself. |
| [Demo Mode]({{ "/getting-started/demo-mode/" | relative_url }}) | A running instance (or Node 22+/pnpm 9+ for local dev) | Clicking through the console with fictional data — no real tenant. |

Every path that connects a real tenant ends the same way: the
[pairing step]({{ "/getting-started/pairing/" | relative_url }}), where a
Global Administrator runs one PowerShell script that creates the Entra app
registration and hands your running instance real credentials.

## Non-negotiables

These hold regardless of which path you choose:

1. **You control the infrastructure** — one-click Azure Deployment, or
   self-hosted on your own Azure subscription, on-prem, or third-party
   hosting.
2. **Tokens stay server-side** — the browser only ever holds a session
   cookie, never a Microsoft Graph token.
3. **Every Graph call is audited** — engineer, tenant, endpoint, method,
   a hash of the payload (never the raw payload), response status, latency,
   timestamp.
4. **Graceful licensing degradation** — PatchPilot365 never shows a button for
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
