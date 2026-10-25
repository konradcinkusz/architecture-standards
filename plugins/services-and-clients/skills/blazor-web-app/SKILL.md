---
name: blazor-web-app
description: >-
  Use when building a Blazor Web App frontend (interactive server rendering)
  as the product surface instead of Next.js, or when choosing between the two.
  Why the circuit is the BFF, the root components and render mode, the
  dependency budget, typed clients with service discovery and one resilience
  handler, SSE consumed server-side, InvokeAsync and disposal, cookie auth
  mapped onto Blazor, the origin guard for websockets and cross-site posts, a
  frozen CSS token contract, logic kept out of markup, static export with
  HtmlRenderer, bUnit/Playwright testing with the circuit handshake, and
  hosting a stateful frontend.
---

# Blazor Web App patterns

**Read [`references/BLAZOR-WEB-APP.md`](references/BLAZOR-WEB-APP.md) before applying any of this.**
That file is the standard; everything below it is a summary to help you decide
whether this skill applies and to check your work afterwards.

Reference-architecture principles: P2, P6.

## What this standard covers

- Choosing Blazor or Next.js
- The model in one paragraph
- The root components and the render mode
- Project shape and the dependency budget
- Calling the backend
- Live updates and the component lifecycle
- Sessions and authentication
- Requests from another site
- Styling: tokens, scoped CSS and a contract
- Logic outside the markup
- The shared web kernel
- Static output from the same components
- Testing at the layer that holds the logic
- Hosting a stateful frontend

## Failure modes

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

## Checklist

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

Generated from [`docs/guides/BLAZOR-WEB-APP.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/BLAZOR-WEB-APP.md) by `scripts/build-marketplace.mjs`. Do not edit this file: change the source document, or its entry in `catalog/marketplace.catalog.json`, and re-run the generator.
