---
name: cloud-test
description: >-
  Use when exercising an API against a deployed environment — a preview, a
  shared non-production environment, or anything else reachable over the
  network. The target base URL is passed in and echoed back, never derived
  from a naming convention, because a guessed host either wastes the pass or
  hits the wrong environment. Read-only by default: writes need authorising in
  that run, irreversible operations need confirming one at a time, and
  production stays read-only regardless. Confirms the deployed build actually
  contains the change before trusting any result, captures degraded optional
  integrations, and accounts for scale-to-zero cold starts. Credentials come
  from the environment and never reach a document; neither do real users' data
  or full response bodies. Never deploys and never edits code.
argument-hint: "[base-url]"
disallowed-tools: "Edit, NotebookEdit"
---

# Exercising the API on a deployed environment

The same black-box pass as [`TEST-ON-LOCALHOST.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/TEST-ON-LOCALHOST.md), against a
**deployed environment whose URL you pass in**. Everything that document says about
resolving cases from the ticket, the notation, and turning findings into tests still
applies; this one covers what changes when the thing on the other end is real, shared, and
not yours alone.

It **does not deploy**, it **does not edit code**, and by default it **does not write
data**. The target is a parameter, never a convention.

Three things separate this from a local pass, and all three are ways to do damage rather
than to miss a bug: the environment is shared, the data may be real, and the credentials
are real. The rules below exist for those three.

**Contents**

0. [The standards have to be in front of you](#0-the-standards-have-to-be-in-front-of-you)
1. [The target is a parameter](#1-the-target-is-a-parameter)
2. [Read-only until told otherwise](#2-read-only-until-told-otherwise)
3. [Preflight: what is actually deployed there](#3-preflight)
4. [Credentials](#4-credentials)
5. [Running the pass](#5-running-the-pass)
6. [Reading a failure](#6-reading-a-failure)
7. [The results document](#7-the-results-document)
8. [Failure modes](#8-failure-modes)
9. [Checklist](#9-checklist)

---

## 0. The standards have to be in front of you

Confirm you can open [`00-REFERENCE-ARCHITECTURE.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/architecture/00-REFERENCE-ARCHITECTURE.md),
[`SERVICE-API-PATTERNS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/SERVICE-API-PATTERNS.md) and
[`SECURITY-REVIEW.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/SECURITY-REVIEW.md) — installed as
`architecture-core@architecture-standards`, or attached. **If you cannot, stop and say so.**

**Every observation cites its source**, and on a deployed environment that matters more
than locally: a finding filed against a shared environment costs other people's time to
reproduce, so one that cannot be traced to a principle or a guide section should not be
filed as a defect at all.

## 1. The target is a parameter

**The base URL is passed in. It is never derived from a naming convention, and never
guessed from an environment name.** A guessed host has two outcomes and both are bad: it
does not resolve and the pass is wasted, or it resolves to *a different environment than
the one intended* and the pass is worse than wasted.

Before the first request:

- **Echo the target back** — the full base URL, exactly as given.
- **Say what you believe it is**, in one line, from the URL alone: which system, and
  whether you take it to be a preview, a shared non-production environment, or production.
  If the name does not tell you, say that instead of assuming; a per-PR preview environment
  and a shared staging environment justify very different behaviour, and the difference is
  not always visible in a hostname.
- **Do not proceed against a target you cannot classify** without the caller saying which
  it is.

If the ticket names an environment but not a URL, ask for the URL. Resolving one from a
convention is exactly the failure this rule exists to prevent.

## 2. Read-only until told otherwise

**Default posture: safe methods only** — `GET`, `HEAD`, `OPTIONS`. That is the whole pass
unless the caller has said, in this run, that writes are allowed against this target.

When writes *are* authorised:

- **Create, do not mutate.** Prefer making a new record over changing an existing one; a
  created record is traceable and usually disposable, a mutated one destroyed something
  that was there before.
- **Never run an irreversible operation** — deletion, cancellation, anything that sends
  mail or money — without the caller confirming that specific operation against that
  specific target. "Writes are allowed" is not that confirmation.
- **Clean up what you create**, and say so if you cannot.
- **Label the data.** A record left behind should be obviously test data on sight.

Two further limits that apply even to a read-only pass:

- **Keep the volume low.** Rate limiting partitions by authenticated user
  (`SERVICE-API-PATTERNS.md` §1), so a fast loop consumes a real user's budget and can
  return 429s to somebody who is not you.
- **Production is not a test environment.** If the target is production, the pass is
  read-only regardless of what was authorised, and anything beyond that is the caller's
  explicit decision, taken with the consequences named.

## 3. Preflight

**Is it up, and what is degraded?** `GET /health` and `GET /alive`, as locally — every
service in this estate exposes both, and the health payload reports the state of every
optional integration (P8). Capture that list before testing: on a deployed environment a
missing optional integration is a *configuration* fact about that environment, and reading
it as a bug in your change is the most common wasted cloud pass.

**Is your change even there?** This is the question that separates a useful cloud pass from
a confusing one. Deployment is tag-driven with change detection (P12), so an environment can
legitimately be running a build that predates your commit. Establish which build is
deployed — a version or build identifier from the service where one is exposed, otherwise
the deployment record — and **if your change is not deployed, stop**. Every result after
that point is about someone else's code.

**Expect the first request to be slow.** The Fly.io topology is cost-shaped and scale-to-zero
is deliberate (P7); only services another service calls in-request keep
`min_machines_running = 1`. A cold start is not a latency finding. Warm the endpoint, then
measure.

## 4. Credentials

- **From the environment, never inline, never in the transcript.** P5: configuration through
  the environment, secrets through the platform. The repository runs secret scanning in CI
  and a pre-commit hook; a token pasted into a command that later reaches a document is the
  most likely way to trip them.
- **Never use a real user's credentials**, and never use production credentials for testing
  — `TESTING-STRATEGY.md` §6 makes that part of the bar for an automated test, and a manual
  pass does not get an exemption.
- **Use a token the target actually trusts.** Services validate RS256 tokens against the
  identity service's JWKS rather than minting their own, so a token issued by the wrong
  environment's issuer fails identically to a broken endpoint — see §6.
- **A token is a bearer credential**: it is as sensitive as a password for its lifetime, and
  it does not belong in a results document, a screenshot, or a pull request comment
  (`SECURITY-REVIEW.md` §4).

## 5. Running the pass

Cases come from the ticket and from what this session changed, exactly as in
[`TEST-ON-LOCALHOST.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/TEST-ON-LOCALHOST.md) §3 — the base URL is the only thing this
phase takes as an argument,
and are recorded in the same `[x]` / `[FAIL: #ticket]` / `[SKIP: reason]` notation from
`TESTING-STRATEGY.md` §7. Two differences worth stating:

- **A case that requires a write is skipped, not improvised**, unless §2 authorised it.
  `[SKIP: read-only pass]` is a complete and honest result.
- **Record the environment and the deployed build on every run.** A cloud result without
  those two facts cannot be compared to the next one, which is most of the value.

## 6. Reading a failure

Everything in `TEST-ON-LOCALHOST.md` §5 applies. The additions are the ones that only
happen once something is deployed:

| What you see | Check this first |
|---|---|
| Slow first request, fast afterwards | Scale-to-zero cold start (P7), not a latency finding |
| 429 | Your own request volume against a per-user partition (`SERVICE-API-PATTERNS.md` §1). Slow down before filing |
| 502 on a service-to-service path | A 3xx from a callee is converted to 502 and logged rather than followed (`SERVICE-API-PATTERNS.md` §5) — the finding is usually the redirect, not the gateway |
| 401 / 403 everywhere | The token's issuer or audience does not match this environment (§4) |
| An integration behaving differently than locally | §3's degraded list — this environment's configuration, not your diff |
| Behaviour differing from the local pass, with everything else equal | The deployed build (§3). Confirm it carries your commit before treating this as real |

A finding that survives that table is a real one. File it with its acceptance criterion or
its citation, the environment, and the deployed build — without those it cannot be
reproduced, and an unreproducible finding against a shared environment tends to be
rediscovered rather than fixed.

## 7. The results document

As in `TEST-ON-LOCALHOST.md` §6 — written only if it will be read, timestamped, and kept
where the repository already keeps manual test material. Two additions, both about the fact
that the responses came from a real system:

- **Record the environment and the deployed build**, at the top. They are what make the
  document mean anything later.
- **Real responses may contain real people.** A shared environment's data is frequently a
  copy of, or adjacent to, production data. Names, email addresses, identifiers and full
  response bodies do not go into a committed document; describe the shape of a value
  instead of reproducing it. This is the rule most likely to be broken by pasting one
  "harmless" example response.

Everything in the local document's exclusion list — tokens, `Authorization` headers,
cookies, connection strings, keys — applies here with more force, because these credentials
are real.

## 8. Failure modes

| Symptom | Cause |
|---|---|
| The pass ran against the wrong environment | The host was derived from a naming convention instead of passed in and echoed back (§1) |
| A whole pass of findings, all invalid | The environment was running a build without the change (§3) |
| Test data left in a shared environment | Writes were run without the create-and-clean-up discipline in §2 |
| Something irreversible happened | "Writes are allowed" was read as blanket authorisation rather than per-operation (§2) |
| Real users got rate-limited during the pass | Request volume against a per-user partition (§2, §6) |
| A cold start filed as a performance regression | Scale-to-zero (P7) not accounted for in §3 |
| A credential or a real person's data ends up in a commit | §7's exclusion list treated as advice rather than a rule |
| The results cannot be compared to last week's | Environment and deployed build not recorded (§5, §7) |

## 9. Checklist

- [ ] Constitution, `SERVICE-API-PATTERNS.md` and `SECURITY-REVIEW.md` confirmed readable; stopped and said so if not
- [ ] Base URL taken from the caller, echoed back, and classified — or the caller asked when it could not be
- [ ] Nothing deployed here; no code edited
- [ ] Read-only unless writes were authorised in this run; irreversible operations confirmed individually
- [ ] Anything created is labelled as test data and cleaned up, or its absence reported
- [ ] `/health` and `/alive` checked; optional-integration state captured before testing (P8)
- [ ] The deployed build confirmed to contain the change; stopped if it did not (P12)
- [ ] Cold start accounted for before any latency observation (P7)
- [ ] Credentials from the environment, not production, not a real user's, trusted by this target
- [ ] Request volume kept low enough not to consume a real user's rate-limit budget
- [ ] Cases in `[x]` / `[FAIL: #ticket]` / `[SKIP: reason]` notation; unauthorised writes skipped, not improvised
- [ ] Failures triaged against §6 before being filed
- [ ] Environment and deployed build recorded on every result
- [ ] Results document free of tokens, credentials, personal data and full response bodies

---

Generated from [`docs/delivery/CLOUD-TEST.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/CLOUD-TEST.md) by `scripts/build-marketplace.mjs`. Do not edit this file: change the source document, or its entry in `catalog/marketplace.catalog.json`, and re-run the generator.
