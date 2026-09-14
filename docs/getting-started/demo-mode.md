---
title: Demo Mode
parent: Getting Started
nav_order: 3
---

# Demo Mode

Demo Mode shows the full PatchPilot365 console running on fictional sample
data — tenants, devices, vulnerabilities, jobs — with no real Microsoft 365
tenant connected. Sign-in is bypassed with a demo engineer, so it's the
fastest way to click through every page and get a feel for the navigation
before you connect anything real.

## How to enable it

The easiest way is from an already-running instance (see
[Azure Deployment]({{ "/getting-started/azure-deploy/" | relative_url }})):
on the [Pairing]({{ "/getting-started/pairing/" | relative_url }}) screen,
click **Enable Demo Mode** instead of running the pairing script.

## What's real and what isn't

Everything you see is fictional. Nothing you click sends a request anywhere
outside the instance, and the demo bypass cannot be tricked into activating
on a production instance — that's gated strictly on the `DEMO_MODE`
environment variable, and a real deployment always runs with
`DEMO_MODE=false`.

{: .note }
> Enabling Demo Mode is **one-way**, the same as pairing itself — there's no
> in-app way to switch back to an unpaired state afterward.
