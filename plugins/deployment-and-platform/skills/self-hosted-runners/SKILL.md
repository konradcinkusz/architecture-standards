---
name: self-hosted-runners
description: >-
  Use when running GitHub Actions on local self-hosted runners instead of
  GitHub-hosted ones, or when reviewing such a setup. One repository variable
  (RUNNER_LABELS, a JSON array) switches every job, with cloud as the default;
  the guard for jobs that need an OS the host lacks; release and
  secret-bearing jobs that stay on cloud; runner host setup with ephemeral
  registration and re-minted tokens; concurrency and timeouts; the security
  rules for running pull-request code on your own machine; operations and the
  offline-runner fallback; and the agent procedure that writes docs/RUNNER.md.
---

# Running GitHub Actions on self-hosted runners

**Read [`references/SELF-HOSTED-RUNNERS.md`](references/SELF-HOSTED-RUNNERS.md) before applying any of this.**
That file is the standard; everything below it is a summary to help you decide
whether this skill applies and to check your work afterwards.

Reference-architecture principles: P5, P12.

## What this standard covers

- The switch: one variable, read by every job
- Jobs that stay on cloud
- Runner host setup
- Ephemeral or persistent, concurrency and timeouts
- Security: read this section first
- Operations
- Agent procedure: running Actions on local runners

## Failure modes

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

## Checklist

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

---

Generated from [`docs/guides/SELF-HOSTED-RUNNERS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/SELF-HOSTED-RUNNERS.md) by `scripts/build-marketplace.mjs`. Do not edit this file: change the source document, or its entry in `catalog/marketplace.catalog.json`, and re-run the generator.
