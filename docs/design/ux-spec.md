# UX Specification — Browser Economic Board Game

**Status:** implementation-ready · **Product context:** [PRD](../product/prd.md), [rules](../product/rules.md), [variants](../product/rule-variants.md), [game content](../product/game-content.md), and [glossary](../product/glossary.md) · **Visual rules:** [Design system](design-system.md)

This specification describes an original, private-session economic board game for 2–6 guest or bot players. It must not present itself as, copy the naming, artwork, board geometry, currency, rules text, or trade dress of any commercial board game. Product terminology, spaces, cards, tokens, and rules content must be original and finalized with the game-rules specification before implementation.

## 1. Product principles

- **UX-001 — One shared game, many personal views.** Every participant sees authoritative live state while their own actionable choices stay prominent.
- **UX-002 — Phone-first, not phone-shrunken.** At 375 CSS px, the player acts from a focused board region and a single action surface; they never need to read a full board at once.
- **UX-003 — Deliberate social play.** Important state changes are visible, attributable, confirmable, and announced. There is intentionally **no in-game chat**; invitees use their existing communication channel.
- **UX-004 — Seats are durable without accounts.** An invite opens admission; a secure game-seat command capability resumes only that seat. Active games expire 30 days after the last authoritative gameplay action and completed games 30 days after completion.
- **UX-005 — Network truth.** The app may provide an offline app shell, but live gameplay, commands, and state synchronization require a network connection.
- **UX-006 — Accessible equivalence.** Board, log, controls, and every decision have a keyboard and screen-reader usable path; visual color is never the sole carrier of meaning.

## 2. Information architecture and routes

Routes are server-rendered shell pages in Next.js; live state hydrates after capability validation. Admission URLs use opaque invite IDs. Game IDs locate state but grant no authority; host, seat, and reclaim capabilities never appear in URLs.

| Route/screen | Purpose and required content |
|---|---|
| `/` — Landing | Name/mark, concise “create a private game” promise, **Create game** primary CTA, **Join with link** field/CTA, how-it-works, rules/age notice (13+), accessibility/settings links, install education. No account wall. |
| `/create` — Create | Game name (optional, length-limited), player count 2–6, bot seats, ruleset/variant selector, privacy note, and **Create lobby**. Invalid combinations explain the fix inline. |
| `/join/[inviteId]` — Join gate | Validates invitation; choose a game-scoped pseudonym and token/avatar, acknowledge 13+, and join. Expired/invalid/full/ended states give a safe exit without revealing private room details. |
| `/game/[gameId]/lobby` — Lobby | Invite link with copy/share, participant seats, readiness, bot controls, selected settings summary, host start control, leave. The host alone changes settings and starts; guests change only personal presentation preferences. |
| `/game/[gameId]` — Game | Responsive game shell defined in §4. Includes board, player state, event feed, active decision surface, settings and reconnect state. Authorization comes from the game-seat cookie, not the path. |
| `/game/[gameId]/summary` — Completion | Winner, rules-defined no-winner, or host-ended no-contest outcome; standings, key events, rematch, copy result, return home. Do not auto-reuse an invite or gameplay identity. |
| `/settings` — Personal settings | Theme, contrast, reduced sound/haptics, animation preference, board labels, text scale guidance, install status, data/session controls. These do not change game rules. |
| `/rules` and `/accessibility` | Versioned original rules, variants, keyboard guide, and accessibility statement. Link from every shell footer/menu. |

Room navigation must warn before leaving an unresolved decision; browser Back must not silently discard a submitted command. History/replay is rendered from the authoritative event log, never inferred from animation.

## 3. End-to-end flows

### UX-010 Landing → create → invite
1. Visitor selects **Create game**, chooses 2–6 total seats, fills unused seats with bots if desired, selects a named variant, and accepts the 13+ notice.
2. The server creates a game, separate host and game-seat capabilities, and the documented rolling 30-day expiry. Show the lobby and an obvious **Copy invite link** plus native share where available.
3. The link grants admission to the lobby/game, not host privileges. Copy feedback is textual and announced; users can rotate/disable an invite from host controls if the product supports it.
4. Host reviews seats and starts only when ruleset minimums are met. Starting locks rule-changing settings and writes a visible event.

### UX-011 Join → lobby
1. Invitee opens `/join/[inviteId]`; validate availability before displaying the join form.
2. They select an unclaimed seat, game-scoped pseudonym, and distinguishable token. Enforce [PRD-FUN-003](../product/prd.md#entry-lobby-and-seats) and never request a real name.
3. On success, announce “Joined [room name], [n] of [max] seats filled,” focus the lobby heading, and retain the resumable identity locally/securely.
4. A valid command capability reconnects only its original human seat. A replaced player instead presents the separate reclaim claim and follows UX-018; neither capability grants host authority.

### UX-012 Lobby → settings → start
Host opens **Game settings** in a dialog/sheet: `standard` or `short-game`, exactly the eight documented toggles, and 2–6 human/bot seat types. The one MVP bot difficulty is not selectable. Starting resources come from the immutable content bundle, and gameplay has no timers. Each variant has plain-language impact and conflict validation. Changes update viewers and emit a domain event; after start, rules are read-only while sound/theme remain personal.

### UX-013 Active turn
1. Live connection establishes; board shell shows current turn and `Waiting for [player]` for everyone else.
2. Active player selects **Roll/advance** (or the rule-equivalent action). Disable duplicate submission immediately; retain an accessible pending label until authoritative result arrives.
3. Animate only after the authoritative event; update player strip, focused board viewport, active-space detail, event feed, and possible decision sheet.
4. If no decision is due, show **End turn** with a concise consequence summary. Other players may inspect board details and permitted trade offers but cannot invoke turn actions.

### UX-014 Acquisition and auction
When landing on an unowned acquirable space, the active player receives a decision sheet: space name/type, price, projected balance, income/risk summary, **Acquire**, and **Decline**. Declining immediately opens an untimed auction visible to all eligible players. Auction uses labelled increment controls and direct amount entry with validation; current leader, minimum next bid, priority bidder, affordability, pass status, and outcome have text equivalents. A disconnected priority bidder pauses the auction. Bids are atomic; conflicting bids receive an authoritative result, not a client-side promise.

### UX-015 Trade
Any eligible human player opens **Propose trade**, chooses a counterpart, adds/removes permitted cash, deeds, and Detention-release cards, then reviews **You give / You receive**. Future promises and deferred consideration are unavailable. The recipient can accept, decline, or counter; acceptance revalidates current state. A trade becomes stale if an included asset changes and cancels if a party is eliminated or the game ends. During an obligation, only the debtor may use a valid immediate liquidity trade. Bots expose only rule-supported offers and never impersonate a human response.

### UX-016 Improve, mortgage, and sell
From an owned-space detail, **Manage** opens inventory grouped by executable and blocked actions. Explain prerequisites, cost/proceeds, resulting balance, and rule constraints before the action. Improvement, sale, mortgage, and redeem-mortgage actions use server validation and confirmation where irreversible. Render executable `legalActions` as enabled and relevant `actionAvailability` entries disabled with their reason.

When finite improvement inventory is contested, show the available count, each seat's eligible requested deed, current priority, minimum bid, and cost treatment. Use the same untimed ordered auction interaction as UX-014. Revalidate a target after each unit; explain and remove an ineligible request rather than silently moving it.

### UX-017 Detention, debt, and bankruptcy
Forced Detention presents remaining turns/exit conditions and currently legal remedies. An obligation interrupts normal choices with allowed liquidation actions and an updated amount due; blocked options remain visible with reasons. When the engine proves no legal remedy remains, **Declare bankruptcy** is a destructive confirmed action whose creditor outcome is explained. Bankruptcy locks the eliminated seat, resolves assets, announces standings, and preserves the event log. Never trap a keyboard user in the sheet.

### UX-018 Reconnect, resume, host departure, and disconnected seats
- Connection loss immediately changes the global status to **Reconnecting**; queued game commands are not replayed automatically. The last confirmed state remains inspectable and all game-changing controls are disabled with explanation.
- Retry with exponential backoff; after recovery, fetch authoritative state, reconcile the UI, and announce changes. Active games expire 30 days after the last authoritative gameplay action; completed games expire 30 days after completion. Expired games show a neutral unavailable page.
- A disconnected human keeps their seat and assets. Play pauses only when that seat is the required actor. At a safe command boundary, the host may explicitly replace it with the single MVP bot. Confirmation names the seat and explains that the old command token will be revoked while a separate reclaim claim remains. Journal and announce replacement.
- A replaced human authenticates the reclaim claim and requests control. The host approves; at the next safe command boundary the bot is removed and a new command token is issued. Never change control during unresolved action execution. A disconnected host transfers at a safe boundary to the longest-tenured connected human, tie-broken by seat order; if no human is connected, play remains paused.
- Host controls include **End game without a result**. A destructive confirmation explains that no winner will be recorded, shows the action to every connected player, and submits `EndNoContest` only at a safe command boundary. This is not a silent disconnect action and cannot be undone.

### UX-019 Completion and rematch
When win conditions are authoritative, freeze actions, show the result sheet to all, announce winner/standings, and route to summary. Rematch creates a fresh room and invite link with explicit participant/variant choices; it never carries balances, assets, or host authority silently.

## 4. Responsive game shell

### Mobile (375 px first) — UX-030
Use a single-column, safe-area-aware shell. The main region is a **focused board viewport**, showing the active player, their current/next-relevant space, and nearby spaces at readable scale; pan by drag plus keyboard controls, and expose a **mini-map** with a labelled viewport indicator and tappable regions. Below it: active-space detail (name, type, owner/status, value/rule summary) and a horizontally scrollable **player strip** with name, token shape/pattern, balance, status, and turn marker. A fixed bottom action bar opens a modal **bottom action sheet** for all turn decisions; it must not cover its invoker without a way to close. The event feed is a collapsible labelled panel. Board inspection never competes with an unresolved action: action sheet priority wins.

### Tablet — UX-031
At approximately 768–1023 px, use a split layout: flexible board viewport/minimap on the left or top, and a 320–400 px contextual panel on the right/below for active space, player strip, feed, and actions. Preserve touch targets and allow portrait stacking. Avoid a dense desktop side rail when the panel would be below minimum readable width.

### Desktop — UX-032
At 1024 px and above, render the complete board when its cells meet minimum legibility; otherwise retain the focused viewport. Use persistent side panels: player/turn state and active decision on one side, inspectable event feed/assets on the other. Panels are independently scrollable, have visible headings, and do not obscure board controls. Do not turn the experience into a generic analytics dashboard.

### Landscape — UX-033
On short landscape screens, prioritize board viewport and compact player strip; move detail/feed into a side drawer or bottom sheet. Respect notch/safe-area insets. Never require device rotation, and do not use orientation locks.

## 5. State, feedback, and install behavior

| State | Required behavior |
|---|---|
| Loading | Skeleton preserves board/panel geometry; announce a concise status once, not every animation frame. Avoid fake board state. |
| Empty | Explain why (no events, no owned assets, no available trades) and give permitted next action where applicable. |
| Error | Plain-language error, scope (local action vs room), retry, and safe navigation. Preserve entered trade/bid data when safe; never claim a command succeeded until confirmed. |
| Disabled | Keep control visible with a reason: “Waiting for Maya,” “Need 40 more credits,” or “Reconnect to act.” |
| Connection | Persistent status icon plus text: Connected, Reconnecting, Offline, or Paused. Network errors use aria-live status and event feed entry. |
| Install | Detect eligibility without blocking play. Offer a dismissible, non-modal PWA prompt after meaningful engagement; explain offline shell vs network-required live games. On iOS, show concise manual install steps only after user requests install. Remember dismissal. |

## 6. Accessibility acceptance requirements — UX-040

Target **WCAG 2.2 AA** at 320–400% zoom/reflow and with browser text enlargement. Use semantic DOM plus SVG board geometry, not an opaque canvas; SVG cells require text alternatives and corresponding DOM controls/list views ([DS-060](design-system.md#ds-060--accessibility-implementation-rules)).

- Every interactive target is at least 44 × 44 CSS px or has equivalent spacing; focus is always visible and not obscured by sticky UI.
- Keyboard: `Tab`/`Shift+Tab` move through logical landmarks and controls; `Enter`/`Space` activate; `Escape` closes dismissible dialogs/sheets; arrow keys pan the focused board viewport or navigate a roving-tabindex board cell grid; `Home`/`End` move to first/last board cell. Provide a visible keyboard-help entry and a non-spatial board list.
- Dialogs/sheets trap focus while open, label their purpose, restore focus to the invoker, and never close on an irreversible action without confirmation.
- Use named landmarks: header, main game, board/board-list, player status, action region, and event log. Headings describe current turn and active decision.
- Screen-reader announcements use restrained `aria-live`: turn start, authoritative roll/result, required decision, accepted/rejected command, auction leader/outcome, reconnect, pause, elimination, and game end. Do not announce decorative movement or every visual update; provide a readable event log.
- Convey ownership, player identity, selection, affordability, and urgency with text, icon/shape/pattern, and programmatic state in addition to color. Meet AA contrast for text and essential UI; provide high-contrast compatible borders/focus.
- Support `prefers-reduced-motion`, reduced transparency, no sound, and no haptics. Animations never convey unrecoverable information and can be skipped.

## 7. Implementation handoff

Apply the defined [DS requirements](design-system.md) to all routes. Original space names, economy, cards, variants, retention, and command authority come from the linked normative product and engineering specifications. This UX document is not legal clearance. Track UX IDs in implementation issues and [traceability](../traceability.md).
