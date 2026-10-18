---
title: Conditional Access
nav_order: 9
permalink: /conditional-access/
---

# Conditional Access for PatchPilot engineers

PatchPilot keeps each engineer's Microsoft refresh token, encrypted, so that
auto-sync and schedules can run with no one signed in. Anyone who gets hold of
one of those refresh tokens together with PatchPilot's app credential can use
that engineer's GDAP access from anywhere. A Conditional Access location policy
in your own (MSP) tenant limits where the engineers' tokens work: a copy taken
off the server stops working outside the networks you allow.

This guide is about Microsoft Entra configuration. It needs Entra ID P1 or
higher in the MSP tenant. PatchPilot itself doesn't change.

## How it applies to PatchPilot

- **Where Entra sees the request from.**
  - An engineer's interactive sign-in comes from the engineer's browser, so
    their own network.
  - Refresh-token redemption (auto-sync, schedules, remediation jobs) and
    on-behalf-of exchanges come from the PatchPilot server. They appear in the
    sign-in logs as non-interactive sign-ins from the server's outbound IP.
- **The allowed locations therefore have to include both** the server's
  outbound IP and the networks engineers sign in from (office, VPN). If
  engineers sign in from anywhere, this policy can only cover the server side
  if PatchPilot work happens through a VPN or jump host that has a fixed IP.
- **The policy targets users, not the PatchPilot app.** Conditional Access
  for delegated access can't filter on which client app is asking. Target the
  engineer accounts instead. This works best when engineers use dedicated
  admin accounts that do nothing but MSP admin work (including PatchPilot), so
  the policy doesn't affect their day-to-day mailbox account.
- **Customer tenants: test this before relying on it.** The policy definitely
  applies to sign-ins and token refreshes in the MSP tenant. Whether it is
  also enforced when PatchPilot redeems the refresh token against a customer
  tenant through GDAP isn't confirmed. Step 4 of the test plan checks this.

## 1. Named location

Entra admin center → Protection → Conditional Access → **Named locations** →
**+ IP ranges location**.

- **Name:** `PatchPilot allowed networks`
- **Mark as trusted location:** leave unticked. This policy doesn't need it,
  and ticking it also affects risk scoring and MFA registration.
- **IP ranges:**
  - the PatchPilot server's outbound public IP as a `/32`. For a cloud VM,
    that's its public IP or NAT gateway IP. For a server on-premises, it's the
    site's public IP;
  - each office or VPN egress range engineers sign in from.

To check the server's outbound IP, run this on the server:

```bash
curl -s https://api.ipify.org
```

## 2. Policy in report-only mode

Conditional Access → Policies → **+ New policy**.

| Setting | Value |
| --- | --- |
| Name | `PatchPilot engineers - block outside allowed networks` |
| Users → Include | The PatchPilot engineer group(s), e.g. the PatchPilot read-only and write access groups, or a dedicated "MSP admin accounts" group |
| Users → Exclude | Your emergency-access (break-glass) accounts, always |
| Target resources | **All resources** |
| Network | Configure **Yes** → Include **Any network or location** → Exclude **Selected networks and locations** → `PatchPilot allowed networks` |
| Grant | **Block access** |
| Enable policy | **Report-only** |

Why "All resources" instead of only Microsoft Graph and the Defender API: a
stolen refresh token can be redeemed for any resource the engineer has
consented to, not just the ones PatchPilot calls. Blocking only some resources
would leave the rest open.

## 3. Optional: Continuous Access Evaluation strict location

Conditional Access is normally checked only when a token is issued, so an
access token already issued stays valid for up to about an hour wherever it's
used. If you turn on **strictly enforce location policies**
(Session → Customize continuous access evaluation), CAE-capable resources such
as Microsoft Graph reject tokens used from an IP the policy doesn't allow.

PatchPilot doesn't currently request CAE-capable tokens (MSAL's `cp1` client
capability), so for now this only affects tokens copied into other tools.
Leave it off during the report-only phase.

## 4. Test plan, report-only (about a week)

1. **Normal use.** Sign in to PatchPilot from each allowed network. Let
   auto-sync run at least twice, run a tenant sync by hand, and let a schedule
   or remediation job run.
2. **Review the results.** Go to Entra → Sign-in logs, add the filter
   **Conditional Access → Report-only: Failure**, and check both the
   **User sign-ins (interactive)** and **User sign-ins (non-interactive)**
   tabs.
   - Any failure from the server's IP means the IP is wrong or missing. Fix
     the named location.
   - Failures from an engineer's legitimate network mean a range is missing.
3. **Expected block.** Sign in as a test engineer from a network that isn't
   allowed, such as a phone hotspot. That sign-in should show
   **Report-only: Failure** for this policy.
4. **Customer-tenant enforcement.** Open the non-interactive sign-ins from
   the server. Look for entries whose **Resource tenant ID** is a customer
   tenant, and expand **Conditional Access → Report-only**.
   - If this policy shows up there, it's evaluated when PatchPilot redeems
     tokens for customer tenants.
   - If it only appears on entries for your own tenant, it protects sign-ins
     and token refreshes in your tenant but not direct redemption against
     customer tenants. Rely on the other controls below for that part.
5. **Switch it on.** Once a full week shows no unexpected failures, set the
   policy to **On**. Repeat steps 1 and 3 the same day.

## 5. Rollback

If something is blocked by mistake, set the policy to **Report-only** or
**Off**. It takes effect for new token requests within a few minutes. Signing
in with a break-glass account always works, because those accounts are
excluded.

## Changing the server's IP

Moving the server to a new host or IP blocks every engineer's background
access as soon as the policy is On. Before you move it, add the new IP to
`PatchPilot allowed networks`, and remove the old one afterwards.

## Related controls

- **App credential.** PatchPilot pairs with an instance-generated certificate
  by default. A refresh token copied without that certificate's private key
  can't be redeemed, because Entra requires the confidential client to
  authenticate. Remove any leftover client secrets from the app registration.
- **Revoking access.** Disabling an engineer in Users & Roles, or using
  *Revoke background access*, deletes their cached refresh token from Redis.
  Revoking the user's sessions in Entra invalidates every copy of their
  refresh tokens wherever they are stored.
- **Monitoring.** In the sign-in logs, filter Application = PatchPilot on the
  non-interactive tab. Any IP other than the server's deserves a look. If the
  logs go to Log Analytics or Sentinel, an alert rule on that condition gives
  the same check continuously.
