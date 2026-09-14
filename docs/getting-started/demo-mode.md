---
title: Demo Mode
parent: Getting Started
nav_order: 1
---

# Demo Mode — zero-dependency demo

`DEMO_MODE=true` (the default) needs **no Docker, no Postgres, no Redis, and
no Entra app**. Sign-in is bypassed with a demo engineer, and every screen is
served from in-memory fixture data, so the console is instantly clickable.

This is the fastest way to see what PatchPilot looks like, click through
every page, and get a feel for the navigation before deciding whether to
connect a real tenant.

## Prerequisites

- Node 22+
- pnpm 9+

## Run it

```bash
pnpm install
pnpm dev          # web + api + worker, hot reload, DEMO_MODE on by default
```

- Web console: [http://localhost:5173](http://localhost:5173) (Vite proxies
  `/api` and `/auth` through to the API)
- API: [http://localhost:4000](http://localhost:4000)

That's it — no `.env` file is required to run this path.

## What's real and what isn't

Everything you see is fictional sample data: tenants, devices,
vulnerabilities, jobs. No Microsoft 365 tenant is connected, and nothing you
click sends a real request anywhere outside your machine.

The demo bypass and in-memory data are gated strictly on `DEMO_MODE`, and
that gate cannot be tricked into activating in production — a production
instance always runs with `DEMO_MODE=false`.

## Next step

When you're ready to connect a real tenant, move on to
[Development with real infra or Production deploy]({{ "/getting-started/production-deploy/" | relative_url }}),
or jump straight to the
[Azure one-click deploy]({{ "/getting-started/azure-deploy/" | relative_url }})
if you don't want to provision a server by hand.
