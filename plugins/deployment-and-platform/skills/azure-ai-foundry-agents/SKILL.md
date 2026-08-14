---
name: azure-ai-foundry-agents
description: >-
  Use when provisioning persistent tool-using AI agents on Azure AI Foundry.
  The Hub/Project/Connection Bicep pattern, per-service managed identity and
  RBAC including the two-role gotcha where Azure AI Developer alone is not
  enough, agent-as-code provisioned by a run-and-exit job, azd versus az
  deployment in CI, GitHub Actions to Azure authentication, and which
  PR-environment resources are cheap. Getting this wrong looks like a healthy
  deploy until the first agent-creation call.
---

# Provisioning AI agents on Azure AI Foundry

**Read [`references/AZURE-AI-FOUNDRY-AGENTS.md`](references/AZURE-AI-FOUNDRY-AGENTS.md) before applying any of this.**
That file is the standard; everything below it is a summary to help you decide
whether this skill applies and to check your work afterwards.

## What this standard covers

- The model in one paragraph
- What "agent" means here
- Repository layout
- Bicep: Hub, Project, Connection
- RBAC: who needs what, and the gotchas
- Agent-as-code: definitions and the provisioner
- Managed identity per service
- Provisioning the infrastructure
- GitHub Actions → Azure authentication
- Ephemeral / PR environments: what's cheap and what isn't

## Failure modes

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

## Checklist

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

Generated from [`docs/guides/AZURE-AI-FOUNDRY-AGENTS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/AZURE-AI-FOUNDRY-AGENTS.md) by `scripts/build-marketplace.mjs`. Do not edit this file: change the source document, or its entry in `catalog/marketplace.catalog.json`, and re-run the generator.
