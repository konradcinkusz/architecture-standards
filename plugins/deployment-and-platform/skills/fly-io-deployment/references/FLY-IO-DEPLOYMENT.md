<!-- Generated copy of docs/guides/FLY-IO-DEPLOYMENT.md — do not edit. Relative links have been rewritten to absolute repository URLs. -->

# Making an app deployable to Fly.io

The estate's deployment target is Fly.io (P7), reached by a tag-driven pipeline (P12).
This guide is the operational half of those two principles: what a service must do to be
deployable, what each `fly.toml` says and why, and what the workflow that ships it looks
like.

It is deliberately repo-agnostic. Worked examples live in `<saas>/flyio/` and
`<second-app>/flyio/`; the rules below are what those two have in common, plus the reasons —
because the reasons are the part that transfers.

**Contents**

1. [The model in one paragraph](#1-the-model-in-one-paragraph)
2. [What a service must satisfy before it can be deployed](#2-what-a-service-must-satisfy-before-it-can-be-deployed)
3. [Repository layout](#3-repository-layout)
4. [`fly.toml`, annotated](#4-flytoml-annotated)
5. [The four shapes: HTTP service, database, frontend, one-shot job](#5-the-four-shapes)
6. [Networking: public URL, `.internal`, `.flycast`](#6-networking-public-url-internal-flycast)
7. [Scale to zero, and when not to](#7-scale-to-zero-and-when-not-to)
8. [State: volumes and databases](#8-state-volumes-and-databases)
9. [Configuration and secrets](#9-configuration-and-secrets)
10. [The deploy pipeline](#10-the-deploy-pipeline)
11. [Bootstrapping a new app](#11-bootstrapping-a-new-app)
12. [Scaling and teardown workflows](#12-scaling-and-teardown-workflows)
13. [Cost](#13-cost)
14. [Failure modes](#14-failure-modes)
15. [Checklist](#15-checklist)

---

## 1. The model in one paragraph

A Fly **app** is a name, a config, a set of secrets and an IP. It runs one or more
**machines** — Firecracker VMs, each holding one container. The **Fly proxy** sits in
front of apps that declare an `[http_service]`, terminates TLS, and can start a stopped
machine on the first request and stop it again when idle. Apps in one organisation share
a private WireGuard mesh (**6PN**) where every app resolves at `<app>.internal`. A
**volume** is a local disk pinned to one machine in one region — not network storage, and
not replicated.

Three consequences shape everything below: one app per service; state gets a volume and
therefore cannot be scaled horizontally; and anything reachable only over 6PN needs no
public listener at all.

## 2. What a service must satisfy before it can be deployed

None of this is Fly-specific. It is what makes a service deployable to *anything*, and
Fly happens to be unforgiving about all five.

**Listen on one port, from configuration, on all interfaces.** `0.0.0.0`/`[::]`, not
`localhost` — a container that binds loopback is unreachable from the proxy. The estate
uses **8080** everywhere for .NET (`ASPNETCORE_URLS=http://+:8080`) and 3000 for Node.
Whatever the number, `internal_port` in `fly.toml` must equal it.

**Answer a health endpoint that means something.** Fly decides whether a deploy succeeded
from this. Two rules:

- Do not point the check at the app's index page. A frontend serving a broken bundle
  still returns 200 for `/`, so the check would pass on a white screen. Serve a dedicated
  `/healthz` that exists only to be checked.
- Distinguish *liveness* from *readiness* if the service has slow startup work.
  ASP.NET's `/alive` (liveness-tagged checks only) and `/health` (everything) is the
  estate's split.

**Start fast, or start answering fast.** The deploy fails if health checks do not pass
within `grace_period`. Slow first-boot work — schema migration especially — must not
block the listener. Run it in a `BackgroundService` after Kestrel is up, so the app is
answering probes while the schema catches up.

**Read configuration from the environment.** No `appsettings.Production.json` baked into
the image, no compiled-in URLs. .NET's `Key__SubKey` convention maps environment
variables onto config sections for free; use it. A frontend that needs its API addresses
at runtime writes them into a `config.json` at container start (see §5) instead of
baking them into the bundle at build time — that is what makes one image promotable
across environments.

**Degrade when an optional dependency is absent (P8).** A service that refuses to start
without an API key it only needs for one feature cannot be deployed incrementally, and
cannot be run on a laptop at all.

**Ship a multi-stage Dockerfile (P6)** whose runtime image major version matches the
target framework's major version. Roll-forward does not cross a major, and getting it
wrong is a startup failure, not a warning.

## 3. Repository layout

```
<repo>/
├─ flyio/
│  ├─ <service>.fly.toml          one per app
│  ├─ postgres.fly.toml
│  ├─ SECRETS.md                  what is a secret, where it lives, how to set it
│  └─ INFRASTRUCTURE-ANALYSIS.md  topology, sizing, cost reasoning
├─ .dockerignore                  for images whose context is the repo root
├─ .github/workflows/
│  ├─ flyio.yml                   tag-driven build + ordered deploy
│  ├─ flyio-scale.yml             manual scale up / down
│  └─ flyio-destroy.yml           manual teardown, behind a typed confirmation
└─ src/<Service>/Dockerfile       one per service, next to its code
```

Configs live in `flyio/`, not next to each service, because the deploy workflow reads
them as a set and because the whole topology should be visible in one directory listing.

## 4. `fly.toml`, annotated

The stateless HTTP service — the shape most apps take:

```toml
app = "<system>-<service>-<env>"     # globally unique across all of Fly
primary_region = "waw"              # where machines are created by default

[build]
  dockerfile = "../src/<Service>/Dockerfile"   # relative to THIS FILE
  context = ".."                               # relative to THIS FILE; see below

[env]                               # non-secret configuration, reviewable in a diff
  ASPNETCORE_ENVIRONMENT = "Production"
  ASPNETCORE_URLS = "http://+:8080"
  Jwt__Authority = "https://<system>-identity.fly.dev"
  Cors__AllowedOrigins__0 = "https://<system>-web.fly.dev"

[http_service]
  internal_port = 8080              # must equal the port the process binds
  force_https = true
  auto_stop_machines = "stop"       # proxy stops idle machines
  auto_start_machines = true        # proxy starts them on the next request
  min_machines_running = 0          # 1 for anything on a synchronous request path

  [http_service.concurrency]
    type = "requests"
    hard_limit = 250                # proxy queues past this
    soft_limit = 200                # proxy prefers another machine past this

  [[http_service.checks]]
    path = "/health"
    interval = "30s"
    timeout = "5s"
    grace_period = "60s"            # covers cold start + first-boot schema work

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
```

**`context` is the field most often left out and most often wrong.** Both paths in
`[build]` are resolved relative to the toml file, not the working directory. A .NET
Dockerfile that does `COPY src/Foo/Foo.csproj …` needs the repository root as context
(`context = ".."` from `flyio/`); a Node Dockerfile that does `COPY package.json ./`
needs the project directory. Omitting it makes the build depend on where `flyctl`
happened to be invoked — it will work from the repo root and break in CI, or vice versa.

**`app` is globally unique across all of Fly**, not just your organisation. Include the
system name and the environment: `aureliuspromptus-authservice-dev`, not `authservice`.

**Everything in `[env]` is public.** It ends up in the image config and in
`fly config show`. Anything that would be embarrassing there is a secret (§9).

## 5. The four shapes

### Stateless HTTP service

As above. The default: scale to zero, one health check, 512 MB.

### Database (or anything stateful)

```toml
app = "<system>-postgres"
primary_region = "waw"

# No [http_service] and no [[services]] block, deliberately: this is reached only at
# <app>.internal:5432 over 6PN. A database with a public listener is a database
# waiting to be scanned.

[build]
  image = "postgres:17-alpine"      # a pinned major, not `latest`

[env]
  POSTGRES_USER = "<system>"
  POSTGRES_DB = "<system>"
  PGDATA = "/var/lib/postgresql/data/pgdata"   # a SUBDIRECTORY — see §8
  POSTGRES_INITDB_ARGS = "--encoding=UTF8 --locale=C"

[[mounts]]
  source = "<system>_pgdata"
  destination = "/var/lib/postgresql/data"
  initial_size = "10gb"

[[vm]]
  size = "shared-cpu-1x"
  memory = "1gb"

# Runs on first boot only — the postgres entrypoint executes
# /docker-entrypoint-initdb.d/*.sh only when the data directory is empty.
[[files]]
  guest_path = "/docker-entrypoint-initdb.d/01-create-databases.sh"
  raw_value = """#!/bin/bash
set -e
for db in adb bdb cdb; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE $db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\\gexec
EOSQL
done
"""
```

Notes that cost time if missed: no public listener means no proxy smoke check, so
`flyctl deploy` will not sit waiting for an HTTP response that is never coming. `--ha=false`
matters here more than anywhere — a second machine would get a second empty volume, not a
replica. And `[[files]]` with `raw_value` is how a small init script reaches the container
without building a custom image.

### Frontend

Same as a stateless service, plus one thing: **runtime configuration**. Bake API
addresses into the bundle and you have one image per environment. Instead, have the
container write them at start:

```sh
#!/bin/sh
set -eu
cat > /usr/share/nginx/html/assets/config.json <<JSON
{ "apiUrl": "${API_URL:-http://localhost:5001/api}" }
JSON
exec nginx -g 'daemon off;'
```

with `API_URL` set in `[env]`, and a cache-control header on `config.json` so a promoted
artifact does not keep serving the previous environment's addresses. Next.js does the
same job with `standalone` output and server-side env reads.

### One-shot / scheduled job

A process that runs and exits cannot be deployed with `flyctl deploy` — health checks
would report it dead, correctly. Use a machine directly:

```bash
flyctl machine run "registry.fly.io/<app>:<tag>" \
  --app "<app>" --region "<region>" \
  --schedule daily --restart no \
  --vm-size shared-cpu-1x --vm-memory 512
```

Destroy the previous machine first so the schedule picks up the new image. Two details
that bite: `--restart no`, or Fly restarts the "crashed" job forever; and a
`sleep 2` before exit, because the log forwarder can drop the tail of a machine that
exits immediately.

## 6. Networking: public URL, `.internal`, `.flycast`

| Address | Reaches | Auto-starts a stopped machine | Use for |
|---|---|---|---|
| `https://<app>.fly.dev` | Public internet, via the Fly proxy | yes | Browsers, and service→service HTTP |
| `<app>.internal:<port>` | 6PN mesh, direct to machines (IPv6, DNS round-robin) | **no** | Databases and anything that never stops |
| `<app>.flycast:<port>` | 6PN, via the proxy | yes | Private service→service, once you allocate a private IPv6 |

The default for service-to-service HTTP in this estate is the **public URL**. It sounds
wasteful and mostly is not: the hop stays inside Fly's network, TLS is terminated for
you, and — the actual reason — the proxy will start a stopped machine, which `.internal`
will not. Point a caller at `.internal` and the callee scales to zero, and the call fails
instead of waking it.

Two things force the public URL regardless: an OIDC/JWT **issuer**, because the value is
stamped into the `iss` claim and every validator must be able to fetch
`<authority>/.well-known/jwks.json` from wherever it runs; and anything a browser
touches.

Databases are the mirror image: `.internal` always, no public IP ever. They never scale
to zero, so the auto-start argument does not apply, and a public listener is pure risk.
Reach one from a laptop with `fly proxy 15432:5432 --app <app>`.

Note that `.internal` resolves to AAAA records only. Clients and connection strings must
be IPv6-capable — most are; some ancient drivers are not.

## 7. Scale to zero, and when not to

`min_machines_running = 0` is the default, and it is most of the cost saving.

The rule for when to depart from it is mechanical. **For every in-request call A→B,
either B keeps a machine running, or A's timeout comfortably exceeds B's cold start.**
The second option is written down far more often than it is actually configured, so
prefer the first.

Applying it means listing the synchronous calls, not the services:

- A service whose JWKS every other service fetches is on the request path of all of
  them — and not only on the first request, because validators re-fetch when their cache
  expires. It pins a machine.
- A service called mid-checkout by another service pins a machine.
- A service entered only from a browser scales to zero. A cold start there is a slow
  first page, not a failed call.

Machines that are stopped still cost their volume, if any, and nothing else.

## 8. State: volumes and databases

**A volume is a local disk bound to one machine in one region.** Not network storage, not
replicated, not shared. This has one large consequence: an app with a volume cannot be
scaled horizontally by adding machines — the second machine gets a second, empty volume.
Deploy stateful apps with `--ha=false` and exclude them from any scaling workflow.

**Point `PGDATA` at a subdirectory of the mount**, e.g.
`/var/lib/postgresql/data/pgdata` under a mount at `/var/lib/postgresql/data`. The volume
root carries `lost+found` and `initdb` refuses a non-empty data directory. This failure
is silent-looking and costs an hour the first time.

**Declare `initial_size`.** Growing a volume later is possible; shrinking is not.

**One instance, one database per service.** Physical co-location is a cost decision; the
logical boundary is what must not be crossed (P3). Each service gets a connection string
to exactly one database and no credentials for the others, so splitting into separate
instances later is a configuration change, not a code change.

**Migrate; never `EnsureCreated`** (P4). `EnsureCreated` records no migration, so the
schema freezes at first-boot state while migrations accumulate in code, and the first
request touching a newer column fails. Apply migrations from a background service after
the listener is up, so a slow migration is not read as a failed deploy.

## 9. Configuration and secrets

The split is not a matter of taste:

| | Where | Visible in | Set by |
|---|---|---|---|
| Non-secret config | `[env]` in `fly.toml` | git diff, `fly config show`, image metadata | committed file |
| Secrets | Fly secrets | nothing — names and digests only | `fly secrets set`, from CI |

Authority URLs, audiences, allowed origins, service addresses, feature flags, log levels:
`[env]`. Connection strings, signing keys, API keys, passwords: secrets. When in doubt,
ask whether you would paste it into a pull request.

```bash
fly secrets set -a <app> "Key__SubKey=value" --stage
fly secrets list -a <app>       # names and digests; values are never readable back
```

`fly secrets set` restarts the app. `--stage` holds the change until the next deploy,
which is what CI should use so one release does not restart a service twice. Multi-line
values (a PEM key) work as a normal quoted argument.

**Set secrets from the pipeline, not by hand.** A secret set manually on one app and
forgotten is how environments drift. The GitHub environment holds the small set of root
secrets; the workflow derives everything else — connection strings are assembled from a
password plus a known host, not stored per service.

**Fail the deploy on a missing critical secret.** Services should degrade when an
*optional* dependency is absent (P8); a signing key is not optional, and a service that
boots with an ephemeral one will look healthy while invalidating every token on restart.
Check for it explicitly in the workflow and exit non-zero.

## 10. The deploy pipeline

```
push tag v*
  ├── test                    build + unit tests + any mechanical guards
  ├── detect-changes          diff vs previous tag → per-service flags + build matrix
  │                           plus: a service whose Fly app is missing is always selected
  ├── build   (matrix)        one image per changed service → registry.fly.io, GHA cache
  └── deploy  (ordered)       state → auth → domain services → jobs → frontends
```

**Trigger on a tag, not on a branch push.** A deploy should be an act, and a tag is the
record of it.

**Change detection compares against the previous tag** (`git describe --tags --abbrev=0
"$TAG^"`), not against the previous commit. Map paths to services explicitly, and
remember that a change to the shared kernel or the contracts project invalidates every
image that compiles it.

**Always select a service whose Fly app does not exist.** This one rule is what lets a
cold estate come up from a single tag with no manual `fly launch` — and what rescues you
after a `flyio-destroy` run.

**Build once, deploy many.** Build each image exactly once, push it to
`registry.fly.io/<app>:<tag>`, then have every deploy step reference it with
`flyctl deploy --image`. Never build inside a deploy step, and never build the same
source twice for two targets.

**`fail-fast: false` on the build matrix**, so one broken image does not cancel the
others mid-push.

**Order deploys by dependency, and let a skipped upstream pass.** The gate on each deploy
job is "my upstream succeeded *or* was skipped":

```yaml
if: >-
  ${{ always() && !cancelled()
      && needs.detect-changes.outputs.billing == 'true'
      && needs.build.result == 'success'
      && (needs.deploy-identity.result == 'success' || needs.deploy-identity.result == 'skipped') }}
```

Without the `|| skipped`, change detection and ordering fight each other: any unchanged
service in the middle of the chain blocks everything behind it.

**Gate the database separately.** Redeploying Postgres restarts it. It should run when
its own config changed or the app is missing — not on every tag.

**Verify one thing after the deploy that the health check cannot see.** For an issuer,
that its JWKS endpoint returns keys; otherwise every downstream service rejects every
token while looking perfectly healthy. `--wait-timeout` covers "did it start", not "is
it correct".

Job-name and expression traps worth knowing before you hit them: GitHub expressions read
`-` as subtraction, so a job output must be `promotion_expiry`, not `promotion-expiry`;
the `env` context is not available in a job-level `if`; and `flyctl apps list --json`
has changed field casing between versions, so match with `(.Name // .name)`.

## 11. Bootstrapping a new app

Do it from the pipeline, not from a laptop — `fly launch` writes a config you did not
review and creates an app whose settings exist nowhere in git.

```yaml
- name: Ensure the Fly app exists
  run: |
    if flyctl apps list --json | jq -e --arg a "$APP" '.[] | select((.Name // .name) == $a)' >/dev/null; then
      echo "App $APP already exists."
    else
      flyctl apps create "$APP" --org "${FLY_ORG:-personal}" --yes
    fi
```

The same idempotent guard applies to volumes. With that plus "missing app ⇒ changed"
(§10), the first tag against an empty organisation provisions the entire estate.

One-time human setup, per repository:

1. `fly tokens create org` → store as `FLY_API_TOKEN` in a GitHub **environment** (not a
   repository secret — an environment can be reviewed and restricted).
2. Add the root secrets that environment needs (database password, signing key, third
   party API keys).
3. Nothing else. No app creation, no volume creation, no `fly launch`.

## 12. Scaling and teardown workflows

Two manual workflows earn their place next to the deploy:

**Scale** (`workflow_dispatch` with a choice input) — normalise machine counts, start
everything, scale the request path out to two, or wind the estate down. Exclude stateful
apps: `flyctl scale count 2` on an app with a volume creates a second empty database.
Note also that scaling a stateless app to *zero machines* is not the same as
`min_machines_running = 0` — the latter lets the proxy start a stopped machine, the
former leaves nothing to start.

**Destroy** — behind a typed confirmation string, defaulting to keeping the data volume.
A workflow that destroys data on a single click eventually gets a single click. Destroy
in reverse dependency order so nothing is left serving requests against an app that has
already gone.

## 13. Cost

Reason about it per service, in the repository, in `flyio/INFRASTRUCTURE-ANALYSIS.md`
(P7). A useful one is short and answers four questions:

1. **What runs when nothing is happening?** A table of apps, machines-when-idle, memory.
2. **Which services pin a machine, and which synchronous call forces it?** Naming the
   call is the point — it is what makes the decision reviewable later.
3. **What is the cheaper option and what does it actually cost?** "Let billing scale to
   zero, at the price of a several-second stall on the first publish after idle" is a
   decision someone can take. "Could be optimised" is not.
4. **What is off the table?** Turning off `force_https`, sharing one database across
   services, giving the database a public IP. Say so, so nobody re-proposes them.

## 14. Failure modes

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

## 15. Checklist

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

Worked examples: `<saas>/flyio/` and `<saas>/.github/workflows/flyio.yml`
(the larger estate, with PR environments and an ephemeral provisioner machine);
`<second-app>/flyio/` and `<second-app>/.github/workflows/flyio.yml` (the smaller one, and the
closer read if you are starting from scratch).
