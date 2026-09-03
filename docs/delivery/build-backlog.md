# Build backlog

**ID:** MILE-012
**Status:** the closed, dependency-ordered work queue for autonomous agents
**Consumed by:** [gnhf prompt](../gnhf-prompt.md), driven by [gnhf CLI](../gnhf-cli.md)

This file is the single source of truth for what an agent builds next. It turns
the milestones in [Roadmap](roadmap.md) into 62 tracer-bullet tickets. Each ticket
cuts a narrow but complete path through the layers it touches, and each one is
sized to fit in one fresh context window.

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

| Mark | Meaning |
|---|---|
| `[ ]` | Unclaimed. Available if every blocker is `[x]` or `[?]`. |
| `[~]` | Claimed by the current iteration. |
| `[x]` | Done. Implemented, tested, `pnpm ci` green, committed. |
| `[!]` | Blocked or rejected. Two sentences saying why, and which ticket blocks it. |
| `[?]` | Done and committed, but a human must review it before public release. |

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

If you believe your claimed ticket is wrong, already done, or not worth doing, do
not redefine it. Mark it `[!]`, write why in two sentences, and take the next
available ticket in the same loop.

Without this rule the backlog grows faster than you drain it and the run never
ends.

## What done means here

A ticket is `[x]` when all of the following are true:

1. The behaviour in its **Acceptance** line works end to end. Not the layer below
   it, not a stub, not a TODO.
2. A test proves the acceptance line, written at the layer that `TEST-002` in
   [test strategy](test-strategy.md) assigns to that ticket's requirement family.
3. That test has been **mutated and confirmed**: you broke the code it protects,
   watched it fail, and restored the code. A test that passes against broken code
   gets rewritten, not committed.
4. `pnpm ci` passes with no errors and no warnings.
5. Every requirement ID on the ticket's **Requirements** line has its row in
   [traceability](../traceability.md) updated in the same commit.
6. The work is committed. gnhf discards uncommitted changes.

Partial credit does not exist. A ticket that compiles but does not do the thing is
`[!]`, not `[x]`.

## Ticket anatomy

```md
- [ ] **X0 — Example, not a real ticket**
  Blocked by: X-previous
  Requirements: the bounded IDs this ticket implements
  Read: only the documents this ticket needs
  Acceptance: what must observably work when this ticket is done.
```

`X0` is illustrative. The real tickets start at 0.0.

**Read** is a budget, not a suggestion. This repository holds twenty normative
documents and they do not fit in one context window together. Load the documents
the ticket names. Load another only when the work sends you there for something
specific.

**Acceptance** is the whole specification. If your plan satisfies something else,
the plan is wrong.

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

Nothing else can start until this loop is green. 0.1 is a prefactor: every later
ticket proves itself with `pnpm ci`, so the pipeline exists before the code does.
0.4 through 0.6 gate the engine, because the reducer cannot be tested without a
content bundle to read.

- [ ] **0.0 — Record the settled-name decision and unblock implementation**
  Blocked by: none (can start immediately)
  Requirements: BRAND, LEGAL-005, MILE-002, MILE-011
  Read: docs/brand/naming.md, docs/brand/brand-strategy.md, docs/legal/ip-safety.md
  Acceptance: the project owner has decided that **Blockparty** is the adopted
  name and that MILE-002 no longer blocks implementation. Apply that decision as
  recorded fact across the documentation. You are transcribing an owner decision,
  not making a legal judgement of your own.
  - `docs/brand/naming.md`: the decision record reads adopted, not "hold pending
    counsel". Remove the Civora fallback dependency, the "do not register domains,
    handles, or packages" bans, and the "use a neutral internal codename" rule.
    Keep the candidate pool, the scoring table, the two rejected naming patterns,
    and the known-collisions table as history.
  - `docs/brand/brand-strategy.md`: remove the "provisional mark, not cleared"
    banner and the "every design and content choice must survive a name change"
    constraint. Keep positioning, voice, the display-layer mapping, and the
    mandatory board guardrail.
  - `docs/legal/ip-safety.md`: remove the Blockparty-specific pre-clearance
    controls in the trademark section. **Keep** LEGAL-002 original expression,
    LEGAL-006 provenance, the risk matrix, the contributor provenance table, the
    license-layer separation, and the no-square-grid rule. Those are product
    quality rules, not gates.
  - `docs/design/design-system.md` DS-001 and `docs/product/glossary.md` header:
    drop "provisional, uncleared" and the Civora fallback sentence.
  - `AGENTS.md` and `docs/README.md`: MILE-002 is no longer a hard gate before
    MILE-003. Remove the pre-implementation gate list. Replace the "Repository
    state" paragraph with the current state and point at this backlog.
  - `docs/delivery/roadmap.md`: MILE-002 becomes a parallel workstream, not a
    blocker. **MILE-011 changes from `--worktree` to `--current-branch` on a
    dedicated build branch**, because a worktree cannot see the previous ticket's
    code and a dependency chain stalls after the first ticket. Add MILE-012
    pointing at this file.
  Acceptance test: `grep -rn "provisional\|not cleared\|hard gate" docs/ AGENTS.md`
  returns no result that still describes the name as unsettled or implementation
  as blocked.

- [ ] **0.1 — pnpm workspace, CI pipeline, and dependency-direction lint**
  Blocked by: 0.0
  Requirements: ENG-002, ENG-013, PRD-NFR-001, TEST-007
  Read: docs/engineering/architecture.md, docs/delivery/test-strategy.md
  Acceptance: `pnpm install` and `pnpm ci` both succeed on a clean checkout.
  `pnpm ci` runs format check, typecheck, lint, and Vitest in that order and fails
  the run on any error or warning. The workspace declares `apps/web`,
  `packages/contracts`, `packages/game-engine`, and `packages/game-content` as
  empty but buildable packages with TypeScript project
  references. A lint rule enforces the ENG-002 dependency table: adding an import
  of `mongodb` into a browser module, or of `node:fs` into
  `packages/game-engine`, fails `pnpm ci`. Prove that rule with a fixture the
  linter rejects, not with a comment.

- [ ] **0.2 — `packages/contracts`: money, versions, envelopes, and errors**
  Blocked by: 0.1
  Requirements: ENG-010, PROTO-001, PROTO-002, PRD-NFR-008
  Read: docs/engineering/realtime-and-data.md, docs/product/glossary.md
  Acceptance: the package exports Zod schemas and their `z.infer` types for the
  `Money` integer-minor-unit branded type, `stateSchemaVersion`,
  `contentVersion`, `protocolVersion`, the `CommandEnvelope` in PROTO-001, the
  server envelope shape, and the full PROTO-002 error-code union. Envelopes reject
  unknown fields. The package depends on Zod and nothing else. A test asserts that
  a float, a negative version, and an extra envelope key each fail validation, and
  that every PROTO-002 code has a schema member.

- [ ] **0.3 — `packages/game-content`: bundle schema, effect DSL, and validator**
  Blocked by: 0.2
  Requirements: CONTENT-001, CONTENT-003, CONTENT-009, ENG-024
  Read: docs/product/game-content.md, docs/product/rules.md
  Acceptance: the package defines the versioned bundle shape from CONTENT-001, the
  closed `ContentEffect` union exactly as printed in game-content.md, and a
  build-time validator that rejects every failure CONTENT-009 names: duplicate
  IDs, a missing route target, invalid district membership, a negative or
  non-integer value, an incomplete rent level, impossible inventory, an
  unrepresentable effect, an invalid card target, and out-of-bounds variant data.
  A deliberately broken fixture bundle fails validation with a message naming the
  offending ID. A minimal valid fixture bundle passes. The validator runs as part
  of `pnpm ci`.

- [?] **0.4 — Content v1.0.0 (a): route topology and spaces**
  Blocked by: 0.3
  Requirements: CONTENT-002, CONTENT-003, CONTENT-008, LEGAL-002
  Read: docs/product/game-content.md, docs/brand/brand-strategy.md, docs/legal/ip-safety.md
  Acceptance: an original route topology exists as validated content, with stable
  space IDs, route order and edges, a Start destination, a Detention destination,
  and a declared type plus effect queue for every space. Author it from the
  Blockparty brief in brand-strategy.md: a winding neighbourhood street with
  irregular street lengths, cul-de-sacs, corner turns, a small park, and Blocks of
  varying size. **A square perimeter, an even grid, or uniform edge spacing is a
  defect, whatever the spaces are called.** Do not consult, transcribe, or
  approximate any commercial board's space order or count. Record a CONTENT-008
  provenance entry naming the AI tool and version, the prompt, the inputs, and the
  fact that no third-party board was used as a source. Mark this ticket `[?]`, not
  `[x]`: a human signs the provenance before release.

- [?] **0.5 — Content v1.0.0 (b): deeds, Blocks, and economy constants**
  Blocked by: 0.4
  Requirements: CONTENT-004, CONTENT-005, CONTENT-007, CONTENT-008
  Read: docs/product/game-content.md, docs/product/rules.md, docs/product/rule-variants.md
  Acceptance: every purchasable space has an original deed with a name, a category
  of `district`, `transit`, or `utility`, a purchase value, a mortgage value, a
  transfer and a redemption charge, a rent formula or table by improvement level,
  and an improvement schedule where it applies. District membership is explicit
  and referentially valid. The economy defines starting cash, the Start payment,
  the Detention release fee and attempt count, improvement costs, resale rounding,
  finite inventory quantities, per-level inventory piece deltas, scarce-unit
  auction cost treatment, the currency label, and bank fees. Every value is an
  integer minor unit. Variant data supplies the jackpot-eligible fee set and the
  starting-asset deal count. Values come from your own reasoning about game
  length and pressure, never from a commercial rent table. Record provenance.
  Mark `[?]`.

- [?] **0.6 — Content v1.0.0 (c): decks and the provenance register**
  Blocked by: 0.5
  Requirements: CONTENT-006, CONTENT-008, CONTENT-010, LEGAL-002, LEGAL-006
  Read: docs/product/game-content.md, docs/brand/brand-strategy.md
  Acceptance: two decks exist — display names **Word of Mouth** and **Favors** —
  with independently authored card titles and text, weights or order rules,
  retainability, and validated effect queues using only the closed DSL. Card voice
  follows the Voice section of brand-strategy.md: wry, never cruel, no gambling
  framing. No card paraphrases, reorders, or preserves the distinctive wording of
  any third-party card. The bundle now validates end to end and its canonical hash
  is recorded. A provenance register lists every space, deed, and card asset with
  the CONTENT-008 fields filled in. Mark `[?]`.

---

## Loop A — Deterministic engine

`packages/game-engine` is a pure reducer. Every ticket in this loop is provable
with Vitest alone: no browser, no clock, no network, no database. Use fixed
seeds and record the seed when an assertion fails.

A1 through A5 form a straight chain. A6 through A13 each need the effect queue
from A2 and their own named predecessors, so several become available at once.

- [ ] **A1 — Engine seam, seeded PRNG, and replay determinism**
  Blocked by: 0.6
  Requirements: ENG-020, ENG-021, ENG-022, RULE-001, RULE-002, RULE-003
  Read: docs/engineering/game-engine.md, docs/product/rules.md
  Acceptance: the package exports `resolve`, `legalActions`, `actionAvailability`,
  and `replay` with the ENG-020 signatures. `GameState` carries every field ENG-021
  lists. Phases are a discriminated union. `StartGame` and `RollDice` work: start
  grants starting cash, sets player order from a recorded random draw with a
  deterministic tie-break, and places every player on Start; a roll emits
  `DiceRolled` with both faces. The seeded PRNG is a documented algorithm using
  fixed integer operations, implemented in TypeScript. A test replays a fixed seed
  through `replay` and gets a byte-identical event stream. A second test proves
  `replay` needs no PRNG, because outcomes live in the events. A third asserts the
  engine imports no Node API, no clock, and no `Math.random`.

- [ ] **A2 — Movement, Start crossing, and the serialized effect queue**
  Blocked by: A1
  Requirements: RULE-004, RULE-007, RULE-010, ENG-025, CONTENT-003
  Read: docs/product/rules.md, docs/engineering/game-engine.md
  Acceptance: a roll moves the player forward by the total and pays the Start
  amount once per crossing. Every landing and card builds an ordered effect queue
  from content and resolves it first to last. When an effect creates a choice, an
  auction, or an obligation, the engine serializes the remaining queue as a
  continuation and resumes exactly that queue after the blocking phase closes. A
  movement effect inserts the destination's queue immediately after the move.
  Backward movement never pays Start. `MoveTo` pays only when
  `collectStartWhenCrossed` is set and it crosses. `SendToDetention` never pays.
  Matching dice grant one extra turn; three consecutive matching rolls send the
  player to Detention with no movement from the third roll. Several players may
  share one space. A scenario test drives a card that both moves and charges, and
  asserts the ordering is queue order, not implementation order.

- [ ] **A3 — Acquisition and the bank ledger**
  Blocked by: A2
  Requirements: RULE-001, RULE-004, PRD-FUN-007, CONTENT-004
  Read: docs/product/rules.md
  Acceptance: landing on an unowned purchasable deed offers the active player
  `AcquireDeed` or `DeclineAcquisition` at the printed price, and only when they
  can pay immediately. Acquiring transfers cash to the bank and ownership to the
  player atomically, and emits an event carrying both legs. The bank keeps a
  separate ledger and inventory: it is always solvent for payments, owns every
  unpurchased deed, and may create or retire currency. A test proves cash never
  goes negative and that the bank ledger balances after a sequence of purchases.

- [ ] **A4 — Rent for district, transit, and utility**
  Blocked by: A3
  Requirements: RULE-003, RULE-004, CONTENT-004, CONTENT-005
  Read: docs/product/rules.md
  Acceptance: landing on a player-owned deed charges the data-defined rent.
  District rent reads from deed data by improvement level, and an unimproved deed
  in a complete unmortgaged district applies its complete-district multiplier. A
  district is not complete while any member is mortgaged. Transit rent is indexed
  by the owner's transit count. Utility rent is the roll total times the
  multiplier selected by utility count. A card that directs a player to a utility
  with a special multiplier uses a fresh recorded two-dice roll and that
  multiplier regardless of ownership count. A mortgaged deed charges zero. A
  player never pays rent to themselves. Every rent event records the formula
  inputs, the roll source, the basis, the multiplier, and the amount.

- [ ] **A5 — Deed auction**
  Blocked by: A4
  Requirements: RULE-001, RULE-009, ENG-025, PRD-FUN-007
  Read: docs/product/rules.md, docs/engineering/game-engine.md
  Acceptance: declining or being unable to afford an unowned deed opens an
  ascending auction starting at zero. Priority begins with the next non-eliminated
  seat after the landing player and rotates in seat order, including the player
  who declined. At priority a player bids an integer above the current bid and
  within current cash, or passes permanently. A passed player cannot bid again.
  The auction closes when the high bidder is the only non-passed seat; the winner
  pays the bank and receives the deed atomically. If everyone passes without a
  bid, the deed stays bank-owned. No credit, mortgage, or trade happens during
  bidding. **There is no timer**: a disconnected priority bidder leaves the
  auction paused. Tests cover priority rotation, the zero-bid outcome, a bid above
  cash being rejected, and the pause.

- [ ] **A6 — Improvements, even building, and inventory conservation**
  Blocked by: A2, A4
  Requirements: RULE-011, ENG-023, CONTENT-005
  Read: docs/product/rules.md
  Acceptance: improvements may be bought only on a complete unmortgaged district
  and only from finite bank inventory, one level at a time at the deed's cost. No
  deed in a district may exceed another by more than one level. Selling returns
  half the purchase cost rounded down, removes from a currently highest-level
  deed, and returns inventory immediately. Content defines the pieces each level
  transition consumes and returns, including the final landmark transition. A
  property test proves every inventory type is conserved across a long random
  sequence of buys and sells. A purchase blocked by zero inventory produces an
  `actionAvailability` entry with a reason code, not a silent failure.

- [ ] **A7 — Scarce improvement auction**
  Blocked by: A6
  Requirements: RULE-011, ENG-025
  Read: docs/product/rules.md, docs/engineering/game-engine.md
  Acceptance: in `MANAGE_OR_END` an eligible seat may declare a one-level
  improvement demand. When at least two declared demands together exceed available
  inventory, the bank auctions one unit at a time using the same ordered bidding
  primitive as A5, restricted to demanders whose target transition is still legal.
  The winner pays the winning bid plus any content-defined base cost and applies
  one legal level transition atomically. Remaining demand is revalidated after
  each unit. The flow stops when inventory or contested demand runs out. No
  auction runs at zero inventory. Tests cover the two-demander contest, an
  ineligible demand removed mid-flow, and inventory conservation throughout.

- [ ] **A8 — Mortgage, redeem, and transfer charge**
  Blocked by: A6
  Requirements: RULE-003, CONTENT-004, CONTENT-005
  Read: docs/product/rules.md
  Acceptance: a deed may be mortgaged only when it has no improvements and, for a
  district deed, no deed in its district has improvements. The bank pays the
  mortgage value. A mortgaged deed earns no rent and blocks complete-district
  status. Redeeming pays the bank the mortgage value plus the content-defined
  redemption charge with content-defined rounding. A transferred mortgaged deed
  stays mortgaged and its transfer charge becomes an obligation for the recipient.
  When that obligation cannot be resolved, the recipient enters bankruptcy
  normally and the deed follows that branch rather than becoming ownerless. Tests
  cover each blocked-mortgage reason and the unaffordable transfer charge.

- [ ] **A9 — Trades and staleness**
  Blocked by: A8
  Requirements: RULE-001, ENG-025, PRD-FUN-007
  Read: docs/product/rules.md, docs/engineering/game-engine.md
  Acceptance: a trade is a two-party proposal containing only presently held cash,
  whole deeds, and held Detention-release cards. No future promise, deferred
  consideration, partial deed, improvement, bank inventory, or obligation may be
  included. Only the named parties may respond. Acceptance revalidates ownership,
  cash, mortgage and improvement constraints, transfer charges, and active status,
  then transfers everything atomically; a changed prerequisite yields
  `TRADE_STALE`. Assets are not escrowed — they stay owned until acceptance. No
  trade is available during an auction or an unresolved card choice. Tests cover
  atomic acceptance, staleness after an intervening command, and rejection of
  every forbidden item type.

- [ ] **A10 — Cards, decks, and retained release cards**
  Blocked by: A2
  Requirements: RULE-002, RULE-004, CONTENT-006, ENG-022
  Read: docs/product/rules.md, docs/product/game-content.md
  Acceptance: each deck shuffles at start from recorded secure randomness. Drawing
  removes the top card. An ordinary card goes to that deck's discard after
  resolution, and the discard reshuffles only when the draw pile empties. A held
  release card leaves circulation until used, traded, or returned on holder
  bankruptcy. Card instructions resolve in printed data order and each monetary
  leg is a separate obligation unless the card data aggregates it explicitly.
  Tests cover money, movement, repair charge, Detention, release card, choice, and
  deck exhaustion. A golden fixture asserts the exact draw order for a fixed seed.

- [ ] **A11 — Detention**
  Blocked by: A10
  Requirements: RULE-001, CONTENT-005
  Read: docs/product/rules.md
  Acceptance: entering Detention sets detained turns to zero and ends the current
  movement or turn as applicable. At the start of each detained turn the player
  picks one legal route: use a held release card, pay the release fee, or attempt
  a matching roll. A matching attempt releases and moves by that roll. A failed
  attempt increments detained turns and ends the turn with no movement. After the
  configured maximum failed attempts the player must pay the fee if able, then
  roll and move; if unable, normal debt rules apply. The matching-roll extra-turn
  rule never applies to a release roll. A state-machine test covers every release
  route and the failed-attempt ceiling.

- [ ] **A12 — Obligation and debt**
  Blocked by: A9, A11
  Requirements: RULE-007, RULE-009, ENG-025, PRD-FUN-006
  Read: docs/product/rules.md, docs/engineering/game-engine.md
  Acceptance: money due is paid automatically when cash covers it. Otherwise the
  engine creates one visible obligation carrying creditor, amount, reason, and the
  serialized effect-queue continuation. While it stands, the only legal actions
  are selling improvements, mortgaging eligible deeds, and an immediate
  no-promise liquidity trade with an active solvent counterparty; received cash is
  immediately available to the obligation. The player cannot roll, end the turn,
  or decline the debt. **There is no debt timer.** Settlement resumes the exact
  stored continuation. A test interrupts a multi-effect card with a debt, settles
  it, and asserts the remaining effects resume in their original order.

- [ ] **A13 — Bankruptcy, elimination, endgame, and no-contest**
  Blocked by: A12
  Requirements: RULE-012, ENG-025, PRD-FUN-015, PRD-FUN-019
  Read: docs/product/rules.md, docs/engineering/game-engine.md
  Acceptance: when the engine proves no legal liquidation sequence can satisfy the
  obligation, the player is bankrupt. Before any deed moves, every improvement in
  each affected district sells to the bank under the canonical selling rule and
  its inventory returns. A player creditor receives all deeds and held release
  cards; deeds keep their mortgages and each transfer charge becomes the
  recipient's obligation, resolving their bankruptcy normally if unmet. A bank
  creditor receives deeds for auction one at a time and release cards return to
  their decks. Unpaid remainder is recorded as discharged for accounting only. The
  seat is eliminated and skipped by turns, trades, and auctions. One remaining
  player wins; none remaining ends with no winner and standings by elimination
  order. `EndNoContest` from the host records the prior phase, clears pending
  commands, sets terminal reason `NO_CONTEST`, declares no winner, and never
  substitutes for bankruptcy. Tests cover the player-creditor branch, the
  bank-creditor branch, and the unaffordable transfer charge.

- [ ] **A14 — Property invariants and golden replay fixtures**
  Blocked by: A5, A7, A13
  Requirements: ENG-023, ENG-028, TEST-003
  Read: docs/delivery/test-strategy.md, docs/engineering/game-engine.md
  Acceptance: a `fast-check` suite runs at least 1,000 generated legal command
  sequences and violates no invariant, retaining the seed on failure. The
  invariants are the ENG-023 list plus the TEST-003 list: exactly one
  phase-compatible priority actor outside lobby and finished; unique seat IDs and
  deed ownership; safe integer money that never goes negative; conserved
  inventory; coherent auction high bid with passed bidders locked out; escrow-free
  trades; no turn for an eliminated seat; the ledger, current state, and replayed
  event stream agreeing; and a finished game accepting no state-changing command.
  Golden fixtures pin exact dice, deck, and event streams for fixed seeds.
  **Golden fixtures are immutable** — add a new version rather than edit one.

---

## Loop B — Next.js server and protocol

Server-side modules in `apps/web` are the only callers of the engine. B5 is the
spine of this loop: one transactional command path that every later ticket goes
through. Tests here run against an ephemeral replica-set MongoDB, never a shared
database.

- [ ] **B1 — Next.js Route Handlers, health endpoints, schema, and document maintenance**
  Blocked by: A1
  Requirements: ENG-004, ENG-015, ENG-016, OPS-005
  Read: docs/engineering/realtime-and-data.md, docs/engineering/architecture.md
  Acceptance: the Next.js Node runtime serves `/api/health/live` for process
  liveness and `/api/health/ready` for MongoDB replica-set reachability,
  transaction support, and document compatibility, and shuts down gracefully by
  refusing new commands, closing SSE streams, waiting for in-flight transactions,
  then closing the database client/change stream. Neither endpoint returns a
  secret, game data, or a verbose error. An explicit maintenance command creates
  every required MongoDB index and validates document versions against ENG-016.
  A maintenance smoke test runs against an ephemeral replica-set database.

- [ ] **B2 — Create game and capability issuance**
  Blocked by: B1
  Requirements: PRD-FUN-001, SEC-002, ENG-003, ENG-009
  Read: docs/engineering/security-privacy-analytics.md, docs/engineering/realtime-and-data.md
  Acceptance: an HTTP create endpoint writes `games`, the initial snapshot, the
  host seat, a game-seat command capability, a separate host capability, an
  invitation, and a `GameCreated` journal event in one transaction, then returns a
  shareable URL carrying an opaque invite ID only. Capabilities use at least 32
  bytes from `crypto.randomBytes`; invite IDs use at least 128 bits, URL-safe
  encoded. Only the hash is stored, and comparison is constant time. The command
  token is sent as a `__Host-` prefixed `Secure; HttpOnly; SameSite=Lax` cookie
  with a max age bounded by retention. Game IDs are opaque UUIDs. A test asserts
  that no capability appears in the response body, the URL, or any log line, and
  that two creates never collide.

- [ ] **B3 — Join gate, seat claim, and pseudonym validation**
  Blocked by: B2
  Requirements: PRD-FUN-002, PRD-FUN-003, SEC-002
  Read: docs/product/prd.md, docs/engineering/security-privacy-analytics.md
  Acceptance: a holder of a valid invite may claim one open guest seat by
  supplying a game-scoped pseudonym. Names are 1 to 24 Unicode grapheme clusters
  after trimming and collapsing whitespace, unique among active seats by
  normalized case-insensitive comparison, and rejected when they contain control
  characters, bidi override characters, or a configurable denylist entry. Every
  name is escaped on render. A game supports 2 to 6 total seats and refuses to
  start unless every seat holds a guest or a bot. **Possessing an invite never
  operates an occupied seat** — a test proves a second holder of the same invite
  cannot take or command a claimed seat. Expired, invalid, full, and ended states
  return a safe response that does not reveal private room details.

- [ ] **B4 — Authenticated SSE, subscriptions, and envelope validation**
  Blocked by: B3
  Requirements: PROTO-001, PROTO-003, SEC-003
  Read: docs/engineering/realtime-and-data.md, docs/engineering/security-privacy-analytics.md
  Acceptance: an SSE request authenticates a game-seat capability before it
  subscribes to authorized events. A subscription grants no authority. Every
  payload is Zod-validated from `packages/contracts` before use and unknown fields
  are rejected. Origin is checked against a configured allowlist, never `*` with
  credentials. Payload size, nesting depth, string length, event names, and SSE
  connection counts are bounded. Multiple tabs sharing one capability share one
  seat. A test drives a malformed envelope, an oversized payload, a foreign
  Origin, and a cross-game stream, and asserts each is refused without state
  change.

- [ ] **B5 — The transactional command path**
  Blocked by: B4
  Requirements: ENG-015, PROTO-002, PRD-NFR-004, PRD-FUN-006, PRD-FUN-008
  Read: docs/engineering/realtime-and-data.md, docs/engineering/architecture.md
  Acceptance: one Next.js Route Handler does, in this order and in one MongoDB
  session transaction: authenticate and authorize; look up `(gameId, commandId)`;
  load the snapshot; verify `expectedVersion`; call the engine; append events with
  sequential numbers; update the snapshot and version;
  insert the command receipt; commit; **then** broadcast. `aggregateVersion`
  increments once per accepted command. `sequence` is strictly increasing per game
  and one command may emit several contiguous values. `game.commandAck` is durable
  acceptance, not HTTP receipt. Repeating a committed `commandId` returns the
  stored ACK and does not re-run the engine. A stale `expectedVersion` returns
  `STALE_VERSION` with no state change and no silent retry. Every PROTO-002 error
  code is reachable and tested. A concurrency test fires two commands at the same
  version and proves exactly one commits.

- [ ] **B6 — Catch-up, resync, and the seat-authorized snapshot**
  Blocked by: B5
  Requirements: PROTO-004, ENG-007
  Read: docs/engineering/realtime-and-data.md
  Acceptance: `/api/games/[gameId]/sync` carries `{lastSequence, aggregateVersion}`. When the
  retained journal forms a contiguous range the server returns `game.events`;
  otherwise, or on an incompatible protocol or content version, it returns a full
  authorized `game.snapshot` with its terminal sequence and version. **The
  snapshot never contains the seed, future deck order, or any host, seat, or
  reclaim capability.** A test asserts each of those is absent from a snapshot for
  every seat, and that a client with a sequence gap receives a snapshot rather
  than a partial range.

- [ ] **B7 — Presence, disconnect pause, and host transfer**
  Blocked by: B5
  Requirements: PROTO-003, PRD-FUN-014, RULE-009
  Read: docs/engineering/realtime-and-data.md, docs/product/prd.md
  Acceptance: presence is ephemeral and emits `connected`, `disconnected`, and
  `reconnected` seat IDs without changing ownership or credentials. A disconnected
  human pauses play only when that seat is the required actor, including auction
  priority. **No countdown, no automatic pass, no forfeiture.** In the lobby the
  host may transfer explicitly to a connected human. During play a disconnected
  host transfers at the next safe command boundary to the longest-tenured
  connected human, tie-broken by seat order, journaling `HostTransferred` and
  rotating the host capability atomically. With no human connected, play stays
  paused. A test disconnects the priority bidder mid-auction and asserts the
  auction is paused, not passed.

- [ ] **B8 — Bot replacement and reclaim**
  Blocked by: B7
  Requirements: PRD-FUN-012, PROTO-003, SEC-002
  Read: docs/engineering/realtime-and-data.md, docs/product/prd.md
  Acceptance: a connected host may replace a disconnected human with the MVP bot,
  but only at a safe command boundary and only after explicit confirmation.
  Replacement revokes the seat command capability and preserves a separate reclaim
  claim that authorizes no commands. The returning human authenticates the claim
  and requests reclaim; the host approves; at the next safe boundary the bot is
  removed, control transfers, and a new command capability is issued. Every
  request, approval, replacement, revocation, and transfer is a journaled command
  using the same version and idempotency path as gameplay. A test proves the
  revoked capability cannot command, the reclaim claim alone cannot command, and
  no transfer ever lands mid-transaction.

- [ ] **B9 — Expiry, cleanup, and retention**
  Blocked by: B5
  Requirements: PRD-FUN-013, ENG-017, SEC-005, OPS-006
  Read: docs/engineering/realtime-and-data.md, docs/delivery/operations.md
  Acceptance: an active game's `expires_at` is 30 days after its last
  authoritative gameplay action; a completed game's is 30 days after completion.
  Presence, viewing, analytics, and failed commands do not extend it. A scheduled
  job atomically moves a due active game to `EXPIRED`, journals the transition,
  revokes invitation, seat, and host capabilities, then deletes the game's data in
  bounded idempotent batches. Completed games stay read-only until due. The job
  records counts without identifiers. A test advances a fixture past each boundary
  and asserts the transition, the revocation, and the deletion order.

- [ ] **B10 — Rate limits, CSRF, headers, and log redaction**
  Blocked by: B5
  Requirements: SEC-001, SEC-003, SEC-004, SEC-006, PRD-NFR-003
  Read: docs/engineering/security-privacy-analytics.md
  Acceptance: create, join, invalid invite lookup, SSE connection, command, sync,
  and analytics proxy calls are rate limited by IP plus seat or game where
  available, with generic responses for invite existence and exponential backoff
  on repeated failure. Cookie-authenticated mutating HTTP endpoints require Origin
  validation plus a CSRF token. Responses carry a deny-by-default CSP,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, and `frame-ancestors 'none'`. Structured log
  redaction runs at the logger boundary. An automated test asserts that a token,
  an invite URL, a cookie, an authorization header, a display name, and a form
  field are all absent from emitted logs, and that each security header is
  present with the expected value.

---

## Loop C — Web application

`apps/web` renders a projection and previews allowed actions. It never decides an
outcome. Every ticket here carries a Playwright acceptance, so each one is
demoable on its own.

Display names appear in this loop and **only** in this loop, at the presentation
boundary. A component renders `district` as "Block". It never receives "Block"
from the server.

- [ ] **C1 — Application shell, tokens, fonts, and shadcn baseline**
  Blocked by: B2
  Requirements: DS-001, DS-010, DS-020, DS-030, DS-070, PRD-NFR-001
  Read: docs/design/design-system.md, docs/brand/brand-strategy.md
  Acceptance: the Next.js App Router shell renders with semantic Tailwind CSS
  variables for light, dark, and forced-colors, defined once and referenced
  everywhere. **No component uses a raw hex value.** Atkinson Hyperlegible and
  Fraunces are self-hosted with system fallbacks, and only the above-the-fold UI
  face is preloaded. The spacing, radius, and border tokens match the DS-010
  block exactly. shadcn primitives are installed and restyled with tokens rather
  than replaced. Dark mode is a dim asphalt treatment, not an inverted light mode.
  A test asserts every semantic role resolves in all three colour modes and that
  the token file is the only source of colour.

- [ ] **C2 — Landing and create**
  Blocked by: C1
  Requirements: UX-010, PRD-FUN-001, PRD-FUN-005
  Read: docs/design/ux-spec.md, docs/product/prd.md
  Acceptance: `/` shows the mark, the create-a-private-game promise, a primary
  **Create game** action, a join-with-link field, how-it-works, the 13+ notice, and
  accessibility and settings links. **No account wall.** `/create` takes an
  optional length-limited game name, a 2 to 6 player count, bot seats, a ruleset
  and variant selector, and a privacy note, and explains an invalid combination
  inline where it occurs. Creating lands on the lobby with the invite link
  visible. A Playwright test creates a game and reaches the lobby.

- [ ] **C3 — Join gate**
  Blocked by: C2
  Requirements: UX-011, PRD-FUN-003
  Read: docs/design/ux-spec.md
  Acceptance: `/join/[inviteId]` validates the invitation before showing the form,
  then takes an unclaimed seat, a game-scoped pseudonym, and a distinguishable
  token. It never requests a real name. Success announces "Joined [room name], [n]
  of [max] seats filled", moves focus to the lobby heading, and stores the
  resumable capability securely. Expired, invalid, full, and ended states each
  give a safe exit that reveals nothing about the private room. A Playwright test
  joins from a second browser context with its own cookie jar.

- [ ] **C4 — Lobby: seats, invite share, variants, and start**
  Blocked by: C3
  Requirements: UX-012, PRD-FUN-004, PRD-FUN-005, VAR-013
  Read: docs/design/ux-spec.md, docs/product/rule-variants.md
  Acceptance: the lobby shows the invite link with copy and native share, seat
  occupancy and readiness, bot controls, the selected settings summary, and the
  board and rule-set version. The host alone adds and removes bot seats, opens a
  claimed seat after confirming removal, picks `standard` or `short-game`, toggles
  the eight variants, and starts. The configuration labels itself `custom` once it
  differs from a preset. Each enabled toggle shows its plain-language effect and
  its duration or balance warning. Guests change only personal presentation
  preferences. Copy feedback is textual and announced. A Playwright test has the
  host toggle a variant, sees it update in the guest's context, and starts.

- [ ] **C5 — Sync client and connection state machine**
  Blocked by: C4, B6
  Requirements: PROTO-004, UX-005, UX-018
  Read: docs/engineering/realtime-and-data.md, docs/design/ux-spec.md
  Acceptance: the client applies events only when the first received sequence
  equals its local sequence plus one; it never fabricates state across a gap. On a
  gap, a decode failure, `STALE_VERSION`, a reconnect, or a visibility resume it
  stops submitting, requests sync, and re-enables controls only after applying
  current state and legal actions. The persistent connection status shows
  Connected, Reconnecting, Offline, or Paused as both icon and text, with an
  `aria-live` status and an event-feed entry on error. Retry uses exponential
  backoff. Queued commands are never replayed automatically. The last confirmed
  state stays inspectable while controls are disabled with an explanation. A
  Playwright test drops the socket, asserts the disabled state, restores it, and
  asserts reconciliation.

- [ ] **C6 — Board, player strip, and event feed**
  Blocked by: C5
  Requirements: UX-013, DS-040, DS-041, PRD-FUN-010, PRD-FUN-016
  Read: docs/design/ux-spec.md, docs/design/design-system.md
  Acceptance: the board is semantic DOM controls plus scalable SVG decoration with
  an equivalent ordered board list. **Never an opaque canvas, and SVG is never the
  only source of a name or status.** Each cell reads in order: route index,
  category pictogram, space name, ownership marker, economic indicator when
  public, and state badges. Cell identity uses a distinctive edge pattern and icon
  family, with district colour supplemental. Every DS-041 state has its listed
  visual and non-visual encoding. The player strip scrolls horizontally with name,
  token shape and pattern, balance, status, and turn marker. The event feed is a
  collapsible labelled panel rendered from the authoritative event log, never
  inferred from animation. Stacked tokens collapse to a count with an accessible
  list. A test asserts every ownership and turn state is distinguishable with
  colour removed.

- [ ] **C7 — Active turn and the action sheet**
  Blocked by: C6
  Requirements: UX-013, PRD-FUN-009, RULE-008
  Read: docs/design/ux-spec.md, docs/product/rules.md
  Acceptance: the shell shows the current turn and "Waiting for [player]" for
  everyone else. The active player rolls from a fixed bottom action bar that opens
  a bottom sheet on mobile and a dialog on desktop. Duplicate submission is
  disabled immediately and an accessible pending label persists until the
  authoritative result arrives. Animation runs only after the authoritative event.
  Executable `legalActions` render enabled; relevant `actionAvailability` entries
  render disabled with their plain-language reason. **A client-side check is never
  treated as authority.** Buttons read verb plus object — "Acquire 4 Maple Stoop",
  not "Confirm" — and one primary action appears per decision. A Playwright test
  takes a deterministic turn across two contexts and sees the same result.

- [ ] **C8 — Acquisition and auction**
  Blocked by: C7, A5
  Requirements: UX-014, PRD-FUN-007
  Read: docs/design/ux-spec.md
  Acceptance: landing on an unowned acquirable space opens a decision sheet with
  the space name and type, the price, the projected balance, an income and risk
  summary, **Acquire**, and **Decline**. Declining opens the untimed auction to
  every eligible player, with labelled increment controls and validated direct
  amount entry. The current leader, minimum next bid, priority bidder,
  affordability, pass status, and outcome all have text equivalents. A
  disconnected priority bidder shows the auction as paused. Bids are atomic and
  conflicting bids receive an authoritative result, never a client-side promise.
  A Playwright test runs a three-context auction to a winner.

- [ ] **C9 — Manage: improve, sell, mortgage, and redeem**
  Blocked by: C7, A6, A7, A8
  Requirements: UX-016, RULE-008, RULE-011
  Read: docs/design/ux-spec.md
  Acceptance: an owned-space detail opens **Manage**, grouping actions into
  executable and blocked. Each explains its prerequisite, cost or proceeds,
  resulting balance, and rule constraint before the action. Irreversible actions
  confirm. When finite improvement inventory is contested, the UI shows the
  available count, each seat's requested deed, the current priority, the minimum
  bid, and the cost treatment, and reuses the C8 auction interaction. A target is
  revalidated after each unit, and an ineligible request is explained and removed
  rather than silently moved. A Playwright test improves a completed district and
  then hits a zero-inventory block with the reason shown.

- [ ] **C10 — Trade**
  Blocked by: C7, A9
  Requirements: UX-015
  Read: docs/design/ux-spec.md
  Acceptance: an eligible human opens **Propose trade**, picks a counterpart, adds
  and removes permitted cash, deeds, and Detention-release cards, and reviews a
  **You give / You receive** summary. Future promises and deferred consideration
  are not offered at all. The recipient accepts, declines, or counters, and
  acceptance revalidates current state. A trade goes stale when an included asset
  changes and cancels when a party is eliminated or the game ends. During an
  obligation only the debtor may open the immediate liquidity trade. A Playwright
  test lands a stale acceptance and shows the correct message.

- [ ] **C11 — Detention, debt, and bankruptcy**
  Blocked by: C7, A11, A12, A13
  Requirements: UX-017
  Read: docs/design/ux-spec.md
  Acceptance: Detention shows remaining turns, exit conditions, and the currently
  legal remedies. An obligation interrupts normal choices with the allowed
  liquidation actions and the updated amount due, keeping blocked options visible
  with reasons. When the engine proves no remedy remains, **Declare bankruptcy**
  is a destructive confirmed action that explains the creditor outcome first.
  Bankruptcy locks the eliminated seat, resolves assets, announces standings, and
  preserves the event log. **A keyboard user is never trapped in the sheet.** A
  Playwright keyboard-only test reaches and escapes each state.

- [ ] **C12 — Reconnect, reclaim, host transfer, and no-contest**
  Blocked by: C5, B7, B8
  Requirements: UX-018, PRD-FUN-012, PRD-FUN-014, PRD-FUN-019
  Read: docs/design/ux-spec.md, docs/engineering/realtime-and-data.md
  Acceptance: a disconnected human keeps their seat and assets, and play pauses
  only when that seat must act. Host replacement confirmation names the seat and
  explains that the old command token is revoked while a separate reclaim claim
  remains; the replacement is journaled and announced. A replaced human presents
  the reclaim claim and requests control, the host approves, and control changes
  only at a safe boundary. Host transfer on host disconnect is announced. **End
  game without a result** is a destructive confirmation shown to every connected
  player, explaining that no winner is recorded, submitting `EndNoContest` only at
  a safe boundary, and it cannot be undone. A Playwright test drives replacement
  and reclaim across three contexts.

- [ ] **C13 — Completion, summary, and rematch**
  Blocked by: C11
  Requirements: UX-019, PRD-FUN-015
  Read: docs/design/ux-spec.md
  Acceptance: on an authoritative win condition the app freezes actions, shows the
  result sheet to everyone, announces the winner and standings, and routes to
  `/game/[gameId]/summary`. The summary shows the winner or the explicit no-winner
  or no-contest outcome, standings, key events, duration, selected variants,
  rematch, copy result, and return home, and stays read-only until expiry.
  Rematch creates a fresh room and invite with explicit participant and variant
  choices; **it never carries balances, assets, or host authority silently.**

- [ ] **C14 — Settings, rules, and accessibility routes**
  Blocked by: C1
  Requirements: UX-002, PRD-NFR-005, PRD-NFR-006, VAR-013
  Read: docs/design/ux-spec.md
  Acceptance: `/settings` offers theme, contrast, reduced sound and haptics,
  animation preference, board labels, text-scale guidance, install status, and
  data and session controls. **None of these change game rules.** `/rules` renders
  the versioned original rules and the variant list with each toggle's warning and
  interaction note in plain language. `/accessibility` carries the keyboard guide
  and the accessibility statement. Every shell footer or menu links to both.

---

## Loop D — Variants and bot

Exactly eight toggles. No ninth, and content cannot add one. A started game keeps
the configuration captured at start and never reads a current deployment default.

- [ ] **D1 — Variant schema, lobby lock, and `RulesConfigured`**
  Blocked by: A14, C4
  Requirements: VAR-009, VAR-010, VAR-011, VAR-012, ENG-027
  Read: docs/product/rule-variants.md, docs/engineering/game-engine.md
  Acceptance: a configuration is an object with `schemaVersion`, `preset`, and
  exactly the eight boolean keys. An unknown key, a missing key, a non-boolean, an
  unsupported schema version, and a resolved value inconsistent with its preset
  are each rejected before start. The host may change a configuration only in
  `LOBBY`. Start atomically validates it, resolves the effective values, stores
  the content hash, and emits `RulesConfigured`. The snapshot and event stream
  carry the resolved configuration and the schema, board, and rules versions. A
  test proves a resumed game ignores changed deployment defaults, and that a
  post-start configuration change is refused.

- [ ] **D2 — VAR-001, VAR-002, and VAR-005: money injection toggles**
  Blocked by: D1
  Requirements: VAR-001, VAR-002, VAR-005, VAR-014
  Read: docs/product/rule-variants.md
  Acceptance: `restSpaceJackpot` pays the accumulated pot to a player landing on
  Rest, then resets it, funded only by fees explicitly tagged `jackpotEligible`.
  The pot starts at zero, takes only the amount actually paid after debt
  resolution, and never fabricates an unpaid balance from a bank-directed
  bankruptcy. `doubleStartOnExactLanding` pays one extra Start amount only for a
  normal dice movement finishing on Start — never for forced movement, backward
  movement, Send to Detention, or the game's starting position.
  `bonusForMatchingOnes` fires once per roll on double ones, including a roll that
  then sends the player to Detention, and never for a utility rent roll or a
  Detention release attempt. Tests cover each toggle alone and the documented
  stacking of VAR-002 with VAR-005.

- [ ] **D3 — VAR-003 and VAR-004: auction and income suppression**
  Blocked by: D1
  Requirements: VAR-003, VAR-004, VAR-014
  Read: docs/product/rule-variants.md
  Acceptance: `noAuctionAfterDeclinedAcquisition` leaves a declined or unaffordable
  unowned deed bank-owned, and replaces **only** that automatic auction —
  bank-directed bankruptcy auctions still run. `noIncomeWhileDetained` suppresses
  rent owed to a detained owner and card-directed collection paid to them, and
  suppressed rent is zero for that landing, never deferred. It does not suppress
  Start money, sale proceeds, mortgage proceeds, a jackpot, agreed trade cash, or
  debt collection against the detained player. Tests cover each exclusion by name.

- [ ] **D4 — VAR-006, VAR-007, and VAR-008: setup and construction toggles**
  Blocked by: D1
  Requirements: VAR-006, VAR-007, VAR-008, VAR-014, CONTENT-007
  Read: docs/product/rule-variants.md
  Acceptance: `startingAssetsDealt` deals `startingAssetDealCount` bank-owned
  deeds round-robin in recorded random order after player order is set, never
  deals a deed twice, never deals improvements, mortgages, cards, or cash, and
  **rejects start** rather than dealing unevenly when eligible deeds are fewer
  than seats times count. The deal algorithm is auditable from the event stream.
  `relaxedEvenBuilding` drops only the one-level spread rule; complete-district
  ownership, the no-mortgaged-district rule, maximum level, cost, and inventory
  all still apply. `unlimitedImprovementInventory` never fails a purchase for
  exhausted inventory, still records purchases and sales, and displays "unlimited"
  rather than a misleading finite number. A test asserts VAR-007 and VAR-008
  interact as documented.

- [ ] **D5 — Bot policy, explanations, and soak harness**
  Blocked by: D4
  Requirements: PRD-FUN-011, ENG-026, TEST-006
  Read: docs/engineering/game-engine.md, docs/delivery/test-strategy.md
  Acceptance: one non-selectable `BotPolicy` receives public game state plus its
  own `legalActions` and returns one command, which the server validates exactly
  as a human command. **A bot is never a privileged server shortcut.** The
  heuristic order is: settle obligations; acquire if reserve remains; bid below a
  content-derived valuation; improve a completed district when reserve permits;
  propose only precomputed immediate trades; otherwise end or pass. Ties break by
  stable action key, never by iteration order or wall-clock time. Every
  non-trivial decision emits `BotDecisionExplained` with the seat, action
  category, a stable reason code, and bounded public numeric factors — never the
  seed, deck order, a capability, or free text. The bot has a bounded compute
  budget, no network, and a deterministic safe legal fallback on failure. A soak
  harness runs bot games through real command validation and persistence, reports
  completion and failure counts, invariant failures, duplicate events, duration
  percentiles, and memory and connection trends, and preserves failing seeds.

---

## Loop E — Accessibility and responsive behaviour

Target WCAG 2.2 AA. These tickets audit and fix the surfaces Loop C built. Check
every change at 375 px and 1440 px unless the acceptance line names other widths.

- [ ] **E1 — Keyboard board navigation and the non-spatial list**
  Blocked by: C13
  Requirements: UX-040, DS-060, PRD-NFR-005
  Read: docs/design/ux-spec.md, docs/design/design-system.md
  Acceptance: `Tab` and `Shift+Tab` move through logical landmarks and controls.
  `Enter` and `Space` activate. `Escape` closes a dismissible dialog or sheet.
  Arrow keys pan the focused board viewport or move a roving-tabindex board cell.
  `Home` and `End` reach the first and last cell. A visible keyboard-help entry
  exists, and a non-spatial board list gives the same information without
  geometry. Named landmarks exist for header, main game, board and board list,
  player status, action region, and event log, and headings describe the current
  turn and active decision. A Playwright test completes a full turn with the
  keyboard alone.

- [ ] **E2 — Live regions and restrained announcements**
  Blocked by: E1
  Requirements: UX-040, PRD-NFR-005
  Read: docs/design/ux-spec.md
  Acceptance: `aria-live` announces exactly these and no more: turn start, the
  authoritative roll and result, a required decision, an accepted or rejected
  command, the auction leader and outcome, reconnect, pause, elimination, and game
  end. **Decorative movement and ordinary visual updates are not announced.** A
  readable event log carries everything else. A test asserts the announcement set
  matches this list, with no announcement fired per animation frame.

- [ ] **E3 — Dialog and sheet focus management**
  Blocked by: E1
  Requirements: UX-040, DS-030, DS-060
  Read: docs/design/ux-spec.md
  Acceptance: every dialog and sheet traps focus while open, labels its purpose,
  and restores focus to its invoker on close. None closes on an irreversible
  action without confirmation. A mobile bottom sheet has both a drag affordance
  and a close button, and never covers its invoker without a way to close. Focus
  is always visible and never obscured by sticky UI. A test opens and closes every
  dialog in the app and asserts focus restoration each time.

- [ ] **E4 — Non-colour encoding, contrast, forced colours, and reduced motion**
  Blocked by: E3
  Requirements: UX-040, DS-020, DS-041, DS-050, DS-060, PRD-NFR-006
  Read: docs/design/design-system.md, docs/design/ux-spec.md
  Acceptance: ownership, player identity, selection, affordability, and urgency
  each carry text, an icon or shape or pattern, and programmatic state in addition
  to colour. Normal text meets 4.5:1 and large text and essential components meet
  3:1, in both themes and in forced-colors mode. The focus ring exceeds 3:1
  against adjacent colours. Every interactive target is at least 44 by 44 CSS px
  or has equivalent spacing. Under `prefers-reduced-motion: reduce` the final
  state shows immediately, and **no animation ever delays, conceals, or changes a
  resolved outcome.** Sounds and haptics are opt-in and independently switchable,
  with no autoplay and no sound-only information. Measure contrast; do not
  eyeball it.

- [ ] **E5 — The responsive matrix**
  Blocked by: E4
  Requirements: UX-030, UX-031, UX-032, UX-033, PRD-FUN-016
  Read: docs/design/ux-spec.md
  Acceptance: at 320 to 375 px a single-column safe-area-aware shell gives a
  focused board viewport with drag and keyboard panning, a mini-map with a
  labelled viewport indicator and tappable regions, active-space detail, a
  horizontally scrollable player strip, a fixed bottom action bar, and a
  collapsible event feed. **The page body never scrolls horizontally at any
  width.** Wide content scrolls inside its own container, and nested grid and flex
  children carry `min-w-0`. At 768 to 1023 px a split layout gives the board plus
  a 320 to 400 px contextual panel, with portrait stacking. At 1024 px and above
  the full board renders when cells stay legible, otherwise the focused viewport
  stays, with persistent independently scrollable side panels. Short landscape
  prioritises board and compact strip and moves detail into a drawer. **Never
  require rotation and never lock orientation.** Reflow holds at 200% and 400%
  zoom.

- [ ] **E6 — axe coverage and the manual assistive-technology checklist**
  Blocked by: E5
  Requirements: UX-040, TEST-004, PRD-NFR-005
  Read: docs/delivery/test-strategy.md
  Acceptance: axe runs against every major page and state — landing, create, join,
  lobby, active turn, modal, trade, auction, manage, settings, reconnect, and game
  over — with zero violations. A manual checklist exists and is filled in for one
  release: keyboard-only turn completion, VoiceOver with Safari, NVDA with
  Firefox, zoom and reflow at 200% and 400%, reduced motion, contrast, focus
  restoration after dialogs, and touch targets on a physical mobile device.
  Record browser, OS, and assistive-technology versions and any unresolved
  exception. **No critical keyboard or screen-reader blocker may remain.**

---

## Loop F — PWA, analytics, and operations

- [ ] **F1 — PWA manifest, service worker, and update UX**
  Blocked by: E6
  Requirements: PRD-FUN-017, TEST-005
  Read: docs/design/ux-spec.md, docs/engineering/architecture.md
  Acceptance: the app declares a manifest with icons, installs over HTTPS, and
  registers a service worker that serves an offline app shell. It **must not claim
  offline play** — live gameplay requires the network, and the offline state says
  so. An update prompt activates a new version safely and a cache-version rollback
  does not strand a client. **No private game state and no authenticated response
  is cached.** The install prompt is dismissible, non-modal, appears only after
  meaningful engagement, remembers dismissal, and on iOS shows manual steps only
  when the user asks. A test reopens an installed app into an expired session.

- [ ] **F2 — Consent gate, PostHog adapter, and the approved taxonomy**
  Blocked by: F1
  Requirements: PRD-FUN-018, ANA-001, ANA-002, SEC-006
  Read: docs/engineering/security-privacy-analytics.md
  Acceptance: nothing persists or transmits until the player gives clear revocable
  consent, presented before initialization, and **essential game operation is not
  bundled with analytics**. Withdrawal calls opt-out and reset, stops capture
  immediately, and does not reinitialize on a later page load without renewed
  consent. Session replay stays globally disabled. The distinct ID derives from a
  random analytics ID — never a token, invite ID, IP, or player name. Only the
  ANA-002 events and properties are emitted, with no free text, URL, identifier,
  raw error string, or game-state detail. A test proves a consent-denied session
  makes zero PostHog network requests, and that withdrawal stops an opted-in one.

- [ ] **F3 — Coolify image, document maintenance, and cleanup job**
  Blocked by: F1
  Requirements: OPS-002, OPS-003, OPS-004, ENG-004, PRD-NFR-001
  Read: docs/delivery/operations.md, docs/engineering/architecture.md
  Acceptance: one non-root, minimal Docker image exists for the Next.js `web`
  application with a pinned base digest and **no `latest` tag**. An explicit
  document/index maintenance command runs under a lease lock — the application
  **never performs an opaque destructive migration at startup**. A scheduled
  cleanup request runs the B9 expiry work. The deployment documents its required
  environment variables by name and category per the OPS-003 inventory, with no
  values committed. No server key carries a `NEXT_PUBLIC_` prefix. A smoke script
  creates, joins, acts, reconnects, and reads back.

- [ ] **F4 — Structured logs, metrics, and alerts**
  Blocked by: F3
  Requirements: OPS-005, SEC-004, PRD-NFR-007
  Read: docs/delivery/operations.md
  Acceptance: logs are structured JSON with UTC timestamp, level, release and
  image, correlation ID, pseudonymous identifiers, route or protocol event,
  latency, and error class — and never an invite URL, token, cookie, credential,
  full payload, or private state. The OPS-005 minimum metric set is emitted:
  connection counts, active games and clients, commands accepted and rejected,
  action-to-broadcast p50/p95/p99, reconnects, protocol and idempotency failures,
  error rate, event lag, database connections and locks, CPU and memory, backup
  age, and migration status. Alerts exist for readiness failure, sustained error
  rate, p95 broadcast breach, database pressure, restart loops, failed backup,
  failed migration, and anomalous authorization rejections — each with an owner,
  a severity, a runbook link, and a tested notification.

- [ ] **F5 — Backup and restore drill**
  Blocked by: F4
  Requirements: OPS-006, OPS-009, ENG-017, TEST-005
  Read: docs/delivery/operations.md
  Acceptance: encrypted MongoDB backups run at least daily. A repeatable drill
  script restores a chosen backup into an isolated replica-set database with no
  production outbound integrations, runs document/index compatibility checks, verifies document counts and a sampled
  snapshot-plus-event replay against the invariants, runs an authorized read and
  write smoke, and destroys the test environment. It records recovery time,
  recovery-point age, operator, backup identifier, failures, and corrective
  action. **A restore is not complete until the test services start and a
  persisted game replays.**

- [ ] **F6 — Load harness at 100 games and 600 clients**
  Blocked by: F5, D5
  Requirements: TEST-006, OPS-008, PRD-NFR-007
  Read: docs/delivery/test-strategy.md, docs/delivery/operations.md
  Acceptance: a harness drives 100 concurrent games and 600 connected clients for
  at least 30 minutes in a representative local-region environment, measuring
  client action through to recipient broadcast and excluding human think time. It
  publishes environment size, duration, concurrency ramp, p50, p95, p99, database
  pool usage, CPU and memory, reconnect count, and the saturation point. The
  target is **p95 under 300 ms** with no unauthorized delivery, no event-ordering
  error, and no sustained error rate above 1%. This is a capacity measurement, not
  a global latency promise.

---

## Human-owned, never agent work

An agent drafts and flags. The project owner decides. Do not resolve any of these
in an iteration — annotate the relevant ticket `[?]` and continue.

| Decision | Why it is not agent work |
|---|---|
| Content provenance sign-off | CONTENT-008 and LEGAL-006 need a named human approver. An agent cannot approve its own output. |
| The currency display name | brand-strategy.md flags "Tabs" for review against "Credits" on the 13+ gambling-framing rule. That is a brand judgement. Default to the documented "Tabs" and flag it. |
| Any public launch decision | Publication, marketing copy, store listings, and release approval stay with the owner. |
| Legal judgement of any kind | An agent implements the documented rules. It does not conclude that something is legally safe. |

## Observed, not queued

Anything you notice that is not a ticket goes here, in one or two lines, with the
date. Do not act on an entry in the same iteration that records it. Do not
promote an entry to a ticket — that is the owner's call.

*(empty)*
