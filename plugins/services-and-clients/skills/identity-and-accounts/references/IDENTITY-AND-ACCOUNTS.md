<!-- Generated copy of docs/guides/IDENTITY-AND-ACCOUNTS.md — do not edit. Relative links have been rewritten to absolute repository URLs. -->

# Identity, OAuth and the account lifecycle

P5 fixes the token architecture: one service issues, everyone else validates against
its JWKS. This guide is the operational half of that principle — everything an identity
service must get right *beyond* signing tokens: refresh rotation, external OAuth
providers, enumeration safety, lockout, deletion, and legal consent.

It is deliberately repo-agnostic. The worked example is
`AureliusPromptus.AuthService` (`TokenService`, `ExternalAuthController`,
`AuthController`, the cleanup services) and `AureliusPromptus/docs/OAUTH_SETUP.md`.

**Contents**

1. [Claims are enriched at issuance](#1-claims-are-enriched-at-issuance)
2. [Refresh tokens](#2-refresh-tokens)
3. [OAuth providers](#3-oauth-providers)
4. [Account linking](#4-account-linking)
5. [Enumeration safety](#5-enumeration-safety)
6. [Lockout](#6-lockout)
7. [Transactional email](#7-transactional-email)
8. [Account deletion](#8-account-deletion)
9. [Versioned legal consent](#9-versioned-legal-consent)
10. [Failure modes](#10-failure-modes)
11. [Checklist](#11-checklist)

---

## 1. Claims are enriched at issuance

The token carries the authorization facts downstream services need — tier claim,
workspace membership, per-workspace role (`workspace:{id}:role`) — so that a service
holding a token **never calls back** to ask "may this user…". This is what makes
database-per-service (P3) viable without a chatty permission service on every request
path.

The cost is staleness until refresh: a role change takes effect at the next token. Size
the access-token lifetime accordingly, and put anything that must revoke *instantly*
(account disabled, deletion) behind a check the identity service itself owns.

## 2. Refresh tokens

- **Single-use, rotated.** A refresh token is 64+ bytes from a CSPRNG. Presenting it
  revokes it and issues a new pair — a replayed old token is a signal, not a session.
- **Stored server-side with `ExpiresAt`/`IsRevoked`** — and stored **hashed**. A
  refresh-token table in plaintext is a credentials table; treat a leak of it like a
  password-table leak. (The worked example stores plaintext; do not copy that.)
- **Global revocation is an operation, not a loop in a controller.**
  `RevokeAllForUser(userId)` exists once and is invoked from logout, password reset,
  account deletion and the permanent-deletion reaper. Any security-relevant event ends
  every session.

## 3. OAuth providers

Four rules, each learned the expensive way:

1. **The framework middleware owns the callback path.** Register the provider with the
   middleware's path (`/signin-google`, `/signin-github`), not your controller's route.
   Your controller runs *after* the middleware has exchanged the code and stashed the
   claims. Registering your own route here is the single most common OAuth failure.
2. **Providers exact-match `redirect_uri`.** The middleware builds it from
   `Request.Host` — which, inside a container, is an internal hostname the provider has
   never heard of. Configure an explicit public callback base URL
   (`OAuth:CallbackBaseUrl`) and, where a frontend proxy is involved, have it issue a
   **browser** redirect to the identity service's public URL, never a server-side
   forward to an internal name.
3. **`returnUrl` rides in OAuth state, not in the redirect URI** — the provider's
   registered redirect stays constant, and the value comes back through the middleware.
   Validate it on return against an allowlist of scheme+host+port **and** known
   callback paths: this parameter is otherwise an open redirect.
4. **Advertise only configured providers.** A discovery endpoint (`GET /providers`)
   returns the providers whose credentials are actually present — the concrete
   mechanism behind P8's "optional dependencies degrade". The UI renders buttons from
   it instead of showing dead ones.

Failures redirect back to the frontend with a machine-readable reason
(`?error=no_email | creation_failed | link_failed | locked_out | account_deleted`), so
the UI shows a specific message instead of a generic shrug. Debugging
`redirect_uri_mismatch` starts from the provider's error detail: read the exact URI it
received and compare — it is almost always the internal-hostname problem above.

## 4. Account linking

Spell out all four flows; the third is the one implementations forget:

| Flow | Behaviour |
|---|---|
| New external user | Create account, mark email confirmed (the provider verified it), no password, link the login |
| Returning external user | Look up by provider + provider key, sign in |
| **Existing password account, first external sign-in** | **Link by matching email** — do not create a duplicate account. Password login continues to work in parallel. Notify the user by email that a provider was linked |
| Username collision on creation | Suffix deterministically; never fail the sign-in over a vanity field |

## 5. Enumeration safety

- **Forgot/reset password returns the same generic 200 whether or not the account
  exists.** No email is sent for unknown addresses; provider send failures are
  swallowed and logged; validation errors return the same generic message. One test per
  branch.
- **The OAuth-only exception is a decision, not an oversight.** An account with no
  password and a linked provider gets a dead reset link with the generic flow. Returning
  "this account signs in with `<provider>`" fixes real user pain at the cost of
  confirming account existence. Either answer is defensible; pick one deliberately and
  record it.
- Login failure messages never distinguish "no such user" from "wrong password".

## 6. Lockout

Lockout after N failures in a window (the framework defaults are fine; enable them for
*new* users too) — and lockout is only shippable with an **operator escape hatch**: an
admin unlock endpoint. Without it, every lockout incident is a support ticket that ends
in a database UPDATE from a laptop.

## 7. Transactional email

- **Inventory table in the docs**: trigger → recipient → subject → owning
  service/method, for every email the system can send — including an explicit list of
  events that deliberately send *nothing*. Documenting the silences is what stops
  someone "fixing" a missing welcome email that was never meant to exist.
- **Every send attempt is a row**: attempt number, timestamp, success, error text,
  next-retry time. Resends are blocked by an **escalating cooldown** (10 min → 1 h →
  24 h) and by a "sent successfully in the last few minutes" guard. Distinct error
  messages for already-accepted, expired, and recently-sent.
- The provider is optional (P8): with no credentials, a no-op sender logs, the calling
  operation still succeeds, and the attempt row records the failure so the email can be
  retried when the provider exists.

## 8. Account deletion

- **Soft delete with a retention window.** `IsDeleted`, `DeletedAt`,
  `ScheduledPermanentDeletionAt`; login is blocked immediately; an hourly reaper
  permanently deletes past the window (query with soft-delete filters disabled — the
  reaper is the one caller that must see deleted rows); admins can list and **restore**
  within the window.
- **Destructive confirmation ritual:** the API requires the literal confirmation string
  *and* the password — password skipped for OAuth-only accounts, which have none.
- **Cascade does not reach blob storage.** Uploaded artifacts, generated files and
  anything in object storage need explicit cleanup in the reaper; database cascade
  rules quietly miss them, and "deleted" accounts keep data alive in a bucket.
- Permanent deletion revokes all refresh tokens (§2) and is the event your legal
  retention commitments are measured against.

## 9. Versioned legal consent

Terms, privacy and cookie-policy versions live in configuration. The session endpoint
(`/me`) compares the user's accepted versions and returns `requiresConsent: true` when
any required version moved — the frontend forces re-acceptance. Each acceptance writes
an **immutable row**: document, version, timestamp, IP, user agent, locale. That table
is the audit trail; nothing updates it.

Client side, cookie consent is categories with **default-deny**: no stored record means
all non-essential categories denied, and every non-essential storage write goes through
a `canUse<Category>()` predicate. Which cookies are "strictly necessary" is an
enumerated list, not a vibe. Note the cross-cutting legal fact: whether tokens live in
an HttpOnly cookie or in client storage changes the cookie disclosure — a storage
decision is a legal input, so tell counsel which one you made
([`SECURITY-REVIEW.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/SECURITY-REVIEW.md) fixes which one you may make).

## 10. Failure modes

| Symptom | Cause |
|---|---|
| Provider error `redirect_uri_mismatch` | Callback built from an internal `Request.Host`; set the public callback base URL |
| OAuth callback 404s | Provider registered with the controller's route instead of the middleware's `/signin-*` path |
| Two accounts for one person | Link-by-email flow missing; first external sign-in created a duplicate |
| Password reset reveals which emails exist | Branches return different messages/timing; unify to the generic 200 |
| Sessions survive password reset | Refresh revocation not wired to the reset path |
| Support tickets: "locked out forever" | Lockout shipped without the admin unlock endpoint |
| Invitation email storms | No attempt log/cooldown; resend button wired straight to the sender |
| "Deleted" user's files still downloadable | Blob cleanup missing from the reaper; cascade never reaches object storage |
| Users never see updated terms | Version bumped in the document but not in configuration; `/me` never flags it |
| Dead provider buttons in the UI | Frontend hardcodes providers instead of reading the discovery endpoint |

## 11. Checklist

- [ ] Authorization facts (tier, workspace roles) stamped into claims at issuance; no downstream callback
- [ ] Refresh tokens: CSPRNG, single-use rotation, stored hashed, global revocation invoked from logout/reset/deletion
- [ ] OAuth: middleware callback paths; explicit public callback base URL; `returnUrl` in state, validated against an allowlist; provider discovery endpoint
- [ ] All four account-linking flows implemented; link-by-email notifies the user
- [ ] Forgot/reset enumeration-safe with a test per branch; OAuth-only behaviour decided and recorded
- [ ] Lockout enabled, with an admin unlock endpoint
- [ ] Email inventory documented incl. deliberate silences; attempt log + escalating cooldowns; no-op provider fallback
- [ ] Soft delete + retention + reaper + admin restore; typed confirmation + password; blob cleanup explicit
- [ ] Consent versions in config; immutable acceptance audit rows; cookie consent default-deny

---

Worked example: `AureliusPromptus.AuthService` — `Services/TokenService.cs`,
`Controllers/ExternalAuthController.cs`, `Controllers/AuthController.cs`,
`Services/UserCleanupService.cs`, `Services/InvitationService.cs`,
`Services/ConsentSettings.cs` — and `AureliusPromptus/docs/OAUTH_SETUP.md`,
`AureliusPromptus/docs/EMAIL_USE_CASES.md`.
