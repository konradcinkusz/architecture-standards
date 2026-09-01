<!-- Generated copy of docs/guides/METRIC-ETHICS.md — do not edit. Relative links have been rewritten to absolute repository URLs. -->

# Metric ethics: measuring work without measuring people

A product that scores work changes the work. Ship a number and somebody will optimise for
it; ship it against a person and they will optimise for it under pressure. Goodhart's law
is not a caveat to add at the end of the README — it is a set of design decisions taken
before the first metric ships, and they show up in the architecture or they do not exist.

This guide is deliberately short. It is five rules, each of which is a decision somebody
has to make and record.

It is repo-agnostic. The worked example is `konradcinkusz/copilot-scope` — its README's
§"How *not* to use CopilotScope", and the `Quality/` engine that enforces it.

**Contents**

1. [Anti-goals go at the top, and are enforced by architecture](#1-anti-goals-go-at-the-top-and-are-enforced-by-architecture)
2. [Every pressurable metric carries its counter-metric](#2-every-pressurable-metric-carries-its-counter-metric)
3. [No number leaves without its confidence](#3-no-number-leaves-without-its-confidence)
4. [Heuristics about people are report-only](#4-heuristics-about-people-are-report-only)
5. [The unit of evaluation is the artifact, never the person](#5-the-unit-of-evaluation-is-the-artifact-never-the-person)
6. [Failure modes](#6-failure-modes)
7. [Checklist](#7-checklist)

---

## 1. Anti-goals go at the top, and are enforced by architecture

State what the product is **not** for, near the top of the README rather than in a footer.
A reader who has already decided what to do with your numbers will not reach an appendix.

Then make the statement cost something. **An anti-goal that only exists as prose is a
request; an anti-goal the architecture cannot express is a rule.** If the product must not
rank individuals, the honest form of that is *there is no per-individual view and adding
one is not planned* — a sentence that is checkable against the code, and false the moment
somebody ships the view.

The distinction matters because the pressure to violate an anti-goal arrives later, from
somebody who did not read the README, and prose does not survive that conversation.
[P14](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/architecture/00-REFERENCE-ARCHITECTURE.md#p14) already asks for anti-goals to be
documented; this is the rule that they also be built.

## 2. Every pressurable metric carries its counter-metric

For each metric somebody could push on, name the degenerate strategy — the way to move the
number without doing the underlying good — and ship the metric that catches it.

**Blend the counter-metric into the same component rather than reporting it beside.** A
counter-metric on its own panel is one somebody can decline to look at; folded into the
same weighted term, the pressurable number *cannot* move without it. That is the difference
between a warning and a constraint.

Keep the pressurable metric's weight modest while you are at it. A number that is one fifth
of a composite is a poor target.

> `copilot-scope` — acceptance is 0.20 of the composite, and is itself computed as
> `0.6 × acceptance-ratio + 0.4 × edit-survival`. Accepting bad suggestions raises the
> first term and lowers the second, inside one component, by construction. The README says
> the same thing in words: "Push on it and you reward accepting bad suggestions."

## 3. No number leaves without its confidence

Export the sample size or a derived confidence beside every score, and make the pairing
structural rather than optional — same payload, same API response, same panel.

A score of 90 from four observations and a score of 70 from forty are different claims, and
a bare number cannot tell them apart. Without the pairing, the first thing a user does with
a new metric is compare two of them, and the comparison is meaningless in a way nothing on
the screen indicates.

Say in the documentation how to read the pair, because "confidence 0.2" means nothing to
somebody who has not been told that it means *early, not wrong*.

## 4. Heuristics about people are report-only

Inferences about a human's state — frustration, sentiment, effort, engagement — are lexical
or behavioural guesses with real error rates. They can be useful to look at. They must not
enter a composite that somebody might act on.

Enforce it where it cannot be quietly undone: keep the heuristic **outside** the scoring
engine entirely, as a separate analyzer, rather than inside with a zero weight. A zero
weight is one configuration change away from being non-zero, and nobody reviews that
change as the ethical decision it is.

> `copilot-scope` — frustration analysis lives outside `QualityEngine` altogether and is
> excluded from the composite, with the reason stated: heuristics about human emotion do
> not belong in a number someone might act on.

## 5. The unit of evaluation is the artifact, never the person

Score the session, the request, the change, the run. Not the author.

This is the rule the other four protect. Once a number is attached to a person it acquires
a use nobody designed it for, and the design decisions above — the counter-metric, the
confidence, the report-only heuristic — become the difference between a diagnostic and a
performance review conducted by a dashboard.

The useful question a metrics product answers is *where is this process wasting people's
time*, not *who is worst*. If a stakeholder asks for the second, the answer is that the
product does not do that — and §1 is what makes that answer true rather than merely
principled.

## 6. Failure modes

| Symptom | Cause |
|---|---|
| A score intended as a diagnostic appears in a performance conversation | The unit of evaluation is the person, or a per-person view exists for someone to sort (§5, §1) |
| A metric improves steadily while the underlying outcome does not | The pressurable metric shipped without a counter-metric, so the cheapest way to move it is the degenerate one (§2) |
| A counter-metric exists and nobody looks at it | It is reported beside rather than blended into the same component, so consulting it is optional (§2) |
| Two scores are compared and the comparison is meaningless | Confidence or sample size is not carried with the number (§3) |
| A sentiment heuristic ends up driving a decision | It was inside the composite at a low weight rather than outside it entirely — and a weight is one config change from non-zero (§4) |
| The README's anti-goals are cited in an argument and lose | They were prose with nothing in the architecture behind them (§1) |

## 7. Checklist

- [ ] Anti-goals are stated near the top of the README, not in a footer
- [ ] At least one anti-goal is enforced by an architectural absence — a view that does not exist — rather than by policy alone
- [ ] Every pressurable metric has a named degenerate strategy and a counter-metric that catches it
- [ ] The counter-metric is blended into the same composite component, not reported beside it
- [ ] Confidence or sample size travels with every exported score, in the same payload
- [ ] The documentation says how to read a score/confidence pair
- [ ] Heuristics about human state live outside the scoring engine entirely, not inside at zero weight
- [ ] The unit of evaluation is an artifact — session, request, change, run — and never a person
