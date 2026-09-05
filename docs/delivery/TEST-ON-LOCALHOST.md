# Exercising the API on localhost

A black-box pass against the API **already running on your machine**, to see the change
you just made behave over HTTP rather than only in a test runner.

It does two things and refuses the rest: it **does not start the application**, and it
**does not edit code**. If nothing is listening, that is the finding — say so and stop.
A skill that starts the app on your behalf hides which configuration was actually under
test, which is the one fact a manual pass exists to establish.

Optional, and paid for by the ticket: run it when the change is worth seeing over the wire
— a new or changed endpoint, a response shape, a status code, an auth path. A change with
no HTTP surface does not need it.

Sits alongside [`IMPLEMENTATION-PHASE.md`](IMPLEMENTATION-PHASE.md), after its §3 tests are
green and before its §6 pull request. [`CLOUD-TEST.md`](CLOUD-TEST.md) is the same pass
against a deployed environment. [`WORKFLOW.md`](WORKFLOW.md) is how the phases fit
together.

**Contents**

0. [The standards have to be in front of you](#0-the-standards-have-to-be-in-front-of-you)
1. [Resolve the addresses from the solution, never from memory](#1-resolve-the-addresses)
2. [Preflight: the right thing is running, and what is degraded](#2-preflight)
3. [Choose what to exercise](#3-choose-what-to-exercise)
4. [Running the pass](#4-running-the-pass)
5. [Reading a failure](#5-reading-a-failure)
6. [The results document](#6-the-results-document)
7. [What this pass is not](#7-what-this-pass-is-not)
8. [Failure modes](#8-failure-modes)
9. [Checklist](#9-checklist)

---

## 0. The standards have to be in front of you

Confirm you can open [`00-REFERENCE-ARCHITECTURE.md`](../architecture/00-REFERENCE-ARCHITECTURE.md)
and [`SERVICE-API-PATTERNS.md`](../guides/SERVICE-API-PATTERNS.md) — because
`architecture-core@architecture-standards` is installed, or this repository is attached.
**If you cannot, stop and say so.** Most of what this pass asserts is not "did it return
200" but "did it return *the shape this estate contracts for*", and that shape is written
down: the uniform 429 body, the validation 400, the clamped list, the 202 job. Without the
guide there is nothing to assert against and the pass degrades into clicking.

**Every observation cites its source.** A response called wrong names the principle or the
guide section that makes it wrong. A response that is merely surprising is recorded as
surprising, not as a violation.

## 1. Resolve the addresses

The addresses come **from the solution**, because the solution already declares them. P1
makes the Aspire `AppHost` the composition root: it names every resource the system needs
and the edges between them. Read it rather than guessing a port.

In order, stopping at the first that answers:

1. **The AppHost project** — which services exist, what each is called, which are proxied,
   and which have a pinned port. P1 is explicit that *externally-contracted ports do not
   float*: anything a third party configures by hand is fixed, and that fixed value is the
   one to use.
2. **`launchSettings.json`** for the service you are exercising — the profile's
   `applicationUrl` is the address the process actually binds when run directly.
3. **The Aspire dashboard**, if the AppHost is what is running: it lists the live endpoint
   per resource, which beats any file when the two disagree.

Two rules that save a wasted pass:

- **Never carry an address over from a previous session.** Proxied ports move.
- **Never reuse these addresses for anything deployed.** P1 says the AppHost is not the
  production topology — its `IsPublishMode` branch is a manifest generator, not a second
  runtime. Deployed environments are [`CLOUD-TEST.md`](CLOUD-TEST.md)'s job, and its target
  is a parameter for exactly this reason.

State the resolved base URL, and where you read it from, before the first request.

## 2. Preflight

Three questions, in this order, before any endpoint of your own.

**Is it up?** `GET /health` (readiness) and `GET /alive` (liveness) exist on every service
in this estate — the compliance checklist requires them. A non-200 here means the pass is
over: report that, do not start diagnosing endpoints behind a service that is not ready.

**What is degraded?** The health endpoint reports the state of **every optional
integration**, and the startup banner prints the same list (P8). Capture that list *now*,
before testing. It is the difference between "the endpoint is broken" and "the endpoint is
correctly degrading because an optional dependency is not configured locally" — and P8 says
the second is expected behaviour, not a bug. A pass that skips this step reliably files the
second as the first.

**Is it your code?** Confirm the running process is the build you just changed — a service
started before your last edit is the most common source of a mystifying result. Where the
service exposes a version or build identifier, record it; otherwise note when the process
was started relative to your last build.

## 3. Choose what to exercise

From the ticket, not from the API surface. The cases worth a request:

- **One per acceptance criterion** that has an HTTP surface — this is the same list
  [`TICKET-ANALYSIS.md`](TICKET-ANALYSIS.md) §2 produced, so take it from there.
- **The regression case**: the behaviour that existed before your diff and must still hold.
- **The contract cases**, which are where this estate's shapes get checked
  (`SERVICE-API-PATTERNS.md`): a validation failure returns the 400 the validation filter
  produces; a list endpoint clamps `page`/`limit` rather than accepting anything; a rejected
  request returns the uniform `429` with `retryAfter` sourced from the limiter; a 202 job
  returns its progress shape.
- **The negative cases** the ticket implies: not found, unauthorised, forbidden.

Do not sweep the whole API. An unfocused pass costs the same as a focused one and proves
less, because nobody reads a hundred rows.

## 4. Running the pass

One request per case, recorded as you go. Use the notation from
[`TESTING-STRATEGY.md`](../guides/TESTING-STRATEGY.md) §7 so the result reads like every
other manual pass in the estate: `[x]` passed, `[FAIL: #ticket]` failed with the issue
raised, `[SKIP: reason]` not run and why.

For each case record the request (method, path, and the input that matters), the status
code, and only the response fields the case is about. A whole response body pasted into a
document is noise, and — see §6 — is how a token or a real email address ends up committed.

Two rules about credentials, from P5 and the repository's own secret scanning:

- **The token comes from the environment**, never typed into the command inline.
- **The token never reaches the transcript or the document.** Not in a header, not in a
  copied `curl`, not "redacted" by hand afterwards.

## 5. Reading a failure

Triage before filing, because three of these are not bugs in your change:

| What you see | Check this first |
|---|---|
| 5xx on an endpoint touching an integration | §2's degraded list. P8 says an optional dependency that is unconfigured should *degrade*, not fail — so a 500 here is a P8 finding, and a graceful fallback is correct behaviour |
| 401 / 403 everywhere | The token, its issuer and its audience. Services validate against the identity service's JWKS rather than minting their own — a locally-minted or stale token fails exactly like a broken endpoint |
| 429 quickly | You. Rate limiting partitions by authenticated user (`SERVICE-API-PATTERNS.md` §1), so a fast loop rate-limits *you* — slow down rather than filing it |
| A shape that differs from the guide | A real finding, and the most valuable kind this pass produces: cite the guide section it violates |
| Behaviour that differs from the ticket | A real finding. Name the acceptance criterion it fails |

When it is a real finding, say which layer owns it (P13): a wrong calculation is the
domain's, a wrong status code is the endpoint's, a wrong persisted value is persistence's.
That sentence is what makes the fix land in the right place and the regression test land at
the right layer.

## 6. The results document

Write it only if it will be read: attached to the pull request, or recording a failure
someone else must reproduce. A green pass on a change already covered by automated tests is
worth two lines in the pull request, not a committed file.

When it is worth writing, put it where the repository already keeps manual test material —
alongside the plan from [`IMPLEMENTATION-PHASE.md`](IMPLEMENTATION-PHASE.md) §4 — and
timestamp it, because a results document without a time is unfalsifiable. Include the base
URL and where it was resolved from, the build under test, the degraded-integration list
from §2, one row per case in §4's notation, and the findings with their layer and citation.

**What must never be in it**, and this is not a style preference — the repository runs
secret scanning in CI and a pre-commit hook, and this document is the most likely thing in
the whole flow to trip them:

- tokens, `Authorization` headers, cookies, connection strings, keys;
- real user data from a seeded or shared database — names, emails, anything personal;
- a full response body pasted "for completeness".

If a value is needed to explain a finding, describe its shape rather than reproducing it.

## 7. What this pass is not

It is not a test suite, and treating it as one is how suites rot.

A regression found here becomes **a test at the layer that holds the logic** (P13) before
the pull request is opened — not a paragraph in a document that someone is expected to
re-run by hand every release. `TESTING-STRATEGY.md` §1 is explicit that E2E exists for
protected flows and cross-service integration, and *not* to re-check things a unit test
already answers; a manual pass sits even further from that charter.

The lasting output of this pass is therefore usually a test, and only sometimes a document.

## 8. Failure modes

| Symptom | Cause |
|---|---|
| The pass tests an address that is not the running service | The port was remembered or guessed rather than read from the AppHost or `launchSettings.json` (§1) |
| A correctly degrading endpoint is filed as a 500 bug | §2's health check was skipped, so the optional-integration state (P8) was never captured |
| Everything fails and the service is fine | The process under test predates the last build, or the token is stale — both are §2 questions |
| A green pass, and the same bug ships | The pass exercised the happy path only; the regression and contract cases in §3 were skipped |
| A finding nobody can act on | No layer named (P13) and no citation, so it reads as an impression rather than a defect |
| The secret scanner blocks the commit | A header, token or full response body reached the results document (§6) |
| The same manual pass is re-run every release | A regression found here was written down instead of turned into a test (§7) |

## 9. Checklist

- [ ] Constitution and `SERVICE-API-PATTERNS.md` confirmed readable; stopped and said so if not
- [ ] The application was already running; nothing here started it, and no code was edited
- [ ] Base URL resolved from the AppHost, `launchSettings.json` or the dashboard — and stated, with its source
- [ ] `/health` and `/alive` checked before anything else
- [ ] Optional-integration state captured from the health payload before testing (P8)
- [ ] The running build confirmed to be the code under test
- [ ] Cases drawn from the acceptance criteria, plus regression, contract shapes and negatives
- [ ] Credentials read from the environment; no token in a command, transcript or document
- [ ] Each case recorded in `[x]` / `[FAIL: #ticket]` / `[SKIP: reason]` notation
- [ ] Failures triaged against §5 before being filed
- [ ] Each finding names the owning layer (P13) and cites the principle or guide section
- [ ] Results document written only if it will be read; timestamped; free of tokens, personal data and full bodies
- [ ] Every regression found here turned into a test at the layer holding the logic before the PR
