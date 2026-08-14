# Building an E2E acceptance suite worth trusting

An E2E suite that reports green while testing nothing is worse than no suite at all,
because it is *trusted*. No suite prompts someone to check manually before a release;
a suite with 447 passing tests does not. This guide is the operational half of P13 —
what makes an E2E suite a real regression net rather than a green checkmark generator —
extracted after a full audit of `<saas>.AcceptanceTests` found it was the
latter.

It is deliberately repo-agnostic. The worked example throughout is that audit — cited by
file and line, the way the rest of this estate's guides cite working code — except here
every citation is a failure mode to avoid, not a pattern to copy. That asymmetry is
itself the point: this repo's other guides show what to imitate; this one shows what a
plausible-looking suite looks like when nobody checked it against reality.

**Contents**

1. [The audit that motivated this guide](#1-the-audit-that-motivated-this-guide)
2. [The one rule: a test may not pass without checking anything](#2-the-one-rule-a-test-may-not-pass-without-checking-anything)
3. [Locators: pick a convention before the first component ships](#3-locators-pick-a-convention-before-the-first-component-ships)
4. [Waiting: web-first assertions only, and verify your framework agrees](#4-waiting-web-first-assertions-only-and-verify-your-framework-agrees)
5. [Independence, cleanup, and parallelization have to agree with each other](#5-independence-cleanup-and-parallelization-have-to-agree-with-each-other)
6. [CI wiring is part of "done," not a follow-up](#6-ci-wiring-is-part-of-done-not-a-follow-up)
7. [One canonical suite per live frontend](#7-one-canonical-suite-per-live-frontend)
8. [Auditing a suite you inherited, especially an AI-bulk-generated one](#8-auditing-a-suite-you-inherited-especially-an-ai-bulk-generated-one)
9. [Checklist](#9-checklist)

---

## 1. The audit that motivated this guide

`<saas>.AcceptanceTests` holds 447 xUnit/Playwright tests generated in a
single push (first commit, 2026-02-13), self-described in its own delivery docs as
"500+ hours of test design... Production Ready." A 2026-08-14 audit of the actual test
bodies — not the docs describing them — found:

- **196 occurrences of a commented-out test body** ("`// Placeholder assertion`") across
  36 files, and **186 separate occurrences** of `if (await x.CountAsync() == 0) { return; }`
  immediately before the one line that would have exercised the feature — a guard that
  makes a missing element and a broken feature both read as a silent pass. Several files
  combine both patterns. `QuotaEnforcementTests.cs` — the paid-tier enforcement logic for
  a SaaS product, i.e. its monetization boundary — is 9/9 tests non-functional this way.
- **45 occurrences** of `try { await assertion; } catch { /* acceptable for placeholder
  test */ }` — cases where the real assertion runs, but any failure is discarded rather
  than reported.
- A **mechanical API-misuse bug**, not a coverage gap: `Locator("button").Filter(new()
  { HasText = "theme, dark, light, sun, moon" })` reads as "match any of these words" but
  Playwright's `HasText` matches one substring — this locator can never match anything a
  real app would render, in any state. 13 call sites across 6 files depended on it,
  silently disabling every test built on top of them regardless of whether the feature
  underneath worked.
- A custom "web-first" assertion wrapper whose `timeoutMs` parameter was accepted but
  never read by 5 of its 7 assertion methods — each called the underlying Playwright
  getter exactly once, with no retry loop, while looking identical at the call site to
  the 2 methods that retried correctly.
- **Zero wiring to CI, in either repo, ever.** No workflow in the app repo or the test
  repo references `e2e`, `playwright`, or `acceptance`. The product repo's own
  `docs/test-automation-analysis.md` admits it in a table: *"E2E Tests | Not automated |
  Full suite ready but not integrated."* The suite had been runnable only by a developer
  manually starting the frontend and running `dotnet test` — and the last commit to
  either repo predates this audit by five months.
- The suite's **own prior self-audit already named most of this** (`MASTER_PROMPTS.md`,
  landed 2026-03-05, asked "are these a real regression net or happy-path theatre?" and
  proposed a per-scope refactor). Of 8 proposed follow-up issues, exactly **1 was ever
  executed** — and executing it created a second, smaller, differently-configured test
  project instead of refactoring in place, because nobody had first decided that in-place
  was what "refactor" meant.

None of this means the team writing it was careless in a way this guide can wave away as
someone else's problem — several files audited the same day (`RegistrationTests.cs`,
`AccountDeletionTests.cs`, `ProfileEditTests.cs`) are genuinely well-built, with
unconditional assertions and real state round-trips. The suite is not uniformly bad; it
is **unverified**, and unverified at scale looks identical to green from the outside.
That gap — between "the test ran and reported pass" and "the test would have failed if
the feature broke" — is what every rule below exists to close.

## 2. The one rule: a test may not pass without checking anything

Every other rule in this guide is downstream of one invariant: **a passing `[Fact]` must
have executed at least one assertion against real application state, unconditionally, on
every run.** Three specific patterns violate it and should be treated as build-breaking
if seen in review, not style nits:

**Guard-then-bail.** `if (await locator.CountAsync() == 0) return;` placed before the
assertion means "skip this test if the feature isn't there" — which is indistinguishable
from "skip this test if the feature broke." If a scenario is genuinely conditional (e.g.
a premium-only element), assert the *absence* explicitly for the free-tier path and the
*presence* explicitly for the premium-tier path — two real assertions, not one guard.

**Swallowed assertion failures.** `try { await x.Should().BeVisibleAsync(); } catch { }`
— if an assertion can be allowed to fail without failing the test, it isn't an assertion,
it's a comment with extra steps. Delete the try/catch or delete the assertion; don't keep
both.

**Silent placeholders.** A test body that is entirely commented out, or a `[Fact]` with
no assertion at all, reports the same green checkmark as a test that verified something.
If a scenario isn't implemented yet, say so where the test runner can see it:

```csharp
[Fact(Skip = "Blocked on multi-user session support in PlaywrightTestBase — see #123")]
public async Task Should_AcceptOrganizationInvitation() { ... }
```

`[Fact(Skip = "reason")]` (or the framework's equivalent — MSTest's
`[Ignore("reason")]`, a `[Trait("status", "scaffold")]` filtered out of the CI run) costs
nothing and turns "447/447 passed, uniformly opaque" into "301 passed, 146 skipped with
reasons," which is the honest number. A suite with no skip/trait mechanism in use at all,
the way the reference SaaS's did, cannot distinguish a real test from a scaffold at the CI
level even if every author knew the difference while writing it.

**Once a test has a real assertion, that only proves it can pass — not that it can catch
anything.** A test that asserts `response.Should().NotBeNull()` against an endpoint that
never returns null passes today and will keep passing through almost any regression. The
2026-standard way to check the difference is mutation testing: a tool deliberately
introduces small faults into the application code (flips a `>` to `>=`, deletes a
guard clause, inverts a boolean) and reruns the suite against each mutant — a test
suite worth trusting kills the large majority of mutants; one that doesn't is asserting
the wrong things, or not enough of them. `Stryker.NET` is the .NET tool for this (JS/TS:
Stryker; Java: PIT; Rust: cargo-mutants). This is a heavier check than §9's
checklist and doesn't need to gate every PR — run it after an assertion-discipline pass
like this one, as the actual proof the pass worked, and periodically afterward as a
suite-health signal rather than a per-commit gate.

## 3. Locators: pick a convention before the first component ships

State it once, per system, and enforce it in review. Playwright's own guidance — and the
2026 consensus generally — ranks accessible locators above `data-testid`, not below it,
because they double as an accessibility check and don't need any component change to
exist; reach for `data-testid` as the deliberate fallback for the elements that have no
reliable accessible name, not as the default for everything:

| Preference | Example | Breaks when |
|---|---|---|
| **1st — role + accessible name** | `GetByRole("button", new(){Name="Save"})` | Copy changes (often desirable to catch) or the element's ARIA role changes |
| **2nd — label / placeholder / text** | `GetByLabel("Email")`, `GetByText("Upgrade to Premium")` | Copy changes |
| **3rd — `data-testid`, for what the above can't reach** | `[data-testid="prompt-save-button"]` | Never, by design — but only covers what it was added for |
| **Avoid — CSS class chains, DOM traversal** | `.card[tabindex='0'] .modal button.relative.rounded-full` | Any styling refactor, with no relation to behavior |

the reference SaaS's frontend has **zero** `data-testid` attributes anywhere in any of its
four Next.js apps, despite the test repo's own strategy doc listing `data-testid`
attributes as the preferred selector and listing "replace fragile selectors with
`data-testid`" as an open backlog item since March. The convention was written down and
never enforced at the one point it's cheap to enforce: when the component is first built.
Retrofitting it later means finding every place a test already depends on a class name or
DOM position and changing both sides at once — the cost compounds with every test written
against the fragile selector in the meantime. If a system's tests will be written in a
separate repo or by a separate team from the frontend, whichever locator convention is
chosen needs to be a contract between them from day one, not a review comment discovered
months in. In this case the pragmatic starting point costs nothing: most of the suite's
existing `GetByRole`/`ClickButtonAsync(text)` calls already follow rule 1 without anyone
having decided to; the gap is the CSS-chain minority (§9), not a missing `data-testid`
rollout.

**Don't re-authenticate through the UI in every test.** Playwright's `storageState` saves
a logged-in context's cookies/localStorage once and lets subsequent tests start from it
directly — skipping the login form entirely. Beyond the obvious speed win, it removes the
login flow itself as a source of unrelated flakiness: a suite where 300+ tests each drive
a real registration or login form means a broken login page fails 300 tests with one root
cause, and a slow-but-working login page makes every other test slower and more prone to
timing out for reasons that have nothing to do with what that test is actually checking.
Keep a handful of tests that exercise the real login/registration UI directly (that *is*
the feature under test for those); have everything else start from saved state.

## 4. Waiting: web-first assertions only, and verify your framework agrees

Fixed sleeps (`Thread.Sleep`, `Task.Delay`, `WaitForTimeoutAsync(60000)`) are a tell that
someone hit real flakiness and reached for the wrong fix. The correct fix is an
auto-retrying assertion that polls until it passes or times out — Playwright's own
`Assertions.Expect(locator).ToBeVisibleAsync()`/`ToHaveTextAsync()`/etc., or an equivalent
your framework provides. The reference SaaS's own code shows both instincts side by side:
`LogoutTests.cs` uses a correct polling wait for one redirect check and a `WaitForTimeoutAsync(2000)`
five lines later for a second one in the same test — proof the fix was known and just not
applied consistently. A repo-wide grep for the fixed-sleep APIs in CI (or a pre-commit
hook) turns "know the right pattern" into "always use the right pattern."

**Verify any custom assertion wrapper actually retries, by reading its body, not its
signature.** A wrapper that accepts a `timeoutMs` parameter looks safe at every call site;
whether it's safe depends on whether that parameter reaches a retry loop or is silently
ignored. The reference SaaS's `LocatorAssertionsExtensions` did the former for 2 of its 7
methods and the latter for the other 5 — indistinguishable from the call site, and the
kind of bug that only shows up as occasional, hard-to-reproduce flakiness in the tests
that happened to call the broken half.

**Know your framework's actual semantics for the primitives you build helpers on top of.**
Playwright's `Locator.Filter(new(){ HasText = "a, b, c" })` matches one literal substring,
not a comma-delimited OR list — a natural thing to assume it does, and wrong. This class
of bug (an API used with the semantics you'd want it to have, rather than the semantics it
actually has) is worth a specific grep pass over any helper that builds locators from a
list or delimited string, because it fails silently: the code compiles, the test runs, and
the guard-then-bail pattern in §2 quietly reports the resulting always-empty match as
"feature not present" instead of "locator is broken."

## 5. Independence, cleanup, and parallelization have to agree with each other

**Independence and cleanup are two different properties; a suite needs both.** Generating
a fresh account/org per test (`test.user.{guid}@example.com`) gets you independence —
tests don't collide with each other's data. It does not get you cleanup: nothing deletes
that account afterward, and a suite run repeatedly against a persistent (non-ephemeral)
environment accumulates orphan data without bound. Decide explicitly which property a
given environment gets from *environment* reset (ephemeral per-run database) versus which
it needs from *test* teardown (an `IAsyncLifetime.DisposeAsync` that deletes what it
created) — don't assume the former makes the latter unnecessary unless the environment is
actually, mechanically guaranteed to be thrown away after the run.

**Parallelization settings and actual test behavior have to be checked against each
other, not just declared.** A config flag (`"parallelizeTestCollections": true,
"maxParallelThreads": 4`) plus a handful of unused `[CollectionDefinition]` declarations
is not a parallelization strategy, it's the appearance of one. The reference SaaS declared
7 named test collections; 6 had zero member classes, meaning every class in those 6 was
implicitly its own parallel unit by default, running concurrently with up to 3 others
against one shared app instance. The one class that actually needed serialization — the
one using a single hard-coded shared seeded login account instead of a generated one —
correctly opted into it and left a comment explaining why. That the risk was understood
for one file and not generalized to a rule ("any test using shared/seeded rather than
generated state must declare a collection") is the actual gap; the fix is a lint-style
review check, not more collections.

## 6. CI wiring is part of "done," not a follow-up

A suite that only runs when a developer remembers to start the frontend locally and type
`dotnet test` provides exactly the protection of a suite that doesn't exist, with the
added cost of maintaining it and the added risk that its existence gets cited ("we have
447 E2E tests") as evidence of coverage that isn't actually being checked by anyone,
ever. Treat CI wiring as a requirement of test #1, not a nice-to-have after test #447 —
in practice this means:

- **Don't try to boot the whole stack inside the CI runner** for a multi-service Aspire
  system. This estate already provisions ephemeral, fully-deployed PR environments as
  part of the tag-driven pipeline (P12; see
  [`FLY-IO-DEPLOYMENT.md`](FLY-IO-DEPLOYMENT.md) §"PR environments" —
  `flyio-pr-env-deploy.yml` / `-destroy.yml`). Point the E2E job at that environment's URL
  instead of re-deriving a docker-compose-in-CI setup from scratch; the environment
  already exists for exactly this purpose and is already torn down automatically.
- **Run a small, fast smoke subset on every PR** (the audited suite's own strategy doc
  targeted 5-10 minutes and ~7 critical-path scenarios — a reasonable design that was
  simply never implemented) and the full suite less frequently (nightly, or pre-release)
  if its runtime doesn't fit in PR feedback loops.
- **A base URL default has to match what's actually orchestrated, and that match has to
  be re-verified whenever a port changes.** The reference SaaS's own `AppHost.cs` is the
  single source of truth for what runs on which port; the test project's compiled-in
  fallback default had drifted to a port matching no currently-orchestrated app, while the
  runsettings file developers are actually told to use had (correctly) been updated.
  Inconsistent defaults across a compiled fallback, a settings file, and a setup script are
  a sign nobody has run the suite in a while — reconcile them to one source of truth,
  ideally read from the same place the deploy pipeline gets it.

## 7. One canonical suite per live frontend

When a frontend is redesigned or renamed, retire (or explicitly, visibly archive) the old
test project **in the same change** that the new frontend replaces the old one. Letting
both drift independently is how the reference SaaS ended up with two Playwright projects in
one repo — `Web.NextJs.E2ETests` (447 tests, targeting a frontend called "Web.NextJs" that
no longer exists as a distinct codebase) and `Web.Portal.E2ETests` (53 tests, correctly
targeting the current live app, "Portal," which was built to reach feature parity with
NextJs and then replaced it) — with no record anywhere of which one a new contributor
should trust. Neither name told you which was current; only reading `AppHost.cs`'s port
assignments against each project's configured base URL did. A single redirect/archive
note written the day the frontend was renamed costs one sentence; reconstructing the same
fact five months later costs a multi-repo investigation.

This doesn't mean the old suite's tests are worthless the moment the frontend is renamed
— if the redesign targeted feature parity (same routes, same behavior, different CSS),
well-built role/accessible-name-based tests from the old suite often still pass unchanged
against the new frontend, while CSS-class-based ones won't. That's a reason to **triage
and port** the old suite's good tests to target the new app under its new project, not a
reason to leave both projects sitting side by side indefinitely as if they were both
current.

## 8. Auditing a suite you inherited, especially an AI-bulk-generated one

A test suite generated in one large pass — by a person working fast or an AI agent asked
to "write comprehensive E2E tests for this app" — needs a fact-checking pass before
anyone treats its test count or its own documentation as ground truth. Concrete,
mechanical tells worth grepping for specifically, each one found in the reference SaaS's
suite:

- **Impossible or inconsistent dates.** Delivery docs stamped "December 2024" in a repo
  whose git history begins February 2026. A hallucinated date is a strong signal nothing
  in the surrounding document was checked against reality either.
- **Self-contradicting counts.** One doc claiming "7 documentation files" while its own
  neighboring table says "6"; a per-file test count claimed as 7 when the file contains 1.
  Actual counts (`grep -c` for `[Fact]`/`[Test]`/etc., `ls | wc -l`) taking thirty seconds
  to verify and disagreeing with the prose is worth treating as suite-wide evidence, not
  an isolated typo.
- **A "bug fix" document for a bug that isn't in the code.** The reference SaaS's suite
  carried a doc titled around a `.FirstOrDefault` issue (invalid on the type it claimed to
  be called on) whose own code samples showed the "wrong" pattern as valid, unrelated
  syntax — the described problem never existed; a real-looking artifact with zero
  grounding.
- **References to files, folders, or tools that don't exist in the repo.** A pipeline doc
  written for Azure DevOps in a repo whose only CI is GitHub Actions; references to a
  `tests/e2e/` TypeScript folder nowhere on disk. Treat any planning document as
  provisional until you've confirmed the paths and tools it names actually exist.
- **Inflated confidence language uncorrelated with content** ("Production Ready," "500+
  hours of test design," "COMPLETE") sitting next to the actual placeholder count. Confidence
  claims in AI-generated or AI-assisted documentation are not evidence; only the code is.

None of this is a reason to distrust AI-assisted test generation categorically — it's a
reason to budget a verification pass as part of accepting the work, the same way a
migration's generated SQL gets reviewed before running against production. The
verification pass is cheap relative to the suite; discovering the gap five months later,
the way this audit did, is not.

## 9. Checklist

A suite claiming to be a real regression net answers yes to all of these:

- [ ] Every passing `[Fact]`/`[Test]` executes at least one unconditional assertion
      against real application state — no guard-then-bail before the only assertion, no
      swallowed assertion failures
- [ ] Anything not yet implemented is `[Fact(Skip="reason")]` (or the framework
      equivalent), never a silently-passing placeholder
- [ ] Locators prefer role/accessible-name first, `data-testid` as the deliberate
      fallback where no accessible name exists; the convention was agreed before the
      first component shipped, not retrofitted
- [ ] No fixed sleeps as the primary wait strategy; any custom assertion-wait helper has
      been read (not just trusted by its signature) to confirm it actually retries
- [ ] Tests that don't specifically exercise login/registration start from a saved
      `storageState` rather than driving the login form every time
- [ ] Mutation testing (Stryker.NET or equivalent) has been run at least once after any
      assertion-discipline pass, to confirm the real assertions actually catch broken code
- [ ] Any locator built from a list/delimited string has been checked against the
      framework's actual matching semantics, not the semantics that seemed intuitive
- [ ] Test data generation (independence) and test data teardown (cleanup) are both
      handled, deliberately, for the environment the suite actually runs against
- [ ] Declared parallelization safeguards have real member tests; anything relying on
      shared/seeded (not generated) state is verified to be serialized
- [ ] The suite runs automatically — PR smoke subset at minimum — against an environment
      this estate's pipeline already provisions, not only by a developer's local `dotnet test`
- [ ] Exactly one canonical suite targets each live frontend; a retired/renamed frontend's
      old suite is archived or ported in the same change, not left to drift
- [ ] If inherited or bulk-generated, its own counts and claims have been spot-checked
      against the actual code before being trusted

---

## Provenance

Extracted 2026-08-14 from a full audit of `<saas>.AcceptanceTests` (447 tests,
`<saas>.Web.NextJs.E2ETests` + `<saas>.Web.Portal.E2ETests`), cross-
referenced against the reference SaaS's actual frontend orchestration (`AppHost.cs`) and
CI configuration (`.github/workflows/pr-validation.yml`), and checked the same day against
current external practice (Playwright's own locator guidance, and 2026 industry writing on
verifying AI-generated test suites, which independently converged on the same "tests that
pass without asserting anything" failure mode this audit found) — §3's locator ordering,
the `storageState` guidance, and §2's mutation-testing paragraph came from that pass. The
audit's full findings and the resulting repo-specific remediation plan live in that repo's own
`E2E_Tests_analysis.md`, per this estate's convention that per-system findings stay in the
system's own repo (see [`PLAYBOOK.md`](../PLAYBOOK.md) — "Output conventions") while only
the generalized rule moves here.
