# Proposal — the ticket-delivery workflow as installable skills

> Source: a 2026-09-05 review of the maintainer's own ticket-resolution workflow — the
> nine-node flowchart running incoming ticket → pre-analysis → master-prompt generation →
> implementation → PR review → PR ready, in which **every master prompt is currently pasted
> by hand** — together with the worked implementation-phase prompt used at work and a
> sketch of four commands (`/implementation-phase`, `/test-on-localhost`, `/cloud-test`,
> `/pr-code-review`). The question asked was narrow: can each paste become a command, and
> should it live in `architecture-standards`, in `claude-scope`, or in a new repo.
>
> Checked against the constitution (P1–P15), every guide header, both existing prompt
> documents ([`PLAYBOOK.md`](../PLAYBOOK.md), [`MASTER-PROMPT.md`](../MASTER-PROMPT.md))
> and the packaging layer, to avoid proposing a duplicate. The closest neighbours are
> `MASTER-PROMPT.md` — which is *the same species of artifact*, a hand-pasted master prompt,
> and is the precedent this proposal leans on hardest — and `TESTING-STRATEGY.md` §7, which
> already owns the manual-test discipline the work prompt's step 4 reinvents.
>
> **Confidence note, stated plainly**, because the two halves of this proposal are not
> equally evidenced. The **feasibility half** — what the plugin formats support, what the
> generator does today, what it would have to grow — is verified against the running code in
> this repository and against the published Claude Code and Agent Plugins specifications;
> every claim in it is checkable. The **design half** — the specific split of the workflow
> into skills, and the profile mechanism — is derived from *one* workflow used by *one*
> person, with no mileage under packaging. That is the same evidence level that kept
> `EXTRACT-SHARED-SERVICE-PATTERN.md` out of `docs/guides/`, so this stays a proposal.
>
> Nothing here is merged. This is a proposal for the maintainer to accept, defer, or reject.

---

## Why this exists

This repository already contains one hand-pasted master prompt. `docs/MASTER-PROMPT.md`
exists because a job description — "align this repo to the standards and leave it live" —
was being *rewritten by hand for each repo, with the repo name hardcoded into the prompt*.
The fix was to write the generic version once, with a fill-in target block, and paste that
instead.

The ticket workflow is the same problem one turn further on. The implementation phase is
identical for every ticket — that is precisely why it can be written down — and it is
still being pasted. The fill-in block has shrunk to a ticket ID, and the prompt has been
stable long enough to be quoted verbatim. An artifact that stable, pasted that often, is a
packaging problem, not a prompting problem.

The narrow question is whether the paste can become `/implementation-phase`. It can. But
answering only that would miss the two things the investigation actually turned up: the
packaging mechanism is **already installed and already working**, and the prompt being
pasted is **two documents wearing one coat**, only one of which may legally live in a
public repository.

## The answer to the question

**Yes — and most of the machinery is already built.** Three findings, in descending order
of how much they change the plan.

### 1. There is nothing to add called a "command". Skills already are commands

Claude Code merged custom commands into skills. A file at `.claude/commands/deploy.md` and
a skill at `.claude/skills/deploy/SKILL.md` both produce `/deploy` and behave identically;
skills are the recommended form because they additionally carry a directory of supporting
files and front-matter controlling who may invoke them. Inside a plugin, skills are
namespaced: `my-plugin/skills/deploy/SKILL.md` becomes `/my-plugin:deploy`, and bare
`/deploy` also resolves when nothing else claims the name.

Every skill this repository ships is therefore already a slash command. `/architecture-core:master-delivery-prompt`
exists today, on any machine that installed the plugin. Nobody has been using it as one,
because the generated body does not read like something you invoke — but the wiring is
live, and no `commands/` directory needs to be created to get it.

That relocates the whole problem. The gap is not packaging. It is **genre**.

### 2. The generator is the real constraint — and it is a specific, solvable one

[`scripts/build-marketplace.mjs`](../../scripts/build-marketplace.mjs) emits every skill
through one code path, `buildSkill`, which produces one fixed shape:

```
---
name: <skill>
description: >-
  <routing description from the catalog>
---

# <document title>

**Read `references/<DOC>.md` before applying any of this.**  (a link, in the real output)
That file is the standard; everything below it is a summary to help you decide
whether this skill applies and to check your work afterwards.
```

That shape is correct — for a *knowledge* skill. Its job is to route: help the agent decide
whether this standard applies, then hand off to the verbatim reference. Twenty-six skills
use it and none of them should change.

An executable procedure is the opposite artifact. `/implementation-phase` must not tell the
agent to go read something and form a view; it must *be* the checklist, in the body, in
order, with the stop conditions inline. And it needs front-matter the generator has no way
to emit today — every field below is supported by Claude Code and none is currently
produced:

| Front-matter field | What the workflow needs it for |
|---|---|
| `argument-hint` | `/implementation-phase [ticket-id]` autocompletes instead of being guessed at |
| `arguments` | the ticket ID substitutes into the body by name, so the doc paths write themselves |
| `disallowed-tools` | the sketch says `/test-on-localhost` "never edits code" — this is what makes that true rather than hoped for |
| `disable-model-invocation` | a phase gate should fire when *you* say so, not when the model reads the room |
| `model`, `effort` | the review pass can run harder than the phase that produced it |
| `context: fork`, `agent` | the exploratory round runs in its own context and returns a finding, not a mess |

Note the second and third rows especially. `disallowed-tools` converts a line of prose in
the command table — "Never starts the app, never edits code" — into an enforced property.
That is the single largest quality gain available here, and it is unavailable to a pasted
prompt at any length.

There is one hard constraint on how this gets built. `MANAGED_DIRS` in the generator lists
`plugins/`, and any file under it that the generator did not emit is deleted as orphaned on
the next run. **A hand-written skill in the plugin tree will not survive `node scripts/build-marketplace.mjs`.**
So this goes through the generator or it does not go in at all. Concretely, `buildSkill`
grows a second branch — a *procedure* skill, whose source document becomes the body
verbatim rather than a summary, and whose catalog entry carries the extra front-matter
through. The existing branch is untouched, and `catalog/versions.lock.json` proves it: if
any of the twenty-six digests move, the change was not additive.

### 3. The vendor-neutral format does not block this

Worth stating, because it looks like it might. Agent Plugins v1.0.0 defines exactly two
component types — skills and MCP servers — and says other component types "are outside the
v1 format and do not affect conformance", with clients required to ignore what they do not
support.

An executable skill is still a skill, so it stays conformant and still installs under
Copilot CLI and VS Code. The extra front-matter keys are Claude Code's; elsewhere they are
inert. What does *not* travel is the slash-invocation itself — under a client that has no
concept of user-invoked skills, `/implementation-phase` reaches the agent by its
description, as every other skill here already does. That is a graceful degradation, not a
blocker, but it is the reason the description still has to say **use when** even for a
skill whose whole point is being typed.

## What the diagram becomes

Node by node. "Skill" below always means a directory with a `SKILL.md`, which is also a
slash command.

| Diagram node | Becomes | Notes |
|---|---|---|
| Ticket analysis (pre-analysis) | skill `ticket-analysis` | Writes the analysis artifact the later phases read |
| *Enough information?* | the exit criteria **inside** that skill | See "the gates", below |
| Exploratory agent round | `context: fork` on the same skill, read-only | `disallowed-tools` keeps an exploration from becoming an edit |
| Feed back / generate questions / resolve gaps | outputs of `ticket-analysis` | A question list is a file, not a chat message |
| Master prompt generation | **nothing — this node disappears** | See below |
| Run master prompt | **nothing — this node disappears** | |
| Implementation phase (a: code, b: tests) | skill `implementation-phase` | The ask. Both tracks in one procedure, as today |
| Optional test artifacts | final step of `implementation-phase` | HTTP file / API collection; conditional on what changed |
| Create PR draft | skill `pr-description` | Already produces `docs/pr/{TICKET-ID}-pr-description.md` |
| *Results satisfactory?* ×2 | named exit criteria per phase | See "the gates" |
| PR review agent | agent + skill `pr-code-review` | Forked, read-only, severity-ranked — as sketched |
| *PR validated against ticket?* | the review skill's own verdict section | |
| — (not on the diagram) | `test-on-localhost`, `cloud-test` | From the command sketch; both read-only |
| — (after the fact) | `claude-scope`'s `/session-report` | The one honest tie-in to that repo |

### The node that disappears is the interesting part

"Master prompt generation → Run master prompt" is two nodes and one feedback loop, and
they exist **only because the prompt is a text artifact that has to be produced somewhere
and carried somewhere else**. Generation is the cost of pasting. Once the implementation
phase is a skill, the prompt is not generated per ticket — it is installed once, and the
only thing that varies is the ticket ID and the profile.

The loop those nodes sit on goes too. "Results satisfactory? → No → back to ticket
analysis", measured on the *output of running a generated prompt*, is partly a check that
the prompt itself came out right. A prompt that is version-controlled, reviewed once and
installed cannot come out wrong on a Tuesday. What remains is a real check on the
implementation, which is the loop below it and already in the diagram.

So the packaging does not merely save keystrokes. It removes one node pair, one feedback
edge, and one class of failure — a subtly mis-generated prompt — from the process.

### The gates are the weak point, and skills are where the fix lands

Three diamonds in the flowchart are judgment calls: *Enough information?* and *Results
satisfactory?* twice. As drawn they say "I look at it and decide", which is an honest
description of a habit and a poor description of a process.

No skill can make the judgment. But a skill is exactly where the *criteria* get written
down, because a phase skill has to state its own exit condition anyway — the pasted prompt
already gropes toward this with "Confirm the build is green before starting" and a Final
Checks block. Made explicit, the diamonds become checkable:

- **Enough information?** — zero blocking questions outstanding; every acceptance criterion
  maps to at least one identified file; the affected layers are named.
- **Results satisfactory?** (implementation) — build green; new and existing affected tests
  pass; every acceptance criterion has a covering test; no files changed outside the traced
  set.
- **PR validated against ticket?** — every acceptance criterion has a row in the
  verification table; no finding above the agreed severity remains open.

That is the same content as today's Final Checks list, moved from the end of one phase to
the boundary between phases, where a gate belongs. It is worth doing whether or not any of
the rest of this is built.

## The prompt being pasted is two documents, and only one of them can live here

This is the finding that decides the repository question, so it comes before the answer.

Read the work implementation-phase prompt against this repository's own genre rule — guides
are *repo-agnostic: rules plus the reasons* — and it splits cleanly in half.

**Generic** (belongs in a standards repo, transfers to any ticket in any stack):

- the phase order itself: pre-analysis before code, code before tests, tests before docs,
  docs before PR — and the refusal to collapse steps;
- trace the data flow end to end and name every file that will change, *before* editing;
- confirm the build is green before starting, not only after;
- regression tests for existing affected paths, not just tests for the new branch;
- the edge-case roster: null/absent, empty, precision, format;
- a manual-test document with a per-acceptance-criterion verification table and an explicit
  out-of-scope section;
- a PR description with what / why / grouped changes / test results / out of scope;
- the scope-discipline block — no features outside the ticket, no unrelated refactors, no
  public-contract changes — and **STOP, document, ask** on discovered ambiguity.

**Specific to one employer's codebase** (cannot go in a public repo, and should not go in a
generic skill even if it could):

- the layer names: F# domain model → C# services → API endpoints → client/DTO models;
- `InternalsVisibleTo` as the cross-project test mechanism;
- the F#↔C# interop rules (`Option`, `List`, explicitness at the boundary);
- the house code style: braces always, a blank line before a `return` that follows other
  statements, ~80 columns, multi-line initializers mandatory for `ProblemDetails` and
  `BadRequest`;
- `docs/manual-tests/{TICKET-ID}-…` and `docs/pr/{TICKET-ID}-…` as the artifact paths;
- the Jira ticket-ID shape, and the commit-message reference rule;
- and from the command sketch, the part that matters most: the `orizon-ui` / `orizon-api` /
  `orizon-integration-api` host-resolution convention, the Entra token flow, and the
  read-only-on-UAT-and-above rule.

That last group is internal environment topology. **`architecture-standards` and
`claude-scope` are both public** — MIT-licensed, published as marketplaces, with gitleaks
and a secret-scanning pre-commit hook that refuses to commit when no scanner is available.
Internal hostname conventions and environment tiers do not go in either one. This is not a
tidiness preference; it is the constraint that shapes the whole answer.

## Where each piece goes

**`architecture-standards` — the generic workflow.** A new plugin, `ticket-delivery`,
holding `ticket-analysis`, `implementation-phase`, `pr-description` and `pr-code-review` as
procedure skills, sourced from new documents under `docs/delivery/`. It goes here rather
than anywhere else for four reasons: the precedent is exact (`MASTER-PROMPT.md` is the same
species and already ships as a skill); the generator, the two-client manifests, the
validator and the install story already exist; `quality-and-process` already owns the
neighbouring subject matter; and `TESTING-STRATEGY.md` §7 already owns the manual-test
discipline that the work prompt's step 4 reinvents from scratch — the skill should cite it
rather than restate it.

A **new plugin** rather than a fifth skill inside `quality-and-process`, because the genre
differs: everything shipped today is *rules plus reasons*, and these are *procedures you
invoke*. Keeping them in a plugin whose name says so leaves the constitution's genre intact
and lets someone install the standards without the workflow, or the reverse.

**A private layer — the profile.** The employer-specific half becomes a **delivery
profile**: stack layers, ticket-ID pattern, artifact paths, house code rules, environment
resolution. The generic skill reads it; the skill itself names no stack.

The mechanism has a house precedent. `REPO-BASELINE.md` §7 — *"Standards adoption is
declared, not remembered"* — already has a repo declare its adoption of these standards in a
committed `.claude/settings.json` rather than in someone's memory. A delivery profile is the
same move one level down: `.claude/delivery-profile.md`, committed in the work repository,
where the stack it describes actually lives, and where it is already behind that
repository's access control.

Start there rather than in a new repository. A new repo is warranted when a second work
repo needs the same profile — not before, and the profile is a page of Markdown either way.

**`claude-scope` — no.** It is single-purpose session forensics with its own hand-written
plugin tree and no generator; the workflow has no business in it. The one real connection
runs the other way: `/session-report` is a good last step *after* a ticket ships, turning
the session into the cost-and-shape retro. Worth noting in the workflow docs, worth nothing
in the repo layout.

## What building it actually costs

In dependency order, all inside this repository:

1. **Catalog schema** — a skill entry gains an optional kind (`"procedure"`) plus an
   optional front-matter passthrough. Additive; every existing entry keeps its meaning.
2. **`buildSkill`** — a second branch for procedure skills: emit the source document as the
   body, and the passthrough keys into the front-matter. The knowledge branch is untouched.
3. **`validate-marketplace.mjs`** — the `use when` rule and the length bounds still apply
   (see finding 3 for why that is not a formality); add validation of the new front-matter
   keys so a typo fails the build rather than silently disabling a gate.
4. **The documents** — `docs/delivery/`, one per phase, written to the house shape.
5. **Catalog entries + the new plugin**, and the version bumps the lock gate will demand.
6. **The entry points** — `README.md`, `AGENTS.md`, `MARKETPLACE.md`. The validator checks
   the links in the latter two, so a half-done job fails CI, which is the point of it.

Steps 1–3 are the only code. Everything else is the routine path this repository already
has for adding a standard.

## Decisions left to the maintainer

1. **Does an executable procedure belong in a standards repository at all?** The stated
   genre is repo-agnostic rules plus reasons. A procedure skill is a different kind of
   artifact wearing the same packaging. The separate-plugin recommendation above is the
   mitigation, not a resolution — rejecting the genre outright and putting the workflow in
   its own repository is a coherent answer, at the cost of a second marketplace to install.
2. **Profile in the work repo, or a private repo?** Recommended: `.claude/delivery-profile.md`
   in the work repo now, promoted only when a second repo needs it. The alternative — a
   private repo from the start — buys reuse before there is anything to reuse.
3. **How much of the work prompt is genuinely generic?** The split above is one reading. The
   edge-case roster (null / empty / precision / format) and the manual-test document shape
   are arguably specific to APIs returning formatted data, and would be over-claimed as
   universal rules.
4. **Whether the gates get written down even if nothing is packaged.** The three exit
   criteria in "the gates" are the cheapest item in this document and the only one that
   improves the process on its own. They can be adopted independently and today.
