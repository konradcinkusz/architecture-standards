<!-- Generated copy of docs/guides/SELF-HOSTED-RUNNERS.md — do not edit. Relative links have been rewritten to absolute repository URLs. -->

# Running GitHub Actions on self-hosted runners

GitHub Actions jobs run on GitHub-hosted runners by default. They are clean every time and
cost metered minutes. This guide covers the alternative: running the same workflows on
machines you control, such as a spare Linux box, a small VM on your own network, or an
always-on machine at home. Where jobs execute is a pipeline decision ([P12](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/architecture/00-REFERENCE-ARCHITECTURE.md#p12)).
Which jobs may execute there is a secrets decision ([P5](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/architecture/00-REFERENCE-ARCHITECTURE.md#p5)
and [`REPO-BASELINE.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/REPO-BASELINE.md) §2), and it is the one that matters most.

The short version: one repository variable selects the runner for every job; cloud stays
the default; release and secret-bearing jobs never follow the switch; and a self-hosted
runner that executes pull-request code is a security boundary, not a convenience.

It is deliberately repo-agnostic. The worked examples are cited at the end.

**Contents**

1. [The switch: one variable, read by every job](#1-the-switch-one-variable-read-by-every-job)
2. [Jobs that stay on cloud](#2-jobs-that-stay-on-cloud)
3. [Runner host setup](#3-runner-host-setup)
4. [Ephemeral or persistent, concurrency and timeouts](#4-ephemeral-or-persistent-concurrency-and-timeouts)
5. [Security: read this section first](#5-security-read-this-section-first)
6. [Operations](#6-operations)
7. [Agent procedure: running Actions on local runners](#7-agent-procedure-running-actions-on-local-runners)
8. [Failure modes](#8-failure-modes)
9. [Checklist](#9-checklist)

---

## 1. The switch: one variable, read by every job

Every job reads one **repository Actions variable**, `RUNNER_LABELS`, which holds a JSON
array of runner labels:

```yaml
jobs:
  build:
    runs-on: ${{ fromJSON(vars.RUNNER_LABELS || '["ubuntu-latest"]') }}
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
```

Why one global variable rather than a per-workflow setting: a `workflow_dispatch` input can
choose the runner for a manual run, but `push` and tag triggers have no inputs. The only
setting that reaches every trigger is a repository-level variable. Keep it to one variable so
that "where do jobs run?" has one answer.

The rules that make the expression work:

- **Read `vars` directly.** The `env` context is not available in `runs-on`; `vars` is.
- **The value must be a JSON array.** `["self-hosted","linux"]` is valid. `self-hosted,linux`
  is a plain string; `fromJSON` cannot parse it, and the workflow file is rejected.
- **An empty or unset variable takes the `||` fallback, and empty does not mean "cloud".** It
  means whatever the default says. To force cloud explicitly, set the variable to
  `["ubuntu-latest"]`. The fallback is the reason this works at all: a repository that has
  never defined the variable runs on cloud without any change.
- **The labels must match a registered runner.** A job asking for `["self-hosted","linux"]`
  is only picked up by a runner that carries both labels (see §3).

**Choosing the default.** The fallback is a decision, so make it on purpose:

| Repository | Default | Why |
|---|---|---|
| Public, or many outside contributors | Cloud (`ubuntu-latest`) | A public repo must never default to a machine you own (§5). |
| Private, one or two trusted writers, runner already running | Self-hosted labels | Speed and cost, with the trust boundary already accepted. Offline runners stop jobs rather than fall back (§6). |
| New repository, runner not yet set up | Cloud | Nothing breaks while the host is built; flip the variable when it is ready. |

**Setting the variable.** Through the CLI, where `gh` is available and the caller has
admin or write access:

```sh
gh variable set RUNNER_LABELS --repo <owner>/<repo> --body '["self-hosted","linux"]'
gh variable get RUNNER_LABELS --repo <owner>/<repo>
```

Through the UI, for an agent without `gh` or a human who prefers it: repository
**Settings → Secrets and variables → Actions → Variables** tab → **New repository
variable**, name `RUNNER_LABELS`, value as above.

Anyone who can change this variable can move every job in the repository onto a machine
you own. Treat it as a control, not a preference: restrict who has write access, and see §2
for the jobs that must not follow it at all.

## 2. Jobs that stay on cloud

Two kinds of job must not read the switch, or must read it with a guard.

**Jobs for an OS the host does not have.** A Linux host cannot run a Windows or macOS leg.
Keep those legs on cloud and let the rest follow the variable:

```yaml
jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [linux, windows]
    runs-on: ${{ matrix.os == 'windows' && fromJSON('["windows-latest"]') || fromJSON(vars.RUNNER_LABELS || '["ubuntu-latest"]') }}
```

The expression is `condition && a || b`, and it has a gotcha. `a || b` yields `b` whenever
`a` is falsy. In Actions expressions, `''`, `0`, `null` and `false` are falsy, and everything
else is truthy. `fromJSON('["windows-latest"]')` is a non-empty array, so it is truthy and the
idiom is safe here. If `a` were ever an empty string or `0`, the expression would silently
take `b` and run a Windows leg on the Linux host. Use a truthy `a`, or split the Windows leg
into its own job with a fixed `runs-on`, which is clearer and is what to do once there are
two or three such legs.

**Release, deploy and secret-bearing jobs.** These do not read `RUNNER_LABELS`. Hard-code
their `runs-on` to cloud, or to a dedicated label that no other job requests, on a runner you
have deliberately prepared for secrets:

```yaml
  deploy:
    runs-on: ubuntu-latest        # not the variable: this job holds deployment credentials
    environment: production       # secrets come from a GitHub Environment (§5)
    needs: [build, test]
```

The antipattern this section exists for: a repository had one variable read by every job,
including the job that deployed to production with its credentials. The variable was switched
to a home machine for speed, and the deploy job silently moved with it, running with
production credentials on a machine in someone's house. Nothing failed, which is why nobody
noticed. Deploy and release jobs are the first thing to keep off the switch, and the first
thing to check when the switch changes.

## 3. Runner host setup

**The host.** A dedicated machine or VM, on a network segment that can reach what the jobs
need and nothing else (§5). It runs a non-root user, `<runner-user>`, with no `sudo` rights
and no membership of the `docker` group unless a job genuinely needs containers. Docker
group membership is root by another name.

**Prerequisites, installed before the first job.** Install these as root, once:

- `git`, `curl`, `ca-certificates`, `jq` (many actions and scripts assume `jq` exists) and
  `zip`/`unzip` (archive steps)
- Docker, only if jobs build or run containers, and then rootless where possible (§5)
- Operating-system libraries that browser tests need. `npx playwright install --with-deps`
  calls `apt` and needs root; run it once as root, or preinstall the libraries it lists, rather
  than giving the runner user `sudo`.

Toolchains such as Node and .NET should not be preinstalled as the source of truth. Install
them per job with `actions/setup-node`, `actions/setup-dotnet` and the like, so the version a
job uses is written in the workflow, not on the host. The host still needs network access for
those downloads, and the setup actions' own `cache:` inputs are the normal way to keep them
quick (§6).

**Download the runner package from the UI.** Use the repository's **Settings → Actions →
Runners → New self-hosted runner** page, which shows the current download and its SHA-256.
Verify the checksum before extracting. Do not pipe a download straight into `tar` (§5).

**Register the runner.** As `<runner-user>`, in `<runner-dir>`:

```sh
./config.sh --unattended --ephemeral \
  --url https://github.com/<owner>/<repo> \
  --token <REGISTRATION_TOKEN> \
  --labels self-hosted,linux \
  --name <runner-host>-1
./run.sh
```

The labels are the contract with §1. If the variable is `["self-hosted","linux"]`, every
runner must carry both labels; a job that asks for a third label is only served by a runner
that has it. The runner advertises its OS and architecture as labels itself, so listing
`linux` is harmless and says what the host is for.

A registration token comes from the repository's runner page or from
`gh api --method POST repos/<owner>/<repo>/actions/runners/registration-token --jq .token`.
It expires after about an hour. It is for registration only, not for the runner to live on.

**Run it as a service.** For a persistent runner, `svc.sh` installs one:

```sh
sudo ./svc.sh install <runner-user>
sudo ./svc.sh start
```

For an ephemeral runner, the service is a loop, not a single registration, because an
ephemeral runner deregisters itself after one job and needs a new token to come back. The
loop is the unit of supervision:

```bash
#!/usr/bin/env bash
# <runner-dir>/run-runner-loop.sh: one ephemeral registration per iteration.
set -euo pipefail
cd <runner-dir>
while true; do
  REG_TOKEN="$(<mint-registration-token-command>)"   # placeholder: see "Re-registration" below
  ./config.sh --unattended --ephemeral --replace \
    --url "https://github.com/<owner>/<repo>" \
    --token "$REG_TOKEN" \
    --labels self-hosted,linux \
    --name "<runner-host>-$(date +%s)"
  ./run.sh || true      # returns after exactly one job
  sleep 5
done
```

Wrap it in a systemd unit so that a reboot brings it back:

```ini
[Unit]
Description=GitHub Actions runner loop (<owner>/<repo>)
Wants=network-online.target
After=network-online.target

[Service]
User=<runner-user>
WorkingDirectory=<runner-dir>
ExecStart=<runner-dir>/run-runner-loop.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Re-registration: a static token is not enough.** A registration token lasts about an hour.
An ephemeral runner that restarts, or the loop's next iteration, needs a fresh one. Putting a
token in a unit file or a compose file works for the first registration and then fails
silently on the first restart. The working pattern is to store a long-lived credential that
can mint registration tokens, and to mint one just before each `config.sh`:

- A **GitHub App** installed on the single repository, with *Administration: read and write*,
  or a **fine-grained personal access token** with the same repository permission, scoped to
  that one repository. Keep its private key or token in a file readable only by
  `<runner-user>` (mode `600`), and treat it like a deploy secret: it can register runners.
- The mint step is `POST /repos/<owner>/<repo>/actions/runners/registration-token`, called
  with that credential. The loop above calls it through `<mint-registration-token-command>`.

**Several runners, in containers.** To run more than one job at a time, run more than one
runner. A compose sketch, with the variable names as placeholders:

```yaml
services:
  runner:
    image: <runner-image>              # the image's own README names its variables; they differ between images
    restart: unless-stopped           # Docker restarts the container after a crash or a reboot
    deploy:
      replicas: 2                     # one job per replica at a time
    environment:
      RUNNER_NAME_PREFIX: <runner-host>
      RUNNER_LABELS_CSV: self-hosted,linux          # placeholder name; check the image
      # Do NOT put a registration token here. It expires in about an hour.
      # The entrypoint must mint one at start-up from the credential below (see above).
      APP_PRIVATE_KEY_FILE: /run/secrets/runner-app.pem   # placeholder name; check the image
    volumes:
      - ./secrets/runner-app.pem:/run/secrets/runner-app.pem:ro
```

The official runner images and the community ones use different configuration variables,
and they change between versions. Read the image's documentation for the names it actually
reads before copying anything above. The point of the sketch is the shape: `restart:
unless-stopped`, a minted token instead of a stored one, and a credential mounted read-only.

## 4. Ephemeral or persistent, concurrency and timeouts

Ephemeral is the default recommendation. The two modes trade different things:

| Concern | Ephemeral (one job, then re-register) | Persistent (one registration, many jobs) |
|---|---|---|
| Workspace | Clean, provided the runner directory is recreated or `_work` is cleared per cycle | Carries over: old checkouts, `node_modules`, build output |
| State leak between jobs, repos or fork PRs | None by design | Possible through `/tmp`, the home directory, global caches and `~/.npm` |
| Speed | Slower first step (toolchain and dependency downloads every job) | Faster, because caches are warm |
| Maintenance | A loop and a credential for minting tokens (§3) | Less machinery, but a cleanup job is mandatory (§6) |
| When to choose | Anything that runs pull-request code, anything with secrets nearby | A trusted private repo where speed matters more than isolation, with cleanup in place |

**Concurrency.** Two rules, one per class of job:

```yaml
# CI: a newer push supersedes an older run for the same branch.
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

```yaml
# Deploys: never cancel a deploy in progress. Cancelling mid-deploy leaves the estate half-rolled.
concurrency:
  group: deploy-<environment>
  cancel-in-progress: false
```

A runner executes one job at a time. A parallel matrix on one runner simply queues; to get
real parallelism, run more runners (§3).

**Timeouts.** Put `timeout-minutes` on every job. The default is 360 minutes, and a hung job
on a single self-hosted runner blocks everything behind it for six hours. A realistic value
for a test job is 15 to 30 minutes; set it from the job's observed duration plus a margin.

**Full history when diffing.** A shallow clone has no merge base. Any step that diffs against
the base branch needs the history:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0        # full history: needed by `git diff origin/main...HEAD`
```

Only jobs that diff need it; a full clone of a large repository is slow on every job.

## 5. Security: read this section first

A self-hosted runner executes whatever code the workflow checks out. A workflow that runs on
pull requests checks out code from the pull request. So on a self-hosted runner, **a pull
request is a request to run code on your machine.** Everything below follows from that.

**Private repository.** Anyone with push access can run code on the host, by pushing a branch
and opening a workflow. Accept that only if every writer is trusted and the host cannot reach
anything those writers should not reach. The host is not a sandbox against your own team.

**Public repository.** Do not attach self-hosted runners to a public repository without
approval gating. Strangers can open pull requests, and a pull request can change the workflow
file it runs under. If there is no way to gate it, use cloud runners and stop here. If there is,
the minimum is **Settings → Actions → General → Fork pull request workflows from outside
collaborators → "Require approval for all outside collaborators"**, which holds every run from
an outside contributor until a writer approves it. Even that does not make it safe for a
machine with anything of value on it.

**The rules that apply to every repository:**

- **Never run pull-request code under `pull_request_target` with a checkout of the pull
  request's head.** That event runs with the base repository's secrets and a write token;
  checking out the untrusted head there runs untrusted code with those credentials.
- **Minimal permissions at workflow level.** Start every workflow with `permissions: contents:
  read` and widen per job, so a compromised step cannot write to the repository or issue
  tokens.
- **Secrets live in GitHub Environments, not in the variable or the host.** Put deployment
  secrets in an Environment with required reviewers and a branch or tag restriction, and bind
  the deploy job to it ([P5](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/architecture/00-REFERENCE-ARCHITECTURE.md#p5), §2).
- **Secret-bearing jobs stay on cloud or on a dedicated, labelled runner** (§2). Never on a
  runner that also serves pull-request builds.
- **Mounting the Docker socket is root on the host.** A container that can reach
  `/var/run/docker.sock` can start a privileged container and read the host's filesystem.
  Prefer rootless Docker, a separate VM for container-heavy jobs, or no container runtime for
  jobs that handle untrusted code.
- **Isolate the host.** A dedicated VM or network segment, with no route to internal services
  the jobs do not need. Assume that anything a job can reach, a pull request can reach.
- **No personal credentials on the host.** No cloud CLI logged in as you, no personal SSH keys,
  no browser profile with sessions, no password manager agent. A runner needs its own
  narrowly scoped credentials, and only if a job needs them ([`REPO-BASELINE.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/REPO-BASELINE.md) §2).
- **Pin and verify every download.** Use the SHA-256 that the runner-setup page publishes. For
  any other tool, pin the version and verify its checksum. `curl ... | tar` with no checksum
  runs whatever the network delivered.
- **Shared `/tmp` on persistent runners.** Anything one job writes to `/tmp`, a later job can
  read, including a job from another repository or a fork. This is the main reason to prefer
  ephemeral runners for anything untrusted.
- **No `sudo` for the runner user.** Preinstall what needs root (§3). A runner with passwordless
  `sudo` is a root shell for whoever runs a job on it.
- **Credentials on the host are files with a mode.** The registration credential (§3) is
  readable only by `<runner-user>`, scoped to one repository, and rotated on a schedule.
- **If the host is suspected compromised, assume everything on it is.** Remove the runners,
  revoke and rotate every credential that was ever on the host, and rebuild the host from
  scratch rather than cleaning it.

## 6. Operations

**There is no automatic fallback.** When the runner is offline, jobs that request its labels
stay queued. GitHub does not reroute them to cloud, and a queued job eventually cancels rather
than running somewhere else. Nobody is told unless something checks. The manual fallback is one
command, and it is the rollback too:

```sh
gh variable set RUNNER_LABELS --repo <owner>/<repo> --body '["ubuntu-latest"]'
```

**A health check, recommended.** A scheduled workflow on a cloud runner (hard-coded
`ubuntu-latest`, never the variable) lists the repository's runners through
`GET /repos/<owner>/<repo>/actions/runners`, checks that a runner with the required labels has
`status` `online`, and opens an issue or sends a notification when none does. Automatic
fallback to cloud is the safe direction and may be automated. Automatic switching to a
self-hosted default is not: it can move jobs onto a host nobody is watching, and it should
remain a human decision.

**Host health.** Check that the service is active, that disk has headroom, and that the health
check itself has run recently. A runner that is up but has a full disk fails jobs in ways that
look like code bugs.

**Cleanup.** Persistent runners need a scheduled cleanup, and ephemeral runners still need log
hygiene:

- `_work` grows with every job. Remove stale workspaces older than a day on persistent hosts.
- Remove `_diag` logs past a retention window.
- If Docker is used: `docker system prune` with a filter, on a schedule, not ad hoc.
- Hand-rolled caches on a persistent host are a stale-artefact generator; keep caching to the
  setup-* actions' `cache:` inputs unless there is a measured reason not to.

**Toolchain consistency.** Pin the same Node and .NET versions in the documentation, in the
workflows and in the setup actions' version inputs. A repository that says Node 22 in its
README, Node 20 in its workflows and whatever the host happens to have will fail on the host
and pass on cloud, or the reverse. The version is written in the repository, not on the host.

**Cost.** The minutes saved are not free. Electricity, hardware, your time when the host breaks
at a bad moment, and the health check all count. GitHub's pricing for self-hosted job minutes
changes over time, so check the current billing page before assuming it is free.

## 7. Agent procedure: running Actions on local runners

When the user asks to run Actions on local runners, follow these steps in order. Stop and ask
at any step that needs a decision the user has not made.

1. **Check visibility.** If the repository is public, stop and ask for the §5 approval gating
   before changing anything. If it is private, confirm that every writer is trusted.
2. **Audit.** Run `grep -rn "runs-on" .github/workflows/` and list every job. Classify each one:
   (a) plain Linux build or test, which follows the switch; (b) an OS the host lacks, which uses
   the §2 matrix guard; (c) release, deploy or secret-bearing, which stays on cloud.
3. **Replace.** In classes (a) and (b), set `runs-on` to the §1 expression, using the variable
   name `RUNNER_LABELS`. In class (c), hard-code cloud and bind any secrets to an Environment.
4. **Harden every job.** Add `timeout-minutes`; add the §4 `concurrency` group matching the job's
   class; add workflow-level `permissions: contents: read`; add `fetch-depth: 0` where a job diffs.
5. **Check the expression.** No `env.` in any `runs-on`; the value is a JSON array, never a
   plain string; toolchains come from setup-* actions, not the host.
6. **Write `docs/RUNNER.md`** in the target repository, from the template below, with real
   values where they are known and placeholders where they are not. Keep it in sync with the
   workflows (§8, last row).
7. **Hand over the manual steps.** The agent usually cannot do these, so list them for the human:
   registering the runner (needs admin rights and a registration token); installing the service;
   storing the registration credential on the host; setting `RUNNER_LABELS` if `gh` or permissions
   are missing; configuring the Environment reviewers; setting the outside-collaborator approval
   for a public repository.
8. **Smoke test.** Trigger a run on a branch with `gh workflow run <workflow>.yml --ref <branch>`,
   then `gh run watch`. In the job log, confirm that the runner name is the local host and not a
   GitHub-hosted image.
9. **State the rollback.** Set `RUNNER_LABELS` back to `["ubuntu-latest"]` (§6), and stop the
   runner service if the host is going to be idle.

Template for `docs/RUNNER.md`:

```markdown
# CI runners

## Where jobs run

- Switch: repository variable `RUNNER_LABELS`, currently `<value>`.
- Cloud (`["ubuntu-latest"]`) when the variable is empty or set to that value.
- Always cloud, whatever the variable says: <release and deploy jobs, and why>.
- Always local: <jobs that need the local host, if any>.

## Runner host

- Host: <runner-host>, location <location>, user <runner-user>, directory <runner-dir>.
- Labels: `self-hosted`, `linux` (plus any others, listed here).
- Service: <systemd unit name>. Logs: `journalctl -u <unit>`.
- Installed prerequisites: <git, jq, zip, docker if used, browser libraries>.

## Credentials

- Registration credential: <GitHub App or fine-grained token name>, scoped to <owner>/<repo>.
- Stored at <path> (mode 600, owner <runner-user>). Rotated <cadence>.

## Operations

- Health check: <workflow name>. Opens issue label `<label>` when no runner is online.
- Manual fallback: `gh variable set RUNNER_LABELS --repo <owner>/<repo> --body '["ubuntu-latest"]'`.
- Cleanup: <job or cron, and what it removes>.

## Owner

- <name or role>.
```

## 8. Failure modes

| Symptom | Cause |
|---|---|
| Clearing the variable "to go back to cloud" sends jobs to the local runner | The fallback is the default, and the default is not cloud. Set `["ubuntu-latest"]` explicitly (§1) |
| Workflow file rejected at parse time, or `Unrecognized named-value: 'env'` | `env` used in `runs-on`. The `env` context is not available there; use `vars` (§1) |
| Workflow file rejected, or no job ever starts | `RUNNER_LABELS` is a plain string such as `self-hosted,linux`, not a JSON array. Use `["self-hosted","linux"]` (§1) |
| A Windows or macOS leg never starts, or fails on the Linux host | The leg requested a label no registered runner carries. Keep OS-specific legs on cloud with the §2 guard |
| A Windows leg runs on Linux when the guard was supposed to route it to cloud | The `a && b \|\| c` guard had a falsy `a` (empty string or `0`), so `c` was taken (§2) |
| Jobs stay "Queued" indefinitely | The runner is offline, the service is stopped, or the job's labels do not all match one runner (§3, §6) |
| Deploy job ran on the home machine after a switch | The deploy job read the global variable. Hard-code cloud or a dedicated label, and bind secrets to an Environment (§2, §5) |
| Docs say deploys run on cloud, but a workflow now runs them locally | The workflows were switched without updating `docs/RUNNER.md`. Keep docs and workflows in sync in the same change (§7) |
| `Shallow clone` errors: `no merge base`, or a diff step fails | Default `fetch-depth: 1`. Set `fetch-depth: 0` in jobs that diff against the base (§4) |
| A test passes locally or in one job and fails in the next, with stale output | Persistent runner: a previous job's `_work`, `/tmp`, or global cache leaked into this one. Use ephemeral runners, or clean per job (§4, §6) |
| Arbitrary code from a pull request ran on the host | A workflow triggered by `pull_request` from an outside contributor ran on a self-hosted runner with no approval gate, or `pull_request_target` checked out the PR head (§5) |
| A job fails with `command not found: jq` or `git` on the host | Prerequisites were not installed on the host before the first job (§3) |
| `config.sh` fails with an authentication or registration error after a restart | The registration token was stored and has expired. Mint a fresh one at start-up from the App or PAT (§3) |
| A single hung job blocks every job behind it for hours | No `timeout-minutes` on the job. Default is 360 minutes (§4) |
| Two deploys interleave, or a deploy is cancelled half-way | `cancel-in-progress: true` on a deploy concurrency group (§4) |
| Disk full; jobs fail with odd I/O errors | `_work`, `_diag`, or Docker layers were never cleaned up (§6) |
| `npx playwright install --with-deps` fails with a permission error | The step needs root to call `apt`, and the runner user does not have it. Preinstall the libraries as root (§3, §5) |
| Node or .NET version differs between the host, the docs and the workflow | Versions were not pinned in the workflow and the docs, and the host was treated as the source (§6) |
| The runner service is down after a reboot | The service was never installed, or the systemd unit is not enabled (§3) |

## 9. Checklist

Per repository:

- [ ] Visibility checked: public repositories have outside-collaborator approval gating, or do not use self-hosted runners
- [ ] One repository variable, `RUNNER_LABELS`, holds a JSON array, and its default is set on purpose
- [ ] Every `runs-on` uses `fromJSON(vars.RUNNER_LABELS || '["ubuntu-latest"]')`, or is hard-coded for a reason
- [ ] No `env.` in any `runs-on`; no plain-string label values
- [ ] OS-specific legs are guarded, and the `&&`/`||` operands are truthy
- [ ] Release, deploy and secret-bearing jobs do not read the variable
- [ ] Secrets live in GitHub Environments with required reviewers
- [ ] Workflow-level `permissions: contents: read`, widened per job only where needed
- [ ] No `pull_request_target` job checks out the pull-request head
- [ ] `docs/RUNNER.md` exists and matches the workflows
- [ ] Rollback command written down and tested once

Per concurrency group and job:

- [ ] Every job has `timeout-minutes`
- [ ] CI groups use `cancel-in-progress: true`; deploy groups use `false`
- [ ] Jobs that diff against the base use `fetch-depth: 0`
- [ ] Toolchains come from setup-* actions with versions pinned in the workflow and the docs
- [ ] Caching uses the setup-* `cache:` inputs unless a measured reason says otherwise

Per runner host:

- [ ] Dedicated non-root user with no `sudo` and no `docker` group membership unless justified
- [ ] Prerequisites installed up front: `git`, `curl`, `ca-certificates`, `jq`, `zip`, and Docker only if used
- [ ] Runner package downloaded from the UI and verified against its SHA-256
- [ ] Registered with `--ephemeral` and the labels that match the variable
- [ ] Runs as a service (`svc.sh` or a systemd unit with `Restart=always`) that starts on boot
- [ ] Registration credential minted at start-up, not stored as a token; file mode `600`, scoped to one repository
- [ ] Host on an isolated network segment, with no personal credentials on it
- [ ] Health check on a cloud runner, and a scheduled cleanup for `_work`, `_diag` and any Docker data

Worked examples: a game and web monorepo, and a LaTeX document repository. Both run their
workflows through the switch in §1, and the release-and-secrets split in §2 and the
rollback in §6 are what they have in common.
