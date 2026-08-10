# architecture-standards

Canonical architecture reference for the estate (copilot-scope, AureliusPromptus,
FSE.CORE, and future repos).

- [`docs/architecture/00-REFERENCE-ARCHITECTURE.md`](docs/architecture/00-REFERENCE-ARCHITECTURE.md)
  — the 15-principle blueprint, each principle backed by a working example, plus a
  compliance checklist. This is the constitution: read it, don't re-derive it.
- [`docs/PLAYBOOK.md`](docs/PLAYBOOK.md) — how to start a Claude Code session against
  any repo to either review it against this architecture or modernize it toward it,
  including the ready-to-use session prompt template and which repos to attach.

## Origin

The blueprint was extracted from two systems that already follow it — `copilot-scope`
and `AureliusPromptus` — and was originally kept inside `FSE.CORE/docs/architecture/`
while that repo was being modernized against it. It moved here so it has one stable,
neutral home instead of living inside the repo it was also being used to judge.
