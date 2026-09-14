---
title: Catalog
parent: Navigating PatchPilot365
nav_order: 3
---

# Catalog

The three package/script sources PatchPilot365 matches findings against to
work out what the actual fix is. All three group a tenant's current
findings by product and score how each can be patched, filterable by match
status: **All** / **Covered** / **Not supported** / **OS / Windows Update**.

## Winget Catalog

The primary, default match source for app findings. Coverage is derived
live against the catalog itself, not the last sync snapshot, so it reflects
package availability right now. Click a product to see the matched
package, or the exposed-devices list behind it.

## Chocolatey Catalog

The per-user-install counterpart to the Winget Catalog, for apps winget
doesn't cover. Matching here is best-effort against a community feed rather
than a curated index — treat matches as a starting point to verify, not a
guarantee.

{: .note }
> This catalog is explicitly labeled **preview** in the app: matching
> quality is lower than the Winget Catalog's, by design, since it draws on
> a community-maintained feed.

## Script Catalog

Engineer-uploaded PowerShell scripts for manual and Intune remediation, for
findings that don't map to a package in either catalog above. Dispatch only
runs through the Intune (Platform/Remediation Script) method today.

{: .note }
> This channel is labeled **preview** — it always reports "not performed"
> rather than actually confirming execution today. Use it for findings
> nothing else covers, but verify the fix by hand afterward.

See [Known Issues]({{ "/known-issues/" | relative_url }}) for the full list
of channels and catalogs that are modeled but not fully wired up yet.
