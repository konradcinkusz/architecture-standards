# Demo data: safe to create, safe to remove, and worth looking at

Every product with a dashboard needs data to show it — for a demo, for a screenshot, for a
new developer's first five minutes, for an acceptance test. Producing that data is easy.
The two things that go wrong are less obvious: demo data that cannot be removed without
taking real data with it, and demo data that entered through a door real traffic never
uses, so a green demo proves nothing about the system.

This guide fixes both, and adds the one that decides whether the demo is any good: the
data has to *say* something.

It is repo-agnostic. The worked example is `konradcinkusz/copilot-scope` — the
`/api/admin/seed` endpoint in `Program.cs`, and the two generators under `tools/`
(`CopilotScope.Seeder`, `CopilotScope.TelemetryGen`).

**Contents**

1. [Namespace demo data, and enforce it at the receiver](#1-namespace-demo-data-and-enforce-it-at-the-receiver)
2. [Reset clears the namespace, everywhere it was written](#2-reset-clears-the-namespace-everywhere-it-was-written)
3. [Seed through the running system, not around it](#3-seed-through-the-running-system-not-around-it)
4. [Deterministic by default](#4-deterministic-by-default)
5. [Two tiers, and what each one proves](#5-two-tiers-and-what-each-one-proves)
6. [Personas: demo data should tell a story](#6-personas-demo-data-should-tell-a-story)
7. [Failure modes](#7-failure-modes)
8. [Checklist](#8-checklist)

---

## 1. Namespace demo data, and enforce it at the receiver

Give every seeded record an id under a reserved prefix. That is the mechanism that makes
cleanup safe, and everything in §2 depends on it.

**Enforce the prefix server-side, and refuse the whole batch when it is violated.** A
namespace that only the seeding tool honours is a *convention*, not a boundary: anyone who
can call the endpoint can write an id outside it and overwrite real captured data. Moving
the check to the receiver is what converts the convention into a guarantee, and it costs
one comparison.

Refuse the batch rather than filtering it. A partial apply leaves the caller with a
success they cannot reason about and the system in a state nobody described.

**On authorisation:** reusing the ingest credential is defensible *when it widens nothing*
— if a key holder can already post fabricated telemetry through the front door, a seed
endpoint behind the same key hands them no new capability. Write that reasoning down where
the endpoint is defined. A seeding endpoint is exactly the sort of thing a reviewer should
stop at, and the answer to "why is this safe?" should not require reconstructing the
threat model from scratch.

> `copilot-scope` — `SeedIdPrefix = "seed-"`, checked before anything is written, with a
> comment recording the defect it closes: the guarantee "was only a Seeder convention, so a
> key holder could otherwise Put over a real captured session."

## 2. Reset clears the namespace, everywhere it was written

Seeding without a reset is a one-way operation, and a demo environment that can only
accumulate becomes one nobody trusts.

Reset deletes **by prefix**, and it has to reach **every store the data landed in**. A
service holding a hot aggregate in memory *and* a durable copy has two, and clearing one
leaves the other to restore what you just removed — see
[`STATE-SNAPSHOT-PERSISTENCE.md`](STATE-SNAPSHOT-PERSISTENCE.md) §5 for the same failure in
its own setting.

Log what was removed from each store, with counts. It is the only cheap way to notice that
a reset silently cleared nothing.

## 3. Seed through the running system, not around it

The seeder is a client. It posts to the running service over its ordinary API; it does not
open the database, and it does not require a restart.

Writing to the database directly is faster to build and worth less: it bypasses validation,
derived-value computation and every invariant the service maintains, so it can create
states the service itself cannot — and then the demo shows a system that cannot exist. The
bug reports that follow are about the seeder, and take a while to be recognised as such.

Going through the API also means the seeding path is exercised by the same code every real
request uses, which is why a broken deployment fails to seed instead of quietly seeding
into a broken system.

## 4. Deterministic by default

Seed the random number generator from an argument with a fixed default. Two people running
the seeder get the same dataset, a screenshot taken today can be reproduced next month, and
"the third session in the list" means something in a bug report.

Make it **idempotent**: re-running against an already-seeded system must converge rather
than accumulate. Combined with the namespace in §1, that is what makes the seeder safe to
run in a loop during development.

> `copilot-scope` — `--seed N`, default 42, and the header comment noting that re-running
> against a running container "never piles up" because the ids are stable and namespaced.

## 5. Two tiers, and what each one proves

Ship both, and be explicit about what each does and does not demonstrate:

- **The high-level seeder** posts finished records through the product's own API. It is
  fast, deterministic, and ideal for populating a dashboard. It proves the read path, the
  storage and the rendering. It proves **nothing** about ingest, because it skipped it.
- **The protocol generator** speaks the real wire format the real producers speak —
  encoding, compression, transport and all — and enters through the same door production
  traffic does. It is slower and fiddlier, and it is the only one of the two that
  demonstrates the system actually works.

Most demo needs are served by the first. The second is what stops the first from becoming a
lie: without it, an ingest path can break and every demo will still look perfect.

> `copilot-scope` — `CopilotScope.Seeder` posts to `/api/admin/seed`; `CopilotScope.TelemetryGen`
> hand-encodes OTLP/HTTP protobuf, gzips it, and posts to the real ingest endpoint.

## 6. Personas: demo data should tell a story

Randomised rows fill a dashboard and demonstrate nothing. Generate from a small set of
named **personas**, each shaped to produce a recognisable outcome on the screen — the clean
run, the error storm, the slow backend, the frustrated user, the case the product is
supposed to filter out.

The test of a seeded dataset is not that the charts have data in them; it is that somebody
who knows the product can look at the result and name what each part of it is showing. If
no persona exercises a feature, that feature has no demo — which is worth knowing before a
customer call rather than during one.

Personas also make the seeder a design document: the set of stories the product thinks are
worth telling, in one file.

## 7. Failure modes

| Symptom | Cause |
|---|---|
| A reset deleted real data | Cleanup matched on something other than a reserved namespace — a date range, "everything", a guess (§1) |
| Seeded ids overwrote real records | The namespace was a convention the writing tool honoured, never enforced at the receiver (§1) |
| Cleared demo data comes back | Reset cleared one store; the data was written to two (§2) |
| The demo shows a state the product cannot actually produce | Seeded straight into the database, bypassing the validation and derived values the service applies (§3) |
| A screenshot cannot be reproduced | Unseeded RNG, so every run produces a different dataset (§4) |
| Re-running the seeder doubles the data | Non-idempotent: new ids each run instead of stable namespaced ones (§4) |
| Ingest is broken and every demo still looks perfect | Only the high-level seeder exists, and it enters past the ingest path (§5) |
| The dashboard is full and the demo is unconvincing | Randomised rows rather than personas — nothing on screen is *about* anything (§6) |
| A feature has no demo and nobody noticed until a customer call | No persona exercises it, and nothing checks that (§6) |

## 8. Checklist

- [ ] Every seeded record carries a reserved id prefix
- [ ] The prefix is enforced **server-side**, and a batch containing any out-of-namespace id is refused whole rather than filtered
- [ ] The endpoint's authorisation reasoning is written where the endpoint is defined — in particular, why reusing an existing credential widens nothing
- [ ] Reset deletes by prefix from **every** store the data was written to, logging counts per store
- [ ] The seeder is a client of the running service: no direct database access, no restart required
- [ ] RNG is seeded from an argument with a fixed default, and re-running converges rather than accumulating
- [ ] A second generator speaks the real ingest protocol, so the ingest path is demonstrated rather than skipped
- [ ] Generation is persona-driven, and each persona maps to a recognisable story on screen
- [ ] Every feature worth demonstrating has a persona that exercises it
