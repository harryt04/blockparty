# Design System — Blockparty classic table

**Status:** implementation-ready classic-table direction · **Behavioral
authority:** [UX specification](ux-spec.md) · **Product context:**
[PRD](../product/prd.md), [rules](../product/rules.md), [game content](../product/game-content.md),
and [brand strategy](../brand/brand-strategy.md)

This document fixes the visual, layout, component, and responsive choices for
the classic Blockparty table. It is a build contract, not a mood board. The
interface uses a warm cream board, dark ink, eight labelled Color Set accents,
original magical-city names and art, and a shared table hierarchy. It does not
add decorative illustration, gradients, or a new state that is absent from the
authoritative projection.

## DS-001 — Classic-table guardrails

- The game surface is a square 40-space perimeter table: an 11 × 11 board
  frame with 40 perimeter cells and a quiet center reserved for table context.
  The center is not a second board, score dashboard, or decorative scene.
- The board is the shared visual anchor. The left player rail, right decision
  rail, and local property hand support it; bank inventory, history, settings,
  and accessibility help are secondary surfaces.
- Use the display terms Property, Color Set, Rent, Mortgage, Auction, House,
  Hotel, Detention, Bank, and Trade at the presentation boundary. Canonical
  IDs, events, and actions remain the wire-layer terms from the Glossary.
- No state may be conveyed by color, position, animation, texture, or shape
  alone. Every repeated visual cue has a text, border, icon, or semantic DOM
  equivalent.
- Do not add gradients, glossy effects, ornamental rules, confetti, casino
  cues, or familiar third-party board/card artwork. Material cues are limited
  to flat paper surfaces, dark ink, borders, and one restrained elevation.

## DS-010 — Type, spacing, and geometry tokens

Atkinson Hyperlegible is the self-hosted UI face and Fraunces is limited to
short display headings or space titles. The fallback stack is part of the
contract, so a failed font load does not change layout meaning. Body text is at
least 16 px with a 1.5 line height; balances, bids, prices, and route indexes
use tabular numerals.

```css
:root {
  --font-ui: "Atkinson Hyperlegible", ui-sans-serif, system-ui, sans-serif;
  --font-display: "Fraunces", Georgia, serif;
  --text-body: 1rem;
  --text-small: 0.875rem;
  --text-label: 0.8125rem;
  --text-title: clamp(1.25rem, 1rem + 1vw, 1.75rem);
  --leading-body: 1.5;
  --leading-tight: 1.2;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;
  --radius-control: 0.5rem;
  --radius-card: 0.75rem;
  --radius-sheet: 1rem;
  --border-thin: 1px;
  --border-strong: 2px;
  --target-min: 2.75rem;
}
```

Use the 4 px base everywhere. The content gutter is 16 px at 320–767 px,
24 px at 768–1023 px, and 32 px at 1024 px and wider. Labels sit 12 px from
their control; adjacent fields sit 20 px apart. Cards use `--radius-card`,
controls use `--radius-control`, and board cells have square boundaries. Every
interactive target is at least 44 × 44 CSS px. Inputs, selects, and textareas
are at least 16 px, including their error and pending states.

## DS-020 — Semantic palette and contrast contract

Components consume semantic roles, never raw colors. The light table is the
default; dark mode uses the same role names on a dim navy surface. The values
below are the fixed light-theme starting values for implementation.

| Role | Light value | Use and required companion |
| --- | --- | --- |
| `canvas` | `#f6efdf` | Page/table surround; never the only boundary cue |
| `surface` | `#fffaf0` | Cards, board cells, and hand surfaces |
| `surface-raised` | `#fffdf8` | Decision cards and focused detail |
| `ink` | `#1f2430` | Body text, borders, and primary icons |
| `muted-ink` | `#5b6472` | Secondary text only; never for a required action |
| `line` | `#8d897f` | Structural boundary and table grid |
| `brand` | `#8b2f23` | Current turn and primary action; paired with a label/icon |
| `brand-ink` | `#fffaf0` | Text on `brand` and danger surfaces |
| `focus` | `#1f6f8b` | 2 px focus ring plus browser-visible offset |
| `selection` | `#d8a52b` | Selected space/card; always paired with `aria-current` or text |
| `success` | `#2f6f4e` | Status text and check icon |
| `warning` | `#8a5a00` | Status text and strong border/icon |
| `danger` | `#8b2f23` | Destructive status, never an unlabeled red tint |
| `info` | `#245b82` | Informational status and icon |

The eight Color Set roles are fixed and distinct. They are used for a narrow
property band, a labelled swatch, and a patterned edge; never for text on an
unrelated surface.

| Wire group | Display group | Accent | Text on accent | Contrast vs `#fffaf0` |
| --- | --- | --- | --- | ---: |
| `district-ash` | Ashen Lanterns | `#8a5a44` | `#fffaf0` | 5.57:1 |
| `district-moonfen` | Moonfen | `#2d6a73` | `#fffaf0` | 5.90:1 |
| `district-rosecoil` | Rosecoil | `#a63d63` | `#fffaf0` | 5.82:1 |
| `district-copperwake` | Copperwake | `#b05a2a` | `#fffaf0` | 4.65:1 |
| `district-starling` | Starling | `#496a3a` | `#fffaf0` | 5.93:1 |
| `district-thornlight` | Thornlight | `#5b4b8a` | `#fffaf0` | 7.16:1 |
| `district-nightjar` | Nightjar | `#2b5c8a` | `#fffaf0` | 6.73:1 |
| `district-crown` | Crown | `#7a3e8e` | `#fffaf0` | 6.94:1 |

The ratios are WCAG relative-luminance calculations rounded to two decimals.
The minimum normal-text ratio is 4.5:1; large text and essential component
boundaries meet 3:1. The base checks are `ink` on `canvas` (14.92:1),
`muted-ink` on `canvas` (5.75:1), and `brand-ink` on `brand` (7.98:1). Re-run
the same checks for dark mode and forced-colors values before shipping a theme.

## DS-030 — Shared component assignments

Use the existing accessible UI primitives and preserve their keyboard and
screen-reader behavior. Do not introduce bespoke `div` controls.

| Surface | Component anatomy | Responsive placement |
| --- | --- | --- |
| Create form | Heading, grouped fields, piece picker, Human/Computer steppers, collapsed rules summary, age acknowledgement, seat tray, one submit | One column; seat tray wraps without becoming a second page |
| Lobby preview | Miniature 11 × 11 board, ordered seat tray, invite action, exact start condition, host controls | Board above tray; controls remain reachable at 320 px |
| Board | Semantic 40-cell perimeter grid, center context, equivalent ordered list | Fitted viewport on phone; full anchor on desktop |
| Player rail | Ordered player cards with piece, pseudonym, cash/debt, connection, elimination, and turn marker | Left rail desktop; horizontal `overflow-x: auto` strip on phone |
| Decision surface | Context heading, authoritative facts, one primary verb action, secondary inspection, pending/rejected/disabled reason | Right rail desktop; bottom sheet phone |
| Deed card | Color Set band, Property name, level/Rent, House/Hotel, owner/mortgage state, Manage entry, blocked reason | Grouped hand desktop; labelled stack/list on phone |
| History and Bank | Heading, readable event rows, bounded scroll region, no primary action | Secondary panel; never expands page width |
| Summary | Result heading, standings table, explanation, read-only board/history, fresh rematch | One-column narrow layout with local table scrolling |

Primary controls use a verb and object: “Acquire this Property”, “Place bid”,
“Build House”, “Redeem Mortgage”, or “Send trade”. Never use an unlabeled
“Confirm” as the only action name. A decision has one filled primary control;
inspection and cancellation are secondary.

## DS-040 — Board-cell and deed grammar

The board is an 11 × 11 CSS grid or equivalent semantic layout. The 40 cells
are placed in route order around the perimeter; the center contains only
contextual table information. Cell geometry must preserve the square frame at
all supported widths. A board viewport may scroll or zoom internally, but the
page itself never gains horizontal overflow.

Each cell has this DOM reading order:

1. Route index and canonical `deedId`/space ID, visually compact but available
   to assistive technology.
2. Property band or space-type marker.
3. Display name and generic type label.
4. Owner/piece marker and mortgage or restriction status, when applicable.
5. Rent, improvement, landing effect, and available action details.

Use the following anatomy: 8 px group band for a deed, 12 px internal padding
on desktop and 8 px on phone, a 1 px `line` boundary, a 2 px `focus` or
`selection` outline, a stable pictogram for event/fee/transit/utility spaces,
and a text status badge for ownership and mortgage. Corner anchors use a
heavier 2 px boundary and a short destination/effect label. A selected cell
uses the selection outline and active-space heading; it does not scale or
reflow adjacent cells.

The ordered board list is always available through the Board inspection control
and contains every fact conveyed by position or color: canonical ID, display
name, type, Color Set, owner/status, value/effect, improvement level, and
permitted action. The board visual is not a canvas-only source of state.

### DS-041 — State encoding table

| State | Required visual cue | Required nonvisual cue |
| --- | --- | --- |
| Available | Open surface, group band, open-stamp icon | “Available” text and accessible action |
| Owned | Owner-colored edge and piece glyph | Owner name, piece name/pattern, and `aria-label` |
| Mortgaged/restricted | Diagonal ledger mark and muted surface | “Mortgaged”/reason text and status icon |
| Selected/inspected | 2 px selection outline and active detail | Selected state, heading relationship, and focus |
| Current turn | Brand outline on player card and board piece | “Current turn” text and live announcement on transition |
| Action required | Brand decision card edge and urgency badge | Required actor, heading, and one primary action |
| Disabled/unaffordable | Reduced emphasis and constraint icon | Exact reason such as balance, phase, or connection |
| Disconnected/paused | Neutral connection icon and status border | Persistent “Reconnecting”, “Offline”, or “Paused” text |

## DS-050 — Original player pieces, patterns, and motion

The six selectable pieces remain visually and semantically distinct at 16 px:

| Piece | Silhouette | Pattern/color companion |
| --- | --- | --- |
| Lantern | Rounded lantern body with a top handle | Vertical bars and player color |
| Key | Circular bow with a single stepped shaft | Diagonal hatch and player color |
| Crescent | Open crescent cutout | Dots and player color |
| Tower | Two stacked square levels | Horizontal stripes and player color |
| Fox | Pointed ears and tapered body | Crosshatch and player color |
| Teapot | Round body, handle, and short spout | Checker pattern and player color |

The silhouette, accessible piece name, and pattern repeat in player rails,
board stacks, the creation picker, and the lobby tray. A stack of pieces shows
the front piece plus a count and exposes an ordered accessible list. Never use a
player color as the only player identity.

Motion is brief and functional: 120–180 ms for control feedback, 180–260 ms
for sheet open/close, and a skippable/interruptible movement sequence only
after the server confirms the movement event. Use opacity and transform only.
The final state is visible without animation. With
`prefers-reduced-motion: reduce`, remove movement interpolation and use an
immediate state change with the same live announcement. Sound and haptics are
opt-in, independently switchable, never autoplayed, and never the sole result
cue.

## DS-060 — Decision, hand, focus, and mobile-sheet rules

The desktop table uses a three-region grid: a 240 px player rail, a flexible
board column, and a 288 px decision/detail rail. The board column is the only
region that grows; all grid/flex children use `min-width: 0`. The hand spans
the board column below the board and groups deeds by Color Set. Bank/history
regions have their own bounded scroll containers.

The property hand card always shows Property name, Color Set, current Rent
level, Houses/Hotel, mortgage state, build cost, and the authoritative blocked
reason. **Manage** opens the legal actions supplied by the projection; it does
not invent a client-side action. After acknowledgement or rejection, focus
returns to the invoking deed or decision.

At 320–767 px, the shell is a single column with a safe-area-aware header,
fitted board viewport, active-space detail, horizontal player strip, and a
bottom decision sheet. The sheet has a visible heading, drag affordance, close
button when dismissal is legal, and a focus return target. It never hides an
unresolved required action. Board/Properties/Trade/History navigation remains
available without losing the decision.

Tap-to-focus and zoom are scoped to the board viewport. Focus follows the
authoritative active space after a confirmed event; a deliberate inspection
persists until the active space changes or the player selects **Follow active
space**. Provide reset/focus escape. Do not set `user-scalable=no`, intercept
browser zoom, or use page-level transforms. Wide board/list/player content has
an explicit `overflow-x: auto` container and a visible clipping affordance.

### DS-061 — Forced colors and text enlargement

Use `@media (forced-colors: active)` to replace fills with system colors,
retain 2 px borders for groups and selection, and expose ownership, status, and
focus in text and shape. Decorative patterns may disappear; semantic labels may
not. At 200% and 400% text enlargement, reflow cards and rails into one column,
retain 44 px targets, and preserve the ordered board list. No content or action
may depend on hover.

## DS-070 — Responsive layout contract

Breakpoints are fixed and shared by every table surface:

| Width | Layout contract | Overflow contract |
| ---: | --- | --- |
| 320 px | Single column; 16 px gutter; compact header; fitted board viewport; bottom sheet | Board, players, history, and tables scroll in their own containers |
| 375 px | Same single column; 16 px gutter; 8 px cell inset; full decision labels | No page-level horizontal scroll; every control remains 44 px |
| 768 px | 24 px gutter; board-first split with 320–400 px contextual panel | Panel and board have independent vertical scroll where needed |
| 1280 px | 32 px gutter; 240 px player rail / flexible board / 288 px decision rail; hand below | Board is the anchor; secondary surfaces are bounded |

Layout sketches:

```text
320 / 375                 768                         1280
┌──────────────┐          ┌──────────────────────┐    ┌─────┬───────────┬────┐
│ header       │          │ header               │    │rail │   board   │dec │
│ board view   │          │ board │ context      │    │     │           │    │
│ active space │          │       │              │    │     │           │    │
│ player strip │          │       │              │    └─────┴───────────┴────┘
│ nav / sheet  │          │ actions below        │       property hand below
└──────────────┘          └──────────────────────┘
```

At every width, provide named landmarks for header, main table, board/board
list, players, decision, property hand, and history. The same legal actions
and authoritative facts are available at 320, 375, 768, and 1280 px; only
placement and inspection affordances change.

## DS-071 — Classic table material and color roles

DS-071 fixes the cream/dark-ink table, the eight Color Set roles, the semantic
palette, contrast targets, typography, spacing, elevation, and the original
piece language above. A component is conforming only when it consumes these
roles and keeps its state meaning after color, motion, and shadow are removed.

Elevation has two levels only: level 0 is a flat `surface` with a 1 px line;
level 1 is a decision sheet or raised card with `0 4px 16px rgb(31 36 48 / 16%)`
and a 1 px line. Never use elevation to indicate ownership or availability.

## DS-072 — Semantic board and hand grammar

DS-072 fixes the 40-cell anatomy, 11 × 11 perimeter geometry, cell reading
order, equivalent board list, deed card fields, player-piece silhouettes,
patterns, ownership/mortgage/action encodings, and grouped property hand. It
maps to UX-044–046 and to the canonical IDs in the game-content contract.

## DS-073 — Responsive table, action, and evidence matrix

DS-073 fixes the four viewport contracts, the desktop rail widths, mobile sheet
and focus/zoom behavior, target sizes, input type, overflow containment,
reduced-motion behavior, and forced-color fallback. It maps to UX-041–046 and
is the source of truth for visual-regression capture.

### Visual-regression viewport/state matrix

Capture light, dark, reduced-motion, and forced-colors variants where the
environment supports them. Each state must use a fixed projection fixture;
screenshots never assert guessed or fabricated live state.

| State | 320 | 375 | 768 | 1280 | Required assertions |
| --- | :---: | :---: | :---: | :---: | --- |
| Create defaults | ✓ | ✓ |  | ✓ | Two Humans, zero Computers, piece picker, seat tray, one submit |
| Join availability | ✓ | ✓ |  | ✓ | Only server-reported pieces, stale-choice recovery copy |
| Lobby partially filled |  | ✓ | ✓ | ✓ | Mini-board, open seats, invite primary, exact unmet condition |
| Normal turn | ✓ | ✓ | ✓ | ✓ | Board anchor, player identity, one Roll/advance action |
| Acquisition or auction | ✓ | ✓ | ✓ | ✓ | Property context, bid/acquire action, no unrelated primary action |
| Property management | ✓ | ✓ | ✓ | ✓ | Grouped hand, rent/level/status, blocked reason, focus return |
| Debt/disconnected | ✓ | ✓ | ✓ | ✓ | Cash/debt, pause/reconnect text, legal continuation, no timer |
| Completed/retired summary |  | ✓ | ✓ | ✓ | Read-only result, reason, history, fresh rematch |

## Design-to-UX requirement map

| Design contract | UX requirements | Implementation evidence later required |
| --- | --- | --- |
| DS-071 table materials, palette, type, pieces | UX-041–044, UX-046 | Contrast calculations, component snapshots, content/provenance review |
| DS-072 board, deed, rail, hand grammar | UX-043–046 | 40-cell topology, list equivalence, legal-action and non-color tests |
| DS-073 responsive layout, sheets, focus, motion | UX-041–046 | 320/375/768/1280 browser matrix, overflow, focus, reduced-motion, and forced-color evidence |

## Implementation checklist

1. Define semantic Tailwind variables for light, dark, and forced-colors
   fallback; components must not use raw group values outside the palette map.
2. Load only the licensed UI/display font weights needed above the fold and
   keep the fallback metrics compatible with the spacing contract.
3. Build the board cell, board list, player rail, player piece, deed card,
   decision surface, action sheet, active-space detail, property hand, and
   bounded event/history surfaces from the anatomy above.
4. Verify ownership, availability, mortgage, action-required, pending,
   rejected, disconnected, and terminal states without color or motion.
5. Capture the visual-regression matrix at 320, 375, 768, and 1280 CSS px
   before implementation claims DS-071–073 as evidenced.
6. Keep names, artwork, rules, and asset provenance aligned with the Brand,
   IP-safety, and Game-content authorities. This document does not grant legal
   clearance or public-use approval.
