# UX Specification — Blockparty classic table

**Status:** classic-overhaul implementation authority · **Product context:**
[PRD](../product/prd.md), [rules](../product/rules.md), [variants](../product/rule-variants.md),
[game content](../product/game-content.md), and [glossary](../product/glossary.md) ·
**Visual rules:** [Design system](design-system.md)

This specification defines the player experience for the original magical city
of Blockparty. It uses the familiar generic terms Property, Color Set, Rent,
Mortgage, Auction, House, Hotel, Detention, Bank, and Trade. The board is a
classic 40-space perimeter table; its names, copy, art, pieces, and visual
expression remain original to Blockparty.

The browser renders an authorized projection. It never invents a player,
balance, property, die result, card effect, legal action, or completion state.
Only a server-accepted command changes the game.

<a id="1-product-principles"></a>

## 1. Experience principles

- **UX-001 — One shared table, many personal views.** The full table is the
  shared visual anchor; each player sees the same authoritative public state and
  their own private capabilities only.
- **UX-002 — Classic table, digital hand.** Desktop shows the complete board
  and a local property hand. Phone shows a fitted overview, focused inspection,
  and the same information in an ordered accessible list.
- **UX-003 — One dominant decision.** Every blocking phase presents one primary
  decision for the required actor. Secondary inspection and management actions
  never compete with it.
- **UX-004 — Untimed, attributable play.** No turn, auction, trade, or debt
  timer expires. A disconnected required actor pauses the relevant decision;
  the UI never fabricates a pass, bid, payment, or bankruptcy.
- **UX-005 — Network truth.** A reconnecting player keeps the last confirmed
  projection. Commands are disabled until the server re-authenticates and
  reconciles state.
- **UX-006 — Accessible equivalence.** Color, position, animation, and shape
  are never the only way to understand ownership, urgency, a result, or an
  action. Every board fact and decision has a semantic, keyboard, and screen
  reader path.

## 2. Routes and information architecture

Routes are server-rendered shells. Live state hydrates only after the server
validates the relevant capability. Game IDs locate state but grant no authority;
invite, seat, host, and reclaim capabilities never appear in URLs, storage,
logs, or analytics.

| Route/screen | Required experience |
| --- | --- |
| `/` — Landing | Explain the private Blockparty table in one sentence. Make **Create game** the primary action and **Join with link** the secondary action. Include the 13+ notice, accessibility/settings links, install education, and no account wall. |
| `/create` — Create | One page for the host pseudonym, host piece, optional table name, Human count, Computer count, collapsed house-rule summary, and age acknowledgement. Show the resulting seat tray before submission. |
| `/join/[inviteId]` — Join | Validate the invite before collecting input. Show only server-reported open Human seats and available pieces. Collect a game-scoped pseudonym, one remaining piece, and age acknowledgement. |
| `/game/[gameId]/lobby` — Lobby | Show a miniature classic board, seat tray, claimed/open Human seats, Computer seats, selected Standard/Custom summary, invite/share action, and host-only start or seat controls. Explain the exact unmet start condition. |
| `/game/[gameId]` — Table | Show the authoritative board, player rail, current decision, local property hand, event history, connection state, and contextual inspection/management surfaces. |
| `/game/[gameId]/summary` — Summary | Show the authoritative winner, standings, key events, no-contest or retired-game explanation, read-only board/history, and a fresh rematch action. Never silently reuse an invite, balance, capability, or identity. |
| `/settings`, `/rules`, `/accessibility` | Keep personal presentation preferences, original rules/variants, keyboard help, and accessibility information outside the game state. |

Room navigation warns before leaving an unresolved decision. Browser Back never
silently discards an entered bid or trade. History is rendered from the
authoritative event log, never inferred from animation.

## 3. Creation and admission flows

<a id="3-end-to-end-flows"></a>

<a id="ux-041--one-page-table-composer"></a>

### UX-041 — One-page table composer

The host completes creation without a multi-step wizard:

1. Enter a required game-scoped pseudonym and choose one of the six available
   pieces: Lantern, Key, Crescent, Tower, Fox, or Teapot. Render each piece
   with its distinct color and pattern as redundant cues.
2. Optionally enter a length-limited table name.
3. Set **Human players** with minus/value/plus buttons. The count includes the
   host. Set **Computer players** with the same buttons. Do not use numeric text
   fields, wheel-sensitive inputs, or hidden seat-count fields.
4. Keep the combined table size from 2 through 6. Humans are 1 through 6 and
   Computers are 0 through 5, with an invalid total explained inline. The
   default is 2 Humans, 0 Computers.
5. Keep Standard selected by default. House rules are collapsed; expanding them
   shows exactly the eight documented toggles, their plain-language effects,
   conflict validation, and the locked-after-start rule.
6. Show a visible seat tray preview: the host's seat, open Human seats, and
   Computer seats. The preview updates immediately but is not authoritative.
7. Submit once. Disable duplicate submission while pending and issue no
   capability in the request body, URL, storage, or analytics. On success,
   route to the lobby with the server projection.

Error, empty, and recovery behavior:

- Missing or invalid pseudonym, piece, count, or acknowledgement is marked at
  the field and summarized at the form heading; safe values remain entered.
- If the server rejects a stale piece or contract version, preserve the safe
  form values, refresh availability, and require a new piece selection.
- If the request is pending, announce **Creating table** and keep the submit
  control unavailable. A retry is permitted only after a definitive failure;
  a timeout never implies that a table was not created.

<a id="ux-042--join-and-piece-conflict-recovery"></a>

### UX-042 — Join and piece-conflict recovery

The join gate first resolves the invite status. Invalid, expired, full, ended,
or retired invitations receive a plain-language explanation and a safe route
home without revealing private room details.

For an open invite, the server supplies the available Human seats and pieces.
The player enters a normalized pseudonym, chooses one available piece, and
acknowledges the 13+ notice. Occupied seats and pieces are visibly unavailable;
the client does not guess availability from an earlier projection.

On a concurrent claim conflict, keep the pseudonym and acknowledgement, refresh
the authoritative availability, identify the unavailable piece, move focus to
the new piece choices, and require another selection. Never displace an
occupied Human or Computer seat. On success, issue the secure seat capability
and focus the lobby heading with a textual joined announcement.

<a id="ux-043--table-preview-lobby"></a>

### UX-043 — Table-preview lobby

The lobby is a preview of the shared table, not a second configuration wizard.
The miniature board and seat tray show seat order, pseudonym, piece, Human or
Computer kind, open Human slots, and connection/readiness status. A host may
copy/share the invite, remove or replace a Computer, and start when every
planned Human seat is claimed. A non-host can inspect the preview and copy the
invite but cannot change settings or start.

Keep Standard or Custom plus the selected toggle summary concise by default.
Put editing behind **Game settings** and close it after a successful server
acknowledgement. If start is unavailable, state the exact reason, such as
“Waiting for 1 Human seat,” beside the disabled control. There is no separate
ready state.

When the host starts, lock rules and seat composition, announce the authoritative
`GameStarted` transition, and navigate all connected players to the table. A
rejected start leaves the preview unchanged and explains whether a seat,
connection, or version must be repaired.

## 4. Table play flows

<a id="4-responsive-game-shell"></a>

<a id="ux-044--desktop-classic-table-and-digital-hand"></a>

### UX-044 — Desktop classic table and digital hand

At desktop widths, center the complete 40-space board as the visual anchor.
Place the ordered player rail at the left with pseudonym, piece shape/color/
pattern, cash, connectivity, elimination status, and turn marker. Place the
current decision and active-space detail at the right. Place the local property
hand below the board, grouped by Color Set, with deed-level and management
status. Bank inventory, event history, and settings are secondary surfaces with
their own headings and scroll regions.

The board communicates each space's canonical identity, display name, type,
group, owner, mortgage state, improvement level, and pieces. Property bands,
piece shapes/patterns, labels, borders, and text repeat meaning so color is
never required. The ordered board list remains available at every width.

<a id="ux-045--phone-overview-focus-zoom-and-list-equivalence"></a>

### UX-045 — Phone overview, focus, zoom, and list equivalence

At 320–767 CSS px, use a safe-area-aware single-column shell:

1. Keep a compact header with current player/decision, cash or debt, roll/result,
   connection state, and a route to the ordered board list.
2. Show a fitted overview of all 40 spaces without page-level horizontal scroll.
   The overview is an inspection surface, not a substitute for readable detail.
3. Follow the authoritative active movement and active space after a confirmed
   event. If the player deliberately taps a different space, preserve that
   inspection until the authoritative active space changes or the player uses
   **Follow active space**.
4. Permit deliberate tap-to-focus and zoom within the board viewport. Provide
   an obvious reset/focus escape. Browser zoom remains enabled.
5. Put the active-space detail and horizontally scrollable player strip below
   the overview. Put the single current decision in a bottom action sheet that
   never traps or hides its invoker.
6. Make Board, Properties, Trade, and History navigation available without
   discarding an unresolved decision. The ordered board list exposes every fact
   and action conveyed by position or color.

<a id="ux-046--one-decision-and-contextual-property-management"></a>

### UX-046 — One decision and contextual property management

Every phase has one foreground decision for the required actor:

| Phase | Primary surface | Required context |
| --- | --- | --- |
| Normal turn | **Roll** or the rule-defined advance action | Current player, cash, turn order, connection state |
| Landing on an unowned Property | **Acquire** or **Decline** | Property, price, projected balance, and rent context |
| Auction | **Bid** or **Pass** | Current leader, minimum bid, priority, affordability, and pass status |
| Detention | The currently legal release/advance action | Remaining detention turns and legal remedies |
| Debt | One allowed liquidation/payment continuation | Creditor, amount due, cash, assets, and blocked reasons |
| Trade response | **Accept**, **Decline**, or **Counter** | You give, you receive, revalidation status, and expiry reason |
| Build/sell/mortgage | Confirm the selected management action | Deed, set, level, cost/proceeds, inventory, and resulting balance |
| Bankruptcy/no-contest | Destructive confirmation | Exact consequence and irreversible outcome |

The required actor's primary control is visually and programmatically distinct.
Other players see the current actor and a reason such as “Waiting for Maya”;
they may inspect permitted public state but cannot invoke the decision.

The local property hand groups owned deeds by Color Set. Each deed exposes rent
level, Houses/Hotel, mortgage status, build cost, and the authoritative reason
an action is blocked. **Manage** opens Build, Sell, Mortgage, Redeem, and Trade
actions derived from `legalActions` and `actionAvailability`; the client never
turns a preview into confirmed state. Multi-step builds, sales, and trades stay
atomic and return focus to the invoking deed or decision after acknowledgement.

<a id="ux-047--auctions-trades-detention-debt-and-retired-summaries"></a>

### UX-047 — Auctions, trades, detention, debt, and retired summaries

Auctions, trades, Detention, and debt are blocking decisions, not background
panels. Show the active actor, exact property/card/payment context, all current
public participants, and the authoritative continuation. Use untimed ordered
controls; disconnecting the required actor pauses the decision and announces it.

Debt keeps legal liquidation controls available until the engine proves that no
legal remedy remains. Only then is **Declare bankruptcy** enabled. A retired
placeholder game is not playable: show a read-only summary banner explaining
that the earlier content version was retired as `CONTENT_RETIRED`, show its
preserved standings and event history, revoke all gameplay controls, and offer
safe navigation home. Never present it as migrated to the classic rules.

## 5. Reconnect, completion, rematch, and state handling

### UX-018/019 — Reconnect, completion, and rematch

Connection status is persistent text plus a non-color icon: **Connected**,
**Reconnecting**, **Offline**, or **Paused**. On loss, retain the last confirmed
projection, disable game-changing controls, and never replay queued commands.
On recovery, fetch authoritative state, reconcile by version, and announce any
accepted or rejected transitions. A disconnected required Human keeps their
seat and assets; play pauses until reconnect or an explicit safe-boundary bot
replacement. Host transfer, reclaim, replacement, and `EndNoContest` are shown
only after their command transaction commits.

When the server reports a winner, last-solvent result, or no-contest outcome,
freeze gameplay controls, announce the result, and route to the read-only
summary. Show standings, key events, final board/property state, and the reason
for a no-contest or `CONTENT_RETIRED` outcome. Rematch is an explicit fresh
creation flow with new seat choices and invite; it never reuses balances,
assets, capabilities, or identities silently.

## 6. State, announcements, and responsive behavior

| State | Required behavior |
| --- | --- |
| Loading | Preserve board/decision geometry with a skeleton and announce one concise loading status. Never render guessed game state. |
| Empty | Explain why there are no owned properties, events, trades, or available pieces and provide the permitted next action. |
| Rejected | Keep safe entered values, identify local versus room scope, explain the authoritative reason, and restore focus to the failed action. |
| Disabled | Keep the control visible with a reason such as “Waiting for Maya,” “Need 40 more credits,” or “Reconnect to act.” |
| Pending | Disable duplicate submission, label the action as pending, and wait for authoritative acknowledgement or a recoverable failure. |
| Disconnected | Keep the last confirmed state; disable commands and show reconnect/pause explanation. |

Announce only authoritative transitions in a polite `aria-live` region and the
readable event history. The allowlist is: lobby start; turn start; dice/advance
result; movement completion; landing effect; acquisition; auction bid/pass and
outcome; trade offer/response/outcome; build/sell/mortgage/redeem; Detention
entry/exit; debt payment/liquidation/bankruptcy; reconnect/pause/resume; bot
replacement; reclaim; host transfer; no-contest; elimination; completion; and
retirement. Do not announce decorative movement frames, presence churn, focus
changes, or every feed item.

At every width, provide named landmarks for header, main table, board/board
list, players, decision, property hand, and event history. Interactive targets
are at least 44×44 CSS px, controls have a visible focus state, fields use at
least 16px text, and wide board/list content scrolls inside its own container.
The 320, 375, 768, and 1280 CSS px states preserve the same legal actions and
information; only layout and inspection affordances change. Respect reduced
motion, forced colors, browser text enlargement, safe areas, and keyboard zoom.

## 7. Accessibility and implementation handoff

<a id="6-accessibility-acceptance-requirements--ux-040"></a>

Target WCAG 2.2 AA. Use semantic DOM plus board geometry, never an opaque
canvas. A spatial board cell must have an equivalent ordered board-list item;
the list must expose canonical ID, display name, type, owner/status, value or
effect, improvement state, and any permitted action.

Keyboard users can move through landmarks, activate controls with Enter/Space,
close dismissible sheets with Escape, move through board items with arrows, and
use Home/End for the first/last board item. Dialogs trap focus while open,
restore focus on close, and require confirmation for irreversible actions.

The implementation must cite UX-041–047 and UX-018/019 plus the associated PRD, RULE, CONTENT,
ENG, PROTO, and DS requirements in [traceability](../traceability.md). This
document defines behavior and information hierarchy; it is not legal clearance
for the original content or public release.
