<!-- Generated copy of docs/guides/BROWSER-EXTENSIONS.md — do not edit. Relative links have been rewritten to absolute repository URLs. -->

# Browser extensions: build, session handoff, packaging, stores

A browser extension is a fourth kind of client: it ships as a reviewed artifact through
someone else's store, runs in three isolated JavaScript worlds, and must work in two
browser families from one codebase. This guide fixes the patterns for all of that, plus
the CI packaging and distribution pipeline.

It is deliberately repo-agnostic. The worked example is
`AureliusPromptus/src/AureliusPromptus.BrowserExtension/`, its packaging steps in the
Fly workflow, `AureliusPromptus.ExtensionService`, and
`AureliusPromptus/docs/BROWSER_EXTENSION_STORE_DEPLOYMENT.md`.

**Contents**

1. [Cross-browser baseline](#1-cross-browser-baseline)
2. [Getting the web app's session into the extension](#2-session-handoff)
3. [Isolated worlds and the service worker](#3-isolated-worlds-and-the-service-worker)
4. [Per-site adapters](#4-per-site-adapters)
5. [Packaging: one source, N environments](#5-packaging-one-source-n-environments)
6. [Store submission](#6-store-submission)
7. [Distributing builds yourself](#7-distributing-builds-yourself)
8. [Mobile: there is no mobile extension](#8-mobile-there-is-no-mobile-extension)
9. [Failure modes](#9-failure-modes)
10. [Checklist](#10-checklist)

---

## 1. Cross-browser baseline

- **Top of every script**, the API shim:
  `const api = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;`
  — everything below it is browser-agnostic.
- **One manifest serves both families**: add
  `browser_specific_settings.gecko.id` + `strict_min_version` for Firefox; Chromium
  ignores the block.
- Feature deltas are handled per feature, not per fork — the codebase never branches
  into a "Firefox version". The one delta that matters most is §2.

## 2. Session handoff

The standard problem: the user signs in on the web app; the extension needs the tokens.

- **Chromium**: the web app's origin is declared in `externally_connectable`; the page
  sends tokens via `chrome.runtime.sendMessage(extensionId, …)`; the service worker
  receives them in `onMessageExternal`.
- **Firefox has no `externally_connectable`.** Fallback: a content script injected at
  `document_start` on the web app's callback page reads the tokens and forwards them
  over internal `runtime.sendMessage`.

Rules for both paths:

- **Validate before storing**: refresh token is a non-empty string, expiry is a finite
  positive number; compute and store an **absolute** expiry timestamp in
  `storage.local` — a relative `expiresIn` is meaningless after a service-worker
  restart.
- **Defense-in-depth sender allowlist** in the service worker: a static origin list,
  plus the deployed origin read from the build-time config (§5), plus an HTTPS-only
  rule — deliberately redundant with the manifest's `externally_connectable`. The
  manifest is a review-time control; the allowlist is a runtime one.

## 3. Isolated worlds and the service worker

Two facts of MV3 life, each with a standard workaround:

- **Content scripts cannot set `window` properties the page can read.** DOM attributes
  *are* shared: write results to `document.documentElement.dataset.<key>` **and**
  dispatch a `CustomEvent` — and re-fire it several times on a short interval, because
  the page's framework (React `useEffect` and friends) may register its listener after
  your first dispatch. This race hits every extension eventually.
- **The MV3 service worker sleeps.** A message that returns `undefined` (no handler
  responded) usually means the worker was not awake yet — retry a couple of times with
  a short delay before treating it as failure.

## 4. Per-site adapters

An extension that operates on third-party pages is an anti-corruption exercise (P11):

- A **hostname-keyed adapter table** — one extraction function per site — plus a
  parallel table of **ordered selector fallbacks** per site, and a list of sites that
  need scroll-to-load handling. Adding a site is a table entry; no control flow
  changes.
- Third-party DOM changes without notice. Selector fallbacks buy time; the manual
  smoke pass over the adapter list
  ([`TESTING-STRATEGY.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/TESTING-STRATEGY.md) §7) is what actually catches breakage —
  E2E against sites you don't control is cost without signal.

## 5. Packaging: one source, N environments

The extension is the one client where runtime configuration is impossible — the
artifact is sealed at review time. So the environment is injected **at package time**:

- CI writes a `config.json` (deployed service URLs, web-app origin) into the extension
  directory; local dev uses a committed `config.local.json`.
- CI patches `manifest.json` with `jq`: inject environment hosts into
  `host_permissions` / `externally_connectable` / `content_scripts`, and set `version`
  from the git tag. One source tree, a distinct reviewed artifact per environment.
- **The gotcha: patching adds, it does not remove.** The dev entries
  (`localhost:<port>`) survive into the production zip unless explicitly deleted —
  `jq 'del(.host_permissions[] | select(test("localhost")))'` before zipping. Decide
  deliberately whether to fix proactively or on reviewer pushback (many extensions
  ship localhost entries and pass review); either way, record the decision — this is a
  cost-vs-probability call, not an oversight.
- Zip and upload the artifact to private storage, named by version (§7 consumes this).

## 6. Store submission

The mechanics that surprise, per store:

**Chrome Web Store** — one-time developer fee; asset dimensions are exact (128×128
icon, 440×280 tile, ≥1280×800 screenshots, max 5); the short description is hard-capped
(132 chars); **a privacy policy is mandatory once the extension has the `storage`
permission or touches user data**, and it must specifically cover what the extension
collects, what stays in `chrome.storage.local`, and what is transmitted to your
servers. Broad permissions (`tabs`, `scripting`, wide host patterns) invite reviewer
questions — write the justification before submission, not in the appeal. First review
takes days; updates are usually hours; propagation to installed users adds more hours.

**Firefox AMO** — accepts the same artifact given the `gecko` block (§1); requests
source for minified bundles, so keep a reproducible build; the choice between
AMO-hosted and **self-hosted signed `.xpi`** is real — self-hosting skips the catalogue
but fits products distributed only through their own portal.

**The post-approval loop that always gets forgotten:** the store assigns the extension
its permanent id → set the store-URL variable so the web app can render an install
button → **add the extension id to the backend CORS allowlist** (`chrome-extension://<id>`).
Until the last step, the published extension's API calls fail — after passing review.

Automate publication from CI (`chrome-webstore-upload-cli` or equivalent) with the
OAuth refresh-token secret set; manual store uploads are the deploy-from-a-laptop
anti-pattern (P12) with a review queue attached.

## 7. Distributing builds yourself

For portal downloads, PR builds and pre-store distribution, serve versioned artifacts
from a small endpoint over private object storage:

- Blobs named `v{major}.{minor}.{patch}[-label].zip`, semver-parsed; highest version
  wins, upload time as tiebreak.
- **Release channel resolved by a ladder**: explicit config → environment type →
  dev-mode default. An **artifact label** (e.g. `pr-123`) pins an ephemeral environment
  to its own build ([`PR-PREVIEW-ENVIRONMENTS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/PR-PREVIEW-ENVIRONMENTS.md)).
- Echo the served blob name in a response header — when someone reports a bug, "which
  build do you actually have" is one curl.
- With no storage configured, return a valid **empty zip** rather than a 500 (P8):
  local dev of the portal must not require artifact storage.

## 8. Mobile: there is no mobile extension

Mobile browsers effectively do not run extensions, and native AI apps are separate OS
processes — **DOM injection has no mobile equivalent**. The platform analogy that
frames every feasibility discussion: `browser : extension :: OS : app + share sheet`.
The mobile counterparts are the share sheet / intent system, keyboard extensions, and
a PWA of the web app.

Evaluate options as a written feasibility study (verdict first, the fundamental
constraint named, each option scored on time-to-MVP / coverage / stack fit / CI fit /
maintenance, phased recommendation). On low-code app builders specifically, the
criteria that generalize: they cannot produce OS extension points without dropping to
native (cancelling their benefit), their exported code is legacy the day it is
exported, and they bring their own CI/CD that will not integrate with yours — plus an
honest "when it *does* make sense" list to keep the assessment credible.

## 9. Failure modes

| Symptom | Cause |
|---|---|
| Session handoff works in Chrome, silently fails in Firefox | No content-script fallback; Firefox lacks `externally_connectable` |
| Token expiry nonsense after idle | Stored relative `expiresIn` instead of an absolute timestamp |
| Page never sees the extension's result | Isolated-world write to `window`; use DOM dataset + re-fired CustomEvent |
| First message after idle returns `undefined` | Service worker asleep; retry with delay |
| Extension works for the dev, not for users | Production zip carries dev config, or store build points at localhost hosts |
| Reviewer rejects over permissions | Localhost entries left in `host_permissions`, or broad permissions without written justification |
| Published extension's API calls fail | Extension id never added to backend CORS allowlist |
| One site's integration silently breaks | Third-party DOM changed; no selector fallback, no manual smoke pass |
| "Which version are you on?" unanswerable | No version echo header on the distribution endpoint |

## 10. Checklist

- [ ] API shim at the top of every script; one manifest with the `gecko` block
- [ ] Both handoff paths (external message + content-script fallback); payload validated; absolute expiry in `storage.local`
- [ ] Runtime sender-origin allowlist redundant with the manifest
- [ ] Isolated-world signaling via DOM dataset + re-fired CustomEvent; service-worker wake-up retry
- [ ] Site integrations as adapter tables with ordered selector fallbacks
- [ ] CI writes config + patches manifest (hosts, version from tag); localhost-permission removal decided and recorded
- [ ] Store assets/policy prepared to spec; privacy policy covers extension data; permissions justified in writing
- [ ] Post-approval loop: extension id → store URL variable → backend CORS allowlist
- [ ] Publication automated from CI
- [ ] Self-distribution: semver blobs, channel ladder, PR-label pinning, version echo header, empty-zip degradation
- [ ] Mobile requests answered with a feasibility study, not a mobile extension

---

Worked example: `AureliusPromptus/src/AureliusPromptus.BrowserExtension/`
(`background.js`, `oauth-content.js`, `content.js`), the packaging steps in
`AureliusPromptus/.github/workflows/flyio.yml`, `AureliusPromptus.ExtensionService`
(versioned distribution), and
`AureliusPromptus/docs/BROWSER_EXTENSION_STORE_DEPLOYMENT.md` +
`docs/MOBILE_EXTENSION_FEASIBILITY_STUDY.md`.
