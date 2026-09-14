---
title: Setup
parent: Navigating PatchPilot365
nav_order: 4
permalink: /navigating-patchpilot/setup/
---

# Setup

The one-time and diagnostic pages behind getting PatchPilot365 connected and
staying connected — not part of day-to-day remediation work.

## App Registration

The multi-tenant Entra app PatchPilot365 runs as, its requested permissions,
and its OAuth redirect origins. Per-tenant admin consent now lives on the
[Tenants]({{ "/navigating-patchpilot/settings/#tenants" | relative_url }})
page — this page covers the one-time home-tenant setup: deploying the app
registration, granting the MSP's own tenant admin consent (read-only),
optionally adding write API permissions, and discovering tenants. See
[Getting Started]({{ "/getting-started/" | relative_url }}) for the
step-by-step version of this flow.

## Architecture

The live topology diagrams and prerequisites — engineer/tenant reach model,
remediation channels, Microsoft APIs in use, network requirements. This
page is covered in full at [Architecture]({{ "/architecture/" | relative_url }}),
which links back to this in-app page as the maintained source of truth.

## Setup Health

*"Is PatchPilot365 wired up to operate — at the MSP level, for this tenant,
and for one specific remediation."* Four tabs, each checking a different
scope:

- **Connections** — MSP-wide: whether the app registration itself has the
  Microsoft Graph, Defender for Endpoint, and Partner Center scopes it
  needs, split into read-only and write-gated permissions.
- **Readiness** — per-tenant: whether the currently selected tenant is
  actually reachable and synced (GDAP relationship active, Defender
  onboarding present, latest sync succeeded).
- **Pre-flight** — per-remediation: pick a vulnerability, a device, and a
  channel, and run the same gate a real dispatch would run, without
  actually dispatching anything. A clean result reads "Cleared — this
  remediation could proceed (no blocking checks)."
- **Check Access** — per-engineer: what a specific signed-in engineer can
  actually do, checked in three categories — PatchPilot365's own RBAC role,
  direct Entra roles, and GDAP roles from Partner Center. Admins
  (`users:manage`) can check any engineer; everyone else can only check
  themselves.
