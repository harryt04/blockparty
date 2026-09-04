# Project Planning Index

This directory is the implementation authority for the private browser-based property board game. The approved direction is broad mechanical completeness with independently authored expression and a mandatory legal release gate.

## Normative precedence

When documents disagree, use this order and correct the lower-level document:

1. [Product requirements](product/prd.md).
2. [Canonical rules](product/rules.md), [rule variants](product/rule-variants.md), [game content](product/game-content.md), and [glossary](product/glossary.md).
3. [Engineering architecture](engineering/architecture.md), [game engine](engineering/game-engine.md), [realtime/data](engineering/realtime-and-data.md), and [security/privacy/analytics](engineering/security-privacy-analytics.md).
4. [UX specification](design/ux-spec.md) and [design system](design/design-system.md).
5. [Test strategy](delivery/test-strategy.md), [build backlog](delivery/build-backlog.md), and [operations](delivery/operations.md).

[Traceability](traceability.md) maps requirements to implementation ownership, evidence, and loops.

## Document register

| Area        | Document                                                                  | Status / use                                                                                          |
| ----------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Product     | [PRD](product/prd.md)                                                     | Normative MVP scope and release criteria                                                              |
| Product     | [Mechanical completeness](product/feature-parity.md)                      | Internal exhaustive coverage matrix; not a public compatibility claim                                 |
| Product     | [Rules](product/rules.md)                                                 | Normative state transitions and edge cases                                                            |
| Product     | [Variants](product/rule-variants.md)                                      | Standard/short presets and exactly eight toggles                                                      |
| Product     | [Game content](product/game-content.md)                                   | Required original topology, economy, decks, constants, and provenance                                 |
| Product     | [Glossary](product/glossary.md)                                           | Normative product and wire terminology                                                                |
| Brand       | [Brand strategy](brand/brand-strategy.md)                                 | Settled Blockparty positioning, voice, vocabulary, and guardrails                                     |
| Brand       | [Naming](brand/naming.md)                                                 | Settled-name decision record and naming history                                                       |
| Legal       | [IP safety](legal/ip-safety.md)                                           | Operational guardrails and attorney release gate; not legal advice                                    |
| Design      | [UX](design/ux-spec.md)                                                   | Responsive flows and accessibility behavior                                                           |
| Design      | [Design system](design/design-system.md)                                  | Internal visual-system direction; final brand reconciliation required                                 |
| Engineering | [Architecture](engineering/architecture.md)                               | Workspace, service, deployment, and ADR baseline                                                      |
| Engineering | [Game engine](engineering/game-engine.md)                                 | Pure deterministic engine contract                                                                    |
| Engineering | [Realtime and data](engineering/realtime-and-data.md)                     | Protocol, capabilities, persistence, reconnect, and retention                                         |
| Engineering | [Security, privacy, analytics](engineering/security-privacy-analytics.md) | Threat model, PostHog policy, data minimization, and acceptance checks                                |
| Delivery    | [Test strategy](delivery/test-strategy.md)                                | CI, scenario, browser, accessibility, soak, load, and release evidence                                |
| Delivery    | [Accessibility checklist](delivery/accessibility-checklist.md)            | E6 automated run record and human assistive-technology release evidence                               |
| Delivery    | [Observability runbook](delivery/observability-runbook.md)                | F4 safe telemetry, alerts, and staging drill record                                                   |
| Delivery    | [Build backlog](delivery/build-backlog.md)                                | Delivery plan: closed 64-ticket queue across Loops 0–F; one ticket per session                        |
| Delivery    | [gnhf prompt](gnhf-prompt.md)                                             | The per-iteration loop prompt for autonomous agents                                                   |
| Delivery    | [gnhf CLI](gnhf-cli.md)                                                   | The exact gnhf commands, branch policy, and stop condition                                            |
| Delivery    | [Operations](delivery/operations.md)                                      | Coolify deployment, observability, backup, recovery, and incidents                                    |
| Historical  | [Original prompt](mvp-prd-prompt.md)                                      | Superseded input; never implementation authority; exclude from public package unless counsel approves |

## Implementation state

The workspace exists: one deployable `apps/web` Next.js application and the
three internal packages. Pages and Route Handlers are scaffolded and return
placeholders. `AGENTS.md` carries the runnable commands and the enforced
dependency-direction rules; the root `README.md` covers running and deploying.

The [traceability](traceability.md) register records what is scaffolded and
what each requirement still needs. A scaffold is never evidence.

## Settled MVP decisions

- 2–6 total seats occupied by guests and/or the single non-selectable bot difficulty.
- Private invite admission with no accounts, public matchmaking, spectators, chat, or persistent profiles.
- Game-seat command capabilities are separate from invite, host, reclaim, and analytics identifiers.
- Active games expire 30 days after the last authoritative gameplay action; completed games expire 30 days after completion.
- Required disconnected humans pause play. Host-approved bot replacement and reclaim occur only at safe command boundaries.
- Standard preset, short-game preset, and exactly eight start-locked toggles.
- Server-authoritative deterministic engine with snapshots, append-only events, optimistic versions, and idempotent command IDs.
- One Next.js App Router/PWA application with Route Handlers for commands and authenticated SSE for realtime delivery, MongoDB transactions/change streams, Tailwind/shadcn including the shadcn Sidebar, PostHog opt-in, and Coolify.
- The pure engine, contracts, and game-content packages remain internal build dependencies; there is one deployable application. Redis is deferred until measured horizontal coordination need.
- Public release is blocked on approved original content, licenses, brand clearance, privacy review, and attorney sign-off.

## Change control

Every implementation issue cites requirement IDs and updates [traceability](traceability.md). New scope receives a new ID. Do not silently reinterpret started-game rules/content; use versioned migrations or retain the old reader until all affected games expire.
