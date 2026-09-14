---
title: Architecture
nav_order: 3
---

# Architecture

PatchPilot365 is a single system an MSP runs itself, built to bridge the gap
between vulnerability management and remediation across every customer
tenant it manages. It doesn't replace the Microsoft services a customer
already pays for — it orchestrates Defender for Endpoint and Intune, using
the GDAP relationship the MSP already holds with that customer, with the
correct, already-established permissions rather than a new standing
credential of its own.

There's no agent on a customer's devices and PatchPilot365 installs nothing
on them. Every finding it shows and every fix it applies goes through
Microsoft Defender for Endpoint and Intune, in the customer's own tenant —
using the access an engineer's own Microsoft account already has there, for
as long as a single request takes and no longer. PatchPilot365 holds no
password or standing key for any customer.

{: .note }
> This page is a summary aimed at someone deciding whether to adopt
> PatchPilot365 or explaining it to a colleague. The in-app **Setup >
> Architecture** page (visible once signed in) is the maintained source of
> truth, with interactive diagrams you can click into for detail — see
> [Navigating PatchPilot365: Setup]({{ "/navigating-patchpilot/setup/" | relative_url }}).

## How the engineer and PatchPilot365 reach a tenant

An engineer signs in with their own Microsoft account, bringing whatever
GDAP roles that account already holds in each customer tenant. Their
browser only ever holds a session cookie — never a Graph token. When
PatchPilot365 needs to do something in a tenant, it asks Microsoft Entra ID
for a short-lived token scoped to that one tenant and nothing else.

- **Home tenant** (the MSP's own): reached via the On-Behalf-Of flow —
  PatchPilot365 exchanges the engineer's live sign-in, server-side, for a
  token. This needs someone actually signed in, which is why an overnight
  schedule keeps the owning engineer's renewable credential for up to 90
  days; if that engineer stops signing in, their schedules stop with a clear
  message rather than failing silently.
- **Customer tenants**: reached through the GDAP relationship set up during
  onboarding. The token PatchPilot365 receives inherits exactly the roles
  the signed-in engineer personally holds in that customer — Microsoft
  doesn't allow an application to hold GDAP roles of its own, so there is no
  mode in which PatchPilot365 acts as itself.

<pre class="mermaid">
flowchart LR
    Engineer["Engineer"] -->|"signs in with GDAP roles"| PP["PatchPilot365"]
    PP -->|"asks for a token"| Entra["Microsoft Entra ID"]
    Entra -->|"On-Behalf-Of"| MSPHome["MSP home tenant"]
    subgraph Customers["Customer tenants — GDAP"]
        CustA["Customer Tenant A"]
        CustB["Customer Tenant B"]
        CustC["Customer Tenant C"]
    end
    Entra -->|"delegated token"| CustA
    Entra --> CustB
    Entra --> CustC
</pre>

## Remediation options, channels, and catalogs

PatchPilot365 matches every finding against a set of package/script catalogs
to work out the actual fix, then dispatches it through one of several
Microsoft-owned channels. Which channel runs is picked automatically — Live
Response by default — or an engineer can override it from the Run Now
dialog.

Four catalogs feed that decision:

- **Winget** — the default match for an app finding.
- **Chocolatey and the Microsoft Store** — a small hand-curated fallback for
  apps winget doesn't cover.
- **Windows Update Catalog** — Microsoft's own live, per-tenant list of
  quality-update releases.
- **Script Catalog** — PatchPilot365's library of custom PowerShell for
  findings that map to none of the above; cataloged, but dispatched
  manually rather than picked automatically.

Of the remediation channels, three are wired end-to-end today:

| Channel | Latency | Use |
| --- | --- | --- |
| Defender Live Response | Seconds | Ad-hoc script on a single device |
| Win32 app deployment (Intune) | 5–15 min | Packaged Winget upgrade at scale |
| Expedited Quality Update (Intune) | Hours | OS quality patches |

A fourth, Intune's on-demand proactive remediation, is fully modeled in the
data layer (selectable, preflight-checked, present in historical job rows)
but not actually dispatched by the worker yet — kept modeled deliberately
for a future release rather than removed outright.

<pre class="mermaid">
flowchart LR
    Winget["Winget Catalog"] -->|"match a package"| PP["PatchPilot365"]
    Alt["Chocolatey / Microsoft Store"] -->|"fallback match"| PP
    WUCatalog["Windows Update Catalog"] -->|"match a release/KB"| PP
    Script["Script Catalog"] -->|"manual pick"| PP

    subgraph Customer["Inside the customer tenant"]
        LiveResponse["Defender Live Response"]
        AppDeploy["Intune app deploy (Win32 / Store)"]
        WUPolicies["Intune Windows Update policies"]
        IntuneRemediation["Intune proactive remediation (modeled, not used)"]
        Device["Managed Windows device"]
    end

    PP -->|"seconds"| LiveResponse
    PP -->|"minutes"| AppDeploy
    PP -->|"hours"| WUPolicies
    PP -.->|"modeled — not used"| IntuneRemediation

    LiveResponse -->|"runs the script"| Device
    AppDeploy -->|"installs the app"| Device
    WUPolicies -.->|"installs when due"| Device
</pre>

## How a fix reaches a device

Remediation runs through Defender for Endpoint's Live Response. The device
is already enrolled in Defender and Intune, so there's no agent for
PatchPilot365 to install — it asks Defender to run a script on the machine
and waits for the verdict. The script is published to the customer's Live
Response library once, named by a hash of its own contents, and reused
after that. Success is decided from a marker the script prints itself
rather than trusting Defender's reported exit code, since a script can exit
zero having done nothing.

Windows Update work (feature updates, quality updates, update rings, driver
updates) goes through a separate path, described next.

<pre class="mermaid">
flowchart LR
    PP["PatchPilot365"] -->|"run this script"| Defender["Defender for Endpoint"]
    Defender -.->|"poll for the result"| PP
    PP -->|"sync / expedite update"| Intune["Intune / Microsoft Graph"]

    subgraph Customer["Inside the customer tenant"]
        Defender
        Intune
        Device["Managed Windows device"]
    end

    Defender -->|"runs it on the machine"| Device
    Intune -->|"applies policy"| Device
</pre>

## How Windows updates are identified and delivered

The Windows Updates hub covers four Intune policy types: feature updates
and quality updates, which PatchPilot365 can create and delete, plus update
rings and driver updates, which it only reads and displays.

- **Quality updates** are matched against a real catalog — Microsoft
  publishes the tenant's actual list of monthly and out-of-band releases,
  and PatchPilot365 either matches a Defender-reported missing KB against it
  or lets an engineer pick a release directly.
- **Feature updates** have no such catalog — PatchPilot365 writes the target
  Windows version label (e.g. "24H2") straight into the policy.

Delivery for both is the same shape: create an Intune policy and assign it
to a real Entra group. Once assigned, delivery is out of PatchPilot365's
hands — the device pulls the policy on its own Windows Update check-in.

<pre class="mermaid">
flowchart LR
    PP["PatchPilot365"] -->|"read catalog / write policy"| Graph["Microsoft Graph — Windows Update APIs"]
    Graph -.->|"catalog & policy state"| PP

    subgraph Customer["Inside the customer tenant"]
        Graph
        Group["Entra security group"]
        Device["Managed Windows device"]
    end

    Graph -->|"assigns policy"| Group
    Group -.->|"device installs when due"| Device
</pre>

## Microsoft APIs used

Defender calls go to `api.securitycenter.microsoft.com`; Intune calls go to
`graph.microsoft.com`. Every call is made with a delegated token for a
single tenant and recorded in the audit log against the engineer who caused
it.

## Network requirements at a glance

Two networks matter, and only one is under the MSP's control:

- **PatchPilot365's own server** needs outbound access to the two Microsoft
  API hosts above, plus `login.microsoftonline.com` for auth.
- **Every managed device** needs its own outbound access for the Defender
  sensor and the Intune Management Extension — this is usually the network
  a remediation job actually stalls or fails on, not PatchPilot365's server.
  Full current host lists and AV/whitelisting exclusion paths are on the
  in-app Architecture page's "Whitelisting requirements" section, since
  Microsoft revises these lists independently of PatchPilot365 releases.

See [Requirements]({{ "/requirements/" | relative_url }}) for licensing and
role prerequisites, and [Known Issues]({{ "/known-issues/" | relative_url }})
for what this architecture can't do yet.
