# Test strategy

**Status:** normative delivery contract

This document defines the evidence required to move a requirement from
`Planned` to `Verified`. Tests follow the authority boundary: the pure engine
proves rules, server integration proves authorization and persistence, and a
real browser proves player-visible flows. A lower layer cannot stand in for the
layer that owns the risk.

## TEST-001 — Evidence and traceability

Every implementation ticket names its requirement IDs and the test that proves
its acceptance line. The same commit updates [traceability](../traceability.md)
with implementation and evidence links. A requirement becomes `Verified` only
when its automated evidence, required manual evidence, and applicable approval
or operational drill are linked. Scaffolding, snapshots without assertions,
and code review alone are not evidence.

## TEST-002 — Requirement-to-test-layer map

Use the narrowest layer that observes the requirement's authoritative outcome.
Every backlog `Proves:` line cites one of these assignments.

| Requirement family                                                                                                          | Required proving layer                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Contract schemas, wire vocabulary, versions, configuration shape                                                            | Contract-schema Vitest tests in `packages/contracts`                                                    |
| Content topology, values, effects, provenance shape, bundle selection                                                       | Content validation and immutable fixture tests in `packages/game-content`                               |
| `RULE-*`, engine-owned `VAR-*`, deterministic outcomes, invariants, replay                                                  | Pure table, scenario, property, and golden tests in `packages/game-engine`                              |
| Authentication, capabilities, command ordering, MongoDB documents/indexes/transactions, retention, projections, SSE, resync | Protocol integration tests against an ephemeral replica-set MongoDB, with separate clients per seat     |
| Player journeys, responsive behavior, browser recovery, PWA, and app-owned accessibility                                    | Playwright in Chromium, Firefox, and WebKit; separate browser contexts per player                       |
| Component semantics or presentation logic with no server behavior                                                           | Component Vitest tests; use browser tests when layout, focus, networking, or assistive behavior matters |
| Security and privacy controls                                                                                               | Integration or browser network tests at the boundary being protected, plus the applicable manual review |
| Bot policy and simulations                                                                                                  | Fixed-state policy tests plus the deterministic soak harness                                            |
| Deployment, observability, backup/restore, maintenance, and capacity                                                        | Deployment smoke tests, runbook drills, and load evidence against the deployed topology                 |
| Legal, content similarity, provenance sign-off, and assistive-technology review                                             | Recorded human review; automation may support but cannot replace approval                               |

## TEST-003 — Deterministic domain suites

Engine tests use no browser, clock, network, database, or host randomness. They
use fixed seeds and print the seed on failure. Table tests cover bounded rule
cases; scenario tests cover multi-step phase transitions; property tests check
invariants over generated legal sequences; golden fixtures prove replay and
version compatibility. Golden fixtures are immutable: add a new version rather
than editing history.

Content tests validate both a known-good bundle and targeted broken fixtures.
They identify the offending canonical ID and cover every `CONTENT-009` rejection.

## TEST-004 — Protocol and browser suites

Protocol tests run against an ephemeral MongoDB replica set so transactions and
change streams are real. They prove idempotency, optimistic concurrency,
commit-before-publish ordering, authorization, per-seat projections, reconnect,
catch-up, restart recovery, and retention boundaries. Browser tests use separate
contexts for separate players and cover current plus previous major Chrome,
Safari, Firefox, and Edge behavior through the Chromium, WebKit, and Firefox
projects, with explicit iOS Safari and Android Chrome release checks.

## TEST-005 — Security, privacy, data, PWA, and accessibility

Threat cases cover capability separation, hashes at rest, cookie attributes,
CSRF/origin checks, payload bounds, rate limits, generic not-found responses,
log redaction, analytics denial/withdrawal, schema allowlists, and session-replay
masking. PWA tests prove the app shell works offline while game state and
capabilities are never cached. Automated axe, keyboard, zoom, contrast, forced
colors, and reduced-motion checks are supplemented by the manual VoiceOver and
NVDA checklist; manual evidence is required for release.

## TEST-006 — Soak, load, and performance

The deterministic bot harness runs at least 5,000 games spanning 2–6 seats,
presets, and every toggle, recording its seed and stalled-game diagnostics on
failure. Load tests exercise create, join, command, sync, and SSE behavior at the
capacity target. Browser and server measurements prove the PRD p75 lobby and p95
acknowledgement budgets; reports record build, content version, dataset, topology,
and raw results.

## TEST-007 — CI and release gate

`pnpm run ci` runs Prettier check, typecheck, ESLint, and Vitest with coverage in
that order, with no errors or warnings. Every ticket runs `pnpm run format` first,
then the full gate. Its new test is mutation-confirmed: deliberately break the
protected behavior, observe the test fail, and restore it. Tests for rules,
authorization, persistence, or realtime ordering are never quarantined or
retried into green.

Pull requests run the same command. Release evidence adds production build and
deployment smoke results, browser projects, manual accessibility records,
security/privacy review, provenance and license inventory, operations drills,
and the attorney gate where required.
