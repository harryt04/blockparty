# Design System — Blockparty

**Status:** implementation-ready visual direction, not a cleared public name · **Interaction requirements:** [UX specification](ux-spec.md) · **Product context:** [PRD](../product/prd.md), [game content](../product/game-content.md), and [brand strategy](../brand/brand-strategy.md)

## DS-001 — Creative direction and guardrails

**Blockparty** is the provisional product name adopted in [Brand strategy](../brand/brand-strategy.md); it is not cleared, and **Civora** remains the fallback. Build every visual decision so a name change re-skins the wordmark and nothing else.

The system implements the block-party creative territory through a warm nocturnal aesthetic: a street at dusk, lit by string lights. Motifs are sidewalk chalk on asphalt, taped paper flyers, folding-table edges, bunting, coolers, and stoops. Surfaces stay tactile and paper-like; numeric readouts stay precise and ledger-clean. It supports strategic social play without resembling a casino, generic SaaS dashboard, or recognizable third-party board-game presentation.

The tone is a neighborhood evening, not a carnival. Avoid alcohol cues, prize wheels, raffle tickets, and cash-toss imagery — the audience is 13+ and the brand bans gambling framing. Avoid cube-stack or chain-link motifs that read blockchain.

Do **not** copy commercial board-game trade dress: no familiar square-perimeter board composition as the sole identity, railroad/utility/property naming conventions, iconic mascot, classic corner labels, red/green house-like pieces, recognizably derived palette, banknote treatment, card styling, or rules copy. Original names, token silhouettes, illustrations, space taxonomy, and layout are mandatory. The board may be a route/map with irregular districts and clearly numbered stops; game rules determine its topology.

**Grid guardrail.** The name invites a square grid of city blocks. Do not build one. The board is a winding neighborhood street route: irregular street lengths, cul-de-sacs, corner turns, a small park, and Blocks of varying size. Treat any layout a player could mistake for a familiar perimeter board as a defect, whatever the spaces are called.

**Signature mark.** The sawhorse street barricade — the object that closes a street for a party — is the system's primary original emblem. It is unclaimed in this category, it is instantly legible at small sizes, and it carries the invitation the brand is built on.

## DS-010 — Typography and tokens

Use open-licensed, self-hosted fonts with system fallbacks: **Atkinson Hyperlegible** for UI/body (legibility-first) and **Fraunces** only for display headings/occasional space titles. Avoid condensed all-caps body text. Minimum body is 16 px, line-height 1.5; use tabular numerals for balances and bids. If font loading fails, retain hierarchy with `ui-sans-serif`/Georgia fallbacks.

```css
:root {
  --font-ui: "Atkinson Hyperlegible", ui-sans-serif, system-ui, sans-serif;
  --font-display: "Fraunces", Georgia, serif;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.5rem;
  --space-6: 2rem;
  --space-8: 3rem;
  --radius-sm: 0.375rem;
  --radius-md: 0.75rem;
  --radius-lg: 1.125rem;
  --radius-pill: 999px;
  --border-thin: 1px;
  --border-strong: 2px;
}
```

Use a 4 px spacing base. Layout gutters: 16 px mobile, 24 px tablet, 32 px desktop. Use `radius-md` for controls/cards, `radius-lg` for sheets/panels, and no radius for route-cell boundaries unless a map region calls for it. Shadows are restrained: one low-elevation diffuse shadow for floating sheets; state/ownership never depends on shadow.

## DS-020 — Semantic color roles

Define colors as semantic Tailwind CSS variables, with separately tuned light/dark values—not fixed copied palette values:

| Role                                                              | Use                                   | Required companion cue                                            |
| ----------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| `canvas`, `surface`, `surface-raised`, `ink`, `muted-ink`, `line` | Reading hierarchy and structure       | Borders, typography, and elevation retain hierarchy in grayscale. |
| `brand`, `brand-ink`                                              | Primary action/current route emphasis | Label/icon and focus treatment.                                   |
| `player-1` … `player-6`                                           | Player association                    | Unique token silhouette + pattern/initial; never color only.      |
| `asset-district-*`                                                | Original space/district categories    | Icon, category label, and patterned edge.                         |
| `success`, `warning`, `danger`, `info`                            | Outcomes/urgency                      | Text status and icon; warning/danger have strong border.          |
| `focus`, `selection`, `disabled`                                  | Interaction state                     | Outline/shape/opacity plus `aria-*` state.                        |

Maintain 4.5:1 normal-text and 3:1 large-text/essential-component contrast. Use `oklch()` semantic variables where supported; test each theme and forced-colors mode. Dark mode is a dim asphalt-and-string-light surface treatment, not inverted light mode: reduce glare, keep borders legible, and preserve player-pattern distinction.

## DS-030 — Component anatomy and responsive behavior

Build from shadcn primitives, styled with Tailwind semantic tokens; preserve their accessible behavior rather than replacing it with bespoke div controls.

The sidebar/navigation is expected to behave and look like the example in shadcn's website:
https://ui.shadcn.com/docs/components/base/sidebar

| Need                                  | shadcn composition                                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Primary/secondary/destructive actions | `Button`, `ButtonGroup`, `Toggle` only for persistent binary state                                                                      |
| Forms and validation                  | `Form`, `Input`, `Select`, `Checkbox`, `RadioGroup`, `Switch`, `Label`, `Textarea`                                                      |
| Decisions and warnings                | `Dialog` desktop, `Sheet` mobile, `AlertDialog` for destructive/irreversible confirmation, `Sonner`/toast only for noncritical feedback |
| Game information                      | `Card`, `Badge`, `Avatar` (token glyph, not photo), `Progress`, `Separator`, `Table`/semantic lists, `ScrollArea`, `Tooltip`            |
| Navigation and inspection             | `Tabs`, `Accordion`, `Popover`, `DropdownMenu`, `Command` for searchable asset list, `NavigationMenu` only outside active play          |
| System states                         | `Skeleton`, `Alert`, `EmptyState` composition, `Tooltip` plus visible disabled reason                                                   |

Buttons use a verb + object (“Acquire 4 Maple Stoop”), not vague “Confirm.” Primary action appears once per decision. Mobile sheets are bottom-anchored with drag affordance **and** close button; tablet promotes contextual content to split panel; desktop uses persistent panels per [UX-030–UX-033](ux-spec.md#4-responsive-game-shell). Tables collapse to labelled definition/list rows at narrow widths; player strip remains horizontally scrollable with visible clipping affordance.

## DS-040 — Board and space grammar

Implement the board as semantic DOM controls and scalable SVG decoration, with an equivalent ordered board list. Never use an opaque canvas ([UX-040](ux-spec.md#6-accessibility-acceptance-requirements--ux-040)). Each space is a `button`/link-like inspectable element only when it has an available action; otherwise use a labelled group with a separate inspect control. SVG must not be the only source of names/statuses.

Each cell contains, in reading order: route index, original category pictogram, space name, ownership marker/owner token glyph, economic indicator (when public), and state badges. Cell identity uses a distinctive edge pattern and icon family; district color is supplemental. A selected cell has `aria-current`/pressed state, 2 px focus/selection outline, and a text label in active-space detail. Current player position uses a shaped token plus player initial/pattern; stacked tokens collapse to a count with an accessible list.

Suggested original category iconography: sawhorse barricade, food truck, string light, folding table, cooler, chalk arrow, boombox, taped flyer, stoop step, or fire hydrant—drawn as simple single-weight line marks. Avoid houses, hotels, locomotives, top hats, dice mascot art, and cash imagery associated with a particular legacy game. Board cells use chalk-line hairlines, paper-label inset, and occasional taped-flyer corner—not glossy gradients or KPI widgets.

Map each display category to one icon and hold it stable: Address, Block, Food Truck, Hookup, Sunup, The Stoop, Noise Complaint, Permit Fee. The mapping is defined in [Brand strategy](../brand/brand-strategy.md#two-layers-one-mapping); icons follow the display layer, and code follows the wire layer.

### DS-041 — State encodings

| State                 | Visual + nonvisual encoding                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------- |
| Owned                 | Owner token glyph, name, patterned edge, `aria-label` ownership text; optional player color. |
| Available             | “Available” text/badge and open-stamp icon; no owner glyph.                                  |
| Mortgaged/restricted  | Slashed ledger stamp, explicit text, muted surface, status icon.                             |
| Selected/inspected    | 2 px outline, inset marker, active-space heading, programmatic selected state.               |
| Current turn/player   | Turn label, token shape, outline, and text in player strip.                                  |
| Action required       | Labelled urgency badge and action-sheet heading; not a pulsing color alone.                  |
| Disabled/unaffordable | Reduced emphasis plus lock/constraint icon and specific reason.                              |

## DS-050 — Icons, illustration, motion, sound, haptics

Use one open-source SVG icon set (for example Lucide) at 20–24 px, with text labels for unfamiliar or consequential actions. Custom illustrations are sparse, screen-print-like line art: closed streets, string lights, folding tables, food trucks, stoops, and abstract neighborhood fauna. Chalk texture is an accent, never a legibility cost. Decorative SVG has `aria-hidden`; meaningful artwork has text alternative.

Motion is functional and brief: 120–180 ms control feedback, 180–260 ms sheets, and a skippable/interruptible route movement sequence. Use opacity/transform only; do not rely on movement to communicate outcome. Respect `prefers-reduced-motion: reduce` by showing final state immediately. Sounds and haptics are opt-in, independently switchable, and have distinct but nonessential cues for turn, success, and warning; no autoplay and no sound-only information.

## DS-060 — Accessibility implementation rules

Meet [UX-040](ux-spec.md#6-accessibility-acceptance-requirements--ux-040): visible 3:1+ focus ring against adjacent colors, 44 px targets, semantic landmarks, focus-managed dialogs, restrained live announcements, keyboard board navigation, 320–400% reflow, and high-contrast/forced-colors support. Do not suppress browser zoom. Status icons include accessible names; decorative pattern is never the sole indicator. Test touch, keyboard-only, VoiceOver/NVDA, reduced motion, dark mode, and 200%/400% zoom before release.

## DS-070 — Implementation checklist

1. Define semantic Tailwind variables for light, dark, and forced-colors fallback; no component uses raw brand/district hex values.
2. Self-host the licensed fonts and preload only the UI face/weights used above the fold.
3. Create board cell, player token, status badge, action sheet, active-space detail, mini-map, and event-feed components with the state contracts in [UX-013–UX-019](ux-spec.md#3-end-to-end-flows).
4. Verify all ownership and game states without color, with reduced motion, and in the DOM board list.
5. Keep naming, artwork, rules, and legal review aligned with [Brand strategy](../brand/brand-strategy.md), [IP safety](../legal/ip-safety.md), and [Game content](../product/game-content.md); this system is an implementation direction, not legal clearance.
