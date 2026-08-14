<!-- Generated copy of docs/guides/AZURE-OPERATIONS.md — do not edit. Relative links have been rewritten to absolute repository URLs. -->

# Azure operations: identity-first infrastructure and the pipeline that runs it

The Foundry guide covers provisioning AI agents. This guide covers the rest of what
running .NET services on Azure taught the estate: passwordless SQL end to end, why the
live environment can be stale while the repo is correct, the CI hardening steps that
turn cloud failures into readable errors, and the Container Apps idioms. The unifying
rule: **auth is managed identity + RBAC everywhere; a key or password anywhere in the
chain is a finding.**

It is deliberately repo-agnostic. The worked example is `AureliusPromptus/infra/`, the
Azure jobs in its Fly workflow, and `docs/azd/AI_PERMISSION_MATRIX.md`.

**Contents**

1. [Provision vs deploy](#1-provision-vs-deploy)
2. [Passwordless SQL end to end](#2-passwordless-sql-end-to-end)
3. [The permission matrix document](#3-the-permission-matrix-document)
4. [CI hardening](#4-ci-hardening)
5. [Storage without keys](#5-storage-without-keys)
6. [Model deployments and capacity](#6-model-deployments-and-capacity)
7. [Container Apps manifest idioms](#7-container-apps-manifest-idioms)
8. [Container Apps jobs and escape hatches](#8-container-apps-jobs-and-escape-hatches)
9. [Failure modes](#9-failure-modes)
10. [Checklist](#10-checklist)

---

## 1. Provision vs deploy

**The repo can be correct and the live environment still stale.** Four causes, all
recurring:

1. The environment was provisioned before the RBAC existed in IaC — and **role
   assignments are infrastructure: `deploy` never applies them, only `provision`
   does**. A permissions fix in Bicep that ships via `azd deploy` fixed nothing.
2. RBAC propagation lags: assignments take minutes to become effective on the data
   plane. Before the first data-plane operation after provisioning, **poll the data
   plane itself** (e.g. a `blob list --auth-mode login` loop, ~18 × 10 s) instead of
   trusting the ARM success.
3. Portal-created resources drift from IaC and get "fixed" by more portal.
4. A permissions-only failure needs a re-grant and a restart — not a redeploy.
   Knowing which lever to pull is the difference between a 5-minute and a 2-hour
   incident; the deployment checklist carries a "why this step matters" column for
   exactly this reason.

## 2. Passwordless SQL end to end

The target: no SQL password exists anywhere in the system.

- **Server**: Entra-only authentication (`azureADOnlyAuthentication: true`), and the
  administrator is a **user-assigned managed identity created in the same template** —
  not a human, not a group maintained by hand. Per-environment SKU switching (free/dev
  tier vs. serverless prod with backup redundancy) lives in the same module.
- **The half Bicep cannot express**: a contained database user for each service
  identity. RBAC roles do not create database principals. The standard workaround is a
  `deploymentScripts` resource running *as the SQL admin identity*, executing
  `CREATE USER [<identity-name>] WITH SID = <clientId-as-varbinary>, TYPE = E` plus
  the role grant — wrapped in a retry loop (≈5 × 30 s), because it races both RBAC
  propagation (§1) and serverless database wake-up.
- **The identity authenticates as the identity's resource name, not the service
  name.** The database user is created for the *identity resource*; one identity
  shared by two services means one shared database principal — which is the argument
  for one identity per service (Foundry guide §7) restated at the database.
- **Connection-string surgery at startup**: an orchestrator may inject an
  `Authentication=` parameter (sometimes quoted); strip it before appending
  `Authentication=Active Directory Managed Identity; User Id=<clientId>`. Do the
  mangling in one shared place (the kernel's database extension, P2/P4), not per
  service.
- **Private networking**: with a VNet, `deploymentScripts` needs its own subnet
  (delegated to container instances) plus a staging storage account with a
  file-privileged role — an obscure requirement that is cheaper to read here than to
  rediscover. Model the whole network as one module behind a single
  `usePrivateNetworking` boolean threaded through consumers, and derive
  `environmentType` from the environment-name convention (`endsWith '-prd'`) rather
  than a second parameter that can disagree with the first.

## 3. The permission matrix document

One committed table answering "who can do what, and does IaC already say so":
**flow/feature × calling service × the actual SDK call × resource touched × identity ×
required role × "added by infra? yes/no/conditional" × why.**

The *added-by-infra* column is what turns a reference into an operational tool: every
"no" is either a pending Bicep change or a documented manual step, and the table is
the audit that finds it before the incident does. Pair it with an
**error-string → missing-permission table** (`assistants/write` denied → OpenAI
Contributor missing on the account; thread creation forbidden → AI Developer missing
on the project; blob upload 403 → Storage Blob Data Contributor; DB login failed for a
deployed app → the §2 contained user was never created). Cloud authorization errors
rarely name the missing role; this table is the decoder ring.

## 4. CI hardening

- **Credential preflight, before login**: parse the credentials secret, assert every
  field non-empty, assert the embedded subscription id equals the separately-stored
  subscription secret, `::add-mask::` the secret value, and print only field
  *lengths*. **After** login, assert `az account show` returns the expected tenant
  and subscription. This converts "deployed to the wrong subscription with a stale
  secret" — a class of failure that otherwise surfaces as inexplicable missing
  resources — into a fast, readable error.
- **Soft-delete awareness**: services with soft-delete semantics (Cognitive/OpenAI
  accounts, Key Vault) fail re-provisioning after a destroy with a name collision.
  Detect the soft-deleted resource first and pass a restore flag (preserving the
  original custom subdomain) into the template, so destroy → re-provision is a
  supported path rather than a support ticket.
- Two GitHub-expression traps worth writing down once: job outputs must not contain
  `-` (expressions read it as subtraction), and the `env` context is unavailable in
  job-level `if`.

## 5. Storage without keys

- `allowSharedKeyAccess: false` on every account — connection strings stop existing
  as a concept.
- Time-boxed download links use **user-delegation SAS** (delegation key from the
  service's own credential + SAS builder), which works under managed identity and
  inherits its lifecycle.
- **Control plane ≠ data plane**: subscription Owner grants no blob access; CI and
  developers alike need explicit data-plane roles (Storage Blob Data Contributor).
  When granting the same role to possibly-identical principals (CI SP and a developer
  parameter that may be the same object), guard the second assignment with an
  inequality check — otherwise `guid()`-named role assignments collide.
- Minimum TLS pinned on storage and SQL alike.

## 6. Model deployments and capacity

- **Azure OpenAI processes one model-deployment operation at a time** per account:
  chain deployments with `dependsOn`, or parallel provisioning fails with a conflict
  that reads like a quota error.
- TPM/RPM quota is per account and region: several services sharing one account share
  one budget — plan the split, and expect the quota to bite before anything else does
  in PR environments (Foundry guide §10).
- Route models by task tier — reasoning model for synthesis, general model for
  instruction-following, mini model for cheap/fast paths — with the mapping
  overridable at provision time, so a capacity problem is a parameter change, not a
  code change.

## 7. Container Apps manifest idioms

With azd/Aspire, per-service Go-templated manifests are the production topology
(P1's publish branch). Four idioms carry:

- **Scale-to-zero by environment**:
  `minReplicas: {{ if eq .Env.ENVIRONMENT_TYPE "prd" }}1{{ else }}0{{ end }}` — the
  P7 cost posture expressed in the manifest.
- **Optional secrets render conditionally**: wrap the secret block in
  `{{ if ne .Env.X "" }}` so an unset optional secret produces *no* block instead of
  an empty one (empty secret values fail deployment; P8 degradation depends on this).
- **IP allowlists fail closed**: N optional allow-rules, and when *all* are empty an
  explicit `deny-all` rule — never silently public.
- **IP-restrict frontends only, never backend APIs.** Intra-environment
  service-to-service traffic traverses the same ingress as external traffic, so an IP
  allowlist on a backend 403s your own BFF's server-side proxy calls. The JWT is the
  backend's boundary; the allowlist belongs on the frontends. (Recorded as a comment
  in the manifest itself — the right place, since that is where the next person will
  try it.)
- Conditional custom domains: bind only when the environment is prod *and* the domain
  is set; SNI binding only when a certificate id exists — because the managed
  certificate arrives only after DNS verification, the domain secret is deliberately
  optional at first ([sequencing], not an error).
- A one-shot job is the service manifest's twin with the job trigger and the same
  image — the ACA counterpart of the Fly ephemeral machine (P12).

## 8. Container Apps jobs and escape hatches

- **Update = delete + recreate.** `az containerapp job update` silently ignores
  several flags (secrets, env vars, trigger type, registry, identity). For a
  manual-trigger job there is no state to preserve — recreate instead of debugging a
  half-applied update.
- **Build the env-var array before the CLI call** and expand it in place; appending
  values after the flag is already in an args array breaks the association.
- **Resource-group resolution as a fallback chain**: explicit variable → parse the RG
  from a resource's ARM id → look up by the environment tag (`azd-env-name`). Tag-based
  lookup also powers fleet operations — a cost-profile workflow that finds every app
  in an environment by tag and applies one of three named profiles (scale-up /
  scale-up-extensive with its ~2× cost stated / scale-down that also resets resources
  so the next start is cheap).
- **Targeted re-runs as first-class workflows**: reprovision-one-thing escape hatches
  (a `force` flag, a slug filter, an optional service redeploy) using
  `azd env new || true` + `azd env refresh` to rehydrate deployment outputs *without*
  re-running provision. The full pipeline is for correctness; the escape hatch is for
  the Tuesday afternoon when one agent definition needs a bump.
- Destroy workflows: typed confirmation (Fly guide §12), plus **independent booleans
  per environment** so one workflow serves dev and prod, each gated by its own
  protected GitHub Environment; `--purge` on teardown or soft-delete (§4) haunts the
  next provision.

## 9. Failure modes

| Symptom | Cause |
|---|---|
| Permissions fix merged, live env still 403s | Fix shipped via deploy; role assignments only apply on provision |
| First blob/agent call fails right after provisioning | RBAC propagation lag; poll the data plane before first use |
| App deployed, DB login fails as `<identity-name>` | Contained DB user never created — the deploymentScripts half is missing |
| Two services, one DB principal | Shared managed identity; one identity per service |
| `deploymentScripts` fails inside a VNet | No delegated subnet + staging storage for script execution |
| Wrong-subscription deploy with no clear error | No credential preflight; assert `az account show` post-login |
| Re-provision after destroy fails on name collision | Soft-deleted account not detected/restored |
| Parallel model deployments conflict | One deployment operation at a time; chain `dependsOn` |
| Empty-secret deployment failure | Optional secret rendered as an empty block instead of conditionally omitted |
| BFF proxy 403s in one environment only | IP allowlist applied to a backend API; move it to the frontend |
| Job "updated" but behaves old | `job update` silently dropped the flags; delete + recreate |
| One-line agent change requires a full pipeline run | No targeted-re-run escape hatch with `azd env refresh` |

## 10. Checklist

- [ ] All auth is managed identity + RBAC; no keys, no SQL passwords, `allowSharedKeyAccess: false`
- [ ] Entra-only SQL with a UAMI admin; contained users via deploymentScripts with retry; connection-string surgery centralized in the kernel
- [ ] One identity per service (database principals included)
- [ ] Permission matrix committed with the added-by-infra column; error-string decoder table alongside
- [ ] CI: credential preflight + post-login account assertion; soft-delete detect/restore; RBAC data-plane polling before first use
- [ ] Model deployments chained; capacity split planned; model tiers parameterized
- [ ] Manifests: env-conditional minReplicas, conditional secret blocks, fail-closed allowlists on frontends only, conditional domains/SNI
- [ ] Jobs recreated not updated; targeted re-run workflows exist; destroy typed-confirmed, per-env gated, purging
- [ ] Provision-vs-deploy distinction written into the deployment checklist ("why this step matters" column)

---

Worked example: `AureliusPromptus/infra/` (`sql/`, `*-roles-sql/`, `network/`,
`browser-extension-storage/`), the Azure jobs in
`AureliusPromptus/.github/workflows/flyio.yml` (preflight, soft-delete restore, RBAC
polling), `AureliusPromptus.AppHost/infra/*.tmpl.yaml` (manifest idioms),
`AureliusPromptus/scripts/` (job recreate, RG resolution ladder), and
`AureliusPromptus/docs/azd/AI_PERMISSION_MATRIX.md`.
