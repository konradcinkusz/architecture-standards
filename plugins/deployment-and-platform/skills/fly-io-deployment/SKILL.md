---
name: fly-io-deployment
description: >-
  Use when making a service deployable to Fly.io, writing or reviewing a
  fly.toml, or building the deploy pipeline. Every fly.toml field annotated,
  the four service shapes (HTTP service, database, frontend, one-shot job),
  6PN .internal and .flycast networking, scale-to-zero and when not to,
  volumes and state, configuration and secrets, the tag-driven pipeline with
  change detection, bootstrapping a new app, scaling and teardown, and cost.
---

# Making an app deployable to Fly.io

**Read [`references/FLY-IO-DEPLOYMENT.md`](references/FLY-IO-DEPLOYMENT.md) before applying any of this.**
That file is the standard; everything below it is a summary to help you decide
whether this skill applies and to check your work afterwards.

Reference-architecture principles: P7, P12.

## What this standard covers

- The model in one paragraph
- What a service must satisfy before it can be deployed
- Repository layout
- `fly.toml`, annotated
- The four shapes
- Networking: public URL, `.internal`, `.flycast`
- Scale to zero, and when not to
- State: volumes and databases
- Configuration and secrets
- The deploy pipeline
- Bootstrapping a new app
- Scaling and teardown workflows
- Cost

## Failure modes

| Symptom | Cause |
|---|---|
| Deploy hangs, then fails on health checks | Process bound to `localhost`, or `internal_port` ≠ the port it binds |
| Health checks fail only on first deploy | Migration or seeding blocks startup — move it after the listener, and raise `grace_period` |
| `initdb: directory not empty` | `PGDATA` points at the mount root; `lost+found` lives there. Use a subdirectory |
| Database never initializes against a plain `flyctl deploy`, no useful error | `[build] image` points at Fly's managed `postgres-flex`, which expects `fly postgres create`-style bootstrapping (cluster credentials, multi-machine setup) — not a bare deploy. Use a vanilla `postgres:<major>-alpine` image (§5) instead; it is what a plain `flyctl deploy` actually knows how to initialize |
| Second database machine comes up empty | An app with a volume was scaled past 1. Deploy stateful apps `--ha=false` |
| Every token rejected after a working deploy | Issuer's `Jwt__Authority` ≠ the URL validators fetch JWKS from; `iss` will not match |
| Service-to-service call fails after an idle period | Caller points at `.internal` and the callee scaled to zero. Use the public URL or `.flycast` |
| Frontend serves the previous environment's API addresses | Runtime `config.json` cached, or addresses baked in at build time |
| Build works locally, breaks in CI (or vice versa) | `[build] context` not declared; the context depended on the working directory |
| Scheduled job restarts forever | `--restart no` missing; Fly treats a clean exit as a crash |
| Scheduled job's last log lines missing | Machine exited before the log forwarder flushed. Sleep ~2s before exit |
| `.NET` container exits immediately with no useful error | Runtime image major ≠ TFM major; roll-forward does not cross a major |
| Deploy succeeds but nothing is reachable | App has no `[http_service]`, or no public IP was allocated |

## Checklist

Per service:

- [ ] Binds `0.0.0.0`/`[::]` on a port set by configuration; `internal_port` matches
- [ ] Health endpoint that fails when the app is broken, not just when it is gone
- [ ] Slow first-boot work happens after the listener is up
- [ ] Multi-stage Dockerfile; runtime image major = TFM major; project files restored before source
- [ ] `.dockerignore` covering the actual build context
- [ ] All configuration read from the environment; nothing environment-specific in the image
- [ ] Optional dependencies degrade rather than block startup

Per `fly.toml`:

- [ ] `app` is globally unique and carries system + environment
- [ ] `[build] dockerfile` **and** `context` both declared
- [ ] `[env]` holds only things that may be public
- [ ] `min_machines_running` justified: 0, or 1 with the synchronous call named in a comment
- [ ] Health check path, `interval`, `timeout`, `grace_period` set deliberately
- [ ] Stateful apps: no `[http_service]`, `[[mounts]]` with `initial_size`, `PGDATA` subdirectory

Per repository:

- [ ] `flyio/SECRETS.md` — what is secret, where it lives, how to set it
- [ ] `flyio/INFRASTRUCTURE-ANALYSIS.md` — topology, sizing, cost reasoning
- [ ] Tag-triggered workflow: test → detect → build once → ordered deploy
- [ ] Missing Fly app ⇒ always selected, so a cold estate comes up from one tag
- [ ] App and volume creation are idempotent and live in the workflow, not in someone's shell history
- [ ] Deploy gates accept `success || skipped` from upstream jobs
- [ ] Database gated separately from the services
- [ ] At least one post-deploy assertion the health check cannot make
- [ ] Manual scale and destroy workflows; destroy is behind a typed confirmation

---

Generated from [`docs/guides/FLY-IO-DEPLOYMENT.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/FLY-IO-DEPLOYMENT.md) by `scripts/build-marketplace.mjs`. Do not edit this file: change the source document, or its entry in `catalog/marketplace.catalog.json`, and re-run the generator.
