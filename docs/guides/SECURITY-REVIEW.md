# Security review: the method and the recurring rules

P5 covers secrets and signing. This guide covers the rest of security as it is actually
practiced in the estate: a repeatable review method that produces comparable artifacts,
and the concrete rule sets that every review keeps rediscovering. The method matters as
much as the rules — an audit whose output format changes each time cannot show whether
the system is getting safer.

It is deliberately repo-agnostic. Worked examples:
`<saas>/docs/SECURITY_AUDIT_REPORT.md`,
`docs/SECURITY_AUDIT_OWASP_SUPPLEMENT.md`, `docs/SECURITY_FIXES*.md`,
`docs/PRODUCTION_READINESS.md`.

**Contents**

1. [The review method](#1-the-review-method)
2. [The finding format](#2-the-finding-format)
3. [Prioritization and the readiness ledger](#3-prioritization-and-the-readiness-ledger)
4. [Rule set: tokens in browsers](#4-rule-set-tokens-in-browsers)
5. [Rule set: random values](#5-rule-set-random-values)
6. [Rule set: user-supplied paths and names](#6-rule-set-user-supplied-paths-and-names)
7. [Rule set: output, errors and rendering](#7-rule-set-output-errors-and-rendering)
8. [Rule set: authorization structure](#8-rule-set-authorization-structure)
9. [Recurring launch blockers](#9-recurring-launch-blockers)
10. [Checklist](#10-checklist)

---

## 1. The review method

Work through a fixed category list (the OWASP set is the right skeleton) with three
possible outcomes per category — and **"not applicable" is a first-class result that
must be justified**, with the evidence shown:

- *Applicable, reviewed, finding* → §2 format.
- *Applicable, reviewed, clean* → say so explicitly. A **"positive findings" section**
  keeps the audit honest and stops the next reviewer re-checking what is already
  solid.
- *Not applicable, because* → name the structural reason (no XML parsing → XXE N/A; no
  NoSQL store → NoSQL injection N/A) **and paste the grep that proves it**. An
  unjustified N/A is an unreviewed category.

Two refinements that pay for themselves:

- **Keep preventive guidance for stacks you don't use yet** next to the N/A (the
  hardened XML reader settings, "if XML is ever added"). The N/A is true today; the
  guidance is for the PR that makes it false.
- **Close with the caveat**: a code review is static analysis; it does not replace a
  penetration test. Write that sentence so nobody files the audit as one.

Reviews are point-in-time; the scanner (P5) and CodeQL/dependency scanning
([`REPO-BASELINE.md`](REPO-BASELINE.md)) are the continuous complement, not an
alternative.

## 2. The finding format

Every finding, same fields, so findings are comparable across audits and repos:

```
Location        file:line
Issue           one sentence
Current code    the offending excerpt
Risk            Critical / High / Medium / Low
Attack scenario concrete: who does what, with which request
Impact          what is lost when the scenario runs
Recommendation  the minimal fix
Better          the structural fix, if different
```

The **attack scenario is the load-bearing field**. A finding that cannot state one is
a style comment and gets reclassified as such.

## 3. Prioritization and the readiness ledger

- Findings get **time windows, not just ranks**: P1 immediately, P2 within a week, P3
  within two weeks, P4 long-term. An undated backlog is where P3s go to die.
- Track remediation in a **status ledger**: legend `OPEN / FIXED / NOT APPLICABLE`,
  each row carrying priority, `file:line` evidence, the problem, a **context column**
  ("what already exists in code that makes this fix cheap"), and the action. Summarize
  as two tables: *blocks deployment* vs *should be done before deployment*.
- Keep an explicit **residual-risk section**: what was deliberately not fixed and why
  it is acceptable for this launch (e.g. no MFA yet, framework CSRF posture). An
  acknowledged residual is a decision; an unlisted one is a future incident review
  finding, in both senses.

## 4. Rule set: tokens in browsers

- Never `localStorage`/`sessionStorage` for tokens — any XSS exfiltrates them.
- HttpOnly cookies **cannot be set from `document.cookie`**; a server route sets them
  (`httpOnly`, `secure`, `sameSite` — see [`FRONTEND-BFF.md`](FRONTEND-BFF.md) §3).
- Anything gating access **verifies the signature** (issuer, audience), never just
  decodes and checks `exp` — the decode-only middleware accepting forged tokens is a
  real recorded finding, not a hypothetical.
- The standard header set ships on every frontend: `Content-Security-Policy`,
  `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`.

## 5. Rule set: random values

**A GUID is not a secret.** `Guid.NewGuid()` is acceptable for identifiers (JTI, row
ids) and nothing else. Anything an attacker could present as proof — invitation
tokens, reset tokens, share tokens, API keys — is ≥256 bits from a CSPRNG
(`RandomNumberGenerator`), URL-safe base64. And record what "we use the framework
default" for password hashing actually is (algorithm, iterations, salt), so the audit
can compare it to current guidance instead of trusting the word "default".

## 6. Rule set: user-supplied paths and names

The portable validation spec for any user-supplied path/name (virtual folders,
file names, slugs):

whitelist charset per segment · maximum depth · no `..` · no absolute paths or drive
letters · forward slashes only · no empty segments · no Windows reserved names
(`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`LPT9`) · length cap per segment · no
leading/trailing spaces or dots.

Ship it with valid/invalid example pairs and expected error strings, and mirror it
client-side for UX with the server authoritative
([`SERVICE-API-PATTERNS.md`](SERVICE-API-PATTERNS.md) §3). The principles behind it:
**whitelist over blacklist**, and **error messages never leak internals** (no paths,
no stack frames, no "table X has no column Y").

## 7. Rule set: output, errors and rendering

- **Encode at render, not at storage.** HTML-encoding on write corrupts the data for
  every non-HTML consumer and still double-encodes on the way out. Store what the
  user typed; the renderer owns escaping.
- User-supplied markdown goes through a sanitizer (`rehype-sanitize` or equivalent) —
  markdown is an XSS vector even inside React.
- Swagger/OpenAPI UI is **off in production**: it is information disclosure — the
  route map, DTO shapes and validation rules, gift-wrapped. (The worked example shows
  how the expedient fix becomes the audit finding: Swagger enabled "for deployment
  debugging" in one doc is filed as a finding by the next review.)

## 8. Rule set: authorization structure

- **Deny by default, audited mechanically**: authorization required globally or at
  the group level; `[AllowAnonymous]` is the exception list, short enough to read
  aloud (register, login, health, webhooks — each webhook with its own signature
  check).
- Produce an **endpoint × role matrix** as an audit artifact. It finds the endpoint
  everyone believed was admin-only.
- **Authorization by email-string comparison is an anti-pattern**: it means no second
  admin and no revocation without a redeploy. Roles/claims, always.
- **Ownership checks at the resource**: users mutate only what they own; membership
  validated against the workspace on every cross-tenant operation. "Published content
  is public" is a data classification decision to write down — along with what is
  *never* exposed (emails behind display names).
- CORS: named explicit origins. **Wildcarding a PaaS apex (`*.fly.dev`,
  `*.azurecontainerapps.io`) combined with credentials trusts every tenant of the
  platform** — a recorded finding, easy to write, hard to spot.

## 9. Recurring launch blockers

The same four items block every first production deploy; check them before the audit
does:

1. Production CORS origins never configured — only `localhost:3000` was ever set.
2. Email confirmation disabled "temporarily, for simplicity" and never re-enabled.
3. Rate limiting present in *most* services — partial coverage is the normal failure
   mode, and the unprotected one is the target.
4. Token storage inconsistent between two frontends of the same product (one on
   cookies, one on localStorage).

## 10. Checklist

- [ ] Category list worked through; every N/A justified with evidence; positive findings recorded; pentest caveat stated
- [ ] Findings in the standard format, each with an attack scenario
- [ ] Time-windowed priorities; status ledger with context column; blocks-deploy vs before-deploy split; residual risks listed
- [ ] No tokens in web storage; cookies set server-side; signature verification at every gate; header set present
- [ ] CSPRNG for anything presentable as proof; password-hash parameters recorded
- [ ] Path/name validation spec applied server-side, mirrored client-side
- [ ] Encode at render; markdown sanitized; Swagger off in production
- [ ] Deny-by-default with a short `[AllowAnonymous]` list; endpoint × role matrix produced; no identity-by-email; CORS origins explicit
- [ ] The four recurring launch blockers checked explicitly

---

Worked examples: `<saas>/docs/SECURITY_AUDIT_OWASP_SUPPLEMENT.md` (method,
justified N/A, matrices), `docs/SECURITY_AUDIT_REPORT.md` (finding format, priorities),
`docs/SECURITY_FIXES.md` (path validation spec), `docs/SECURITY_FIXES_IMPLEMENTED.md`
(ledger + residual risk), `docs/PRODUCTION_READINESS.md` (readiness ledger, the
recurring blockers).
