---
title: Home
layout: home
nav_order: 1
permalink: /
---

# PatchPilot Documentation
{: .fs-9 }

A self-hosted, multi-tenant Windows patch management console for MSPs.
{: .fs-6 .fw-300 }

[Get started]({{ "/getting-started/" | relative_url }}){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[View on GitHub](https://github.com/PatchPilot365/PatchPilot){: .btn .fs-5 .mb-4 .mb-md-0 }

---

## What PatchPilot is

PatchPilot bridges Microsoft Defender Vulnerability Management (MDVM)
findings to actual remediation — via **Winget** (third-party apps) and the
**Windows Update Agent** (OS patches) — across every GDAP-linked customer
tenant an MSP manages. Instead of working tenant by tenant inside separate
Microsoft consoles, an engineer gets one place to see what's exposed across
the whole fleet and act on it.

It doesn't replace the Microsoft services a customer already pays for — it
orchestrates Defender for Endpoint and Intune, using the GDAP relationship
the MSP already holds with that customer, with the correct, already
established permissions rather than a new standing credential of its own.
There's no agent on a customer's devices and nothing installed on them; every
finding and every fix goes through Microsoft's own APIs.

A few things that follow from that:

- **No Azure, no SharePoint, no Power Platform, no Dataverse.** The entire
  stack is self-hosted — Docker Compose on a VPS, MSP infrastructure, or
  on-prem — and you control it end to end.
- **Tokens never touch the browser.** The SPA holds only a session cookie;
  every Microsoft Graph/Defender call happens server-side.
- **PatchPilot holds no standing credential for any customer.** Every action
  runs with the signed-in engineer's own delegated access, for as long as a
  single request takes and no longer.

## Where to go next

| If you want to... | Go to |
| --- | --- |
| Stand up an instance and see it running | [Getting Started]({{ "/getting-started/" | relative_url }}) |
| Understand how it connects to a tenant and reaches a device | [Architecture]({{ "/architecture/" | relative_url }}) |
| Check licensing, roles, and network prerequisites before you commit | [Requirements]({{ "/requirements/" | relative_url }}) |
| See what PatchPilot can't do yet, before you hit it in the field | [Known Issues]({{ "/known-issues/" | relative_url }}) |
| Find your way around a page you're looking at right now | [Navigating PatchPilot]({{ "/navigating-patchpilot/" | relative_url }}) |
| Keep an already-running instance healthy | [Server Health & Maintenance]({{ "/server-health-and-maintenance/" | relative_url }}) |
| Walk through a specific task step by step | [User Guide]({{ "/user-guide/" | relative_url }}) |

This site covers using and operating PatchPilot as an MSP engineer or admin.
For contributor-facing details (monorepo layout, running the test suite,
internal design notes), see the
[repository README](https://github.com/PatchPilot365/PatchPilot#readme).
