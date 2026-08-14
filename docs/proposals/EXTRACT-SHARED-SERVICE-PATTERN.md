# Proposal — shared services reused across the estate, not just within one system

> Source: building `konradcinkusz/authservice` (an extraction of `AureliusPromptus.AuthService`
> into its own standalone, generically-reusable repo) and adopting it as `FSE.Club`'s identity
> provider, 2026-08-14. Checked against the constitution (P1–P15) and every guide's header to
> avoid proposing a duplicate — the closest neighbors are `PRIVATE-CLOUD-DELIVERY.md`
> (image-push delivery to a paying customer) and `IDENTITY-AND-ACCOUNTS.md` (what a good
> identity service does internally); neither covers this. Nothing here is merged yet — this is
> a proposal for the maintainer to accept, defer, or reject, following the same convention as
> `EXTRACT-FROM-COPILOT-SCOPE.md`.
>
> Confidence note, stated plainly: this pattern has **one real data point** (authservice →
> FSE.Club), not the months of production mileage behind the eleven guides extracted from
> AureliusPromptus. Proposed as a guide candidate rather than merged directly for that reason.

---

## Why this exists

P3 says a service owns its database and its bounded context *within one system*. Nothing in
the constitution says what happens when a service is good enough, and generic enough, that a
**second, unrelated system** in the estate wants to run it too — not call it over HTTP as a
dependency of the first system, but run its **own independent copy**.
`IDENTITY-AND-ACCOUNTS.md` already describes how to build a good identity service; this
proposal is one layer up: how a service that is already good gets *extracted and consumed* by
siblings, without becoming a shared runtime dependency between them.

## The pattern

**One codebase, N independent instances — never one shared runtime.** Each consumer
(`FSE.Club` today; the next repo that needs auth, tomorrow) deploys its own compute, its own
database, its own signing key. Two systems using the "same" service share nothing at runtime
except the Docker image that produced both — which is the point: an incident, a schema
change, or a compromised credential in one consumer's instance cannot reach another's.

**Published as a version-pinned image, never as source.** The service's own repo builds and
publishes `ghcr.io/<owner>/<service>:<tag>` on every tagged release. A consuming repo's
`fly.toml` references a specific tag directly:

```toml
[build]
  image = "ghcr.io/konradcinkusz/authservice:v0.1.0"   # pinned, never :latest
```

No submodule, no cross-repo project reference, no shared checkout. This is P2's "shared
kernel, not shared domain" rule, one level up the stack: the *shared kernel* is code shared
within one system; a *shared service* is a whole system, and the discipline that keeps it from
becoming unowned shared infrastructure is the same one — never take a source-level dependency
on it, only an artifact-level one.

**Publishing the artifact must not depend on any consumer, or on the service's own
deployment.** The job that builds and pushes the image needs nothing but the registry
credential (`GITHUB_TOKEN` for GHCR) — not a Fly token, not a database password, not any
secret a *consumer* would need. Concretely: `authservice`'s `publish-image.yml` is a single
job requiring zero configured secrets; a separate, entirely optional set of jobs handles the
service's *own* reference deployment, if it has one, and must not gate the publish job — a
maintainer who never deploys their own instance should still be able to ship a release every
consumer can pull. (`authservice` initially coupled these — the publish step ran after a
Fly-registry-auth step that failed without Fly credentials configured — until this was caught
and split apart the same day.)

**No shared trust root.** Each instance's signing key is generated independently and never
reused across consumers — the whole point of "independent instance" collapses the moment two
consumers can read each other's tokens.

**Database-per-instance vs. database-per-service (P3), reconciled.** P3 already allows
physical co-location of multiple databases on one Postgres instance as a cost decision — that
reconciliation extends cleanly here: a consumer with its own existing Postgres app can add the
shared service's database to it (its own logical database, its own role, no cross-grants)
instead of provisioning a second always-on Postgres app just for the shared service. The
logical boundary P3 actually cares about is unaffected either way.

## Coverage today

- `PRIVATE-CLOUD-DELIVERY.md` covers the closest analogous shape — vendor pushes images,
  consumer runs everything — but for a **paying external customer** running the *whole
  product*, with a commercial responsibility split (§2 of that guide), a per-client registry,
  and IT one-pager / SOW artifacts. This proposal is the estate-internal analogue: a
  **sibling repo** adopting **one service**, no commercial relationship, one public registry
  any consumer pulls from, no responsibility split to negotiate — just "don't couple to
  source, don't share a trust root."
- `IDENTITY-AND-ACCOUNTS.md` is silent on distribution — it assumes the identity service lives
  in the same repo as its consumers, which stops being true the moment it is extracted.
- P2 covers shared code *within* a system; nothing covers shared *services* across systems.

## Draft outline, if accepted

1. One codebase, N independent instances — never a shared runtime, never a shared trust root.
2. Published as a version-pinned image; a consumer takes an artifact dependency, never a
   source dependency.
3. The publish job's credentials must be a strict subset of what publishing needs — never
   gated on a consumer's or the service's own deployment secrets.
4. Each consumer names its own instance (`<consumer>-<service>` app naming — extending P7's
   `<system>-<service>-<env>` convention one level, where `<system>` is the *consumer*, not
   the shared service).
5. A database-per-instance can be a logical database + role on an existing Postgres instance
   rather than a dedicated Postgres app — reconciling with P3's existing cost-decision
   language rather than contradicting it.
6. What doesn't change: everything in `IDENTITY-AND-ACCOUNTS.md` (or whatever domain the
   shared service covers) still applies *to the service itself*. This pattern is about
   distribution, not about what makes the service good — and does not excuse the service from
   the rest of the constitution. (Concretely: `authservice` still carries a real P5-adjacent
   defect it inherited verbatim from the AureliusPromptus example — see §3a of the reference
   architecture.)

## Worked example

`konradcinkusz/authservice` (the service: `publish-image.yml`, README §"Deploying your own
instance") and `konradcinkusz/FSE.Club` (a consumer: `flyio-authservice.yml`,
`flyio/authservice.fly.toml`, `docs/architecture/05-DECISIONS.md` for the full reasoning
trail, including the publish/deploy coupling bug found and fixed mid-session).
