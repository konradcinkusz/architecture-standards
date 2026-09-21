<!-- Generated copy of docs/research/00-RESEARCH-DOCUMENTATION.md — do not edit. Relative links have been rewritten to absolute repository URLs. -->

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
[`TEMPLATE.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/research/TEMPLATE.md) to start one):

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

- **Install [`HOUSE-PREAMBLE.tex`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/research/HOUSE-PREAMBLE.tex) once per repository**,
  as `docs/research/papers/house-preamble.tex` (or `docs/papers/` for a
  non-study document — see below), and **start the paper from
  [`PAPER-TEMPLATE.tex`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/research/PAPER-TEMPLATE.tex)**, which is a paper-shaped
  skeleton that `\input`s it: title block, abstract, Introduction with the
  RQs, Background, Method, Results, Discussion covering threats and
  implications, Conclusion, a Reproducibility section, `thebibliography`.
  Copy the template to `docs/research/papers/NN-SLUG.tex`, keeping the
  companion study's number and slug. Why the preamble is a file rather than a
  block you copy is the next section, and it is the difference between a
  house style that holds and one that only claims to.
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
  `.gitignore` covers the LaTeX intermediates (the full list, and the
  per-directory rule that keeps it readable, is under "What a `.gitignore`
  for LaTeX actually has to cover" below) and the generated PDF. Build with
  `pdflatex` run twice (for cross-references):

  ```bash
  cd docs/research/papers && pdflatex NN-SLUG.tex && pdflatex NN-SLUG.tex
  ```
- **Self-contained single file.** References use `thebibliography`, not
  BibTeX, so a paper travels as one file; the bibliography mirrors the
  study's numbered reference list and always cites the repository itself
  (study + artifacts) as an entry.

## The house preamble is a file, not a block

The house look — 11pt A4 `article`, the color palette, `titlesec` section
styling, `fancyhdr`, `hyperref` — was extracted from the estate's first
formal documents (`<saas>/docs/business_analysis.tex`,
`pitch-deck-demium.tex`) so that a document from any repository looks like it
came from the same shop. That is the claim. **Distributing it as a block to
copy into each new document does not hold the claim, and the estate has the
measurement to prove it.**

Across the three repositories that adopted this standard, against the seven
markers that make up the house look — the colors, `titlesec` section
formatting, the `fancyhdr` header, `\paperstatus`, `\repopath`, the 2.2cm
geometry and the `colorlinks` scheme:

| | markers held |
|---|---|
| `agent-eval-bench`, both editions | 7 of 7 |
| `marcus-shop`, six documents via one shared preamble | 7 of 7 |
| **`ab-ove`, both editions** | **0 of 7** |

`ab-ove` reached for `margin=28mm`, `hyperref[hidelinks]`, `\maketitle`, a
private `\code{}` where the house has `\repopath{}`, and a hardcoded
`\date{14 September 2026}` where the house has `\today`. Nothing was wrong
with the author; the mechanism was wrong. A convention about copying a
preamble correctly has nothing to fail, so it failed quietly.

Over the same period the **Beamer theme propagated byte-identically** — the
adopting copy differs from the canonical one only by the 22-line adoption
header — because it was always distributed as a file. That is the whole
lesson:

- **One `house-preamble.tex` per repository, `\input`ed by every document in
  it.** Fixing the house style is then one edit, not one edit per document,
  and a new document cannot drift out of it by being written from memory.
  `marcus-shop`'s `docs/papers/preambula.tex` is the worked example: six
  documents, one preamble.
- **The preamble carries no `\documentclass` and no `\begin{document}`.**
  Those stay in each document, so one preamble can serve documents with
  different classes.
- **It takes a contract, stated in its own header.** The including document
  defines `\paperstatus`, `\headerleft`, `\pdftitleline` and
  `\pdfauthorline` *before* the `\input` — before, because the preamble reads
  them as it is read, and defining them after compiles a document with an
  empty header and wrong PDF metadata. `marcus-shop`'s preamble states its
  four-command contract the same way, at the top, which is why a sixth
  document could adopt it without reading it.
- **A document that needs more packages loads them after the `\input`, with a
  comment saying they are an addition.** `agent-eval-bench` adds `tikz`,
  `pifont` and `amssymb` and labels them "not in the house template", so the
  next reader can tell house from local at a glance.
- **`\paperstatus` rides in the header of every page.** A reader who opens the
  PDF at page 9 still sees DRAFT. That is why the marker is in the running
  header and not only on the title page.
- **A repository that must deviate says so where deviations are recorded.** A
  thesis on an institution's own class cannot also carry the house geometry;
  that is a legitimate exemption, and it belongs in the repository's
  deviation register with a reason, not in an untracked difference between
  two PDFs.

## Presenting work as slides (Beamer)

A paper is not the only shape work graduates into outside the repository —
a talk needs slides. This is a sibling convention to "From study to paper"
above, not a restatement of it: a deck is not necessarily derived from one
study the way a paper is, so it carries no `\paperstatus`-style verified/draft
marker of its own, and it introduces no evidence rules — a slide either
restates something the repository's docs already establish, or it does not
belong in the deck.

- **Start from [`BEAMER-THEME.sty`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/research/BEAMER-THEME.sty)** — the house Beamer
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
  `article` does, so a `.gitignore` written for papers alone is not enough —
  the full list, and the per-directory rule, are under "What a `.gitignore`
  for LaTeX actually has to cover" below. The build needs two passes locally,
  same reason a paper does — the footline's `\inserttotalframenumber` needs a
  prior run's `.aux` — but `latexmk` (what `xu-cheng/latex-action` drives in
  CI, see below) reruns automatically and needs no special handling for that.
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
  are allowed to disagree eventually will. The house preamble's `\housetitle`
  takes that line as its last argument, so the provenance sits on the title
  page rather than only in a header comment a PDF reader never sees.
- **The house preamble is the same file here.** A non-study document in
  `docs/papers/` `\input`s the same `house-preamble.tex` a study paper in
  `docs/research/papers/` does — one copy per repository, wherever its
  documents live. Borrowing the look is the point; borrowing it by retyping
  it is what the previous section measures the cost of.
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
- **Set the language in the preamble, not only in the prose.** babel — with
  the relevant option — is what gives the edition correct hyphenation and
  typographic conventions. Without it the text is translated but still
  typeset as English. It is loaded *after* `fontenc` and `inputenc`, because
  babel reads the active font encoding while setting up its shorthands; the
  house preamble orders those three for you.
- **An edition differs from its sibling by a switch, not by a second
  preamble.** Everything that has to change between editions — the babel
  language, the labels any local macro prints, which rendering of a diagram
  gets included — is driven by what the edition file defines *before* the
  `\input`. With the house preamble that is two lines and nothing else:

  ```latex
  \def\houselang{polish}     % babel language for this edition
  \def\editionsuffix{.pl}    % which rendering of each diagram to include
  ```

  `marcus-shop` is the worked example and the origin of the pattern: a single
  `\def\edycjaEN{1}` before its `\input` flips babel, two macro labels and the
  diagram path at once — *one set of macros, two sets of text*. The failure it
  avoids is the one a second preamble guarantees: two preambles diverge, and
  the divergence shows up as a typographic difference nobody can attribute.
- **Call a figure by slug; let the edition resolve the file.** The house
  preamble's `\dgm` turns a slug into the rendered path for the current
  edition, so the body text names a diagram the way the diagrams directory
  does:

  ```latex
  \includegraphics[width=0.78\linewidth]{\dgm{a1-system-context}}
  ```

  In the default edition that resolves to
  `../diagrams/rendered/a1-system-context.pdf`; in an edition that set
  `\editionsuffix` to `.pl`, to `…-a1-system-context.pl.pdf`. A repository
  whose editions share one set of diagrams never sets `\editionsuffix`, and
  every edition resolves to the same file — so the macro costs nothing to
  adopt and the decision below stays open.

  Hardcoding the path instead costs one edit per figure per edition, and the
  estate has already paid it: `ab-ove` maintains `b1-reader-loop.pdf` in its
  English file against `b1-reader-loop.pl.pdf` in its Polish one, by hand, in
  both. At three figures that is survivable. `agent-eval-bench` has 23.
- **Decide, once and in writing, whether the diagrams are translated too.**
  The three adopting repositories answer this three different ways, which is
  fine — it is a real trade — but two of them answered it by accident.
  - `agent-eval-bench` ships **one English set** for both editions: no
    `.pl.mmd` exists, so its Polish reader gets Polish prose around English
    boxes. Cheapest to maintain, and defensible for a document whose diagram
    labels are mostly code identifiers anyway.
  - `marcus-shop` ships **a set per language** and says why in
    `docs/diagrams/README.md`: *a shared English set would mean the Polish
    edition loses exactly the part that gets read most* — these are documents
    people memorize from, and a diagram carries the most content per unit of
    space. It also names the cost in the same paragraph: two files per
    diagram, and a drift the build cannot see.
  - `ab-ove` ships a set per language too, but by hardcoding both paths
    rather than by deciding.

  Either answer is compliant. **What is not compliant is having the answer
  emerge from whichever path somebody typed first.** State it where the
  diagrams live, with the cost named, as `marcus-shop` does.
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

  **The same rule applies to `.tex` editions, and until now nothing applied
  it.** `docs/papers/` sat outside every check in all three repositories:
  the parity check covers `.md` only, so the edition pairs this section calls
  siblings were checked by nothing. See "Checking the papers" below.

## One trunk, several editions

A second *language* edition is not the only kind. A document can also have a
second *variant* — a basic and an advanced edition of the same material, a
public and an internal cut — where most of the content is shared and a named
few sections are not. The naive answer is two files that started as a copy,
and it decays the same way every other copy does.

`marcus-shop` is the worked example: six PDFs — a basic and an advanced
edition of a session plan, plus a question bank, each in two languages — from
one trunk.

- **The shared sections are files, `\input`ed by every edition that carries
  them.** `docs/papers/wspolne/` holds eight of them (`wspolne` is Polish for
  *common*; an English-speaking repository would call the directory
  `shared/`). An edition is then a spine: its own front matter, its own
  variant-only sections, and `\input` lines where the shared material goes.
- **A shared section is a section, not a fragment.** It begins at a
  `\section` and ends before the next one, so an edition can place it without
  knowing anything about its insides, and moving it is moving one line.
- **The editions differ where they are meant to differ, visibly.** Reading
  `marcus-shop`'s basic edition against its advanced one, the difference is
  the presence or absence of `\input` lines and a handful of local sections —
  not a diff of prose that has to be read word by word to find the three
  places somebody changed.
- **Shared sections make every edition a dependent of every edit.** That is
  the point, and it is also the cost: a change to one trunk file changes
  every document that includes it. Build them together rather than
  separately, in one workflow, so the blast radius is visible in one run —
  `marcus-shop`'s workflow builds all six in one job and says in its header
  comment that this is why.
- **Language editions of a trunk get their own trunk directory**
  (`shared/` and `shared/en/`), not a switch inside each shared file. A
  language switch inside prose is a file half of whose lines are inert in any
  given build, and it is the one place the edition-switch pattern above does
  not pay: `\def` flips a label or a path cleanly, and it does not flip six
  paragraphs.

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

**The trigger answers two questions, not one.** *What produces the
deliverable* and *what catches the break* are separate, and a workflow may
need a trigger for each. Reaching for one trigger and assuming it covers both
is what leaves a document that builds on demand and is broken in between.

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
- **Manual *and* pull-request, when the document is the repository's
  product.** Manual-only carries a cost `agent-eval-bench` named in its own
  ADR-0006 and accepted: *"nothing triggers it automatically, so a break is
  caught only the next time a human clicks Run workflow."* For a repository
  whose code is the product and whose overview is a side artifact, that is
  the right trade. For a repository whose **documents are the product**, it
  is not: a LaTeX typo or a diagram that stopped rendering is invisible in
  the diff and surfaces on the day the file is actually needed.
  `marcus-shop/.github/workflows/build-prep-pdf.yml` is the worked example
  and names the departure from `agent-eval-bench` explicitly in its header
  comment. It keeps `workflow_dispatch` as the way to *get* a fresh PDF and
  adds `pull_request` with a path filter as the way to *catch* a break —

  ```yaml
  on:
    workflow_dispatch:
    pull_request:
      paths:
        - 'docs/papers/**'
        - 'docs/diagrams/**'
        - 'scripts/**'
        - 'package.json'
        - 'package-lock.json'
        - '.github/workflows/build-prep-pdf.yml'
  ```

  The path filter is what keeps the cost at zero for every change that does
  not touch the document. A repository that adds the PR trigger without one
  has bought a LaTeX build on every commit, which is the reason manual-only
  was the default in the first place.

**Offer the engine as an input when the document may outgrow `pdflatex`.**
A document written ASCII-only compiles under `pdflatex` with a stock TeX
Live, and that is the cheapest thing to keep working. But a revision that
quotes a second language needs a Unicode engine, and discovering that during
a build is worse than having the switch ready.
`ab-ove/.github/workflows/build-overview-pdf.yml` carries it as a
`workflow_dispatch` choice input, defaulting to the cheap answer and saying
in the description when to pick another:

```yaml
on:
  workflow_dispatch:
    inputs:
      engine:
        description: 'TeX engine. pdflatex is the default; pick xelatex or lualatex if the paper uses system fonts or needs full Unicode shaping.'
        required: true
        type: choice
        default: pdflatex
        options: [pdflatex, xelatex, lualatex]
```

This pairs with the ASCII-only rule for diagram sources under "Diagrams in a
PDF": the rule keeps the default edition on the cheap engine, and the input
is the escape hatch for the day it stops being enough.

A workflow's trigger says what kind of document it builds before a reader
ever opens the `.tex` file: a workflow only a human can start is a document
that only exists when someone asks for it; a workflow a tag starts is a
document that ships with a release, and the release is incomplete without it;
and a workflow a pull request starts is a document the repository exists to
produce.

## What a `.gitignore` for LaTeX actually has to cover

Nothing generated is committed — not the PDF, not the rendered diagrams, not
the intermediates. The list is longer than it first looks, and all three
adopting repositories got a different part of it wrong.

- **The `article` set**: `*.pdf`, `*.aux`, `*.log`, `*.out`, `*.toc`.
- **Beamer adds four**: `*.nav`, `*.snm`, `*.toc`, `*.vrb`. A `.gitignore`
  written for papers alone does not cover a deck.
- **`latexmk` adds three more**: `*.fdb_latexmk`, `*.fls` and `*.synctex.gz`.
  These are easy to miss because the manual recipe in this standard is
  `pdflatex` run twice, which produces none of them — but `latexmk` is what
  `xu-cheng/latex-action` drives, so the first contributor who reproduces the
  CI build locally, or runs `latexmk` because it handles the rerun for them,
  gets all three as untracked files. `marcus-shop` hit it and added them; the
  other two have not, and will.
- **Ignore per directory, not bare.** `docs/papers/*.aux`, not `*.aux`, so
  the pattern says which build it belongs to. `agent-eval-bench` holds this
  throughout. `ab-ove` is the anti-example and an instructive one: its
  `.gitignore` *explains the per-directory rule in a comment* and then writes
  bare `*.aux` and `*.toc` beside a scoped `docs/papers/*.pdf`. A rule stated
  next to its own violation is what happens when a file is edited twice by
  people reading different parts of it — which is the argument for the check
  below rather than for a longer comment.

## Checking the papers

The rules in this standard were, until now, enforced by prose alone, and the
measurement in "The house preamble is a file" is what prose alone bought.
[`CHECK-PAPERS.mjs`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/research/CHECK-PAPERS.mjs) is the mechanical half: copy it to
`<repo>/scripts/check-papers.mjs`, fill in its configuration block, and run
it in the same lint job as the repository's other documentation checks. It
has no dependencies and compiles nothing.

It checks four things:

1. **Every document root `\input`s the house preamble** — the drift in the
   table above, caught at lint time.
2. **The contract is met before that `\input`** — a missing `\headerleft` is
   a named failure rather than an `Undefined control sequence` eighty lines
   into a CI log.
3. **The repository's copy of the preamble still matches the one it was taken
   from**, by digest — so a local edit to the house style is a deliberate act
   with a visible diff and a proposed amendment, not a silent fork. This is
   the check the Beamer theme never needed and the preamble always did.
4. **Language editions pair, couple, and call their figures by slug** — both
   halves exist, neither is edited alone (the coupling half needs a base ref,
   same as the markdown parity check), and no document with editions writes a
   rendered diagram path by hand.

**A build catches a broken document; this catches a document that builds
perfectly and is wrong anyway.** Run both. And note what it does not do: no
script can check that a translation is correct, and this one does not try.
Its coupling rule checks that somebody looked.

Exemptions are allowed — a thesis on an institution's class cannot also carry
the house geometry — and an exemption with an empty reason fails the check,
because an exemption nobody had to justify is one nobody will revisit.

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

On the LaTeX track specifically, the three adopting repositories are worth
reading against each other, because between them they cover every rule above
and disagree in the places this standard now names:

- `marcus-shop-factorial-part3/docs/papers/` — the furthest along, and the
  origin of most of what this standard gained in this revision: one
  `preambula.tex` `\input`ed by six documents with its four-command contract
  stated in its own header, a `\def\edycjaEN{1}` edition switch, the
  `\dgm{}` figure macro, a `wspolne/` trunk shared by two editions, and a
  workflow that builds all six together on dispatch *and* on pull request.
  Also the source of `\long\def` for a macro whose argument spans
  paragraphs, with the error it prevents recorded in the comment:
  `Paragraph ended before \text@command was complete`.
- `agent-eval-bench/docs/papers/` and `docs/slides/` — the reference for
  everything the previous revision covered: a paper in two language
  editions, a Beamer deck in its own workflow, a header that says plainly
  what the document is not, per-directory ignore patterns, and ADR-0006
  recording the manual-only trade that `marcus-shop` later departed from
  with reasons.
- `ab-ove/docs/papers/` — the anti-example for the house preamble, the
  hardcoded figure path and the bare ignore pattern, and simultaneously the
  estate's best example of a document stating what it is not: its 47-line
  header names the genre, names the markdown that is the source of truth,
  and says which one is right if they disagree. Both things are true of the
  same file, which is the point — the prose rules held, and only the
  mechanical ones drifted.
