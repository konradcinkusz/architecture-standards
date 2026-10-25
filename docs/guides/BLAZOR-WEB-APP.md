# Blazor Web App patterns

The estate's default product surface is a Next.js app ([`FRONTEND-BFF.md`](FRONTEND-BFF.md)).
This guide is the second supported option: a **Blazor Web App with interactive server
rendering**, run as a container (P6) beside .NET services. It fixes the same property the
Next.js guide fixes — the browser talks only to its own origin — and says what that property
costs and buys in a stack where the UI is C# running on the server.

Parts of this guide are evidenced by a running application and parts are a mapping of a
Next.js rule onto Blazor. Each section says which. Where a section is a mapping, treat it as
the standard to implement and as the first thing to confirm with a real system.

**Contents**

1. [Choosing Blazor or Next.js](#1-choosing-blazor-or-nextjs)
2. [The model in one paragraph](#2-the-model-in-one-paragraph)
3. [The root components and the render mode](#3-the-root-components-and-the-render-mode)
4. [Project shape and the dependency budget](#4-project-shape-and-the-dependency-budget)
5. [Calling the backend](#5-calling-the-backend)
6. [Live updates and the component lifecycle](#6-live-updates-and-the-component-lifecycle)
7. [Sessions and authentication](#7-sessions-and-authentication)
8. [Requests from another site](#8-requests-from-another-site)
9. [Styling: tokens, scoped CSS and a contract](#9-styling-tokens-scoped-css-and-a-contract)
10. [Logic outside the markup](#10-logic-outside-the-markup)
11. [The shared web kernel](#11-the-shared-web-kernel)
12. [Static output from the same components](#12-static-output-from-the-same-components)
13. [Testing at the layer that holds the logic](#13-testing-at-the-layer-that-holds-the-logic)
14. [Hosting a stateful frontend](#14-hosting-a-stateful-frontend)
15. [Failure modes](#15-failure-modes)
16. [Checklist](#16-checklist)

---

## 1. Choosing Blazor or Next.js

Both options satisfy the same invariant: **client code never holds a token or a backend
address, and never negotiates CORS.** They differ in how.

| | Next.js ([`FRONTEND-BFF.md`](FRONTEND-BFF.md)) | Blazor Web App, interactive server (this guide) |
|---|---|---|
| Where UI code runs | Browser (React) plus a Node BFF | Server (C#); the browser holds a Blazor circuit |
| Why the browser never sees a backend | Route handlers proxy the estate | There is no browser-side HTTP to the backend at all; a typed `HttpClient` on the server calls it |
| Runtime configuration | `/api/config` route, because `NEXT_PUBLIC_*` is baked at build | Ordinary server configuration; nothing environment-specific reaches the browser |
| Toolchain | Node, pnpm workspace | .NET SDK only; no Node, no JS dependencies |
| State lives | In the browser; the server is stateless | In server memory, per circuit (§14) |
| Scale-to-zero (P7) | Natural | Costs every open page its state (§14) |
| Best fit | Public or multi-instance products, SEO, offline-tolerant UIs, an estate already on pnpm | Internal tools, dashboards, single-owner or low-concurrency tools, teams that are .NET only |

Choose Blazor when the audience is bounded, the team writes C# and not TypeScript, and the
page count is modest. Choose Next.js when the product is public-facing and horizontally
scaled, needs the browser to keep working through a server restart, or when the estate
already has a `web-kit` to join. **Blazor WebAssembly** (UI code in the browser calling the
API directly) is **not** a supported option: it puts the API address and the token in the
browser, which is the failure this whole family of guides exists to prevent. A repo on
Blazor WASM is a MODERNIZE finding with this guide as the target.

Choosing Blazor is a recorded decision in the target repo (`docs/architecture/05-DECISIONS.md`
or `docs/adr/`), with the row of the table above that decided it. It is a supported option,
not a deviation, so it needs no "revisit when the standard changes" clause.

## 2. The model in one paragraph

The browser loads HTML from the web host (`<App>.Web`), then opens one
websocket **to that host and nothing else**. Components run on the server over that circuit.
`<App>.Web` calls the backend with typed `HttpClient`s resolved through service discovery.
The browser therefore never learns a backend URL and no CORS policy exists anywhere in the
estate for this app. Everything below is a consequence — including the new costs: state in
server memory (§14), a websocket that cross-site pages can attempt to open (§8), and
callbacks that arrive off the UI thread (§6).

*Evidenced.*

## 3. The root components and the render mode

Two lines decide whether the app is interactive at all, and a test pins both:

```razor
<HeadOutlet @rendermode="InteractiveServer" />
...
<Routes @rendermode="InteractiveServer" />
```

and the host registers `AddRazorComponents().AddInteractiveServerComponents()` and
`MapRazorComponents<App>().AddInteractiveServerRenderMode()`.

- **Without the render mode on `Routes` and `HeadOutlet`, every page is static SSR.** Buttons,
  forms and live streams do nothing, no error is raised, and a component test (bUnit) cannot
  see it because bUnit renders the component, not the root. Pin it with a test that reads
  `App.razor` (§13).
- **Link the scoped-styles bundle.** Each component's `Foo.razor.css` compiles into
  `<Assembly>.styles.css`, which `App.razor` must reference with
  `@Assets["<Assembly>.styles.css"]`. Without the link every scoped rule is silently absent
  and the app renders unstyled. Pin this too.
- **Prerendering means `OnInitializedAsync` runs twice** (once for the HTML, once on the
  circuit), so a page that loads from the API on init calls it twice on first load, and an
  input made between the HTML arriving and the circuit connecting is dropped without an
  error. Accept the double call for read-only pages; for a page that starts something, make
  the start idempotent or disable prerender for that page
  (`@rendermode="new InteractiveServerRenderMode(prerender: false)"`). Browser tests wait
  for the circuit (§13) rather than sleeping.
- Use `[SupplyParameterFromQuery]` for shareable state (`/?game=<id>`) so a link reopens the
  same view.

*Evidenced* (the first two were production bugs, each now pinned by a test).

## 4. Project shape and the dependency budget

```
src/
  <App>.AppHost/          Aspire composition root (P1): the API, this web app, the database
  <App>.ServiceDefaults/  the kernel (P2); includes the origin guard (§8)
  <App>.Web/              this guide
    Program.cs            a manifest (P9): service defaults, components, typed clients, middleware
    Api/                  typed clients and their own DTO copies
    Components/
      Layout/  Shared/  Charts/  Pages/<Area>/
    wwwroot/app.css      tokens and shared classes (§9)
tests/
  <App>.Web.Tests/        bUnit + WebApplicationFactory (§13)
  <App>.E2E/              Playwright journeys, run in their own CI job
```

- **`<App>.Web` references `ServiceDefaults` and nothing else.** It does **not** reference the
  API project: the DTOs it uses are copies, and the contract is HTTP (P3). The one place a
  test project may reference both is the round-trip test that proves the copies still match
  the API's own serialization (§13).
- **Dependency budget: the ASP.NET Core shared framework only.** No component library, no
  chart library, no JS interop packages, no CSS framework, no web fonts. Charts and the board
  are Razor components emitting SVG. A UI that works offline and has no `package.json` is a
  property worth defending; every added dependency is a review finding until justified in a
  decision.
- **`Program.cs` is a manifest** (P9): extension methods per concern, not inline wiring.
- Pages are grouped by area under `Components/Pages/<Area>/`, each with its code, its scoped
  `.razor.css`, and its plain-C# helpers next to it (§10).
- **Navigation order is a product decision, pinned by a test** — a page that must come first
  (the home of the product's one question) is asserted first, so a later nav edit cannot
  reorder it silently.

*Evidenced.*

## 5. Calling the backend

- **One typed client per backend**, `AddHttpClient<TClient>(c => c.BaseAddress = new Uri("http://<service>"))`
  with `.AddServiceDiscovery()`; Aspire (or the platform's discovery) resolves `<service>`.
  The base address is a logical name, not a URL. This is the Blazor form of the Next.js
  candidate ladder (FRONTEND-BFF §5): the same code path on a laptop, under the AppHost, and
  on a platform.
- **Exactly one resilience handler.** `ServiceDefaults` already adds the standard resilience
  handler to every `HttpClient`; adding a second one multiplies attempts. A comment at the
  registration site says so, or the next contributor adds one.
- **A client reading a long-lived stream sets `Timeout = Timeout.InfiniteTimeSpan`**, and
  reads with `HttpCompletionOption.ResponseHeadersRead`. The resilience handler's timeouts end
  when the response headers arrive, so the body can then be read for as long as the server
  keeps the stream open (§6). A bounded `HttpClient.Timeout` is what would cut it.
- **DTOs are copies, plus a round-trip test.** The web project keeps its own records mirroring
  the API's contract. A test serializes the API's real types and deserializes them into the
  copies (and back) so a renamed field is a failing test, not a blank column.
- **Errors reach the page as state, not as exceptions.** Each load catches, records a message
  in a field, and renders a `role="alert"` block; the rest of the page still renders. A
  down backend must not blank the shell.
- **Degraded dependencies are read, not assumed.** The status the page keys off carries the
  gateway state (`Ready | Fake | NotAuthenticated | Unavailable`), not the health verdict —
  returning the verdict made a working login look broken. The page disables only what the
  state makes impossible and says how to fix it.

*Evidenced.*

## 6. Live updates and the component lifecycle

Interactive server rendering moves the "live" problem from the browser to the server, and
the rules move with it.

- **Consume the stream on the server.** A server-side client reads
  `text/event-stream` line by line and exposes an `IAsyncEnumerable` (or events); the page
  re-renders on each message. No SignalR hub on the API, no browser client library. Keep the
  SSE parser a pure static class (`SseReader.ReadAsync(TextReader)`) so it is tested with
  strings: comments (`: ping`), multi-line `data`, an event without data, a stream cut
  mid-event.
- **Everything that arrives off the UI thread goes through `InvokeAsync`.** A stream loop, a
  `PeriodicTimer` loop or a timer callback is not on the component's synchronization context.
  Without `await InvokeAsync(StateHasChanged)` (or applying the change inside
  `InvokeAsync(...)`) the page keeps the state it had at first render. This was a shipped bug
  on the tournament pages. Mutate state **inside** the `InvokeAsync` delegate, not before it,
  so a render cannot observe half an update.
- **Own the cancellation.** The component that starts a background loop holds a
  `CancellationTokenSource`, implements `IDisposable`, and cancels in `Dispose`. A circuit that
  disconnects disposes its components; a loop with no token keeps running against a dead
  component and leaks the stream. Starting a new followed item cancels the previous one first.
- **Never fire and forget without a catch.** `_ = FollowAsync(...)` is acceptable only when
  `FollowAsync` catches everything, reports it into state, and treats cancellation as normal.
- **Reconnect on a stream that closed early**, after a fixed delay, until the item is finished
  or the token is cancelled. Replay is the server's job: on reconnect, re-fetch the detail,
  then follow.
- **Poll with `PeriodicTimer`, not `System.Timers.Timer`**, and tie its lifetime to the same
  token. One interval constant per page, named.

*Evidenced.*

## 7. Sessions and authentication

*Mapping of [`FRONTEND-BFF.md`](FRONTEND-BFF.md) §3–§4; no worked example yet.* The reference
app is a single-owner local tool with no sign-in, so its decision record states "No
authentication; bind to loopback" and §8 is its only access control. A networked Blazor app
implements the rules below, and the first one that does should replace this note with its
evidence.

What the Next.js guide protects, and the Blazor form of it:

| Next.js rule | Blazor form |
|---|---|
| Tokens in HttpOnly cookies set by a BFF route | The user signs in through the **host** (cookie authentication on `<App>.Web`; the cookie is HttpOnly, `Secure`, `SameSite=Strict` or `Lax` as the flow requires). Backend access tokens never leave the server |
| Middleware verifies the JWT, not just decodes it | The host validates the identity provider's tokens (signature, issuer, audience) when the cookie is issued; pages carry `[Authorize]` / `AuthorizeRouteView`, and an explicit anonymous list (login, callback, legal pages) |
| `?redirect=` preserved, OAuth callback carve-outs | `ReturnUrl` preserved through the challenge; callback routes anonymous and not caught by a global redirect |
| Bearer injected server-side from the cookie | A `DelegatingHandler` on the typed client adds the bearer from a server-side store |
| Middleware is UX; the API is the boundary | `[Authorize]` in the UI is presentation. The API enforces its own authorization and quota |

Three Blazor-specific traps:

- **`HttpContext` is not available once the circuit is running.** Components must not read
  `IHttpContextAccessor`. Capture what is needed (the user, the token reference) at circuit
  start, from `AuthenticationStateProvider` or a `CircuitHandler`, and keep it in a
  per-circuit scoped service.
- **`HttpClient` message handlers live in their own DI scope, not the circuit's.** A scoped
  service injected into a `DelegatingHandler` is *not* the circuit's instance. Hand the token
  to the handler through the request (`HttpRequestMessage.Options`) from the client wrapper
  that does run in the circuit scope, or resolve it through a circuit-keyed store.
- **A circuit outlives the cookie's expiry.** The websocket does not re-authenticate on every
  call. Either end the circuit at expiry (revalidating `AuthenticationStateProvider`) or
  accept the lifetime and say so in the decision record.

Do not put a token in component fields that the framework persists to the browser
(`PersistentComponentState`, prerender state): persisted state is serialized into the page.

## 8. Requests from another site

A loopback- or network-bound app is still reachable **through the user's browser** by a page
on another site. Two cases CORS does not cover:

- A browser sends a cross-site `POST` (a simple form post) without a preflight.
- A **websocket handshake is not subject to CORS**, so a foreign page can open a Blazor
  circuit to the host.

Both are answered by one middleware in the kernel, applied by the web app **and** the API:
reject a request whose `Origin` is not in the allowed set (the app's own host and ports, plus a
configured extra list), and a request with `Sec-Fetch-Site: cross-site` — except a top-level
`GET`/`HEAD` navigation (`Sec-Fetch-Mode: navigate`, `Sec-Fetch-Dest: document`), which
changes nothing and whose response the other site cannot read. A request with **no** `Origin`
(curl, the server-side `HttpClient`, health probes, Playwright's request context) is allowed.

- It is a mitigation, not authentication: it does not stop code already on the machine or a
  non-browser client that sends neither header. Say so in the decision record.
- **CORS stays unconfigured.** The guard refuses foreign origins; it never grants any.
- Place it first in the pipeline, before antiforgery and the component endpoints, and call
  `UseAntiforgery()` for any endpoint that takes a form post.
- Pin it with three tests: a foreign `Origin` cannot negotiate a circuit
  (`POST /_blazor/negotiate`), a foreign `Origin` is refused before the websocket upgrade
  (`GET /_blazor`), and `Sec-Fetch-Site: cross-site` with no `Origin` is refused, plus the
  allowed case (a link followed from another site loads the page).
- Behind a reverse proxy the host is different: the allowed set is configuration
  (`AllowedOrigins`), and forwarded headers are configured **before** the guard.

*Evidenced* for the guard and its tests; the proxy note is a mapping.

## 9. Styling: tokens, scoped CSS and a contract

With no CSS framework and no JS, the visual design is a small, frozen contract that a test
reads from disk.

- **Plain CSS in two places:** `wwwroot/app.css` (tokens, element styles, shared classes) and
  one scoped `Foo.razor.css` per component. Scoped CSS means a page cannot restyle another.
- **Colour only through tokens.** No hex, `rgb()` or named colour outside the token blocks.
  A test scans the stylesheet and fails on a stray colour.
- **Both themes from day one.** Light is the default; dark comes from
  `@media (prefers-color-scheme: dark)` redefining the tokens and nothing else. Tokens cover
  surface, text (primary, secondary, muted), accent and its hover/contrast/soft forms, the
  three status colours with soft fills, border, shadow, radius, spacing, gutter, content
  width, font stacks (system fonts only) and the type scale.
- **Shared classes** (`.card`, `.stack`, `.cluster`, `.field`, `.btn*`, `.badge*`, `.callout*`,
  `.table-wrap`, `.num`, `.empty-state`) are named in the contract; a polish task uses those
  names or stops and asks. It does not invent one.
- **Phone width works:** no horizontal page scroll at 390 px, wide tables scroll inside a
  `.table-wrap`, 16 px gutter.
- **Accessible:** body and secondary text reach 4.5:1 in both themes; every interactive
  element shows `:focus-visible`; transitions are off under `prefers-reduced-motion`;
  charts carry a text alternative (a table).
- **Test hooks are part of the contract.** Every `data-testid`, ARIA role and accessible name
  that a test uses survives a restyle. If the design must change a hooked element, the test
  changes in the same PR and the PR body says why. A test is never deleted to make room.
- **Charts are pure SVG components**, with their own `--chart-*` tokens pinned by a
  stylesheet test; colour is never the only channel (outcome series also differ by pattern).

The contract lives in the repo (`docs/architecture/07-UI-STYLE.md` in the reference app) and a
`StyleContractTests` class checks the tokens, both theme blocks, the shared class names and
the no-stray-colour rule against `app.css` itself.

*Evidenced.*

## 10. Logic outside the markup

A `.razor` file is a view. The rules a bUnit test would otherwise have to render the whole
page to check live in plain C# next to it:

- **Models and decisions as static or sealed classes** — `PlayChoices` (which options are
  selectable, labels, defaults), `LiveGame` (state folded from stream events), `ResultsModel`,
  `TournamentFormRules`, `Significance`. They take values and return values; their tests are
  ordinary xUnit with no renderer.
- **One rule, one home.** When two pages must agree (a significance verdict on the leaderboard
  and in a head-to-head reading), the rule is one class both call, with its own tests. Two
  copies drift and one of them claims a result the data does not support.
- **Formatting is a class** (`GameFormat`, `TournamentFormat`, `PlanFormat`), so a number is
  rendered the same on every page and tested once.
- **The component's `@code` block wires** state to the model and calls the client. If it
  contains an algorithm, extract it.
- **Components take parameters and raise callbacks**; they do not inject the API client unless
  they are pages. A presentational component (`ChessBoardSvg`, `PlayerBar`, `MoveTable`) renders
  from its parameters alone, which is what lets the static export reuse it (§12).
- **Never claim more than the data shows.** A UI that prints a verdict (leader, significance,
  rating) takes a minimum-sample rule from the model class, and shows "provisional" or no
  verdict below it.

*Evidenced.*

## 11. The shared web kernel

**P2 applies to frontends.** With one Blazor app there is nothing to share and nothing to
extract: the `ServiceDefaults` kernel (telemetry, health, problem details, discovery, the
origin guard) already serves the host. With a **second** Blazor app, create one Razor class
library (`<Org>.Web.Kit`) holding the layout shell, the shared components (status strip,
charts, form primitives), the token stylesheet as a static web asset, the origin-guard and
auth wiring extension methods, and the typed-client registration helpers. Each app references
the kit and nothing else shared.

Two rules, the Blazor twins of FRONTEND-BFF §7:

- **One solution, one SDK pin (`global.json`), central package versions
  (`Directory.Packages.props`)**, all apps members of the solution and of the AppHost.
- Anything security-relevant (the origin guard, cookie and auth setup, token handling) lives in
  the kit or the kernel, so a fix lands everywhere at once.

The kernel stays free of domain code and under its size guard (P2); a kit that grows
domain types has become a shared domain.

*Mapping; the reference app has one web project.*

## 12. Static output from the same components

When a read-only copy of the app must be published without a server (a public results page
on static hosting), render it from the **same components** with Blazor's `HtmlRenderer`
instead of writing a second UI:

- A `Site/` namespace with an exporter (`ExportAsync(outputDirectory)`) that loads data
  through the same typed client and renders static components to files. The page the owner
  sees and the page the public sees can then not disagree.
- Links are **relative**, so the output works under a sub-path (`/<repo>/`).
- No script runs: interaction that must exist offline uses CSS (`:target` to select a ply).
- Interactive controls (filters, start buttons) are not rendered.
- Decide what becomes public **before** writing the exporter and write it down: everything on
  those pages, nothing else (no configuration, no secrets, no aborted-run internals).
- Bound the size: drop the heaviest detail past a configured count of newest items.
- Publishing is a separate step with its own failure handling; it uses the operator's own git
  credentials and never touches the working tree or `main`.

*Evidenced* (the export and its tests); only worth building when the audience for a read-only
copy exists.

## 13. Testing at the layer that holds the logic

P13 and [`TESTING-STRATEGY.md`](TESTING-STRATEGY.md) apply. For this stack:

| Layer | What it proves | Tool |
|---|---|---|
| Plain C# models and formatters (§10) | Decisions, labels, folds of events, significance | xUnit, no renderer |
| Parsers and clients | SSE parsing from strings; each client method against a canned `HttpMessageHandler`; the resilience wiring | xUnit + a recording fake handler |
| Components and pages | Markup, hooks, state transitions, error rendering | bUnit with the typed clients wired to a fake handler |
| Contract copies | The web DTOs still match the API's serialization | One round-trip test referencing both |
| Host | Render mode on the roots, styles bundle linked, origin guard, navigation order, routes | `WebApplicationFactory` + file-reading pins |
| Journeys | A user can start, watch and finish the one thing the product exists for | Playwright against the fake profile, own CI job |

- **Nothing needs a network or a login.** The backend gateway has a fake implementation chosen
  by configuration (`Llm=Fake`), the database has an in-memory provider; a launch profile runs
  the whole app with both. CI uses them; the real dependency is the owner's smoke script.
- **Read structural facts from disk.** `App.razor`, `app.css` and the project files are read
  by tests (`FindRepoRoot` walks up to the solution). That is how the render mode, the styles
  link, the tokens and the stray-colour rule stay pinned.
- **E2E waits for the circuit.** The page is HTML first and interactive only after the
  websocket answers `StartCircuit`; input before that is discarded without an error. A
  `CircuitWatch` helper (subscribe to the page's websocket before navigating, complete on the
  first frame after `StartCircuit` is sent) is awaited before interacting. Inputs that are safe
  to repeat may be repeated until the page shows they took effect; never sleep.
- **Locators are chosen before the first component:** `data-testid` for controls, roles and
  accessible names for headings and regions, web-first assertions for waiting
  ([`E2E-ACCEPTANCE-TESTING.md`](E2E-ACCEPTANCE-TESTING.md)).
- **The unit job must not need a browser.** It excludes the E2E project by filter; the journeys
  run only in their own job, and the fixture fails fast with the instruction to set the browser
  path rather than downloading one mid-run.
- **Journeys name what only a browser can show**; whatever bUnit can show is bUnit's.

*Evidenced.*

## 14. Hosting a stateful frontend

*Mapping to P6, P7 and the Fly guide; the reference app runs locally only and deploys nothing.*

An interactive-server app **keeps each open page in server memory** and talks to the browser
over a websocket. That changes the hosting rules the stateless Next.js container does not have:

- **One container per service (P6)**, the standard multi-stage .NET build, runtime image major
  equal to the TFM major, non-root, `ASPNETCORE_URLS=http://+:8080`. No Node stage.
- **Websockets must pass the platform's proxy** and idle timeouts must exceed the keep-alive
  interval, or circuits drop on a quiet page.
- **Scale-to-zero (P7) is not free.** A stopped or restarted machine ends every circuit and
  loses its pages' state. Set `min_machines_running = 1` and disable idle stop for the web
  app, and name the synchronous path in the `fly.toml` comment (the Fly guide's rule for
  anything a user is holding open). Deploys reconnect clients: design pages so that
  reconnecting or reloading re-reads state from the API (the live pages above do) rather than
  depending on component memory.
- **Several instances need affinity.** A circuit's websocket and its follow-up requests must
  reach the same instance. Run one instance until there is a reason not to; if scaling out,
  enable the platform's session affinity.
- **Data Protection keys and the antiforgery token** must be shared (persisted) across
  instances and across restarts, or every deploy invalidates open forms.
- **Bound the cost of a circuit.** Per-circuit memory is the capacity limit, not CPU. Cap
  disconnected-circuit retention and the maximum receive size, and do not keep large payloads
  (a game's whole engine log, a result set) in component fields longer than the page needs.
- **Behind a proxy**, configure forwarded headers before the origin guard (§8) and set the
  allowed origins from configuration; the build is promotable across environments because
  nothing environment-specific is baked into the image (P12).
- **Health is `/health` and `/alive` from the kernel.** An optional dependency being down is
  a degraded state shown in the shell's status strip, never an unhealthy app (P8).

## 15. Failure modes

| Symptom | Cause |
|---|---|
| Buttons, forms and live updates do nothing; no error | No render mode on `Routes` / `HeadOutlet`; every page is static SSR |
| Every page unstyled | `<Assembly>.styles.css` not linked in `App.razor` |
| Page keeps its first-render state while data changes | Background loop updated state without `InvokeAsync(StateHasChanged)` |
| Stream and loops keep running after the user leaves | Component did not cancel its `CancellationTokenSource` in `Dispose` |
| A 35-second stream is cut | Client `Timeout` bounded, or a second resilience handler added; use an infinite timeout and one handler |
| Retries multiply on a failing call | Two resilience handlers stacked on one client |
| API called twice on first load | Prerender plus circuit both run `OnInitializedAsync`; accept for reads, make starts idempotent |
| First click after load is ignored | Input landed before the circuit connected; E2E must await the circuit |
| Working login shows as "unavailable" | Page keyed off the health verdict instead of the gateway state |
| Blank column after an API change | DTO copy drifted; no round-trip test |
| A claim the data cannot support ("A is significantly better") | Verdict printed without a minimum-sample rule; one significance class for every page |
| Foreign page starts a paid action or opens a circuit | No origin guard; CORS does not cover a simple POST or a websocket handshake |
| Authenticated calls go out with no token | Scoped token service injected into a `DelegatingHandler`; handlers have their own scope |
| Signed-out user keeps an active circuit | Circuit not revalidated against the cookie's expiry |
| Open pages vanish after a deploy | Scale-to-zero or restart ended the circuits; keep a minimum instance and make pages re-read on reconnect |
| Forms reject after a restart or on instance 2 | Data Protection keys not shared or persisted |
| Colour regression after a restyle | Hex or named colour outside the token blocks; no stylesheet test |
| E2E passes while testing nothing | Test asserts markup the page does not produce, or never waits for the circuit |

## 16. Checklist

- [ ] The choice of Blazor over Next.js is a recorded decision citing §1; Blazor WebAssembly is not used
- [ ] `HeadOutlet` and `Routes` carry the interactive render mode and the scoped-styles bundle is linked, both pinned by tests
- [ ] The web project references only the kernel; DTOs are copies with a round-trip test; no non-framework packages beyond the budget
- [ ] `Program.cs` is a manifest; one typed client per backend, resolved by service discovery, exactly one resilience handler, infinite timeout on stream clients
- [ ] Every load catches into state and renders a `role="alert"` block; gateway state, not the health verdict, drives enablement
- [ ] Off-thread updates go through `InvokeAsync`; every background loop owns a cancellation token and is cancelled in `Dispose`
- [ ] Origin guard in the kernel on web and API, CORS unconfigured, three tests pinning it
- [ ] If the app has users: cookie auth on the host, tokens server-side only, `[Authorize]` treated as UX with the API as the boundary, circuit revalidated, no `HttpContext` reads in components
- [ ] Visual design is a frozen token contract (both themes, phone width, AA contrast, focus, reduced motion) with a stylesheet test and no stray colours
- [ ] Rules live in plain C# classes with xUnit tests; one class per rule shared across pages; no verdict printed below its minimum sample
- [ ] Tests need no network: fake gateway and in-memory database via a launch profile; the unit job excludes the browser suite
- [ ] E2E awaits the circuit, uses test ids and roles, and has CI wiring in the same commit
- [ ] If deployed: websockets pass the proxy, at least one instance stays up, affinity or a single instance, shared Data Protection keys, forwarded headers before the guard
- [ ] A second Blazor app triggers extracting `<Org>.Web.Kit` rather than copying the shell

---

Worked example: the LLM Chess Arena web app (`src/Chess.Web`: `Program.cs`, `Components/App.razor`,
`Api/ArenaApiClient.cs`, `Api/GameEventsClient.cs`, `Components/Pages/Play/`,
`Components/Pages/Shared/Significance.cs`, `wwwroot/app.css`, `Site/`;
`src/Chess.ServiceDefaults/OriginGuard.cs`; `docs/architecture/07-UI-STYLE.md`;
`tests/Chess.Web.Tests/InteractiveRenderModeTests.cs`, `OriginGuardTests.cs`,
`Components/StyleContractTests.cs`; `tests/Chess.E2E/Interaction.cs`). §7 and §14 have no worked
example yet: they map rules that the Next.js guide proves onto Blazor, and the first system
that deploys or authenticates should replace those notes with evidence.
