---
title: Pairing This Instance
parent: Getting Started
nav_order: 4
permalink: /getting-started/pairing/
---

# Pairing this instance

Every fresh instance — Azure Deployment or Manual Deployment — arrives at
the same screen: **Pair this instance**. There is no Entra app registration
yet, so there is nobody to sign in as until you make a choice here.

![Pairing screen showing the download-and-run PowerShell instructions and the Enable Demo Mode fallback]({{ "/assets/images/pairing-screen.png" | relative_url }})

## Choose: Demo Mode or pair with your home tenant

Two options from this screen:

- **Enable Demo Mode** — explore the console with fictional data. No real
  tenant, no script to run, nothing to configure. See
  [Demo Mode]({{ "/getting-started/demo-mode/" | relative_url }}) for what
  that means and how to get back out of it.
- **Run the deployment script** — pairs this instance with your MSP's real
  home tenant for production use. This is the path the rest of this page
  documents.

## What pairing does

`scripts/Deploy-PatchPilot.ps1` is the canonical, only supported way to
create the Entra app registration for a fresh instance:

1. Creates the Entra app registration in your MSP's home tenant.
2. Configures the read-only Graph/Defender permissions and grants admin
   consent for them.
3. Sets the Application ID URI (`api://<client-id>`) and adds the
   `access_as_user` scope, so the app can complete the On-Behalf-Of token
   exchange with **no manual portal clicks**.
4. Pairs directly with this running instance using a single-use pairing
   token baked into the downloaded script — the instance restarts itself
   automatically the moment the script finishes, now holding real
   credentials.

## Steps

1. Open the running instance in a browser. If it hasn't been paired yet,
   you'll land on this screen automatically instead of a sign-in redirect.
2. Click **Download PowerShell Script**. The download is personalized with
   this instance's pairing token — don't share it or reuse it against a
   different instance.
3. Run the script from PowerShell, **on any machine**, signed in as a
   **Global Administrator** of the MSP's own (home) tenant.
4. Wait — the page polls automatically and moves on by itself once pairing
   completes. No reload needed.

The pairing token is single-use and time-limited; if it expires before you
run the script, reload the page to generate a fresh download.

## Why Azure Cloud Shell isn't offered here

Earlier versions of this screen offered Azure Cloud Shell as a no-local-
PowerShell alternative. It's no longer offered: tenants with Security
Defaults or Conditional Access policies enabled — the common case today —
block Cloud Shell's sign-in from satisfying those policies, so it stopped
completing the pairing script reliably. Running the downloaded script from
local PowerShell is the one supported path.

## Next step

Once pairing completes, sign in for real and continue to the
[Navigating PatchPilot365]({{ "/navigating-patchpilot/" | relative_url }})
section, or jump straight to
[Onboard your first tenant]({{ "/user-guide/onboard-first-tenant/" | relative_url }}).
