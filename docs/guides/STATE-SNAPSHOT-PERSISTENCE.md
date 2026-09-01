# Write-behind snapshot persistence

Some services hold a hot aggregate in memory and are correct to. A collector accumulating
telemetry, a rate limiter, a live scoreboard, a counter cache: the working set is small,
the read path is a field access, and putting a database in front of it would be slower and
no more correct.

What such a service still needs is durability across restarts — and the naive answer,
writing on every mutation, converts a burst of ingest into a write storm and couples the
hot path to the database's worst minute.

This guide fixes that shape: **write-behind snapshots**. It is not a general persistence
guide, and it is deliberately narrow — see §6 for when not to use it.

It is repo-agnostic. The worked example is `konradcinkusz/copilot-scope` —
`src/CopilotScope.Collector/Persistence/` (`PersistenceWriter`, `SessionRepository`,
`PersistedSession`) and the merge path in `Program.cs`.

**Where this sits relative to [P4](../architecture/00-REFERENCE-ARCHITECTURE.md#p4).** P4
governs an **ORM-managed relational schema**: an entity model, a migrations history, a
provider that applies it, and the rule that schema is migrated rather than "ensured". A
snapshot store has no entity model, so it is outside that rule rather than an exception
being tolerated — P4 says so directly. What follows are the rules it carries instead.

**Contents**

1. [Mark dirty, flush on a timer](#1-mark-dirty-flush-on-a-timer)
2. [The schema is one table, bootstrapped idempotently](#2-the-schema-is-one-table-bootstrapped-idempotently)
3. [Rehydrate on start, with a bound](#3-rehydrate-on-start-with-a-bound)
4. [A dead database degrades; it never blocks ingest](#4-a-dead-database-degrades-it-never-blocks-ingest)
5. [Deletions must reach the store, or they come back](#5-deletions-must-reach-the-store-or-they-come-back)
6. [When not to use this](#6-when-not-to-use-this)
7. [Failure modes](#7-failure-modes)
8. [Checklist](#8-checklist)

---

## 1. Mark dirty, flush on a timer

The hot path does **one** thing: add the touched keys to a dirty set, under a lock. It
does not serialise, does not await, and does not touch the database.

A background loop wakes on a fixed interval, swaps the dirty set out under the same lock,
and writes those entries. The interval is the whole design: it collapses N mutations of
the same entity within one window into **one** write, which is what stops a burst of
ingest becoming a burst of writes.

Two details that are easy to get wrong:

- **Swap and clear the set inside the lock, then write outside it.** Holding the lock
  across the database call puts the hot path behind the database again, which is the
  problem you were solving.
- **A failed write re-queues its key for the next tick** rather than being retried in
  place or dropped. In place, one unavailable database stalls the whole flush; dropped,
  the entry stays stale until it happens to be touched again — which for a cooling
  session may be never.

> `copilot-scope` — `PersistenceWriter.MarkDirty` takes the lock only to add ids;
> `ExecuteAsync` delays one second, swaps `_dirty` under the lock, then writes, and a
> failed upsert does `lock (_lock) _dirty.Add(id)` with the comment "retry on next tick".

## 2. The schema is one table, bootstrapped idempotently

One row per aggregate: the identity, whatever columns you actually query or index on, and
the rest as a single JSON document.

Keep promoted columns to what the read path needs — a timestamp to sort by, a score to
filter on. Every promoted field is a migration you will owe later; every field left inside
the document is free to change with the code that writes it. That asymmetry is the reason
this shape exists.

Write the schema as idempotent DDL (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT
EXISTS`) executed at startup. This is **not** the "ensure created" that P4 forbids: there
is no entity model to drift from, and the DDL is the same hand-written statement every
time rather than a shape inferred from classes that changed underneath it.

Use a plain upsert (`INSERT … ON CONFLICT DO UPDATE`), because the writer is a periodic
flush and must be safe to run again on the same key. That the flush is naturally
idempotent is what makes the re-queue in §1 safe.

> `copilot-scope` — `SessionRepository.EnsureSchemaAsync` (one table, `snapshot jsonb`,
> one index on `last_seen`) and `UpsertAsync` (`ON CONFLICT (id) DO UPDATE`).

## 3. Rehydrate on start, with a bound

On startup, load the persisted rows back into memory before serving. Without it the store
is durable in one direction only, which is a strange thing to pay for.

**Bound the load.** A rehydrate that reads the whole table is a startup time that grows
with your history and a memory footprint nobody chose — and it fails at the worst moment,
when the service is already restarting. Load the most recent N, ordered by the column you
promoted for exactly that purpose, and treat the bound as configuration rather than a
constant nobody can find.

## 4. A dead database degrades; it never blocks ingest

The hot path must keep working when persistence is unavailable. Bootstrap and rehydrate
run inside a try/catch that **logs and continues** — an unreachable database at startup
means "in memory only, retry on the next write", not a failed boot.

This is [P8](../architecture/00-REFERENCE-ARCHITECTURE.md#p8) applied to the store: an
optional dependency degrades. What makes it safe here is that the degraded mode is the
service's *normal* mode with durability switched off, so there is no second code path to
get wrong — the aggregate was always in memory, and the flush was always best-effort.

Log it at a level somebody sees. Silent degradation is how a service runs for a month
without persistence and nobody notices until a restart.

## 5. Deletions must reach the store, or they come back

The rule that is missed most often, because it is invisible until a restart.

Anything that **removes or merges** an aggregate in memory must delete the corresponding
row. Otherwise the next rehydrate resurrects it: the entry was removed from memory, never
from the table, and it returns looking exactly like live data.

This bites hardest where entries are *merged* rather than deleted outright — the merge
consumes a key that no longer has an in-memory owner, so nothing later will overwrite its
row, and only an explicit delete removes it.

Delete failures here are safe to log and continue: the cost is a ghost on some future
restart, not a broken request, and blocking ingest on a cleanup would violate §4.

> `copilot-scope` — `Program.cs` drains merged bucket ids after ingest and deletes each
> from Postgres, with the comment stating the failure: "or they'd come back as ghosts on
> the next rehydration."

## 6. When not to use this

This shape trades durability for throughput, and the trade is only sound when the
aggregate can afford to lose the last flush interval.

Do **not** use it when a lost second of writes is a lost transaction, when readers other
than this service need the data live, or when the aggregate is large enough that
serialising it on a timer is itself the cost. Those want an ORM-managed schema and P4's
rules, not this.

And say which one you chose, in the repository. A reader who finds `CREATE TABLE IF NOT
EXISTS` with no explanation is entitled to assume somebody skipped migrations.

## 7. Failure modes

| Symptom | Cause |
|---|---|
| A burst of traffic produces a burst of writes and latency follows it | Writing on mutation instead of marking dirty and flushing on a timer (§1) |
| The hot path stalls whenever the database is slow | The flush holds the lock across the database call, so the hot path queues behind it (§1) |
| One entry stops being persisted and nothing reports it | A failed write dropped its key instead of re-queueing; the entry updates again only if it is touched again (§1) |
| Deleted or merged entries reappear after a restart | The removal never reached the table, so rehydrate restored them as ghosts (§5) |
| Startup time grows with the size of the history | Rehydrate is unbounded — it reads the whole table rather than the most recent N (§3) |
| The service ran for weeks with no persistence and nobody knew | The degrade-to-memory path logs at a level nobody reads (§4) |
| A schema change requires a migration this shape was chosen to avoid | Too many fields promoted out of the document into columns (§2) |
| A reviewer reads the idempotent DDL as a skipped migration | The choice between this shape and an ORM-managed schema was never written down (§6) |

## 8. Checklist

- [ ] The hot path only marks keys dirty under a lock — no serialising, no awaiting, no database call
- [ ] The flush loop swaps the dirty set inside the lock and writes outside it
- [ ] A failed write re-queues its key for the next tick rather than retrying in place or dropping it
- [ ] One table, one JSON document per aggregate, columns promoted only for what the read path queries or sorts on
- [ ] Schema bootstrapped with idempotent DDL, and the upsert safe to repeat on the same key
- [ ] Rehydrate on startup is bounded, ordered by a promoted column, and the bound is configuration
- [ ] Bootstrap and rehydrate failures log and continue; an unavailable database never blocks the hot path or fails the boot
- [ ] Every in-memory removal **and merge** deletes the corresponding row
- [ ] The repository records why this shape was chosen over an ORM-managed schema
