---
title: Settings
parent: Navigating PatchPilot365
nav_order: 5
permalink: /navigating-patchpilot/settings/
---

# Settings

Instance-wide configuration — most of it visible to every engineer, a
handful of write actions restricted to Admin.

## Branding

White-label the console for your MSP: logo and four color tokens
(**Primary** / **Secondary** / **Accent** / **Sidebar / background**).
Uploading a logo is required before the color pickers unlock.

## Compliance SLA

Remediation deadlines per severity — these drive every SLA chip and
breach/due-soon bucket shown across the console (Vulnerabilities,
Recommendations, the Dashboard).

## License

PatchPilot365's vendor license key. This gates whether the instance can write
at all, and sizes the Live Response device pool your tenants share — see
[Requirements]({{ "/requirements/" | relative_url }}) for how licensing
degrades gracefully when a key is missing or expired.

## Notifications

SMTP relay configuration for job- and sync-failure alert emails. Optional
— nothing sends until it's explicitly enabled here.

## Server Health

Covered in depth on its own page — see
[Server Health & Maintenance]({{ "/server-health-and-maintenance/" | relative_url }}).
Three tabs: **Resources**, **Workers & Schedulers**, **Services &
Containers**.

## Tenants

The GDAP-linked customer tenants list. Every tenant starts **read-only**
until write actions are opted in explicitly. Two independent status
columns:

- **Consent**: Active / Pending / Expired — the GDAP relationship itself.
- **Reachability**: Reachable / Needs consent / Throttled / Unreachable /
  Not probed — whether PatchPilot365 can actually call Graph for this tenant
  right now, refreshed by **Discover** (per-tenant) or the page's
  re-probe-everything action.

Your own MSP tenant is listed too, marked as installed directly with no
GDAP relationship.

## Updates

Check for new PatchPilot365 releases and trigger the self-update sidecar to
apply them.

## Users

*"Who can sign in to PatchPilot365, and what their role lets them do here."*
Two tabs:

- **People** — the engineer list: role assignment, write-access toggle
  (confirmed against the write-access Entra group), and read-only-group
  membership status.
- **Roles** — the RBAC role reference: Admin / Technician / Reader and
  exactly what each can do.

{: .note }
> Only this page requires the `users:manage` permission (Admin role) to
> open at all. Every other Settings page is visible to every role, with
> individual write actions hidden or disabled per role instead. See
> [Requirements: Roles inside PatchPilot365]({{ "/requirements/#roles-inside-patchpilot365" | relative_url }}).

## Windows Update Policies

Feature update, quality update, update ring, and driver update policies
synced live from Intune, plus this tenant's target build — five tabs:
**Feature Updates**, **Quality Updates**, **Update Rings**, **Driver
Updates**, **Target Build**. Per [Known Issues]({{ "/known-issues/" | relative_url }}),
Update Rings and Driver Updates are read-only mirrors of Intune with no
create/edit/delete path.
