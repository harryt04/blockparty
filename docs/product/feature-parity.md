# Mechanical completeness matrix

This is the exhaustive mechanical-completeness checklist requested for the MVP in [PRD](prd.md). It is an internal coverage tool, not a public compatibility claim. It does **not** authorize copying names, board layouts, card text, numerical schedules, artwork, trade dress, selection/arrangement, or other expression from a commercial title. Implement [Glossary](glossary.md), [Rules](rules.md), and independently authored [Game content](game-content.md); choose optional behavior only through [Rule variants](rule-variants.md).

## Exhaustive mechanical-completeness matrix

| Area | Mechanical coverage | Product behavior / acceptance evidence | Expression boundary |
|---|---|---|---|
| Setup | 2–6 seats; random initial order; starting cash; bank inventory; shuffled card decks; fixed board definition; guest/bot mix | Lobby validates all seats and records seed, board/rules/variant versions on start | Use original board/assets/data and independently written setup copy. |
| Turn flow | One active player; ordered effect queue resolves every mandatory effect before management/end-turn; server rejects out-of-phase actions | State-machine test proves a player cannot end a turn with unresolved choice/debt and resumes the exact interrupted queue after debt | Do not reproduce commercial UI flow/text. |
| Doubles | Matching dice trigger extra turn; three consecutive matching rolls send player to Detention with no movement from third roll | Counters reset at turn end and after Detention transfer | Generic dice labels and original animation. |
| Board movement | Advance by dice; pass/land Start payment; move-to instructions; backwards movement; destination resolves once | Event log distinguishes pass, exact landing, and forced movement | Independently choose topology, labels, and visual layout. |
| Acquisition | Unowned purchasable landing gives current player a buy/decline choice at printed deed cost | Buy transfers cash to bank and ownership atomically | Original deed values and copy. |
| Auctions | Declined/unaffordable unowned deed enters an ordered ascending auction, including original player; rotating priority permits a funded higher bid or permanent pass; highest valid bidder pays bank | Test priority rotation, zero-bid/no-bid outcome, and disconnected priority pause with no timeout | Original auction prompts. |
| District rent | Owner charges a schedule based on deed state; full ownership of a district changes unimproved rent | Engine returns formula inputs/amount in event detail | Do not copy a commercial rent table. |
| Transit rent | Owner charges according to how many transit deeds they own | Formula is data-driven and explained | Original categories, quantities, and schedule. |
| Utility rent | Owner charges dice-based rent using owned-utility count; card-directed utility move uses its content-defined roll source/multiplier, otherwise the most recent movement roll | Event records roll source, basis, and multiplier | Original formula values/wording. |
| Improvements | Buy/sell improvements through bank; improvement count changes rent; district ownership and mortgage constraints apply | Legal-action API explains blocked improvements | Original building art, prices, and schedules. |
| Shortages | Finite improvement inventory can block purchase; level transitions consume/return content-defined pieces; if at least two seats declare eligible demand exceeding available inventory, bank auctions scarce units | Inventory conservation, zero-inventory, multi-demand auction, landmark-transition, sale, and bankruptcy tests | Use original pieces, progression, quantities, and presentation. |
| Mortgages | Owner can mortgage eligible deed to bank, collect deed value, suspend its rent; redeem with configured canonical charge | Cannot mortgage while district has improvements; redemption amount is deterministic | Original financial values. |
| Trades | Two active players may atomically exchange present cash, whole deeds, and detention-release cards only; no promises or future consideration; both confirm | Atomic accept/cancel and reconfirmation after a change; ordinary trades are blocked by mandatory resolution/debt, while a debtor may make only debt-permitted liquidation trades with a solvent counterparty | Original trade UI/copy. |
| Cards | Draw from deck, apply instructions in order, discard/rotate; retainable release cards leave deck until used/traded | Tests cover money, movement, repairs, detention, and deck exhaustion | Independently author every card theme, wording, title, and distribution. |
| Detention | Arrival, release options, limited attempts, movement after release, and turn consequences are explicit | State-machine test covers each release route and failed attempt | Use `Detention`, not copied terms/text. |
| Debt | Forced obligation must be paid if possible; debtor may only liquidate or make immediate atomic cash/deed/release-card trades with a solvent counterparty; creditor is paid only after funds exist | Refusal has no timer: state remains paused until payment, liquidation, bankruptcy, reconnect, or explicit safe-boundary bot replacement; preserves exact creditor/amount and interrupted effect queue | Original messages. |
| Bankruptcy | If obligation cannot be met after legal liquidation, transfer assets according to creditor type, apply defined mortgage-transfer charge outcomes, return improvements, remove player | Tests player-creditor and bank-creditor branches, including an unaffordable transfer charge | Original terminology and summaries. |
| Elimination/endgame | Bankrupt player is eliminated; turns skip them; final remaining player wins; all-bankrupt edge produces no winner | Completion record has standings/reason | Original end screen. |
| Bank | Bank starts/receives payments, sells deeds/improvements, auctions, issues/redempts mortgages, holds unowned/returned assets, and never runs out of cash | Separate bank ledger/inventory invariants | Original bank presentation. |
| Information | Public board/ownership/cash/history/rules; private capability tokens never exposed; card/deed detail available on demand | Responsive inspect panels and accessible text equivalent | Original iconography/content. |
| Accessibility | Keyboard/touch actions, visible focus, semantic state, live turn/debt announcements, reduced motion | WCAG-oriented QA at mobile and desktop widths | Do not depend on physical-board visual conventions alone. |
| Lifecycle/reconnect | Persistent authoritative state; action idempotency; game-seat tokens, host-approved reclaim, safe-boundary bot replacement/host transfer; host `NO_CONTEST`; definitive 30-day retention/expiry; finished replay | Restart/concurrent-action tests; disconnected required actor pauses with no automatic timer; no-contest records no winner; active stale game records `EXPIRED` before deletion | Original reconnect language. |

## Research and expression boundary

Primary sources can identify uncopyrightable ideas or methods, but they are not production source material. Publisher-specific research, if counsel approves it, must be access-controlled, version-pinned, dated, and separated from expressive authorship and production assets. Record what factual behavior was extracted, who independently authored the requirement, and the similarity-review result.

| Source | Why consult | Link |
|---|---|---|
| U.S. Copyright Office, *Works Not Protected by Copyright* (Circular 33) | General discussion of protectable game expression versus ideas/methods of play | https://www.copyright.gov/circs/circ33.pdf |
| U.S. Copyright Office, Compendium §313.6(C) | Treatment of game rules/methods | https://www.copyright.gov/comp3/chap300/ch300-copyrightable-authorship.pdf |
| USPTO trademark search | Screen candidate public names/marks before adoption | https://tmsearch.uspto.gov/ |

**Legal disclaimer:** This matrix is product planning, not legal advice or a clearance opinion. Copyright, trademark, unfair-competition, contract, jurisdictional, and open-source licensing questions require qualified counsel. Keep the versioned asset/content provenance record in [Game content](game-content.md), document independent authorship and balancing/simulation work, and have counsel review the complete mechanic combination—not merely isolated labels or assets—before release or naming the product. Any publisher materials used by counsel must be restricted, version-pinned research records; they are not a product-content source.

## Implementation trace

- Canonical decisions, edge cases, state machine, and action legality: [Rules](rules.md).
- Optional presets/toggles and validation: [Rule variants](rule-variants.md).
- Product/security/accessibility/release requirements: [PRD](prd.md).
- Neutral terms and implementation wire names: [Glossary](glossary.md).
- Original versioned content and provenance requirements: [Game content](game-content.md).
