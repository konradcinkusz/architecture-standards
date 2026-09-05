---
name: ticket-analysis
description: >-
  Use when starting work on a ticket, before any implementation, or when
  unsure whether a ticket is ready to implement at all. Turns the business
  request into an architectural one: a table with a row per acceptance
  criterion carrying the owning context and layer, the principle that governs
  it, the guide implementation must load, and the files — then a walk of the
  compliance checklist listing what the change puts at risk, so a deviation is
  decided and recorded here rather than discovered mid-diff. Takes the
  analysis document as its argument and revises it in place run after run,
  amending rows and striking answered questions rather than regenerating an
  essay. Reads the ticket against the architecture rather than against the
  existing code, runs a read-only exploratory round, then reports the four
  gate conditions with their evidence and leaves the decision to proceed to
  the person — recording anything they proceed without as an accepted risk.
  Refuses to start if the standards are not readable in the session.
argument-hint: "[analysis]"
---

# Ticket analysis

The phase before implementation. It exists to answer one thing: **is there enough
information to implement this ticket without guessing?** It produces an analysis, a list
of open questions, and the evidence you answer that question from. It writes no
production code.

**The ticket arrives in the conversation** — pasted, in its own words, with its acceptance
criteria. This phase fetches nothing.

**The analysis is the argument.** `/ticket-analysis docs/analysis/PROJ-412.md` opens the
analysis already written for this ticket and produces the next revision of it. With no
argument this is the first pass, and the phase says where it wrote the document. The
phase is built to be run repeatedly, every run against the same file: what improves is
one document, not a pile of essays about the same ticket. §2 has the rules for that.

**The gate is yours.** The phase tests §6's four conditions and reports them honestly; it
does not refuse to continue. You decide whether there is enough information. What the
phase decides for itself is only what gets *recorded* when you overrule it — which is
§6's whole job, and the reason overruling it is safe.

The gate matters more than the prose around it. A ticket that enters implementation with
an unresolved ambiguity does not fail loudly — it produces a plausible diff that solves
the wrong problem, and the cost lands in review or in production rather than here. That is
why an ambiguity you knowingly accept still gets written down: the danger is not deciding
early, it is deciding early and leaving no trace.

First of the phases: this, then [`GENERATE-MASTER-PROMPT.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/GENERATE-MASTER-PROMPT.md),
[`IMPLEMENTATION-PHASE.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/IMPLEMENTATION-PHASE.md) and [`PR-REVIEW.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/PR-REVIEW.md),
with [`FEEDBACK.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/FEEDBACK.md) closing every loop back to here.
[`WORKFLOW.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/WORKFLOW.md) is how they fit together and how to install them.

**Contents**

0. [The standards have to be in front of you](#0-the-standards-have-to-be-in-front-of-you)
1. [Read the ticket against the architecture](#1-read-the-ticket)
2. [The analysis is a table, not prose](#2-the-analysis-is-a-table)
3. [What the change puts at risk](#3-what-the-change-puts-at-risk)
4. [The exploratory round](#4-the-exploratory-round)
5. [Questions and gaps](#5-questions-and-gaps)
6. [The gate, and who holds it](#6-the-gate)
7. [Failure modes](#7-failure-modes)
8. [Checklist](#8-checklist)

---

## 0. The standards have to be in front of you

This phase is worthless if the architecture is not actually readable in this session. The
failure mode it exists to prevent — an agent reconstructing an architectural rule from
whatever code it happens to see — is *most* likely here, because analysis is where the
rules get applied before any compiler is watching.

Before anything else, confirm you can actually open:

- [`00-REFERENCE-ARCHITECTURE.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/architecture/00-REFERENCE-ARCHITECTURE.md) — P1–P15
  and the compliance checklist;
- the guide under [`docs/guides/`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/) for every domain this ticket touches.

They are reachable because `architecture-core@architecture-standards` is installed, or
because this repository is attached to the session. **If neither is true, stop and say
so.** Do not proceed on a recollection of these rules: an analysis that sounds like the
standards but was not read against them is worse than no analysis, because it will be
trusted.

**A bare ticket number is not a ticket.** This phase cannot fetch one, so an identifier
with no text behind it leaves nothing to analyse except the identifier and whatever the
code implies — which is §1's failure mode arriving through a different door, and it
produces an analysis confident enough to be believed. Ask for the ticket instead, and say
that is what you are waiting on.

**Everything this phase outputs cites its source.** Every layer assignment, every
constraint, every deviation and every recommendation names the principle (`P3`) or the
guide section (`TESTING-STRATEGY.md` §6) it rests on. A line with no citation is a fact
about *this ticket* — never a rule. If it reads like a rule and carries no citation, it is
an opinion in the architecture's clothing, which is the specific thing this repository
exists to prevent.

## 1. Read the ticket

Read the ticket and its acceptance criteria, then read them again against the
[reference architecture](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/architecture/00-REFERENCE-ARCHITECTURE.md) rather than
against the code.

- **Restate the change in one sentence.** If you cannot, that is the first finding.
- **Name the bounded context that owns it (P3)**, and say how confident you are.
- **Decide whether this is one ticket.** A change that needs two bounded contexts is not
  one ticket with a complication; under P3 it is two, or a design question. Say which.
- **Flag any criterion that would require a principle-level deviation** — a second
  service's database (P3), domain in the shared kernel (P2), a schema change outside a
  migration (P4), a secret that would have to live in configuration (P5), an optional
  dependency that would fail startup (P8), a public contract change the ticket does not
  mention (P11). These are the expensive discoveries, and they are cheap here.

## 2. The analysis is a table

The output of this phase is not an essay about the business need. It is the business need
**resolved into this architecture**, one row per acceptance criterion:

| Acceptance criterion | Owning context and layer | Governed by | Guide to load | Files | Blocking question |
|---|---|---|---|---|---|
| *what the ticket asks for* | *service + service domain / kernel / persistence / HTTP surface / anti-corruption edge / frontend-BFF / AppHost* | *the principle, by number* | *the guide, by name and section* | *named, not "TBD"* | *or "none"* |

Rules for filling it in, because the columns are where the analysis actually happens:

- **A criterion with no layer is not analysed yet.** It is either a question, or a
  criterion belonging to a different ticket. Do not leave it blank and proceed.
- **A criterion with no governing principle is possible and worth noticing.** Plenty of
  business rules are pure domain logic that no principle constrains. Write "none — domain
  logic", and mean it; that is different from having skipped the column.
- **"Guide to load" is a commitment the next phase collects on.**
  [`IMPLEMENTATION-PHASE.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/IMPLEMENTATION-PHASE.md) §1 requires the guide for every
  domain touched to be loaded and named. This column is where that list comes from, so an
  empty one there usually means a lazy one here.
- **Files are named in advance or the row is a question.** "Somewhere in the service" is
  not an answer; it is the exploratory round's job (§4) to turn it into one.

Below the table, state what is **out of scope** and why — a criterion the ticket implies
but does not ask for is the cheapest thing to refuse here and the most expensive to refuse
after it is built.

### Where it lives, and how it is revised

The table is a file, because a table that lives only in a transcript cannot be corrected
next week and cannot be handed to
[`GENERATE-MASTER-PROMPT.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/GENERATE-MASTER-PROMPT.md). Write it to the path you were
given; with no argument, write it under `docs/analysis/<ticket-id>.md` in the target repo
and say so in the first line of your reply, because a person who does not know where it
went cannot pass it back.

Every later run **revises that document in place**. That means:

- **Amend rows; do not regenerate the table.** A run that reproduces the same six columns
  from scratch loses the decisions the previous runs paid for, and it loses them silently
  because the output looks the same. If a row is now wrong, change that row.
- **Say what changed and why, in the reply.** Which rows moved, which questions closed and
  on whose answer, which are new. The document is the state; the reply is the diff, and
  without it a person cannot tell a real narrowing from a reshuffle.
- **Answered questions are struck, not deleted.** Keep the question, the answer and who
  gave it. A question that vanishes cannot be distinguished from one that was never asked,
  and §7's "same clarification requested twice" starts exactly there.
- **The revision log is four columns and lives at the foot of the document**: run, what
  changed, what closed it, still open. It is what makes "I have been round this three
  times" a fact rather than a feeling.

Corrections arriving from the *other* direction — a person telling you the analysis is
wrong — are [`FEEDBACK.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/FEEDBACK.md)'s job, and it lands them in this same document.

## 3. What the change puts at risk

Walk the [compliance checklist](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/architecture/00-REFERENCE-ARCHITECTURE.md#3-compliance-checklist)
for every layer the table names, and list the items this change could break. Not the whole
checklist — the items in its blast radius.

This happens here rather than only in review because a compliance item discovered at
review time is rework, and the same item named in analysis is a five-minute decision. The
recurring ones:

- the kernel holding no entity, DTO, enum, seed dataset, pricing constant or user-facing
  string (P2) — the item an architecture test enforces, so breaking it fails the build;
- the service owning its database, with nothing else connecting to it (P3);
- schema applied by `MigrateAsync` from provider-specific migrations (P4);
- all configuration from the environment, no secret in source, config or comment (P5);
- every optional integration having a working no-op, reported by the health endpoint and
  the startup banner (P8);
- the logic-bearing layer covered by tests — and, where behaviour is being *moved*,
  characterisation tests written before the move rather than after (P13);
- architectural decisions recorded in `docs/` (P14).

For each item at risk, say whether the change keeps it, or requires a deviation. **A
required deviation is a decision to record now**, with its reason, not a thing to discover
mid-diff. That is P14 doing its job at the only point where it is cheap.

## 4. The exploratory round

Read the code only after the ticket has been read on its own terms. The order matters:
reading the code first makes the existing implementation feel like the requirement.

This round is **read-only** — no edits, no fixes, not even obvious ones. Its output fills
the gaps the table left:

- where the behaviour named in the ticket currently lives, by file;
- what already exists that the ticket may be duplicating — including a pattern a guide
  already prescribes, which is the cheapest possible finding;
- what tests cover the affected paths today, and at which layer (P13);
- what the flow actually is end to end, as against what the ticket assumes it is.

Where the change is large or the codebase unfamiliar, run this round in its own context and
bring back the findings rather than the exploration.

## 5. Questions and gaps

Write the open questions down as questions, each with the decision it blocks. "How should
this behave when the collection is empty?" is a question; "edge cases unclear" is not.

Separate them honestly, because only the first kind is a gate:

- **Blocking** — implementation cannot start without an answer, or would have to guess at
  behaviour a user will see. **Every principle-level deviation from §1 or §3 that has not
  been decided is blocking**, by definition: it changes what gets built, not just how.
- **Non-blocking** — worth asking, but a documented assumption is enough to proceed. Write
  the assumption down; it belongs in the pull request later.

A question that has been sitting unanswered is not thereby resolved. It is still blocking.

## 6. The gate, and who holds it

Four conditions decide whether this ticket can be implemented without guessing:

- [ ] **Zero blocking questions outstanding.**
- [ ] **Every acceptance criterion has a complete row** in §2 — layer, governing principle
      or an explicit "none", guide, and named files.
- [ ] **The owning bounded context is named** (P3), and the ticket is one ticket.
- [ ] **Every compliance item at risk in §3 is either kept, or covered by a recorded
      decision** with its reason.

**The phase tests them; the person decides on them.** End every run by reporting the four,
one line each, each marked *met* or *not met* and each carrying the evidence — the row, the
question, the decision — rather than a verdict on its own. Then say which way you would go
and why, in one sentence. Then stop: this phase does not enter implementation and does not
generate anything. Whoever is reading decides whether the answer is *enough information,
yes*, and that answer is given to [`GENERATE-MASTER-PROMPT.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/GENERATE-MASTER-PROMPT.md)
by invoking it — which is the only thing that means *yes* here.

An unmet condition is a reason to go round again: answer it, or explore further (§4), or
send a correction through [`FEEDBACK.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/FEEDBACK.md), then re-run against the same
document. That loop is cheap. What it protects against is not.

**Proceeding with a condition unmet is allowed, and is never silent.** A person may know
something the analysis cannot — that the empty-collection case cannot occur in this
release, that the deviation is already agreed elsewhere. When that happens, the condition
does not become met; it becomes **accepted**, and the accepted risk is written down before
anything downstream is generated:

| Condition | Why it is unmet | Who accepted it | What it costs if the assumption is wrong |
|---|---|---|---|

That table is part of the analysis document, and
[`GENERATE-MASTER-PROMPT.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/GENERATE-MASTER-PROMPT.md) §4 copies it into the prompt
verbatim, so the implementing session is told what it is standing on rather than inferring
it. It reaches the pull request the same way. **An accepted risk that was never written
down is the failure this whole phase exists to prevent** — not because someone decided
wrongly, but because in three weeks nobody can tell a decision from an oversight.

Never record a condition as met because it was discussed, and never mark one accepted on
your own: acceptance names a person. Where you cannot tell whether a person accepted a
risk or simply moved on, treat it as unmet and say so.

## 7. Failure modes

| Symptom | Cause |
|---|---|
| The implementation is competent and solves the wrong problem | The ticket was read through the existing code, so the current behaviour was mistaken for the requirement |
| An analysis exists for a ticket nobody supplied | Work started from an identifier alone; with no text to read, the requirement was reconstructed from the code it was supposed to judge |
| The analysis reads well and changes nothing about how the ticket gets built | It stayed prose. §2's table is what forces every criterion to land on a layer and a principle |
| The analysis cites principles that do not say what it claims | §0 was skipped and the rules were recalled rather than read |
| An architectural conflict appears in review | §1's deviation flag or §3's checklist walk was skipped, so the conflict was first seen in a diff |
| A deviation is "discovered" mid-implementation | It was visible in §3 and recorded as neither kept nor decided |
| Questions surface mid-implementation and stall it | The gate was passed on optimism rather than on its four conditions |
| Nobody can say why the ticket was implemented with a question still open | §6's condition was unmet and neither met nor accepted — the run reported a verdict instead of four lines of evidence, and the person had nothing to accept |
| Each run of the phase produces a fresh, slightly different analysis | The document was regenerated rather than revised, so the decisions the earlier runs bought were overwritten by output that looked identical |
| The third run asks a question the first run already answered | The answer stayed in the conversation. §2's revision rules put it in the document, struck rather than deleted |
| The same clarification is requested twice on one ticket | Questions were asked in conversation and never written down with the decision each blocks |
| Analysis takes longer than the change | The exploratory round became implementation without the edits — reading everything instead of what the table's rows point at |

## 8. Checklist

- [ ] The ticket present in the conversation as text, not as a bare identifier
- [ ] The constitution and the needed guides confirmed readable before starting; stopped and said so if not
- [ ] Every rule-shaped statement in the output cites a principle or a guide section
- [ ] Change restated in one sentence; owning bounded context named (P3); confirmed to be one ticket
- [ ] §2 table complete: every acceptance criterion has a layer, a governing principle or an explicit "none", a guide, and named files
- [ ] Out of scope stated below the table
- [ ] Compliance checklist walked for every layer named; each item at risk marked kept or decided
- [ ] Principle-level deviations recorded as decisions with reasons, not left for the diff
- [ ] Exploratory round run read-only; current behaviour, duplication and existing test coverage located
- [ ] Open questions written as questions, each with the decision it blocks, split into blocking and non-blocking
- [ ] Non-blocking assumptions written down for the pull request
- [ ] The analysis written to the path given, or to `docs/analysis/<ticket-id>.md` with the location stated in the reply
- [ ] A re-run revised that document in place — rows amended, answered questions struck rather than deleted, revision log appended — and the reply said what changed
- [ ] The four gate conditions reported one line each, marked met or not met, each carrying its evidence, with a one-sentence recommendation
- [ ] Any condition the person chose to proceed without recorded as accepted, with who accepted it and what it costs if the assumption is wrong
- [ ] Stopped there: no implementation, no master prompt generated by this phase

---

Generated from [`docs/delivery/TICKET-ANALYSIS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/TICKET-ANALYSIS.md) by `scripts/build-marketplace.mjs`. Do not edit this file: change the source document, or its entry in `catalog/marketplace.catalog.json`, and re-run the generator.
