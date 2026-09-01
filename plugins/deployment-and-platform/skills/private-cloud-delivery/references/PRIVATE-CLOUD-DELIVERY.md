<!-- Generated copy of docs/guides/PRIVATE-CLOUD-DELIVERY.md — do not edit. Relative links have been rewritten to absolute repository URLs. -->

# Private-cloud delivery: selling the SaaS as self-hosted

Some customers cannot use the SaaS: policy forbids external processing, or they need
auditability, their own SSO, or per-seat economics past a size. The answer is a
**private-cloud edition** — the same codebase, deployed into the customer's cloud —
without forking, and without the vendor ever holding production access. This guide
fixes the delivery model; it is a fifth deployment shape alongside the Fly guide's
four.

It is deliberately repo-agnostic. The worked example is
`<saas>/.github/workflows/private-cloud-push.yml`,
`.github/private-cloud-clients/`, `infra/private-cloud/`, and
`docs/PRIVATE_CLOUD_DEPLOYMENT.md`.

**Contents**

1. [The model in one paragraph](#1-the-model-in-one-paragraph)
2. [The responsibility split](#2-the-responsibility-split)
3. [The per-client registry](#3-the-per-client-registry)
4. [The vendor workflow: push and stop](#4-the-vendor-workflow-push-and-stop)
5. [The IaC you hand over](#5-the-iac-you-hand-over)
6. [Upgrades and rollback](#6-upgrades-and-rollback)
7. [The product switch](#7-the-product-switch)
8. [Commercial artifacts](#8-commercial-artifacts)
9. [Failure modes](#9-failure-modes)
10. [Checklist](#10-checklist)

---

## 1. The model in one paragraph

The vendor **builds images and pushes them into the customer's registry — and stops.**
The customer owns provisioning, deployment, secrets, domains, TLS, database and AI
resources, using IaC the vendor hands over. The customer grants the vendor exactly one
permission: push to one registry. This is not a limitation to apologize for; it *is*
the product — the compliance answer ("no external party touches production"), the
security answer (no standing vendor credentials in the customer's cloud), and the
continuity answer (the customer can run, upgrade and even leave without the vendor
online).

## 2. The responsibility split

| | Vendor | Customer |
|---|---|---|
| Build + push images | ✔ | |
| Provision infrastructure | | ✔ |
| Deploy / upgrade / rollback | | ✔ |
| Secrets, domains, TLS | | ✔ |
| Database + backups | | ✔ |
| AI / third-party accounts | | ✔ |

**What is shared with the customer**: the private-cloud IaC directory, the deployment
guide, a parameters template. **What stays vendor-side**: the client registry, the
push workflow, the vendor's own environments. Write both lists down — the "do NOT
share" list is the one that prevents the accidental email with the wrong attachment.

## 3. The per-client registry

Per-client configuration splits by sensitivity, keyed by one name:

- A **committed JSON file** per client at `.github/private-cloud-clients/<name>.json`
  holding only non-sensitive values — client name, registry login server, region,
  environment name. The reasoning is stated in the file's schema: *a registry login
  server is a DNS name, not a secret.*
- A **GitHub Environment of the same name** holding the secrets (the push-scoped
  service principal). Filename = environment name is the whole lookup mechanism.
- A committed `_template.json` with `REPLACE — <description>` placeholders is the
  onboarding artifact: new client = copy, fill, create the environment.
- The workflow validates the file exists and every field is non-null — and its error
  message **is the runbook**: the exact four steps to onboard the missing client, in
  the failure output. Errors that teach beat docs that drift.

## 4. The vendor workflow: push and stop

A manually dispatched workflow taking (client, tag): log into the *client's* registry
with that client's environment secrets, build the service matrix, push `:tag` and
`:latest`, print a handover summary — the exact commands the customer's team runs
next. Explicitly out of scope, stated in the workflow header: no provisioning, no
deploying, no migrations, no secret-setting. The workflow *cannot* touch the
customer's infrastructure because the credential it holds cannot — least privilege
doing the compliance work.

Build-once still applies (P12): the images pushed to a client registry are the same
digests the SaaS built, not a parallel build.

## 5. The IaC you hand over

The handed-over template answers to different constraints than your own infra:

- **One subscription-scope entrypoint** that creates its own resource group and is
  **fully parameterized by `imageTag`** — the customer's whole lifecycle is "re-run
  with a different tag".
- Every secret (connection strings, signing key) is a `@secure()` parameter supplied
  by the *customer's* pipeline. The template ships with zero embedded values.
- A **genuinely generic container-app module**: env/secret arrays in, registry server
  derived from the image reference, identity wired for registry pull, FQDN out. The
  customer's platform team reads one small module per concern, same as your own infra
  (Foundry guide §3).
- The registry is referenced as `existing` — the customer owns it; the template only
  grants pull.
- Deployment mode is stamped as resource **tags** and app env vars, so "what edition
  is this" is answerable from the portal.

Keep the private-cloud tree separate from your own infra tree. They evolve on
different clocks — yours with your platform, the customer's with their compliance
reviews.

## 6. Upgrades and rollback

- **Upgrade** = vendor pushes new tag → customer re-runs the deployment with the new
  `imageTag`; idempotent, rolling.
- **Rollback** = re-run with the previous tag — *with the caveat that must be in the
  handover doc*: rolling back containers does not roll back schema migrations (P4
  migrations are forward-only). A release containing migrations gets coordinated
  before rollback, not after.
- Version support policy (how far behind a customer may run) is a written commercial
  term, not an engineering surprise.

## 7. The product switch

The build the customer runs is the same build, flipped by `TenantMode = Enterprise` —
implemented **only at token issuance**, so every downstream service is untouched
([`PAYMENTS-AND-MONETIZATION.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/PAYMENTS-AND-MONETIZATION.md) §8), plus the frontend
flag that hides pricing. One codebase, no fork, no "enterprise branch" to maintain —
the delivery model works *because* the product switch is one variable.

## 8. Commercial artifacts

Engineering hands sales a small set of reusable documents; keep their skeletons
generic:

- An **IT one-pager for the customer's platform team**: architecture, requirements,
  security posture, update mechanism — and the table product docs always omit:
  **backup mechanism and retention per resource class with numeric RTO/RPO**.
- A **SOW skeleton** whose milestones anchor to an explicitly defined D+0 (contract
  *and* access handover — not signature alone), with testable acceptance criteria and
  an out-of-scope list.
- The **objection table** (source-code access → escrow; vendor continuity → escrow +
  the IaC self-sufficiency this model already provides; data roles → in
  customer-hosted delivery the customer is usually the data controller and the vendor
  a processor at most — counsel needs to know that flip).

## 9. A fifth shape: public registry, one-command run

The four shapes above assume a commercial relationship. There is a fifth with none: images
published to a **public** registry, and a compose file anybody can curl and run. No
per-client registry, no responsibility split, no SOW — the delivery artifact is a URL.

Use it for the open-source edition, the evaluation path, or the demo somebody runs before
they talk to you. Its whole value is that the first step is not a conversation.

Three gotchas, each of which has cost somebody a release:

- **Tag case.** A `V1.2.0` tag and a `v1.2.0` tag are different refs, and a workflow keyed
  on one silently ignores the other. Pick one and make the trigger reject the other rather
  than skipping quietly.
- **A registry package is private by default on first push.** The first release "succeeds"
  and nobody outside can pull it. Verify anonymously from outside the workflow, once, per
  package — not by trusting the green tick.
- **`fail-fast: false` in a publish matrix means partial publication.** Half the images ship
  and the compose file references all of them, so the artifact is broken in a way each
  individual job reports as success. Either fail the matrix, or gate the compose file's
  release on every image landing.

## 10. Failure modes

| Symptom | Cause |
|---|---|
| Vendor workflow fails for one client only | Client JSON missing/null fields, or the same-named GitHub Environment lacks the secrets — the error message should already be saying which |
| Vendor "just fixes it" in the customer's cloud | Scope creep past the push-only credential; the split in §2 is the contract, decline in writing |
| Customer deploy pulls unauthorized | Registry referenced as created-here instead of `existing` + pull grant |
| Upgrade works, rollback corrupts | Release contained migrations; rollback was not coordinated (§6) |
| Customer environment drifts from the template | Customer edited resources in the portal; the re-run-with-tag lifecycle only holds if the template stays authoritative — say so in the handover doc |
| Enterprise features half-enabled | `TenantMode` implemented per-service instead of at token issuance |
| Secrets in the client JSON | Sensitivity split violated; only DNS-shaped values belong in the committed file |

## 11. Checklist

- [ ] Responsibility split written; share/do-not-share lists explicit
- [ ] Per-client committed JSON (non-sensitive only) + same-named GitHub Environment (secrets); `_template.json`; validating workflow whose errors are runbooks
- [ ] Push workflow: client registry login, matrix push `:tag` + `:latest`, handover summary printed; provisioning/deploy/migrations/secrets explicitly out of scope
- [ ] Vendor credential is push-only to one registry
- [ ] Handed-over IaC: subscription-scope, `imageTag`-parameterized, `@secure()` params, generic app module, registry as `existing`, edition stamped in tags
- [ ] Rollback caveat (migrations) and version-support policy in the handover doc
- [ ] `TenantMode` at token issuance only; no enterprise fork
- [ ] IT one-pager (with RTO/RPO table), SOW skeleton, objection table maintained

---

Worked example: `<saas>/.github/workflows/private-cloud-push.yml`,
`.github/private-cloud-clients/` (registry + template + README),
`infra/private-cloud/` (subscription-scope main + generic modules), and
`docs/PRIVATE_CLOUD_DEPLOYMENT.md` + `docs/business/IT_TECHNICAL_ONEPAGER.md` +
`docs/business/SOW_TEMPLATE.md` for the §8 artifacts.
