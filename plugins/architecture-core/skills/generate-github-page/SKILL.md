---
name: generate-github-page
description: >-
  Use when a repository wants a published GitHub Pages landing page - a
  one-pager, not a documentation site. Derives the owner, repo name and the
  GitHub Pages URL from the git remote (including the owner.github.io
  root-page special case), fills in the bundled one-page HTML/CSS template
  (the same design system this repository's own page uses) with that repo's
  real tagline, stats and links rather than invented content, reuses this
  repository's deploy-pages.yml workflow verbatim since it already takes no
  repository-specific parameters, and names the one manual step no API can
  perform - switching Settings, Pages, Source to GitHub Actions. Refuses to
  silently overwrite an existing hand-tuned page or deploy workflow.
argument-hint: "[tagline]"
---

# Generating a GitHub Pages one-pager

Turns any repository into a published GitHub Pages site — one self-contained HTML file,
no build step, no framework, no dependency — parameterized for *that* repository rather
than copied from another one's. This document and its bundled template were extracted
from this repository's own page: `docs/index.html` and
[`.github/workflows/deploy-pages.yml`](https://github.com/konradcinkusz/architecture-standards/blob/main/.github/workflows/deploy-pages.yml) are a
real, deployed instance of exactly what this procedure produces, not a hypothetical
example written for the occasion.

**The page is a landing page, not documentation.** It exists to answer "what is this and
why would I click through", in under a screen's worth of scrolling, for someone who has
never seen the repository before. It is not a docs site, has no navigation beyond the
links on it, and does not attempt to reproduce the README — it points at the README, and
at whatever else is worth a click, and stops. A repository that wants a full multi-page
documentation site wants a different tool than this one; this procedure's whole value is
being small enough to read in one sitting and cheap enough to keep true.

**Contents**

1. [The argument, and what is derived automatically](#1-the-argument)
2. [Preflight](#2-preflight)
3. [The tree this creates](#3-the-tree-this-creates)
4. [Deriving the page's content](#4-deriving-the-pages-content)
5. [The logo](#5-the-logo)
6. [The deploy workflow — reused verbatim](#6-the-deploy-workflow)
7. [The one manual step](#7-the-one-manual-step)
8. [Verification](#8-verification)
9. [Failure modes](#9-failure-modes)
10. [Checklist](#10-checklist)

---

## 1. The argument

`/generate-github-page [tagline]` — the tagline is optional and, if given, overrides the
one this procedure would otherwise derive from the README (§4). Everything else is
derived from the repository itself; there is no repository-name argument the way
[`/init-generic-template`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/scaffold/INIT-GENERIC-TEMPLATE.md) takes one, because this procedure
never creates a repository, only a page inside one that already exists.

**Resolve the repository from `git remote get-url origin`** (falling back to asking, if
there is no remote — never invent an owner or a repo name). Parse
`github.com[:/]<owner>/<repo>(\.git)?` and derive everything below from the two captured
groups. Echo the table back before writing a single file, exactly as
[`/init-generic-template`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/scaffold/INIT-GENERIC-TEMPLATE.md) §1 does for its own derivations — a
wrong parse here means every link on the published page is wrong, and it is one look at a
table to catch instead of a page nobody proofread:

| Derived | Rule | From `konradcinkusz/architecture-standards` |
|---|---|---|
| `{{OWNER}}` | first captured group | `konradcinkusz` |
| `{{REPO_NAME}}` | second captured group | `architecture-standards` |
| `{{REPO_URL}}` | `https://github.com/{{OWNER}}/{{REPO_NAME}}` | `https://github.com/konradcinkusz/architecture-standards` |
| `{{OWNER_PROFILE_URL}}` | `https://github.com/{{OWNER}}` | `https://github.com/konradcinkusz` |
| `{{PAGES_URL}}` | `https://{{OWNER}}.github.io/{{REPO_NAME}}/` — **except** when `{{REPO_NAME}}` equals `{{OWNER}}.github.io` (case-insensitive), which is GitHub's reserved name for a user/org's *root* page: then it is `https://{{OWNER}}.github.io/`, with no repo path segment at all | `https://konradcinkusz.github.io/architecture-standards/` |

Getting the root-page case wrong is the single most common mistake here (§9) — check the
repository name against it explicitly rather than assuming the general form always
applies.

## 2. Preflight

**If `docs/index.html` already exists, read it before touching it.** A hand-tuned page
that already says something true about the repository is not a stale draft waiting to be
regenerated — overwriting it silently is the same mistake
[`/init-generic-template`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/scaffold/INIT-GENERIC-TEMPLATE.md) §2 refuses to make against an
existing application. Diff what you would generate against what is there; if the existing
page is materially the same shape (hero, optional stats, one or two content sections, a
documents list, this same footer), refine it in place rather than replacing it outright.
If it is a different design entirely, say so and ask before replacing it.

**If `.github/workflows/deploy-pages.yml` already exists**, compare it against §6's
canonical copy. If it already does the same job (build `_site/` from `docs/index.html` +
`docs/assets/`, deploy via `actions/configure-pages` + `actions/upload-pages-artifact` +
`actions/deploy-pages`), leave it alone — there is nothing to improve, and a second
Pages-deploying workflow in the same repository is a footgun (§9), not a redundancy. If it
does something meaningfully different (a Jekyll build, a docs-site generator), stop and
ask rather than silently replacing a working pipeline for a different kind of site.

## 3. The tree this creates

```
docs/
├─ index.html            the page — filled in from the bundled template (§4)
└─ assets/
   └─ logo.svg            optional — omit entirely if the repo has no icon (§5)
.github/workflows/
└─ deploy-pages.yml       Actions-based Pages deploy — copied verbatim (§6)
```

Nothing else. This procedure does not touch the README, does not add a docs generator,
and does not create a `_site/` directory in the repository — that is the deploy
workflow's own build output, produced fresh on every deploy and never committed.

## 4. Deriving the page's content

**Read [`ONE-PAGER-TEMPLATE.html`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/scaffold/ONE-PAGER-TEMPLATE.html) now** — it is this section's
other half. The template's CSS is the design system, already repo-agnostic, and is copied
verbatim; only the HTML comments marked `<!-- CUSTOMIZE -->` and the `{{TOKEN}}`
placeholders in its body change per repository. Delete every `CUSTOMIZE` comment once you
have acted on it — they are instructions for you, not content for a published page — and
confirm nothing survives by the grep in §8.

Fill in, in order:

- **`{{SITE_TITLE}}`**: `<repo-name> — <tagline shortened to a clause>`, the pattern this
  repository's own `<title>` uses. This is what shows in a browser tab and a search
  result, so it earns being distinct from the h1 below rather than a duplicate of it.
- **`{{REPO_NAME}}` and `{{TAGLINE}}`**: the h1 and the sentence under it. Pull the
  tagline from the README's opening paragraph — not the first sentence in isolation, the
  one that actually says what the thing is — or from the argument in §1 if one was given.
  State the real thing the repository does, in the estate's own voice: no "revolutionary",
  no "seamless", no claim the README itself would not make.
- **`{{SITE_DESCRIPTION}}`**: one sentence, used for the `<meta name="description">` and
  the Open Graph tags — what shows in a link preview. Usually the tagline, tightened.
- **The stats row** (optional, §"no filler" below): zero to five tiles, each a number
  someone could verify by reading the repository — a count of principles, packages,
  milestones, services, tests, whatever the repository actually has that is worth
  stating. **Delete the whole block rather than inventing a number.** A repository at
  day one with nothing to count yet gets no stats row, and that absence is honest; a
  stats row with a made-up "0 known issues" is not.
- **The CTA links**: two or three, the first (`primary`) going to whatever a first-time
  visitor most wants — the main doc, a live demo, a quickstart — not reflexively the
  README. `GitHub` is always the last one and is filled in for you (`{{REPO_URL}}`).
- **The usage section**: pick exactly one of the three reusable content shapes the
  template already carries, per what the repository actually has —

  | Shape | Use for | Reuses |
  |---|---|---|
  | `.code` / `.copy` | A command someone is meant to paste into a terminal | The install/quickstart snippet, verbatim from the README |
  | `.cards` | A short, fixed set of named things (services, milestones, plugins, endpoints) | One `.card` per item; the `first`/`.meta` styling marks whichever one a newcomer should notice first |
  | `.group` / `ul` | A longer flat reference list, one line each (docs, guides, API routes) | One `<li>` per entry, each with its own one-line `<em>` description |

  Do not invent a fourth pattern, and do not use more than one in the same page unless
  the repository genuinely has two different kinds of content to show — the template's
  restraint is what keeps the page a landing page rather than growing into the docs site
  it explicitly is not (see the opening paragraph above).
- **The documents section** (optional): a `.group` list of the repository's own key
  documents — architecture notes, ADRs, a CONTRIBUTING guide. Delete the section entirely
  if the repository has nothing beyond its README worth a separate link.
- **The footer**: `{{LICENSE_LINE}}` from the repository's actual `LICENSE` file (state
  the real license; do not assume MIT), `{{REPO_URL}}` and `{{OWNER_PROFILE_URL}}` from
  §1's table.

## 5. The logo

**Reuse an existing icon if the repository already has one** — a README-embedded image, a
`favicon`/`logo.svg` under a `wwwroot/`, `public/` or `docs/assets/` directory, anything
already serving as the project's visual mark. Copy it to `docs/assets/logo.svg` (convert
format only if necessary; do not redraw it).

**If there is none, omit the `<img>` block entirely** rather than generating one. A
project's visual identity is a decision for a person, not a default this procedure
supplies — an agent-drawn logo that nobody chose has a way of becoming the de facto mark
by nobody ever replacing it. A page with no logo and a clean h1 is a complete, honest
page; a page with a placeholder icon is not.

## 6. The deploy workflow

Copy [`.github/workflows/deploy-pages.yml`](https://github.com/konradcinkusz/architecture-standards/blob/main/.github/workflows/deploy-pages.yml)
from this repository **verbatim** — every other artifact this procedure produces is
parameterized per repository, and this is deliberately the one exception, because the
file already contains no architecture-standards-specific content to parameterize: it
copies whatever is at `docs/index.html` and `docs/assets/*.svg` into `_site/` and deploys
that through the standard `configure-pages` → `upload-pages-artifact` → `deploy-pages`
pipeline. Re-deriving it per repository would be re-deriving a rule that already has no
free variables in it.

The one thing worth reading before you paste it: its trigger is scoped to
`docs/index.html` and `docs/assets/**`, so editing anything else in `docs/` (an ADR, a
guide) does not trigger a redeploy — correct for a page whose only inputs are those two
paths, and worth widening deliberately, not by accident, if a future revision of this
procedure changes what feeds the page.

## 7. The one manual step

**Settings → Pages → Build and deployment → Source → "GitHub Actions".** This is a
repository setting with no API this procedure can flip on your behalf — it has to be
clicked, once, by someone with admin access to the repository. The workflow file itself
carries this as its second comment for exactly this reason: without it,
`actions/configure-pages` fails with a 404 and there is nothing in the workflow to fix,
because the workflow is not the thing that is broken.

Say this explicitly when you finish, rather than letting a red first deploy run be the
first anyone hears of it.

## 8. Verification

Before pushing:

1. **Grep for unfilled placeholders**: `grep -o '{{[A-Z_0-9]*}}' docs/index.html` must
   return nothing. A visible `{{TOKEN}}` on a live page is the most visible possible
   failure of this procedure and the cheapest to catch before it ships.
2. **Open it locally** — `python3 -m http.server 8000 --directory docs` and load
   `http://localhost:8000/`, or open the file directly. Confirm every link resolves
   (no `href="{{...}}"` left over, none pointing at a document that does not exist) and
   that any `<img>` reference has a real file at that path, or the block was deleted
   (§5).
3. **Check the 390px width** — the narrowest common phone viewport, and the floor the
   template's `clamp()` rules were tuned against (see the CSS comments in the template
   itself). The title must not force horizontal scroll.
4. **Check dark mode** — toggle `prefers-color-scheme` in devtools, or your OS theme.
   Every colour on the page should come from the `:root` custom properties the template
   already defines (`--text`, `--muted`, `--accent`, `--border`, …); a hardcoded colour
   added while filling in content is the one way to break this, and it only shows in the
   theme nobody was looking at when they added it.
5. **Confirm the derived `{{PAGES_URL}}`** from §1 is the one you actually expect to load
   once deployed — the root-page special case is where this goes wrong (§9).

Report which of these you ran and what you found — "looks right" without having actually
loaded the page in a browser is not verification, it is a guess with confidence attached.

## 9. Failure modes

| Symptom | Cause |
|---|---|
| The Pages deploy fails at `configure-pages` with a 404 | §7's one manual step was never done |
| The published page 404s at the URL you expected | The repository is named `<owner>.github.io` and publishes at the root, not at `/<repo>/` — §1's special case was missed |
| A visible `{{TOKEN}}` on the live page | A placeholder was left unfilled; §8's grep gate exists for exactly this and was skipped |
| A broken-image icon where the logo should be | `docs/assets/logo.svg` is referenced in `index.html` but was never created, or should have been deleted per §5 |
| A hand-tuned page got silently overwritten | §2's preflight check on an existing `docs/index.html` was skipped |
| Two workflows both try to deploy Pages, and they race | §2's check for an existing `deploy-pages.yml` (or equivalent) was skipped, so a second one was added instead of reusing or explicitly replacing the first |
| A stats tile states a number nobody can verify by reading the repo | §4's "no filler" rule was skipped under pressure to make the header feel more substantial |
| The page is fine in light mode and unreadable in dark mode | A hardcoded colour was added instead of reusing the template's existing custom properties |
| Editing a guide under `docs/guides/` redeploys the page for no reason, or editing the page does not redeploy at all | The workflow's path filters were changed to something broader or narrower than `docs/index.html` + `docs/assets/**` without updating this document to match |

## 10. Checklist

- [ ] Owner and repo resolved from `git remote get-url origin` (or asked for, never
      invented) and §1's derivation table echoed back before any file was written
- [ ] The root-page special case (`<owner>.github.io`) checked explicitly, not assumed
      away
- [ ] Existing `docs/index.html` and `.github/workflows/deploy-pages.yml` checked for
      first; refined or left alone rather than silently replaced
- [ ] Every `{{TOKEN}}` in the template filled in or its whole block deleted; every
      `CUSTOMIZE` comment removed
- [ ] Stats row either states verifiable numbers or was deleted entirely — no invented
      figures
- [ ] Exactly one of `.code`, `.cards`, `.group` used for the usage section, matching
      what the repository actually has
- [ ] Logo reused from an existing repository asset, or the `<img>` block deleted — never
      generated from nothing
- [ ] `deploy-pages.yml` copied verbatim from this repository, unmodified
- [ ] §8's five checks run and reported, including the grep for unfilled placeholders
- [ ] The one manual step (Settings → Pages → Source → GitHub Actions) stated explicitly,
      not assumed done

---

Generated from [`docs/scaffold/GENERATE-GITHUB-PAGE.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/scaffold/GENERATE-GITHUB-PAGE.md) by `scripts/build-marketplace.mjs`. Do not edit this file: change the source document, or its entry in `catalog/marketplace.catalog.json`, and re-run the generator.
