---
name: session-status
description: >-
  Use when asked where the work stands mid-session, or when picking a session
  back up, and the answer has to be numbers that were just measured rather
  than remembered. Reads the default branch's health first, because a red
  trunk outranks every open item on it and red, green and not-yet-run are
  three states rather than two. Separates merged from open-and-green from
  open-and-red from in-flight from not-started, and names what proves each,
  because "the agent said it was done" is not a state. Classifies what is left
  by who can do it — an agent now, a human only, blocked on another
  repository, blocked on an earlier item here, or a decision the owner must
  take — since a count that mixes a settings click with a code change is a
  number nobody can act on. Closes with the instruments that return a
  plausible answer when nothing happened, from a pending status read off the
  wrong API to a count written in a document. Reports rather than plans, and
  says in the report what it could not establish.
---

# Session status

You are being asked where the work stands. Produce a status report whose every figure comes
from a command run in this turn.

**The single rule this procedure exists for: measure, do not remember.** A long session
accumulates numbers — issues closed, tests passing, the size of a backlog — and every one of
them is true at the moment it is written and decays silently afterwards. A status report
assembled from the conversation is a report about the past. Re-derive everything, including
figures you produced yourself an hour ago.

## Step 1 — is the trunk green?

Before any backlog arithmetic. A red default branch outranks every open item on it, and a
status report that leads with *"23 issues remaining"* while the trunk is broken has buried
the only thing that mattered.

Get the default branch's head and its check conclusions. Report the branch red, green, or
**not yet run** — those are three states, not two, and collapsing the third into either of
the others is how a report becomes confidently wrong.

## Step 2 — what actually landed

For each unit of work claimed as done, establish which of these it is, because they are
routinely conflated:

| State | What proves it |
|---|---|
| **Merged** | the issue is closed AND a merged pull request is linked to it |
| **Open PR, green** | PR open, every check concluded, none failing |
| **Open PR, red or pending** | at least one check failed or has not concluded |
| **In flight** | an agent or a person is working; nothing is pushed |
| **Not started** | nothing exists |

"The agent said it was done" is not a state. Read the diff, not the summary.

## Step 3 — classify what is left by who can do it

This is the half that makes a status report actionable, and it is the half most reports
omit. Remaining work divides into kinds that are not interchangeable:

- **An agent can do it now.** No dependency, no permission, no secret.
- **A human must do it.** Clicking a settings page, creating a credential, deciding a
  licence, approving a spend. No agent can, and listing it beside agent work invites
  somebody to wait for it to happen by itself.
- **Blocked on another repository or team.** Name the blocker and where it lives. An item
  blocked on somebody else is not "in progress".
- **Blocked on an earlier item here.** Name it. A chain of five where the first is blocked
  is one blocked item and four that are not yet real.
- **A decision the owner has to take.** Not work. Say what it decides and what it unblocks —
  and say when a refusal is a complete answer, because a decision with only one permitted
  outcome is not a decision.

A count of "open issues" that mixes these is a number nobody can act on.

## Step 4 — the table

Lead with the table. One row per unit of work, ordered by whatever the repository's own
ordering is if it has one — and if it has one, **that ordering is the source**, not your
reading of it.

| # | What | State | Who can do it | Blocked on |

Then, beneath it, at most a short paragraph per thing that genuinely needs prose: a blocker
worth explaining, a decision waiting on the owner, a finding that changes what should happen
next. Not a narration of what happened.

## Step 5 — say what you could not establish

A status report's credibility is decided here. If a check could not run, if a repository was
out of scope, if an environment limit stopped a measurement — say so, in one sentence, in
the report. An unqualified figure that was actually a guess costs more than the gap it
concealed.

## The instruments that lie, and how they lie

Every one of these returns a plausible answer when nothing happened. They are the reason
this procedure insists on measurement rather than recall: **measuring with a broken
instrument is worse than not measuring, because it produces a number you will then defend.**

- **A pending CI status with `total_count: 0`** may mean the checks have not started, or it
  may mean you are reading the wrong API — a repository using check runs reports nothing
  through the legacy commit-status endpoint. Confirm which mechanism the repository uses
  before reading *nothing ran* as *not started yet*.
- **A green pull request does not mean its new tests ran.** Where the suite is split by tag
  or project, a test tagged for the full layer is not executed by a pull request that runs
  only the fast one. Check that the job actually executed the test whose passing you are
  reporting, by name, in its log.
- **A test can pass against the change removed.** A locator that matches a word occurring in
  the surrounding prose asserts nothing. The only proof is to break the thing deliberately
  and watch that test fail.
- **A workflow that cannot succeed reports as failing, not as misconfigured.** Some actions
  need permissions a workflow token cannot grant itself. A run history of uniform failures
  at one step is a configuration fact, not a flaky job.
- **A poll loop around a command that is not installed is silent.** `until cmd ...; do sleep
  30; done` with `|| continue` swallowing a missing binary looks exactly like *still
  running* for as long as you leave it. Verify the command exists before trusting its
  silence.
- **A grep for a byte the shell cannot represent is not a grep for that byte.** `$'\x00'` is
  the empty string, which matches every line; a tool that returns "every line matched" is
  usually not measuring what its author thought.
- **A secret scanner that cannot find its engine may exit non-zero as a refusal**, not as a
  pass and not as a finding. A non-zero exit meaning *I did not scan* must never be reported
  as *clean*.
- **An artefact older than its source is a build that never ran.** When a build reports
  success and nothing moved — same page count, same byte size, same output — check the
  artefact's timestamp against the input's before believing the report.
- **A backgrounded compound command reports the status of the last thing in it.** `make ... >
  log 2>&1; echo done` exits zero whatever `make` did. Read the log's own exit line.
- **A tool that takes its subject from the command line and is given none may report a clean
  tree**, because its loop body never ran. A checker that cannot distinguish *nothing to
  check* from *nothing wrong* should refuse rather than pass.
- **A count written in a document is not evidence.** Re-derive it. This applies to counts you
  wrote yourself, in this session, in a file whose purpose is to be correct.
- **A generated tree is not a place to write.** If the packaging layer is generated from a
  source, a hand-written file there is an orphan that the next regeneration deletes — and a
  grep of the manifest for the word you expected is not a check that registration is
  unnecessary.

## What this procedure does not do

It does not plan, prioritise or decide. It reports. If the report makes an obvious next step
obvious, say so in one line and stop — the owner decides what happens, and a status report
that shades into a proposal is harder to trust on the facts.

---

Generated from [`docs/delivery/SESSION-STATUS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/SESSION-STATUS.md) by `scripts/build-marketplace.mjs`. Do not edit this file: change the source document, or its entry in `catalog/marketplace.catalog.json`, and re-run the generator.
