# Metrics exposition: bounded cardinality, and truncation you can see

A `/metrics` endpoint is the cheapest observability a service can offer and the easiest
one to turn into an outage. The failure is not that the endpoint breaks: it is that a
label with unbounded values hands the scraper a new time series per user, per session, per
request id, and the monitoring system falls over before the service does — or quietly
starts costing more than the thing it monitors.

This guide fixes the exposition rules. It is about **what you emit and how it stays
bounded**, not about which metrics matter to your domain.

It is deliberately repo-agnostic. The worked example is `konradcinkusz/copilot-scope` —
`src/CopilotScope.Collector/Api/PrometheusExporter.cs` and its `PrometheusOptions`, plus
`grafana/provisioning/` for the dashboard half.

**Contents**

1. [Every label is a cardinality decision](#1-every-label-is-a-cardinality-decision)
2. [High-cardinality dimensions are opt-in and capped](#2-high-cardinality-dimensions-are-opt-in-and-capped)
3. [Export the fact that you truncated](#3-export-the-fact-that-you-truncated)
4. [Emit sums and counts, not averages](#4-emit-sums-and-counts-not-averages)
5. [The endpoint is a surface; it can be closed](#5-the-endpoint-is-a-surface-it-can-be-closed)
6. [Dashboards are provisioned, not clicked](#6-dashboards-are-provisioned-not-clicked)
7. [Failure modes](#7-failure-modes)
8. [Checklist](#8-checklist)

---

## 1. Every label is a cardinality decision

The series count of a metric is the product of its labels' distinct values, and that
multiplication is the whole risk. A label whose values come from a bounded set —
environment, status class, model name — is free. A label whose values come from *your
data* — session id, user id, tenant, path with an id in it, raw error message — is a
series generator, and nothing in the metric's name says which kind it is.

So decide it explicitly, per label, when the metric is written. The useful question is not
"is this label interesting?" — they all are — but **"what bounds this label's distinct
values, and who enforces that bound?"** If the answer is "nothing", the label does not
ship as it stands.

Error *types* are the case worth calling out, because they look bounded and are not: a
`type` label sourced from an exception name or a remote error string is bounded by what
your dependencies decide to say, which is not a bound you control.

## 2. High-cardinality dimensions are opt-in and capped

Some high-cardinality views are genuinely useful — per-session, per-tenant — for a while,
in an investigation. Ship them, but **off by default and bounded when on**:

- **Off by default**, with the reason written where the switch is. A default-on
  per-session series is a decision nobody made, taken on behalf of the busiest deployment.
- **A configured ceiling**, and a rule for which entries win when it is reached. Most
  recently active is usually right for a debugging view; whatever you choose, write it
  down, because "which 200 of my 5,000 sessions am I looking at?" is otherwise
  unanswerable.
- **A top-N cap on open-ended label values**, ordered by volume. The long tail of an error
  `type` label is where the cardinality lives, and the top of it is where the information
  is.

> `copilot-scope` — `PrometheusOptions.PerSession` is off by default, and the comment says
> exactly why: session ids are unbounded, so one busy team would hand Prometheus a new
> time series for every conversation ever held. `MaxSessionSeries` (200, most recently
> active win) and `MaxErrorTypes` (30, top by volume) are the two ceilings.

## 3. Export the fact that you truncated

This is the rule that makes the rest safe, and the one most often missed.

**A capped exporter must emit its own ceiling and its own drop count as metrics.** Not a
log line — a series, in the same scrape, so the truncation is visible on the dashboard
built from it rather than discoverable only by reading the exporter's source.

Without it, a bounded exporter is *silently* lying: the panel says "sessions below the
quality threshold: 3" and the honest answer is "3, out of the 200 most recent, of 5,000".
A dashboard cannot warn you about data it was never sent, so the exporter has to send the
warning itself.

The same applies to a top-N label cap: emit the configured N, and how many distinct values
did not make it.

> `copilot-scope` — `copilotscope_session_series_limit` (the configured ceiling) and
> `copilotscope_session_series_dropped` (`rows.Count - recent.Count`) are exported beside
> the per-session series they bound.

## 4. Emit sums and counts, not averages

Export `_sum` and `_count` and let the query engine divide. A pre-averaged gauge is
correct only at the granularity it was computed at, and **an average of averages is not an
average** — so the moment somebody rolls your metric up across instances, emitters or any
other label, the number on the dashboard is quietly wrong in a way nothing flags.

The pair costs one extra series and makes every rollup over any label set correct.

> `copilot-scope` — `copilotscope_quality_score_sum` / `_count`, with the reason in the
> exporter's own doc comment: PromQL does the aggregation so a rollup stays correct.

## 5. The endpoint is a surface; it can be closed

`/metrics` is unauthenticated by convention and tells a reader a great deal about your
deployment: what runs, how much of it, which dependencies fail and how often. Treat
serving it as a configuration decision with an off switch, and keep the switch where the
rest of the exposition options live rather than as a route somebody has to remember to
remove.

Where the endpoint is reachable from outside the cluster, it needs the same reasoning as
any other public surface — see [`SERVICE-API-PATTERNS.md`](SERVICE-API-PATTERNS.md) §1 on
partitioning anonymous traffic.

## 6. Dashboards are provisioned, not clicked

A dashboard assembled by hand in a UI exists in one browser's memory of one afternoon.
Keep the datasource, the dashboard JSON and the scrape config **in the repository**, and
let the monitoring stack load them on start. That is the same rule the rest of this estate
applies to infrastructure, applied one layer up: if it took thirty minutes of clicking to
build, it will take thirty minutes of clicking to rebuild, and nobody will.

It also makes the exposition and its consumer reviewable together — a renamed metric and
the panel that reads it move in one diff.

> `copilot-scope` — `grafana/provisioning/datasources/`, `grafana/dashboards/`, and
> `grafana/prometheus.yml`, loaded by `docker-compose.grafana.yml`.

## 7. Failure modes

| Symptom | Cause |
|---|---|
| Prometheus memory climbs steadily and never recovers | A label carrying ids from your data — session, user, request, a path with an id in it. Each distinct value is a permanent series (§1) |
| Monitoring costs more than the service it monitors | The same, discovered on a bill rather than in a graph |
| A panel's numbers are confidently wrong, and nothing looks broken | The exporter truncated and never said so, so the dashboard is rendering a capped view as if it were complete (§3) |
| A rollup across instances disagrees with the per-instance panels | Pre-averaged gauges being averaged again — an average of averages (§4) |
| Cardinality is fine in staging and explodes in production | The high-cardinality view is default-on; staging simply never had enough distinct values to show it (§2) |
| An error-type label grows without bound | `type` sourced from an exception name or a remote error string: bounded by what dependencies say, which is not a bound you hold (§1) |
| Nobody can rebuild the dashboard after the monitoring stack is recreated | It was clicked together in a UI and never provisioned from the repository (§6) |

## 8. Checklist

- [ ] Every label answers "what bounds its distinct values, and who enforces that bound?" — a label bounded only by your data does not ship as it stands
- [ ] High-cardinality views are off by default, with the reason written at the switch
- [ ] Each such view has a configured ceiling and a stated rule for which entries win when it is reached
- [ ] Open-ended label values (error types, and anything sourced from a dependency's strings) are top-N capped by volume
- [ ] The exporter emits its own ceiling **and** its own drop count as series, so a truncated view is visible on the dashboard built from it
- [ ] Scores and latencies are exported as `_sum`/`_count` pairs rather than pre-averaged gauges
- [ ] Serving `/metrics` is a configuration decision with an off switch
- [ ] Datasource, dashboard JSON and scrape config are provisioned from the repository, not assembled in a UI
