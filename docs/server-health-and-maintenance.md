---
title: Server Health & Maintenance
nav_order: 7
permalink: /server-health-and-maintenance/
---

# Server Health & Maintenance

*"Live resource usage, service/queue/scheduler status, and confirmed
restart actions for this PatchPilot365 instance."* This is the operational
page for keeping an instance running — whether it's an Azure Deployment or
a self-hosted install — found at **Settings > Server Health**, three tabs.

## Resources

Host-level metrics: CPU / memory / disk usage over time, and whether the
host has a pending reboot (kernel or library update waiting). Two
independent controls live here, and the page is explicit that they are
different things:

- **Docker live-restore** — keeps containers running across a `dockerd`
  restart. Turning it on for the first time still causes one brief
  all-container restart; after that, a Docker Engine update no longer
  restarts every container at once.
- **Restart Server (OS reboot)** — reboots the whole virtual machine, OS
  and kernel included, not just the containers. Everything, including the
  dashboard itself, is briefly unreachable (about a minute). This is
  deliberately separate from "Restart entire stack" on the Containers tab,
  which only restarts containers and never touches the OS.
- An optional **auto-reboot** schedule (server time, UTC) can apply pending
  OS updates automatically at a set hour.

## Workers & Schedulers

Read-only visibility into the background processing layer:

- **Workers** — BullMQ queue depth per queue (Remediation / Schedules /
  Reports), worker-process liveness, and a stuck-jobs tile.
- **Schedules** — the same recurring schedules configured on the
  [Operations > Schedules]({{ "/navigating-patchpilot/operations/#schedules" | relative_url }})
  page, shown here from an operational angle (last/next fire time, health)
  rather than a configuration one.

There is deliberately no restart button on this tab — restarting the `api`
or `worker` process now goes through the same queued, audited path as the
Containers tab below, instead of a separate one-off action.

## Services & Containers

- **Services** — status of the app's own dependencies (Postgres, Redis,
  and similar).
- **Containers** — a queued, audited restart for an individual container,
  or **Restart entire stack** (every container except the updater sidecar
  itself). Restarting a single container goes through the updater sidecar
  and is not instant; a stack restart briefly takes the whole instance
  down. Every restart, of either kind, is recorded in the
  [Audit Log]({{ "/navigating-patchpilot/reports-and-records/#audit-log" | relative_url }}).
- Restart actions need the updater sidecar (unavailable in Demo Mode) and
  `settings` write access — without either, the controls are hidden or
  disabled rather than erroring.

## Backups

Postgres is dumped nightly by the `backup` container, on a schedule
controlled by two environment variables:

| Variable | Meaning |
| --- | --- |
| `BACKUP_HOUR` | Hour (0–23, container-local time) the nightly dump runs. Default `2`. |
| `BACKUP_RETENTION_DAYS` | How many days of dumps to keep before the oldest are deleted. Default `14`. |

{: .warning }
> Dumps land on local disk only — `/opt/patchpilot/backups` on the Azure VM
> deploy path, or the host's own disk otherwise. This is by design and does
> **not** survive losing the machine. Arrange your own off-box copy (for
> example a scheduled `az storage blob upload-batch` via `run-command` on
> the Azure path) if that matters for your deployment.

See [Requirements]({{ "/requirements/" | relative_url }}) for the full
environment-variable reference, and
[Azure Deployment]({{ "/getting-started/azure-deploy/" | relative_url }}) for
the Azure-specific update and troubleshooting commands.
