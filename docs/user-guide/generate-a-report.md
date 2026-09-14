---
title: Generate a report
parent: User Guide
nav_order: 4
---

# Generate a report

1. Open **Reports & Records > Reports**. Any role with `operations:read`
   can generate a report — Reader included, this is not a write action.
2. Pick a report type:
   - **Executive Summary** or **Compliance/SLA** — branded PDF reports.
   - One of five **CSV exports** — SLA compliance, device compliance,
     software exposure, time-to-remediate, or posture trend — for
     dropping straight into a spreadsheet.
3. Everything in a report comes from PatchPilot365's own data; generating one
   never calls out to Defender, Intune, or any external service.
4. Optionally turn on **AI narration** — a separate, additive toggle on
   top of the deterministic report. It needs both `AI_FEATURES_ENABLED=true`
   set on the server and the signed-in engineer's `ai:use` permission
   (Admin and Technician by default, not Reader). With it off, every
   section still renders from the report's own deterministic captions;
   with it on but the AI model unreachable, the report still completes
   without narration rather than failing outright. See
   [Manual Deployment: AI features]({{ "/getting-started/manual-deployment/#ai-features-optional" | relative_url }})
   to turn it on for the first time.
5. Download the finished PDF or CSV directly from the page — nothing is
   emailed automatically unless you've separately configured
   [Notifications]({{ "/navigating-patchpilot/settings/#notifications" | relative_url }})
   for a different purpose (job/sync failure alerts, not reports).
