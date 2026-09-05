---
name: implementation-phase
description: >-
  Use when implementing an approved ticket, once analysis and planning are
  done — the fixed procedure that replaces rewriting an implementation prompt
  per ticket. Pre-analysis that proves the build green and names every file
  and existing test before an edit is made; implementation keyed to the
  principles a diff can actually violate, from a kernel free of domain through
  database ownership, migrations, secrets, degrading optional dependencies,
  wiring, anti-corruption and observability to the API patterns; tests at the
  layer holding the logic, with regression coverage and the per-test bar; a
  manual test document only where automation genuinely cannot substitute for a
  human; recorded decisions that cite the principle behind them; and the
  pull-request description. Formatting is left to .editorconfig rather than
  restated. Refuses to proceed if the standards are not actually readable in
  the session.
---

# The implementation phase

You are in the implementation phase for one ticket. Analysis, clarification and planning
are done and approved; this document is what happens next. Follow the steps in order and
do not collapse them.

One rule outranks everything below, because breaking it is the most expensive failure
mode in this estate: **read the standards, do not re-derive them.** The architecture is
already written down — [15 principles and a compliance
checklist](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/architecture/00-REFERENCE-ARCHITECTURE.md), and a guide per domain under
[`docs/guides/`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/). An agent that reconstructs an architectural rule from
whatever code it happens to see will reconstruct it wrong, and the diff will look
plausible.

**The input is this session.** What varies per run is the change agreed in the
conversation — the analysis, the decisions taken, the scope approved. The procedure below
does not vary at all, which is why it is a document you invoke rather than a prompt you
rewrite per ticket. It takes no argument: everything it needs is already in front of it.

[`TICKET-ANALYSIS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/TICKET-ANALYSIS.md) comes first, and
[`GENERATE-MASTER-PROMPT.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/GENERATE-MASTER-PROMPT.md) between the two — where a master
prompt was generated, it is the agreed change, and it names the criteria, the files and the
accepted risks this phase works from. [`PR-REVIEW.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/PR-REVIEW.md) comes after, and
[`FEEDBACK.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/FEEDBACK.md) is how a correction gets back upstream instead of being
patched into the diff. [`WORKFLOW.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/WORKFLOW.md) is how they fit together and how to
install them.

**Contents**

0. [The standards have to be in front of you](#0-the-standards-have-to-be-in-front-of-you)
1. [Pre-analysis, before any code](#1-pre-analysis)
2. [Implementation](#2-implementation)
3. [Tests](#3-tests)
4. [The manual test document, when it is warranted](#4-manual-test-document)
5. [Documentation and recorded decisions](#5-documentation)
6. [The pull request](#6-the-pull-request)
7. [Scope and stop conditions](#7-scope-and-stop-conditions)
8. [Failure modes](#8-failure-modes)
9. [Checklist](#9-checklist)

---

## 0. The standards have to be in front of you

Confirm, before the first edit, that you can actually open
[`00-REFERENCE-ARCHITECTURE.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/architecture/00-REFERENCE-ARCHITECTURE.md) and the
guides under [`docs/guides/`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/) — because
`architecture-core@architecture-standards` is installed, or because this repository is
attached to the session. **If you cannot, stop and say so.** Every rule below is stated in
shorthand — "the kernel stays a kernel", "translate at the edge" — and the shorthand is
only safe next to the text it compresses. Implementing against a remembered version of
these rules produces a diff that looks compliant and is not, which is more expensive than
one that obviously ignores them.

**And there has to be an agreed change.** This phase implements what the session already
settled; it does not choose what to build. A master prompt is that agreement in its most
portable form — read it first where one exists, including its accepted risks, because an
assumption recorded there failing mid-implementation is a §7 stop condition rather than a
puzzle to route around. If the conversation carries no approved
scope — no analysis, no decision, nothing but a ticket reference — that is the finding.
Say so and go back to [`TICKET-ANALYSIS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/TICKET-ANALYSIS.md), rather than inventing a
change plausible enough to look like the one that was meant.

If that phase ran, its §2 table and §3 risk list are the
inputs to this phase: the table names the guides to load and the files to touch, and the
risk list names the compliance items to protect. Read them before §1 rather than
re-deriving both.

**Everything this phase outputs cites its source.** A decision recorded under §5, a
deviation, a rejected alternative, a rule invoked in review of your own diff — each names
the principle (`P4`) or guide section (`SERVICE-API-PATTERNS.md` §5) it rests on. A
statement with no citation is a fact about this ticket, never a rule.

## 1. Pre-analysis

Nothing is edited in this step. Its output is a list of files and a list of tests.

**Confirm the starting state is green.** Build and run the existing tests *before*
touching anything. A red build inherited from `main` is a separate problem and must not
be discovered later, mixed into your diff.

**Name the bounded context that owns the change (P3).** One service owns it. If
delivering the ticket appears to require a second service's database, that is not an
implementation detail to route around — it is a design problem, and §7 applies.

**Identify the layers the change actually touches**, in this estate's terms rather than
generic ones:

| Layer | What to check before you touch it |
|---|---|
| Service domain | The logic belongs in the service that owns the context (P3) |
| Shared kernel | Only cross-cutting *mechanism* (P2). A kernel change carrying an entity, DTO, enum, seed dataset, pricing constant or user-facing string is a violation, and the architecture test plus the CI size check will say so |
| Persistence | Schema moves by a migration, never `EnsureCreated` (P4); provider-portable |
| HTTP surface | Endpoint group and trust level, validation filter, list clamping ([`SERVICE-API-PATTERNS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/SERVICE-API-PATTERNS.md) §2–§4) |
| Anti-corruption boundary | Any external shape entering the domain is translated at the edge (P11) |
| Cross-service calls | Resilience handler, explicit timeouts, bearer forwarding (`SERVICE-API-PATTERNS.md` §5) |
| Frontend / BFF | Product surface changes go through [`FRONTEND-BFF.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/FRONTEND-BFF.md) — cookie sessions, `/api/config`, the proxy route |
| AppHost | A new service or resource is declared with `WithReference`, `WaitFor` and `WithHttpHealthCheck` (P1) |

**Load the guide for every domain in that list**, and say which ones you loaded. This is
the step that is skipped most often and costs most: the guides exist so that the patterns
are recalled rather than reinvented.

**Trace the flow end to end** — domain → persistence → anti-corruption boundary →
endpoint → response → BFF proxy → UI, as far as the change reaches — and **name every
file that will change**. A file not on the list at the end of pre-analysis is either a
discovery worth stating or scope creep worth refusing.

**Find the existing tests at the layer that holds the logic (P13).** Name them. These are
what you must not break; some of them are what you will extend.

**If delivering the acceptance criteria requires deviating from a principle, stop here**
and follow §7. A deviation decided in advance is a recorded decision; the same deviation
discovered in review is a finding.

## 2. Implementation

Apply the change. Every rule in this section is a thing a diff can violate, keyed to the
principle it comes from — these replace generic "coding rules", which in this estate are
already handled elsewhere (see the note at the end of this section).

- **P2 — the kernel stays a kernel.** Cross-cutting mechanism only: no entity, DTO, enum,
  seed dataset, pricing constant or user-facing string.
- **P3 — the service owns its database.** No second service connects to it, and no
  cross-context write sneaks in through a shared context.
- **P4 — schema changes are migrations.** Provider-specific migrations applied by
  `MigrateAsync` from a hosted service. Never `EnsureCreated`, never a hand-applied DDL
  step.
- **P5 — configuration through the environment, secrets through the platform.** No secret
  in source, in a config file, or in a comment. The secret scanner in CI is the backstop,
  not the policy.
- **P8 — a new optional dependency degrades.** It gets a working no-op or fallback, it is
  reported by the health endpoint, and it appears in the startup banner. It does not fail
  startup.
- **P9 — `Program.cs` stays a manifest.** New wiring goes into
  `ServiceCollectionExtensions`, not inline.
- **P10 — extensibility is an interface registered in DI**, not a base class someone
  inherits.
- **P11 — translate at the edge.** External shapes do not reach the domain untranslated.
- **P15 — observability is part of the change**, not a follow-up: OTLP traces, metrics and
  logs cover the new path.
- **`SERVICE-API-PATTERNS.md`** — a new endpoint joins an endpoint group at the right
  trust level, carries the validation filter, clamps any list it returns, and returns the
  uniform error shape. A new outbound call carries the standard resilience handler with an
  explicit timeout, and never retries an indeterminate write.

Fix code-quality problems you find **in the code you are already changing**. Do not open a
second front (§7).

Confirm the build is green before moving on.

> **On formatting rules.** Do not hand-apply brace, indentation or line-length
> conventions, and do not invent them: [`.editorconfig`](https://github.com/konradcinkusz/architecture-standards/blob/main/.editorconfig) is
> committed for exactly this reason, per [`REPO-BASELINE.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/REPO-BASELINE.md)
> §1 — per-IDE formatting wars are cheaper to prevent than to argue. Formatting is a
> machine's job, and a prompt that re-specifies it is a second source of truth that will
> eventually disagree with the first.

## 3. Tests

**Choose the layer by where the logic is (P13).** The tier is not a preference:

| Layer | Use it for |
|---|---|
| Unit | Parsers, scoring, prompt builders, validators, orchestrator flow |
| Integration | Persistence round-trips, migration application |
| E2E | Cross-app user journeys only |

Take the cheapest infrastructure tier that answers the question
([`TESTING-STRATEGY.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/TESTING-STRATEGY.md) §4) — the kernel's InMemory
fallback exists so most tests need no container.

**Do not add an E2E test for something the charter excludes** (`TESTING-STRATEGY.md` §1):
single-field validation belongs on the validator, and a backend integration test does not
get duplicated through a browser. Every E2E test is minutes added to every PR forever.

**Every test you write clears the per-test bar** (`TESTING-STRATEGY.md` §6): its name
states one business goal and it asserts the outcome; it creates its own data and passes in
any order; it selects by `data-testid` rather than CSS chains; it waits for conditions and
never sleeps; it uses no production credentials. **Flakiness has zero tolerance** — an
intermittently failing test is fixed or deleted before merge, because a retried-until-green
test is trusted and therefore worse than no test.

**Follow the mechanics** (`TESTING-STRATEGY.md` §5): the test project mirrors the source
tree, isolation is by constructor with a fresh InMemory database named `Guid.NewGuid()`,
and where the service already has a mock mode, use it as the seam instead of building a
parallel fake in the tests.

**Cover both directions:**

- new branches and paths introduced by this change;
- **regression** for every existing path the change touches — this is the half that gets
  skipped;
- edge cases the change makes reachable: absent values, empty collections, boundaries,
  precision and format where the ticket involves either.

**When behaviour is being moved rather than added, characterisation tests come first** —
written against the old location before the move, not reconstructed after it (compliance
checklist).

**If a test entry point exists, some CI context runs it** (`TESTING-STRATEGY.md` §9). A
committed test config that no job executes is not a latent capability; it is documentation
that lies.

Run everything. Green before moving on.

## 4. Manual test document

**Write one only when the change lands in one of the four situations where automation
cannot substitute for a human** (`TESTING-STRATEGY.md` §7): third-party DOM you do not
control; entitlement gating, where a wrong answer costs in both directions; extension or
native contexts with minimal platform API access; and client-side-only data, where a bug
is permanent loss.

**Otherwise say so and move on.** A manual test document written for a change the
automated suite already covers is ceremony: it costs a reviewer's attention, it goes stale
immediately, and it implies a human pass that nobody scheduled. Record in the pull request
that the automated tests are the evidence, and which ones.

When it *is* warranted, write it to `docs/manual-tests/{TICKET-ID}-{short-description}.md`
— the ticket id being whatever the conversation used, not something passed in; where the
session names no ticket, the file is named for the change instead. Give it the discipline
the guide requires rather than a list of clicks:

- **Prerequisites** — the account matrix (plan × role) prepared in advance, the deployed
  version verified, state cleared, backends health-checked.
- **Cases**, using the guide's notation: `[x]`, `[FAIL: #ticket]`, `[SKIP: reason]`.
  Happy path; regression for existing behaviour; the edge cases that made this manual in
  the first place; the negative cases the endpoint must reject.
- **The cross-cutting blocks that apply**, taken from the guide rather than improvised:
  loading / empty / error states as a first-class category; keyboard-only and
  screen-reader access; data edge cases; network conditions; concurrent tabs; clock and
  timezone shifts.
- **A bug rubric** — P0–P3 with a concrete example per level, so triage is not
  re-negotiated per bug.
- **An acceptance-criteria verification table**: one row per criterion, and how it was
  verified.
- **Out of scope** — stated, not implied.

## 5. Documentation

P14: documentation lives in the repository and records reasoning, not just steps. A
document that says *"we considered X and rejected it because Y"* is worth more than one
that lists commands.

- **A decision taken during implementation is recorded** in the target repo's `docs/` —
  including any deviation from a principle, with its reason. A deviation you keep is a
  decision; a deviation you leave silent is a finding waiting to be filed by someone else.
- **A stale README is a review finding.** If the change makes any claim in the repository
  untrue — a documented endpoint, a configuration key, a described flow — fix it in the
  same pull request.

## 6. The pull request

Write the description to say what changed and why it was done that way, in this order:

- **What** — one paragraph, plain language.
- **Why** — the root cause or the gap, not a restatement of the ticket title.
- **Changes** — grouped: feature, fix, tests, documentation.
- **Test results** — what ran and what it proved. If §4 concluded no manual document was
  warranted, say that here and name the automated coverage standing in for it.
- **Deviations and decisions** — anything recorded under §5, linked.
- **Out of scope** — explicitly excluded items, so a reviewer stops looking for them.

Follow the repository's own pull request template where it has one; it is a layout to
fill in. The commit message references the ticket id the session used, if it used one.

If the repo keeps its PR descriptions as files, write to
`docs/pr/{TICKET-ID}-pr-description.md`; otherwise the description is the PR body and no
file is created. Do not invent a documentation path a repository does not already use.

## 7. Scope and stop conditions

- Do not introduce anything the ticket did not ask for.
- Do not refactor unrelated code. Code quality is fixed *within the diff you already have*
  (§2); anything larger is a separate ticket.
- Do not change a public contract unless the acceptance criteria require it.
- Do not weaken or delete a test to make a build pass.

**Stop, write down the problem, and ask — before writing code — when:**

- the acceptance criteria conflict with each other, or with a principle;
- delivering them requires a second service's database, a kernel change carrying domain,
  or any other principle-level deviation;
- the change needs a public contract change that the ticket does not mention;
- the existing behaviour you are about to modify has no test and you cannot tell what it
  was meant to do.

Ambiguity resolved silently is the most expensive kind. Ambiguity raised early costs one
message.

## 8. Failure modes

| Symptom | Cause |
|---|---|
| Review finds an architectural violation the author did not see | Pre-analysis skipped the guide for a domain the change touched, so the pattern was reinvented instead of recalled |
| The diff is correct but touches files nobody expected | The end-to-end trace in §1 was never written down, so scope was discovered by editing |
| A red build appears mid-implementation and its origin is unclear | The starting state was never proven green, so an inherited failure is now mixed into the diff |
| Tests pass, then the same path breaks in the next ticket | New branches were covered but existing affected paths got no regression test |
| The suite is green and the release is not safe | Tests were written at the wrong layer — a browser test standing in for a validator test, or a mocked integration test standing in for a migration |
| A manual test document exists for every ticket and nobody reads any of them | §4's condition was treated as a formality instead of a filter |
| A deviation from the architecture is discovered months later, with no record of a decision | It was patched around silently rather than recorded under §5 |
| A schema change works locally and fails on deploy | Schema was applied by `EnsureCreated` or by hand instead of a migration (P4) |

## 9. Checklist

- [ ] Constitution and guides confirmed readable before the first edit; stopped and said so if not
- [ ] The analysis phase's table and risk list read as input, not re-derived
- [ ] Every rule-shaped statement in the output cites a principle or a guide section
- [ ] Build and existing tests proven green *before* any edit
- [ ] Owning bounded context named; layers touched identified; the guide loaded for each
- [ ] Flow traced end to end; every file to be changed named in advance
- [ ] Existing tests at the logic-bearing layer identified
- [ ] Kernel free of domain; database ownership intact; schema moved by migration
- [ ] No secret in source, config or comment; configuration through the environment
- [ ] New optional dependency degrades, is health-reported and appears in the startup banner
- [ ] `Program.cs` still a manifest; extension points are interfaces in DI
- [ ] New endpoint: right trust group, validation filter, list clamped, uniform error shape
- [ ] New outbound call: resilience handler, explicit timeout, no retry of an indeterminate write
- [ ] Observability covers the new path
- [ ] Formatting left to `.editorconfig`, not hand-applied
- [ ] Tests at the layer holding the logic; E2E charter respected; per-test bar cleared
- [ ] Regression tests for every existing affected path; characterisation tests before any behaviour move
- [ ] Every committed test config is executed by some CI context
- [ ] Manual test document written only if §4's condition is met — and to the guide's discipline if so
- [ ] Decisions and deviations recorded in `docs/`; no claim in the repository left untrue
- [ ] PR description: what, why, grouped changes, test results, deviations, out of scope
- [ ] Commit message references the ticket ID
- [ ] No file changed outside the set named in pre-analysis

---

Generated from [`docs/delivery/IMPLEMENTATION-PHASE.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/IMPLEMENTATION-PHASE.md) by `scripts/build-marketplace.mjs`. Do not edit this file: change the source document, or its entry in `catalog/marketplace.catalog.json`, and re-run the generator.
