<!-- Generated copy of docs/guides/TESTING-STRATEGY.md — do not edit. Relative links have been rewritten to absolute repository URLs. -->

# Testing strategy

P13 says *test at the layer that has the logic*. This guide is the strategy above that
principle: what each test tier is for, when each runs, what a test must satisfy to be
merged, what only a human can test, and how test suites rot. The recurring theme: a
test suite is a budget, not a trophy — every rule here exists to keep signal per minute
high.

It is deliberately repo-agnostic. Worked examples:
`<saas>/docs/E2E_TEST_STRATEGY_AND_SCOPE.md`,
`docs/test-automation-analysis.md`, `docs/MANUAL_TESTING_CHECKLIST_V2.md`, and the
five `<saas>/tests/*` projects.

**Contents**

1. [The charter: what E2E is for](#1-the-charter)
2. [Three layers with budgets](#2-three-layers-with-budgets)
3. [What runs when](#3-what-runs-when)
4. [Test infrastructure tiers](#4-test-infrastructure-tiers)
5. [Mechanics and conventions](#5-mechanics-and-conventions)
6. [The per-test quality bar](#6-the-per-test-quality-bar)
7. [Manual testing is a discipline, not a fallback](#7-manual-testing)
8. [Auditing an existing suite](#8-auditing-an-existing-suite)
9. [Test configs rot](#9-test-configs-rot)
10. [Checklist](#10-checklist)

---

## 1. The charter

Write the charter before the tests. E2E exists to: protect the critical business flows
(the ones that cost money or users when broken), verify cross-service integration, and
give CI fast feedback. E2E does **not** exist to: test single-field validation
(unit-test the validator), duplicate backend integration tests through a browser, or
pixel-check visuals. Every E2E test that violates the charter is minutes added to
every PR forever; the charter is what lets you delete it.

## 2. Three layers with budgets

| Layer | Budget | Trigger | Contents |
|---|---|---|---|
| Smoke | 5–10 min | every PR | the minimum viable set — can a user sign up, sign in, and complete each revenue-bearing flow. Roughly seven flows, single browser |
| Core regression | 20–30 min | merge to main | the charter's full protected-flow set |
| Extended / edge | 30–60 min | nightly | cross-browser, edge cases, slow paths |

The budget is part of the definition. A smoke suite that grows past its budget gets
pruned, not renamed.

## 3. What runs when

Make the matrix explicit — five pipeline contexts, three states (always / if time
allows / skip):

| | PR draft | PR ready | merge to main | nightly | release candidate |
|---|---|---|---|---|---|
| Unit + lint | always | always | always | always | always |
| Integration | skip | always | always | always | always |
| Smoke E2E | skip | always | always | always | always |
| Core regression | skip | if touched area | always | always | always |
| Extended / cross-browser | skip | skip | skip | always | always |

Tags map tests to layers mechanically — `@smoke` / `@full` / `@acceptance` mapped to
Playwright projects via `testMatch`/`testIgnore` — so the matrix is configuration, not
folklore. When arguing pipeline scope, argue with numbers: minutes added per tier
versus risk reduction, and CI cost at the team's PR volume.

## 4. Test infrastructure tiers

Four tiers; pick per layer, cheapest that answers the question:

1. **In-memory/mocked** — unit and most integration tests. The kernel's InMemory
   database fallback (P4) exists partly for this: no container needed.
2. **Compose per run** — real databases for persistence round-trips and migration
   application.
3. **Shared environment with a reset test database** — E2E against deployed services.
4. **Production mirror** — release candidates only.

"Should every PR get infrastructure?" has a recorded answer: full infrastructure no,
**ephemeral preview environments yes** — that is what
[`PR-PREVIEW-ENVIRONMENTS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/PR-PREVIEW-ENVIRONMENTS.md) provides, and E2E smoke
against the preview is its payoff.

## 5. Mechanics and conventions

- Test projects mirror the source tree: `tests/<Service>.Tests/<Area>/<Type>Tests.cs`,
  one production project referenced per test project; global usings for the assertion
  stack in one file.
- **Isolation by constructor**: a fresh InMemory database named `Guid.NewGuid()` per
  test class; real in-memory cache; options via `Options.Create`; uninteresting
  collaborators as `Mock.Of<T>()`.
- **Mock modes are test seams.** The payment gateway's mock mode
  ([`PAYMENTS-AND-MONETIZATION.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/PAYMENTS-AND-MONETIZATION.md) §3) lets the full
  checkout → webhook → entitlement path run in-process with zero HTTP. Build the seam
  into the service; do not build a parallel fake in the tests.
- Frontends: a coverage floor (say 50%) on an explicit `collectCoverageFrom`
  allowlist beats an aspirational 80% on everything; exclude the E2E directory from
  the unit runner.
- Playwright harness defaults that carry: three browser projects; CI-only
  `forbidOnly`, `retries: 2`, `workers: 1`; `trace: on-first-retry`;
  screenshot/video on failure; `webServer` array with
  `reuseExistingServer: !CI`.

## 6. The per-test quality bar

The E2E-specific depth behind this bar — assertion discipline, locator and waiting
conventions, and CI wiring as part of a suite's definition of done — is in
[`E2E-ACCEPTANCE-TESTING.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/E2E-ACCEPTANCE-TESTING.md); this section is the summary
every tier shares.

A test is merged only if:

- Its name states **one business goal** ("user can publish a template"), and it
  asserts the *outcome*, not that a button was clicked.
- It is **fully independent**: creates its own data, owns its own state, passes in any
  order, and survives parallelism.
- It selects by **`data-testid`**, not CSS chains; it never `waitForTimeout`s — it
  waits for conditions.
- It uses no production credentials and cleans up what it creates.
- **It is not flaky. Zero tolerance:** intermittent failure is fixed or the test is
  deleted before merge. A retried-until-green test is a false regression net — worse
  than no test, because it is trusted.

When a test fails in CI but passes locally, suspect in order: environment variables
unset, database unseeded, services not fully started, race conditions the faster CI
box exposes.

## 7. Manual testing

Automation cannot substitute for a human in four named situations — schedule manual
passes for exactly these, and stop feeling guilty about them:

1. **Third-party DOM you do not control** (site integrations, per-site adapters):
   any site can change markup any day; E2E against it is cost without signal.
2. **Entitlement gating where errors cost twice**: a free user slipping through loses
   revenue; a paying user wrongly blocked loses the customer. A human verifies both
   directions with real accounts.
3. **Extension/native contexts** where automation has minimal platform API access.
4. **Client-side-only data** (local storage without server backup), where a bug is
   permanent data loss.

Humans also find **combination bugs** unit tests structurally miss — auto-save firing
mid-manual-save producing duplicates; pagination resetting on page-size change.

Discipline for the session: a prepared **account matrix** (plan × role) before
starting; a pre-session checklist (verify deployed version, clear state, prepare a
real mailbox, install the current extension build, health-check backends); notation
`[x]` / `[FAIL: #ticket]` / `[SKIP: reason]`; and a bug template with a P0–P3 rubric
with concrete examples per level, so triage is not re-negotiated per bug.

Keep the cross-cutting checklists as reusable blocks, applied to any feature:
responsive breakpoints; **loading / empty / error states as a first-class category**;
keyboard-only and screen-reader accessibility (focus trap, Esc, WCAG AA contrast,
200% zoom, no information by color alone); data edge cases (0/1/100/1000 records,
maximum lengths, emoji, RTL and CJK, markdown edge cases); network conditions (slow,
intermittent, offline); concurrent tabs editing the same record; clock and timezone
shifts.

## 8. Auditing an existing suite

The audit questions that generalize verbatim:

- Is this suite a real regression net, or happy-path theatre?
- What share of it could be replaced by cheaper integration tests?
- Is the test count proportional to the maintenance it costs?
- What would the ideal minimal suite look like, designed from zero?

Run the audit as issues: one parent "suite review" issue, one child per scope from a
template, each capped at ~10 action items so it finishes. For an inherited (especially
bulk-generated) E2E suite, the deeper audit procedure — including the tells that a
suite was never fact-checked — is [`E2E-ACCEPTANCE-TESTING.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/E2E-ACCEPTANCE-TESTING.md) §8.

## 9. Test configs rot

The decisive worked example: a committed Playwright config whose `testDir` does not
exist and whose `webServer` points at a renamed directory — because no CI job ever ran
it, nothing noticed for months. The rule: **every test entry point the repo claims is
executed by some CI context in §3's matrix.** An unreferenced test config is not a
latent capability; it is documentation that lies. If a layer is aspirational, delete
its config and track it as an issue instead.

## 10. Checklist

- [ ] E2E charter written: protected flows named, non-goals named
- [ ] Three layers with time budgets and triggers; smoke suite enumerated
- [ ] When-to-run matrix explicit; tags mapped to runner projects mechanically
- [ ] Infrastructure tier chosen per layer; PR answer = preview environments, not full infra
- [ ] Test projects mirror source; constructor isolation; mock modes used as seams
- [ ] Per-test bar enforced: one goal, independent, `data-testid`, no sleeps, zero flakiness tolerance
- [ ] Manual scope limited to the four named situations, run with account matrix, notation, and bug rubric
- [ ] Suite audited on a cadence with the four questions
- [ ] Every committed test config is executed by some CI context

---

Worked examples: `<saas>/docs/E2E_TEST_STRATEGY_AND_SCOPE.md` (charter,
layers, refactor issue templates), `docs/test-automation-analysis.md` (matrix,
infrastructure tiers, cost math), `docs/MANUAL_TESTING_CHECKLIST_V2.md` (the four
situations, account matrix, rubric), `docs/MANUAL_TESTING_CHECKLIST.md` §cross-cutting
(the reusable blocks), `tests/*.Tests` (conventions) — and `playwright.config.ts` as
the §9 cautionary example.
