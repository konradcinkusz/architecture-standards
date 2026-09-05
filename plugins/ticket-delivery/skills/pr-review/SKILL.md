---
name: pr-review
description: >-
  Use when reviewing a pull request against the ticket it claims to deliver,
  before marking it ready for review or merging it. Starts from the acceptance
  criteria rather than from the diff and requires both satisfying code and a
  proving test for each one, identifies changes with no criterion behind them,
  walks the compliance checklist for every layer the diff touches, reads
  recorded decisions first so justified deviations are not reported as
  findings, reads test bodies instead of counting them, ranks findings
  blocking / should fix / consider, and ends with an explicit verdict. Reports
  findings; never edits the code.
argument-hint: [branch]
disallowed-tools: Edit, NotebookEdit
---

# Reviewing a pull request against the ticket

The last gate before a pull request is ready. It answers one question — **does this diff
deliver the ticket, within the architecture?** — and it answers it against two sources
that outrank the reviewer's taste: the acceptance criteria, and the
[reference architecture](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/architecture/00-REFERENCE-ARCHITECTURE.md).

This review reads and reports. It does not edit: a review that fixes what it finds
destroys the evidence of what was wrong, and nobody learns the pattern.

Last of three phases, after [`TICKET-ANALYSIS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/TICKET-ANALYSIS.md) and
[`IMPLEMENTATION-PHASE.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/IMPLEMENTATION-PHASE.md). [`WORKFLOW.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/WORKFLOW.md) is how
they fit together and how to install them.

**Contents**

1. [Establish what is actually being reviewed](#1-establish-the-diff)
2. [Acceptance criteria first](#2-acceptance-criteria-first)
3. [The architectural pass](#3-the-architectural-pass)
4. [The test pass](#4-the-test-pass)
5. [Severity, and the verdict](#5-severity-and-the-verdict)
6. [Failure modes](#6-failure-modes)
7. [Checklist](#7-checklist)

---

## 1. Establish the diff

Diff the branch against **the repository's real base branch**, not against an assumption
about which one that is. Review every changed file; a file skipped for looking boring is
where the configuration change hides.

Note what the diff touches that the ticket did not mention. That list is an input to §2 and
§5, not yet a finding.

## 2. Acceptance criteria first

Take the acceptance criteria one at a time and, for each, name **the code that satisfies it
and the test that proves it**. Both, or it is not satisfied.

- A criterion with code and no test is unproven.
- A criterion with a test and no code is a test asserting the framework.
- A criterion you cannot locate at all is the finding that matters most, and it outranks
  every style observation in the review.

Then the other direction: **changes with no criterion behind them.** Some are legitimate —
a fix inside the code being changed anyway (`IMPLEMENTATION-PHASE.md` §2). The rest is
scope creep, and it is cheaper to name here than to explain after release.

## 3. The architectural pass

Walk the compliance checklist for the layers the diff touches. The findings worth the most
are the ones a passing build cannot show:

- **P2** — anything domain-shaped added to the shared kernel: an entity, DTO, enum, seed
  dataset, pricing constant, user-facing string.
- **P3** — a cross-context read or write; a second service reaching the owning service's
  database.
- **P4** — schema changed without a migration, or a migration that is not provider-portable.
- **P5** — a secret, key or connection string in source, config or a comment; configuration
  read from somewhere other than the environment.
- **P8** — a new dependency that fails startup rather than degrading, or one absent from
  the health endpoint and the startup banner.
- **P9 / P10** — wiring inlined into `Program.cs`; an extension point added as a base class
  rather than an interface registered in DI.
- **P11** — an external shape reaching the domain untranslated.
- **P15** — a new path with no traces, metrics or logs.
- **[`SERVICE-API-PATTERNS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/SERVICE-API-PATTERNS.md)** — an endpoint outside
  the trust groups, an unclamped list, a non-uniform error body, an outbound call without an
  explicit timeout, a retried indeterminate write.
- **Security** — anything newly exposed publicly gets the
  [`SECURITY-REVIEW.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/SECURITY-REVIEW.md) pass before it ships, not after.

A deviation that the pull request **records as a decision with a reason** is not a finding.
The same deviation, silent, is one — that distinction is P14 doing its job.

## 4. The test pass

Read the test bodies. Test count, file count and folder structure prove nothing; a
2026-08-14 audit of a 447-test suite found roughly 45% of it placeholders or guarded away
from ever asserting anything, and none of that was visible from the outside (P13).

- Is each new test at the layer that holds the logic, or is a browser standing in for a
  validator?
- Does it assert an **outcome**, or that a button was clicked?
- Is there a **regression** test for each existing path the diff touches, or only tests for
  the new branch?
- Does it clear the per-test bar — independent, `data-testid`, no sleeps, no production
  credentials ([`TESTING-STRATEGY.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/TESTING-STRATEGY.md) §6)?
- Does any new test entry point get executed by a CI context (§9)?

## 5. Severity, and the verdict

Rank every finding, and rank it by consequence rather than by how easy it is to describe:

| Level | What it means |
|---|---|
| **Blocking** | An acceptance criterion is unmet or unproven; a principle is violated with no recorded decision; a secret is exposed; a test was weakened or deleted to get green |
| **Should fix** | Correct but off-pattern: wrong test layer, missing regression coverage, an unrecorded assumption, documentation the change made untrue |
| **Consider** | Genuinely optional. Keep this section short — a long one buries the first two |

Close with the verdict the diagram's gate needs, stated plainly: **does this pull request
deliver the ticket, and is it within the architecture?** One of three answers — validated;
validated with the listed non-blocking findings; or not validated, with the blocking
findings named. "Looks good, some comments" is not a verdict.

## 6. Failure modes

| Symptom | Cause |
|---|---|
| Review approves a diff that misses a requirement | The pass started at the code instead of at the acceptance criteria |
| Review is a list of style opinions | The architectural and test passes were skipped because the build was green — which is exactly what they check for |
| A green suite is treated as evidence | Test bodies were never read; count and structure were trusted instead |
| Findings are all reported at the same weight | No severity ranking, so the blocking finding sits underneath a naming nit |
| The same violation recurs across pull requests | Findings were fixed by the reviewer rather than reported, so the pattern was never learned |
| A deviation is reported that the author had already justified | The pull request's recorded decisions were not read before reviewing |

## 7. Checklist

- [ ] Diffed against the repository's real base branch; every changed file read
- [ ] Each acceptance criterion mapped to the code that satisfies it **and** the test that proves it
- [ ] Changes with no criterion behind them identified and classified
- [ ] Compliance checklist walked for every layer the diff touches
- [ ] Recorded decisions read first, so justified deviations are not reported as findings
- [ ] Anything newly public given the security-review pass
- [ ] Test bodies read, not counted; layer, outcome assertions, regression coverage and the per-test bar checked
- [ ] Findings ranked blocking / should fix / consider
- [ ] An explicit verdict given against the ticket
- [ ] Nothing edited during the review

---

Generated from [`docs/delivery/PR-REVIEW.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/PR-REVIEW.md) by `scripts/build-marketplace.mjs`. Do not edit this file: change the source document, or its entry in `catalog/marketplace.catalog.json`, and re-run the generator.
