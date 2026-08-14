<!-- Generated copy of docs/guides/OPEN-SOURCE-RELEASE.md — do not edit. Relative links have been rewritten to absolute repository URLs. -->

# Going public: releasing a repo as open source

A repo carries P5's secret-scanning discipline and REPO-BASELINE's hygiene going forward —
neither says what to check the one time a repo moves from private to public. This guide is
that gate: repo-agnostic, checklist-shaped, and ordered around the one part of it that isn't
fixable after the fact.

It is deliberately repo-agnostic. Worked examples are `FSE.Club` (a private repo staged
for eventual public release, audited for secrets before anything else) and
`konradcinkusz/authservice` (a clean extraction, verified rather than assumed clean).

**Contents**

1. [The ordering principle](#1-the-ordering-principle)
2. [Secrets: audit history, not just HEAD](#2-secrets-audit-history-not-just-head)
3. [LICENSE](#3-license)
4. [README for a stranger](#4-readme-for-a-stranger)
5. [Registry package visibility](#5-registry-package-visibility)
6. [Repo metadata: description and topics](#6-repo-metadata-description-and-topics)
7. [Failure modes](#7-failure-modes)
8. [Checklist](#8-checklist)

---

## 1. The ordering principle

Going public is irreversible in exactly one way: **a pushed public commit is public forever**,
even if the repo is later re-privated or the file deleted in a later commit — clones, forks,
and anything that crawled the window keep their copy. Everything else on this page — LICENSE
choice, README quality, missing topics — is fixable after the fact at zero cost. That
asymmetry is why the checklist is ordered the way it is: verify the irreversible thing first,
polish everything else after.

## 2. Secrets: audit history, not just HEAD

A pre-commit + CI secret scanner (P5, REPO-BASELINE §2) says nothing about commits from
before the scanner existed. A repo can have a perfectly clean diff against HEAD and still
carry a live credential in commit 4 of 200.

- Before flipping visibility, scan full history (`git log -p`, or a history-aware tool), not
  just the working tree. `FSE.Club`'s audit found plaintext Azure SQL credentials, Stripe and
  SendGrid keys, and a live-mode Stripe secret key — none visible in a HEAD-only diff, all
  reachable by walking history.
- **Rotate first, clean history second** (REPO-BASELINE §2's rule, restated because it is the
  rule that actually matters here). Scrubbing history without rotating is theater — the
  credential was already public for the entire window between push and scrub.
- **The escape hatch, and when it is cheaper than scrubbing:** if nobody depends on the repo's
  git history — no forks, no clones anyone tracks — starting a **fresh repository from the
  current tree** costs only commit history. Rewriting history (`git filter-repo`/BFG) costs a
  force-push every downstream clone must also handle, and still leaves the fact of the leaked
  commit in every clone that already exists. `FSE.Club` stages its rewrite in a `rewrite/`
  subfolder for exactly this reason — the eventual extraction into a new repo starts with
  fresh history by construction, with nothing to scrub because nothing from the old history
  is ever in it.

## 3. LICENSE

Not covered elsewhere in the standards. Pick one **before** the first public commit, not
after — a repo with code but no LICENSE is all-rights-reserved by default, and retroactively
licensing code that outside contributors already forked or copied is a real mess to unwind.
MIT is the estate's default absent a specific reason otherwise (a patent grant needs Apache-2.0;
copyleft intent needs the GPL family — a deliberate choice, never the default because nobody
picked one).

## 4. README for a stranger

P14 already requires decision-recording documentation for the team; a public README has a
second, different audience — someone with zero context deciding in thirty seconds whether to
keep reading. What that needs beyond an internal README:

- What it is and why it exists, in the first two sentences — not "see docs/" as the opening
  line.
- A quick start that runs end to end from a clone with **zero unwritten prerequisites**.
  `authservice`'s `docker compose up --build` brings up Postgres and the service together,
  with a demo secret and a seeded account, in one command.
- If the repo is meant to be *reused* by other repos rather than run standalone, say so
  explicitly and show the shape. `authservice`'s README §"Deploying your own instance" —
  own compute, own database, own signing key, per consumer, with a worked `fly.toml` — is the
  worked example.

## 5. Registry package visibility

A gotcha specific to GHCR (and most registries tied to a repo's identity): **a package
pushed by CI from a public repo is created private on its first push**, regardless of the
repo's own visibility. Nothing about "the repo is public" flips this automatically.
Confirmed on `authservice`: `ghcr.io/konradcinkusz/authservice` needed a manual visibility
change in the *package's own* Settings, separate from the repo's setting, after its first
`v*` tag. Check this explicitly after the first release — a "works for me, fails for everyone
else" report from a consumer is what a private package looks like from outside.

## 6. Repo metadata: description and topics

Neither is repo *content* — neither can be set by a commit or by CI. Both are how the repo
gets found, by search and by future-you:

- **Description**: one sentence, what it does and who it is for — not a restated title.
- **Topics**: 10–15 lowercase, hyphenated keywords a search would actually use — language and
  framework, the domain (`authentication`, `jwt`), and the deployment target where relevant
  (`flyio`, `self-hosted`).

## 7. Failure modes

| Symptom | Cause |
|---|---|
| A HEAD-only secret scan reports clean, but the repo still isn't safe to publish | Scanner never ran against history; a credential in an old commit is invisible to a diff-only tool |
| Rotated credentials still turn up in a public security scan | History was scrubbed without rotating first — the exposure window already happened regardless |
| A consumer can't pull the published image | Registry package created private on first push; repo visibility does not flip it (§5) |
| Outside contributors fork, then ask what they're allowed to do with the code | LICENSE added after the fact instead of before the first public commit |
| A stranger opens the README and closes the tab | Written for a teammate with context, not for someone deciding whether to keep reading |

## 8. Checklist

- [ ] Full git history scanned for secrets, not just HEAD; any hit rotated before anything
      else happens
- [ ] LICENSE chosen and committed before the first public commit
- [ ] README opens with what/why in two sentences; quick start runs end to end from a clone
      with zero unwritten prerequisites; reuse shape documented if the repo is meant to be
      consumed by others
- [ ] Registry package visibility checked and flipped after the first publish, separately
      from repo visibility
- [ ] Description and topics set
- [ ] If history can't be made clean cheaply, a fresh-history repo was considered before a
      history rewrite

---

Worked examples: `FSE.Club`'s `rewrite/docs/architecture/00-SECURITY-NOTE.md` (history-aware
secret audit, fresh-repo extraction staged ahead of time) and `konradcinkusz/authservice`
(MIT LICENSE present from the first commit, clean history verified rather than assumed, the
GHCR-private-by-default gotcha found and documented in its own README, `docs/index.html` plus
repo description/topics as the stranger-facing surface).
