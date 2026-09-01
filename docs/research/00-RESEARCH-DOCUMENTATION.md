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

## Presenting work as slides (Beamer)

A paper is not the only shape work graduates into outside the repository —
a talk needs slides. This is a sibling convention to "From study to paper"
above, not a restatement of it: a deck is not necessarily derived from one
study the way a paper is, so it carries no `\paperstatus`-style verified/draft
marker of its own, and it introduces no evidence rules — a slide either
restates something the repository's docs already establish, or it does not
belong in the deck.

- **Start from [`BEAMER-THEME.sty`](BEAMER-THEME.sty)** — the house Beamer
  theme (teal/purple/blue palette, triangle bullets, a `[standout]` frame
  style for section breaks and closing slides), canonicalized here from its
  origin,
  [`DeepDiveInto_CSharp_Dictionaries_presentation`](https://github.com/konradcinkusz/DeepDiveInto_CSharp_Dictionaries_presentation).
  Copy it into `docs/slides/` **as `beamerthememybeamer.sty`** — that exact
  filename, not `BEAMER-THEME.sty` — because `\usetheme{mybeamer}` resolves
  to a file named that way via kpathsea, regardless of what the file
  internally calls itself.
- **A deck lives at `docs/slides/<repo-slug>-slides.tex`**, a sibling to
  `docs/research/papers/` for papers. `aspectratio=169`; title, author,
  institute and a `\titlegraphic` linking back to the repository are the
  only things a new deck must fill in — the theme supplies everything else.
- **PDFs are build output here too.** Only the `.tex` and the copied-in
  `.sty` are committed; nothing generated is. Beamer drops more litter than
  `article` does, so a `.gitignore` written for papers alone is not enough:
  alongside `*.pdf`, `*.aux`, `*.log` and `*.out` it needs `*.nav`, `*.snm`,
  `*.toc` and `*.vrb`. Ignore them per directory (`docs/slides/*.nav`, not a
  bare `*.nav`) so the pattern says which build it belongs to. The build needs
  two passes locally, same reason a paper does — the footline's
  `\inserttotalframenumber` needs a prior run's `.aux` — but `latexmk`
  (what `xu-cheng/latex-action` drives in CI, see below) reruns
  automatically and needs no special handling for that.
- **A known defect, fixed in this copy.** The origin file's `[standout]`
  style sets `\setbeamercolor{normal text}{fg=white,...}` to make body text
  readable against the dark background, but `\setbeamercolor` alone only
  redefines a color for *future* lookups — it does not re-apply an
  already-established `\normalcolor`. Left unpatched, `[standout]` frame
  text renders in the pre-existing dark foreground, illegible against the
  dark background. `BEAMER-THEME.sty` here carries a one-line
  `\usebeamercolor*{normal text}` fix, with the reasoning recorded in the
  file's own header comment — found and fixed while building the second
  adopting deck, not merely inherited unread. Rule 5's reasoning applies
  as much to a one-line theme bug as to a research finding: a surprising
  result recorded beats one that dies in a chat log, however small.

## Documents that borrow the house style without being studies

Not everything that leaves the repository as a PDF is a study, or a paper
derived from one. A project overview, a university thesis, a talk deck — each
is a different kind of document, and this standard's evidence rules do not
govern any of them. What they may legitimately share is the house look,
because two documents handed to the same reader should look like they came
from the same shop.

- **Say what the document is not, in its own header.** The `.tex` header
  comment names the document's kind and states plainly that it is not a
  research paper under this standard, so a later reader does not take the
  shared preamble for a claim of one.
  `agent-eval-bench/docs/papers/agent-eval-bench-overview.tex` opens with
  exactly that paragraph.
- **`docs/papers/` is the honest sibling to `docs/research/papers/`.** A
  non-study document lives in `docs/papers/`, where the path itself keeps the
  distinction visible. Filing it under `docs/research/papers/` to inherit an
  existing `.gitignore` line buys one line of config at the cost of the term
  this standard defines narrowly on purpose — `agent-eval-bench`'s ADR-0006
  records that trade being considered and rejected.
- **`\paperstatus` is repurposed, not dropped.** The template's status marker
  drives both the title block and the running header, so a document that has
  no `draft`/`verified` axis gives it that document's own status instead (a
  project's phase, say) and says so in the header comment — the command now
  means something else than the template's own comment claims.
- **Name the source of truth, and add nothing to it.** A presentation document
  names the markdown it presents and introduces no fact that document does not
  already carry. This is the non-research analogue of "a paper introduces no
  numbers of its own", and it exists for the same reason: two documents that
  are allowed to disagree eventually will.
- **State the drift you are accepting.** A curated `.tex` presentation of a
  markdown document is not a mechanical transform, so nothing enforces that an
  edit to one reaches the other. Record that as an accepted consequence rather
  than implying a convention covers it, and if the two visibly diverge more
  than once, add a cheap mechanical check (a section-heading diff) rather than
  a full change-coupling rule.

## Diagrams in a PDF

GitHub renders Mermaid; a PDF does not. Every document under this standard
that carries a diagram meets that gap, and it has exactly one wrong answer:
redrawing the picture a second time in TikZ for the PDF edition. That is two
sources of truth for one diagram, and it drifts.

- **One source, two output formats.** A diagram's source lives once, in its
  own file — `docs/diagrams/<slug>.mmd`, one diagram per file. The markdown
  that renders on GitHub carries that same source inline, because inline is
  the only form GitHub renders, and a check keeps the two byte-identical
  rather than a convention asking people to remember
  (`agent-eval-bench/scripts/check-diagrams.mjs`, which joins a section headed
  `### A1. …` to the file whose name starts `a1-`, so the filename stays free
  to describe the diagram while the id does the joining).
- **Render to vector, not to raster.** A `.mmd` renders straight to PDF
  (`mmdc -i … -o ….pdf --pdfFit -b transparent`), which scales, prints, and
  keeps its text selectable and searchable. A PNG in a paper is a screenshot
  of a diagram.
- **Rendered diagrams are build output too.** They land in
  `docs/diagrams/rendered/` and are gitignored under the same rule as the PDFs
  themselves — nothing generated is committed. The `.tex` includes them by
  relative path:
  `\includegraphics[width=0.7\linewidth]{../diagrams/rendered/<slug>.pdf}`.
- **Pin the renderer, and resolve it locally.** `@mermaid-js/mermaid-cli` is a
  pinned devDependency, so `npm ci` provides the version the lockfile records
  and Dependabot tracks it. Invoke `node_modules/.bin/mmdc` directly rather
  than `npx mmdc`: on a fresh clone whose `node_modules` is still empty, `npx`
  reaches past it to the registry and resolves a squatter package literally
  named `mmdc`, then fails with a message that names nothing useful. A missing
  binary should say "run `npm ci`".
- **Pass `--no-sandbox`, because the renderer drives a headless Chromium.** CI
  containers and dev containers both commonly run as root, where Chromium's
  sandbox refuses to start; `--no-sandbox --disable-setuid-sandbox
  --disable-dev-shm-usage` is the working set. Where the environment already
  has a browser, point the renderer at it
  (`PUPPETEER_EXECUTABLE_PATH` / `CHROME_BIN`) instead of downloading a second
  one.
- **The render step runs before the LaTeX step in CI** (see below). A workflow
  that builds a diagram-carrying paper without it fails on the first
  `\includegraphics` whose file is not there.

Worked example: `agent-eval-bench/scripts/render-diagrams.mjs` renders all 22
of that repository's diagrams, and takes slug filters when only one changed.

## Publishing a document in more than one language

A document that has to reach readers who do not share a language gets a second
edition rather than a compromise between the two.

- **An edition is a sibling file with a language suffix** —
  `<name>.tex` beside `<name>.<lang>.tex`
  (`agent-eval-bench-overview.tex` and `agent-eval-bench-overview.pl.tex`),
  mirroring the `.pl.md` suffix the same repository uses for its bilingual
  markdown. Same directory, same build, one visible difference in the name.
- **Set the language in the preamble, not only in the prose.**
  `\usepackage[polish]{babel}` — or the relevant option — is what gives the
  edition correct hyphenation and typographic conventions. Without it the text
  is translated but still typeset as English.
- **Translate against terminology that already exists.** Where the repository
  already publishes translated documents, a new edition matches their
  vocabulary instead of inventing its own; otherwise one concept acquires two
  names inside one estate. `agent-eval-bench`'s Polish paper states this in
  its header: the terminology is chosen to match `docs/index.pl.html`, and it
  is deliberately not an independent translation.
- **One workflow builds every edition, into one artifact.** One
  `latex-action` step per root file, one rename step, and a single
  `upload-artifact` carrying all of them — so a reader downloads a bundle
  rather than hunting for the run that built the other language.
- **Two copies is a drift surface, and the answer is a check.** For markdown
  pairs the mechanical rule is cheap enough to be worth having: a commit
  editing one half must edit the other
  (`agent-eval-bench/scripts/check-doc-parity.mjs`, which declares which
  directories and files are bilingual and fails a diff that touches one side
  alone). No script can verify a translation is *correct*; this one verifies
  that somebody looked, which is the failure that actually bites — a wrong
  command fixed in one language, left wrong in the other, with nothing going
  red.

## Building the PDF in CI

The build command above is the manual, local recipe. A repository may also
wire a GitHub Actions workflow that builds the same PDF on demand, so a
reader gets a download link instead of a local LaTeX install. This is not a
requirement of the standard — a repository following the rules above is
compliant with nothing committed but the `.tex` — but where a workflow
exists, it follows the shape below rather than reinventing one, because the
estate already has three worked examples of this exact problem, covering
both a paper and a Beamer deck.

**The pattern**: one `xu-cheng/latex-action@v4` step per `.tex` root file (no
hand-rolled `apt install texlive` — the action's image already carries a full
TeX Live), a rename step so the artifact is not left with the bare
`NN-SLUG.pdf` name, and either an `actions/upload-artifact` step (a build
artifact, downloaded from the run) or a two-job `build` then `release` split
ending in `softprops/action-gh-release` (a release asset, attached to a tag)
— whichever matches how the paper is meant to be consumed. `permissions:`
stays `contents: read` for the artifact-only shape and rises to
`contents: write` only in the job that actually creates a release, never at
the workflow's top level. A document whose figures are generated rather than
drawn by hand — Mermaid diagrams, per "Diagrams in a PDF" above — needs its
render step *before* the first `latex-action` step, installing from the
lockfile (`npm ci`) rather than resolving whatever the registry's floating
latest happens to be on the day the PDF gets built;
`agent-eval-bench/.github/workflows/build-overview-pdf.yml` is the worked
example of that ordering.

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
  nothing about that document is versioned by tag. The same repository's
  `build-slides-pdf.yml` is the second manual-only example, one document
  later: a Beamer deck (see "Presenting work as slides" above), in its own
  workflow file rather than folded into the overview one, because a talk
  deck and a project overview are different kinds of document for
  different audiences — the next rule is exactly why that separation holds.
  `-WUT-Thesis-Communicative-Agents-for-Software-Project-Management/.github/workflows/build-thesis-pdf.yml`
  is a third manual-only example, and a different kind of document again: a
  university thesis (`main.tex`, on the EiTI `eiti-thesis.cls` template) is
  neither a research-study paper under this standard nor a project overview
  — it's the institution's own long-form deliverable — but it still has no
  tag or release cadence, so the same manual/artifact shape applies. It also
  surfaces a wrinkle the other two examples don't hit: the thesis sources
  render code listings with the `minted` package, which shells out to
  Pygments, so its workflow additionally needs `latexmk_shell_escape: true`
  and `extra_system_packages: py3-pygments` — a document with `minted`
  listings needs both, or the build fails the moment it reaches the first
  one.

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
