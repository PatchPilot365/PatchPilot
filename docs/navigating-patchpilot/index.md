---
title: Navigating PatchPilot
nav_order: 6
has_children: true
---

# Navigating PatchPilot

Once signed in, the sidebar groups every page into five sections. This
section of the docs has one page per group, each with one heading per page
inside it so you can jump straight to what you're looking at.

| Sidebar group | What's in it | Docs page |
| --- | --- | --- |
| **Operations** | Dashboard, Device Groups, Devices, Jobs, Schedules, Security Recommendations, Vulnerabilities | [Operations]({{ "/navigating-patchpilot/operations/" | relative_url }}) |
| **Reports & Records** | Audit Log, Inventories, Remediation History, Reports | [Reports & Records]({{ "/navigating-patchpilot/reports-and-records/" | relative_url }}) |
| **Catalog** | Chocolatey Catalog, Script Catalog, Winget Catalog | [Catalog]({{ "/navigating-patchpilot/catalog/" | relative_url }}) |
| **Setup** | App Registration, Architecture, Setup Health | [Setup]({{ "/navigating-patchpilot/setup/" | relative_url }}) |
| **Settings** | Branding, Compliance SLA, License, Notifications, Server Health, Tenants, Updates, Users, Windows Update Policies | [Settings]({{ "/navigating-patchpilot/settings/" | relative_url }}) |

Server Health gets its own dedicated deep-dive page in this site —
see [Server Health & Maintenance]({{ "/server-health-and-maintenance/" | relative_url }}) —
since keeping an instance running is a big enough topic on its own.

## What every role sees

Every page above is visible to every signed-in engineer except **Settings >
Users**, which requires the `users:manage` permission (the **Admin** role).
Beyond that one gate, pages don't hide themselves by role — instead, each
page hides or disables the specific *actions* a **Reader** can't perform
(dispatching a fix, editing a schedule, and so on), so a read-only user can
still see everything and understand what happened without being offered
buttons that would just fail. See
[Requirements: Roles inside PatchPilot]({{ "/requirements/#roles-inside-patchpilot" | relative_url }})
for the full role breakdown.

## Help and the AI assistant

- **Help** (bottom of the sidebar) is a standing link to in-app guidance and
  support information, separate from this site.
- Every page can carry an **AI chatbot** widget when AI features are turned
  on (`AI_FEATURES_ENABLED=true` and the signed-in engineer holds `ai:use`
  — Admin and Technician by default, not Reader). It answers questions about
  what's currently on screen using the same RBAC-scoped data the page
  itself already has access to — it's never given a raw database
  connection. See
  [AI features]({{ "/getting-started/production-deploy/#ai-features-optional" | relative_url }})
  for how to turn it on.
