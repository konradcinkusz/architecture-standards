# NN. Title: what was studied, stated as a finding once one exists

> **Started:** YYYY-MM-DD ·
> **Status:** draft | verified | superseded (link successor) ·
> **Code studied:** commit `abcdef0` / branch as of YYYY-MM-DD

One-paragraph abstract: the question, the method, and — once known — the
headline result. Written last, placed first.

## Question

- **RQ1** — the primary question, phrased so evidence can answer it.
- **RQ2** — secondary questions, if any.

## Background

What was already known before this study, with citations: the repo's theory
docs, prior studies in this folder, external literature (numbered references
at the bottom).

## Method

What was done and why that method answers the RQs. Include how the
instrument was validated (rule 3 of the standard: a harness or replica must
first reproduce known-good results before its readings count).

## Materials

- [`path/to/code-under-study`](https://github.com/konradcinkusz/architecture-standards/blob/main/path/to/code-under-study) — what it is
- [`artifacts/NN/script.py`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/research/artifacts/NN/script.py) — what it does

## Results

Findings tied to RQs, evidence inline. Tables of numbers, each traceable to
a test assertion, a committed artifact, or a derivation shown here. Write
"not yet measured" for holes — never a plausible guess.

| Quantity | Value | Evidence |
|---|---|---|
| … | … | artifact / test / derivation link |

## Reproduction

```bash
# verbatim commands that regenerate every number above
```

## Threats to validity

What could make these results wrong or non-generalizable, stated by the
author up front.

## Implications

What should change because of this: issues to file, gap-analysis entries,
regression tests to pin, follow-up studies.

## References

1. Author — *Title*, year. Resolvable link or full citation.
