# Frontend and BFF patterns

The estate's frontends are Next.js apps deployed as containers (P6) that talk to .NET
services. This guide fixes the patterns between browser and backend: where tokens
live, how one image serves every environment, and how the server side of the frontend
proxies the estate. The blueprint's ServiceDefaults rule (P2) has a frontend
counterpart, stated at the end, and its absence is the most expensive finding in the
worked example.

**Contents**

1. [The model in one paragraph](#1-the-model-in-one-paragraph)
2. [Runtime configuration](#2-runtime-configuration)
3. [Sessions: HttpOnly cookies over a token API](#3-sessions-httponly-cookies-over-a-token-api)
4. [Edge middleware verifies, not just decodes](#4-edge-middleware-verifies-not-just-decodes)
5. [The catch-all proxy and the candidate ladder](#5-the-catch-all-proxy-and-the-candidate-ladder)
6. [Entitlement UX](#6-entitlement-ux)
7. [The shared web kernel](#7-the-shared-web-kernel)
8. [Failure modes](#8-failure-modes)
9. [Checklist](#9-checklist)

---

## 1. The model in one paragraph

The browser talks **only to the frontend's own origin**. The frontend's server side
(route handlers — the BFF) holds the token in an HttpOnly cookie, injects it as a
bearer header, and proxies to the backend services. Client JavaScript never sees a
token, never learns a backend URL, and never negotiates CORS with anything. Everything
below is a consequence.

## 2. Runtime configuration

`NEXT_PUBLIC_*` variables are **baked at build time** — using them for API addresses
means one image per environment, which breaks build-once-deploy-many (P12, Fly guide
§5). Instead:

- A server route `GET /api/config` (marked dynamic, never statically optimized) reads
  the environment at request time and returns the client-safe config, with a short
  `Cache-Control` + `stale-while-revalidate`.
- The client fetches it once through a small module that caches the promise (in-flight
  dedupe) and has an SSR-safe fallback.

One image, N environments, addresses supplied where the container starts. This is the
Next.js twin of the nginx `config.json`-at-entrypoint pattern in the Fly guide.

## 3. Sessions: HttpOnly cookies over a token API

The backend speaks bearer tokens; the browser must not store them. The bridge:

- After login/OAuth callback, the client POSTs the tokens to its **own** BFF route,
  which sets them as cookies: `httpOnly`, `secure` outside dev, `sameSite: strict`.
  (`document.cookie` cannot set HttpOnly — a server route is the only way.)
- A `GET /api/auth/session` route rehydrates the client's session state on page load,
  because client JS cannot read the cookie back — by design.
- Logout **deletes with the same attributes** the cookie was set with; a delete with
  mismatched path/sameSite silently leaves the cookie alive.
- The cookie-vs-localStorage choice is also a legal input (cookie disclosure) — see
  [`IDENTITY-AND-ACCOUNTS.md`](IDENTITY-AND-ACCOUNTS.md) §9.

## 4. Edge middleware verifies, not just decodes

The recorded failure: middleware that only *decoded* the JWT to check `exp` accepted
forged tokens — any base64 payload with a future expiry passed. The middleware must
**verify the signature** (e.g. `jose.jwtVerify`) with issuer and audience, against the
JWKS/key the estate's identity service publishes (P5).

The rest of the gate: cheap `exp` decode first as a fast path, full verify after;
invalid/expired → clear both cookies and redirect to login with `?redirect=<intended>`
preserved; an explicit public-route list; and carve-outs so OAuth callbacks and legal
pages keep their query strings instead of being bounced through the login redirect.

Middleware protects *pages*. The APIs behind the proxy still enforce their own
authorization — the middleware is UX, the services are the boundary.

## 5. The catch-all proxy and the candidate ladder

One catch-all BFF route (`/api/proxy/[...path]`) fronts the whole estate:

- **Path prefix → backend** routing table (`/api/agentic/*` → agentic service, … →
  default), so the client has exactly one base URL.
- **Each backend resolves through an ordered candidate ladder**: explicit env var →
  orchestrator service-discovery variables (`services__<name>__https__0`) → internal
  DNS name → localhost. Try candidates in order; treat a 403 as "wrong ingress, try
  the next candidate", return 503 only when all fail. The ladder is what makes *one
  code path* work on a laptop, under Aspire, and on every cloud platform, with zero
  per-environment code.
- The bearer token is injected **server-side from the cookie**; pass through the
  status, body and relevant headers.
- Large binaries (downloads) are **streamed**, not buffered, with an `AbortController`
  timeout mapped to 504 — generous enough to cover a scale-to-zero cold start (P7),
  and `Content-Disposition`/`Content-Length` passed through.

## 6. Entitlement UX

The client-side gate (`requirePaidTier(feature)` hooks, usage meters with
green/yellow/red thresholds) is **optimistically permissive while loading** — a paying
user must never see a flash of "upgrade". It is presentation. The API policy and quota
authority remain the enforcement boundary
([`PAYMENTS-AND-MONETIZATION.md`](PAYMENTS-AND-MONETIZATION.md) §7); write the hook's
doc comment saying so, or a refactor will promote it.

## 7. The shared web kernel

**P2 applies to frontends.** With several Next.js apps, the BFF routes (§2, §3, §5),
auth/session context, consent module, theme toggle and UI primitives are the same code
in every app. They belong in one workspace package (`@<org>/web-kit`) consumed by all
of them — the frontend ServiceDefaults.

The worked example demonstrates the failure: four apps, only two in the pnpm
workspace, the other two on standalone npm with their own lockfiles, each carrying
hand-copied `api/config`, `api/auth/*`, cookie banner and providers. The result is
three different CI setup blocks and four slowly diverging copies of security-relevant
code. Two rules:

- **One package manager, one workspace, all apps members.** A mixed npm/pnpm monorepo
  is an anti-pattern with no upside.
- Anything security-relevant (cookie handling, middleware verification, consent) lives
  in the kit, so a fix lands everywhere at once.

## 8. Failure modes

| Symptom | Cause |
|---|---|
| Staging frontend calls production APIs | Addresses baked via `NEXT_PUBLIC_*` at build; move to the runtime config route |
| Token visible in devtools/localStorage | Client stored the token instead of handing it to the BFF cookie route |
| Login loop after logout | Cookie deleted with different attributes than it was set with |
| Forged token accepted at the edge | Middleware decoded instead of verified; use `jwtVerify` with issuer/audience |
| OAuth callback loses its parameters | Middleware redirect lacks the callback carve-out |
| Proxy 403s only in one environment | Candidate ladder missing that environment's rung (discovery vars vs internal DNS) |
| Downloads fail after idle periods | Proxy timeout shorter than the callee's cold start; or response buffered instead of streamed |
| Paying user sees an upgrade flash | Entitlement hook pessimistic while loading; must be optimistic |
| Same bug fixed in one app, alive in three | No shared web kit; BFF code hand-copied per app |

## 9. Checklist

- [ ] Client JS never holds a token or a backend URL; browser talks only to its own origin
- [ ] Runtime `/api/config` route; no `NEXT_PUBLIC_*` for anything environment-specific; image promotable across environments
- [ ] Tokens in HttpOnly/secure/sameSite cookies set and cleared (same attributes) by BFF routes; session rehydrate route
- [ ] Middleware verifies signature + issuer + audience; public-route list; `?redirect=` preserved; callback carve-outs
- [ ] Catch-all proxy: prefix routing, candidate ladder, server-side bearer injection, streamed binaries with cold-start-sized timeout
- [ ] Entitlement UI optimistic while loading and documented as non-enforcement
- [ ] All apps in one workspace under one package manager; shared web-kit package owns BFF routes, auth context, consent, primitives

---

Worked example: `<saas>.Web.Portal` (`app/api/config/`, `app/api/auth/*`,
`middleware.ts`, `hooks/use-premium-guard.ts`, `app/api/extension/download/`) and
`<saas>.Web.AdminDashboard/app/api/proxy/[...path]/route.ts` (the candidate
ladder). The missing web-kit package is the anti-example: see the four apps' duplicated
`api/config` and cookie-banner components.
