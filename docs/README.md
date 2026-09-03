# Project Planning Index

This directory is the implementation authority for the private browser-based property board game. The approved direction is broad mechanical completeness with independently authored expression and a mandatory legal release gate.

## Normative precedence

When documents disagree, use this order and correct the lower-level document:

1. [Product requirements](product/prd.md).
2. [Canonical rules](product/rules.md), [rule variants](product/rule-variants.md), [game content](product/game-content.md), and [glossary](product/glossary.md).
3. [Engineering architecture](engineering/architecture.md), [game engine](engineering/game-engine.md), [realtime/data](engineering/realtime-and-data.md), and [security/privacy/analytics](engineering/security-privacy-analytics.md).
4. [UX specification](design/ux-spec.md) and [design system](design/design-system.md).
5. [Test strategy](delivery/test-strategy.md), [roadmap](delivery/roadmap.md), and [operations](delivery/operations.md).

[Traceability](traceability.md) maps requirements to implementation ownership, evidence, and milestones.

## Document register

| Area | Document | Status / use |
|---|---|---|
| Product | [PRD](product/prd.md) | Normative MVP scope and release criteria |
| Product | [Mechanical completeness](product/feature-parity.md) | Internal exhaustive coverage matrix; not a public compatibility claim |
| Product | [Rules](product/rules.md) | Normative state transitions and edge cases |
| Product | [Variants](product/rule-variants.md) | Standard/short presets and exactly eight toggles |
| Product | [Game content](product/game-content.md) | Required original topology, economy, decks, constants, and provenance |
| Product | [Glossary](product/glossary.md) | Normative product and wire terminology |
| Brand | [Brand strategy](brand/brand-strategy.md) | Managed by the separate branding workstream; reconcile before design lock |
| Brand | [Naming](brand/naming.md) | Managed by the separate branding workstream; no candidate is cleared by this package |
| Legal | [IP safety](legal/ip-safety.md) | Operational guardrails and attorney release gate; not legal advice |
| Design | [UX](design/ux-spec.md) | Responsive flows and accessibility behavior |
| Design | [Design system](design/design-system.md) | Internal visual-system direction; final brand reconciliation required |
| Engineering | [Architecture](engineering/architecture.md) | Workspace, service, deployment, and ADR baseline |
| Engineering | [Game engine](engineering/game-engine.md) | Pure deterministic engine contract |
| Engineering | [Realtime and data](engineering/realtime-and-data.md) | Protocol, capabilities, persistence, reconnect, and retention |
| Engineering | [Security, privacy, analytics](engineering/security-privacy-analytics.md) | Threat model, PostHog policy, data minimization, and acceptance checks |
| Delivery | [Test strategy](delivery/test-strategy.md) | CI, scenario, browser, accessibility, soak, load, and release evidence |
| Delivery | [Roadmap](delivery/roadmap.md) | Dependency-ordered tracer bullets and bounded `gnhf` workflow |
| Delivery | [Operations](delivery/operations.md) | Coolify deployment, observability, backup, recovery, and incidents |
| Historical | [Original prompt](mvp-prd-prompt.md) | Superseded input; never implementation authority; exclude from public package unless counsel approves |

## Settled MVP decisions

- 2–6 total seats occupied by guests and/or the single non-selectable bot difficulty.
- Private invite admission with no accounts, public matchmaking, spectators, chat, or persistent profiles.
- Game-seat command capabilities are separate from invite, host, reclaim, and analytics identifiers.
- Active games expire 30 days after the last authoritative gameplay action; completed games expire 30 days after completion.
- Required disconnected humans pause play. Host-approved bot replacement and reclaim occur only at safe command boundaries.
- Standard preset, short-game preset, and exactly eight start-locked toggles.
- Server-authoritative deterministic engine with snapshots, append-only events, optimistic versions, and idempotent command IDs.
- Next.js PWA plus dedicated Fastify/Socket.IO game server, PostgreSQL/Drizzle, Tailwind/shadcn, PostHog opt-in, and Coolify.
- Redis is deferred until horizontal realtime scaling.
- Public release is blocked on approved original content, licenses, brand clearance, privacy review, and attorney sign-off.

## Pre-implementation gates

1. Merge the chosen-name branding workstream and reconcile it with UX/design terminology.
2. Select and approve code, content/asset, contributor, and trademark policies.
3. Have counsel review the complete mechanic combination and research/provenance process.
4. Author the first valid `CONTENT-001` bundle using independent balancing evidence.
5. Initialize Git, commit approved planning files, and start [MILE-003](delivery/roadmap.md#mile-003--platform-skeleton-and-deterministic-engine-seam).

## Change control

Every implementation issue cites requirement IDs and updates [traceability](traceability.md). New scope receives a new ID. Do not silently reinterpret started-game rules/content; use versioned migrations or retain the old reader until all affected games expire.
