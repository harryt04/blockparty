# Test Strategy

**ID:** TEST-001  
**Status:** implementation baseline  
**Inputs:** [PRD](../product/prd.md), [Rules](../product/rules.md), [Game content](../product/game-content.md), [Roadmap](roadmap.md), and [Operations](operations.md)

This strategy verifies a private-link browser game with 2–6 total human/bot seats without claiming third-party compatibility. Normative requirement families are `PRD-FUN`, `PRD-NFR`, `RULE`, `VAR`, `CONTENT`, `UX`, `DS`, `ENG`, `PROTO`, `SEC`, `ANA`, `OPS`, `TEST`, `BRAND`, and `LEGAL`.

## TEST-002 — Quality model and requirement mapping

| Layer | Primary requirement families | Purpose | Required evidence |
| --- | --- | --- | --- |
| Vitest unit/engine | `RULE`, `VAR`, `CONTENT`, `ENG` | Pure state transitions, money, ownership, phases, bot decisions | JUnit/results plus coverage report |
| Table and scenario tests | `RULE`, `VAR`, `CONTENT` | Human-readable edge cases and complete rules sequences | Named scenario output keyed to requirement IDs |
| Property-based tests | `RULE`, `CONTENT`, `ENG` | Explore legal command sequences and invariant preservation | Seed, counterexample, shrink output |
| Protocol/integration | `PROTO`, `SEC`, `ENG` | Validate authorization, persistence, idempotency, reconnect | Ephemeral Postgres-backed test report |
| Playwright multi-browser/client | `UX`, `DS`, `PROTO`, `SEC` | Validate 2–6 independent players on supported browsers | Trace, screenshots/video on failure |
| Accessibility | `UX`, `DS`, `PRD-NFR` | Automated axe and manual assistive-technology behavior | axe report and manual checklist sign-off |
| Resilience, migration, load | `OPS`, `ENG`, `PROTO` | Verify restart, recovery, restoration, and capacity/latency | Runbook output and timestamped metrics |
| Security | `SEC`, `PROTO`, `ENG` | Protect private games, capabilities, inputs, and dependencies | Scan output, threat-case results, remediation record |

Every implemented requirement has an acceptance test reference (`TEST-###`) in its implementation issue. A failing test blocks the corresponding roadmap exit gate; missing coverage is not waived by manual playtesting.

## TEST-003 — Engine, scenarios, and generators

Keep game-engine tests in Vitest with no browser, clock, network, or database dependency. Initialize `GameState` with a fixed PRNG algorithm, seed, and state; commands supply player choices. Server timestamps are explicit envelope metadata and never engine clock reads. Record the seed in assertion failures; production randomness never enters tests.

Table tests cover setup and 2/6-seat boundaries; movement and Start crossing; purchasable and unavailable spaces; rent, fees, and bankruptcy; deed and scarce-improvement auctions; districts and inventory-conserving level transitions; mortgage/redeem; trades; Detention/release; event-card decks; forced moves and effect continuations; doubles/extra turns; winner/no-winner/no-contest; disconnect pause/replacement/reclaim; and replay/idempotency. Scenario fixtures cite their `RULE-*`, `VAR-*`, and `CONTENT-*` IDs.

Property-based tests use `fast-check` (or equivalent) with deterministic replay. Run at least 1,000 generated command sequences locally/CI and retain the seed on failure. Invariants include:

- balances are integral minor currency units; no balance or payment is silently lost;
- each deed has at most one owner and each building belongs to its valid deed/set;
- the ledger, current state, and replayed event stream agree;
- only the active player may issue phase-legal commands;
- rejected or duplicate command IDs do not mutate state;
- a finished game cannot accept state-changing commands;
- deck/card, property, and player locations remain within valid domains; and
- generated bot commands obey the same validation as human commands.

Fixtures are versioned, small, and named by behavior: canonical board/ruleset, players, deck order, starting state, event stream, and expected projection. Do not snapshot opaque whole application state when a semantic assertion is possible. Golden fixtures for historical/replay compatibility are immutable; add a new version rather than edit one.

## TEST-004 — Realtime, browser, and accessibility tests

Protocol tests start the realtime boundary against ephemeral Postgres and verify invite admission; game-seat/host/reclaim capability separation; server command validation; monotonic sequences; ordered broadcast; duplicate handling; disconnect/reconnect/catch-up; replacement/reclaim; host transfer; stale client resync; completion; expiry; and restart persistence. Test malformed payloads, expired/revoked capabilities, cross-game access, and rate limits adversarially.

Playwright runs Chromium, Firefox, and WebKit. Separate browser contexts never share cookies. The suite covers a 2-seat turn and 6-seat lifecycle with human/bot mixes, reconnect/reclaim, and mobile/tablet/desktop layouts. Use deterministic seeds and semantic locators; do not depend on animations, wall-clock sleeps, or CSS classes. Keep a smoke path PR-blocking and run the full matrix on merge/release candidates.

Run axe on every major page/state: landing, create/join, lobby, active turn, modal/dialog, trade, auction, settings, reconnect, and game-over. Manual accessibility evidence per release includes keyboard-only completion of a turn; screen-reader checks with VoiceOver/Safari and NVDA/Firefox; zoom/reflow at 200% and 400%; reduced-motion; contrast; focus restoration after dialogs; and touch target review on a physical mobile device. Record browser/OS/assistive-tech versions and unresolved exceptions.

## TEST-005 — PWA, security, and resilience

PWA tests verify manifest fields/icons, installability, HTTPS-only service-worker registration, offline shell behavior, update prompt/activation, cache-version rollback safety, and no caching of private game state or authenticated responses unless explicitly designed and reviewed. Test an installed app reopening into an expired/revoked session.

Security tests include dependency and container-image vulnerability scans, secret scanning, authenticated and unauthenticated authorization tests, CSP/security-header assertions, CSRF/session fixation cases where applicable, invite-token entropy/non-enumerability, input-size/schema limits, WebSocket origin/auth checks, rate-limit behavior, and analytics redaction checks. Treat game links as credentials: do not place them in logs, analytics, referrers, screenshots, or public error reports.

Resilience tests deliberately terminate the application during commands and broadcasts, restart it, and verify durable replay without duplicated effects. Exercise network loss, delayed/out-of-order messages, reconnect after a missed turn, database reconnect, and deploy overlap. Migration tests upgrade a production-shaped anonymized fixture through every pending migration, then restore it into a fresh database and run read/write/replay smoke checks. A restore drill is also required by `OPS-009`.

## TEST-006 — Soak, performance, and capacity

Run bot soaks using real command validation and persistence. The release qualification soak completes at least **thousands of games** (minimum 5,000 unless a milestone specifies more), reports completion/failure counts, invariant failures, duplicate-event count, mean/percentile game duration, and memory/connection trends, and preserves failing seed/event streams.

The pre-beta load test targets **100 concurrent games / 600 connected clients** in a representative local-region environment. Measure client action accepted through recipient broadcast, excluding human think time. The target is **p95 under 300 ms** with no unauthorized delivery, event ordering error, or sustained error rate above 1%. Publish environment size, duration (at least 30 minutes), concurrency ramp, p50/p95/p99, database pool usage, CPU/memory, reconnect count, and saturation point. This is a capacity target, not proof of global latency.

## TEST-007 — CI gates, flakes, and release evidence

| Gate | Trigger | Required checks |
| --- | --- | --- |
| Fast | every change | formatting/type checks, Vitest unit/table/scenario/property tests, targeted protocol tests, secret scan |
| Merge | protected branch | full protocol suite, Chromium smoke, axe smoke, dependency/image scan |
| Nightly | scheduled | three-browser multi-client suite, fault/restart tests, bot soak, migration/restore fixture test |
| Release candidate | manual/tag | full matrix, manual AT checklist, PWA checks, 5,000-game soak, 100/600 load test, backup restore drill |

A test is flaky only after an owner records reproducible evidence and an issue. Do not retry a failure into green: one diagnostic retry may classify an infrastructure failure, but it remains visible. Quarantine requires a linked issue, owner, expiry no later than 14 days, and a non-quarantined replacement check when risk is release-critical. Expired quarantines fail the gate. Tests touching rules, authorization, persistence, or realtime ordering may not be quarantined for release.

Release evidence is retained with the release: immutable build/image digest; commit and migration versions; all gate links/results; browser/OS matrix; accessibility checklist; security scan and accepted-risk decisions; soak/load dashboards; backup restore-drill timestamp; rollback verification; known limitations; and approvers for product/engineering/operations. `LEGAL` sign-off is evidence of review, not an automated test result.
