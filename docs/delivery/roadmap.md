# Delivery Roadmap

**ID:** MILE-001  
**Status:** dependency-ordered implementation plan  
**Inputs:** [PRD](../product/prd.md), [Rules](../product/rules.md), [Game content](../product/game-content.md), [UX](../design/ux-spec.md), [Test Strategy](test-strategy.md), and [Operations](operations.md)

## Requirement families

Normative families are `PRD-FUN`, `PRD-NFR`, `RULE`, `VAR`, `CONTENT`, `UX`, `DS`, `ENG`, `PROTO`, `SEC`, `ANA`, `OPS`, `TEST`, `BRAND`, and `LEGAL`. [Traceability](../traceability.md) maps each family to implementation and evidence.

Each milestone is a tracer bullet: it delivers a narrow, demonstrable path through its dependencies before broadening scope. IDs are deliberately bounded; new work receives a new requirement ID rather than silently expanding a milestone.

## MILE-002 — Planning, legal, and delivery foundation

- **Depends on:** none.
- **Scope / requirement families:** establish name research, original art direction, rules/content policy, license inventory, privacy/analytics policy, threat model, supported devices, and requirement register (`LEGAL`, `BRAND`, `SEC`, `ANA`, `UX`, `RULE`, `CONTENT`). Qualified counsel owns clearance and release approval.
- **Demo:** show the approved concept vocabulary and a requirements-to-test traceability sample.
- **Tests/evidence:** license/asset provenance review; invite-link privacy review; `TEST-002` traceability mapped for the first vertical slice.
- **Exit gate:** written owner approvals for product and legal review; no copied proprietary names, artwork, text, board layout, or rule expression is accepted into source control; requirements have bounded IDs.
- **Exclusions:** implementation of game mechanics, branding finalization, legal conclusions by an automated agent.

## MILE-003 — Platform skeleton and deterministic engine seam

- **Depends on:** `MILE-002`.
- **Scope / requirement families:** create the application foundation, schema/versioning, deterministic engine API, original content bundle, event/command model, seeded PRNG state, and fixtures (`RULE`, `CONTENT`, `ENG`, `SEC`).
- **Demo:** a script or developer screen replays a fixed seed from a command log into identical state.
- **Tests/evidence:** Vitest engine/table/property baselines under `TEST-003`; migration smoke fixture under `TEST-005`.
- **Exit gate:** replay determinism, command validation boundary, and invariants pass; no network/UI logic in the engine.
- **Exclusions:** multiplayer transport, complete rules, polished UI, bots.

## MILE-004 — Private realtime playable vertical slice

- **Depends on:** `MILE-003`.
- **Scope / requirement families:** create/join a private 2–6-seat game by opaque invite, lobby/presence, server-authoritative turn command, one simple deed/payment, event persistence, reconnect/catch-up, and a minimal responsive accessible board (`PRD-FUN`, `PROTO`, `RULE`, `ENG`, `SEC`, `UX`).
- **Demo:** two browsers create, share, join, take a deterministic turn, refresh/reconnect, and see the same persisted result.
- **Tests/evidence:** protocol authorization/order/reconnect tests and two-client Playwright smoke (`TEST-004`); link leakage/redaction checks (`TEST-005`).
- **Exit gate:** end-to-end vertical slice works with independent clients; unauthorized and duplicate commands cannot mutate state.
- **Exclusions:** complete property rules, auctions/trades/cards, bots, PWA, analytics.

## MILE-005 — Standard-rules completion

- **Depends on:** `MILE-004`.
- **Scope / requirement families:** complete setup, movement, all space categories, deeds/rent, district bonuses, improvement inventory, auctions, trade, mortgages, fees, Detention, event cards, bankruptcy, disconnect policy, end game, and history (`RULE`, `CONTENT`, `ENG`, `UX`).
- **Demo:** seeded 2-seat and 6-seat games exercise each rule family through completion and replay.
- **Tests/evidence:** table/scenario catalog plus generated invariants and replay golden fixtures (`TEST-003`); full protocol regression (`TEST-004`).
- **Exit gate:** each `RULE-###` has passing scenario/property coverage; 1,000 generated sequences produce no invariant violation.
- **Exclusions:** alternate rulesets, computer players, cross-device polish beyond usable baseline.

## MILE-006 — Bots and variants

- **Depends on:** `MILE-005`.
- **Scope / requirement families:** the single deterministic bot policy, bot seat/recovery behavior, decision explanations, and standard/short presets plus eight variants (`PRD-FUN-011`, `VAR`, `RULE`, `ENG-026`, `UX`).
- **Demo:** a human starts a game with bots, bots complete a game, and a selected variant is visible and replayable by version.
- **Tests/evidence:** bot legality/invariant tests and seeded bot replay; initial thousands-of-completed-games soak (`TEST-006`).
- **Exit gate:** bots never bypass command validation; variant choice is durable, displayed, and cannot alter an in-progress game.
- **Exclusions:** adaptive/ML bots, unversioned house rules, matchmaking.

## MILE-007 — Responsive accessible game experience

- **Depends on:** `MILE-005`; consumes bots from `MILE-006` when available.
- **Scope / requirement families:** phone-first active-turn UI, tablet/desktop layouts, effect/decision queue, state/history, trade/auction dialogs, reconnect, keyboard/touch, and personal visual settings (`UX`, `DS`, `PROTO`).
- **Demo:** the same live game is comfortably completed on phone, tablet, and desktop with keyboard-only flow.
- **Tests/evidence:** Playwright Chromium/Firefox/WebKit multi-client matrix; axe state coverage and manual VoiceOver/Safari + NVDA/Firefox review (`TEST-004`).
- **Exit gate:** no critical accessibility defect; supported breakpoint/browser matrix passes; focus and reduced-motion checks are signed off.
- **Exclusions:** native app-store applications, custom hardware support.

## MILE-008 — PWA, analytics, and operational readiness

- **Depends on:** `MILE-004`, `MILE-007`.
- **Scope / requirement families:** manifest/service worker/update UX, privacy-reviewed analytics/replay, consent/redaction, Coolify deployment, migrations, dashboards, alerts, backup/restore, incident runbooks, and release process (`PRD-FUN-017`, `ANA`, `OPS`, `ENG`, `SEC`).
- **Demo:** install/update PWA; inspect a redacted analytics event; deploy a candidate, restore an anonymized fixture, and roll back using [Operations](operations.md).
- **Tests/evidence:** PWA/security tests (`TEST-005`), restore drill (`OPS-009`), health/readiness checks, 100 games/600 clients load test (`TEST-006`).
- **Exit gate:** no private game link/state in analytics; successful restore and rollback drill; local-region p95 action broadcast under 300 ms at target load.
- **Exclusions:** multi-region active-active operation, Redis scaling unless capacity evidence requires it.

## MILE-009 — Closed alpha

- **Depends on:** `MILE-005` through `MILE-008`.
- **Scope / requirement families:** invite-only cohort, feedback/support path, consented telemetry, operational on-call, defect triage, and release evidence collection (all families).
- **Demo:** controlled users create private games, complete them, report feedback, and operators investigate a simulated incident.
- **Tests/evidence:** release-candidate gates in `TEST-007`, including 5,000-game soak; operational drill evidence.
- **Exit gate:** no unresolved critical security/data-loss/rules correctness defect; SLO/error budget reviewed; alpha learnings accepted or scheduled as bounded IDs.
- **Exclusions:** public marketing launch, paid features, promised availability beyond published alpha terms.

## MILE-010 — Public beta

- **Depends on:** `MILE-009`.
- **Scope / requirement families:** broaden access within capacity, publish support/status/security channels and operating limits, monitor SLOs, and prioritize feedback without breaking ruleset compatibility (all families).
- **Demo:** a release candidate passes all evidence gates and a public user completes a private game on a supported device.
- **Tests/evidence:** repeat release evidence under `TEST-007`; capacity/security update review under `OPS-008` and `OPS-010`.
- **Exit gate:** beta go/no-go approval; rollback owner and communications plan assigned; capacity headroom and restore drill are current.
- **Exclusions:** feature parity claims against any third-party product, native apps, global multi-region SLA.

## MILE-011 — gnhf implementation workflow

Use gnhf only after Git is initialized and `git status --porcelain` is empty. Commit approved planning docs first, then invoke `gnhf --worktree` so each bounded requirement is isolated. Set a finite requirement list, maximum iterations/tokens, and explicit stop condition. Review each worktree's diff, tests, generated files, and coverage before integrating it. Never delegate brand selection, legal judgment, privacy-policy approval, or launch approval to gnhf.

If gnhf fails, times out, or leaves an invalid result, preserve its logs/worktree for diagnosis, do not merge it, and remove/discard that worktree through Git only after review. Return to the last clean committed baseline; do not copy partial changes into the primary worktree. A failure is a planning signal: narrow the requirement or correct its acceptance criteria before retrying.

Sample bounded objective prompts:

```text
Implement RULE-001 auction-phase command handling and the auction behavior in product/rules.md.
Use a new --worktree. Do not edit UI, deployment, names/assets, or unrelated rules.
Maximum 3 iterations and 60k tokens. Stop when the named Vitest table and property tests pass,
or report the exact blocker. Return changed files, tests run, and remaining risks.
```

```text
Implement PROTO-004 only: reconnect catch-up from a persisted sequence number.
Use --worktree; preserve protocol compatibility. Maximum 2 iterations and 40k tokens.
Stop after protocol and two-client browser tests pass. Do not make legal, branding, analytics,
or infrastructure decisions. If tests cannot pass, leave the worktree unmerged and report why.
```
