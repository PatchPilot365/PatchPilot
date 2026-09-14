---
title: Manage users and roles
parent: User Guide
nav_order: 5
---

# Manage users and roles

Only an engineer with the **Admin** role can open this page at all — it's
the one page in PatchPilot365 gated by route, not just by hidden actions. See
[Requirements: Roles inside PatchPilot365]({{ "/requirements/#roles-inside-patchpilot365" | relative_url }})
for the full permission matrix behind the three roles below.

1. Open **Settings > Users**. The **People** tab lists every engineer who
   can sign in.
2. Assign a role to each engineer:
   - **Admin** — every permission, including managing other users and
     granting write access.
   - **Technician** — can read and act on operations (dispatch fixes, edit
     schedules), read the catalog/settings/audit log, and use AI features.
     Cannot manage users.
   - **Reader** — read-only across operations, catalog, settings, and the
     audit log. No `ai:use`, no write actions anywhere.
3. Toggle **write access** for an engineer separately from their role —
   this is confirmed against a write-access Entra group, and granting or
   revoking it needs a Global Administrator or Privileged Role
   Administrator in the home tenant. PatchPilot365 can request the change but
   can't complete it without that Entra-side confirmation; the page shows
   each engineer's confirmed membership status and lets you retry if it
   hasn't synced yet.
4. Use the **Roles** tab as a quick reference for what each role can
   actually do, without having to cross-check the permissions matrix by
   hand.
5. To check what a *specific* engineer can currently do — rather than what
   their role should allow in theory — use
   [Setup Health > Check Access]({{ "/navigating-patchpilot/setup/#setup-health" | relative_url }}),
   which verifies PatchPilot365's own role, direct Entra roles, and GDAP roles
   from Partner Center together. Admins can check any engineer; everyone
   else can only check themselves.
