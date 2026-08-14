<!-- Generated copy of docs/guides/AZURE-AI-FOUNDRY-AGENTS.md — do not edit. Relative links have been rewritten to absolute repository URLs. -->

# Provisioning AI agents on Azure AI Foundry

Some services in the estate need a persistent, tool-using, conversational "agent" — not
just a stateless chat completion. Azure AI Foundry is the estate's pattern for that.
This guide is repo-agnostic infrastructure guidance, the Azure-side counterpart to
[`FLY-IO-DEPLOYMENT.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/FLY-IO-DEPLOYMENT.md): compute can run anywhere — Fly.io per
that guide, or Azure Container Apps — while the AI Foundry resources described here back
it. AureliusPromptus runs exactly this hybrid: `AgenticService` deploys to Fly.io, and
its agents are provisioned in an Azure resource group that Fly never touches.

It is deliberately repo-agnostic. The worked example is `AureliusPromptus/infra/` and
`AureliusPromptus/AureliusPromptus.AgenticService/`; the rules below are what that
implementation teaches, with AureliusPromptus-specific names replaced by placeholders.

**Contents**

1. [The model in one paragraph](#1-the-model-in-one-paragraph)
2. [What "agent" means here](#2-what-agent-means-here)
3. [Repository layout](#3-repository-layout)
4. [Bicep: Hub, Project, Connection](#4-bicep-hub-project-connection)
5. [RBAC: who needs what, and the gotchas](#5-rbac-who-needs-what-and-the-gotchas)
6. [Agent-as-code: definitions and the provisioner](#6-agent-as-code-definitions-and-the-provisioner)
7. [Managed identity per service](#7-managed-identity-per-service)
8. [Provisioning the infrastructure](#8-provisioning-the-infrastructure)
9. [GitHub Actions → Azure authentication](#9-github-actions--azure-authentication)
10. [Ephemeral / PR environments: what's cheap and what isn't](#10-ephemeral--pr-environments-whats-cheap-and-what-isnt)
11. [Failure modes](#11-failure-modes)
12. [Checklist](#12-checklist)

---

## 1. The model in one paragraph

Azure AI Foundry organises AI resources as a **Hub** (top-level workspace: connections,
shared config) containing one or more **Projects** (scoped workspaces where agents
actually run). The Hub holds a **Connection** to an Azure OpenAI account — via managed
identity, no API key. A consuming service authenticates as itself (its own managed
identity) against the Project and creates **agents**: persistent, named, model-backed
entities with instructions and tools, addressed by an Assistants-API-style client. Each
agent then opens **threads** — one per conversation — and runs messages against them.

The critical split: **Hub, Project and Connection are Bicep/ARM resources, provisioned
once per environment. An agent is not.** It is created by application code at runtime
through the Foundry SDK, the same way a database row is created by application code —
Infrastructure-as-Code provisions the *place agents live*, not the agents themselves.
Conflating the two is the most common design mistake here: do not try to declare an
agent as a Bicep resource.

## 2. What "agent" means here

An agent is an Assistants-API object (id `asst_...`) with a name, a model, a system
prompt ("instructions"), optional tools (code interpreter, function calling), and a
temperature. It is **long-lived** — created once and reused for every conversation until
its definition changes, at which point it is *replaced*: a new agent is created and the
old one deleted, rather than mutated in place (§6). A **thread** is per-conversation:
created when a conversation starts, holds the message history, and is deleted when the
conversation is deleted. Never expose the thread id to clients; keep it behind your own
conversation identifier so the Foundry-specific ID never leaks into a URL or a client
contract.

This shape — one long-lived agent, many short-lived threads — is what decouples agent
identity from the deploy cycle: redeploying the service does not recreate its agents,
because provisioning is driven by the `version` field in each definition, not by the fact
that a deploy happened. What it does *not* buy you is version overlap — replacement is a
hard cut, and §6 explains the trade-off that was accepted to get there.

## 3. Repository layout

```
<repo>/
├─ infra/
│  ├─ main.bicep                          subscription-scope entrypoint
│  ├─ main.parameters.json
│  ├─ resources.bicep                     shared platform: ACR, Log Analytics,
│  │                                        App Insights, Container Apps environment
│  ├─ azure-ai-foundry/
│  │  └─ azure-ai-foundry.module.bicep    Hub + Project + Connection + RBAC
│  ├─ openai/
│  │  └─ openai.module.bicep              Azure OpenAI account + model deployments
│  ├─ <service>-identity/
│  │  └─ <service>-identity.module.bicep  one user-assigned managed identity
│  └─ <service>-roles-<resource>/         RBAC scoped to what that service touches
│     └─ <service>-roles-<resource>.module.bicep
├─ azure.yaml                             azd config — local/greenfield only (§8)
├─ <Service>/
│  ├─ agents/
│  │  └─ <slug>/definition.json           one agent definition per directory
│  ├─ <AgentProvisioner-equivalent>       the provisioning logic; runs as a job (§6)
│  └─ <AgentProvisioningOptions>          RunAsJob, SlugFilter, ModelOverride,
│                                           ForceReprovision, EnvironmentOverride
└─ docs/
   ├─ AZURE_AI_FOUNDRY_SETUP.md           setup narrative, zero-to-running
   ├─ GITHUB_ENVIRONMENTS_SETUP.md        which secrets/variables, per environment
   └─ PR_DEPLOYMENT_RESOURCE_CLASSIFICATION.md   cheap vs. expensive, per resource
```

Agent definitions live next to the service that owns them, under version control, not
in a portal. Infra Bicep is one small module per concern — identity, roles, the Foundry
Hub/Project — so a diff to "what can `agenticservice` reach" is a diff to one small file,
not a scroll through a monolithic template.

## 4. Bicep: Hub, Project, Connection

```bicep
resource aiHub 'Microsoft.MachineLearningServices/workspaces@2024-07-01-preview' = {
  name: take('hub-${uniqueString(resourceGroup().id)}', 33)
  location: location
  kind: 'Hub'
  identity: { type: 'SystemAssigned' }
  properties: {
    friendlyName: '<System> AI Hub'
    publicNetworkAccess: 'Enabled'
  }
}

resource openAiConnection 'Microsoft.MachineLearningServices/workspaces/connections@2024-07-01-preview' = {
  parent: aiHub
  name: 'azure-openai'
  properties: {
    category: 'AzureOpenAI'
    target: openAiEndpoint          // existing Azure OpenAI resource, referenced not duplicated
    authType: 'AAD'                 // managed identity — no API key stored anywhere
    isSharedToAll: true
    metadata: { ApiType: 'Azure', ResourceId: openAiResourceId }
  }
  dependsOn: [hubOpenAiRoleAssignment]   // the Hub needs a role on OpenAI before it can connect as itself
}

resource aiProject 'Microsoft.MachineLearningServices/workspaces@2024-07-01-preview' = {
  name: take('project-${uniqueString(resourceGroup().id)}', 33)
  location: location
  kind: 'Project'
  identity: { type: 'SystemAssigned' }
  properties: {
    friendlyName: '<System> Project'
    hubResourceId: aiHub.id
    publicNetworkAccess: 'Enabled'
  }
  dependsOn: [openAiConnection]
}
```

**The OpenAI account is referenced, not created here.** Use an `existing` resource and
grant roles to it from this module — one Azure OpenAI account can back several Hubs, and
Bicep should not duplicate a resource it can reference.

**The agents endpoint is derived, not exposed directly.** The Project's
`properties.discoveryUrl` is a shared regional endpoint
(`https://<region>.api.azureml.ms/discovery`); strip `/discovery` and rebuild it as:

```
{discoveryBase}/agents/v1.0/subscriptions/{subscriptionId}/resourceGroups/{resourceGroup}/providers/Microsoft.MachineLearningServices/workspaces/{projectName}
```

Output that constructed URI, not the raw `discoveryUrl` — it is what the Foundry SDK's
`PersistentAgentsClient` (Azure.AI.Agents.Persistent 1.x+) expects, and it appends
`/assistants`, `/threads`, etc. itself.

**Naming**: `uniqueString(resourceGroup().id)` gives every globally-unique-constrained
resource (Hub, Project, ACR, storage) a short deterministic suffix, so the same template
produces different but stable names per resource group — which is what makes the whole
template safe to re-run per environment without a manual naming scheme.

## 5. RBAC: who needs what, and the gotchas

Three identities need roles on the OpenAI account, and one needs a role on the Project.
Getting this wrong produces a service that looks correctly deployed and fails only on
the first agent-creation call.

| Identity | Scope | Role | Why |
|---|---|---|---|
| Hub (SystemAssigned) | OpenAI account | Cognitive Services OpenAI Contributor (`a001fd3d-188f-4b5d-821b-7da978bf7442`) | Assistants operations proxied through the hub connection need `assistants/write`, which **OpenAI User alone does not grant** |
| Hub (SystemAssigned) | OpenAI account | Cognitive Services OpenAI User (`5e0bd9bd-7b93-4f28-af87-19fc36ad61bd`) | Required for the `authType: AAD` connection — the Hub authenticates as itself when proxying |
| Project (SystemAssigned) | OpenAI account | Both roles above | Agent operations routed through the project surface the **project's** identity in authorization checks, not only the Hub's — grant both roles to both identities |
| Consuming service's managed identity | OpenAI account | Cognitive Services OpenAI Contributor | Needed for Assistants-API data-plane writes (create/delete agent, thread, run) — **Azure AI Developer alone is insufficient** for this |
| Consuming service's managed identity | AI Foundry Project | Azure AI Developer (`64702f94-c441-49e6-a78b-ef80e0188fee`) | Allows creating/running/deleting agents and threads at the project level |

**The two-part role requirement on the consuming service is the gotcha that costs the
most time.** "Azure AI Developer" reads as sufficient — it is the role literally named
for this — but Assistants-API data-plane calls (as opposed to project-management calls)
route through the OpenAI resource behind the project and need OpenAI Contributor there
too. Grant both, on both the Hub/Project identities *and* the consuming service's
identity, or the failure surfaces only when a real agent-creation call runs, with an
authorization error that does not name which of the two roles is missing.

Assign roles with a stable, idempotent name so re-running the template does not error on
"role assignment already exists":

```bicep
resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(targetResourceId, principalId, roleDefinitionId)   // deterministic, not a new guid() per run
  scope: targetResource
  properties: {
    principalId: principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleDefinitionId)
  }
}
```

## 6. Agent-as-code: definitions and the provisioner

Each agent is one directory with one file:

```json
// agents/<slug>/definition.json
{
  "slug": "grammar-editor",
  "displayName": "Grammar Editor",
  "version": "1.2.0",
  "model": "gpt-4.1-mini",
  "instructions": "You are a professional editor specialising in grammar and spelling correction. …",
  "tools": [],
  "temperature": null,
  "metadata": { "purpose": "grammar-correction", "tier": "standard" }
}
```

### Run provisioning as a job, not at application startup

The provisioner ships **inside the service's own image**, but runs as a **dedicated
run-and-exit job**, not as an `IHostedService` on the API's startup path. A boolean
config flag (`AgentProvisioning__RunAsJob=true`) is enough: when it is set, the host
builds, initialises its database, provisions, writes a completion line to stdout and
returns before the middleware pipeline is ever configured.

CI then runs that job as an **ephemeral machine in a separate app** — same image, same
secrets, no HTTP service and no health checks, so the platform treats it as a one-off
background workload rather than a web service that immediately looks dead. On Fly.io
this is the ephemeral-machine pattern from
[`FLY-IO-DEPLOYMENT.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/FLY-IO-DEPLOYMENT.md); on Container Apps it is a Job.

Why not the startup hosted service:

- **A failed provision must fail the deploy.** Inside `StartAsync` the honest options are
  to swallow the exception (the service starts with stale agents and a log line nobody
  reads) or to throw (a provisioning problem now looks like an outage). A job has an exit
  code, and CI can gate on it.
- **Provisioning is not per-replica.** Scale the API to three machines and a startup
  bootstrapper runs three times, racing itself over the same tracking table.
- **It needs operator arguments.** Re-provisioning one agent, overriding a model, or
  forcing a rebuild are things you want to run *without* redeploying the API.

Keep the hosted service, if at all, as an explicitly-enabled **development-only
fallback** so a laptop run can still get agents into a dev project.

### What the job does

1. Read every `agents/**/definition.json` shipped in the image. Ship them via
   `CopyToOutputDirectory` (or equivalent) so the job needs nothing but the image; fail
   loudly if the directory or the files are missing, rather than reporting success over
   an empty set.
2. Resolve the **logical agent environment** (`dev`, `prd`, …) — deliberately separate
   from `ASPNETCORE_ENVIRONMENT`, which stays `Production` for runtime behaviour even in
   a dev deployment.
3. For each definition, compare `version` against the active row for that
   **`slug` + `environment`** in a small tracking table:

   | Column | Purpose |
   |---|---|
   | `Slug`, `DisplayName`, `Version` | straight from `definition.json` |
   | `FoundryId` | the `asst_...` id returned by the SDK |
   | `Model` | resolved model, after any override |
   | `Environment` | logical environment this row belongs to |
   | `IsActive` | exactly one active row per `slug`+`environment` |
   | `DeployedAt` | when it was provisioned |
   | `DefinitionJson` | the definition as provisioned, for audit |

4. If the version matches and no force flag is set, **skip** — this is what makes the job
   safe to run on every deploy.
5. Otherwise **create a new agent** (named `<slug>-<environment>`, so one Foundry project
   can hold several environments without collision), then **delete the old agent and mark
   its row inactive**. Agents are replaced, never mutated in place.
6. Finish with an **orphan-cleanup pass**: every inactive row whose Foundry agent still
   exists gets deleted, treating a 404 as success. Log the ids it could not remove so
   they can be deleted by hand.
7. Verify at least one active agent exists for the environment before reporting success.
   A job that provisioned nothing must not exit 0.

**On deleting old agents.** The tempting rule is to deactivate the row and leave the
agent alive, so conversations already bound to the old id keep working. Do not: without a
deletion step, every version bump strands another agent in the project, and they
accumulate invisibly until someone opens the portal. The cost of deleting is real —
replacement is a hard cut, and an in-flight conversation pinned to the old id will start
failing — so pair it with a client that resolves the active agent per request rather than
caching an `asst_...` id across turns. If you genuinely need version overlap, buy it
deliberately with a grace period (delete on the *next* run rather than this one), not by
never deleting at all.

This turns "provision an agent" into an idempotent, versioned, gated operation instead of
a manual portal action or a one-off script — the same discipline P4 applies to database
schema (migrate, never `EnsureCreated`), applied to agent identity.

## 7. Managed identity per service

One user-assigned managed identity per service, trivially uniform:

```bicep
resource serviceIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: take('<service>_identity-${uniqueString(resourceGroup().id)}', 128)
  location: location
}

output id string = serviceIdentity.id
output clientId string = serviceIdentity.properties.clientId
output principalId string = serviceIdentity.properties.principalId
```

Pair it with a `<service>-roles-<resource>` module per resource it touches (SQL, blob
storage, the Foundry project, OpenAI). A service gets exactly the roles it needs on
exactly the resources it needs — never a subscription-wide contributor role, never a
role shared across services. This is what makes "what can `agenticservice` reach" a
question answerable by reading two small files instead of auditing the whole
subscription.

## 8. Provisioning the infrastructure

**`azd` to scaffold; `az deployment` to run it in CI.** These are two different jobs and
conflating them is why `azd` tends to linger in repositories long after nothing calls it.

`azd` earns its place at the start. For an Aspire-based system the AppHost project is the
source of truth and `azd infra synth` materialises it into the `infra/` Bicep tree — the
same composition that runs locally (§P1 of the reference architecture) also generates the
cloud topology. It is also the fastest way to stand up a personal environment:

```yaml
# azure.yaml
name: <system>
metadata:
  template: aspire-starter@1.0.0
services:
  app:
    language: dotnet
    project: ./<System>.AppHost/<System>.AppHost.csproj
    host: containerapp
pipeline:
  provider: github
```

```bash
azd auth login
azd init                  # one-time
azd provision             # Bicep → resources (idempotent — safe to re-run)
azd up                    # provision + deploy
azd down                  # tear down
```

**In CI, deploy the synthesised Bicep directly.** Once `infra/` exists it is ordinary
Bicep, and a pipeline that calls `az` needs no `azd` environment state, no `.azure/`
directory, and no second definition of "which environment am I":

```bash
az deployment sub create \
  --name "<system>-${GITHUB_RUN_ID}" \
  --location "$AZURE_LOCATION" \
  --template-file infra/main.bicep \
  --parameters environmentName="$ENV_NAME" location="$AZURE_LOCATION"

# read outputs back for the next job — endpoints, resource ids, the Foundry connection string
az deployment sub show --name "<system>-${GITHUB_RUN_ID}" --query properties.outputs
```

This is what the worked example does: every active workflow uses `az deployment sub
create` / `sub show`, and `azd` survives only in `azure.yaml` and an archived workflow
directory. If your repository still carries `azd` CI steps, treat them as the thing to
reconcile — either they are the real path or they are dead, and both are fine, but not at
the same time.

**Before the first deployment into a fresh subscription**, register the AI Foundry
resource provider or it fails on the Hub/Project resource types:

```bash
az provider register --namespace Microsoft.MachineLearningServices --wait
```

Read the Foundry connection string from the deployment outputs
(`https://<hub>.services.ai.azure.com/api/projects/<project>;<subscriptionId>;<resourceGroup>;<projectName>`,
or the derived agents endpoint from §4) and forward it into the service's configuration
as a secret — `AzureAIFoundry__ConnectionString` or equivalent — never hard-coded. The
provisioning job of §6 needs the same value, so pass it to both.

## 9. GitHub Actions → Azure authentication

**Two options; pick OIDC for a new repository.**

The concrete implementation (AureliusPromptus) uses **service-principal client-secret**
auth via `azure/login@v2` with `auth-type: SERVICE_PRINCIPAL`:

```yaml
- uses: azure/login@v2
  with:
    creds: ${{ secrets.AZURE_CREDENTIALS }}   # {"clientId":..,"clientSecret":..,"subscriptionId":..,"tenantId":..}
```

This works, but it means a long-lived secret sits in GitHub and must be rotated by hand.
**For a new repository, prefer OIDC federated credentials instead**: register a
federated credential on the App Registration scoped to the GitHub environment
(`repo:<org>/<repo>:environment:dev`), drop the client-secret entirely, and authenticate
with:

```yaml
- uses: azure/login@v2
  with:
    client-id: ${{ secrets.AZURE_CLIENT_ID }}
    tenant-id: ${{ secrets.AZURE_TENANT_ID }}
    subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
    # no client-secret — the OIDC token IS the credential, minted per run, never stored
```

Either way, the secret/variable shape that carries over:

| Name | Kind | Scope | Notes |
|---|---|---|---|
| `AZURE_CLIENT_ID` | Secret | per GitHub Environment | App registration's client id |
| `AZURE_TENANT_ID` | Secret | per GitHub Environment | same tenant for every environment, usually |
| `AZURE_SUBSCRIPTION_ID` | Secret | per GitHub Environment | dev and prd may be different subscriptions |
| `AZURE_CLIENT_SECRET` | Secret | per GitHub Environment | **omit entirely if using OIDC** |
| `AZD_ENV_NAME` | Secret or var | per GitHub Environment | `<system>-dev`, `<system>-prd` |
| `AZD_LOCATION` | Variable | per GitHub Environment | Azure region, e.g. `polandcentral` |

**One GitHub Environment per Azure environment, each with its own App Registration.**
`dev` and `prd` never share a service principal or a subscription's worth of blast
radius, and `prd` gets a required-reviewers protection rule — the same act-of-record
discipline the Fly guide applies to tags (§10 of that guide), applied here to
environment promotion instead. A workable convention: select the environment from the
git tag itself — a tag ending `-dev` deploys to the `dev` environment, a bare semver tag
deploys to `prd` — so the trigger for "which Azure environment" is as explicit as the
trigger for "deploy at all."

## 10. Ephemeral / PR environments: what's cheap and what isn't

Because `uniqueString(resourceGroup().id)` derives every name from the resource group,
and the resource group is `rg-${environmentName}`, giving each PR its own
`environmentName` gives it, for free, an entirely separate Azure footprint. That is
also the trap: **"for free" in naming does not mean "for free" in cost.** Classify
resources before wiring PR environments to the provisioning pipeline, not after the first
bill:

| Cheap / safe to re-provision per PR | Expensive / needs a decision first |
|---|---|
| Container Apps, Container Apps Environment | Azure OpenAI account **and its model deployments** — quota-limited and slow to spin up |
| Managed identities | Azure AI Foundry Hub + Project — full re-provision per PR, not incremental |
| Log Analytics workspace, Application Insights | SQL Server (as opposed to a database on a shared server) |
| Azure Container Registry (Basic SKU) | Anything with a fixed regional quota (OpenAI TPM/RPM limits bite first here) |
| Storage accounts, blob containers | Anything requiring manual approval/verification (custom domains, certificates) |

If nothing in `infra/` explicitly references an *existing* shared OpenAI account, SQL
server, or Foundry Hub, assume every PR re-provisions all of them — that is the default,
not an edge case, and it is expensive at more than a few concurrent PRs. Decide
deliberately: either accept the cost for true per-PR isolation, or thread a shared
resource ID (an existing Azure OpenAI account, in particular) through as a parameter and
have PR environments create only the cheap tier. Write the decision down in
`docs/PR_DEPLOYMENT_RESOURCE_CLASSIFICATION.md` (or equivalent) the same way
`flyio/INFRASTRUCTURE-ANALYSIS.md` is required to for Fly — a cost decision that isn't
written down gets re-litigated every time someone notices the bill.

## 11. Failure modes

| Symptom | Cause |
|---|---|
| Agent creation fails with an authorization error, deploy otherwise looks healthy | Consuming service's identity has "Azure AI Developer" on the Project but not "Cognitive Services OpenAI Contributor" on the OpenAI account — both are required |
| Hub↔OpenAI connection works for chat completions but not for agent operations | Hub identity has "OpenAI User" only; assistants/write needs "OpenAI Contributor" too |
| Infrastructure deployment fails on its first run in a fresh subscription | `Microsoft.MachineLearningServices` resource provider not registered |
| Role assignment fails with "already exists" on re-run | `name` on the `roleAssignments` resource used `guid()` with a random seed instead of a deterministic `guid(scope, principal, role)` |
| In-flight conversations start failing immediately after a version bump | The accepted consequence of replace-and-delete (§6), made worse by a client that cached an `asst_...` id instead of resolving the active agent per request |
| The Foundry project slowly fills with unused agents | Provisioning deactivates tracking rows without deleting the agents behind them, and has no orphan-cleanup pass |
| Provisioning reports success but no agent exists | The job ran against an empty or unreadable `agents/` directory — it must fail on finding no definitions, and verify an active row before exiting 0 |
| Provisioning runs several times per deploy and races itself over the tracking table | Wired as a startup hosted service on a multi-replica API instead of a single run-and-exit job (§6) |
| The provisioning job's logs are empty in CI even though it ran | The process exited before the platform's log forwarder flushed — write the completion line to stdout, flush it, and pause briefly before returning |
| Every PR environment silently re-creates Azure OpenAI + model deployments | No shared-OpenAI parameter threaded through `infra/`; classification not decided up front |
| Foundry SDK calls fail with a malformed endpoint | Used `discoveryUrl` directly instead of stripping `/discovery` and rebuilding the `/agents/v1.0/...` path |
| GitHub Actions can authenticate to `dev` but not `prd` (or vice versa) | Environments share one App Registration/service principal instead of one per environment |

## 12. Checklist

Per environment (subscription/resource-group pair):

- [ ] `Microsoft.MachineLearningServices` provider registered before the first deployment
- [ ] One Hub, one Project per environment; Project's `hubResourceId` set explicitly
- [ ] OpenAI account referenced as `existing`, not duplicated per module
- [ ] Hub and Project identities both hold OpenAI Contributor **and** OpenAI User on the OpenAI account
- [ ] Agents endpoint derived from `discoveryUrl` (strip `/discovery`, rebuild `/agents/v1.0/...`), not the raw discovery URL

Per service that creates or runs agents:

- [ ] Own user-assigned managed identity; no shared/service-principal-wide identity
- [ ] Identity holds OpenAI Contributor on the OpenAI account **and** Azure AI Developer on the Project
- [ ] Agent definitions live in-repo as versioned JSON, one file per agent
- [ ] Agents provisioned by a run-and-exit job whose exit code gates the deploy, not by a startup hosted service on the API's path
- [ ] Provisioning is idempotent by `version` and scoped by `slug` + logical agent environment, the latter separate from `ASPNETCORE_ENVIRONMENT`
- [ ] Replacement deletes the superseded agent, and a cleanup pass removes orphans left by earlier runs
- [ ] The job fails loudly when it finds no definitions or ends with no active agent for the environment
- [ ] Clients resolve the active agent per request instead of caching an `asst_...` id across turns
- [ ] Thread ids never reach the client; only an internal conversation id does

Per repository:

- [ ] GitHub Environment per Azure environment (`dev`, `prd`, …), each its own App Registration
- [ ] OIDC federated credentials, not a long-lived client secret, for any new setup
- [ ] `prd` environment has a required-reviewers protection rule
- [ ] `docs/…RESOURCE_CLASSIFICATION.md` states which resources are re-provisioned per PR/ephemeral environment and which are shared, with the cost reasoning written down
- [ ] Secrets never committed; connection string / endpoint delivered through the platform secret store, same discipline as [`FLY-IO-DEPLOYMENT.md §9`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/FLY-IO-DEPLOYMENT.md#9-configuration-and-secrets)

---

Worked example: `AureliusPromptus/infra/azure-ai-foundry/`,
`AureliusPromptus/infra/*-identity/`, and `AureliusPromptus.AgenticService/agents/` +
its `AgentProvisioner`, run as the `provision-agents` job in `.github/workflows/flyio.yml`.
