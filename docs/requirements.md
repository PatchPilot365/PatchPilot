---
title: Requirements
nav_order: 4
permalink: /requirements/
---

# Requirements

## Licensing, at a glance

- **Entra ID P1 or P2** — required for the two home-tenant access groups
  PatchPilot365 creates (bundled in Microsoft 365 Business Premium, EMS E3/E5,
  or Microsoft 365 E3/E5). Without it, a Global Administrator can still use
  PatchPilot365 directly (see below) — it only blocks the optional delegation
  groups.
- **Global Administrator or Privileged Role Administrator** — to run the
  deploy/pairing script, and to grant or revoke another engineer's write
  access.
- **Microsoft Intune** — for app deployment, on-demand remediation, and
  quality/feature update campaigns (bundled in Microsoft 365 Business
  Premium or Microsoft 365 E3/E5).
- **Microsoft Defender for Business, or Defender for Endpoint Plan 1+** —
  for Live Response (bundled in the same plans above).
- **A GDAP relationship via Microsoft Partner Center** — before PatchPilot365
  can reach a customer tenant at all. PatchPilot365 cannot create this
  relationship itself; it always starts in Partner Center, where the MSP
  requests it and the customer approves it.
- **Membership in the home tenant's `AdminAgents` group** — needed to
  discover existing GDAP relationships during onboarding, in addition to
  holding Global Administrator.
- **Live Response and Unsigned Scripts enabled manually, per tenant** — two
  toggles in the Microsoft 365 Defender portal (Settings > Endpoints >
  Advanced features) that no API or PowerShell cmdlet can set. A Global
  Administrator or Security Administrator has to enable them by hand, once
  per customer tenant, before Live Response will work there.

Without the Entra ID P1/P2 license specifically: PatchPilot365's two optional
delegation groups (`PatchPilot Read-Only Access` and
`PatchPilot Write Access`) can't be created, but a genuine Global
Administrator — or anyone directly assigned Global Reader, Security Reader,
Security Administrator, Intune Administrator, and/or Windows Update
Deployment Administrator — can use PatchPilot365 exactly the same way with no
Entra P1/P2 at all. The groups only exist to delegate access to other
engineers without making them Global Administrator outright.

## Roles inside PatchPilot365

Separate from all of the above: once PatchPilot365 can reach a tenant, what an
individual signed-in engineer can do *inside* PatchPilot365 is governed by
their PatchPilot365 role, not their Entra/GDAP role. Three roles:

| Role | Can do |
| --- | --- |
| **Admin** | Everything — including managing users, catalogs, and tenant settings. |
| **Technician** | Read everything and run remediation. Cannot manage users, scripts, or settings. |
| **Reader** | Read-only across the whole console. Cannot run or change anything. |

See [Manage users and roles]({{ "/user-guide/manage-users-and-roles/" | relative_url }})
for how to assign these, and the role breakdown by product area on
**Settings > Users > Roles** inside the app.

## Software and tooling (Manual Deployment)

Only relevant if you're self-hosting via
[Manual Deployment]({{ "/getting-started/manual-deployment/" | relative_url }}) —
[Azure Deployment]({{ "/getting-started/azure-deploy/" | relative_url }})
provisions all of this automatically.

- **Docker and Docker Compose** on the host that runs PatchPilot365.
- **Node.js 22+** and **pnpm 9+** if you're building/running outside the
  provided Docker images (contributor/development workflows).
- **PostgreSQL** and **Redis** — provisioned automatically by the Docker
  Compose files; no manual setup needed if you use them as shipped.

## Network requirements

See [Architecture: Network requirements at a glance]({{ "/architecture/#network-requirements-at-a-glance" | relative_url }}).

## Environment variables reference

Every setting lives in `.env`, copied from `.env.example` at setup time.
Everything Entra-related is deliberately left blank until pairing completes
— filling in a fake placeholder value breaks the "Pair this instance" flow,
since PatchPilot365 treats "all three set" and "all three blank" as the only
two valid states before pairing.

| Variable | Purpose |
| --- | --- |
| `PUBLIC_URL` | The public HTTPS origin where PatchPilot365 is reached. |
| `PP_DOMAIN` | Bare hostname Caddy serves and requests a Let's Encrypt certificate for. |
| `AUTH_REDIRECT_URI` | Entra app redirect URI — must exactly match the app registration. |
| `ENTRA_TENANT_ID` / `ENTRA_CLIENT_ID` / `ENTRA_CLIENT_SECRET` | Filled in automatically by the pairing script. Leave blank until then. |
| `SESSION_SECRET` / `TOKEN_ENCRYPTION_KEY` | 32-byte base64 keys — generate with `openssl rand -base64 32`. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_HOST` / `POSTGRES_PORT` / `DATABASE_URL` | Database connection. |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_URL` | Job queue and token cache backing. |
| `API_PORT` | Port the Fastify API listens on. |
| `CORS_ORIGINS` | Comma-separated origins allowed to call the API — the web app's own origin. |
| `AUTO_SYNC_INTERVAL_MINUTES` | How often the API background-refreshes devices/vulnerabilities for reachable tenants. `0` disables it. Ignored in Demo Mode. |
| `UPDATE_CHECK_INTERVAL_HOURS` | How often the API polls GitHub Releases for a newer PatchPilot365 version. `0` disables it. |
| `BOOTSTRAP_ADMIN_UPN` | The UPN that's seeded/promoted to an active admin on every startup — both how you provision the very first admin and how you recover if you lock yourself out. Safe to leave set permanently; the upsert is idempotent. |
| `DEMO_MODE` | `true` (default) runs with zero dependencies and bypassed auth. Set `false` for production, which then requires every secret/URL above to be genuinely set. |
| `AI_FEATURES_ENABLED` | Off by default. See [AI features]({{ "/getting-started/manual-deployment/#ai-features-optional" | relative_url }}). |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | Self-hosted AI model connection and model name. |
| `REPORT_RETENTION_DAYS` / `REPORT_RETENTION_MAX_PER_ENGINEER` | How long generated reports are kept, and a per-engineer cap. |
| `REPORT_BROWSER_EXECUTABLE_PATH` / `REPORT_BROWSER_CHANNEL` | How the worker finds a Chromium/Edge binary to render report PDFs. On Windows dev boxes, set `REPORT_BROWSER_CHANNEL=msedge` to reuse your existing Edge install. |
| `REPORT_PDF_TIMEOUT_MS` | Timeout for a single report's PDF render. |
| `SMTP_HOST` and related `SMTP_*` vars | Fallback failure-alerting relay. Superseded by the in-app **Settings > Notifications** page for most deployments. |
| `BACKUP_RETENTION_DAYS` / `BACKUP_HOUR` | Nightly Postgres backup retention and schedule. See [Server Health & Maintenance]({{ "/server-health-and-maintenance/" | relative_url }}). |

The full, fully-commented reference is
[`.env.example`](https://github.com/PatchPilot365/PatchPilot/blob/main/.env.example)
in the repository — copy it as a starting point rather than retyping values
from this table.
