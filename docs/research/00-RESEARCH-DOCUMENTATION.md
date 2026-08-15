# Scientific research documentation

How a repository documents scientific research: where studies live, the
shape every study document follows, and the evidence rules that separate a
research write-up from a blog post. This standard gets its own `docs/research/`
folder here — parallel to `docs/architecture/` (the constitution) and
`docs/guides/` (operational guides) — because research output is a different
kind of document: a guide tells you how to do something; a study reports a
question, the method used on it, and what the evidence actually showed.

## What counts as research (and what doesn't)

A **study** asks a question whose answer wasn't known before the work was
done, and answers it with evidence: measurements, verified computations,
reproducible experiments, or systematic analysis of committed code. Examples:
benchmarking an algorithm against its theoretical complexity, verifying an
implementation against independently derived expected values, characterizing
a system's behavior under a sweep of inputs, root-causing a discrepancy
between a model's specification and its implementation.

Not research, and living elsewhere:

- **Theory/background material** — teaching a reader established results
  (textbook algorithms, probability rules). That is a theory doc
  (`docs/THEORY.md` in `bayesian-inference` is the worked example) and a
  study *cites* it rather than repeating it.
- **Design decisions** — those go in the decisions log
  (`docs/architecture/05-DECISIONS.md` pattern).
- **Gap analysis / roadmap** — `docs/architecture/` per the constitution.

## Where research lives in a repository

```
docs/research/
├── README.md          # index: one line per study, status, headline result
├── 01-SLUG.md         # studies, numbered in the order they were started
├── 02-SLUG.md
├── artifacts/
│   ├── 01/            # per-study: scripts, raw outputs, data
│   └── 02/
└── papers/
    └── 01-SLUG.tex    # LaTeX paper derived from the study (see below)
```

- `README.md` is the index a visitor reads first: for each study, its
  number, title, status, and one-sentence headline result.
- Studies are numbered `NN-SLUG.md` (same convention as
  `docs/architecture/`), never renumbered, never deleted — a superseded
  study gets a status change and a pointer to its successor.
- `artifacts/NN/` holds what the study needs to be re-run or re-checked:
  analysis scripts, small raw outputs, derivations. Large or regenerable
  data is not committed; the study instead records the exact command that
  regenerates it.

## The shape of a study

Every study document carries these sections, in this order (copy
[`TEMPLATE.md`](TEMPLATE.md) to start one):

1. **Header block** — date started, status, and the commit/state of the code
   the study describes. Status is one of:
   - `draft` — question posed, work in progress; numbers may be missing,
     never invented.
   - `verified` — every reported number is traceable (see rules below).
   - `superseded` — kept for the record; header links to the successor.
2. **Question** — the research question(s), numbered (`RQ1`, `RQ2`, …) so
   results can answer them by name.
3. **Background** — what was already known, with citations: prior studies,
   the repo's theory docs, external literature.
4. **Method** — what was done, precisely enough that a skeptic can attack
   it. Includes how the method itself was validated.
5. **Materials** — the exact code under study, as repo-relative links to
   specific files, plus the study's own artifacts.
6. **Results** — the findings, each tied to the RQ it answers, with the
   evidence inline (tables of numbers, not adjectives).
7. **Reproduction** — the commands, verbatim, that regenerate the results.
8. **Threats to validity** — what could make the results wrong or
   non-generalizable, stated by the author before a reviewer has to.
9. **Implications** — what should change because of this (issues to file,
   gap-analysis entries, follow-up studies).
10. **References** — numbered, resolvable. Real citations to real works;
    a reference nobody can look up is not a reference.

## The evidence rules

1. **Every number is traceable.** A number appears in Results only if it
   comes from (a) a test assertion committed in the repo, (b) a committed
   artifact with the command that produced it, or (c) an independent
   derivation shown in the study or its artifacts. A number that "should be
   about right" is fabrication; write "not yet measured" instead — an honest
   hole beats a plausible fill.
2. **Reproduction is a command, not a description.** "Run the benchmark" is
   not reproducible; `dotnet run --project WSB.Console` is. If reproduction
   needs setup, the setup steps are part of the section.
3. **Validate the instrument before trusting its readings.** A measurement
   tool, harness, or reimplementation is itself a claim. Before its output
   counts as evidence, show it reproducing known-good results (e.g. a
   cross-implementation replica must first match the original's verified
   test values exactly — then its novel outputs are evidence, clearly
   labeled as coming from the replica until confirmed on the original).
4. **Separate claim from evidence.** Every claim in Results names its
   evidence: which test, which artifact, which derivation. A reader must be
   able to check any single claim without re-doing the whole study.
5. **Surprising and negative results get written up.** "The implementation
   does not match its specification" or "the optimization made it slower"
   is usually the most valuable study in the folder. The standard exists
   precisely so these findings land somewhere citable instead of dying in a
   chat log.
6. **Studies pin the code they describe.** Code moves; a study is about the
   code as it was. The header records the state studied; if the finding is
   later fixed, the study stays as the record and the fix cites it.
7. **Tests and studies feed each other.** Independently derived expected
   values in a test suite are research artifacts — studies cite them as
   evidence (see rule 3). Conversely, a study's verified result should,
   where practical, be pinned as a regression test so the finding can't
   silently regress.

## From study to paper (LaTeX)

The markdown study is the working record; when a result needs to travel
outside the repository — a university submission, a conference, a PDF to
hand someone who won't read GitHub markdown — it graduates to a LaTeX
paper. The paper is a *presentation* of a study, never a replacement for
one, and the estate already writes its formal documents in LaTeX
(`<saas>/docs/business_analysis.tex`,
`pitch-deck-demium.tex`), whose shared preamble — 11pt A4 `article`, the
house color palette, `titlesec` section styling, `fancyhdr`,
`hyperref` — is the house look papers keep.

- **Start from [`PAPER-TEMPLATE.tex`](PAPER-TEMPLATE.tex)** — the house
  preamble plus a paper-shaped skeleton (title block, abstract,
  Introduction with the RQs, Background, Method, Results, Discussion
  covering threats and implications, Conclusion, a Reproducibility section,
  `thebibliography`). Copy it to `docs/research/papers/NN-SLUG.tex`, keeping
  the companion study's number and slug.
- **A paper introduces no numbers of its own.** Every figure in the paper
  is already in the companion study, traceable under the evidence rules
  there. If writing the paper surfaces a number the study doesn't have, the
  study gets updated (and re-verified) first.
- **The paper states its status and pins its study.** The title block names
  the companion study file and the commit it describes; while the study is
  not `verified`, the paper carries a visible DRAFT marker (the template's
  `\paperstatus` command drives both the title block and the running
  header).
- **PDFs are build output.** Only the `.tex` is committed; the repo's
  `.gitignore` covers LaTeX intermediates (`*.aux`, `*.log`, `*.out`,
  `*.toc`) and the generated PDF. Build with `pdflatex` run twice (for
  cross-references):

  ```bash
  cd docs/research/papers && pdflatex NN-SLUG.tex && pdflatex NN-SLUG.tex
  ```
- **Self-contained single file.** References use `thebibliography`, not
  BibTeX, so a paper travels as one file; the bibliography mirrors the
  study's numbered reference list and always cites the repository itself
  (study + artifacts) as an entry.

## Building the PDF in CI

The build command above is the manual, local recipe. A repository may also
wire a GitHub Actions workflow that builds the same PDF on demand, so a
reader gets a download link instead of a local LaTeX install. This is not a
requirement of the standard — a repository following the rules above is
compliant with nothing committed but the `.tex` — but where a workflow
exists, it follows the shape below rather than reinventing one, because the
estate already has two worked examples of this exact problem solved two
different ways.

**The pattern**: one `xu-cheng/latex-action@v4` step per `.tex` root file (no
hand-rolled `apt install texlive` — the action's image already carries a full
TeX Live), a rename step so the artifact is not left with the bare
`NN-SLUG.pdf` name, and either an `actions/upload-artifact` step (a build
artifact, downloaded from the run) or a two-job `build` then `release` split
ending in `softprops/action-gh-release` (a release asset, attached to a tag)
— whichever matches how the paper is meant to be consumed. `permissions:`
stays `contents: read` for the artifact-only shape and rises to
`contents: write` only in the job that actually creates a release, never at
the workflow's top level.

**Two triggers, chosen by what the paper is a presentation of:**

- **Tag-driven**, when the paper is versioned alongside a release —
  `copilot-scope/.github/workflows/build-research-pdf.yml` builds two papers
  (`research/articles/*.tex`) on every `v*`/`V*` tag push, renames each to a
  product-prefixed filename, and attaches both to the GitHub Release the tag
  creates. Its own comments record a real incident worth repeating here: a
  tag once pushed as `V1.0.8` matched neither pattern the workflow originally
  declared, and that release shipped with no PDF attached — hence matching
  both `v*` and `V*` explicitly, rather than assuming contributors will
  always tag the same way.
- **Manual only** (`workflow_dispatch`, no other trigger), when the document
  has no release cadence of its own — a living overview, or anything rebuilt
  whenever someone wants the current file rather than whenever something
  ships. `agent-eval-bench/.github/workflows/build-overview-pdf.yml` is the
  worked example: it renders a project-overview paper (not a research-study
  paper under this standard — see "What counts as research" above) to a
  downloadable run artifact, with no tag trigger and no release, because
  nothing about that document is versioned by tag.

A workflow's trigger says what kind of document it builds before a reader
ever opens the `.tex` file: a workflow only a human can start is a document
that only exists when someone asks for it; a workflow a tag starts is a
document that ships with a release, and the release is incomplete without it.

## Relationship to the rest of the standards

- The constitution's testing principles govern *whether the code works*;
  this standard governs *how claims about the code's behavior are made and
  recorded*. A study is not a substitute for tests, and vice versa.
- A repo adopting this standard links `docs/research/` from its README the
  same way it links its architecture docs.

## Worked example

- `bayesian-inference/docs/research/` — the first adoption: study
  `01-STOCKBN-CPT-UNDERSPECIFICATION.md` validates a Python replica of the
  repo's Enumeration-Ask engine against the engine's own unit-test
  posteriors (rule 3), then uses it to show that the shipped demo network's
  two-parent CPTs are under-specified in a way that zeroes out entire
  branches of the joint distribution — a surprising negative result (rule
  5) with every number traceable to a committed artifact (rule 1).
