---
name: ticket-feedback
description: >-
  Use when correcting a delivery artifact mid-ticket: answering an open
  question, saying the analysis read a criterion wrongly, reporting that a
  master prompt's run produced the wrong thing, or noting that the ticket
  itself has moved. Names the artifact that owns the correction before
  changing anything, classifies it as new information, a correction, a scope
  change or a preference, and lands it in the document rather than only in the
  reply — quoting the words it arrived in, striking the question it answers
  with its answer and who gave it, and appending to the revision log. Then
  names what has gone stale: a changed row makes the master prompt stale,
  along with any code already written against it, and the prompt is
  regenerated rather than edited. Refuses to widen scope quietly, to turn a
  preference into a standard, or to close a question because it was discussed.
argument-hint: "[what is wrong or newly known]"
---

# Feedback

The edge that closes every loop in the delivery flow. Something came back wrong — the
analysis misread a criterion, the exploratory round turned up a fact that changes a row,
the master prompt's run produced the wrong thing — and this phase takes the correction, in
your words, and **lands it in the artifact that owns it**. It writes no production code and
it decides nothing on its own.

**The feedback is the argument.** `/ticket-feedback the empty-collection case must 404,
not return an empty list — product confirmed`. Sentences are fine; a list is fine. With no
argument it uses the correction already in the conversation, and asks rather than guessing
if there is more than one thing there.

**Why a phase at all, rather than just saying it.** A correction spoken into a session is
gone next week and gone in the next session, and it was never anywhere the pull request
could quote. That is not a hypothetical: "the same clarification is requested twice on one
ticket" is already a named failure of
[`TICKET-ANALYSIS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/TICKET-ANALYSIS.md) §7, and it happens because answers stay in
conversations while documents keep the questions. This phase exists to make the correction
land in a file, and to say what that correction just invalidated.

**Contents**

0. [What has to be true first](#0-what-has-to-be-true-first)
1. [Name the target before changing anything](#1-name-the-target)
2. [Classify it](#2-classify-it)
3. [Landing it](#3-landing-it)
4. [What it invalidates downstream](#4-what-it-invalidates)
5. [What feedback is not](#5-what-feedback-is-not)
6. [Failure modes](#6-failure-modes)
7. [Checklist](#7-checklist)

---

## 0. What has to be true first

Confirm you can open
[`00-REFERENCE-ARCHITECTURE.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/architecture/00-REFERENCE-ARCHITECTURE.md) and the
guides under [`docs/guides/`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/). **If you cannot, stop and say so.** Feedback
routinely turns into a rule — "we always translate at the edge" — and a rule applied from
memory is the failure this repository exists to prevent, arriving in the most casual
possible wrapper.

**And there has to be an artifact to correct.** An analysis, a master prompt, a diff, a
review. Feedback with nothing to land in is a conversation: say so, and point at
`/ticket-analysis`, which is where a ticket with no analysis starts.

## 1. Name the target

Say which artifact this feedback belongs to, in one line, **before you change anything** —
and say it out loud in the reply, because getting this wrong is how a scope change gets
filed as a typo.

| The feedback is about | It lands in | Then |
|---|---|---|
| what the ticket asks for, or how it maps onto the architecture | the analysis document ([`TICKET-ANALYSIS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/TICKET-ANALYSIS.md) §2) | re-test §6's four conditions and report them |
| a fact about the codebase the analysis got wrong or missed | the same document — the row, and the exploratory findings | as above |
| something the generated prompt lost or garbled, where the analysis is right | nothing upstream; it is a generation defect | regenerate ([`GENERATE-MASTER-PROMPT.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/GENERATE-MASTER-PROMPT.md) §7) |
| the code that came out, where the analysis and prompt are right | nothing upstream | back to [`IMPLEMENTATION-PHASE.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/IMPLEMENTATION-PHASE.md) |
| a review finding you disagree with | the pull request's recorded decisions | [`PR-REVIEW.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/PR-REVIEW.md) re-reads them |

One correction can land in two places — a misread criterion is both a wrong row and wrong
code — and then it lands in both, upstream first. **Never fix the downstream artifact
alone.** Code patched to match feedback the analysis still contradicts leaves two
documents disagreeing, and the next person to read them cannot tell which one is current.

**Where you cannot tell which row it is, ask.** Feedback you cannot place is a question,
not a mandate: guessing produces a confident rewrite of things nobody asked you to touch,
and that is worse than a clarifying question by a wide margin.

## 2. Classify it

Four kinds. They land differently, so name the kind explicitly:

- **New information** — a fact the analysis did not have, usually the answer to an open
  question. It closes something. Record the answer *and who gave it*: an answer with no
  attributor cannot be re-checked when it turns out to be wrong.
- **A correction** — the analysis had it and had it wrong. This is the expensive kind,
  because things were derived from it. §4 is about that.
- **A scope change** — the ticket itself moved: a criterion added, dropped or altered.
  Not a correction to the analysis; a change to what is being analysed. The table gains or
  loses a row, out-of-scope is restated, and §6's conditions are re-tested and re-decided
  by a person. Say plainly that scope changed, and what it now excludes.
- **A preference** — how, not what: a naming convention, a shape you prefer, a structure
  you find clearer. Record it as a decision on this ticket, applied because you asked. It
  does not become a rule. §5 is why.

If one message carries several of these — it usually does — split them and land each one,
rather than treating the whole message as the most convenient kind.

## 3. Landing it

**The change goes in the document. The reply is the diff, not the record.**

- **Amend, do not regenerate.** Change the rows the feedback touches and leave the rest
  alone. A regenerated analysis costs the decisions the earlier rounds bought, and hides
  the loss behind output that looks the same ([`TICKET-ANALYSIS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/TICKET-ANALYSIS.md)
  §2).
- **Strike answered questions; do not delete them.** Keep the question, its answer, and
  who answered. A question that disappears is indistinguishable from one never asked.
- **Append to the revision log** — what changed, what closed it, what is still open.
- **Quote the feedback in the document, in the words it arrived in.** Your restatement of
  it is already an interpretation; the original is what someone will want in three weeks.
- **Cite what the change rests on.** If the feedback made a row move to another layer, the
  row cites the principle that puts it there (`P3`), not "as discussed".

Then report, in the reply: which artifact, which rows, which questions closed, which
conditions in §6 moved, and what is now stale downstream (§4). Nothing else — this phase
does not take the opportunity to improve the parts nobody mentioned.

## 4. What it invalidates

A correction upstream makes everything derived from it stale. Saying so is most of this
phase's value, because staleness is silent: a master prompt generated last hour still
reads perfectly after the row it came from changed.

| What changed | What is now stale | What to do |
|---|---|---|
| A row in the analysis table (layer, principle, guide, files) | the master prompt; any code written against that row | regenerate the prompt; name the files already written against the old row |
| A criterion added, removed or reworded | the prompt, and the test that proved the old wording | regenerate; the old test is a finding, not a pass |
| Out of scope | the prompt's block 6, and anything built into the excluded area | regenerate; say what has to come back out |
| An accepted risk that is now closed | the prompt's block 8 | regenerate, so the implementing session stops treating it as unknown |
| A recorded decision reversed | the prompt, and the decision's own entry | record the reversal *with the reason*; do not edit the original away |
| Only the generated prompt | nothing upstream | regenerate; the analysis was right |

**The master prompt is regenerated, never hand-edited** — including here, where editing it
is most tempting because the change looks like one word. An edited prompt has no source
and disagrees with its analysis silently
([`GENERATE-MASTER-PROMPT.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/GENERATE-MASTER-PROMPT.md) §5).

Where code exists against a row that just changed, **name the files and stop**. Rewriting
them is [`IMPLEMENTATION-PHASE.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/IMPLEMENTATION-PHASE.md)'s job, with its pre-analysis
and its tests; doing it from inside a feedback round produces an untested edit made in the
document phase, which is how a delivery flow quietly stops having phases at all.

## 5. What feedback is not

- **Not a way to widen scope quietly.** "While you're in there" is a scope change: it gets
  a row, or it gets refused in writing. Both are cheap here and expensive later.
- **Not a source of architectural rules.** A preference recorded on this ticket is a
  preference. It becomes a standard when it is written into a guide and cited from there —
  that is the whole difference between this estate's rules and an opinion in the
  architecture's clothing.
- **Not a way to close a question by discussing it.** A question closes on an answer, with
  an attributor. "We talked about it" closes nothing.
- **Not authority to override a principle silently.** Feedback that contradicts a principle
  gets that said, with the citation, once. You may still overrule it — you own the ticket
  and the estate — but it is recorded as a deviation with a reason (P14), not applied as
  though the principle had never said otherwise.
- **Not a review.** This phase lands what you said. It does not go hunting for other
  problems, and it does not relitigate rows the feedback did not touch.

## 6. Failure modes

| Symptom | Cause |
|---|---|
| The same correction is given twice, three rounds apart | It was applied to the output and never landed in the document; the artifact still says the old thing |
| The analysis and the implementation disagree, and both look deliberate | Feedback was landed downstream only — the code was patched, the row was not |
| Work is done against a master prompt that no longer matches its analysis | §4 was skipped, so nothing said the prompt was stale, and it still read fine |
| A round of feedback changed things nobody mentioned | The document was regenerated rather than amended, or the phase took the opportunity to improve adjacent rows |
| A preference from one ticket is enforced on the next as a standard | It was recorded as a rule instead of as a decision, and nothing required it to cite a guide |
| Scope grew and no one can point at when | A scope change was classified as a correction, so the table gained a criterion without the gate being re-decided |
| An answer turns out to be wrong and nobody can say who gave it | The answer was recorded without its attributor |
| Feedback was misfiled and the wrong artifact was rewritten | §1 was done silently, or guessed at, instead of being stated before anything changed |

## 7. Checklist

- [ ] Constitution and the needed guides confirmed readable; stopped and said so if not
- [ ] An artifact to correct actually exists; otherwise said so and pointed at `/ticket-analysis`
- [ ] Target artifact named in the reply before anything was changed; asked rather than guessed where it was unclear
- [ ] Feedback classified — new information, correction, scope change, or preference — and a multi-part message split
- [ ] Landed in the document, not only in the reply: rows amended not regenerated, questions struck with their answers and attributors, revision log appended
- [ ] The feedback quoted in its original words
- [ ] Every rule-shaped consequence citing a principle or guide section
- [ ] Downstream staleness named per §4, including files already written against a row that changed
- [ ] The master prompt regenerated rather than edited, where it was affected
- [ ] Scope changes stated as scope changes, with §6's conditions re-tested and left to a person to re-decide
- [ ] Contradictions with a principle stated once, with the citation, and recorded as a deviation with a reason if overruled
- [ ] Nothing touched that the feedback did not name

---

Generated from [`docs/delivery/FEEDBACK.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/delivery/FEEDBACK.md) by `scripts/build-marketplace.mjs`. Do not edit this file: change the source document, or its entry in `catalog/marketplace.catalog.json`, and re-run the generator.
