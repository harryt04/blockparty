# Watchable gameplay experience plan

**Status:** planning proposal; not an implementation ticket or normative authority
**Audience:** product designer, frontend engineer, realtime/server engineer, QA, accessibility reviewer
**Scope:** live table readability, bot-turn pacing, dice presentation, piece movement, and full-board visibility
**Out of scope:** copying Monopoly names, artwork, trade dress, cards, or board data; changing the pure engine's random outcomes; adding a ninth rule toggle; adding gameplay deadlines

## 1. Outcome

Blockparty should feel like a shared tabletop game instead of an event log with a board attached. A person watching another Human or a Computer should be able to answer, without opening History:

1. Whose turn is it?
2. What did they choose?
3. What did the dice show?
4. Where did their piece start, which way did it travel, and where did it land?
5. What happened because it landed there?
6. What changed in cash, ownership, detention, or turn order?

The target is the familiar **scale and legibility** of a classic property-trading game, expressed entirely through Blockparty's original world and assets. The target is not a visual or textual reproduction of Monopoly.

The default experience should stage a Computer turn over roughly 2–4 seconds when it contains a roll and movement. Complex turns may take longer because they contain more confirmed decisions. The authoritative result remains available immediately in text, every presentation step is skippable, and reduced-motion users receive the same information without movement interpolation.

## 2. Guardrails the implementation must preserve

- **Server authority:** animation presents committed events. It never chooses dice, predicts a destination, optimistically transfers money, or invents a bot choice.
- **Pure engine:** no delay, clock, animation, DOM, transport, or IO enters `packages/game-engine`.
- **Recorded randomness:** the server still records dice and chance outcomes as events. A rolling visual is an acknowledgement of a confirmed random result, not the source of randomness.
- **No gameplay timers:** presentation pacing is not a turn deadline, auction clock, automatic pass, or timeout. It cannot change what actions are legal.
- **Network truth:** the latest authorized snapshot remains the source of legal controls. A presentation queue may not let the user submit against an old version.
- **Final state remains available:** dice and token motion cannot conceal a resolved outcome. Show a concise textual result as soon as the event is confirmed and provide **Skip animation**.
- **Reduced motion:** replace interpolation with immediate placement plus the same visible summary and live announcement.
- **Immutable game versions:** derive names, route order, and presentation facts from the game's captured `contentVersion`, never the deployment default.
- **Original expression:** retain the 40-space, 28-deed classic-scale structure while using only the approved Blockparty names, copy, pieces, and visual language.
- **Exactly eight variants:** pacing and animation controls are device-only presentation preferences, never room rules or a ninth variant.

## 3. Evaluation of the current experience

### 3.1 What is already correct

- `CLASSIC_BUNDLE` is the default for new games.
- The validated `1.0.0` content bundle contains 40 ordered spaces and 28 ownable deeds: 22 district deeds, four portal-line deeds, and two utility deeds.
- The board is semantic HTML rather than a canvas and has an ordered-list equivalent.
- Dice, movement, bot rationale, payments, and ownership changes already exist as authoritative domain events.
- The UI refuses to animate movement until a newer authorized snapshot contains a valid `TokenMoved` event.
- Motion can already be removed with the operating-system or Blockparty reduced-motion preference.

These are the right integrity primitives. The problem is presentation and delivery granularity, not missing game mechanics.

### 3.2 Finding A: the full board is not fully visible

**Evidence**

- `BoardView` renders an 11 × 11 square whose width can reach 42rem.
- The desktop `.game-board-viewport` is capped at 30rem/62dvh high.
- The square therefore becomes taller than its viewport at common desktop widths and is placed in an internally scrolling container.
- The checked-in 1280px board baseline visibly cuts off the bottom row.

**User impact**

The data contains the complete board, but the primary visual anchor does not show the complete perimeter. A person can reasonably conclude that properties are missing. The scroll container also makes route continuity and piece tracking harder.

**Required correction**

At desktop and tablet widths, size the square from the smaller of the available width and height. All 40 cells must be simultaneously visible at the default 100% view. Internal pan/zoom may remain as an inspection enhancement, but never as a requirement for discovering the bottom or side of the route. At phone widths, the fitted overview must also show all 40 cells; readable detail belongs in the focused detail and ordered list.

### 3.3 Finding B: pieces are cell contents, not board actors

**Evidence**

- `OccupantStack` renders each piece inside the destination cell's normal layout.
- Pieces are approximately 20px, clipped by the cell's `overflow-hidden`, and visually compete with labels, price, state, and group band.
- Multiple occupants overlap in a small flex stack.
- The active-space selection outline can be more visually prominent than the pieces themselves.

**User impact**

The board tells the viewer which cell is selected more strongly than it tells them where each player physically is. A moving piece is easy to lose, particularly on a dense 40-cell perimeter or on a phone.

**Required correction**

Render player pieces in a dedicated absolute overlay above the board grid. Cell labels remain below it and are never reflowed by a piece. Pieces need a strong outline/halo, stable silhouette and pattern, player association, collision layout, and a higher emphasis for the current mover. Selection is inspection state; it must not impersonate player position.

### 3.4 Finding C: movement is an arrival flash, not travel

**Evidence**

- `confirmedMovement()` chooses only the last `TokenMoved` event between snapshots.
- `PlayerToken` is remounted with a movement-sequence key only at the destination.
- `.game-token-arrival` changes opacity and scale for 220ms.
- There is no ordered route traversal or movement queue.

**User impact**

The old piece disappears and a dimmer/scaled piece appears at the destination. This reads as flicker. When multiple confirmed movements arrive together, all but the last can be visually skipped.

**Required correction**

Convert each confirmed `TokenMoved` event into a presentational route path. Move a persistent overlay piece from cell center to cell center, keeping opacity at 1. Use transform-only animation and emphasize each crossed cell briefly without reflowing the board. Queue every movement event in sequence instead of selecting only the last one.

### 3.5 Finding D: bot execution outruns human perception

**Evidence**

- The command route commits the Human action and then awaits `runBotTurns()` before returning the Human acknowledgement.
- `runBotTurns()` may execute up to 64 bot actions in a tight loop before yielding.
- Each bot action is authoritative and transactional, but no presentation cadence exists.
- The change-stream consumer reloads the current game document for each inserted event. When bot transactions outrun the consumer, early inserts can publish projections that already contain later bot outcomes.

**User impact**

The person may wait on their own button, then receive a burst or one large jump. Turn changes, rolls, movement, acquisition, rent, and an end turn can collapse into a final state. The event log retains evidence but the live table fails to tell the story.

**Required correction**

Return the Human command acknowledgement after its transaction commits. Move bot continuation out of the response-critical path. Deliver enough ordered, authorized presentation data for each committed bot command, and let the client play those committed steps through a bounded queue. Do not add sleeps inside the engine or hold a database transaction open for animation.

### 3.6 Finding E: dice are a static after-the-fact number

**Evidence**

- The live table derives the latest two dice from `DiceRolled` and prints the total.
- There is no dice component, roll stage, or visual connection between the Roll action, dice result, and piece movement.

**User impact**

An instantaneous number provides weak physical feedback and can feel untrustworthy, even though the server outcome is recorded and replayable. Animation does not make a roll more random, but a well-staged confirmed result makes the cause-and-effect legible.

**Required correction**

Add a two-die presentation in the board center/turn stage. Once a confirmed `DiceRolled` event arrives, show the exact result in text immediately, animate a short shake/tumble, settle on the two confirmed faces, then hand off to movement. Label it **Server roll** or equivalent trust copy. Never animate uncommitted provisional faces as though they were the authoritative outcome.

### 3.7 Finding F: the event log is doing the job of the table

**Evidence**

- Bot rationale and fine-grained outcomes are primarily represented in History and live announcements.
- The center of the board contains only a static Blockparty label.
- There is no visible current-turn narrative or recent-turn recap tied to the board.

**User impact**

People must read audit data to understand ordinary play. This is backwards: History should answer disputes and support review, while the table should explain the current moment.

**Required correction**

Use the board center as a restrained **turn stage**: actor, dice, concise action, landing result, and a compact cash/ownership delta. Keep the full journal in History, but make normal play understandable without opening it.

## 4. Target interaction model

### 4.1 Persistent table hierarchy

At every viewport the hierarchy is:

1. **Board and pieces:** where everyone is.
2. **Current turn stage:** who is acting and what just happened.
3. **Required decision:** what the local Human can do now, if anything.
4. **Player/cash context:** who is ahead, connected, detained, or eliminated.
5. **Inspection and History:** deeper facts and the audit trail.

The current decision remains dominant when the local Human must act. During another player's turn, the turn stage becomes dominant without covering the board.

### 4.2 Human roll storyboard

1. The active Human sees **Roll dice** as the one primary action.
2. Activation locks duplicate submission immediately and changes the button label to **Rolling…**.
3. The server commits `DiceRolled` and its ordered consequences through the normal command path.
4. On confirmation, the UI shows `Server roll: 3 + 5 = 8` in visible text and announces it once.
5. The dice visual performs a 600–800ms transform-only tumble and settles on 3 and 5. This motion is decorative; the confirmed text is already present.
6. The player's overlay piece advances eight visible stops at roughly 90–120ms per stop, capped near 1.2 seconds. The camera does not scroll the page.
7. The destination receives a brief non-scaling emphasis. Active-space detail updates to the landing location.
8. A landing outcome card appears for 700–1,200ms or remains until a Human decision is made: for example, **Available Property · 120 Tabs**, **Paid Maya 18 Tabs**, or **Draw Moonletters**.
9. If a decision is required, focus moves to the authoritative decision surface after motion completes. If no decision is required, the next confirmed stage begins.

### 4.3 Computer turn storyboard

1. Turn handoff: **Cinder's turn · Computer** appears for 350–500ms.
2. Decision: present the already-confirmed bot rationale as plain language, for example **Cinder chose to roll** or **Cinder passed: bid exceeded its valuation**. Do not show a fake “thinking” spinner once the choice has already committed.
3. Dice: show the same confirmed two-die presentation used for a Human.
4. Movement: move Cinder's persistent piece stop by stop.
5. Landing: show the Property/card/fee/rent result and the visible delta.
6. Follow-up: show acquisition, auction, debt, detention, build, or end-turn decisions in order.
7. Handoff: do not begin the next actor's presentation until the current actor's queued stages finish or the viewer skips them.

Default target durations:

| Stage | Default | Reduced motion | Notes |
| --- | ---: | ---: | --- |
| Turn handoff | 400ms | immediate | Keep actor name and piece visible |
| Confirmed dice | 700ms | immediate | Result text appears immediately in both modes |
| Movement | 90–120ms per crossed stop, max 1,200ms | immediate destination | No opacity dip; transform only |
| Landing result | 800ms minimum | immediate persistent summary | Persist longer when it creates a decision |
| Simple bot choice | 600ms | immediate | Use confirmed rationale, not fake thinking |
| Major outcome | 1,200ms minimum | immediate persistent summary | Acquisition, rent, card, detention, bankruptcy |

These values are starting acceptance budgets, not gameplay rules. Validate them with people watching 2-, 4-, and 6-seat games and adjust in the presentation layer.

### 4.4 Multiple confirmed events and catch-up

- Build presentation steps from authoritative events in ascending `sequence` order.
- Keep a `lastPresentedSequence` separate from the sync client's authoritative cursor.
- Never discard intermediate dice, movement, landing, acquisition, auction, rent, card, detention, bankruptcy, or turn-start steps merely because a newer snapshot arrived.
- Coalesce bookkeeping events into one readable outcome when they share an aggregate version. Do not coalesce different actors, different rolls, or different movements.
- Bound the queue. If the tab returns after a long absence or more than 20 seconds of presentation is waiting, show the final authorized state immediately and a **Catch up: N turns** summary with **Play recap** and **Skip to live**.
- **Skip to live** clears presentation-only steps, never authoritative state or History.
- While the visual presentation lags the authoritative model, disable game-changing controls and label the state **Catching up to live play**. Inspection remains available.

### 4.5 Dice trust language

Animation must not claim to create randomness. Use concise language that explains the real trust boundary:

- `Server roll`
- `Confirmed: 3 + 5 = 8`
- Accessibility/help copy: `The server generates and records each roll before the animation plays. The animation cannot change the result.`

Do not show rapidly cycling fake face values before the confirmed result. A neutral tumbling shape can provide physical feedback; the settled faces and visible text always match `DiceRolled`.

### 4.6 Piece overlay behavior

- One overlay layer covers the board grid and uses the same coordinate model as the cells.
- Desktop piece target: 28–36px visual size with a 2px contrasting halo; phone fitted overview: 20–28px where geometry permits.
- Preserve the original silhouette, player color, pattern, and accessible name.
- The local piece gains a persistent **You** association in the player rail and a restrained double-ring on the board.
- The current mover is raised above other pieces with `z-index`, not scale-induced cell reflow.
- When 2–3 pieces share a cell, fan them around the cell center. When 4–6 share it, use a compact radial stack plus a count. Keyboard/screen-reader inspection lists every occupant in seat order.
- A piece remains visible above labels and ownership styling. It may overlap nonessential cell copy but never the board boundary or a required action.
- Movement uses one stable DOM node per seat. Do not change the React key to manufacture an arrival animation.
- Destination emphasis uses an outline or short pulse on a separate marker; never lower the piece opacity.

### 4.7 Full-board fit

- Replace width-only sizing with an aspect-ratio container constrained by both available inline size and block size.
- Desktop acceptance: at 1280 × 720 and 1280 × 800, all four corners and every perimeter cell are visible without board scrolling at 100%.
- Tablet acceptance: at 768 × 1024, all 40 spaces are visible in the overview and no page-level horizontal scroll exists.
- Phone acceptance: at 320 × 568 and 375 × 667, all 40 spaces are visible in the overview; names may be abbreviated visually but remain complete in focused detail and accessible labels.
- Zoom is optional inspection. **Reset** and **Follow active piece** restore the fitted view.
- The board-list heading must report `40 stops`; add a visible content/version diagnostic only in development, never internal IDs as primary player copy.

## 5. Technical delivery design

### 5.1 Workstream 0: register the new scope before implementation

This request goes beyond the current UX-044/045 and DS-050 wording. Do not silently widen those requirements.

1. Add a new PRD requirement after owner approval, recommended as `PRD-FUN-025`, for watchable confirmed turn presentation.
2. Add `UX-048` for turn staging, queue/catch-up behavior, and non-History comprehension.
3. Add `UX-049` for full-board fit and persistent over-board pieces.
4. Add `DS-074` for dice, piece overlay, collision, pacing, skip, and reduced-motion grammar.
5. If transport contracts change, add the next bounded `PROTO-*` requirement rather than broadening PROTO-002–004 implicitly.
6. Add the corresponding verification rows to `docs/traceability.md` in the same change.
7. Create implementation tickets only through the owner's queue process. This plan deliberately does not add a ticket to the active backlog.

### 5.2 Workstream 1: decouple Human acknowledgement from bot continuation

Primary files to inspect/change:

- `apps/web/src/app/api/games/[gameId]/commands/route.ts`
- `apps/web/src/server/commands/run-bot-turn.ts`
- `apps/web/src/server/commands/handle-command.ts`
- server lifecycle/shutdown code

Instructions:

1. Return the accepted Human command acknowledgement after the Human transaction commits and the post-commit publish trigger is established.
2. Schedule bot continuation outside the response-critical path using a server-owned, recoverable mechanism compatible with the single Coolify web service.
3. Execute one bot command through the normal transactional command path at a time. Re-read authority and expected version before every action.
4. Preserve the safe command boundary for replacement, reclaim, host transfer, and no-contest.
5. Make bot work idempotent and restart-safe. A process crash after a commit must allow the next runner to discover and continue the still-active bot decision without duplicating the prior command.
6. Do not hold a MongoDB transaction open while waiting for UI pacing.
7. Do not use a fixed sleep as the source of correctness. If a small server pacing interval is retained to reduce burst load, document it as delivery backpressure, make it independent of rules, and prove that skipped/absent clients cannot stall the game.
8. Preserve the bot-only-game continuation case and the existing bounded work budget.

Preferred server design:

- Persist or derive **bot work is due** from authoritative game state.
- Use a per-game single-runner claim/lease or equivalent optimistic claim so one process owns the next bot command.
- After each bot command commits, publish that committed projection boundary before scheduling the next command.
- Keep presentation speed client-side. The server guarantees ordered committed boundaries, not that every viewer watches every millisecond.

### 5.3 Workstream 2: preserve committed presentation boundaries

Primary files to inspect/change:

- `apps/web/src/server/sse/change-stream.ts`
- `apps/web/src/server/sse/registry.ts`
- `apps/web/src/server/sync/recovery.ts`
- `packages/contracts/src/envelope.ts`
- `packages/contracts/src/projections.ts`

The current change-stream consumer may reload a game state newer than the event that triggered it. The implementer must choose and document one safe contract:

**Recommended: versioned authorized presentation frames.** Store or construct a seat-authorized projection checkpoint for each committed aggregate version that needs to be presented. Send the checkpoint with its exact `aggregateVersion` and terminal event sequence. Catch-up can return ordered checkpoints plus event ranges within a strict size bound.

Alternative: publish the exact in-memory post-commit seat projections before starting the next bot action, while keeping MongoDB recovery authoritative. This is simpler but requires a durable fallback capable of reconstructing missed presentation boundaries after reconnect.

Whichever contract is selected must prove:

- A frame labeled version N never contains state from version N+1.
- Seat-private capability data never enters a frame, event, log, or cache.
- Dropped SSE delivery still converges from MongoDB.
- Reconnect can skip directly to the latest state or request a bounded recap without replaying the engine in the browser.
- Started games continue to use their captured content/rules/state versions.
- One command transaction still commits before broadcast.

### 5.4 Workstream 3: add a presentation coordinator

Create a client-only deep module, for example:

- `apps/web/src/components/game/turn-presentation/turn-presentation-coordinator.ts`
- `apps/web/src/components/game/turn-presentation/turn-presentation-model.ts`

The public interface should be small:

```ts
interface TurnPresentationState {
  authoritativeSnapshot: GameSnapshotProjection;
  presentedSequence: number;
  stage?: TurnStage;
  queueLength: number;
  catchingUp: boolean;
}

interface TurnPresentationController {
  acceptConfirmedUpdate(update: ConfirmedPresentationUpdate): void;
  skipCurrent(): void;
  skipToLive(): void;
  replayLastTurn(): void;
}
```

Responsibilities:

- Accept only validated, monotonically increasing authoritative updates.
- Convert event sequences into bounded display stages.
- Keep current stage lifecycle out of `GameClient`.
- Never derive legal actions or mutate the authoritative snapshot.
- Expose whether controls must remain locked while presentation catches up.
- Honor reduced motion at construction time and when the preference changes.
- Cancel safely on route change, game completion, reconnect replacement, or content retirement.
- Avoid React remount keys as an animation mechanism.

Do not turn `GameClient` into a second engine. Pure model functions may map confirmed events to copy and coordinates, but rules and outcomes remain server/engine-owned.

### 5.5 Workstream 4: build the turn stage and confirmed dice

Suggested components:

- `TurnStage`
- `DicePair`
- `TurnOutcome`
- `PlaybackControls`

Placement:

- Desktop/tablet: inside the board center, with a maximum width that leaves the perimeter visually quiet.
- Phone: immediately below or over the center as a compact, non-obscuring stage; the required decision remains in the bottom action sheet.

States to specify and implement:

- Idle/current actor
- Human command pending
- Confirmed dice
- Moving
- Landing outcome
- Bot confirmed choice/rationale
- Awaiting Human decision
- Paused/offline
- Catching up
- Finished

Dice requirements:

- Semantic two-die representation with pips plus text total.
- Faces must exactly match the confirmed event.
- No busy imagery, 3D physics dependency, canvas-only result, or autoplayed sound.
- Optional sound/haptic follows existing device-only preferences and cannot be the only cue.
- A new confirmed roll interrupts stale decorative motion cleanly and starts only after the prior stage has been skipped or completed.

### 5.6 Workstream 5: replace cell-bound tokens with the board overlay

Primary files to inspect/change:

- `apps/web/src/components/game/board-view.tsx`
- `apps/web/src/components/game/player-token.tsx`
- `apps/web/src/components/game/board-model.ts`
- `apps/web/src/app/globals.css`

Instructions:

1. Keep cell buttons semantic and selectable.
2. Remove the visible token stack from the cell's normal content flow.
3. Add one pointer-events-safe overlay whose coordinate space exactly matches the board grid.
4. Derive each resting piece transform from its authoritative route index and the cell-center geometry.
5. Derive a movement path from confirmed `fromPosition`, `toPosition`, signed/counted spaces, movement type, and captured route. If those fields cannot unambiguously express every move, version and extend `TokenMoved` with an explicit public path. Do not guess.
6. Animate the stable piece element through that path.
7. Recompute transforms on responsive resize/zoom without producing a visible jump; use `ResizeObserver` or CSS-relative coordinates, not polling.
8. Implement collision layout deterministically so all clients show the same stable order.
9. Keep an accessible occupant list attached to each cell and announce only movement completion, not each intermediate stop.

### 5.7 Workstream 6: fix board sizing and route legibility

Primary files to inspect/change:

- `apps/web/src/app/globals.css`
- `apps/web/src/components/game/board-view.tsx`
- responsive shell tests and visual baselines

Instructions:

1. Make the default board square use `min(available width, available height)`.
2. Remove the desktop default state in which the lower perimeter requires scrolling.
3. Preserve internal scroll only after the viewer deliberately zooms above 100%.
4. Keep the four corners visually clear and slightly stronger than regular cells.
5. Ensure Property bands, public names, prices, ownership, and pieces do not compete at fitted scale. Move secondary facts into inspection rather than shrinking everything.
6. Replace any fixture screenshot that uses canonical IDs as the primary visible cell names with representative public Blockparty names for visual QA.
7. Add a development-only invariant that reports expected/actual counts: 40 spaces and 28 ownable deeds for `1.0.0`.

### 5.8 Workstream 7: make bot choices readable without History

Map the stable `BotDecisionExplained` vocabulary to short display copy at the presentation boundary. Examples:

| Reason code | Player-facing presentation |
| --- | --- |
| `ACQUIRE_WITH_RESERVE` | `Cinder bought this Property and kept a cash reserve.` |
| `DECLINE_BELOW_RESERVE` | `Cinder declined to protect its cash reserve.` |
| `BID_BELOW_VALUATION` | `Cinder raised the bid within its valuation.` |
| `PASS_ABOVE_VALUATION` | `Cinder passed because the price exceeded its valuation.` |
| `LIQUIDATE_FOR_OBLIGATION` | `Cinder sold or mortgaged an asset to cover what it owes.` |
| `SAFE_END_OR_PASS` | `Cinder had no stronger legal move and ended its turn.` |

Do not expose seed, future deck order, private capabilities, free-form model output, or technical policy names. Keep rationale secondary to the visible game action. History retains the complete authoritative event.

### 5.9 Workstream 8: presentation preferences

Reuse the device-only presentation preferences system. Do not add a game variant.

Required controls:

- Existing **Reduce animation** remains authoritative for immediate placement.
- Add a local **Turn presentation speed** only if usability testing shows one default cannot serve most players. Suggested values: Normal and Fast; avoid a granular slider.
- Add **Skip animation** for the current stage and **Skip to live** for a queued recap.
- Add **Replay last turn** when a bounded prior turn is available.
- Sound and haptics remain off by default and separately controlled.

Version the local preference schema and migrate malformed/older values to safe defaults. No preference may enter game commands, analytics with identity, or server rules.

## 6. Flicker elimination checklist

The implementer should treat flicker as a measurable regression, not a subjective polish issue.

- Keep the board, cells, player rail, and decision rail mounted across snapshot updates.
- Never replace the live table with a loading skeleton after initial bootstrap.
- Do not alternate visible `Live`/`Resyncing` chrome for routine healthy commits. Reserve reconnect status for actual transport recovery.
- Keep selected inspection stable unless the active authoritative space changes according to the documented follow model.
- Use stable keys for pieces, cells, player rows, and turn-stage regions.
- Do not animate opacity on persistent pieces.
- Animate only `transform` and, where needed, a separate destination outline.
- Avoid layout-affecting changes to border width, font metrics, cell padding, and rail dimensions during a turn.
- Reserve fixed geometry for dice and outcome copy so text changes do not resize the board.
- Record a 60fps browser trace for a six-seat burst and verify no full-board remount, layout shift, or white frame.

## 7. Accessibility requirements

- The confirmed dice result is visible text and announced once. Do not announce every decorative tumble frame or crossed cell.
- Movement completion announces actor and destination public name, not merely `Stop 17`.
- `Skip animation`, `Skip to live`, and `Replay last turn` are keyboard reachable with 44 × 44px targets.
- Focus remains on the activated Human command while decorative dice/movement runs; then move focus only when a new required decision appears.
- A Computer turn must not steal keyboard focus.
- With reduced motion, pieces move immediately, dice faces settle immediately, and the same turn/outcome summary remains visible long enough to read.
- Forced colors preserve piece outlines, current actor, ownership, selected inspection, and destination emphasis without relying on player color.
- At 200% text zoom, the fitted board may simplify visible labels but cannot lose the ordered list, active-space detail, outcome summary, or controls.
- Screen-reader QA must verify that a burst of bot events produces an understandable, non-overlapping sequence of live announcements.

## 8. Test and evidence plan

### 8.1 Pure model tests

- Presentation mapper keeps every critical event in sequence.
- Multiple movements in one update are queued rather than collapsed to the last.
- Coalescing never crosses aggregate version, actor, roll, or movement boundaries.
- Route path covers forward wrap, backward movement, exact landing, card movement, detention transfer, and multiple Start crossings.
- Malformed or ambiguous movement data produces immediate final placement plus a textual result, never a guessed path.
- Queue overflow chooses catch-up summary deterministically.
- Reduced motion produces zero interpolated steps.
- Bot reason codes map to approved display copy with no wire terminology leakage.

### 8.2 Server/protocol tests

- Human acknowledgement latency does not include the subsequent bot chain.
- Every bot action still uses the one transactional command path.
- A crash/restart between bot commands resumes without duplicate roll, payment, or acquisition.
- Two runner attempts cannot act for the same version.
- A version-N presentation frame cannot contain version-N+1 state.
- Dropped SSE and reconnect converge to the latest snapshot and offer only a bounded recap.
- Capability redaction remains intact.
- Bot-only games continue after each bounded slice.

### 8.3 Browser tests

Run Chromium, Firefox, and WebKit with separate contexts where relevant:

1. Human rolls, sees confirmed dice, watches their overlay piece traverse, and reaches a Property decision.
2. Computer rolls, moves, pays rent, and ends its turn at watchable pacing without History open.
3. Two Computers act consecutively and their stages do not overlap or collapse.
4. A matching roll produces an extra turn with an explicit handoff back to the same actor.
5. Auction bot bids/passes remain readable and untimed.
6. A card causes a second movement and both movements are presented in event order.
7. Six pieces share one space and remain identifiable.
8. The viewer skips current motion and lands on the same authoritative state.
9. The viewer backgrounds the tab, returns to a bounded recap, and chooses **Skip to live**.
10. Transport loss during playback retains the last confirmed state, stops stale motion safely, and submits nothing.
11. Reduced motion shows immediate dice, destination, and outcome with no CSS animation.
12. At 320, 375, 768, and 1280 CSS px all 40 spaces are discoverable and the default overview is not clipped.

### 8.4 Visual and performance evidence

- Stable screenshots for idle board, confirmed dice, mid-movement, shared-space collision, landing outcome, catch-up, and reduced-motion final state.
- Video or trace evidence at 1280 × 720 and 375 × 667 proving no flash, full-board remount, or page jump.
- Layout-shift budget: zero board/rail geometry shift during a routine turn.
- Main-thread target: animations remain smooth under a six-seat board and 4G-like network profile.
- Human command acknowledgement continues to meet PRD-NFR-007.

### 8.5 Comprehension study

Before calling the work complete, test with at least five people who did not implement it. Show each participant a short game containing a normal roll, rent payment, acquisition, card move, and two consecutive Computer turns. Do not tell them to open History.

After each turn ask:

- Who acted?
- What did the dice show?
- Where did the piece land?
- What changed?
- What happens next?

Acceptance target: at least 90% correct answers across the five questions, no participant reports losing the moving piece, and at least four of five describe default pacing as understandable rather than slow. Record reduced-motion feedback separately.

## 9. Delivery sequence

Implement in dependency order. Each numbered item should be its own reviewable ticket or tightly bounded change; do not combine all work into one branch.

1. **Authority update:** approve and register the new PRD/UX/DS/protocol requirements and traceability rows.
2. **Board fit correction:** make all 40 spaces visible at default scale and update visual evidence.
3. **Persistent piece overlay:** move tokens above cells with collision and accessibility behavior, initially without traversal.
4. **Exact movement path contract:** prove current event data is sufficient or version `TokenMoved` with an explicit public path.
5. **Presentation coordinator:** queue confirmed stages, reduced-motion behavior, skip, catch-up, and cancellation.
6. **Dice and turn stage:** add confirmed roll visuals and immediate textual outcomes.
7. **Stepwise movement:** animate the stable overlay token through every confirmed route step.
8. **Bot orchestration:** return Human acknowledgements promptly, serialize bot continuation safely, and preserve committed presentation boundaries.
9. **Bot narration:** expose concise confirmed rationale and landing/economy outcomes outside History.
10. **Cross-browser/accessibility/comprehension gate:** run the full matrix, traces, visual baselines, and five-person study.

Board fit comes before animation because a clipped route cannot support understandable travel. The persistent overlay comes before traversal because stable piece identity is the foundation of motion. Server orchestration follows the client presentation contract so the protocol delivers exactly what the coordinator needs, without turning transport behavior into speculative UI.

## 10. Definition of done

This experience is done only when all statements are true:

- A new game uses the captured `1.0.0` classic bundle and visibly exposes all 40 spaces and all 28 ownable deeds through the board/list pair.
- At default desktop/tablet scale, no perimeter edge is hidden behind an internal scroll viewport.
- Every active player has a persistent, identifiable piece visibly layered above the board.
- A confirmed roll appears as two dice, visible text, and a restrained staged presentation.
- A confirmed movement can be followed from origin to destination without consulting History.
- Consecutive Computer actions appear in order and at a human-readable pace.
- History remains authoritative but is unnecessary for understanding an ordinary turn.
- Human acknowledgements are not blocked on an entire bot chain.
- No flicker, full-board remount, opacity flash, or layout shift occurs during the six-seat trace.
- Skip, catch-up, reconnect, and reduced-motion paths converge to the same authoritative final snapshot.
- No client animation generates randomness, legal actions, payments, ownership, or rule outcomes.
- No copied Monopoly names, assets, board data, or affiliation claims enter the product.
- Traceability links requirements, code, tests, visual evidence, accessibility evidence, and owner approvals before any requirement is marked Verified.

## 11. Planner decisions and open questions

The plan makes these default decisions from the stated intent:

- Use the full original Blockparty 40-space/28-deed content, not Monopoly-branded properties.
- Treat the current clipped desktop board as a defect.
- Use a persistent over-board piece layer.
- Use confirmed-result dice presentation, not client-generated fake randomness.
- Make Normal watchable pacing the default, with reduced motion and skip always available.
- Keep History as an audit trail rather than the primary explanation of live play.
- Do not add a new gameplay variant or deadline.

Questions that can wait until design validation, and should not block initial engineering discovery:

1. Whether Normal and Fast are both needed after testing the proposed default cadence.
2. Whether optional sound/haptics materially improve comprehension enough to include in the same release.
3. Whether the existing `TokenMoved` payload can express every route path unambiguously or needs a versioned explicit `path` field.
4. Whether durable per-version projection checkpoints or exact post-commit projection publishing is the smaller safe protocol change after a recovery spike.
