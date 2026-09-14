---
title: Set up a schedule
parent: User Guide
nav_order: 3
---

# Set up a schedule

1. If you want the schedule to target a subset of the fleet rather than
   every device, create a **Device Group** first (**Operations > Device
   Groups**) and assign devices to it from the **Devices** page.
2. Open **Operations > Schedules** and create a new recurring schedule,
   scoped either to a device group or to the whole tenant.
3. When a schedule fires, the worker doesn't just blindly dispatch — it
   re-runs the same pre-flight gate on each matching device first, the
   same check available on demand in
   [Setup Health > Pre-flight]({{ "/navigating-patchpilot/setup/#setup-health" | relative_url }}).
   Devices that fail the gate are skipped that run, not force-fixed.
4. Every create, edit, and pause on this page is audited — check
   [Audit Log]({{ "/navigating-patchpilot/reports-and-records/#audit-log" | relative_url }})
   if a schedule's history needs review.
5. Check **Settings > Server Health > Workers & Schedulers** to confirm
   the schedule is actually healthy (last/next fire time) rather than
   silently stalled — this view is operational, separate from the
   schedule's own configuration page.
6. Results land in the same places a manually dispatched fix does: **Jobs**
   while running, **Remediation History** once closed. See
   [Remediate a vulnerability]({{ "/user-guide/remediate-a-vulnerability/" | relative_url }})
   for that half of the flow.
