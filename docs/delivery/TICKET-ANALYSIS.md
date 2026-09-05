# Ticket analysis

The phase before implementation. Its job is to decide one thing: **is there enough
information to implement this ticket without guessing?** It produces an analysis, a list
of open questions, and an answer to that question. It writes no production code.

The gate matters more than the document. A ticket that enters implementation with an
unresolved ambiguity does not fail loudly — it produces a plausible diff that solves the
wrong problem, and the cost lands in review or in production rather than here.

First of three phases: this, then [`IMPLEMENTATION-PHASE.md`](IMPLEMENTATION-PHASE.md),
then [`PR-REVIEW.md`](PR-REVIEW.md). [`WORKFLOW.md`](WORKFLOW.md) is how they fit
together and how to install them.

**Contents**

1. [Read the ticket against the architecture](#1-read-the-ticket)
2. [The exploratory round](#2-the-exploratory-round)
3. [Questions and gaps](#3-questions-and-gaps)
4. [The gate](#4-the-gate)
5. [Failure modes](#5-failure-modes)
6. [Checklist](#6-checklist)

---

## 1. Read the ticket

Read the ticket and its acceptance criteria, then read them again against the
[reference architecture](../architecture/00-REFERENCE-ARCHITECTURE.md) rather than
against the code.

- **Restate the change in one sentence.** If you cannot, that is the first finding.
- **Name the bounded context that owns it (P3)**, and say how confident you are.
- **List each acceptance criterion**, and next to it the layer that would satisfy it —
  service domain, kernel, persistence, HTTP surface, frontend. A criterion with no layer
  is either a question or a criterion for a different ticket.
- **Name the guides that will be needed** in implementation, from the domains in that
  list. Loading them is implementation's job; naming them is this phase's.
- **Flag any criterion that would require a principle-level deviation** — a second
  service's database, domain in the shared kernel, a schema change outside a migration, a
  public contract change the ticket does not mention. These are the expensive discoveries,
  and they are cheap here.

## 2. The exploratory round

Read the code only after the ticket has been read on its own terms. The order matters:
reading the code first makes the existing implementation feel like the requirement.

This round is **read-only** — no edits, no fixes, not even obvious ones. Its output is
knowledge:

- where the behaviour named in the ticket currently lives, by file;
- what already exists that the ticket may be duplicating;
- what tests cover the affected paths today, at which layer (P13);
- what the flow actually is end to end, as against what the ticket assumes it is.

Where the change is large or the codebase unfamiliar, run this round in its own context
and bring back the findings rather than the exploration.

## 3. Questions and gaps

Write the open questions down as questions, each with the decision it blocks. "How should
this behave when the collection is empty?" is a question; "edge cases unclear" is not.

Separate them honestly, because only the first kind is a gate:

- **Blocking** — implementation cannot start without an answer, or would have to guess at
  behaviour that a user will see.
- **Non-blocking** — worth asking, but a documented assumption is enough to proceed. Write
  the assumption down; it belongs in the pull request later.

A question that has been sitting unanswered is not thereby resolved. It is still blocking.

## 4. The gate

Implementation starts when all three hold:

- [ ] **Zero blocking questions outstanding.**
- [ ] **Every acceptance criterion maps to at least one identified file**, and to a layer.
- [ ] **The owning bounded context is named**, and any principle-level deviation the
      ticket requires is recorded as a decision — not left to be discovered mid-diff.

If any fails, the loop is: ask, or explore further, then re-test the gate. Do not enter
implementation with a failing gate on the theory that it will become clear once the code
is open. It does not; it becomes invisible.

## 5. Failure modes

| Symptom | Cause |
|---|---|
| The implementation is competent and solves the wrong problem | The ticket was read through the existing code, so the current behaviour was mistaken for the requirement |
| Questions surface mid-implementation and stall it | The gate was passed on optimism rather than on the three conditions |
| The same clarification is requested twice on one ticket | Questions were asked in conversation and never written down with the decision each blocks |
| An architectural conflict appears in review | §1's deviation flag was skipped, so the conflict was first seen in a diff |
| Analysis takes longer than the change | The exploratory round became implementation without the edits — reading everything instead of what the traced flow touches |

## 6. Checklist

- [ ] Change restated in one sentence
- [ ] Owning bounded context named (P3)
- [ ] Every acceptance criterion mapped to a layer and at least one file
- [ ] Guides needed in implementation named
- [ ] Principle-level deviations flagged and recorded as decisions
- [ ] Exploratory round run read-only; current behaviour, duplication and existing test coverage located
- [ ] Open questions written as questions, each with the decision it blocks, split into blocking and non-blocking
- [ ] Non-blocking assumptions written down for the pull request
- [ ] The three gate conditions tested explicitly before implementation starts
