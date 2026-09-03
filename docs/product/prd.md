# Product Requirements Document: private property-board game MVP

**Status:** implementation-ready MVP scope  
**Audience:** people aged 13+ who want a private, browser-based economic property board game with friends or bots.  
**Product terms:** [Glossary](glossary.md) is normative for product and wire vocabulary. [Rules](rules.md), [game content](game-content.md), and [rule variants](rule-variants.md) define gameplay. These terms are provisional and are not a public brand.

## Product statement

Deliver a free, open-source, mobile-first PWA for private 2–6 seat economic property board games. A host creates a game and shares an unguessable invite link. Seats may be occupied by guests or by one explainable bot difficulty. The game targets internal **mechanical completeness** across familiar property-board mechanic categories while using independently authored board content, card text, art, terminology, UI, and numerical data; it must not copy a particular commercial game's protected expression.

This document is a product specification, not legal advice. Renaming alone does not establish non-infringement. Before release, obtain qualified legal review of the complete combination of mechanics, board topology, values, names, visual trade dress, card themes, marketing, and the independent-authorship/provenance record. Research references are collected in [Mechanical completeness](feature-parity.md#research-and-expression-boundary).

## Personas and jobs

| Persona               | Job to be done                                                                                                | MVP outcome                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Casual host           | “When friends are together remotely, let me start a familiar strategy game without asking anyone to sign up.” | Creates a private room, configures seats and allowed variants, and shares one link.                 |
| Guest player          | “Let me join quickly from my phone and understand what I can do now.”                                         | Opens link, picks an available seat/name, gets an actionable turn UI and rules help.                |
| Returning participant | “Let me resume our unfinished game without reconstructing it.”                                                | Reopens the same invite link within 30 days and sees authoritative current state.                   |
| Solo learner          | “Let me learn the game at a reasonable pace with opponents whose actions make sense.”                         | Starts a game with the single explainable bot and sees each bot action's short rationale.           |
| Implementer/operator  | “Let me self-host a maintainable game without a managed proprietary runtime.”                                 | Deploys the documented Next.js service on Coolify and can observe privacy-conscious product events. |

## Goals

1. Complete an authoritative, resumable, private 2–6 seat game under the canonical rules in [Rules](rules.md).
2. Make all legal actions discoverable and usable with touch, keyboard, and screen readers.
3. Make turns, money changes, dice results, and bot choices understandable from an event history.
4. Offer a deliberately bounded MVP: one bot difficulty, private links, and no identity system.
5. Provide a configurable rules engine with the presets/toggles in [Rule variants](rule-variants.md), locked after play begins.

## Non-goals

- Public matchmaking, game discovery, spectators, player-to-player chat, direct messages, or social feeds.
- Accounts, login, persistent player profiles, rankings, achievements, cloud-wide friend lists, or cross-game identity.
- Native iOS/Android apps; installable PWA is the mobile deliverable.
- More than one bot difficulty or opaque/learning bot behavior.
- Reproducing a named commercial game's board, marks, wording, illustration style, card data, price/rent schedule, or visual trade dress.
- Automated legal clearance or a claim that this implementation is legally safe in every jurisdiction.

## Functional requirements

### Entry, lobby, and seats

| ID          | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD-FUN-001 | A visitor can create a private game without an account. The service creates a high-entropy, non-sequential invite URL and a host capability stored separately from the public invite capability.                                                                                                                                                                                                                                 |
| PRD-FUN-002 | A new game supports 2–6 total seats, each configured as an open guest seat or bot seat. The lobby prevents starting unless all seats are occupied by a guest or bot.                                                                                                                                                                                                                                                             |
| PRD-FUN-003 | A guest with the invite URL can claim one open guest seat by entering a game-scoped pseudonym; no real name, credential, or profile is created. Names are 1–24 Unicode grapheme clusters after trim/collapse-whitespace normalization, unique among active seats by normalized case-insensitive comparison, escaped on every render, and reject control characters, bidi override characters, and a small configurable denylist. |
| PRD-FUN-004 | The host can add/remove bot seats, open a claimed seat after confirming removal, select a rules preset/toggles, and start only while in the lobby.                                                                                                                                                                                                                                                                               |
| PRD-FUN-005 | The lobby shows the board/rule-set version, selected variants, seat occupancy, and a concise privacy notice that anyone with the link may join until the game starts.                                                                                                                                                                                                                                                            |

### Authoritative play

| ID          | Requirement                                                                                                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD-FUN-006 | The server is authoritative for random draws, dice, rules validation, money, ownership, turn order, ordered effect resolution, and event ordering. Clients submit intended actions and render resulting state/events. The canonical MVP has no purchase, turn, auction, or trade timers/timeouts. |
| PRD-FUN-007 | The engine implements the canonical state machine and legal actions in [Rules](rules.md), including purchase decisions, auctions, improvements, mortgages, trades, cards, Detention, debt, and bankruptcy.                                                                                        |
| PRD-FUN-008 | Every resolved action produces an append-only, ordered game event with actor, public outcome, amount/asset references where applicable, and enough data to reconstruct the visible game history.                                                                                                  |
| PRD-FUN-009 | The authoritative action-state response exposes `legalActions` (the executable actions for the requesting seat) and `actionAvailability` (known actions that are blocked, each with an accessible plain-language reason). The UI uses both without treating a client-side check as authority.     |
| PRD-FUN-010 | A player can view every deed, district, player summary, bank-controlled asset, current turn state, recent event history, and active rule variants during play.                                                                                                                                    |

### Bots, reconnect, and lifecycle

| ID          | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD-FUN-011 | The MVP supplies exactly one bot difficulty. Its policy is deterministic given game state and recorded random choices, uses only public game state, and emits a short explanation for each non-trivial decision.                                                                                                                                                                                                                                                                                                                                                  |
| PRD-FUN-012 | A seat token is an opaque, game-seat-scoped command credential held on the device; the invite alone never displaces a seat. After explicit host confirmation at a safe command boundary, the host may replace a disconnected human with a bot: revoke the old command credential but retain a separate reclaim claim. The returning person requests reclaim; the host approves; at the next safe command boundary the bot is removed, control transfers, and a new seat token is issued. Each request, approval, replacement, revocation, and transfer is logged. |
| PRD-FUN-013 | Authoritative game data and all invite/seat/host capabilities expire 30 days after the last authoritative game action. A completed game instead expires 30 days after completion. An active game that reaches retention expiry first transitions authoritatively to `EXPIRED`, records that event, then is deleted with its capabilities; completed games remain read-only until deletion. The exact policy is shown before creation.                                                                                                                             |
| PRD-FUN-014 | A required disconnected human pauses the game; there is no automatic timer action. A disconnected required auction actor pauses that auction. The host may use the explicit bot-replacement flow in PRD-FUN-012 only at a safe command boundary. If the host disconnects, transfer host authority at the next safe boundary to the longest-tenured connected human seat (deterministic tie-break: seat order); if no human is connected, play remains paused.                                                                                                     |
| PRD-FUN-015 | On normal completion, the game displays one winner or an explicit no-winner outcome, final standings, selected variants, duration, and a read-only event history until retention expiry.                                                                                                                                                                                                                                                                                                                                                                          |

### Experience and instrumentation

| ID          | Requirement                                                                                                                                                                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD-FUN-016 | The mobile layout makes the current player's required decision, cash/debt state, dice/roll outcome, and board position usable at 320 CSS px width without horizontal page scrolling. Tablet/desktop may add simultaneous board and detail panes.                                              |
| PRD-FUN-017 | The app is installable as a PWA, declares an app manifest/icons, works over HTTPS, and provides a clear offline/reconnecting state. It must not claim offline play unless queued/offline behavior is implemented authoritatively.                                                             |
| PRD-FUN-018 | PostHog captures consent-aware, pseudonymous product events for game creation, joins, start, completion, reconnect, rule selection, and errors. Session replay is disabled by default until a reviewed consent and data-minimization design exists.                                           |
| PRD-FUN-019 | At a safe command boundary, the host may end a private game as `NO_CONTEST` after a destructive confirmation visible to every connected player. The action records no winner, preserves the final event history until normal expiry, revokes further gameplay commands, and cannot be undone. |

## Non-functional requirements

| ID          | Requirement                                                                                                                                                                                                                                                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD-NFR-001 | Implement with Next.js, Tailwind CSS, and shadcn/ui. Deploy as a self-hostable container/service compatible with Coolify; document required environment variables, persistence, backups, and HTTPS/proxy assumptions.                                                                                                                                 |
| PRD-NFR-002 | Support current and previous major versions of Chrome, Safari, Firefox, and Edge on mobile and desktop for core play. Test iOS Safari and Android Chrome explicitly.                                                                                                                                                                                  |
| PRD-NFR-003 | Use HTTPS in production; capability tokens must be high entropy, stored/compared safely, excluded from analytics, logs, referrers where practical, and never derived from game IDs. Apply rate limits to game creation, join, and action endpoints.                                                                                                   |
| PRD-NFR-004 | Persist an atomic authoritative action/event transaction so duplicate delivery, refresh, reconnect, and concurrent client requests cannot duplicate rolls, payments, draws, or ownership changes. Include optimistic concurrency/version checks.                                                                                                      |
| PRD-NFR-005 | Meet WCAG 2.2 AA for app-owned UI: keyboard operation, visible focus, semantic controls, live announcements for turn-critical changes, contrast, target sizes, reduced motion, and non-color-only state cues. Canvas/SVG board information needs equivalent text access.                                                                              |
| PRD-NFR-006 | Respect `prefers-reduced-motion`; dice and token animation are decorative and cannot delay, conceal, or change a resolved outcome.                                                                                                                                                                                                                    |
| PRD-NFR-007 | At 4G-like mobile conditions, initial usable lobby should render within 3 seconds at p75 and a submitted valid action should receive authoritative acknowledgement within 1.5 seconds at p95, excluding a disconnected client. Instrument these measures.                                                                                             |
| PRD-NFR-008 | Version board definitions, rules, variants, and event payloads. A resumed game always uses the immutable version captured at its start; deployments must retain readers for unexpired games.                                                                                                                                                          |
| PRD-NFR-009 | Collect the minimum operational data: game-scoped pseudonym, opaque session/seat capabilities, game events, and service telemetry. Publish retention/deletion behavior and make telemetry configuration controllable by a self-host operator.                                                                                                         |
| PRD-NFR-010 | Open-source licensing, third-party asset licenses, fonts, sounds, and dependencies must be inventoried before release. Do not include proprietary game scans, extracted datasets, or reference artwork. Version content and preserve the provenance fields and independent balancing/simulation evidence required by [Game content](game-content.md). |

## Success metrics

| Metric                    | MVP target                                                                                          | Measurement                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Lobby-to-start completion | ≥70% of created lobbies with 2+ claimed/configured seats start                                      | Pseudonymous create/start events                  |
| Join friction             | ≥90% of successful joins complete within 60 seconds of opening invite                               | Invite-open and seat-claim timestamps             |
| Resumption reliability    | ≥95% of valid reconnect attempts restore the same state without support intervention                | Reconnect outcome events                          |
| Rules completion          | ≥90% of started games reach a recorded completion or intentional expiry, excluding operator outages | Game lifecycle events                             |
| Action integrity          | 0 confirmed duplicate authoritative financial/roll/card outcomes                                    | Idempotency/concurrency audit and incident review |
| Accessibility             | 0 critical keyboard/screen-reader blockers in release QA                                            | Manual and automated accessibility checks         |

## Assumptions and risks

| Item                                                                       | Type       | Treatment                                                                                                                               |
| -------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Invite holders are trusted enough to enter a private room.                 | Assumption | Explain link sharing; use opaque capabilities and allow host seat recovery.                                                             |
| A full game can last hours or days.                                        | Assumption | Persist every action and expire active games 30 days after the last authoritative gameplay action; do not use volatile in-memory state. |
| Familiar mechanics may still carry intellectual-property/trade-dress risk. | Risk       | Independently author expression/data; retain provenance; secure legal review before public release.                                     |
| No accounts makes recovery and abuse controls weaker.                      | Risk       | Seat tokens, host capability, expiry, rate limits, and explicit recovery logs; document limitations.                                    |
| Complex forced-payment ordering causes disputes.                           | Risk       | Treat [Rules](rules.md) as executable product policy and test every state transition.                                                   |
| Bot games can be slow or confusing.                                        | Risk       | One bounded policy, clear rationale, and no hidden difficulty adjustment.                                                               |
| Session replay can capture sensitive game/link data.                       | Risk       | Disabled by default; require explicit reviewed opt-in and masking before enabling.                                                      |

## Acceptance and release criteria

Release is permitted only when all of the following are true:

1. Every requirement in this PRD is traced to implementation and test/QA evidence; all `RULE-*` and `VAR-*` requirements have deterministic engine tests.
2. A 2-seat and 6-seat game can be created, joined by a mix of guests/bots, resumed after refresh/reconnect, completed, and observed as read-only afterward.
3. The canonical flow and each configured variant run with immutable captured rules/board versions; invalid actions are rejected server-side with actionable errors.
4. Mobile keyboard/touch and desktop keyboard QA pass, including screen-reader announcement checks and reduced-motion behavior.
5. PWA install, offline/reconnect messaging, persistence/restart recovery, retention expiry, and Coolify deployment are exercised in a production-like environment.
6. Security review covers invite/seat/host capabilities, authorization, rate limiting, logging, retention deletion, and analytics configuration.
7. An IP/licensing attorney reviews and approves the complete mechanic combination, independently authored content/provenance record, and public marketing; no unreviewed third-party board/card/assets ship.

Normative precedence is: this PRD → [Rules](rules.md), [game content](game-content.md), and [variants](rule-variants.md) → engineering contracts → UX/design → delivery/runbooks. Related specifications: [mechanical completeness matrix](feature-parity.md) and [glossary](glossary.md).
