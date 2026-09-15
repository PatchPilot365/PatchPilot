---
title: Home
layout: home
nav_order: 1
permalink: /
---

![PatchPilot365 — Patch Smarter. Stay Secure. Always.]({{ "/assets/images/logo-full.png" | relative_url }}){: .mb-4 style="max-width: 480px;" }

# PatchPilot365 Documentation
{: .fs-9 }

A multi-tenant vulnerability management tool that orchestrates remediation
for devices enrolled in Microsoft Defender and Intune.
{: .fs-6 .fw-300 }

[Get started]({{ "/getting-started/" | relative_url }}){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[View on GitHub](https://github.com/PatchPilot365/PatchPilot){: .btn .fs-5 .mb-4 .mb-md-0 }

---

## What is PatchPilot365

PatchPilot365 watches every customer tenant an MSP manages for security
findings from Microsoft Defender Vulnerability Management, then does
something about them — dispatching fixes through **Winget** (for
third-party apps) and **Windows Update** (for OS patches). Instead of
jumping between separate Microsoft consoles for each customer, an engineer
gets one place to see what's exposed across the whole fleet and act on it.

It doesn't replace Defender or Intune — it orchestrates them, using the
access relationship (GDAP) the MSP already holds with each customer. There's
no agent to install on a customer's devices; every finding and every fix
goes through Microsoft's own APIs.

PatchPilot365 is designed to run primarily as a virtual machine in Azure,
deployed with one click, with support for on-premises or third-party
hosting if you need it. A couple of things worth knowing up front:

- **Tokens never touch the browser.** Every Microsoft Graph/Defender call
  happens server-side.
- **No standing credential for any customer.** Every action runs with the
  signed-in engineer's own access, for only as long as it takes.

## Where to go next

| If you want to... | Go to |
| --- | --- |
| Stand up an instance and see it running | [Getting Started]({{ "/getting-started/" | relative_url }}) |
| Understand how it connects to a tenant and reaches a device | [Architecture]({{ "/architecture/" | relative_url }}) |
| Check licensing, roles, and network prerequisites before you commit | [Requirements]({{ "/requirements/" | relative_url }}) |
| See what PatchPilot365 can't do yet, before you hit it in the field | [Known Issues]({{ "/known-issues/" | relative_url }}) |
| Find your way around a page you're looking at right now | [Navigating PatchPilot365]({{ "/navigating-patchpilot/" | relative_url }}) |
| Keep an already-running instance healthy | [Server Health & Maintenance]({{ "/server-health-and-maintenance/" | relative_url }}) |
| Walk through a specific task step by step | [User Guide]({{ "/user-guide/" | relative_url }}) |

This site covers using and operating PatchPilot365 as an MSP engineer or admin.
For contributor-facing details (monorepo layout, running the test suite,
internal design notes), see the
[repository README](https://github.com/PatchPilot365/PatchPilot#readme).
