# Blockparty classic overhaul backlog

**Status:** accepted, dependency-ordered transition queue  
**Audience:** implementation agents and human reviewers  
**Product direction:** a faithful FOSS implementation of the classic 40-space
property-trading game, presented as the original magical city of Blockparty  
**Previous queue:** [Build backlog](build-backlog.md) is a closed historical
delivery ledger and must not receive new tickets

This backlog turns the accepted UI and rules realignment into narrow, sequential
implementation tickets. Work exactly one ticket per session. Each ticket ends in
a repository state that the next ticket can safely consume.

CO-001 through CO-007 reconcile the former independently balanced, irregular-
route authority with the accepted classic direction before gameplay migration
begins. During this transition, this backlog is the owner-approved source for
the decisions listed below. After CO-007, normal precedence in `AGENTS.md`
applies again.

## Locked decisions

These choices are settled. An implementation agent must execute them rather than
reopen them.

- The product remains **Blockparty**.
- The default game is a faithful implementation of the familiar classic rules,
  economy, board composition, auctions, rent progression, Houses, Hotels,
  detention, cards, debt, bankruptcy, and victory conditions.
- The board has 40 perimeter spaces, four strong corner anchors, 22 color-group
  properties in eight groups, four transit properties, two utilities, two fee
  spaces, and two distinct 16-card decks with three draw spaces each.
- The bank begins with 32 Houses and 12 Hotels. Players build evenly through four
  House levels and exchange four Houses for one Hotel at the final level.
- Names, prose, illustration, token art, sound, and interface assets are original
  to Blockparty. The accepted world is an original magical city, led by
  Moonquill Market, Giltglass Exchange, Starhold Academy, and Blackglass Keep.
- Player-facing language uses familiar generic terms: Property, Color Set, Rent,
  Mortgage, Auction, House, Hotel, Detention, Bank, and Trade.
- The visual posture is **classic table, digital hand**: cream board, dark ink,
  unmistakable property-group colors, tactile cards, and a dominant shared board.
- Creation is one page. House rules are collapsed by default.
- Creation separately controls **Human players** and **Computer players** with
  buttons and a visible seat tray. No numeric text fields are used.
- Human count includes the host. Defaults are two Humans, zero Computers, and the
  Standard rules preset. The combined table size is 2–6.
- The host enters a pseudonym and chooses a piece during creation. Joiners enter
  a pseudonym and choose one of the remaining pieces during admission.
- The six original pieces are Lantern, Key, Crescent, Tower, Fox, and Teapot.
  Every piece also has a distinct color and pattern.
- Desktop centers the full board, places players at the side, the active decision
  at the opposite side, and the local property hand below the board.
- Phone shows a fitted board overview, follows the active movement/space, permits
  tap-to-focus/zoom, and retains an ordered accessible board list.
- Existing `0.0.0-placeholder` games are ended as no-contest with reason
  `CONTENT_RETIRED`. They are not migrated to the classic ruleset.
- Source code uses AGPL-3.0-or-later. Original content and assets use
  CC BY-SA 4.0.
- Server authority, pure deterministic engine behavior, capability separation,
  integer minor-unit money, 30-day retention, private invite admission, one bot
  difficulty, and untimed play remain invariant.
- Accounts, matchmaking, spectators, and chat remain outside this overhaul.

## Requirement IDs introduced by this queue

CO-001 adds these bounded requirements to the normative documents and
traceability register. Later tickets cite them directly.

| ID          | Requirement summary                                            |
| ----------- | -------------------------------------------------------------- |
| PRD-FUN-020 | Faithful classic-scale default game                            |
| PRD-FUN-021 | Explicit Human/Computer setup and entry-time piece selection   |
| PRD-FUN-022 | Classic-table desktop operating surface                        |
| PRD-FUN-023 | Focused, equivalent mobile operating surface                   |
| PRD-FUN-024 | Authoritative retirement of placeholder games                  |
| PRD-NFR-011 | AGPL code and CC BY-SA content distribution                    |
| RULE-013    | Standard classic turn, property, auction, and victory baseline |
| RULE-014    | Four-House/Hotel transitions and finite inventory              |
| CONTENT-012 | Forty-space board composition                                  |
| CONTENT-013 | Faithful classic economy and rent schedules                    |
| CONTENT-014 | Original magical-city names, copy, and presentation            |
| CONTENT-015 | Multi-kind improvement inventory transitions                   |
| CONTENT-016 | Six original accessible player pieces                          |
| UX-041      | One-page table composer                                        |
| UX-042      | Entry-time piece selection and stale-choice recovery           |
| UX-043      | Table-preview lobby                                            |
| UX-044      | Desktop classic table and digital hand                         |
| UX-045      | Mobile overview, focus, zoom, and list equivalence             |
| UX-046      | One dominant decision and contextual property management       |
| UX-047      | Retired-game explanation and read-only summary                 |
| DS-071      | Classic table color, type, and material direction              |
| DS-072      | Semantic property-space and board grammar                      |
| DS-073      | Responsive table/hand/action layout                            |
| ENG-029     | Creation/admission contract version                            |
| ENG-030     | Multi-kind improvement state and event version                 |
| ENG-031     | Idempotent placeholder-game retirement workflow                |
| LEGAL-011   | Code/content license split and attribution                     |
| TEST-008    | Classic content and engine scenario evidence                   |
| TEST-009    | Responsive, visual, and interaction-regression evidence        |

If a ticket discovers genuinely new scope, record it under **Observed, not
queued** at the bottom. Do not silently widen an ID or add a ticket during the
same session.

## Claim protocol

1. Read this introduction, the locked decisions, completion gate, and the ticket
   being claimed.
2. Confirm every blocker is `[x]` or `[?]`.
3. Change exactly one available ticket from `[ ]` to `[~]` and commit that claim.
4. Perform only that ticket. Preserve unrelated changes already in the worktree.
5. Run the ticket-specific checks and the full completion gate.
6. Update its traceability rows and directly affected documentation.
7. Mark it `[x]`, `[?]`, or `[!]`, add a concise implementation/evidence note,
   and commit the completed ticket.

State marks:

| Mark  | Meaning                                                                      |
| ----- | ---------------------------------------------------------------------------- |
| `[ ]` | Ready when its blocker is complete                                           |
| `[~]` | Claimed by the current session                                               |
| `[x]` | Implemented, evidenced, documented, and committed                            |
| `[?]` | Technically complete but awaiting named human content/accessibility approval |
| `[!]` | Blocked; the ticket note states the exact blocker and retained safe state    |

## Completion gate

A ticket is complete only when all applicable conditions hold:

1. Its acceptance behavior works end to end; placeholders and TODO-only paths do
   not count.
2. Tests exist at the layer assigned by `docs/delivery/test-strategy.md`, and at
   least one new test has been mutation-checked by temporarily breaking the
   implementation and observing a meaningful failure.
3. Server authority, pure engine, capability, deterministic randomness, money,
   retention, and immutable-version invariants remain intact.
4. Changed public contracts have strict schema tests and all call sites use the
   new shape.
5. Changed requirements and evidence are reflected in `docs/traceability.md`.
6. Directly affected Markdown describes actual behavior and distinguishes target
   state from implemented state.
7. `pnpm run format` and `pnpm run ci` pass without retrying failures into green.
8. The ticket change and its final backlog mark are committed.

The baseline observed while preparing this queue was 292 passing tests and two
skipped tests. Do not use that count as a fixed assertion; use it to catch an
accidental collapse in coverage.

---

## Phase A — Reset the implementation authority

- [x] **CO-001 — Adopt the classic product baseline in the PRD and traceability**
      Blocked by: none
      Requirements: PRD-FUN-020–024, PRD-NFR-011
      Read: this backlog, `docs/product/prd.md`, `docs/product/feature-parity.md`,
      `docs/traceability.md`
      Changes: make the faithful classic magical-city game the explicit product
      goal; replace the irregular independently balanced target; define the
      creation, desktop, mobile, retirement, and licensing outcomes; update the
      feature-parity matrix to the accepted 40-space baseline; create the new
      traceability rows as `Planned`.
      Acceptance: the PRD and parity matrix fully agree with the locked decisions,
      every new ID has one bounded statement, and no current implementation is
      misrepresented as complete.
      Proves: Markdown link check, requirement-ID uniqueness check, and a manual
      comparison of every locked decision against the PRD/parity matrix.
      Evidence: PRD, parity, and traceability updates are complete; six new IDs
      occur once in each owning register, locked baseline phrases/counts were
      checked directly, `pnpm run format` and build passed, and the test suite
      passed with 292 tests (2 skipped). Repository CI remains blocked by the
      pre-existing `prettier.config.cjs` ESLint `module` no-undef error.

- [x] **CO-002 — Rewrite the canonical rules, variants, and glossary**
      Blocked by: CO-001
      Requirements: RULE-013, RULE-014, VAR-001–014
      Read: `docs/product/rules.md`, `docs/product/rule-variants.md`,
      `docs/product/glossary.md`, PRD rows added by CO-001
      Changes: specify the standard turn loop, doubles, detention, purchases,
      declined-property auctions, rent, complete sets, even building, four Houses,
      Hotels, mortgage/redemption, trading, card resolution, fees, debt,
      bankruptcy, and last-solvent-player victory. Preserve the existing eight
      toggles and make Standard all-false. Keep no timers. Align canonical wire
      terms with the new display vocabulary without placing display names in
      commands, events, database fields, or fixtures.
      Acceptance: an engine implementer can resolve every phase and principal edge
      case from the rules without choosing missing behavior; all eight variants
      have explicit interactions with the standard rules.
      Proves: terminology lint/search plus a rules-to-parity review showing every
      feature row has a normative rule.
      Evidence: canonical rules now define the standard phase loop, classic
      property/economy edge cases, event-based replay, and House/Hotel inventory;
      variants explicitly overlay only named rules; glossary terminology and
      rules-to-parity searches pass. `pnpm run ci` reaches lint but remains
      blocked by the pre-existing `prettier.config.cjs` ESLint `module`
      no-undef error.

- [?] **CO-003 — Author the complete magical-city content specification**
      Blocked by: CO-002
      Requirements: CONTENT-012–016, RULE-013, RULE-014
      Read: `docs/product/game-content.md`, updated rules/glossary,
      `docs/brand/brand-strategy.md`, `docs/brand/naming.md`
      Changes: add the authoritative 40-row board table with stable canonical IDs,
      route index, type, display name, group, price, mortgage, rent schedule,
      improvement cost, and landing effect. Define all eight groups, four portal
      lines, two utilities, four corners, two fees, both 16-card decks, starting
      cash, Start payment, detention constants, House/Hotel quantities, and the
      six piece definitions. Use the locked magical-city anchors and complete the
      remaining names/copy in one coherent voice.
      Acceptance: the table is numerically complete, internally referential,
      faithful to the accepted classic economy, and contains no placeholder name
      or unspecified value.
      Proves: independent row/count reconciliation and human product-owner review.
      Completion mark: `[?]` until the product owner approves the final names and
      prose; numerical completeness may be agent-verified.
      Evidence: `docs/product/game-content.md` now defines the 40-space route,
      28 deeds, eight group sizes, six draw spaces, two fees, both 16-card decks,
      economy constants, finite improvement inventory, and six pieces. Route and
      ID reconciliation passed; formatting, typecheck, build, and 292 tests
      passed. Full CI remains blocked by the pre-existing ESLint
      `prettier.config.cjs` `module` no-undef error.

- [?] **CO-004 — Replace the brand and licensing posture**
      Blocked by: CO-003
      Requirements: PRD-NFR-011, CONTENT-014, CONTENT-016, LEGAL-011
      Read: `docs/brand/brand-strategy.md`, `docs/brand/naming.md`,
      `docs/legal/ip-safety.md`, content specification from CO-003
      Changes: make the original magical city and classic-table presentation the
      brand authority; retain Blockparty as the name; document the AGPL/CC BY-SA
      split, provenance expectations, attribution, non-affiliation language, and
      third-party asset handling. Remove the old perimeter-board and faithful-
      mechanics prohibitions because they contradict the settled direction.
      Acceptance: brand, naming, and legal documentation agree with the PRD and
      contain no remaining release blocker based solely on classic rules or
      perimeter geometry.
      Proves: stale-guardrail search and human owner review of positioning and
      licensing choices.
      Evidence: brand strategy, naming, and IP-safety now establish the original
      magical-city/classic-table posture, remove the obsolete irregular-route
      prohibition, define the AGPL/CC BY-SA/third-party license split, and add
      LEGAL-011 to traceability. Final public release remains gated on named
      owner and attorney approval.

- [x] **CO-005 — Rewrite the UX specification around table setup and table play**
      Blocked by: CO-004
      Requirements: UX-041–047, PRD-FUN-021–024
      Read: `docs/design/ux-spec.md`, updated PRD/rules/content specification
      Changes: specify landing/create/join/lobby/play/reconnect/completion/rematch
      flows; the exact Human/Computer constraints; piece availability conflicts;
      desktop table anatomy; phone overview/focus/list behavior; one dominant
      action; property-hand management; auctions, trades, detention, debt, and
      retired-game summaries. Define focus movement and live announcements for
      every authoritative transition.
      Acceptance: every user state has entry, success, pending, empty, rejected,
      disconnected, and recovery behavior where applicable; no screen invents
      state not supplied by projections.
      Proves: flow review against all legal actions and protocol failure classes.
      Evidence: `docs/design/ux-spec.md` now specifies the one-page composer,
      entry-time piece conflicts, table-preview lobby, desktop digital hand,
      phone overview/focus/list equivalence, one dominant decision, property
      management, blocking decisions, recovery, completion, rematch, and
      `CONTENT_RETIRED` summaries. UX-041–047 are registered in
      `docs/traceability.md`; formatting, typecheck, build, and 292 tests (2
      skipped) pass. Full CI remains blocked by the pre-existing ESLint
      `prettier.config.cjs` `module` no-undef error.

- [x] **CO-006 — Rewrite the design system for the classic table**
      Blocked by: CO-005
      Requirements: DS-071–073, UX-041–046
      Read: `docs/design/design-system.md`, updated UX specification
      Changes: define the cream/dark-ink/table palette, eight property-group color
      roles, typography, spacing, elevation, board-cell anatomy, deed cards,
      player rails, decision surfaces, property hand, mobile sheets, zoom/focus,
      token silhouettes/patterns, motion, reduced motion, forced colors, and
      visual-regression viewport/state matrix.
      Acceptance: an agent can build every accepted mockup without selecting new
      colors, layout rules, component anatomy, or responsive breakpoints.
      Proves: token contrast calculations, 320/375/768/1280 layout sketches, and
      design-to-UX requirement mapping.
      Evidence: `docs/design/design-system.md` now fixes the classic table
      palette, eight Color Set roles, 11 × 11/40-cell grammar, component anatomy,
      responsive breakpoints, accessibility states, motion, and the viewport/state
      matrix; DS-071–073 are registered in `docs/traceability.md`. Prettier
      formatting, typecheck, production build, and 292 tests (2 skipped) pass.
      Full CI remains blocked by the pre-existing ESLint `prettier.config.cjs`
      `module` no-undef error.

- [x] **CO-007 — Reconcile engineering, delivery, index, and agent documentation**
      Blocked by: CO-006
      Requirements: ENG-029–031, TEST-008–009 and all new product/design IDs
      Read: every Markdown file listed by `rg --files -g '*.md'`
      Changes: update architecture, game-engine, realtime/data, security/privacy/
      analytics, test strategy, operations/runbooks, README, documentation index,
      PWA status, gnhf documents, and `AGENTS.md`. Register this queue as active
      and the 64-ticket queue as closed. Correct stale claims about missing sync,
      MongoDB, Playwright, and playable screens. Mark the original prompt and dated
      memory files as historical without rewriting their past observations.
      Acceptance: every repository Markdown file has an explicit current,
      normative, historical, or retired disposition in `docs/README.md`; current
      docs agree with the code and target docs agree with CO-001–006.
      Proves: link/anchor check, document-register completeness check, requirement
      uniqueness check, and searches for known stale phrases.
      Evidence: engineering, protocol, security, test, operations, README, PWA,
      gnhf, and agent documents now distinguish implemented foundation behavior
      from staged classic migration; `docs/README.md` registers every Markdown
      file and the new ENG-029–031/TEST-008–009 authority is linked in
      `docs/traceability.md`. Markdown inventory, anchor, ID, and stale-claim
      checks passed; the pre-existing `prettier.config.cjs` ESLint error remains
      the only CI blocker.

## Phase B — Establish FOSS and versioned contract foundations

- [x] **CO-008 — Add the FOSS distribution documents and package metadata**
      Blocked by: CO-007
      Requirements: PRD-NFR-011, LEGAL-011
      Read: updated legal/brand docs, all package manifests
      Changes: add the full AGPL-3.0-or-later `LICENSE`, CC BY-SA coverage and
      exclusions in `CONTENT-LICENSE.md`, `NOTICE.md`, `CONTRIBUTING.md`, and
      `TRADEMARKS.md`; add SPDX identifiers and repository metadata to manifests;
      list current fonts and dependencies requiring notices.
      Acceptance: code, original content, third-party assets, and the Blockparty
      mark each have an unambiguous documented treatment, and package metadata
      matches it.
      Proves: license-file presence/consistency test and dependency-license audit
      recorded in `NOTICE.md`.
      Evidence: added the complete root `LICENSE`, `CONTENT-LICENSE.md`,
      `NOTICE.md`, `CONTRIBUTING.md`, and `TRADEMARKS.md`; added AGPL SPDX and
      repository metadata to all five workspace manifests; registered the new
      documents and updated PRD-NFR-011/LEGAL-011 traceability. The license
      consistency suite has three passing tests and was mutation-checked by
      deliberately changing one manifest license and observing the expected
      failure. `pnpm run format:check`, `pnpm run typecheck`, `pnpm build`, and
      `pnpm test` pass with 295 tests passed and 2 skipped. `pnpm run ci` is
      blocked at the pre-existing `prettier.config.cjs` ESLint `module`
      `no-undef` error; its format and typecheck stages pass.

- [x] **CO-009 — Version the create, rematch, invite, and piece contracts**
      Blocked by: CO-008
      Requirements: ENG-029, PRD-FUN-021, UX-041, UX-042, CONTENT-016
      Read: contracts API/projection schemas, create/join/rematch handlers, updated
      UX specification
      Changes: replace `seatCount` input with `humanSeatCount` and `botSeatCount`;
      add `hostName` and `hostToken`; derive persisted total seats server-side;
      add available pieces to open invite status; replace neighborhood piece shape
      IDs with Lantern/Key/Crescent/Tower/Fox/Teapot IDs; return structured stale-
      piece conflicts suitable for UI recovery.
      Acceptance: Humans include the host, combined seats validate to 2–6, bots
      validate to 0–5, rematch shares the same semantics, capabilities remain only
      in secure cookies, and malformed/unknown fields are rejected.
      Proves: strict schema tables, route tests, simultaneous piece-claim test, and
      analytics payload review for capability/name leakage.
      Evidence: CreateGameRequest and JoinGameRequest now use host-inclusive
      humanSeatCount/botSeatCount fields, required hostName/hostToken, and strict
      PieceId values; persisted total seats are derived server-side and invite
      status returns only open piece records. Create, join, rematch, and focused
      contract suites pass (300 tests pass, 2 skipped); the six-seat boundary test
      was mutation-checked. Concurrent browser and accessibility evidence remains
      assigned to CO-019–022.

- [x] **CO-010 — Introduce multi-kind improvement content contracts**
      Blocked by: CO-009
      Requirements: CONTENT-015, ENG-030, RULE-014
      Read: game-content types/validator/canonicalizer and updated content spec
      Changes: replace scalar `inventoryDelta` with immutable
      `inventoryDeltas: Record<string, integer>` per level transition; validate
      known kinds, safe integers, reversible transitions, nonnegative bank start
      quantities, and reachable four-House/Hotel schedules; update canonical hash
      fixtures without modifying archived goldens.
      Acceptance: content can express House consumption, four-House return plus
      Hotel consumption, and the reverse exchange without choosing an implicit
      first inventory kind.
      Proves: valid transition fixtures and targeted failures for missing,
      fractional, unknown, impossible, and non-conserving deltas.
      Evidence: `ImprovementLevel` now carries immutable per-kind signed maps;
      placeholder content expresses four House levels plus the House/Hotel
      exchange; validator tests cover all targeted failure classes and a
      mutation of unknown-kind rejection failed as expected. The current
      canonical hash was updated while the archived scalar golden remains
      unchanged. Formatting, typecheck, build, and 305 tests (2 skipped) pass;
      `pnpm run ci` remains blocked only by the pre-existing `module` no-undef
      error in `prettier.config.cjs`. Atomic engine event/state migration remains
      assigned to CO-011.

- [x] **CO-011 — Version engine events, state, and projections for piece maps**
      Blocked by: CO-010
      Requirements: ENG-030, RULE-014
      Read: engine event application/resolution, contracts projections, persistence
      snapshot metadata
      Changes: represent improvement demand and inventory change as complete
      per-kind maps; apply every kind atomically; update events, snapshots,
      projections, legal-action detail, auction state, restore integrity, and
      replay fixtures; bump state/event/engine versions explicitly.
      Acceptance: a transition either applies all cash, level, House, and Hotel
      changes or none; replay reconstructs the same inventory and deed levels.
      Proves: reducer/replay tests for both transition directions, rejection of
      partial inventory, and projection schema round trips.
      Evidence: engine/state versions moved to `0.2.0`/`2.0.0`; improvement
      buy, sell, scarce-demand, auction settlement, bankruptcy liquidation,
      replay, invariants, and legal-action detail now carry complete signed
      per-kind maps. `packages/game-engine/test/improvements.test.ts` proves
      both-kind replay and rejects a partial map; the test was mutation-checked
      by temporarily allowing partial application and observing failure.

## Phase C — Build and prove the classic ruleset

- [ ] **CO-012 — Implement and register the production 1.0.0 board bundle**
      Blocked by: CO-011
      Requirements: CONTENT-012–016, PRD-FUN-020
      Read: the complete CO-003 content table and game-content validator
      Changes: encode all 40 spaces, 28 ownable deeds, eight color sets, prices,
      rents, mortgages, fees, route order, corner destinations, layout hints,
      economy constants, and six pieces; register it as readable but do not switch
      the environment default yet.
      Acceptance: the bundle hashes canonically, validates with zero issues, and
      exact count/order/economy tests match the authoritative content table.
      Proves: immutable content golden, count tables, referential validation, and
      a deliberate corruption test for each major content category.

- [ ] **CO-013 — Implement the two complete event-card decks**
      Blocked by: CO-012
      Requirements: CONTENT-012–014, RULE-013
      Read: CO-003 deck tables, effect DSL, card engine tests
      Changes: encode two separately identified 16-card decks, including movement,
      bank payment/collection, per-player transfer, repair assessment, detention,
      and retainable release-card effects; add original display copy and provenance
      records.
      Acceptance: every card resolves through the bounded effect queue, movement
      observes Start/detention rules, retained cards leave and re-enter circulation
      correctly, and future deck order remains private.
      Proves: one deterministic scenario per effect family, deck exhaustion/
      reshuffle tests, held-card lifecycle tests, and human prose review.
      Completion mark: `[?]` until original card copy is owner-approved.

- [ ] **CO-014 — Implement four-House and Hotel transitions**
      Blocked by: CO-013
      Requirements: RULE-014, CONTENT-015, ENG-030
      Read: updated engine spec, improvement resolver, mortgage/debt/bankruptcy code
      Changes: implement even building/selling through level five, House-to-Hotel
      exchange, Hotel-to-House downgrade, finite 32/12 supply, blocked downgrade
      when replacement Houses are unavailable, mortgage constraints, liquidation,
      and inventory returns on bankruptcy.
      Acceptance: cash, deed level, and both bank inventories remain conserved for
      buy, sell, transfer, bankruptcy, and replay paths.
      Proves: exhaustive transition table for levels 0–5, inventory boundary tests,
      bankruptcy scenarios, and conservation property tests.

- [ ] **CO-015 — Reconcile all standard classic rule scenarios**
      Blocked by: CO-014
      Requirements: RULE-013, PRD-FUN-020, TEST-008
      Read: updated canonical rules and all engine scenario suites
      Changes: compare existing reducer behavior to every standard rule and close
      gaps for doubles/extra turns, detention, acquisition, mandatory auction,
      complete-set rent, transits, utilities, mortgages, trades, ordered cards,
      fees, debt, bankruptcy, and winner detection. Preserve the eight variant
      branches with Standard all-false.
      Acceptance: the production bundle can complete every canonical scenario
      without placeholder-specific assumptions or manual state mutation.
      Proves: immutable golden scenarios for each rule family and table tests for
      every variant independently and in documented interactions.

- [ ] **CO-016 — Upgrade bot policy and simulations for the full board**
      Blocked by: CO-015
      Requirements: PRD-FUN-011, CONTENT-013, TEST-008
      Read: bot policy, soak runner, full classic bundle
      Changes: ensure bots reason over all properties, auctions, Houses, Hotels,
      mortgages, trades, detention, and debt; retain one deterministic difficulty
      and public-state-only decisions; update explanations to familiar language;
      expand simulations to 2–6 seats and mixed human/bot seats.
      Acceptance: bots never emit illegal actions, complete seeded games across
      every seat count, and do not stall on Hotel scarcity or debt resolution.
      Proves: fixed-seed scenario matrix, property test against `legalActions`, and
      bounded soak/performance report with failure seeds recorded.

## Phase D — Retire placeholder games and activate the new default

- [ ] **CO-017 — Implement idempotent placeholder-game retirement**
      Blocked by: CO-016
      Requirements: PRD-FUN-024, ENG-031, UX-047
      Read: command transaction path, maintenance/cleanup tooling, summary
      projections, retention policy
      Changes: add a dry-run and execute mode selecting non-terminal games with
      `contentVersion=0.0.0-placeholder`; transactionally append a no-contest end
      event with `CONTENT_RETIRED`, freeze commands, revoke capabilities, set the
      normal completed-game expiry, audit the operation, and broadcast after
      commit. Preserve read-only summaries.
      Acceptance: repeated execution changes nothing after the first success;
      interrupted batches resume safely; unrelated versions are untouched; lobby,
      active, paused, and already-terminal cases behave explicitly.
      Proves: replica-set integration tests for dry-run counts, transaction rollback,
      retry/idempotency, revocation, ordering, and 30-day retention.

- [ ] **CO-018 — Switch configuration and deployment defaults to content 1.0.0**
      Blocked by: CO-017
      Requirements: PRD-FUN-020, ENG-027, ENG-031
      Read: environment schema, bundle registry, deployment/operations docs
      Changes: make 1.0.0 the default for new games, reject placeholder creation in
      production, keep its reader for retained summaries, update examples and
      no-Mongo build behavior, and document the staged retirement/deploy sequence.
      Acceptance: every new game captures 1.0.0 and its schema/hash versions;
      retained placeholder summaries render; unsupported versions fail explicitly.
      Proves: creation/boot/config tests with and without `MONGODB_URI`, registry
      production-policy tests, and deployment dry run.

## Phase E — Rebuild creation, admission, and lobby

- [ ] **CO-019 — Build reusable piece picker and seat-stepper primitives**
      Blocked by: CO-018
      Requirements: CONTENT-016, UX-041, UX-042, DS-071–073
      Read: design system, UI primitives, presentation-preference code
      Changes: create accessible original-piece cards and a labelled stepper with
      minus/value/plus controls, disabled bounds, keyboard activation, live value
      text, and no numeric input; render shape/color/pattern redundantly; add a seat
      tray component for Humans, invitation slots, and Computers.
      Acceptance: controls work at 320 CSS px, 400% zoom, forced colors, keyboard,
      touch, and screen reader; wheel scrolling cannot change a count.
      Proves: component/model tests, explicit wheel regression, axe, focus order,
      and forced-color snapshots.

- [ ] **CO-020 — Rebuild the one-page create flow**
      Blocked by: CO-019
      Requirements: PRD-FUN-021, UX-041, ENG-029
      Read: create form/model/route and updated UX/content copy
      Changes: collect required host pseudonym and piece, optional table name,
      Human/Computer counts, collapsed rule summary, and age acknowledgement;
      default to two Humans/zero Computers/Standard; preview exact resulting seats;
      submit the new strict contract and preserve safe pending/error behavior.
      Acceptance: every valid combination from 2–6 creates the intended host,
      open-human, and bot seats; invalid boundaries explain how to recover; one
      submit produces one game and no credential enters body, URL, storage, or
      analytics.
      Proves: model tables, route tests, rapid-double-submit test, accessibility
      test, and Playwright happy/error paths.

- [ ] **CO-021 — Rebuild join admission around available pieces**
      Blocked by: CO-020
      Requirements: UX-042, ENG-029, PRD-FUN-003
      Read: invite status, join gate/model/route, capability policy
      Changes: show only server-reported open pieces, combine pseudonym and piece
      choice into a short entry surface, visually distinguish unavailable choices,
      and refresh after a concurrent claimant wins. Preserve name normalization,
      privacy copy, age acknowledgement, and secure cookie issuance.
      Acceptance: a player cannot displace an occupied/bot seat; stale conflicts
      retain safe form values, refresh availability, and request another choice.
      Proves: two-context race test, name collision tests, invite-state tests, axe,
      and capability-leak assertions.

- [ ] **CO-022 — Rebuild the lobby as a table preview**
      Blocked by: CO-021
      Requirements: UX-043, PRD-FUN-004–005, DS-073
      Read: lobby client/model, host/recovery commands, updated UX
      Changes: arrange seats and pieces around a miniature classic board; make
      invite copy/share primary while slots remain; show claimed Humans, open Human
      slots, and Computers distinctly; attach host bot/remove controls to seats;
      collapse rule editing behind a concise Standard/Custom summary; explain the
      exact unmet start condition.
      Acceptance: all planned Human slots must be claimed before start; no new
      ready-state exists; host/non-host capabilities and safe-boundary behavior are
      unchanged; 2–6 seat arrangements reflow without horizontal page scroll.
      Proves: lobby model/state table, host authorization integration tests,
      responsive Playwright screenshots, axe, and keyboard traversal.

## Phase F — Rebuild the live table

- [ ] **CO-023 — Implement the semantic 40-space board and deed grammar**
      Blocked by: CO-022
      Requirements: UX-044, UX-045, DS-071–072
      Read: board view/list, active-space model, design system, content layout
      Changes: replace the winding-circle visualization with a square perimeter
      board; render corner cells, property bands, deed types, Houses/Hotels,
      mortgage/owner state, and stacked pieces; make visual spaces inspectable and
      keep the ordered DOM list equivalent; use canonical IDs and presentation-only
      labels.
      Acceptance: all 40 cells remain legible and selectable at desktop sizes,
      the fitted phone overview has no page-level horizontal overflow, and the
      list exposes every fact/action conveyed spatially or by color.
      Proves: topology rendering tests, keyboard/list equivalence tests, 2–6 token
      overlap cases, and cross-browser visual snapshots.

- [ ] **CO-024 — Build the desktop classic-table workspace**
      Blocked by: CO-023
      Requirements: PRD-FUN-022, UX-044, UX-046, DS-073
      Read: game client, player strip, action bar, active detail, event feed
      Changes: center the board; place player order/cash/connectivity on the left,
      the single current decision on the right, and the local deed hand below;
      demote bank inventory/history to secondary surfaces; keep pause/reconnect and
      last-confirmed-state messaging visible without competing with the action.
      Acceptance: at 1280 CSS px the board is the visual anchor, every phase has
      exactly one primary action, and no existing legal action becomes unreachable.
      Proves: legal-action-to-control coverage table, phase screenshots, axe,
      keyboard-only scenario, and stale/pending/rejected command tests.

- [ ] **CO-025 — Build the mobile overview, focus, and navigation shell**
      Blocked by: CO-024
      Requirements: PRD-FUN-023, UX-045, DS-073
      Read: responsive shell CSS, board/detail/list, presentation preferences
      Changes: add compact turn/cash/connectivity header, fitted board overview,
      authoritative active-space following, tap-to-focus/zoom, focus escape/reset,
      bottom action sheet, and Board/Properties/Trade/History navigation; retain
      the ordered list and prevent page-level pan/zoom traps.
      Acceptance: required decisions, cash/debt, roll result, and position work at
      320 CSS px; deliberate inspection persists until the authoritative active
      space changes; browser zoom remains enabled.
      Proves: state-model tests for follow versus manual inspection, 320/375/400%
      Playwright runs, orientation changes, touch targets, and screen-reader path.

- [ ] **CO-026 — Rebuild the property hand and management interactions**
      Blocked by: CO-025
      Requirements: UX-046, RULE-014, PRD-FUN-009–010
      Read: management panel/model, deed projections, House/Hotel legal actions
      Changes: group owned deeds by color set; display rent level, Houses/Hotel,
      mortgage status, build cost, and blocked reason; provide direct Build, Sell,
      Mortgage, Redeem, and Trade entry; update bank inventory labels and scarcity
      demand for both piece kinds.
      Acceptance: every property action derives from `legalActions` or displays its
      authoritative `actionAvailability` reason; multi-step changes remain atomic;
      no client preview is presented as confirmed state.
      Proves: action-availability tables, House/Hotel boundary tests, debt-mode
      management tests, and responsive/axe checks.

- [ ] **CO-027 — Rebuild acquisition, auction, trade, detention, and debt decisions**
      Blocked by: CO-026
      Requirements: UX-044–046, RULE-013–014
      Read: action bar, auction summary, trade panel, detention/debt panel
      Changes: render each blocking phase as one foreground decision card/sheet;
      show exact property/card/payment context, current actor, minimum bid, cash,
      blocked reasons, continuations, and destructive confirmations; maintain
      untimed behavior and pause when a required human disconnects.
      Acceptance: no decision surface exposes unrelated primary actions; focus is
      placed on new required decisions and restored safely when they close; retry
      never duplicates a command.
      Proves: one browser scenario per blocking phase, focus-management tests,
      disconnected-actor cases, duplicate command tests, and live announcements.

- [ ] **CO-028 — Rebuild event history, reconnect, and authoritative motion**
      Blocked by: CO-027
      Requirements: UX-044–046, PRD-FUN-006, PRD-FUN-014
      Read: sync client, live announcements, event feed, recovery panel
      Changes: animate piece movement only from confirmed events; provide immediate
      reduced-motion transitions; group readable history without hiding sequence;
      distinguish connecting, live, stale, paused, rejected, and closed states;
      keep bot replacement/reclaim/host transfer at safe boundaries.
      Acceptance: losing connectivity cannot fabricate movement, pass, bid, trade,
      or bankruptcy; reconnect converges to the authoritative snapshot and event
      sequence; announcements avoid duplicate noise.
      Proves: sync gap/resume tests, reduced-motion browser checks, multi-context
      disconnect/reclaim scenarios, and event ordering assertions.

- [ ] **CO-029 — Rebuild completion, retirement summary, and rematch**
      Blocked by: CO-028
      Requirements: UX-047, PRD-FUN-015, PRD-FUN-021, PRD-FUN-024
      Read: summary client/route, rematch form/route, retirement behavior
      Changes: present winner/no-contest, standings, variants, duration, and history
      as a table result; show specific retired-content explanation; rebuild rematch
      with Human/Computer steppers, host identity/piece, and rules summary; create a
      fresh game without carrying balances/assets/authority.
      Acceptance: normal win, host no-contest, expired, and content-retired results
      are distinguishable; rematch uses new contracts and issues fresh capabilities.
      Proves: summary projection tests, rematch route/model tests, capability
      separation checks, and responsive browser scenarios.

## Phase G — Release evidence and documentation closure

- [ ] **CO-030 — Add full multiplayer and visual-regression coverage**
      Blocked by: CO-029
      Requirements: TEST-008, TEST-009
      Read: test strategy, Playwright configuration, all new UI requirements
      Changes: add Chromium/Firefox/WebKit scenarios with separate browser contexts
      for create, concurrent join, lobby, start, purchase, auction, management,
      trade, detention, debt, bankruptcy, reconnect, completion, and rematch; capture
      stable screenshots for principal desktop/mobile states and classic colors.
      Acceptance: tests exercise real authenticated sync and authoritative commands
      against an ephemeral replica-set MongoDB; screenshots have deterministic data
      and no capability values.
      Proves: green cross-browser report, reviewed baselines, deliberate UI
      regression observed red, and restored green run.

- [ ] **CO-031 — Complete accessibility and mobile-style failure evidence**
      Blocked by: CO-030
      Requirements: UX-041–047, DS-071–073, TEST-009
      Read: accessibility checklist, design system, responsive test suite
      Changes: make the previously observed unstyled iPhone capture a regression
      test; run axe across all principal states; verify 320 px, 200%/400% zoom,
      forced colors, dark mode if retained, reduced motion, orientation, keyboard,
      touch, VoiceOver, and NVDA; record human steps and results.
      Acceptance: no critical/serious axe findings, no horizontal page overflow,
      no missing stylesheet state, every action has a semantic equivalent, and
      human assistive-technology results are attached.
      Proves: automated reports plus named manual evidence.
      Completion mark: `[?]` until VoiceOver and NVDA evidence is signed by a human.

- [ ] **CO-032 — Perform the final all-Markdown truth sweep**
      Blocked by: CO-031
      Requirements: all IDs introduced or changed by CO-001–031
      Read: every file returned by `rg --files -g '*.md'`, implementation diff,
      test evidence
      Changes: reconcile all current-state claims, commands, versions, screenshots,
      requirements, links, status labels, runbooks, and traceability; preserve dated
      historical records; consolidate `gnhf-cli2.md`; ensure `docs/README.md`
      registers every document and accurately names its authority/status.
      Acceptance: every Markdown document is current or explicitly historical;
      every normative statement has the correct bounded ID; every Implemented or
      Verified claim points to actual code, test evidence, and required approval.
      Proves: document inventory diff, link/anchor checker, duplicate/missing ID
      checker, stale-phrase search, and manual sample of traceability links.

- [ ] **CO-033 — Rehearse migration, deployment, canary, and rollback**
      Blocked by: CO-032
      Requirements: ENG-031, OPS-001–010, TEST-008–009
      Read: deployment, operations, backup/restore, observability, and load runbooks
      Changes: back up and verify restore; dry-run placeholder retirement; execute
      it in staging; deploy code that reads both bundles but creates only 1.0.0;
      verify create/join/start/play/reconnect/summary/rematch canaries; record
      rollback steps that retain ended summaries and immutable versions.
      Acceptance: rehearsed commands, expected counts, dashboards, alerts, rollback
      bounds, and named human checkpoints are recorded with timestamps; no step
      depends on deleting retained game data.
      Proves: staging drill evidence, backup/restore evidence, canary transcript,
      and rollback rehearsal.

- [ ] **CO-034 — Final release gate and placeholder-reader removal schedule**
      Blocked by: CO-033
      Requirements: PRD-NFR-011, ENG-027, ENG-031, all release requirements
      Read: traceability, licensing/NOTICE, content provenance, accessibility and
      deployment evidence
      Changes: verify every requirement disposition, owner approval for magical
      names/card prose, license/attribution completeness, accessibility sign-off,
      clean CI/build, and production canary readiness; document the earliest date
      the placeholder reader may be removed after all retained summaries expire.
      Acceptance: no unresolved release-blocking row remains; `pnpm run ci` and
      `pnpm build` pass without `MONGODB_URI`; removal is a dated future maintenance
      action rather than part of this release.
      Proves: signed release checklist, final traceability export, CI/build logs,
      and retention query showing the scheduled reader-removal boundary.

---

## Observed, not queued

Record discoveries here in one or two lines. Include the discovering ticket and
affected requirement IDs. The project owner decides whether they belong in a
later queue.

- None at queue creation.
