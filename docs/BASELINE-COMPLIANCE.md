# This repository against `REPO-BASELINE.md`

The corpus's own rule, applied to the repository that states it. Every item below is
**yes**, or **N/A with the reason** — and the second answer is the one that has to earn
itself, because "not applicable" is where an unmet requirement goes to hide.

This repository is not a service. It ships documents plus one Node generator, so several
baseline items address machinery it does not have. Those are marked N/A with what would
have to become true for them to apply, rather than quietly dropped from the list.

Last worked through: 2026-08-31.

## §1 The baseline

| Item | Answer | Evidence, or why not |
|---|---|---|
| `CODEOWNERS` | **Yes** | [`.github/CODEOWNERS`](../.github/CODEOWNERS). Blanket ownership, with `scripts/`, `catalog/` and `.github/workflows/` called out separately — a change there reaches every consumer of the marketplace, not just a reader of one document |
| Dependency update automation | **Yes, one ecosystem** | [`.github/dependabot.yml`](../.github/dependabot.yml) covers `github-actions`. There is no `npm` or `nuget` entry because there is no package manifest: the generator uses only the Node standard library, so pinned Actions are the only third-party code in the tree |
| `.editorconfig` | **Yes** | [`.editorconfig`](../.editorconfig). `trim_trailing_whitespace` is off for `*.md` on purpose — two trailing spaces are a markdown line break, and trimming them would silently reflow the documents |
| `Directory.Build.props` + `Directory.Packages.props` | **N/A** | Central *package* management for a repository with no packages. There is no `.csproj`, no `package.json`, and no dependency to centralise. Applies the day this repository acquires a dependency |
| PR + issue templates | **Yes** | [`pull_request_template.md`](../.github/pull_request_template.md) asks for the worked example behind a rule change and for the version decision; two issue forms, `standard-gap` and `packaging-bug`, split the two genuinely different reports this repository receives |
| Real `.gitattributes` | **Yes** | [`.gitattributes`](../.gitattributes). Rules, not a commented-out template: LF normalisation, and `linguist-generated` on the 63-file generated tree so a one-line catalog edit stays reviewable |
| `.dockerignore` | **N/A** | Nothing here is containerised. There is no Dockerfile and no image; the packaging artifact is a git tree that agent clients read directly. Applies if the corpus is ever served rather than cloned — the MCP-server option in `MARKETPLACE-PACKAGING.md` §6 is the shape that would do it |
| Secret scanning: pre-commit **and** CI | **Yes** | [`scripts/hooks/pre-commit`](../scripts/hooks/pre-commit) and [`secret-scan.yml`](../.github/workflows/secret-scan.yml), sharing [`.gitleaks.toml`](../.gitleaks.toml). CI scans full history at `fetch-depth: 0`, plus weekly — a commit clean in March can be a finding in June |
| CodeQL / SAST + dependency audit | **Yes for SAST; N/A for audit** | [`codeql.yml`](../.github/workflows/codeql.yml) analyses JavaScript. The generator is not incidental to this repository — it decides what every installed skill contains, so a path-handling bug in it is a more interesting failure than anything in the prose. No dependency audit because there are no dependencies to audit |
| CI runs the linters and tests the repo claims | **Yes** | `validate-marketplace.yml` runs `build-marketplace.mjs --check` and `validate-marketplace.mjs` on every push and PR, so a standard cannot drift from the skill that ships it |

## §2 Secret hygiene

| Item | Answer | Evidence, or why not |
|---|---|---|
| Pre-commit hook **and** CI job | **Yes** | As above. The hook *fails* rather than warns when no scanner is available — a hook whose protection depends on the developer's toolchain is the "enforced only by human recall" failure §1 is about. `--no-verify` stays the loud escape hatch, and CI still blocks the push |
| Local scripts read secrets from a gitignored `.env` with a committed example | **N/A** | No script here reads a secret. The generator reads files in the tree and writes files in the tree; there is no credential it is supposed to hold, which is why there is no `secrets.env.example` to document. `.gitleaks.toml` records the corollary: the first secret introduced gets its detection rule in the same commit |
| Rotate before scrubbing history | **Yes, as procedure** | Stated in `.gitleaks.toml`, in the workflow's failure summary, and in the hook's message. Never exercised — no finding has occurred |

## §3 One-command onboarding

**Partly, and deliberately.** [`scripts/setup.sh`](../scripts/setup.sh) is the one setup
script: it checks prerequisites with install pointers, installs the pre-commit hook, and
verifies the generated tree. `--check` is the strict form where a missing scanner fails
rather than warns.

The three §3 steps it omits — initialise a secret store, generate the single mandatory
secret, offer optional integrations — are omitted rather than faked. This repository has
no secret store, no mandatory secret, and no third-party integration to degrade. Writing
ceremonial steps that configure nothing would be the "documentation that lies" failure
`TESTING-STRATEGY.md` §9 names, in the file meant to prevent it.

No troubleshooting table yet: it should be keyed on literal error text, and this
repository has not yet produced the errors to key it on. It is worth one the first time
somebody hits a real failure here, not before.

## §4–§6, §8

| Item | Answer | Evidence, or why not |
|---|---|---|
| §4 Operational scripts, CI jobs mirrored locally | **Yes** | [`scan-secrets.sh`](../scripts/scan-secrets.sh) mirrors the CI secret scan 1:1, so "it passed locally" means something; `build-marketplace.mjs --check` is literally the command CI runs. Not numbered/delegating — §4's runbook shape is for a repository with a deploy sequence, and there is nothing here to deploy |
| §5 Retired workflows archived, never comment-disabled | **N/A so far** | No workflow has been retired. `workflows-archive/` appears when it has its first occupant, never as an empty placeholder |
| §6 AI agent definitions in-repo | **Yes** | [`AGENTS.md`](../AGENTS.md) plus `.github/copilot-instructions.md` and three generated agents under `.github/agents/`, with repo-relative paths and example-bearing descriptions |
| §8 README claims verified; one source of truth per variable | **Yes** | The README's claims are checked by the generator: a document it describes that does not exist fails `--check`. One source of truth per version, now enforced by [`versions.lock.json`](../catalog/versions.lock.json) |

## §7 Standards adoption is declared

**N/A — and this is the one worth arguing rather than asserting.**

§7 says a repository expected to conform to the constitution declares it in
`.claude/settings.json`, registering `architecture-standards` as a marketplace and
enabling `architecture-core`. This repository *is* that marketplace. The declaration
would point it at itself, and what an agent working here needs is not the packaged
skill but the source documents it is editing — which is what [`AGENTS.md`](../AGENTS.md)
§C provides, including the rule that the packaging layer is generated and must be
regenerated in the same change.

§7's own text carves this out: the requirement is conditional on a repository being
"meant to conform to this constitution", and the constitution governs .NET Aspire
services. This repository has no service, no database, and no deployment. It states
P1–P15; it is not a subject of them.

## What is still open

One item in #29 cannot be closed by a file, and is not closed by this change:

- **`validate-marketplace` is not yet a required status check.** That is branch
  protection — a repository setting, not something in the tree, and it needs an owner
  with admin rights. Until it is set, the check runs on every push and PR and can still
  be merged past, which is exactly how PR #24 merged a stale generated tree and left
  `main` red from 2026-08-24 to 2026-08-26. The files in this change do not fix that;
  the setting does.

  Set at **Settings → Branches → `main` → Require status checks to pass**, selecting
  `Generated tree and manifests`. Worth adding `gitleaks (full history)` and
  `Analyze JavaScript` at the same time, once each has run once on `main` and is
  therefore offered in the list.
