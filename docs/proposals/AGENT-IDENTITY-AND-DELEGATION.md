# Proposal — agent identity and delegation

> Source: reviewing whether `konradcinkusz/authservice` should grow an agent-to-agent
> authorization capability, 2026-08-25 — recorded there as ADR 0004
> (`docs/decisions/0004-agent-to-agent-authorization.md`), status **Proposed**. Checked
> against the constitution (P1–P15) and every guide's header to avoid proposing a duplicate:
> the closest neighbours are `AZURE-AI-FOUNDRY-AGENTS.md` (provisions tool-using agents, but
> treats identity purely as Azure managed identity and RBAC over *Azure* resources),
> `IDENTITY-AND-ACCOUNTS.md` (assumes a human account end to end) and
> `SERVICE-API-PATTERNS.md` §5 (one line: forward the inbound bearer). None covers what
> credential an agent carries **into a first-party API**. Nothing here is merged — this is a
> proposal for the maintainer to accept, defer, or reject, following the convention of
> `EXTRACT-SHARED-SERVICE-PATTERN.md`.
>
> **Confidence note, stated plainly**, because this one is thinner than usual and splits in
> two. The **diagnostic half** — what the estate does today and why it stops working once a
> caller is autonomous — is evidence-backed and every claim is citable in a public repo. The
> **prescriptive half** — how agent identity and delegation should be built — has **no
> production mileage anywhere in the estate**. Nothing has shipped it, so there is nothing to
> generalize *from*; it is derived rather than extracted, which is the one thing the guides
> in this corpus are not. That is *less* evidence than the single data point that kept
> `EXTRACT-SHARED-SERVICE-PATTERN.md` out of `docs/guides/`, so this stays a proposal at
> least until `authservice` ships ADR 0004's steps 1–3 and something runs against it.

---

## Why this exists

Two guides in this corpus describe halves of a system that never meet.

`AZURE-AI-FOUNDRY-AGENTS.md` provisions **tool-using agents**: §2 defines an agent as a
model-backed object with "optional tools (code interpreter, **function calling**)", and §7
gives each *service* a user-assigned managed identity scoped to the Azure resources it
touches — SQL, blob storage, the Foundry project, the OpenAI account — so that "what can
`agenticservice` reach" is answerable by reading two small files.

That governs what an agent's **host service** may reach **in Azure**. It is silent on the
call going the other way: when an agent's function call hits a first-party API in the estate,
on a user's behalf, what credential does it carry and whose authority does it spend?

The only rule that applies there is `SERVICE-API-PATTERNS.md` §5 — *forward the inbound
bearer token; the callee enforces authorization*. For first-party services carrying a human's
request through a hop or two, that is honest rather than naive, and the guide says so. The
proposal is that it stops being honest the moment the holder is autonomous, and that the
corpus should say where the line is rather than leave each service to find it.

## What the estate does today, and where it stops working

*This section is the evidence. Every claim below is a present-tense fact about
`konradcinkusz/authservice`, the estate's identity service and a public repository.*

Forwarding a user's access token to an autonomous caller has five properties. Four are
consequences of the token's contents; the fifth is a property of the estate's whole
validation posture and is the one that matters most.

| # | Property today | Why an autonomous holder changes the verdict |
|---|---|---|
| 1 | **Authority is total.** `TokenService.BuildClaimsAsync` stamps every role and every `organization:{id}:role` the user holds. | The token is scoped to the *person*, not to the *errand*. An agent asked to do one thing receives the user's entire authority across every service that trusts the issuer. |
| 2 | **The window is an hour.** `Jwt:ExpirationMinutes` defaults to 60. | A sensible figure for a human at a keyboard, and a long time for a credential sitting in an unattended process that may itself be prompt-injectable. |
| 3 | **The audit log cannot tell the difference.** `AuditEvent` records `ActorUserId`; there is no field for a non-human actor and none for a delegation chain. | "The user did this" and "an agent did this, unattended" become the same row. This is the one property that is **not recoverable afterwards** — history written under a person's name cannot be re-attributed later. |
| 4 | **Revocation is all-or-nothing.** `RevokeRefreshTokensAsync(userId)` is the only lever. | Killing one misbehaving agent signs the human out everywhere, which means in practice nobody kills it. |
| 5 | **One audience for every token.** `Program.cs` validates a single `ValidAudience`, and the service's README instructs every consumer to validate that same value. | A token accepted by service A is accepted by service B. Between trusted first-party services this is latent; hand the token to an agent and it is the whole problem — **whatever the agent talks to can replay that token, as the caller, anywhere in the estate.** |

Row 5 is worth separating from the other four. It is not an agent problem that agents
introduce; it is an existing property that agents promote from theoretical to load-bearing,
and it is worth fixing on its own account. It is now a dated row in that service's
`docs/architecture/DEVIATIONS.md`.

There is a sixth, specific to key material rather than to tokens: under HS256 every validator
can also **mint**. `authservice` supports both algorithms and warns at startup under HS256.
In a mesh where non-human principals validate each other's tokens, one compromised agent
forges tokens for any user with any role — so an agent capability and a symmetric signing key
are incompatible, not merely ill-advised.

## Coverage today

Checked against every guide header and P1–P15, so this proposal is not a duplicate:

- **`AZURE-AI-FOUNDRY-AGENTS.md`** — the agent's *host service* gets a managed identity and
  per-resource RBAC (§5, §7). Platform-level, Azure-scoped, and about what the service
  reaches, never about on whose behalf a tool call acts.
- **`IDENTITY-AND-ACCOUNTS.md`** — a human account end to end: registration, OAuth linking,
  lockout, consent, deletion. Its §1 rule ("authorization facts stamped into claims at
  issuance; no downstream callback") is exactly right and is what makes rows 1 and 5 above
  bite: rich claims plus one audience means a forwarded token is a general-purpose credential.
- **`SERVICE-API-PATTERNS.md` §5** — "forward the inbound bearer" is the whole treatment of
  cross-service authorization, in one bullet.
- **`SECURITY-REVIEW.md`** — has a recurring rule set on *authorization structure* and on
  browser tokens; nothing on non-human principals or delegation chains.
- **P10 (interface + registration)** covers how a new principal type would be *wired*; it
  says nothing about what one is.
- **The blueprint's non-goals** are consistent with this proposal: no service mesh, no
  sidecars, "Fly's 6PN private network plus per-service JWT is the whole network security
  model". Note what *per-service JWT* implies and the estate does not currently do — a token
  per callee. This proposal is partly a request to make that phrase true.

Nothing covers agent identity. The gap is real and it is between existing guides, not inside
one.

## Draft outline, if accepted

*This section is derivation, not extraction — see the confidence note. It is written as an
outline of a future guide rather than as rules, deliberately, because rules in this corpus
are earned.*

1. **An agent is a principal, not a user.** A distinct entity with its own credential and
   lifecycle, never an account in the human identity table. Modelling it as one drags
   password policy, lockout, email confirmation, two-factor and consent onto a machine, and
   puts machine credentials inside the subject-access export — `authservice` ADR 0004 records
   this refusal and the concrete surfaces it would pollute.
2. **A distinct principal namespace in the token**, so no downstream authorization check can
   confuse an agent for the human it acts for. A `sub` prefix plus an explicit
   `principal_type` claim; the failure mode being designed out is a role check that passes
   because a claim shape was reused.
3. **One audience per callee, and a token per hop.** The fix for row 5, and the property that
   makes a delegation chain containable at all: a token an agent hands onward must not be
   replayable against a third party.
4. **Authority narrows at every hop and never widens.** A delegated token's permissions are a
   strict subset of the delegator's, checked at issuance. This needs a scope model finer than
   role claims — `authservice` has none today, and ADR 0004 names it as the substantial piece
   of design work rather than an implementation detail.
5. **The chain is explicit and audited.** "Agent A, acting for user U" recorded in the token
   and in the audit row — an actor chain in the shape of RFC 8693's `act` claim, and audit
   columns for the agent and the on-behalf-of user. Retrofitting this after the fact does not
   work (row 3).
6. **Containment replaces revocation.** The estate's identity service is deliberately
   validated offline — consumers never call back — and introspection would invert that for
   every consumer to serve the agent case. Prefer TTLs in minutes, no refresh token for an
   agent, and a kill switch that disables the credential, accepting that an in-flight token
   outlives the kill by at most one TTL.
7. **Asymmetric signing is a precondition, not a recommendation.** Refuse to start with an
   agent capability enabled under a symmetric key.
8. **Rate limiting partitions by principal.** An agent fleet behind one address shares one
   bucket with the humans behind it, and makes far more requests than any of them.
9. **What this does not become.** No agent discovery, no capability negotiation, no policy
   engine, no dynamic client registration, and no sender-constrained tokens (DPoP, mTLS)
   until an agent crosses a trust boundary the operator does not control. The agent
   authorization standards are still moving; a small estate pinning an immature one buys an
   ongoing obligation.

## What would have to be true before this becomes a guide

Stated as a test rather than a feeling, so the promotion is a decision and not a drift:

- `authservice` has shipped ADR 0004's steps 1–3 and something in the estate authenticates
  as an agent against a real API.
- At least one delegation chain has run in production, so §4 and §5 above are describing
  observed behaviour rather than an intention.
- Row 5 (one audience for every token) is fixed, since points 3 and 6 assume it.
- The failure modes are real ones, collected from that deployment — the house guide shape
  wants a `| Symptom | Cause |` table, and inventing its rows would be the exact failure this
  corpus exists to prevent.

Until then this stays in `docs/proposals/` with no catalog entry, which is what keeps it out
of the packaged skills: an installed skill that confidently prescribes an unbuilt pattern is
worse than no skill.

## Worked example

None yet, and that is the point of the confidence note.

The **diagnostic half** cites `konradcinkusz/authservice` at the state recorded in ADR 0004:
`src/AuthService/Services/TokenService.cs` (claim enrichment, the hour-long default, the
`:2fa` audience suffix that is the nearest existing precedent for a second token class),
`src/AuthService/Program.cs` (the single `ValidAudience`),
`src/AuthService.Data/Models/AuditEvent.cs` (no non-human actor), and
`docs/architecture/DEVIATIONS.md` (row 5, dated 2026-08-25).

The **prescriptive half** has no worked example, in this estate or elsewhere in the corpus.

---

## Re-assessment — 2026-09-01

Checked against `konradcinkusz/authservice` at `6ef6cf4`, one week after this proposal was
written. **All four promotion conditions are unmet, and none is close.** The proposal stays
here, out of `docs/guides/` and out of the catalog.

| # | Condition | State |
|---|---|---|
| 1 | `authservice` has shipped ADR 0004 steps 1–3, and something authenticates as an agent against a real API | **No.** `docs/decisions/0004-agent-to-agent-authorization.md` still reads `**Status:** Proposed`, dated 2026-08-25 and unchanged. `src/` contains no delegation, token-exchange, actor-token or on-behalf-of code — the search returns nothing, so this is absent rather than partial |
| 2 | At least one delegation chain has run in production | **No**, and it cannot be otherwise while condition 1 holds: nothing is built, so nothing has run |
| 3 | Row 5 — one audience for every token — is fixed | **No.** Still exactly as this document's own coverage note describes it: a token per callee is "what *per-service JWT* implies and the estate does not currently do" |
| 4 | Failure modes collected from that deployment rather than invented | **No.** There is no deployment to collect them from, which is the condition that matters most — the house guide shape wants a `\| Symptom \| Cause \|` table, and inventing its rows is the failure this corpus exists to prevent |

**Why this is written down rather than left as a silent non-event.** A promotion test whose
result is never recorded decays into the same ambient state as an undecided proposal: nobody
can tell whether it was checked and failed, or simply never checked. The dates are the point —
proposed 2026-08-25, tested 2026-09-01, unmoved.

The conditions are unchanged; nothing here is being renegotiated because the answer came back
no. The next check-back is triggered by `authservice`, not by the calendar: when ADR 0004
leaves `Proposed` and steps 1–3 ship. Until then the diagnostic half of this document remains
accurate and useful on its own — what the estate does today, and where it stops working once a
caller is autonomous — and the prescriptive half stays a proposal, because an installed skill
that confidently prescribes an unbuilt pattern is worse than no skill.
