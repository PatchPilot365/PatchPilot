---
title: Known Issues
nav_order: 5
---

# Known Issues

PatchPilot works entirely inside Defender's and Intune's own APIs — it
doesn't bypass them, so it also inherits their gaps. This page lists what it
can't do today, grouped by area. The in-app **Setup > Architecture** page
carries the same list alongside the live diagrams it applies to.

## Remediation coverage

- **"Preview" channels don't dispatch for real yet.** The Microsoft Store
  and Script Catalog channels, and Intune's on-demand proactive remediation
  scripts, are consistently labeled "(preview)" wherever they're listed —
  fully modeled in the data layer (selectable, preflight-checked, present in
  historical job rows) but not actually dispatched by the worker. Only Live
  Response, Win32/Intune app deployment, and Intune's expedited quality
  updates are wired end-to-end today.
- **Some findings have nothing to install.** Bundled or statically-linked
  libraries (OpenSSL, Log4j, and similar) have to be fixed by the
  application that ships them, not by updating a package — PatchPilot flags
  these for manual remediation instead of dispatching a fix. Software with
  no matching winget or Chocolatey package, and findings that describe a
  misconfiguration rather than a missing update, can't be dispatched
  either.
- **Windows only.** Every remediation channel targets Windows endpoints.
  macOS, Linux, iOS, and Android devices can appear in the fleet for
  visibility, but nothing on them can be remediated.
- **Feature updates are group-only, unlike quality updates.** A quality
  update can be expedited to a single device ahead of its ring. Feature
  updates can't — Microsoft Graph has no single-device assignment target
  for them at all, only a real Entra group. So the feature-update path is a
  group-targeted, date-scheduled campaign, not a per-device fix.
- **No compliance policies, conditional access, or configuration
  profiles.** PatchPilot reads device compliance state; it never creates or
  edits Intune compliance policies, conditional access policies, or
  configuration profiles. Its only write paths are Live Response scripts,
  app deployment, and quality-update profiles.
- **Update rings and driver updates are read-only.** The Windows Updates
  hub mirrors whatever's already configured in Intune for these two policy
  types — there's no create, edit, or delete path for either.

## Device visibility

- **Devices must be enrolled in both Intune and Defender.** Inventory comes
  from Intune's managed-device list, matched to Defender by hostname. A
  device never enrolled in Intune never appears at all, and one enrolled in
  Intune but not onboarded to Defender shows up with unknown compliance,
  since posture can't be judged without Defender's exposure data.
- **Exclusions and exceptions are local to PatchPilot.** Defender has no
  write API for its own device-exclusion or recommendation-exception
  features, so excluding a device or granting a CVE exception only
  suppresses it inside PatchPilot. To stop Defender itself from flagging
  it, an engineer still has to apply the matching exclusion by hand in the
  Defender portal.

## Access and onboarding

- **PatchPilot can't create GDAP relationships.** Reaching a new customer
  tenant always starts in Microsoft Partner Center, where the MSP requests
  the relationship and the customer approves it. PatchPilot only consumes
  an already-active relationship.
- **Granting or revoking write access needs a Global Administrator.** The
  write-access toggle on Settings > Users can only be confirmed by someone
  who is already a Global Administrator or Privileged Role Administrator in
  the home tenant — Microsoft's own requirement for modifying a
  role-assignable group, not something PatchPilot can work around.
- **Live Response and Unsigned Scripts must be enabled manually, per
  tenant.** Two toggles in the Microsoft 365 Defender portal that no
  Graph/Defender API permission or PowerShell cmdlet can set — see
  [Requirements]({{ "/requirements/" | relative_url }}).

## Onboarding and pairing

- **Azure Cloud Shell is no longer offered as a pairing method** (removed
  in v1.0.3). Tenants with Security Defaults or Conditional Access policies
  enabled — the common case now — block Cloud Shell's sign-in from
  satisfying those policies, so it stopped completing the pairing script
  reliably. Run the downloaded PowerShell script locally instead — see
  [Pairing]({{ "/getting-started/pairing/" | relative_url }}).

## Backups (self-hosted infrastructure)

- **Postgres backups are local-disk-only by design.** The nightly dump
  lands on the host's own disk (or the Azure VM's own disk, for that
  deploy path) and does not survive losing the machine. Arrange your own
  off-box copy if that matters for your deployment — see
  [Server Health & Maintenance]({{ "/server-health-and-maintenance/" | relative_url }}).

## Where this list comes from

This is a living list — check the
[CHANGELOG](https://github.com/PatchPilot365/PatchPilot/blob/main/CHANGELOG.md)
for what's shipped since your version, and the in-app **Setup >
Architecture** page for anything added after this site was last published.
