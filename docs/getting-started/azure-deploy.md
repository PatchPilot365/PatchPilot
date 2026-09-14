---
title: Azure Deployment
parent: Getting Started
nav_order: 1
permalink: /getting-started/azure-deploy/
---

# Azure Deployment

The primary, supported way to run PatchPilot365: a Bicep template plus a
cloud-init file stand up a complete instance on a single Ubuntu VM —
network, firewall, a static public IP, and the VM itself, which provisions
itself (installs Docker, clones the repo, writes `.env`, runs
`docker compose up`) on first boot. No SSH is required for setup or normal
day-to-day operation; ongoing commands go through `az vm run-command invoke`
instead.

{: .warning }
> **This deploys billable Azure resources into your own subscription.**
> Beyond the Azure subscription itself, the template creates a virtual
> machine (`Standard_B2as_v2`, 2 vCPU / 8GB RAM, Ubuntu Server 22.04 LTS),
> a 64GB Standard SSD managed disk, and a Standard **static public IP** —
> all billed to your tenant for as long as the deployment exists. The
> virtual network, network security group, and network interface are free
> constructs, and no storage account or managed database is created.

Run the commands below from [Azure Cloud Shell](https://portal.azure.com)
(the `>_` icon in the top bar) — it already has `az`, `git`, and `openssl`
installed.

## Deploy

[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2FPatchPilot365%2FPatchPilot%2Fmain%2Finfra%2Fazure%2Fazuredeploy.json)

Click the button, sign in, and hit deploy — every field already has a
sensible default (region Australia East, a unique DNS label generated for
you, no custom domain, SSH off, VM size `Standard_B2as_v2`). All of these are
plain editable fields in the form; change the region, size, or anything else
before clicking Create.

Cloud-init builds the Docker images from source, which takes about 10
minutes — the deployment status stays "Running" for that whole window, and
the URL briefly serves a "PatchPilot is deploying…" placeholder before the
real stack takes over. Once it finishes, open the printed URL and expect the
[Pairing screen]({{ "/getting-started/pairing/" | relative_url }}) over
valid HTTPS.

If the deployment reports **Failed**, it doesn't necessarily mean anything
is actually broken — it means nothing answered the app's health check within
about 25 minutes. Check the real state with the verify commands below before
assuming something needs fixing; a slow first image pull or a transient
certificate hiccup can trip that timeout even though the stack comes up fine
moments later.

### Manual deploy via the Azure CLI

Use this instead of the button if you're deploying your own fork, want SSH
enabled at deploy time, or are scripting this as part of your own CI/CD:

```bash
az group create -n patchpilot-rg -l australiaeast

ssh-keygen -t ed25519 -f ~/patchpilot_key -N ""

az deployment group create \
  -g patchpilot-rg \
  --template-file infra/azure/main.bicep \
  --parameters dnsLabel=patchpilot-mk \
               adminUsername=ppadmin \
               sshPublicKey="$(cat ~/patchpilot_key.pub)" \
               enableSsh=true \
               allowedSshSourceIp="$(curl -s ifconfig.me)/32"
```

- `dnsLabel` must be globally unique in the region — it becomes
  `<dnsLabel>.<region>.cloudapp.azure.com`, a free hostname Azure provides
  automatically. Omit it to use a generated default.
- `customDomain` defaults to blank (the free hostname above); pass a domain
  you already own to use that instead — it can also be set later, see below.
- `enableSsh=true` opens a break-glass SSH rule restricted to
  `allowedSshSourceIp`. Leaving both out means the firewall never opens port
  22 at all — SSH isn't used by the deploy or verify flow itself.

## Verify (no SSH needed)

```bash
az vm run-command invoke -g patchpilot-rg -n patchpilot-vm \
  --command-id RunShellScript \
  --scripts "cd /opt/patchpilot && docker compose -f infra/docker-compose.yml --env-file .env ps"
```

## Switch to a custom domain later

```bash
az vm run-command invoke -g patchpilot-rg -n patchpilot-vm \
  --command-id RunShellScript \
  --scripts "cd /opt/patchpilot && sed -i 's#PP_DOMAIN=.*#PP_DOMAIN=patchpilot.yourdomain.com#; s#PUBLIC_URL=.*#PUBLIC_URL=https://patchpilot.yourdomain.com#; s#AUTH_REDIRECT_URI=.*#AUTH_REDIRECT_URI=https://patchpilot.yourdomain.com/auth/callback#; s#CORS_ORIGINS=.*#CORS_ORIGINS=https://patchpilot.yourdomain.com#' .env && docker compose -f infra/docker-compose.yml --env-file .env up -d"
```

Point the domain's A record at the deployment's static IP first, and update
the Entra app registration's redirect URI to match. Caddy issues a fresh
Let's Encrypt certificate for the new domain automatically.

## Update to the latest code

```bash
az vm run-command invoke -g patchpilot-rg -n patchpilot-vm \
  --command-id RunShellScript \
  --scripts "cd /opt/patchpilot && git pull && docker compose -f infra/docker-compose.yml --env-file .env up -d --build"
```

Or use the in-app **Settings > Updates** page — see
[Navigating PatchPilot365: Settings]({{ "/navigating-patchpilot/settings/" | relative_url }}).

## Backups

The `backup` container dumps Postgres nightly to the VM's own local disk
only. This does **not** survive losing the VM — arrange your own off-box
copy (for example, a scheduled blob upload) if that matters to you. See
[Server Health & Maintenance]({{ "/server-health-and-maintenance/" | relative_url }})
for more on the backup schedule and retention settings.

## Troubleshooting

If the site becomes unreachable after an update, check container state
before assuming anything code-level is wrong:

```bash
az vm run-command invoke -g patchpilot-rg -n patchpilot-vm \
  --command-id RunShellScript \
  --scripts "cd /opt/patchpilot && docker compose -f infra/docker-compose.yml --env-file .env ps && docker compose -f infra/docker-compose.yml --env-file .env logs caddy --tail 100"
```

A container stuck restarting almost always shows its reason in the last few
log lines. Full technical detail on the Azure template lives in
[`infra/azure/README.md`](https://github.com/PatchPilot365/PatchPilot/blob/main/infra/azure/README.md)
in the repository.

## Next step

Once the deployment finishes, continue to
[Pairing]({{ "/getting-started/pairing/" | relative_url }}) to connect it to
a real Microsoft 365 tenant.
