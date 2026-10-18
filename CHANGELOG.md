# Changelog

All notable changes to PatchPilot are recorded here. Phase 0-5 entries below
are grouped by development phase, ordered oldest-first, from before this
project had tagged releases. From here on, changes land under "Unreleased"
and get cut into a dated "## [X.Y.Z]" section by `pnpm release <version>`
(`scripts/release.mjs`) when a version is released; `.github/workflows/release.yml`
then publishes that section as the GitHub Release body (see
Settings > Updates for how a running instance picks up a new release).

Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## Unreleased

- Added: an instance on an Azure VM can authenticate to Entra with the VM's
  managed identity, so it stores no credential at all. Run the pairing script
  with `-CredentialType ManagedIdentity -ManagedIdentityObjectId <principalId>`;
  it registers the identity as a federated credential on the app. The Azure
  deployment now gives the VM a system-assigned identity (with no roles) and
  outputs its `principalId`.
- Added: the client secret or certificate can be kept in Azure Key Vault and
  read with the VM's managed identity (`ENTRA_KEY_VAULT_URL` plus
  `ENTRA_KEY_VAULT_SECRET_NAME` or `ENTRA_KEY_VAULT_CERTIFICATE_NAME`). A Key
  Vault certificate's key never leaves the vault: Key Vault signs each
  sign-in. Both options are opt-in and Azure-only; see
  `infra/azure/README.md`.
- Security: a newly paired instance now authenticates to Entra with a
  certificate instead of a client secret. The instance generates the key pair
  itself when you download the pairing script, and the script registers only
  the public certificate on the app registration. The private key never leaves
  the server (it is stored encrypted with `TOKEN_ENCRYPTION_KEY`), so there's
  no secret to copy from `.env`, the network, or the script's transcript.
  Setup > App Registration shows the certificate's expiry and warns 30 days
  before it runs out; renew it by downloading and running a fresh pairing
  script. Instances already paired with a client secret keep working
  unchanged, and `Deploy-PatchPilot.ps1 -CredentialType Secret` still pairs
  with a secret.
- Security: the API and worker remove the Entra client secret or certificate
  key, and `TOKEN_ENCRYPTION_KEY`, from their process environment once
  they've loaded their configuration, so a package that dumps the environment,
  or a child process one spawns, no longer sees them.
- Fixed: re-running the pairing script on an app that already has a
  certificate failed with `KeyNotUpdatable`; it now keeps existing
  certificates intact when adding the new one and removing older ones.
- Fixed: a pairing script downloaded from an already-paired instance now
  defaults to that instance's tenant, instead of guessing from whatever Azure
  session the machine is signed in to (which could pick the wrong tenant and
  fail sign-in with AADSTS50020).
- Fixed: the pairing script could report a 500 error even though pairing
  had succeeded, because the instance restarted before finishing its reply.
- Security: each encrypted token cache in Redis is now bound to the Redis key
  it is stored under (AES-GCM additional authenticated data). Someone able to
  write to Redis can no longer copy one engineer's cached refresh token under
  another engineer's key to act as them. Existing caches keep working and are
  re-encrypted in the new format the next time they're written. Rolling back
  to an older version afterwards means engineers have to sign in again.
- Security: Docker Compose installs can now give Redis a password through
  `REDIS_PASSWORD` in `.env`. New installs (Azure deploy and
  `Deploy-PatchPilot.ps1`) generate one automatically. Existing installs keep
  running without a password until one is added; to add one, set
  `REDIS_PASSWORD` to a random hex string (`openssl rand -hex 32`) and run
  `docker compose up -d` again.

- Security: upgraded to pnpm 10 (pinned to 10.34.6 with an integrity hash in
  `packageManager`). Dependency install scripts now run only for an explicit
  allowlist (`esbuild`, `msgpackr-extract`), and an install fails if a new
  dependency brings an unapproved install script. When adding or updating
  dependencies, pnpm only picks versions published at least 3 days ago.
  Building from source now needs pnpm 10 or later (`corepack enable` picks up
  the pinned version automatically).

- Security: the Caddy container now gets only `PP_DOMAIN` instead of the
  whole `.env`, so the internet-facing proxy no longer holds the Entra client
  secret or the token encryption key.
- Security: `Deploy-PatchPilot.ps1` no longer prints the new client secret to
  the console. It only shows the secret when the secret wasn't saved anywhere
  else, because the run transcript keeps a plain-text copy of anything
  printed. After a successful pairing, the script removes the `ENTRA_*`
  values from the local env file it wrote and offers to revoke older
  `PatchPilot-Deploy-*` secrets on the app registration. Pass
  `-RevokeOldClientSecrets` to revoke them without the prompt. Without
  pairing, it lists the older secrets so you can revoke them once the
  instance runs on the new one.
- Development: CI, release and every Docker image now install from the
  committed `pnpm-lock.yaml` with `--frozen-lockfile`, so a build can't
  quietly resolve newer dependency versions. GitHub Actions are pinned to
  commit SHAs. Workflow tokens default to read-only and aren't left in the
  checkout.

## [1.0.15] - 2026-10-17

- The Devices page now shows an amber "Not seen Nd" badge on any device that
  hasn't checked in for more than 24 hours, in the list and the device
  panel. Hover it for the last check-in time. It's informational only: the
  device stays in every list and count until you exclude it, and excluded
  devices don't get the badge.
- Development: lint now flags a promise returned without `await` inside a
  `try` block in the worker and Microsoft API code, the mistake behind the
  missing-KB and Chocolatey error-output bug fixed in 1.0.14.

## [1.0.14] - 2026-10-17

- The run dialog's pre-flight checks now warn when the device hasn't checked
  in for more than 24 hours. For Live Response, the warning says the job will
  be skipped unless Defender shows the device back online when it runs.
- Scheduled Live Response runs now leave out devices that haven't checked in
  within the last 24 hours, instead of queuing jobs that would only be
  skipped. This only applies when the tenant synced within the last day, so
  stale sync data can't hide a device. The schedule's audit entry says how
  many devices were left out.
- A Live Response job that fails part-way now keeps its progress log in the
  job output, followed by the error, instead of showing only the error.
  Missing-KB and Chocolatey runs that hit an error now also get the usual
  "execution error" output.

## [1.0.13] - 2026-10-17

- The Dashboard's Remediation throughput card now shows the right success
  rate. It printed the raw fraction with a % sign ("0.1375% success")
  instead of the percentage ("14% success").
- The remediation success rate (Dashboard and PDF reports) no longer counts
  runs PatchPilot couldn't act on. These include jobs it refused before
  dispatch, such as "no mapped winget package", and upgrades that need a
  person, such as a copy bundled inside another product or an installer-type
  mismatch. They are now shown separately as "not actionable", including a
  grey band on the throughput chart. They are still failed jobs on the Jobs
  page.
- A Live Response winget upgrade that can't find the package while running
  as SYSTEM now retries as the signed-in user, so per-user installs get
  upgraded. If the package can't be found that way either, the job shows
  "Needs attention" with a hover explanation instead of a bare winget error.
- Live Response jobs now skip a device that hasn't checked in within the
  last 24 hours, before sending anything to it. The check uses Defender's
  current last-seen time, or the last synced value if that lookup fails.
  Previously such a job sat "Pending" until Defender timed it out, holding
  the device and a job slot the whole time. The job now fails at once with
  "no write performed" and says when the device was last seen.

## [1.0.12] - 2026-10-16

- `pnpm release` no longer prints a Node DEP0190 deprecation warning when it
  restarts the local dev API.
- The web app loads faster. Each page is now downloaded the first time it is
  opened instead of all up front, and framework code sits in its own file
  that stays cached across PatchPilot updates. The app shell drops from
  about 430 kB to about 150 kB compressed, and the charting library loads
  only on pages that draw charts. A browser tab left open
  across an update reloads itself once if it asks for a page file the new
  version no longer has.
- The bundled default logo is now 256×256 (103 kB) instead of 1254×1254
  (941 kB). It looks the same at every size the app displays it.

## [1.0.11] - 2026-10-16

- Container images now run on Node.js 24 LTS (node:24-alpine, from
  node:22-alpine). CI and the release workflow build on Node 24, and local
  development now needs Node 24 or newer.
- `pnpm release` no longer kills a locally running dev worker when it
  restarts the local dev API. The api and worker supervisors share an
  identical command line; the release script now tells them apart by their
  parent process chain.
- Lint now runs clean with zero warnings. Shared helpers, types and context
  hooks moved out of component files into their own modules, so the web
  UI's hot reload works on every component file. A few list views (Jobs,
  device findings, tenant consent) no longer re-sort or regroup on renders
  where nothing changed.

## [1.0.10] - 2026-10-16

- zod updated to 4.6.7 (from 3.25.76). jsdom (test-only) updated to 30.1.2.

## [1.0.9] - 2026-10-16

- undici updated to 8.11.2 (from 7.29.1).
- New `scripts/start-dev.ps1` for local development: starts Docker Desktop,
  the dev containers and the api/worker/web dev servers, skipping anything
  already running. `-Register` sets it up to run at sign-in.

## [1.0.8] - 2026-10-16

- Dependency security updates: fastify 5.12.7, fast-uri 3.1.8, ip-address
  10.7.4 and shell-quote 1.12.0 on the server side; vitest 4.1.12 (from 2.1.9),
  vite 6.4.4, postcss, nanoid and other build and test tooling refreshed.
  Clears the open Dependabot alerts apart from one esbuild alert in
  drizzle-kit's migration tooling, which never runs in production images.

## [1.0.7] - 2026-10-16

- The device popout on the Devices page now uses most of the screen width
  (up to 1536px, was 1024px), and its tab tables scroll sideways instead of
  cutting off columns on smaller screens.
- Bundled libraries such as Tukaani XZ Utils (liblzma.dll, shipped inside
  OneDrive, Wireshark, Power BI and others) are now hidden from Software
  Inventory and the device Software tab. They were already never matched to a
  package; updating the host app is what replaces them.
- Live Response jobs no longer leave an orphaned action on the device when a
  status check hits a network error mid-poll; the error is logged and polling
  continues (the action is still cancelled on timeout). Previously the
  dispatch aborted with "execution error — fetch failed" and the device's next
  job failed with `ActiveRequestAlreadyExists`.
- When a job clears a stale action blocking the device
  (`ActiveRequestAlreadyExists`), it now waits briefly and retries its own
  action once, instead of failing after freeing the slot.
- Upgrades winget refuses because the installed copy uses a different
  installer type (exit 0x8A15008E, e.g. an MSI install of PowerShell) are now
  reported as "Needs attention" with an uninstall-and-reinstall instruction,
  instead of a raw winget exit code. PatchPilot does not uninstall to work
  around it.
- Scheduled CVE jobs now record the software name and device hostname, so they
  no longer show blank on the Jobs page.
- .NET Framework is now treated as part of Windows. Windows 10 and 11 include
  it and patch it through the monthly .NET Framework cumulative update from
  Windows Update. Defender reports every 4.x install as 4.0.0.0, so the
  inventory used to show it as behind the winget 4.8.1 runtime installer, and
  Fix Now jobs for it always failed. Software inventory now lists it as
  "Windows Update" with Fix Now disabled. Its findings are handled as OS
  findings, and scheduled sweeps skip it. Developer packs and the repair tool
  are still treated as normal apps.
- The software inventory now shows the latest .NET release for the major
  version installed on each device (such as 9.0.x), instead of the newest
  major. .NET versions install side by side, so a device on 9.0.21 showed
  10.0.13 as its latest and Fix Now installed .NET 10 next to 9 without
  patching it. Fix Now, preflight and Fix All now target that same package.
- Fixed Live Response jobs for versioned packages such as the ASP.NET Core
  runtimes failing with winget error 0x8A150014 ("no installed package found").
  One finding can cover devices on several runtime versions (8, 9, 10) but
  pointed at a single package. Each job now targets the package that matches
  the version Defender reports for that device, and the "already up to date"
  check uses that package's latest version.
- When winget has nothing installed under the requested package but the device
  has another package in the same family, the Live Response script now upgrades
  that one instead, for example Visual Studio 2022 Community instead of Remote
  Tools for Visual Studio 2022. If winget manages no package in the family, or
  every package it manages is already current, the job ends with exit code 9.
  The Jobs page shows that as an amber "Needs attention" status instead of
  "Failed": the vulnerable copy probably comes bundled with another product
  (such as Visual Studio or the .NET SDK) and has to be updated through it.
- Fixed Defender's "Visual Studio 2022" findings matching the wrong winget
  package. They matched Remote Tools for Visual Studio 2022, and its older
  latest version could make an out-of-date Visual Studio look current.
  "Microsoft Visual Studio 2022" also matched Visual Studio Code, and
  "visual_studio_2019" matched BuildTools. These now match the Community
  edition, and a device on Professional, Enterprise or BuildTools is upgraded
  through the edition fallback. That fallback now only stands in a package of
  the same kind (an edition for an edition, a runtime version for a runtime
  version), so Visual Studio 2026 can no longer "upgrade" helper packages such
  as Visual Studio Locator.
- Fixed a Live Response job for one product upgrading a different product
  that shares the same CVE. CVE-2026-88092 is listed against both Visual
  Studio 2022 and the ASP.NET Core runtime, and a Visual Studio job ran the
  ASP.NET Core upgrade instead. A single Run Now job now saves the package it
  matched, as Fix All already did. The worker also picks the finding and the
  device's installed version for the job's own product, and refuses to guess
  when a shared CVE gives it no way to tell which product the job is for.
  Scheduled jobs had the same problem: they now look up each device's finding
  by CVE and product, and save the package they resolved.
- Defender's "Remote Desktop" finding for the client bundled with WSL
  (`C:\Program Files\WSL\msrdc.exe`) is now labelled "Remote Desktop (bundled
  with WSL)" and fixed by updating WSL (`Microsoft.WSL`). It used to target the
  standalone Microsoft Remote Desktop app, which isn't installed there, so the
  upgrade failed with "no installed package". The standalone app is unaffected.
- Software tied to a versioned package, such as "Microsoft ASP.NET Core
  Runtime", no longer shows a version number in the Affected software card, the
  Vulnerabilities list or a device's CVE list. The name used to carry whichever
  runtime version PatchPilot matched (for example "10.0"), even though the
  finding covers devices on several versions. The card also hides "Latest
  version" for these packages, because each version has its own latest release.

## [1.0.6] - 2026-09-24

- Fixed scheduled remediation of software with no CVE (the "None" severity
  sweep and software-scoped schedules) always failing with "no mapped winget
  package for this software", even when PatchPilot had matched the title to a
  winget package. The scheduler saved the matched package on the job but never
  passed it to the worker. Schedules with a catalog override (Chocolatey,
  Microsoft Store, Script Catalog) now also send that override to the worker
  instead of dropping it.
- Fixed Live Response jobs failing with "remediation timed out after 420000ms"
  when a schedule queued several jobs for one device. The time limit now only
  counts the job's own turn on the device, not time spent waiting behind the
  device's other jobs, and a queued job logs that it is still waiting.
- A Live Response job that hits its time limit now actually stops. It no longer
  sends an action afterwards, cancels any Defender action it already sent, and
  stops updating the output of a job already marked failed.
- Devices now get 10 minutes, up from 5, to pick up a Live Response action,
  because a healthy device can take a full check-in cycle. The job time limit
  is raised to 13 minutes to match.

## [1.0.5] - 2026-09-17

- Renamed the device Inventories tab's "Tenant weaknesses" column back to
  "Weaknesses" and made it a genuine per-device count - it previously showed
  the same tenant-wide rollup on every device with a product installed, which
  could contradict the device's own "0 vulns" status. The new count also
  respects active recommendation exceptions, so it agrees with the device's
  own Vulnerabilities tab.

## [1.0.4] - 2026-09-16

- Added a top-level "Missing KBs" tab to the device detail panel - previously
  only reachable via a nested sub-tab under Vulnerabilities. Fixed a bug this
  exposed where the tab (and its siblings) went blank on any device with zero
  open CVEs, since the section's empty-state was gated on CVE count alone.
- Relabeled the device Inventories tab's "Weaknesses" column to
  "Tenant weaknesses" with a clearer tooltip - it's a tenant-wide count for
  the software product, not specific to the device, which could otherwise
  read as a mismatch against Defender's own per-device vulnerability count.
- Added a "Documentation" section to the in-app Help page, linking to the new
  PatchPilot365 docs site (docs.patchpilot365.com).

## [1.0.3] - 2026-09-14

- Removed Azure Cloud Shell as an onboarding/pairing method from the pairing
  screen and the App Registration settings page - Entra Security Defaults and
  Conditional Access policies (now the common case) block Cloud Shell's
  sign-in from satisfying those policies, so it no longer completes the
  pairing script reliably. Both pages now show a single PowerShell
  download-and-run path.

## [1.0.2] - 2026-09-14

- Fixed `Deploy-PatchPilot.ps1` silently skipping the pairing phone-home on a
  re-run against an already-created Entra app registration: its still-valid
  client secret was correctly reused, but Entra ID can never return a
  secret's value after creation, leaving nothing to send and no error - the
  script now prompts to rotate the secret when pairing is still needed, and
  the final summary calls out pairing status on its own line instead of it
  being buried among 15 other steps.
- Fixed `Deploy-PatchPilot.ps1` crashing at `.env`-writing time under Windows
  PowerShell 5.1 (`RandomNumberGenerator` does not contain a method named
  `'Fill'`) - that static method only exists on .NET Core/.NET 5+, not the
  .NET Framework runtime `powershell.exe` uses.
- Doubled the server's pairing-token TTL (30 -> 60 minutes): a first-ever
  run's Microsoft.Graph module install alone can eat a large chunk of the
  old window before the script ever reaches the pairing step.

## [1.0.0] - 2026-09-13

- First stable release. All Phase 0-5 features (multi-tenant onboarding,
  Defender/MDVM exposure sync, Winget/WUA/Live Response remediation,
  recurring schedules, RBAC/Users, Server Health, branding, reporting) are
  live and verified end to end; the CSRF/session-fixation/RBAC/IDOR security
  review is closed out, including response-header hardening
  (`Content-Security-Policy`, `Permissions-Policy`).

## [0.18.4] - 2026-09-13

- Security: added `Content-Security-Policy` and `Permissions-Policy` response
  headers in `infra/Caddyfile` (both the primary domain block and the
  catch-all on-demand-TLS block), closing the one gap found by a focused
  security review of CSRF/session/RBAC/IDOR handling and response headers.
  `script-src 'self'` with no inline scripts; `style-src 'self' 'unsafe-inline'`
  since several components set inline styles; `img-src` allows `https:`/`data:`
  for the customer-configurable Branding logo URL/upload.

## [0.18.3] - 2026-09-13

- Security: `api`/`worker`/`migrate` images no longer ship `vitest` (or the
  stale `esbuild` binaries it drags in transitively) into production — the
  first real run of the new Trivy scan above found the `worker` image
  carrying 235 avoidable CVE findings this way, including a critical esbuild
  one. `tsx` moved from `devDependencies` to `dependencies` in
  `apps/api/package.json`, `apps/worker/package.json`, and
  `packages/db/package.json` (it's a genuine runtime dependency — each
  image's `CMD` runs the app through it directly), and `infra/Dockerfile.api`,
  `infra/Dockerfile.worker`, `infra/Dockerfile.migrate` now install with
  `--prod` so everything else in `devDependencies` is excluded.
- Security: added Trivy container-image scanning to CI (`.github/workflows/ci.yml`)
  for every image this repo builds (`api`, `worker`, `web`, `migrate`, `updater`,
  `host-exec`) plus the pinned third-party images `docker-compose.yml` pulls
  directly (`caddy`, `postgres`, `redis`) — findings land in the repo's Code
  Scanning tab (non-blocking) rather than failing PRs. Also added
  `.github/dependabot.yml` for npm, Docker base images, and GitHub Actions.
  Neither existed before; the host-patching-settings feature already patches
  a deployed instance's own OS/Docker Engine, but nothing was watching the
  app's own images or dependencies for known CVEs.
- Security: closed a permissive-CORS gap where an unset `CORS_ORIGINS` fell
  back to allowing any origin (with `credentials: true`) instead of the
  configured web origins; `SameSite=Lax` on the session cookie already
  narrowed the practical exposure, but this closes it outright. Also added
  per-IP rate limiting to `/auth/callback` (30/min — bounds the cost of the
  real MSAL token exchange each hit triggers) and `/auth/me` (120/min — well
  above legitimate polling/shared-office-IP traffic), matching the pattern
  already used for `POST /api/onboarding/pair`.
- Security: patched `undici`, `fastify`, `find-my-way`, `fast-uri` (via new
  `pnpm.overrides` entries), and `react-router-dom` to their patched versions,
  clearing 14 `pnpm audit` advisories. All were in-range lockfile/override
  bumps with no `package.json` dependency-range or code changes required.
- Security: upgraded `drizzle-orm` (`^0.38.3` → `^0.45.2`, fixes a real SQL-injection
  advisory) and `nodemailer` (`^6.9.16` → `^10.0.9`, fixes ~10 advisories,
  dropped the now-redundant `@types/nodemailer`). Neither vulnerable pattern
  was actually reachable in this codebase (no `sql.identifier()`/dynamic
  `.as()` calls; alert-email recipients are always admin-configured, never
  attacker-influenceable) — upgraded anyway for defense-in-depth. No breaking
  changes applied to how either library is used here; clears 14 more `pnpm
  audit` advisories (27 → 13 remaining, all in dev-only build tooling never
  shipped to production).

## [0.18.2] - 2026-09-13

- Upgraded `@azure/msal-node` from `^2.16.2` to `^6.0.0` (three major versions).
  No production code changes needed — this codebase's confidential-client,
  clientSecret-based, no-interactive-flow usage pattern is unaffected by any
  breaking change across the v2-v6 span, and the token-cache-plugin contract
  is unchanged, so existing cached engineer sessions remain valid.

## [0.18.1] - 2026-09-12

- Fix the Jobs page subtitle incorrectly claiming remediations are simulated with no Microsoft API call, even on live (non-demo) tenants.

## [0.18.0] - 2026-09-12

- Added: test coverage for `apps/api/src/auth` (CSRF/state validation,
  session-fixation defense, provisioning gate, RBAC enforcement) — 36 tests
  across the module's 6 files, the one real gap in an otherwise well-tested
  codebase. Test-only, no production code changes.
- Added: `SECURITY.md` with a private vulnerability-reporting path for the
  public repo.
- Removed: the stale Phase-1 handover doc (`Claudeinstructions.txt`), which
  still claimed no-Azure as non-negotiable despite the Bicep Azure deploy
  option added since.
- Fixed: scrubbed a real customer/tenant name that had leaked into code and
  test comments.

## [0.17.2] - 2026-09-12

- Fixed: the `updater` sidecar's `/var/run/docker.sock` bind mount is
  file-level, so it went stale forever if `docker.socket` itself was ever
  restarted (e.g. a `docker-ce` package upgrade) — even though
  `docker.service` restarting alone (as when toggling Docker live-restore)
  never triggered it. Every direct `docker`/`docker compose` call from
  `updater`'s own shell then failed silently, including the self-update and
  host-reboot mechanisms. `updater` now reaches the daemon through its
  existing `/var/run:/host-run:ro` directory mount instead, which always
  reflects the host's current socket. Live-caught on `patchpilot-vm` after a
  forced `docker-ce` reinstall broke a real host-reboot request.

## [0.17.1] - 2026-09-12

- Fixed: the `updater` sidecar's self-restart (added in v0.16.0) deadlocked
  every time it ran — recreating `updater` requires dockerd to stop the
  container running the very shell that issued the command, which ignores
  the resulting SIGTERM as an unhandled PID 1, hangs for ~10s, then gets
  SIGKILLed mid-recreate, often leaving the replacement stuck `Created` but
  never started. The self-restart now runs from `host-exec` (host PID
  namespace) instead, so the client process isn't killed along with the
  container it's replacing. Live-caught on the very first real self-restart
  in production (v0.16.0 -> v0.17.0).

## [0.17.0] - 2026-09-12

- Settings > Server Health > Resources now shows the host's own OS-patching
  state: whether a reboot is pending (and which packages triggered it), when
  unattended-upgrades last ran, and whether Docker's live-restore is active.
- Added an opt-in OS auto-reboot window (server/UTC time) and opt-in Docker
  Engine auto-patching, gated behind Docker live-restore being enabled first
  so a Docker Engine update can't restart every container at once. Both are
  off by default — nothing changes for an existing instance until an admin
  opts in.
- Added a "Restart Server (OS reboot)" action, distinct from the existing
  "Restart entire stack" — this reboots the whole virtual machine (OS and
  kernel), not just the containers.

## [0.16.0] - 2026-09-12

- Fixed: the `updater` sidecar never restarted itself as part of a self-update,
  so any change to its own poll loop (e.g. the restart-container/restart-stack
  support added in v0.15.0) silently never took effect on an already-running
  instance — a queued restart request would sit at 'queued' forever with no
  error. It now rebuilds/restarts itself as the last step of each self-update
  run, once that run's outcome is already written back.
- Fixed: Server Health restart actions (restart-api/-worker/-container/-stack)
  write audit rows with no tenant, since they're infra-level events — but the
  Audit Log page defaults to whichever tenant is active, so those rows never
  showed up for anyone who hadn't manually switched to "All Tenants". The
  Containers tab now links straight to a pre-filtered, All-Tenants-scoped
  Audit Log view instead of a page that looked empty.
- Server Health tab reshuffle: Workers + Schedulers merged into one
  "Workers & Schedulers" tab, and Services + Containers merged into one
  "Services & Containers" tab — none of these needed a top-level tab each.
  The Workers tab's own Restart API/Restart Worker buttons were removed —
  they and the Containers tab's restart-container action both end up
  restarting the same api/worker process (self-exit + Docker's restart
  policy vs. a queued, audited `docker compose restart`), so only the
  Containers tab's tracked path remains. The now-unreachable
  `restart-api`/`restart-worker` API routes, and the worker's dedicated
  restart-pubsub subscriber, were removed too.
- Containers tab: added Path and Port columns (from `infra/docker-compose.yml`
  and `infra/Caddyfile`) so it's clear which containers are reachable, and how.
  Also added Runtime and Status columns — Runtime shows "Docker" or "pnpm"
  depending on how that container is actually being sampled right now (every
  managed container runs in Docker in production; api/worker run on the host
  in local dev instead — see the self-reporting bullet below), and Status
  shows "Running"/"Not reporting" once a container has reported in, or a
  plain "—" for one that simply isn't running in this environment. An earlier
  version of this work added a separate, Task-Manager-style "Processes" tab
  with per-container CPU/Memory/Network/Disk-IO detail; it was replaced with
  these two columns instead, since granular metrics for containers with no
  data available just read as broken rather than informative.
- Added `infra/updater/dev-sample.sh` (`pnpm infra:dev:sample`): a dev-only
  stand-in for the `updater` sidecar's `container_stats` sampler, which never
  runs in local dev at all (api/web/worker run on the host, not in Docker).
  Without it postgres/redis/ollama — which really are healthy local
  containers — never showed a Runtime/Status in the Containers table. This
  script samples those three via `docker stats`/`docker ps -s`/`docker
  inspect` against the `patchpilot-dev-*` container names and upserts the
  same rows the real sidecar would, so the table shows genuine local data
  during development.
- The `api`, `worker`, and `web` processes now self-report their own
  CPU%/memory into the same `container_stats` table on a 15s cadence when
  running on the host, as they do in local dev (see `dev-sample.sh` above) —
  no-op in production, where the `updater` sidecar already samples the real
  container, or in DEMO_MODE. For `web` this runs as a dev-only Vite plugin
  (`apps/web/vite-plugins/self-process-stats.ts`, `apply: "serve"`, so it
  never runs against a production build's static output) that samples the
  Vite dev server process itself. `caddy`/`backup` still show no
  Runtime/Status locally, since neither runs in any form outside production —
  see `infra/docker-compose.dev.yml`.

## [0.15.0] - 2026-09-11

- New Settings > Server Health page: live CPU/Memory/Disk graphs, PostgreSQL/Redis
  reachability tiles, BullMQ queue depth + worker liveness, and per-schedule
  healthy/stuck status for every enabled recurring schedule. Admins can restart
  the api or worker process directly from the page, each gated behind a
  confirmation dialog (`settings:write` only — visible read-only to every other
  role). A new Containers tab adds confirmed restart actions for individual
  infra containers (caddy, web, api, worker, backup, ollama, postgres, redis)
  and the whole compose stack, queued through the `updater` sidecar the same
  way self-updates already are — also `settings:write` only.
- Windows Update Policies: existing Quality Update, Feature Update, Update
  Ring, and Driver Update rows across all four tabs are now clickable,
  opening a detail drawer with the full policy settings (assignments,
  deferral/reboot windows, deployment options, Intune profile ID, etc.) —
  previously nothing was visible beyond the table's own columns. The "New
  feature-update campaign" modal now matches Intune's own Feature Update
  profile layout more closely: the Optional checkbox sits next to Target
  version, Included/Excluded group pickers moved to the bottom, and the
  removed "Offer starts"/"Offer ends" date pickers are replaced with a
  "Deployment options" section showing (a locked, always-selected) "Make
  update available as soon as possible" — the offer window the backend
  still requires is now computed automatically (now → +365 days) rather
  than picked, since the rollout interval is what actually paces the
  offer.

## [0.14.0] - 2026-09-11

- Catalog coverage (`GET /api/catalog/coverage` and
  `/api/chocolatey-catalog/coverage`) no longer scans the full,
  unfiltered `vulnerabilities` table on every request: `loadVulns()` now
  pushes the tenant filter down into SQL (hitting the existing
  `vulns_tenant_idx`) and shares a 60s TTL cache across both routes,
  invalidated whenever a sync writes new vulnerabilities. The Winget and
  Chocolatey catalog browse tables also cap what's rendered into the DOM
  at 200 rows with a "Show more" control (same pattern as the
  Vulnerabilities CVE table), rather than rendering the full ~14.8k-row
  mirror on every visit — the API responses themselves stay unpaginated
  since Recommendations, Devices, and Vulnerabilities all depend on the
  full catalog list for package lookups.
- App Registration's PowerShell instructions (Step 1, Step 3, and client
  secret rotation) now show a single Windows PowerShell command each,
  instead of a redundant `pwsh` variant above it — the `pwsh` line assumed
  a locally-installed PowerShell 7, while every command here is meant to
  run the script downloaded from Step 1, which Windows PowerShell can
  already execute. The remaining command also no longer assumes a
  `scripts\` subfolder relative to the current directory, matching how the
  downloaded file is actually laid out.
- App Registration and Architecture now document that Defender for
  Endpoint's Live Response and its unsigned-script execution are gated
  behind two "Advanced features" toggles in the Microsoft 365 Defender
  portal that no API permission or PowerShell cmdlet can set — a Global
  Administrator has to enable them by hand, once per tenant, with basic
  steps included on both pages.
- Rename "Windows Updates" to "Windows Update Policies" and move it out of
  Operations into Settings — every tab on it (Feature Updates, Quality
  Updates, Update Rings, Driver Updates) manages Intune policy objects, not
  a live per-device work queue, so it belonged with the rest of the
  tenant-configuration pages, not alongside act-now pages like Devices and
  Jobs. The old name also collided in spirit with the Devices page's
  actual patch-status view. The standalone Settings > Target Build page is
  now a fifth tab on this page instead of a separate nav item, since it
  configures the same tenant's Windows-build target the Feature Updates
  tab's campaigns roll out. Old `/windows-updates` and
  `/settings/feature-updates` URLs redirect to the new location.

## [0.13.0] - 2026-09-11

- Fix the Jobs page's "Delete selected" (and per-row "Delete") doing nothing.
  Both were gated on a native `window.confirm()`, which silently returns
  false — with no dialog and no feedback — whenever the browser suppresses
  page dialogs (Chrome's "prevent this page from creating additional
  dialogs", automation, some embedded contexts). They now use the same
  in-app confirmation modal the rest of the app already uses for destructive
  actions. Archive was unaffected because it never prompted.
- Jobs page readability: the Job Name is now bold, a batch's top-level row
  is tinted to stand out from its expanded per-device rows, and the whole
  table (rows, filters, status pills, the bulk-action bar, the detail
  drawer) now has proper dark-mode styling instead of near-black text on a
  dark background.
- The schedule timezone picker and the Schedules table now show each zone's
  current GMT offset alongside its name (e.g. `Australia/Brisbane (GMT+10)`),
  so the intended fire time is unambiguous without cross-referencing the IANA
  name.
- Fix dark mode text/background/chip contrast across the rest of the app
  (tables, modals, badges, and settings/setup pages) — the pass that fixed
  Jobs only covered that one page; this extends the same `dark:` pairings
  to every other page and shared component, including several files (e.g.
  Windows Updates' parent page, Setup Pairing, and a handful of status
  chips) that had never received any dark-mode treatment before, and adds
  missing `dark:` variants for the `orange`/`red`/`violet` color families
  that earlier passes only covered for `rose`/`amber`/etc.

## [0.12.0] - 2026-09-10

- Fix recurring schedules missing their fire. The worker's 30s reconcile
  loop re-registered every BullMQ job-scheduler on every pass; because
  `upsertJobScheduler` runs with `override: true` (which deletes the
  pending next-fire job and recomputes from now), any worker restart while
  a fire was overdue-but-unrun — credential rotation, a deploy, a
  self-update — silently skipped that occurrence. A weekly schedule then
  missed almost every week. The reconciler now leaves an unchanged
  job-scheduler alone, and only re-arms one whose cron/timezone changed or
  whose pending fire was genuinely lost (missing or more than 10 minutes
  overdue).
- Recurring schedules now fire in a chosen timezone instead of always
  UTC. The schedule form captures the creating engineer's browser zone
  (editable, full IANA list), stored on a new `schedules.timezone` column
  and passed straight through to BullMQ; existing rows default to `UTC`,
  which is the behaviour they already had.

## [0.11.1] - 2026-09-10

- Fix tenant sync failing with `MAX_PARAMETERS_EXCEEDED` on larger tenants:
  the per-tenant device, software, CVE, vulnerability-link, missing-KB, and
  remediation-event writes each built a single multi-row INSERT that
  exceeded PostgreSQL's 65534 bind-parameter cap once a tenant had enough
  devices. Those inserts are now batched via a shared `insertInChunks`
  helper.

## [0.11.0] - 2026-09-07

- Add a self-service "Enable Demo Mode" button to the Pairing Page so a
  prospect or evaluator can turn an unpaired instance into a fully
  interactive sandbox with one click, no redeploy or real tenant
  connection required. Demo mode now also has proper mock data and
  simulated create/edit/delete actions for Windows Updates and the Script
  Catalog, and Reports serves a real sample PDF instead of a dead end.
  Fictional demo data no longer reuses the MSP's own branding.

## [0.10.0] - 2026-09-07

- Add a Check Access tab to Setup Health so an engineer (or an admin, on
  another user's behalf) can see exactly where they stand across
  PatchPilot's role, home-tenant Entra roles, and per-customer-tenant GDAP
  roles, instead of guessing which of the three is blocking them.
- App Registration Step 1 now offers Windows PowerShell cmdlet variants
  alongside the existing pwsh ones; Step 3's "Add API Permissions" moved
  into a new "Option 1: Browser" action, with "Option 2: PowerShell"
  gaining matching manual cmdlets.

## [0.9.0] - 2026-09-07

- Deploy-PatchPilot.ps1 now detects a missing Entra ID P1/P2 license before
  attempting to create the home-tenant access groups (a tenant-wide licensing
  gate, independent of the connected account's own Global Administrator
  role) and gives an actionable warning instead of a misleading "likely
  missing Global Administrator" message. Settings > Users and the
  Architecture page now document the licensing prerequisite and confirm that
  a Global Administrator can still manage the home tenant directly without
  either access group.

## [0.8.0] - 2026-09-06

- Add home-tenant access groups so a PatchPilot user's real Microsoft write
  privilege in the MSP's own tenant is granted and revoked from Settings >
  Users, instead of depending on whatever Entra role they happen to already
  hold; every new user gets read-only access automatically, and write access
  is an explicit, Global-Administrator-confirmed toggle. Architecture page
  now documents both tenants' prerequisites and the Entra role -> API
  permission mapping behind them.

## [0.7.0] - 2026-09-05

- Fix Settings > Branding's "Match colours to logo" actually applying the
  saved primary/secondary/accent/sidebar colours app-wide, not just saving
  them; add the default PatchPilot logo to the device pairing page.
- Setup Health > Connections now reuses App Registration's permission pill
  styling and failed-scope error banners for a consistent look between the
  two pages.
- Add an "Auto-assign" button to Settings > License that evenly splits the
  Live Response device pool across every write-enabled tenant (zeroing
  read-only ones), instead of setting each tenant's allocation by hand.

## [0.6.0] - 2026-09-05

- Make the sidebar collapsible (persisted across reloads) with a slide-in
  drawer for narrow screens, and alphabetize/regroup its nav items — the
  former Operations category now splits actionable pages from a new
  "Reports & Records" group (Reports, Remediation History, Audit Log,
  Inventories).
- Fix the app header, floating chat widget, and page search bars clipping
  or overflowing on phone-width screens.
- Add a shared `ResponsiveTable` component (a real table at tablet width and
  up, stacked cards below it) and migrate every list page — Schedules,
  Audit Log, Software Inventory, Remediation History, Devices,
  Vulnerabilities, Recommendations, and Users — onto it, making those pages
  usable on mobile.

## [0.5.0] - 2026-09-05

- Add a branded login splash page (PatchPilot365 logo, a single "Sign in
  with Microsoft 365" button using the official 4-color Microsoft squares
  mark) shown whenever an already-paired instance has no active session,
  replacing the previous instant, unbranded redirect straight to Microsoft.
  Signing out now returns to this screen instead of bouncing straight back
  into Microsoft's login page.

## [0.4.2] - 2026-09-05

- Fix the self-update sidecar leaving a run permanently stuck at "running"
  when its captured build output happened to get byte-truncated mid
  UTF-8-character — the update itself could succeed while the DB write-back
  recording that success failed. Output is now sanitized to ASCII before
  being written back, with a status-only retry as a second line of defense.

## [0.4.1] - 2026-09-05

- Fix the self-update sidecar bind-mounting the repo checkout at a path
  (`/repo`) that didn't match its real location on the host (`/opt/patchpilot`)
  — this broke `caddy`/`backup`'s own bind mounts on the next self-update,
  taking the whole site down. The sidecar's checkout now mounts at the same
  path on both sides.

## [0.4.0] - 2026-09-05

- Branding — default PatchPilot365 shield logo and favicon, a locked product
  name (enforced server-side too), drag-and-drop/browse logo upload, and a
  "Match colours to logo" button that derives a theme palette from an
  uploaded logo's pixels.

## [0.2.0] - 2026-09-05

- Settings > Updates — GitHub Releases polling, an in-app update-available
  banner, and a self-update sidecar to run/schedule applying a new release.

## Phase 0 — Scaffold

- Zero-dependency demo mode scaffold.

## Phase 2 + 3 — Read-only surfaces, then remediation execution

- Read-only tenant/device/vulnerability surfaces.
- First real remediation execution paths.

## Phase 4 — Multi-tenant GDAP, licensing, live ingestion

- API-audience and GDAP multi-tenant on-behalf-of (OBO) auth, consent URLs.
- Scripted Entra onboarding and admin-consent flows.
- Live tenant ingestion from real customer environments.
- Licensing detection derived from `/organization` `assignedPlans`.
- Background auto-sync and an All-Tenants multi-tenant view.
- Per-device CVE drill-down, consolidated recommendations, sync hardening.

## Phase 5 — Remediation catalog, RBAC, reporting, hardening

Merged to `main` — see [README.md](README.md)'s Roadmap section.

- Remediation catalog, alternate sources (winget, Chocolatey, Microsoft
  Store), and recurring schedule dispatch.
- Live Response, Win32/Intune app deployment, Missing KBs remediation, and
  Windows Update rings/quality/feature-update campaigns.
- Users & Roles — in-app user management and RBAC.
- Remediation History — an attributed ledger of every closed finding.
- Reports v2 — branded PDF reports, AI narration, CSV metric exports.
- Self-hosted AI layer — chat assistant, page summaries, report generation.
- Redis-backed sessions and MSAL background-access lifecycle fixes.
- Setup Health consolidation and an Architecture topology page.
- Dashboard overhaul: charts, posture trends, CVE trend, SLA compliance
  heatmap, exclusion/exception banners.
- Device exclusion and Defender-parity enforcement.
- Script Catalog: types, upload, bulk actions, export.
- Fix for Live Response KB jobs always reporting failure.

### Pre-ship gap review (this pass)

Following an internal scope audit (see the project's gap-analysis notes),
the following were added to close gaps found before a wider production
rollout:

- GitHub Actions CI running typecheck/test/build on every PR.
- Real ESLint configuration replacing the placeholder `lint` script.
- Outbound throttling/backoff for Microsoft Graph/Defender calls.
- Automated Postgres backup script and documented restore procedure.
- Query-level tenant filtering for the AI assistant (previously filtered
  post-fetch).
- `apps/web` Playwright end-to-end coverage for schedule create/edit and
  Fix Now/Fix All dispatch.
- Automated migration execution as part of the deploy path.
- Structured (`pino`) logging in `apps/worker`, replacing raw `console.log`.
- `GET /api/health` now checks Postgres/Redis reachability instead of being
  a liveness-only stub.
- CSRF protection for mutating routes.
- `session.regenerate()` on login to close a session-fixation gap.
- Consistent "(preview)" labeling for remediation channels that don't
  dispatch for real yet (Microsoft Store, Script Catalog, Intune
  remediation scripts), across every channel that lists them.
- `CONTRIBUTING.md`, `LICENSE`, and this changelog.
- An in-app Help page (`/help`), replacing a bare access-denied placeholder
  as the only in-app reference surface.
- Integration test suite (`pnpm --filter @patchpilot/api test:integration`)
  exercising real Postgres/Redis against an isolated `patchpilot_test`
  database and Redis logical DB 15 — never the databases real tenant data
  lives in.

## Phase 5 — Onboarding pairing, vendor entitlement/licensing, custom domains

Merged to `main` alongside the rest of Phase 5.

- Fix for license tenant-count using the wrong consent signal.
- Vendor entitlement/licensing system — a signed entitlement token verified
  against a published public key, gating write scopes and Live Response
  quota by plan.
- Onboarding-pairing flow for provisioning a customer's app registration
  without a manual Entra walkthrough.
- Dynamic OAuth redirect origin resolution (`webOrigins`, replacing a single
  hardcoded `AUTH_REDIRECT_URI`) plus semi-automated custom-domain
  management on the App Registration page — add a `<label>.patchpilot365.com`
  subdomain or a fully custom hostname, verify it via a read-only CNAME
  check, and push the resulting redirect URI(s) into the real Entra app
  registration with one click.
- Templated Azure VM deployment (Bicep + cloud-init, no SSH).
- Added PatchPilot365 branding from all user-facing support,
  (`support@patchpilot365.com`).
