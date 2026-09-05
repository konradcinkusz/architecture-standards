---
name: generate-master-prompt
description: >-
  Use when a ticket's analysis is accepted and there is enough information to
  implement it — invoking this is what that answer means. Turns the analysis
  document into one self-contained master prompt a coding agent can be handed
  in a local development environment or another session: the acceptance
  criteria verbatim, the analysis table copied whole with its layers,
  principles, guides and named files, what is out of scope, the compliance
  items at risk, the recorded decisions and the accepted risks — plus a single
  line handing off to the installed implementation phase rather than a retyped
  copy of it, because the procedure does not vary per ticket and the content
  does. Invents nothing: a gap found while generating is reported and sent
  back to analysis instead of resolved. Keeps secrets, real users' data and
  machine-specific paths out of the prompt, writes it beside the analysis, and
  stops rather than running it.
argument-hint: "[analysis]"
disallowed-tools: "Edit, NotebookEdit"
---

# Generating the master prompt

The step between an accepted analysis and the code. It takes the analysis — the document
[`TICKET-ANALYSIS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/TICKET-ANALYSIS.md) has been narrowing — and produces **one
self-contained prompt** that a coding agent can be handed in a local development
environment. It writes no production code, and it decides nothing about the ticket.

**Invoking it is what "enough information, yes" means.** The analysis phase reports its
four conditions and stops; running this is the answer. So the first thing this phase does
is check that the answer was earned (§0), and the last thing it does is hand back a
prompt (§5) — not a diff.

**The input is the analysis.** `/generate-master-prompt docs/analysis/PROJ-412.md`. With
no argument it uses the analysis this session has been working on, and refuses if there
is not exactly one — generating from "whatever was discussed" is how a prompt acquires
requirements nobody agreed to.

**Why this exists when the procedure is already installed.** The implementation procedure
does not vary per ticket, which is why it lives in
[`IMPLEMENTATION-PHASE.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/IMPLEMENTATION-PHASE.md) and is invoked rather than retyped.
The *change* does vary, every time. This phase generates the varying half and nothing
else: a prompt that restates the procedure is not a master prompt, it is a copy of a
document under version control that will drift from it (§3).

**Contents**

0. [The standards, and an analysis worth generating from](#0-what-has-to-be-true-first)
1. [What the master prompt is](#1-what-the-master-prompt-is)
2. [The blocks it carries](#2-the-blocks-it-carries)
3. [What never goes in it](#3-what-never-goes-in-it)
4. [Carrying the accepted risks](#4-carrying-the-accepted-risks)
5. [Where it is written, and how it is run](#5-where-it-is-written)
6. [The self-containment test](#6-the-self-containment-test)
7. [When the run comes back unsatisfactory](#7-when-the-run-comes-back-unsatisfactory)
8. [Failure modes](#8-failure-modes)
9. [Checklist](#9-checklist)

---

## 0. What has to be true first

Confirm you can open
[`00-REFERENCE-ARCHITECTURE.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/architecture/00-REFERENCE-ARCHITECTURE.md) and the
guides under [`docs/guides/`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/) — because
`architecture-core@architecture-standards` is installed, or because this repository is
attached to the session. **If you cannot, stop and say so.** A prompt that cites `P8` and
`TESTING-STRATEGY.md` §4 without either being readable is a prompt that will be obeyed
from memory in the session that runs it, which is the failure this estate spends the most
effort preventing.

**And there has to be an analysis.** Not a ticket, not a conversation: the document from
[`TICKET-ANALYSIS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/TICKET-ANALYSIS.md) §2, with its table, its risk list and its
questions. If there is none, say so and go back — this phase cannot analyse, and a prompt
generated from a bare ticket is the same output with the analysis skipped and its absence
hidden.

Read it and check three things before generating a line:

- **Every acceptance criterion has a complete row.** A row missing a layer or a file is a
  question that has not been answered, and copying it into a prompt does not answer it —
  it delegates it to whichever session runs the prompt, silently.
- **Every blocking question is either closed or accepted** in §6's table. Closed
  questions carry their answer; accepted ones carry who accepted them.
- **The document is current.** If the conversation has moved past the file — a correction
  discussed but not written down — stop and put it in the analysis first, through
  [`FEEDBACK.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/FEEDBACK.md). Generating from a stale analysis produces a prompt that
  is wrong in exactly the way nobody is looking.

Where any of these fails, **report it and generate nothing.** This phase has no gate of
its own to enforce; what it must not do is launder a gap by copying it forward in a
document that looks finished.

**Everything the prompt asserts cites its source**, the same rule the other phases carry:
a layer, a constraint, a deviation each name the principle (`P3`) or the guide section
(`FRONTEND-BFF.md` §7) behind it. In generated output the rule bites harder than usual,
because the session that runs the prompt has no way to tell an architectural requirement
from a sentence that sounded like one.

## 1. What the master prompt is

One document, in the person's hands, that is enough to implement this ticket in a session
that has never seen this conversation. Its test is §6, and it is worth stating what that
rules out: not a summary of the ticket, not a plan, not instructions to "follow the
standards", and not a second copy of the implementation procedure.

Three properties, and each one is checkable:

- **Self-contained.** Every fact the implementing session needs is in it or is at a path
  that session can open. Nothing depends on remembering this conversation.
- **Traceable.** Every line comes from a row, a decision or a criterion in the analysis.
  If you cannot point at where a line came from, it is invented, and §3 applies.
- **Fixed-procedure, variable-content.** It says *what* to build and *what governs it*,
  and delegates *how the work is done* to `/implementation-phase`.

## 2. The blocks it carries

In this order. The order is not cosmetic: the criteria come before the table so the
ticket is read on its own terms first — the same ordering rule that
[`TICKET-ANALYSIS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/TICKET-ANALYSIS.md) §4 applies to reading code.

```
1  Standards preamble   Read, do not re-derive. 00-REFERENCE-ARCHITECTURE.md, plus
                        the guides named in the analysis's "Guide to load" column —
                        by name, each one, not "the relevant guides".
2  Identification       Ticket id, the analysis document's path, and which revision
                        of it this prompt was generated from.
3  The change           One sentence, from the analysis §1. The owning bounded
                        context (P3), named.
4  Acceptance criteria  The ticket's own words, verbatim. Never paraphrased.
5  The table            The analysis §2, copied whole: criterion, owning context and
                        layer, governing principle, guide to load, files.
6  Out of scope         Copied from below that table, with its reasons.
7  Compliance at risk   The analysis §3 list: each item marked kept, or covered by a
                        recorded decision with its reason.
8  Decisions and        Recorded deviations, non-blocking assumptions, and §6's
   accepted risks       accepted-risk table verbatim (§4 below).
9  The procedure        "Run /implementation-phase." One line. Plus its definition of
                        done: build green, every criterion covered by a test at the
                        layer holding the logic, no file touched outside block 5.
10 Precedence           If this prompt and the analysis disagree, the analysis wins,
                        and the disagreement is a finding to send back — not a
                        judgement call to make mid-implementation.
```

Two blocks are where generation earns its keep, so do not compress them:

- **Block 4 is verbatim.** Paraphrasing an acceptance criterion is the cheapest possible
  way to solve the wrong problem competently, and it survives review because the
  paraphrase is what everyone downstream is reading.
- **Block 5 is copied, not summarised.** The table is what makes an implementing session
  edit the file the analysis chose rather than the file it would have chosen. A prompt
  that says "in the orders service" instead of naming files has thrown away the whole
  exploratory round.

## 3. What never goes in it

- **A requirement that is not in the analysis.** Generation adds nothing. If writing the
  prompt reveals a gap — a criterion with no row, an ambiguity you can feel yourself
  about to resolve — **stop, name it, and send it back to `/ticket-analysis`.** That is
  the loop working. Resolving it here buries a decision in a generated file that nobody
  reviews as a decision.
- **The implementation procedure, retyped.** It is installed, versioned and reviewed
  once. A copy inside a prompt is a fork of it that will drift, and the drift is
  invisible because both copies look authoritative.
- **Secrets, tokens, connection strings or real users' data (P5).** A master prompt is
  pasted between sessions, machines and sometimes people. Name the environment variable;
  never its value.
- **Absolute paths private to one machine.** Repository-relative, always — the prompt has
  to survive being run somewhere else, which is most of the point of writing it down.
- **Estimates, confidence scores and encouragement.** They read as requirements to the
  session that runs the prompt, and they are not.

## 4. Carrying the accepted risks

[`TICKET-ANALYSIS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/TICKET-ANALYSIS.md) §6 lets a person proceed with a condition
unmet, provided the acceptance is written down. This phase is where that record earns its
existence: **copy the accepted-risk table into block 8 verbatim**, including who accepted
each item and what it costs if the assumption is wrong.

Do not summarise it, do not soften it into an assumption, and never drop a row because it
looks resolved now — if it is resolved, the analysis says so and the row is gone from the
source. The implementing session needs to know it is standing on an accepted risk,
because that changes what it does when the code disagrees: an assumption that fails
mid-implementation is a stop condition
([`IMPLEMENTATION-PHASE.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/IMPLEMENTATION-PHASE.md) §7), not a puzzle to route around.

If the accepted-risk table is empty and the four conditions were met, say that in block 8
explicitly. "No accepted risks" is information; an absent block is ambiguous.

## 5. Where it is written

Two outputs, and both matter:

- **A file next to the analysis** — `docs/analysis/<ticket-id>.master-prompt.md` unless
  the repository has somewhere better. It is generated output: say so in its first line,
  with the analysis path and revision it came from.
- **The same text in the reply, in one fenced block**, so it can be pasted into a fresh
  session or another tool without opening the file.

Then stop. **This phase does not run the prompt.** Running it is a separate act in a
session with the working tree in front of it, and the separation is what lets a person
read the prompt before code gets written against it — which is the only moment the prompt
is cheap to fix.

**A master prompt is regenerated, never hand-edited.** An edited prompt has no source: the
analysis no longer describes it, the next regeneration silently discards the edit, and
the two disagree with no way to tell which is current. Corrections go into the analysis
through [`FEEDBACK.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/FEEDBACK.md), and then this phase runs again.

## 6. The self-containment test

Before handing it over, read the prompt as a session that has never seen this
conversation, and answer four questions from the text alone:

- [ ] **What am I building?** Block 3 and block 4, without inference.
- [ ] **Where?** Block 5 names files, not areas.
- [ ] **What governs it?** Block 1's guides are named and openable; block 7's compliance
      items are specific.
- [ ] **How will this be judged?** Block 9's definition of done, and block 8's accepted
      risks so a known-unknown is not mistaken for a bug.

Any question you can only answer from memory of this conversation is a defect — in the
prompt if the analysis has the answer, in the analysis if it does not. The second kind
goes back to `/ticket-analysis`; do not patch it here.

## 7. When the run comes back unsatisfactory

The prompt was run and the result is wrong. Two causes, and they need opposite fixes, so
name which one before touching anything:

- **The prompt was faithful and the analysis was wrong** — a row named the wrong layer, a
  criterion was read wrongly, a question was closed on a bad answer. Send it through
  [`FEEDBACK.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/FEEDBACK.md), let it land in the analysis, then regenerate.
- **The analysis was right and the prompt lost something** — a criterion paraphrased, a
  file dropped, an accepted risk not carried. That is this phase's defect: fix the
  generation and regenerate. It usually means a block in §2 was compressed.

Two things that are never the fix: patching the code that came out — it makes the
artifacts disagree while the visible problem goes away — and re-running the same prompt
hoping for a better result, which treats a specification defect as luck.

## 8. Failure modes

| Symptom | Cause |
|---|---|
| The prompt is long, reads well, and the implementation still solves the wrong problem | The acceptance criteria were paraphrased into block 4 instead of copied |
| The implementing session edits files the analysis never named | Block 5 summarised the table into prose, so the file list was advice rather than a boundary |
| The prompt restates half the implementation procedure, and it is a version behind | It was generated as a standalone brief rather than as the variable half of an installed phase |
| A requirement appears in the prompt that nobody agreed to | A gap was resolved during generation instead of being sent back — §3's rule |
| The implementation trips over an assumption everyone knew about | The accepted-risk table was summarised or dropped from block 8 |
| Two master prompts exist for one ticket and they disagree | One was hand-edited. §5: regenerate, never edit |
| The prompt cannot be run anywhere but the machine that wrote it | Absolute paths, or facts that live only in the generating conversation. §6 catches both |
| Re-running the prompt produces a different implementation each time | The prompt is ambiguous where the analysis was ambiguous, and generation smoothed it over rather than reporting it |

## 9. Checklist

- [ ] Constitution and the analysis's named guides confirmed readable; stopped and said so if not
- [ ] An analysis document exists, is current, and was read — not a ticket, not a conversation
- [ ] Every acceptance criterion has a complete row; every blocking question closed or accepted; anything missing reported and nothing generated
- [ ] All ten blocks present, in order, with acceptance criteria verbatim and the table copied whole
- [ ] Every guide named individually; every rule-shaped line citing a principle or guide section
- [ ] Nothing invented: each line traceable to a row, a decision or a criterion in the analysis
- [ ] Gaps found during generation sent back to `/ticket-analysis` rather than resolved here
- [ ] No secrets, no real users' data, no machine-specific absolute paths
- [ ] Accepted-risk table copied verbatim, or an explicit "no accepted risks"
- [ ] Written to a file beside the analysis, stating its source document and revision, and echoed as one fenced block in the reply
- [ ] The four self-containment questions answered from the prompt's text alone
- [ ] Stopped there: the prompt is handed over, not run

---

Generated from [`docs/delivery/GENERATE-MASTER-PROMPT.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/GENERATE-MASTER-PROMPT.md) by `scripts/build-marketplace.mjs`. Do not edit this file: change the source document, or its entry in `catalog/marketplace.catalog.json`, and re-run the generator.
