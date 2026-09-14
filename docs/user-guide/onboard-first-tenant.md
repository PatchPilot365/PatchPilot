---
title: Onboard a first tenant
parent: User Guide
nav_order: 1
permalink: /user-guide/onboard-first-tenant/
---

# Onboard a first tenant

1. **Establish the GDAP relationship in Partner Center first.** PatchPilot365
   can't create this relationship — the MSP requests it and the customer
   approves it in Microsoft Partner Center, outside PatchPilot365 entirely.
   See [Known Issues]({{ "/known-issues/#access-and-onboarding" | relative_url }}).
2. Once the relationship is active, open **Settings > Tenants** and click
   **Discover** (or the page-level re-probe action) to have PatchPilot365 pick
   up the new tenant.
3. Confirm its **Consent** column reads *Active* and its **Reachability**
   column reads *Reachable*. If Reachability shows *Needs consent*, the
   customer's admin consent for PatchPilot365's app registration is still
   outstanding — see [App Registration]({{ "/navigating-patchpilot/setup/#app-registration" | relative_url }}).
4. The tenant starts **read-only**. Leave it that way until you've reviewed
   its data; opt in write access explicitly on the same Tenants row when
   you're ready to dispatch remediations against it.
5. Switch the tenant selector to the new tenant and check
   **Setup > Setup Health > Readiness** — this confirms the tenant is
   actually synced (Defender onboarding present, latest sync succeeded),
   not just reachable.
6. From here, the [Dashboard]({{ "/navigating-patchpilot/operations/#dashboard" | relative_url }})
   for that tenant should populate on the next scheduled sync. Continue to
   [Remediate a vulnerability]({{ "/user-guide/remediate-a-vulnerability/" | relative_url }}).
