<!-- Generated copy of docs/guides/SHARED-SERVICE-REUSE.md — do not edit. Relative links have been rewritten to absolute repository URLs. -->

# Shared services: one codebase, N independent instances

A service can be good enough, and generic enough, that a second and unrelated system in the
estate wants to run it too. P3 governs a service inside one system; nothing above it said what
happens when a sibling repo wants the same service — and the default answer people reach for,
"point the second system at the first one's deployment", quietly creates the one thing this
estate has no appetite for: unowned shared infrastructure that two teams depend on and neither
owns.

This guide fixes the model. It is about **distribution**, not about what makes a service worth
sharing — the domain guide for whatever the service does still applies to the service itself.

It is deliberately repo-agnostic. The worked example is `konradcinkusz/authservice`
(`.github/workflows/publish-image.yml`, README §"Deploying your own instance") consumed by a
sibling system through its own `fly.toml` and deploy workflow.

**Evidence level, stated plainly.** The eleven guides extracted from the reference SaaS carry
months of production mileage. This one has fewer consumers behind it than that, and it is
promoted because the estate already *requires* the pattern — `docs/MASTER-PROMPT.md` makes
adopting the shared identity service a step in every delivery session — and a rule the estate
mandates but never wrote down is the "agent re-derives the rules from whatever code it sees"
failure this corpus opens by naming. Rules 1–3 are the load-bearing ones and each has a
concrete failure behind it; treat rule 4's naming convention as the softest.

**Contents**

1. [One codebase, N independent instances](#1-one-codebase-n-independent-instances)
2. [An artifact dependency, never a source dependency](#2-an-artifact-dependency-never-a-source-dependency)
3. [Publishing must not depend on deploying](#3-publishing-must-not-depend-on-deploying)
4. [Each consumer names its own instance](#4-each-consumer-names-its-own-instance)
5. [Database per instance, reconciled with P3](#5-database-per-instance-reconciled-with-p3)
6. [What this does not excuse](#6-what-this-does-not-excuse)
7. [Failure modes](#7-failure-modes)
8. [Checklist](#8-checklist)

---

## 1. One codebase, N independent instances

**Never one shared runtime, and never a shared trust root.** Each consumer deploys its own
compute, its own database, and its own signing key. Two systems running the "same" service
share nothing at runtime except the image that produced both.

That is the entire point rather than an implementation detail. An incident, a migration, a
saturated connection pool or a compromised credential in one consumer's instance cannot reach
another's, because there is no runtime edge between them to travel along. The moment two
consumers can validate each other's tokens, "independent instance" has stopped being true and
you have built a shared identity provider with no owner.

The alternative — one central deployment that both systems call — looks cheaper on the day it
is set up and is the more expensive shape by the first incident. Somebody has to own its
uptime, its upgrades and its capacity, and in an estate of sibling repos that owner does not
exist.

## 2. An artifact dependency, never a source dependency

The service's repository publishes a version-pinned image on every tagged release. A consumer
references a specific tag:

```toml
[build]
  image = "ghcr.io/<owner>/<service>:v0.1.0"   # pinned, never :latest
```

No submodule, no cross-repo project reference, no shared checkout. A consumer never builds the
shared service from source, which means it can never accidentally build a *different* service
from the one it tested against.

This is P2's shared-kernel rule one level up the stack. A shared kernel is code shared within
one system; a shared service is a whole system. The discipline that keeps either from
decaying into unowned infrastructure is the same: depend on the artifact, never on the source.

`:latest` defeats the entire mechanism — two consumers pulling `:latest` a week apart are
running different software while their configuration claims they are running the same thing,
and the difference surfaces as an incident rather than as a diff.

## 3. Publishing must not depend on deploying

**The publish job's credentials must be a strict subset of what publishing actually needs.**
Building and pushing an image needs a registry credential and nothing else — not a hosting
provider token, not a database password, not any secret a *consumer* would hold.

Keep the service's own reference deployment, if it has one, in separate jobs that cannot gate
the publish. A maintainer who never deploys their own instance must still be able to ship a
release that every consumer can pull.

This rule exists because the estate got it wrong once and caught it the same day: the publish
step ran after a registry-auth step that failed without hosting credentials configured, so a
repository whose whole purpose was to be consumed by *others* could not publish anything
unless its own optional deployment was wired up. The failure is easy to miss precisely because
it looks like ordinary pipeline ordering.

> `authservice/.github/workflows/publish-image.yml` — one job, `packages: write` on that job
> only, and the automatic `GITHUB_TOKEN` as its sole credential. Its header states the reason,
> which is what stops the coupling being reintroduced by someone tidying the workflow later.

## 4. Each consumer names its own instance

Extend P7's `<system>-<service>-<env>` convention one level, where `<system>` is the
**consumer**, not the shared service. A consumer's instance is `<consumer>-<service>`.

Naming is the cheapest isolation there is: an app name that carries the consumer's identity
makes "whose instance is this, and who do I page about it" answerable from a dashboard,
without a lookup table that nobody maintains. Instances named after the shared service
collide, and the collision surfaces as somebody operating the wrong one.

## 5. Database per instance, reconciled with P3

Each instance owns its own database. That does **not** mandate its own database *server*.

P3 already permits physically co-locating databases on one Postgres instance as a cost
decision, and that reconciliation extends cleanly: a consumer that already runs Postgres can
add the shared service's database to it — its own logical database, its own role, no
cross-grants — rather than provisioning a second always-on server for one service. The logical
boundary P3 cares about is untouched either way; what P3 forbids is two services reaching into
one schema, not two schemas sharing a host.

## 6. What this does not excuse

Everything in the domain guide for what the service *does* still applies to the service
itself. This pattern governs distribution and nothing else.

In particular, **an extraction inherits its source's defects along with its design.**
Extracting a service from a system is not the same as auditing it, and the comfortable
assumption — that code good enough to extract was good enough to begin with — is how a known
defect acquires a second home. Record what came across unaudited in the extraction's own
deviation register, on the day it is extracted, rather than discovering it from a consumer.

## 7. Failure modes

| Symptom | Cause |
|---|---|
| Two consumers' users can authenticate against each other's system | A shared trust root: the same signing key was reused across instances, so the tokens are mutually valid. Independent instances means independent key material (§1) |
| A consumer is running software nobody can identify | The image reference is `:latest`. Two consumers that deployed a week apart are on different builds while their config claims otherwise (§2) |
| The shared service cannot ship a release | The publish job was gated on the service's own deployment secrets, so a maintainer without a hosted instance cannot publish for consumers who need one (§3) |
| An upgrade to one consumer takes another consumer down | The two are not independent instances at all — somewhere a runtime edge was introduced, usually a "temporary" pointer at the other's deployment (§1) |
| Nobody can tell whose instance an app is | Instances named after the shared service rather than the consumer, so ownership is not answerable from the platform itself (§4) |
| A consumer's incident review finds a defect the service already knew about | The extraction was treated as an audit. The defect travelled with the design and nobody wrote it down (§6) |

## 8. Checklist

- [ ] Every consumer runs its own compute, its own database and its own independently generated signing key; no key material is reused across instances
- [ ] Consumers reference a pinned image tag, never `:latest`, and never take a source-level dependency (no submodule, no cross-repo project reference)
- [ ] The publish workflow needs only a registry credential; the service's own deployment, if any, lives in separate jobs that cannot gate it
- [ ] A maintainer with no hosted instance of their own can still cut a release
- [ ] Instances are named for the consumer, not for the shared service
- [ ] Each instance's database is its own logical database with its own role and no cross-grants — co-location on an existing server is a cost decision, not a boundary change
- [ ] The extraction's deviation register records what came across unaudited from the source
