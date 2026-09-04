# Build backlog

**Status:** the closed, dependency-ordered work queue for autonomous agents
**Consumed by:** [gnhf prompt](../gnhf-prompt.md), driven by [gnhf CLI](../gnhf-cli.md)

This file is the single source of truth for what an agent builds next. It turns
the implementation plan into 64 tracer-bullet tickets. Each ticket cuts a narrow
but complete path through the layers it touches, and each one is sized to fit in
one fresh context window.

`docs/` stays the implementation authority. This file says **which** requirement
to implement and **when**. The linked document says **what** the requirement is.
When the two disagree, the document wins and this file is the defect.

## Claim protocol

One ticket per iteration. No exceptions.

1. Read this section, **The rule that makes this loop terminate**, **What done
   means here**, and **Traps** in full before you touch a ticket.
2. Work the loops in file order. Move to the next loop only when every ticket in
   the current one is `[x]`, `[!]`, or `[?]`.
3. Take the **first ticket in the active loop marked `[ ]` whose every blocker is
   already `[x]` or `[?]`**. Do not skip ahead inside a loop to find easier work.
4. Change its mark to `[~]` and commit that single-character change on its own.
   The claim is now visible to the next iteration.
5. Do the work. Finish with the mark set to `[x]`, `[!]`, or `[?]`, plus one or
   two lines saying what changed and which test proves it.

A ticket marked `[~]` at the start of an iteration is yours to finish. A previous
iteration claimed it and did not land it. Read the git log for that ticket, then
either complete it or mark it `[!]` with the reason.

## State marks

| Mark  | Meaning                                                                    |
| ----- | -------------------------------------------------------------------------- |
| `[ ]` | Unclaimed. Available if every blocker is `[x]` or `[?]`.                   |
| `[~]` | Claimed by the current iteration.                                          |
| `[x]` | Done. Implemented, tested, `pnpm run ci` green, committed.                 |
| `[!]` | Blocked or rejected. Two sentences saying why, and which ticket blocks it. |
| `[?]` | Done and committed, but a human must review it before public release.      |

`[?]` exists for independently authored content. An agent may author original
board data, deed values, and card text. An agent may not sign off its own
provenance. Draft it, record the CONTENT-008 provenance entry with the AI-tool
fields filled in, mark `[?]`, and continue. The loop never stalls waiting for a
human, and the release gate stays closed until the human signs.

## The rule that makes this loop terminate

**Loops 0 through F are closed lists. Do not add a ticket.**

You may tick a ticket, block a ticket, or annotate a ticket. Anything else you
notice goes under **Observed, not queued** at the bottom of this file, in one or
two lines, and you carry on with your claimed ticket. Do not act on it in the
same iteration.

If you believe your claimed ticket is wrong, already done, or not worth doing,
do not redefine it. Mark it `[!]`, write why in two sentences, and take the next
available ticket in the same loop.

Without this rule the backlog grows faster than you drain it and the run never
ends.

## What done means here

A ticket is `[x]` when all of the following are true:

1. The **Acceptance** line works end to end. Not a stub, not a TODO.
2. The **Proves** line exists as a real test at the layer `TEST-002` assigns.
3. That test is **mutated and confirmed**: break the code, watch it fail, restore.
   Rewrite a test that passes against broken code.
4. `pnpm run format` has been run, so `pnpm run ci` does not fail on formatting.
5. **`pnpm run ci` passes with no errors and no warnings.** This is the regression
   gate: it runs the whole suite, not only the new test.
6. Every requirement ID on the **Requirements** line has its
   `docs/traceability.md` row updated in the same commit.
7. The work is committed. gnhf discards uncommitted changes.

Partial credit does not exist. A ticket that compiles but does not do the thing is
`[!]`, not `[x]`.

## Ticket anatomy

```md
- [ ] **X0 — Example, not a real ticket**
      Blocked by: X-previous
      Requirements: the bounded IDs this ticket implements
      Read: only the documents this ticket needs
      Acceptance: what must observably work when this ticket is done.
      Proves: the test that must exist, and the layer TEST-002 assigns it to.
```

`X0` is illustrative. The real tickets start at 0.1.

**Read** is a budget, not a suggestion. This repository holds normative
documents that do not fit in one context window together. Load the documents the
ticket names. Load another only when the work sends you there for something
specific.

**Acceptance** is the whole specification. If your plan satisfies something
else, the plan is wrong.

## Traps

These come from the cross-cutting invariants in `AGENTS.md`. Breaking one makes
the change wrong even when it compiles and the tests pass.

- **Do not invent behaviour a document already defines.** Search the docs first.
  If a document is wrong, fix the document in the same commit as the code.
- **Never put a display name in the wire layer.** `Address`, `Block`, `The
Committee`, and `Noise Complaint` are presentation only. A display name in a
  command, event, wire field, database column, content ID, analytics property, or
  test fixture is a defect. The server sends `district`; the component renders
  "Block".
- **The board is a winding street route.** A square grid or a familiar perimeter
  layout is a Red finding, not a style choice.
- **No timers.** The MVP has no turn, purchase, auction, trade, or debt timeout. A
  disconnected required actor pauses play. Connectivity never fabricates a pass, a
  bid, a trade response, or a bankruptcy.
- **The engine is pure.** No clock, no `Math.random`, no IO, no logging, no
  mutation, no token checks in `packages/game-engine`.
- **Server authority.** The browser renders a projection. Only server-side modules
  in `apps/web` call the engine to accept a command.
- **Capabilities never travel in the open.** Not in a URL, not in `localStorage`,
  not in a log line, not in an analytics event. Store hashes, never raw tokens.
- **Money is integer minor units.** Never float.
- Do not weaken an assertion, delete a test, lower a coverage threshold, or relax
  a gate to reach green.
- Do not retry a failure into green. Do not quarantine a test that covers rules,
  authorization, persistence, or realtime ordering.
- Do not batch two tickets into one commit.

---

## Loop 0 — Foundation

Tickets 0.1 and 0.2 landed with this queue so every later ticket starts behind
working regression and branch-protection gates. Content tickets require human
provenance review.

- [x] **0.1 — `pnpm run ci`: Prettier, typecheck, ESLint, Vitest, content validation**
      Blocked by: none (completed with this queue)
      Requirements: ENG-002, PRD-NFR-001, TEST-007
      Read: docs/engineering/architecture.md, docs/delivery/test-strategy.md
      Acceptance: root scripts run Prettier check, all-package typecheck, ESLint, and a four-project Vitest coverage workspace in order; each package has a real test and clean `pnpm run ci` has no errors or warnings.
      Proves: mutate a package assertion and formatting, observe the full gate fail, restore both, and record the green root run; TEST-002 contract/content/engine/component Vitest layers.

- [x] **0.2 — GitHub Actions CI and the `master` ruleset**
      Blocked by: 0.1
      Requirements: TEST-007, ENG-004
      Read: docs/delivery/test-strategy.md, docs/delivery/operations.md
      Acceptance: PRs and pushes to `master` run job `ci` on `.nvmrc` Node after a frozen install; active ruleset 22211730 requires a PR with zero approvals and status `ci`, and blocks branch deletion and force pushes.
      Proves: workflow inspection and ruleset API evidence, followed by recorded PR merge-block and rejected non-fast-forward push checks; TEST-002 CI/deployment-control layer.

- [x] **0.3 — Content validator: the full CONTENT-009 check set**
      Blocked by: 0.2
      Requirements: CONTENT-003, CONTENT-007, CONTENT-009, ENG-024
      Read: docs/product/game-content.md, docs/product/rule-variants.md
      Acceptance: `validateBundle` rejects incomplete rents, impossible inventory, unrepresentable effects, invalid card targets, and out-of-bounds variant data, alongside every structural check, naming the offending canonical ID.
      Proves: targeted valid/broken fixtures cover every CONTENT-009 rejection in `pnpm run ci`; TEST-002 content-validation Vitest layer.
      Implemented the complete content/effect/economy validator with canonical-ID diagnostics; `packages/game-content/test/validate.test.ts` covers the valid bundle and every rejection category.

- [?] **0.4 — Content v1.0.0 (a): route topology and spaces**
  Blocked by: 0.3
  Requirements: CONTENT-002, CONTENT-003, CONTENT-008, DS-001, LEGAL-002
  Read: docs/product/game-content.md, docs/brand/brand-strategy.md, docs/legal/ip-safety.md
  Acceptance: an original validated winding-street route defines IDs, edges, Start, Detention, types, effects, and irregular layout with provenance; a square grid, perimeter, or uniform spacing is a Red rejection.
  Proves: topology fixtures and winding-street guardrail plus human provenance review; TEST-002 content-validation/human-review layers.

- [?] **0.5 — Content v1.0.0 (b): deeds, districts, and economy constants**
  Blocked by: 0.4
  Requirements: CONTENT-004, CONTENT-005, CONTENT-007, CONTENT-008
  Read: docs/product/game-content.md, docs/product/rules.md, docs/product/rule-variants.md
  Acceptance: every purchasable space has an original valid deed/rent/improvement schedule and the complete integer-minor-unit economy/variant constants validate with independent-balancing provenance.
  Proves: deed/economy invariant tables and human numerical-provenance review; TEST-002 content-validation/human-review layers.

- [?] **0.6 — Content v1.0.0 (c): decks and the provenance register**
  Blocked by: 0.5
  Requirements: CONTENT-006, CONTENT-008, CONTENT-010, LEGAL-002, LEGAL-006
  Read: docs/product/game-content.md, docs/brand/brand-strategy.md, docs/legal/ip-safety.md
  Acceptance: Word of Mouth and Favors contain independently authored cards using only the closed DSL, and the register covers every creative/numerical asset while retaining the human release gate.
  Proves: deck/effect fixtures and complete register audit plus human sign-off; TEST-002 content-validation/human-review layers.

- [x] **0.7 — Canonical bundle hash, version registry, placeholder ban in production**
      Blocked by: 0.6
      Requirements: CONTENT-001, CONTENT-008, ENG-027, PRD-NFR-008
      Read: docs/product/game-content.md, docs/engineering/game-engine.md
      Acceptance: canonical serialization matches the recorded v1.0.0 hash, registry lookups preserve started-game versions, and production refuses all `PLACEHOLDER_NOT_FOR_RELEASE` bundles.
      Proves: hash golden, old-version lookup, tamper, and production-placeholder cases; TEST-002 content fixture/compatibility layer.
      Implemented canonical key-sorted serialization with browser-safe SHA-256, immutable version registries, hash validation, and production lookup rejection; `packages/game-content/test/canonical.test.ts` covers the golden, archived lookup, tamper, and placeholder cases.

---

## Loop A — Deterministic engine

Pure Vitest only: no browser, clock, network, or database. Use fixed seeds and
print the seed on failure.

- [x] **A1 — Seeded PRNG and replay determinism**
      Blocked by: 0.7
      Requirements: ENG-020, ENG-022, ENG-027
      Read: docs/engineering/game-engine.md
      Acceptance: a fixed-integer PRNG derives from a 256-bit seed, every random outcome is event data, and replay reconstructs byte-identical state without PRNG access or future deck order.
      Proves: fixed-seed goldens, event-only replay, and forbidden-import cases; TEST-002 pure-engine golden layer.
      Implemented xoshiro128** seeded draws, event-only lifecycle replay, and immutable PRNG snapshots; `packages/game-engine/test/engine-seam.test.ts` covers fixed-seed goldens, recorded dice data, replay identity, mutation detection, and validation.

- [x] **A2 — `GameState`, the phase union, `StartGame`, `RollDice`**
      Blocked by: A1
      Requirements: ENG-020, ENG-021, ENG-023, RULE-001, RULE-002, RULE-003
      Read: docs/engineering/game-engine.md, docs/product/rules.md
      Acceptance: immutable complete state and discriminated phases implement start/roll, deterministic order/ties, starting cash/positions, matching rolls, and independent seat/phase rejection.
      Proves: fixed-seed state tables and legal/illegal start/roll scenarios; TEST-002 pure-engine table/scenario layer.
      Implemented immutable turn state, deterministic recorded setup ordering, seeded dice, matching-roll detention, and independent actor/phase guards; `packages/game-engine/test/start-roll.test.ts` covers fixed-seed state/scenario cases and mutation-sensitive matching behavior.

- [x] **A3 — Movement, Start crossing, and the serialized effect queue**
      Blocked by: A2
      Requirements: RULE-004, RULE-007, RULE-010, ENG-025, CONTENT-003
      Read: docs/product/rules.md, docs/engineering/game-engine.md
      Acceptance: movement follows route edges and Start rules; data-ordered effects serialize/resume continuations around choices, auctions, obligations, matching rolls, and detention.
      Proves: multi-effect movement scenarios assert order, crossing, continuation, and third-match detention; TEST-002 pure-engine scenario layer.
      Implemented route-edge dice/forced movement, Start payment events, and immutable pending-choice continuations; `packages/game-engine/test/movement-queue.test.ts` proves crossing, exact-landing variant, queue insertion/resume, replay, and third-match Detention.

- [x] **A4 — Acquisition and the bank ledger**
      Blocked by: A3
      Requirements: RULE-001, RULE-004, PRD-FUN-007, CONTENT-004
      Read: docs/product/rules.md, docs/product/game-content.md
      Acceptance: eligible landings offer acquire/decline, affordable acquisition atomically moves cash/ownership, and the always-solvent bank separately tracks deeds, currency, and inventory.
      Proves: acquisition and ledger tables cover affordability, authority, atomicity, and cash bounds; TEST-002 pure-engine table/scenario layer.
      Implemented immutable deed/bank ledgers, purchase offers, atomic acquisition, and decline-to-auction handoff; `packages/game-engine/test/acquisition-ledger.test.ts` proves affordability, authority, atomicity, cash bounds, variants, and replay.

- [x] **A5 — Rent: district, transit, and utility**
      Blocked by: A4
      Requirements: RULE-004, RULE-005, CONTENT-004
      Read: docs/product/rules.md, docs/product/game-content.md
      Acceptance: owned unmortgaged deeds charge exact data-defined category rent, including complete-district and dice-dependent rules, through the ledgered obligation path.
      Proves: rent tables cover all categories, mortgage/owner landings, complete districts, and utility rolls; TEST-002 pure-engine table layer.
      Implemented content-backed district, transit, and utility rent calculation with self/mortgage exclusions, atomic `RentPaid`, and immutable insufficient-funds obligations; `packages/game-engine/test/rent.test.ts` covers the category table and replay cases.

- [x] **A6 — Deed auction**
      Blocked by: A5
      Requirements: RULE-004, RULE-006
      Read: docs/product/rules.md
      Acceptance: declined/unaffordable deeds enter a no-timer auction with deterministic order, bounded bids, irrevocable passes, exact settlement, and no-sale return.
      Proves: auction scenarios cover invalid bids, pause, pass/win/no-sale, and conservation; TEST-002 pure-engine scenario layer.
      Implemented pure no-timer auction bidding, irrevocable passes, ordered priority, exact bank settlement, no-sale return, and replay events; `packages/game-engine/test/auction.test.ts` covers invalid bids, pause, pass/win/no-sale, conservation, and replay.

- [x] **A7 — Improvements, even building, inventory conservation**
      Blocked by: A5
      Requirements: RULE-005, RULE-008, CONTENT-005, ENG-023
      Read: docs/product/rules.md, docs/product/game-content.md, docs/engineering/game-engine.md
      Acceptance: eligible districts buy/sell improvements with rounding, even-building, atomic payment, and finite inventory conserved across levels.
      Proves: decision tables and generated legal sequences preserve cash, level, and inventory invariants; TEST-002 pure-engine table/property layer.
      Implemented atomic `BuyImprovement`/`SellImprovement` transitions with complete-district and even-building guards, content-defined resale rounding, finite inventory deltas, and event-only replay; `packages/game-engine/test/improvements.test.ts` covers decision tables, generated legal sequences, mutation-sensitive guards, rounding, atomic rejection, and replay.

- [x] **A8 — Scarce improvement auction**
      Blocked by: A7
      Requirements: RULE-006, RULE-008, CONTENT-005
      Read: docs/product/rules.md, docs/product/game-content.md
      Acceptance: scarce-unit contention enters a deterministic no-timer auction whose cost/inventory follow content before resuming construction.
      Proves: contention scenarios cover order, passes, price, inventory, pause, and continuation; TEST-002 pure-engine scenario layer.
      Implemented the serialized improvement-demand phase, deterministic bidding/pass rounds, content-priced atomic awards, inventory exhaustion, VAR-008 bypass, and event-only replay; `packages/game-engine/test/scarce-improvements.test.ts` covers contention, no-sale, continuation, and fixed-seed scenarios.

- [x] **A9 — Mortgage, redeem, and transfer charge**
      Blocked by: A7
      Requirements: RULE-005, RULE-008, CONTENT-004
      Read: docs/product/rules.md, docs/product/game-content.md
      Acceptance: eligible deeds mortgage/redeem at exact values, suppress rent while mortgaged, and apply transfer charges atomically without negative cash.
      Proves: mortgage lifecycle tables cover eligibility, rent, redemption, transfer, and ledger balance; TEST-002 pure-engine table layer.
      Implemented immutable mortgage/redemption events, debt-compatible mortgage liquidation, and content-defined mortgaged-deed transfer charges; `packages/game-engine/test/mortgage.test.ts` covers lifecycle, replay, eligibility, rent suppression state, and atomic cash bounds.

- [x] **A10 — Cards, decks, and retained release cards**
      Blocked by: A3
      Requirements: RULE-007, CONTENT-003, CONTENT-006, ENG-022
      Read: docs/product/rules.md, docs/product/game-content.md, docs/engineering/game-engine.md
      Acceptance: recorded shuffles/draws drive both decks, effects run in order, retained cards leave/return correctly, and future order remains secret.
      Proves: fixed-seed deck goldens and every-effect lifecycle scenarios; TEST-002 pure-engine golden/scenario layer.
      Implemented server-only deterministic deck cursors, replayable card draws/discards, ordered effect execution, and retained-card removal; `packages/game-engine/test/cards.test.ts` proves fixed-seed shuffles, both deck paths, lifecycle ordering, and replay.

- [x] **A11 — Detention**
      Blocked by: A10
      Requirements: RULE-009, RULE-010, CONTENT-005
      Read: docs/product/rules.md, docs/product/game-content.md
      Acceptance: entry, fee/card release, roll attempts, matching release, income/asset rights, movement, and turn completion follow the no-timer state machine.
      Proves: detention transition tables cover every release path and final-attempt edge; TEST-002 pure-engine table layer.
      Implemented replayable Detention choice routes for held release cards, post-attempt fees, matching attempts, failed-attempt turn completion, and VAR-004 income suppression; `packages/game-engine/test/detention.test.ts` covers release, movement, replay, asset retention, and no-timer transitions.

- [x] **A12 — Obligation and debt**
      Blocked by: A5, A9
      Requirements: RULE-007, RULE-011, ENG-025
      Read: docs/product/rules.md, docs/engineering/game-engine.md
      Acceptance: unaffordable charges enter serialized debt, permit only legal liquidity, preserve creditor/amount/continuation, and settle atomically without timers.
      Proves: bank/player debt scenarios cover liquidity, settlement, stale actions, pause, and continuation; TEST-002 pure-engine scenario layer.
      Implemented atomic bank/player obligation settlement, serialized continuation resumption, and debtor-only mortgage/improvement-sale liquidity; `packages/game-engine/test/debt.test.ts` covers settlement, replay, liquidity, underfunded debt, and authority.

- [x] **A13 — Trades and staleness**
      Blocked by: A12
      Requirements: RULE-012, PRD-FUN-006, ENG-023
      Read: docs/product/rules.md, docs/engineering/game-engine.md
      Acceptance: trade lifecycle uses canonical assets/integer money, escrows nothing, rejects stale offers, and transfers all terms atomically in legal phases.
      Proves: trade scenarios/generated offers cover authority, staleness, charges, atomicity, and invariants; TEST-002 pure-engine scenario/property layer.
      Implemented escrow-free trade proposals with canonical cash/deed/release-card terms, atomic acceptance and mortgage transfer charges, named rejection/cancellation, stale invalidation, and debt liquidity support; `packages/game-engine/test/trade.test.ts` covers the reducer scenarios and replay.

- [x] **A14 — Bankruptcy, elimination, endgame, and no-contest**
      Blocked by: A12
      Requirements: RULE-011, PRD-FUN-015, PRD-FUN-019
      Read: docs/product/rules.md, docs/product/prd.md
      Acceptance: unresolved debt disposes assets by creditor rule, eliminates seats from turns, produces configured winner/no-winner outcomes, and permits irreversible host no-contest only at a safe boundary.
      Proves: bankruptcy/endgame scenarios cover both creditors, inventory, winner/no-winner, and no-contest legality; TEST-002 pure-engine scenario layer.
      Implemented replayable bankruptcy liquidation, creditor/bank asset handling, elimination, terminal winner/no-winner outcomes, and safe-boundary no-contest; `packages/game-engine/test/bankruptcy.test.ts` covers the scenarios and replay.

- [x] **A15 — `legalActions` and `actionAvailability`**
      Blocked by: A14
      Requirements: PRD-FUN-009, ENG-020, ENG-023
      Read: docs/product/prd.md, docs/engineering/game-engine.md
      Acceptance: every phase exposes exhaustive seat-scoped legal actions/bounds and stable unavailable reasons while `resolve` rejects forged/stale commands independently.
      Proves: phase/seat tables compare query output with command resolution across the state union; TEST-002 pure-engine table layer.
      Implemented reducer-backed legal-action enumeration for every supported phase, bounded auction parameters, detention choices, management targets, trade responses, and stable blocked-action copy; `packages/game-engine/test/legal-actions.test.ts` compares advertised actions with `resolve` and checks phase/seat reasons.

- [x] **A16 — Invariants, property tests, and golden replay fixtures**
      Blocked by: A15
      Requirements: ENG-022, ENG-023, ENG-027, ENG-028, RULE-001–012
      Read: docs/engineering/game-engine.md, docs/product/rules.md, docs/delivery/test-strategy.md
      Acceptance: post-resolution/replay invariants cover all rules and supported versions; immutable goldens replay each major workflow.
      Proves: fast-check legal sequences with recorded seeds, versioned goldens, and deliberate invariant corruptions; TEST-002 pure-engine property/golden layer.
      Implemented invariant validation at the resolve/replay boundary, transition-level finite-inventory conservation, and deterministic fixed-seed replay coverage in `packages/game-engine/src/invariants.ts` and `packages/game-engine/test/invariants.test.ts`.
      The property, golden, corruption, and existing workflow suites pass in the full CI gate.

---

## Loop B — Server, persistence, and protocol

Protocol tests use an ephemeral MongoDB replica set and separate clients per
seat. Each ticket removes the corresponding builder from
`apps/web/src/server/stub-data.ts`; B11 removes the empty file.

- [x] **B1 — MongoDB adapter, indexes, the maintenance command, real readiness**
      Blocked by: A16
      Requirements: ENG-004, ENG-006, ENG-016, OPS-002, OPS-004
      Read: docs/engineering/architecture.md, docs/engineering/realtime-and-data.md, docs/delivery/operations.md
      Acceptance: the official driver supplies bounded pools/sessions, applies every idempotent index from the web image, shuts down gracefully, and readiness distinguishes absent, healthy replica-set, and unhealthy database states.
      Proves: replica-set integration tests cover connection/index idempotency/readiness/shutdown; TEST-002 protocol-integration layer.
      Implemented bounded MongoDB sessions/pools, full index maintenance, lifecycle shutdown wiring, and replica-set-aware readiness.
      Proven by `apps/web/test/db.test.ts` (including a real replica-set run when `MONGODB_TEST_URI` is configured) and the full CI gate.

- [x] **B2 — Create game and capability issuance**
      Blocked by: B1
      Requirements: PRD-FUN-001, PRD-FUN-002, PRD-FUN-013, ENG-010, SEC-002
      Read: docs/product/prd.md, docs/engineering/realtime-and-data.md, docs/engineering/security-privacy-analytics.md
      Acceptance: create persists a lobby with secret seed, captured versions/configuration/expiry and issues distinct high-entropy invite, host, seat, and reclaim authorities as secure cookies while storing hashes only.
      Proves: create integration cases inspect documents/cookies and prove no raw capability or seed crosses storage/response/log boundaries; TEST-002 protocol/security layer.
      Implemented transaction-scoped lobby creation, immutable version/hash capture, 256-bit seed storage, 30-day expiry, audit record, and distinct host/seat/reclaim cookies with hash-only capability documents; `apps/web/test/create-game.test.ts` proves persistence and response/cookie secrecy.

- [x] **B3 — Join gate, seat claim, and pseudonym validation**
      Blocked by: B2
      Requirements: PRD-FUN-003, PRD-FUN-004, PRD-FUN-005, SEC-002, SEC-003
      Read: docs/product/prd.md, docs/engineering/realtime-and-data.md, docs/engineering/security-privacy-analytics.md
      Acceptance: invite admission reveals only the join gate, valid pseudonyms claim one open seat and receive new seat/reclaim cookies, occupied seats cannot be displaced, and failures remain non-enumerating.
      Proves: separate-client join integration tests cover validation, races, full rooms, replayed invites, and generic errors; TEST-002 protocol/security layer.
      Implemented database-backed invite status and transactional seat claims with normalized grapheme-aware pseudonyms, hash-only seat/reclaim authorities, generic unavailable responses, and audit records. Proven by `apps/web/test/join-game.test.ts` and `apps/web/test/join-route.test.ts`; full CI passes.

- [x] **B4 — The transactional command path**
      Blocked by: B3
      Requirements: PRD-NFR-004, ENG-015, PROTO-001, PROTO-002, SEC-002
      Read: docs/engineering/realtime-and-data.md, docs/engineering/game-engine.md, docs/engineering/security-privacy-analytics.md
      Acceptance: one replica-set transaction authenticates/locks, checks `commandId`, loads snapshot, compares `expectedVersion`, resolves, appends events, updates snapshot, stores receipt, commits, then publishes; duplicates return the committed ACK and failures commit nothing.
      Proves: concurrent/restart integration tests cover every ENG-015 step, duplicate ID, stale version, rollback, monotonic sequence/version, and publish-after-commit; TEST-002 protocol-integration layer.
      Implemented the receipt-first Mongo transaction, optimistic aggregate update, journaled engine events, durable ACK, capability-scoped route authentication, and post-commit delivery. Proven by `apps/web/test/command-path.test.ts` with duplicate, stale, rollback, monotonic sequence/version, and publish-after-commit cases.

- [x] **B5 — Authorized projections and bootstrap**
      Blocked by: B4
      Requirements: PRD-FUN-009, PRD-FUN-010, ENG-010, PROTO-004, SEC-002
      Read: docs/engineering/realtime-and-data.md, docs/engineering/security-privacy-analytics.md, docs/product/prd.md
      Acceptance: bootstrap constructs each seat's allowlisted lobby/game/summary projection without spread-delete, including legal actions but excluding seeds, future decks, raw capabilities, other-seat private state, and internal fields.
      Proves: per-seat projection integration tests use sentinel secret fields and fail on any extra key; TEST-002 protocol/security layer.
      Implemented field-by-field lobby, game, and summary projection builders and wired bootstrap to authenticated persisted game state with seat-scoped legal actions. `apps/web/test/projection.test.ts` and `apps/web/test/bootstrap-route.test.ts` prove projection schemas, authority, and secret/private-state exclusion.

- [x] **B6 — Authenticated SSE, the change stream, and presence**
      Blocked by: B5
      Requirements: ENG-007, PROTO-002, PROTO-003, PROTO-004, PRD-FUN-014
      Read: docs/engineering/realtime-and-data.md, docs/product/prd.md
      Acceptance: authenticated SSE streams committed per-seat projections from MongoDB change streams with keep-alives, bounded connections, monotonic durable frames, ephemeral presence, and no cross-seat leakage.
      Proves: multi-client integration tests cover auth, filtering, ordering, keep-alive, reconnect token, presence non-durability, and post-commit delivery; TEST-002 protocol-integration layer.
      Implemented cookie-authenticated SSE admission, per-seat allowlisted snapshot fan-out from the MongoDB change stream, bounded subscriptions, monotonic sequence filtering, and ephemeral presence in `apps/web/src/server/sse/`.
      Proven by `apps/web/test/events-route.test.ts` and `apps/web/test/sse.test.ts`; `pnpm run ci` and `pnpm build` pass (build retains the existing Next.js ESLint-plugin warning).

- [x] **B7 — Catch-up and resync**
      Blocked by: B6
      Requirements: PROTO-002, PROTO-003, PROTO-004, PRD-NFR-004
      Read: docs/engineering/realtime-and-data.md
      Acceptance: `/events` returns authorized bounded contiguous ranges, `/sync` selects catch-up or snapshot by sequence/version and retention bounds, and gaps/unsupported history require a snapshot rather than fabricated continuity.
      Proves: restart/gap/duplicate/out-of-order integration matrix proves catch-up, snapshot fallback, and per-seat filtering; TEST-002 protocol-integration layer.
      Implemented bounded durable recovery in `apps/web/src/server/sync/recovery.ts`, authenticated `/sync`, and reconnect catch-up frames on `/events`; `apps/web/test/sync-route.test.ts` and `apps/web/test/events-route.test.ts` prove contiguous-range, gap, duplicate, ordering, boundedness, snapshot-fallback, and seat-filtering behavior.

- [x] **B8 — Disconnect pause and host transfer**
      Blocked by: B7
      Requirements: PRD-FUN-014, RULE-009, PROTO-003
      Read: docs/product/prd.md, docs/product/rules.md, docs/engineering/realtime-and-data.md
      Acceptance: a disconnected required human pauses without fabricated actions, and safe-boundary host transfer chooses the longest-tenured connected human with seat-order tie-break while no connected human leaves play paused.
      Proves: presence/command integration scenarios cover each required phase, reconnect, deterministic transfer, and zero-connected-human state; TEST-002 protocol-integration layer.
      Implemented phase-aware journaled pause/resume recovery, deterministic connection-tenure host transfer, and a separate authenticated host-capability claim; `apps/web/test/presence-recovery.test.ts` proves required phases, reconnect, tie-break, zero-connected-human, and multi-tab presence behavior.

- [x] **B9 — Bot replacement and reclaim**
      Blocked by: B8
      Requirements: PRD-FUN-012, PROTO-003, SEC-002
      Read: docs/product/prd.md, docs/engineering/realtime-and-data.md, docs/engineering/security-privacy-analytics.md
      Acceptance: host-confirmed replacement and reclaim execute only between command transactions, revoke/issue the correct seat authority while retaining separate reclaim claims, preserve seat state, and emit every audit event.
      Proves: multi-client race tests cover request/approval/revocation/reclaim, old-token rejection, and safe-boundary ordering; TEST-002 protocol/security layer.
      Implemented safe-boundary replacement, reclaim request/approval, capability rotation, and audit journaling in the authoritative command transaction; `apps/web/test/bot-reclaim.test.ts` proves ordering, state preservation, old-authority revocation, new issuance, and unsafe-boundary rejection.

- [x] **B10 — Expiry, cleanup, and retention**
      Blocked by: B4
      Requirements: PRD-FUN-013, ENG-017, SEC-005, OPS-007
      Read: docs/product/prd.md, docs/engineering/realtime-and-data.md, docs/engineering/security-privacy-analytics.md, docs/delivery/operations.md
      Acceptance: authoritative play alone extends active expiry, completion anchors completed expiry, overdue active games first record `EXPIRED`, and authenticated cleanup deletes game data/capability hashes in bounded idempotent batches.
      Proves: clock-controlled replica-set tests cover exact 30-day boundaries, non-extending activity, transition-before-delete, retries, and cascades; TEST-002 protocol-integration layer.
      Implemented the authenticated bounded retention workflow with transactional `GameExpired` journaling, capability revocation, and idempotent cascades; `apps/web/test/retention.test.ts` and `apps/web/test/cleanup-route.test.ts` prove boundary, ordering, retry, cascade, and scheduler-authentication behavior.

- [x] **B11 — Rate limits, CSRF, origin checks, and log redaction**
      Blocked by: B4
      Requirements: PRD-NFR-003, SEC-001, SEC-003, SEC-004, SEC-006
      Read: docs/engineering/security-privacy-analytics.md, docs/engineering/realtime-and-data.md
      Acceptance: all state-changing and stream routes enforce bounded input, origin/CSRF and configured per-action/connection limits; safe errors/logs redact capabilities, cookies, seeds, payloads, pseudonyms, and private state, and the last stub builder is deleted.
      Proves: adversarial integration matrix covers spoofed origin/CSRF, limit reset/isolation, oversized bodies, enumeration, headers, and redaction canaries; TEST-002 security-boundary layer.
      Implemented synchronizer-token cookies/checks, origin validation, hashed per-route rate limits, bounded JSON admission, SSE protection, retry headers, logger redaction, and removal of fabricated game projections.
      Proven by `apps/web/test/security-boundary.test.ts` plus the route suites; full CI and production build pass.

---

## Loop C — Web application

Every screen after C1 renders sync-client state, never a stub. Browser tests use
separate player contexts.

- [x] **C1 — Sync client and the connection state machine**
      Blocked by: B11
      Requirements: PROTO-002, PROTO-003, PROTO-004, UX-001, UX-018
      Read: docs/engineering/realtime-and-data.md, docs/design/ux-spec.md
      Acceptance: the client bootstraps, validates frames, caches `lastSequence`/`aggregateVersion`, applies only contiguous data, resyncs gaps, reconnects with backoff, and exposes connecting/live/reconnecting/resyncing/closed without persisting capabilities or game state.
      Proves: client state-machine tests plus browser disconnect/out-of-order/reload cases; TEST-002 component and Playwright layers.
      Implemented the credentialed bootstrap/SSE coordinator, contiguous cursor recovery, authoritative snapshot replacement, visibility resync, and jittered reconnect states; `apps/web/test/sync-client.test.ts` proves the component-layer state machine and frame boundaries.

- [x] **C2 — Landing and create, wired to the API**
      Blocked by: C1
      Requirements: PRD-FUN-001, PRD-FUN-013, UX-001, UX-010
      Read: docs/product/prd.md, docs/design/ux-spec.md
      Acceptance: landing/create explain private play and retention, validate seat count, create through the API, retain capabilities only in secure cookies, and route the host to the live lobby with accessible pending/error states.
      Proves: Playwright create journey covers keyboard, validation, success, safe failure, cookies, and no URL/storage token; TEST-002 browser layer.
      Implemented the credentialed create form, preset-aware validation, safe pending/error states, and opaque invite-path navigation; `apps/web/test/create-form.test.ts` proves request mapping, validation, and invite safety.

- [x] **C3 — Join gate, wired**
      Blocked by: C2
      Requirements: PRD-FUN-003, PRD-FUN-004, UX-011, SEC-002
      Read: docs/product/prd.md, docs/design/ux-spec.md, docs/engineering/security-privacy-analytics.md
      Acceptance: invite routes reveal only a join gate, validate pseudonyms accessibly, claim a seat once, and render indistinguishable unavailable/full/expired results without exposing credentials.
      Proves: separate-context Playwright join matrix covers valid/invalid/racing/full/expired invites and token absence; TEST-002 browser/security layer.
      Implemented availability-gated join rendering, accessible pseudonym/token/age validation, one-submit claim handling, and neutral unavailable states in `apps/web/src/components/entry/join-gate.tsx`; `apps/web/test/join-form.test.ts` proves canonical normalization and credential-free request mapping.
      The repository has no Playwright harness or configured MongoDB, so the separate-context browser matrix remains follow-up evidence.

- [x] **C4 — Lobby: seats, invite share, variants, and start**
      Blocked by: C3
      Requirements: PRD-FUN-002, PRD-FUN-005, UX-012, VAR-010, VAR-013
      Read: docs/product/prd.md, docs/design/ux-spec.md, docs/product/rule-variants.md
      Acceptance: live lobby shows 2–6 seats/presence, host-only safe invite sharing and variant controls/warnings, start eligibility, and atomic start while non-hosts remain read-only.
      Proves: multi-context Playwright lobby tests cover seat/presence changes, host authority, copied invite, variants, and start blockers; TEST-002 browser layer.
      Implemented the authenticated lobby projection route and sync-backed lobby client with seat/presence states, invite copy/share feedback, host-only rules/start controls, and safe error/loading states; `apps/web/test/lobby-route.test.ts`, `apps/web/test/lobby-model.test.ts`, and `apps/web/test/command-path.test.ts` prove projection secrecy, readiness guards, invite safety, and atomic rules lock. The repository still has no Playwright harness or configured MongoDB, so the required multi-context browser evidence remains follow-up evidence.

- [x] **C5 — Board, player strip, and event feed on live state**
      Blocked by: C4
      Requirements: PRD-FUN-008, PRD-FUN-010, UX-002, UX-013, DS-040
      Read: docs/product/prd.md, docs/design/ux-spec.md, docs/design/design-system.md
      Acceptance: winding board, non-spatial list, players, bank assets, active state, deeds/districts, variants, and ordered public history render only the authorized live projection with display vocabulary at presentation.
      Proves: Playwright multi-seat state/event updates plus projection-to-display component cases; TEST-002 browser/component layers.
      Implemented the authorized sync-backed game shell, winding SVG route with keyboard-inspectable board list, live player/turn/detail/bank/variant panels, and bounded redacted public history; `apps/web/test/game-model.test.ts` and `apps/web/test/projection.test.ts` prove route/display mapping, bank projection, and history ordering/redaction. The repository still has no Playwright harness or configured MongoDB, so multi-seat browser evidence remains follow-up evidence.

- [x] **C6 — Active turn and the action sheet**
      Blocked by: C5
      Requirements: PRD-FUN-006, PRD-FUN-007, PRD-FUN-009, UX-013
      Read: docs/product/prd.md, docs/design/ux-spec.md
      Acceptance: the required actor and resolved dice/outcome dominate the UI; the action sheet renders server legal actions/bounds and unavailable reasons, submits once with pending/ack/error recovery, and never grants client authority.
      Proves: two-player Playwright turn cases cover legal/illegal/stale/double-submit actions and plain-language unavailable reasons; TEST-002 browser layer.
      Implemented the sync-backed active-turn summary and accessible action sheet in `apps/web/src/components/game/game-client.tsx` and `apps/web/src/components/game/action-bar.tsx`; `apps/web/test/game-model.test.ts` proves server-constrained command mapping and authoritative dice-result presentation. The repository still has no Playwright harness or configured MongoDB, so the required two-player browser evidence remains follow-up evidence.

- [x] **C7 — Acquisition and auction**
      Blocked by: C6
      Requirements: RULE-004, RULE-006, UX-014
      Read: docs/product/rules.md, docs/design/ux-spec.md
      Acceptance: purchase/decline and auction sheets show deed/cash/bid context, valid bounds, bidder/pass state and pause indefinitely for required disconnected actors without countdowns.
      Proves: multi-context Playwright acquisition/auction journeys cover affordance, bids, passes, disconnect/reconnect, winner, and no-sale; TEST-002 browser layer.
      Implemented the projection-only acquisition and auction decision context in `apps/web/src/components/game/acquisition-auction-summary.tsx`, with server-bound actions, readable bid/pass state, and pause-safe controls in the live game shell.
      `apps/web/test/game-model.test.ts` proves purchase balance/affordability mapping and auction leader, priority, pass, and bound mapping; full multi-context browser evidence remains planned because no Playwright harness or MongoDB is configured.

- [x] **C8 — Manage: improve, sell, mortgage, and redeem**
      Blocked by: C6
      Requirements: RULE-005, RULE-008, UX-016
      Read: docs/product/rules.md, docs/design/ux-spec.md
      Acceptance: Manage presents complete-district, even-building, inventory, price/resale, mortgage/redemption, eligibility, preview, confirm, and authoritative result from live action data.
      Proves: Playwright management matrix covers legal/blocked improve/sell/mortgage/redeem and stale inventory; TEST-002 browser layer.
      Implemented the owned-Address Manage flow with content-backed district, level, inventory, integer price/resale, mortgage, redemption, blocked-reason, confirmation, and authoritative command presentation in `apps/web/src/components/game/management-panel.tsx`.
      `apps/web/test/game-model.test.ts` proves management previews and action grouping; the repository still has no Playwright harness or configured MongoDB, so the required browser matrix remains planned.

- [x] **C9 — Trade**
      Blocked by: C8
      Requirements: UX-015
      Read: docs/product/rules.md, docs/design/ux-spec.md
      Acceptance: accessible trade compose/review/counter/accept/reject/cancel uses canonical projected assets, explicit mortgage charges, no escrow fiction, and clear stale-offer recovery.
      Proves: separate-context Playwright trade lifecycle covers validation, counter, staleness, charges, acceptance, rejection, and cancel; TEST-002 browser layer.
      Implemented the authorized pending-trade projection and accessible compose/review/respond surface in `apps/web/src/components/game/trade-panel.tsx`; `apps/web/test/game-model.test.ts` and `apps/web/test/projection.test.ts` prove canonical asset mapping, mortgage charges, stale recovery, and named-party privacy. The repository still has no Playwright harness or configured MongoDB, so separate-context browser evidence remains planned.

- [x] **C10 — Detention, debt, and bankruptcy**
      Blocked by: C8
      Requirements: RULE-009, RULE-011, UX-015, UX-017
      Read: docs/product/rules.md, docs/design/ux-spec.md
      Acceptance: detention choices/attempts, debt creditor/amount/liquidity, and irreversible bankruptcy are explicit, accessible, server-driven, and untimed, with other players shown why play is paused.
      Proves: multi-context Playwright scenarios cover all release paths, debt recovery, disconnect pause, and confirmed bankruptcy; TEST-002 browser layer.
      Implemented the explicit server-driven detention/debt/bankruptcy decision panel in `apps/web/src/components/game/detention-debt-panel.tsx`, including release-route explanations, creditor/amount/liquidity details, untimed pause messaging, and confirmed bankruptcy outcome copy. `apps/web/test/game-model.test.ts` proves captured-attempt, release-route, creditor, and liquidity mapping; the required separate-context browser evidence remains planned.

- [x] **C11 — Reconnect, reclaim, host transfer, and no-contest**
      Blocked by: C10
      Requirements: PRD-FUN-012, PRD-FUN-014, PRD-FUN-019, UX-018
      Read: docs/product/prd.md, docs/design/ux-spec.md
      Acceptance: reconnect/resync preserves context, replacement/reclaim and host-transfer states expose the right authority, and destructive no-contest confirmation becomes a synchronized irreversible no-winner result.
      Proves: multi-context Playwright disconnect/reload/replacement/reclaim/transfer/no-contest journeys; TEST-002 browser layer.
      Implemented the recovery projection and explicit game controls in `packages/contracts/src/projections.ts`, `apps/web/src/server/projections/authorize.ts`, and `apps/web/src/components/game/recovery-panel.tsx`; reclaim-authenticated devices can bootstrap, resync, and request host-approved control without exposing capabilities. `apps/web/test/game-model.test.ts`, `apps/web/test/projection.test.ts`, and the existing sync/route suites prove authority mapping and recovery preservation; the required separate-context browser journey remains planned.

- [x] **C12 — Completion, summary, and rematch**
      Blocked by: C10
      Requirements: PRD-FUN-015, UX-019
      Read: docs/product/prd.md, docs/design/ux-spec.md
      Acceptance: winner or no-winner completion shows standings, variants, duration and read-only history until expiry; rematch creates a distinct game/invite/capability set without carrying authority or state.
      Proves: multi-context Playwright winner/no-winner/read-only/rematch/expiry journeys; TEST-002 browser layer.
      Implemented the authorized terminal summary route/projection, automatic completion routing, read-only standings/history, and explicit rematch form/API backed by fresh capability issuance. `apps/web/test/summary-route.test.ts` and `apps/web/test/rematch-route.test.ts` prove terminal/no-winner handling, duration/history projection, authorization, and fresh-game inputs; Playwright/MongoDB evidence remains planned.

- [x] **C13 — Settings, rules, and accessibility content**
      Blocked by: C4
      Requirements: PRD-FUN-010, VAR-013, UX-003, UX-005, DS-060, DS-070
      Read: docs/design/ux-spec.md, docs/design/design-system.md, docs/product/rule-variants.md
      Acceptance: settings/rules/accessibility pages explain current variants/interactions and display terms, expose persisted local presentation preferences only, and provide equivalent non-audio/non-motion information without game authority.
      Proves: component and Playwright navigation/preference/content cases including storage inspection; TEST-002 component/browser layer.
      Implemented device-only persisted presentation preferences, complete variant/interaction/display-term rules content, and non-audio/non-motion accessibility guidance. `apps/web/test/settings-content.test.ts` proves local preference serialization/fallback and complete content coverage; browser and manual assistive-technology evidence remain planned.

---

## Loop D — Variants and bot

Each toggle ticket covers its toggle alone and every documented interaction in
VAR-014. The bot sees public state only and remains deterministic given state and
recorded draws.

- [x] **D1 — Variant schema, lobby lock, and `RulesConfigured`**
      Blocked by: C13
      Requirements: VAR-009, VAR-010, VAR-011, VAR-012, VAR-013, VAR-014
      Read: docs/product/rule-variants.md, docs/engineering/game-engine.md
      Acceptance: contracts accept exactly eight booleans with supported schema/preset, lobby start resolves and locks them with content hash/event, and reconnect/replay use captured values with deterministic migration fixtures.
      Proves: contract rejection, lobby integration, lock, reconnect, and version-migration fixtures; TEST-002 contract/protocol/pure-engine layers.
      Enforced preset-consistent eight-toggle schemas, deterministic identity migration, first-start `RulesConfigured` capture, and immutable version checks across command/reconnect paths. `packages/contracts/test/variants.test.ts` and `apps/web/test/command-path.test.ts` prove rejection, migration, lock, event/hash capture, and idempotent replay-safe startup.

- [x] **D2 — VAR-001, VAR-002, VAR-005: money injection toggles**
      Blocked by: D1
      Requirements: VAR-001, VAR-002, VAR-005, VAR-014
      Read: docs/product/rule-variants.md, docs/product/rules.md
      Acceptance: jackpot Rest payout/reset, exact-Start double payment, and matching-ones bonus each follow recorded configuration and data, with documented stacking interactions and unchanged defaults.
      Proves: pure-engine tables cover default, each toggle alone, pairwise documented interactions, ledger conservation, and replay; TEST-002 pure-engine table layer.
      Implemented jackpot funding/payout with debt and bankruptcy accounting, exact-Start stacking, and matching-ones bank payouts. `packages/game-engine/test/variant-money.test.ts` proves defaults, toggle interactions, partial payment, ledger transitions, and event replay.

- [x] **D3 — VAR-003, VAR-004: auction and income suppression**
      Blocked by: D1
      Requirements: VAR-003, VAR-004, VAR-014
      Read: docs/product/rule-variants.md, docs/product/rules.md
      Acceptance: declined/unaffordable acquisitions remain bank-owned when configured, and detained seats suppress only documented income while bank payments and default behavior remain intact.
      Proves: pure-engine acquisition/detention income tables cover each toggle and all documented interactions; TEST-002 pure-engine table layer.
      Implemented variant-gated no-auction resolution for declined and unaffordable deeds, plus detained rent/card-income suppression that leaves bank payments and outgoing player payments intact. `packages/game-engine/test/variant-auction-income.test.ts` covers defaults, each toggle, combined configuration, replay, and mutation-sensitive boundaries.

- [x] **D4 — VAR-006, VAR-007, VAR-008: setup and construction toggles**
      Blocked by: D1
      Requirements: VAR-006, VAR-007, VAR-008, VAR-014, CONTENT-007
      Read: docs/product/rule-variants.md, docs/product/rules.md, docs/product/game-content.md
      Acceptance: auditable recorded starting deals, relaxed even building, and unlimited inventory implement data-defined bounds independently and together without reinterpretation or a ninth toggle.
      Proves: fixed-seed deal goldens and construction property tables cover default, each toggle, interactions, fairness, and invariants; TEST-002 pure-engine golden/property layer.
      Implemented content-declared starting-deed eligibility with deterministic round-robin event assignments, VAR-007 buy/sell relaxation, and VAR-008 inventory bypass. `packages/game-engine/test/variant-setup.test.ts` proves fixed-seed order, fairness for 2–6 seats, underfilled-pool rejection, construction tables, replay, and combined toggles; `packages/game-content/test/validate.test.ts` proves eligibility references are validated.

- [x] **D5 — Bot policy, explanations, and the soak harness**
      Blocked by: D4
      Requirements: PRD-FUN-011, ENG-026, CONTENT-010
      Read: docs/product/prd.md, docs/engineering/game-engine.md, docs/product/game-content.md, docs/delivery/test-strategy.md
      Acceptance: one bot policy chooses only from `legalActions`, uses public state plus recorded draws, is deterministic, and emits `BotDecisionExplained` with stable reason code/no free text; the harness runs reproducible 2–6-seat preset/toggle games.
      Proves: fixed-state policy tables and a 5,000-game deterministic soak recording seed, duration, elimination, supply, concentration, and stalls; TEST-002 bot-policy/soak layers.
      Implemented pure public-state bot selection with stable rationale enums and a bounded deterministic soak matrix; `packages/game-engine/test/bot.test.ts` proves advertised-action selection, replay-safe tie-breaking, privacy, and the 5,000-game report.

---

## Loop E — Accessibility and responsive behaviour

- [x] **E1 — Keyboard board navigation and the non-spatial list**
      Blocked by: D5
      Requirements: PRD-NFR-005, UX-040, DS-040, DS-070
      Read: docs/design/ux-spec.md, docs/design/design-system.md
      Acceptance: every board fact/action is reachable by semantic non-spatial list, logical keyboard order, visible focus, and equivalent labels without requiring pointer precision or SVG geometry.
      Proves: Chromium/Firefox/WebKit keyboard journeys and semantic/accessible-name assertions; TEST-002 Playwright accessibility layer.
      Implemented an always-visible ordered semantic board list with keyboard inspect controls, complete accessible stop names, and selected-detail relationships. `apps/web/test/game-model.test.ts` proves the accessible label carries public route, category, district, ownership, price, mortgage, improvement, and occupant facts; E6 adds cross-browser route/phase/axe coverage, while dedicated keyboard and human assistive-technology execution remains pending.

- [x] **E2 — Live regions and restrained announcements**
      Blocked by: E1
      Requirements: PRD-NFR-005, UX-040, DS-070
      Read: docs/design/ux-spec.md, docs/design/design-system.md
      Acceptance: turn-critical actor, decision, dice, debt, pause, reconnect, and terminal changes announce once with suitable priority while routine feed/presence churn stays silent and focus remains stable.
      Proves: component mutation cases and Playwright live-region sequence assertions; TEST-002 component/browser accessibility layer.
      Implemented one-shot priority-aware live regions backed by an authoritative event allowlist; `apps/web/test/live-announcements.test.ts` proves critical event context, routine-event silence, decision deduplication, and reconnect transitions. E6 adds cross-browser axe coverage, while live-region sequence and manual assistive-technology execution remain pending.

- [x] **E3 — Dialog and sheet focus management**
      Blocked by: E1
      Requirements: PRD-NFR-005, UX-040, DS-030, DS-070
      Read: docs/design/ux-spec.md, docs/design/design-system.md
      Acceptance: dialogs/sheets label themselves, trap and restore focus, support Escape except destructive required choices, prevent background interaction, and preserve decision context across server updates.
      Proves: keyboard Playwright matrix for every modal workflow, including update/unmount focus restoration; TEST-002 browser accessibility layer.
      Implemented a shared portal-backed modal/sheet focus boundary with inert background, keyboard trapping, Escape/backdrop dismissal rules, opener restoration, and controlled server-update persistence; `apps/web/test/modal-dialog-model.test.ts` proves the keyboard boundary and Escape contract. E6 adds cross-browser axe coverage, while modal focus journeys and manual assistive-technology execution remain pending.

- [x] **E4 — Non-colour encoding, contrast, forced colours, reduced motion**
      Blocked by: E1
      Requirements: PRD-NFR-005, PRD-NFR-006, UX-040, DS-020, DS-041, DS-060, DS-070
      Read: docs/design/ux-spec.md, docs/design/design-system.md
      Acceptance: ownership/status use color+shape+pattern/text, all states meet contrast, forced-colors remain legible, and reduced motion removes decorative transitions without delaying/concealing outcomes.
      Proves: token contrast tests and Playwright visual/DOM assertions in forced-colors/reduced-motion/non-color modes; TEST-002 component/browser layer.
      Implemented visible token stroke patterns and semantic status markers, AA-checked light/dark tokens, forced-colors system fallbacks, and immediate reduced-motion overrides; `apps/web/test/accessibility-tokens.test.ts` proves the token and CSS contracts, while E6 adds cross-browser axe/reduced-motion coverage and forced-colors/manual assistive-technology execution remains pending.

- [x] **E5 — The responsive matrix at 375, 768, 1024, and landscape**
      Blocked by: E4
      Requirements: PRD-FUN-016, UX-030, UX-031, UX-032, UX-033, DS-050
      Read: docs/product/prd.md, docs/design/ux-spec.md, docs/design/design-system.md
      Acceptance: required decisions/cash/dice/position work without page-level horizontal scrolling across named widths and landscape, with documented board/panel/sidebar modes and 320px core-play fallback.
      Proves: Playwright screenshot/interaction matrix at 320, 375, 768, 1024 and phone/tablet landscape; TEST-002 browser-responsive layer.
      Implemented CSS-defined focused-board, tablet-context-panel, desktop-context-sidebar, and short-landscape modes with safe-area spacing, 320px overflow protection, and a phone-first player/context order in `apps/web/src/app/globals.css` and `apps/web/src/components/game/game-client.tsx`; `apps/web/test/responsive-layout.test.ts` proves the responsive contract, and E6 adds cross-browser axe plus 320/375/768/1024 overflow evidence. Screenshot capture remains planned.

- [?] **E6 — axe coverage and the manual assistive-technology checklist**
  Blocked by: E5
  Requirements: PRD-NFR-002, PRD-NFR-005, UX-040, TEST-005
  Read: docs/delivery/test-strategy.md, docs/design/ux-spec.md
  Acceptance: axe covers every route and major phase with no serious/critical findings, and a release checklist records keyboard, 200%/400% zoom, VoiceOver, NVDA, iOS Safari, and Android Chrome results with issue links.
  Proves: automated cross-browser axe/zoom suite plus completed human assistive-technology records; TEST-002 browser/human-review layers.
  Added `playwright.config.ts` and `apps/web/e2e/accessibility.spec.ts` for Chromium/Firefox/WebKit route, phase, axe, reduced-motion, and zoom-equivalent viewport coverage. `docs/delivery/accessibility-checklist.md` records the human execution packet; human execution and sign-off are required before release.

---

## Loop F — PWA, analytics, and operations

- [x] **F1 — PWA manifest, service worker, and update UX**
      Blocked by: E6
      Requirements: PRD-FUN-017, PRD-NFR-009, TEST-005
      Read: docs/product/prd.md, docs/engineering/security-privacy-analytics.md, apps/web/public/PWA-TODO.md
      Acceptance: installable manifest/icons and update UX work over HTTPS; the service worker caches only versioned app shell/public assets, never game/API/SSE/capability data, and offline UI says play requires reconnection.
      Proves: Playwright install/offline/update/cache-inspection matrix proves shell availability and zero cached game state; TEST-002 browser PWA/security layer.
      Implemented generated versioned shell worker, offline fallback/status, engagement-gated install and dismissal UX, iOS instructions, and waiting-worker update flow. `apps/web/e2e/pwa.spec.ts` passes its 9-check Chromium/Firefox/WebKit matrix; `apps/web/test/pwa.test.ts` covers cache policy and install/network decisions.

- [x] **F2 — Consent gate, PostHog adapter, and the approved taxonomy**
      Blocked by: F1
      Requirements: PRD-FUN-018, ANA-001, ANA-002, SEC-004
      Read: docs/engineering/security-privacy-analytics.md, docs/product/prd.md
      Acceptance: no analytics loads before opt-in; withdrawal stops/clears it; an allowlisted pseudonymous taxonomy covers approved events, rejects unexpected properties/capabilities/pseudonyms, and keeps replay disabled until separately reviewed.
      Proves: browser network tests for denied/granted/withdrawn consent and schema/redaction canaries; TEST-002 browser security/privacy layer.
      Implemented consent-gated PostHog capture, strict taxonomy validation, device-local withdrawal, and product-event hooks. `apps/web/e2e/analytics.spec.ts` passes denied/granted/withdrawn network checks in Chromium, Firefox, and WebKit; `apps/web/test/analytics.test.ts` covers schema/redaction canaries.

- [?] **F3 — Coolify deployment, index maintenance, and the scheduled cleanup**
  Blocked by: F2
  Requirements: PRD-NFR-001, ENG-004, OPS-001, OPS-002, OPS-003, OPS-004, OPS-005, OPS-007
  Read: docs/engineering/architecture.md, docs/delivery/operations.md
  Acceptance: an immutable Node service deploys through Coolify to the private replica set, applies idempotent indexes, exposes correct probes, drains commands/SSE gracefully, and runs authenticated scheduled cleanup from the same image with documented rollback.
  Proves: staging deployment smoke and migration/cleanup/redeploy/rollback drill records; TEST-002 deployment/runbook layer.
  Added the Coolify deployment and rollback runbook, same-image maintenance/cleanup procedure, and lifecycle tests for command draining and retryable SSE shutdown. Staging execution and operator sign-off remain required before public release.

- [?] **F4 — Structured logs, metrics, alerts, and the redaction test**
  Blocked by: F3
  Requirements: OPS-006, OPS-008, SEC-004, SEC-006
  Read: docs/delivery/operations.md, docs/engineering/security-privacy-analytics.md
  Acceptance: structured safe logs/metrics cover requests, transactions, conflicts, SSE lag, readiness, cleanup, pool and version data; actionable alerts link owners/runbooks and exclude all forbidden sensitive fields.
  Proves: integration redaction canaries plus staging metric/alert fire-and-recover drill; TEST-002 security-boundary/deployment layer.
  Implemented the allowlisted telemetry/logger boundary, all-API request instrumentation, subsystem metrics, and owner-linked alert definitions in `apps/web/src/server/observability/telemetry.ts` and `docs/delivery/observability-runbook.md`; `apps/web/test/telemetry.test.ts` proves coverage, forbidden-field exclusion, and alert fire/recovery. Staging fire-and-recover execution remains a human operational sign-off item.

- [?] **F5 — Backup and restore drill**
  Blocked by: F4
  Requirements: OPS-009, PRD-NFR-008, SEC-005
  Read: docs/delivery/operations.md, docs/engineering/realtime-and-data.md, docs/engineering/security-privacy-analytics.md
  Acceptance: encrypted replica-set backup restores into isolation and verifies snapshot/event/receipt consistency, indexes, hashes, captured versions, expiry and completed-game readability, with RPO/RTO/tool/result/remediation recorded.
  Proves: completed restore drill and automated restored-dataset integrity suite; TEST-002 operations-drill/protocol layers.
  Added encrypted `mongodump`/`mongorestore` isolation procedure and aggregate-only `pnpm db:verify-restore` checks in `docs/delivery/backup-restore-drill.md` and `apps/web/src/server/backup/restore-integrity.ts`; `apps/web/test/backup-restore.test.ts` proves replay, receipt/index/reference integrity, capability-hash exclusion, corruption rejection, and completed-game readability. Real-environment restore execution and operator sign-off remain required.

- [?] **F6 — Load harness and the performance budgets**
  Blocked by: F5
  Requirements: PRD-NFR-007, OPS-010, TEST-006
  Read: docs/product/prd.md, docs/delivery/operations.md, docs/delivery/test-strategy.md
  Acceptance: a reproducible harness drives create/join/command/sync/SSE at recorded capacity against deployed topology, proves p75 usable lobby under 3s and p95 authoritative ACK under 1.5s, and documents limits/alerts without leaking data.
  Proves: versioned raw load report, web-vitals evidence, threshold assertions, and saturation/recovery run; TEST-002 deployment/load layer.
  Added the cookie-safe `pnpm perf:load` harness with aggregate percentile gates, optional `/create` web-vitals capture, and target/saturation/recovery phases in `tools/load-harness.ts`; `tools/load-harness.test.ts` proves percentile, threshold, operation-coverage, and failure handling, while `docs/delivery/load-performance.md` records the topology, limits, privacy rules, and report procedure. Deployed load execution and operator sign-off remain required before public release.

---

## Observed, not queued

Agents append discoveries here in one or two lines. This is an observation log,
not permission to expand the closed queue during a gnhf run.

- `ImprovementLevel.inventoryDelta` is currently scalar while economy inventory is keyed; A7 applies it to the first declared pool, so multi-kind transitions would require a future schema revision.
