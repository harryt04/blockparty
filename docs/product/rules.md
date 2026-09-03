# Canonical game rules

**Rules schema:** `1.0.0`  
**Scope:** the authoritative mechanics for the product described in [PRD](prd.md). Optional deviations are exclusively those in [Rule variants](rule-variants.md). [Glossary](glossary.md) is normative for terminology, and [Game content](game-content.md) defines independently authored board labels, deed data, card content, values, art, and copy.

## Terms and data model

| Term | Meaning |
|---|---|
| Start | The board space at index zero. Passing it can pay a configured bank amount. |
| deed | A purchasable asset tied to one board space: a district, transit, or utility. It has price, mortgage value, rent data, and owner/bank state. |
| district | A color/category set of deeds that supports improvements. A player has a complete district only when they own every deed in it and none is mortgaged. |
| transit | A non-district deed whose rent depends on how many transit deeds its owner holds. |
| utility | A deed whose rent depends on a dice roll and how many utilities its owner holds. |
| improvement | A bank-owned upgrade attached to a district deed. Each deed has a numeric level from 0 through its data-defined maximum; the final level may be represented as a landmark in UI. |
| landmark | The visual/name for the final improvement level; mechanically it is an improvement level, not a separate deed. |
| Detention | A constrained location/state. A player is detained, not eliminated, and may leave by the defined routes. |
| Rest | A neutral board space with no canonical payment or reward. |
| Send to Detention | A board/card instruction that immediately places a player in Detention without collecting Start payment. |
| bank | The non-player counterparty that owns unowned deeds/improvements, receives/creates money, holds decks, and applies bank-directed bankruptcy. |
| obligation | A required payment with a fixed creditor (bank or player) and amount. |

The table is a quick reference; [Glossary](glossary.md) resolves conflicts across documents. The immutable game snapshot stores: rules/board/variant versions; player order/status/cash/position; deed ownership/mortgages/improvements; bank cash and improvement inventory; decks/discards/held release cards; current phase; pending choices/obligations; ordered effect queue and serialized continuation; turn/doubles counters; PRNG state; and ordered events. Currency uses integer minor units only.

## State machine and legal options

The server transitions exactly one active state at a time. A client may show management controls only where listed; an action is legal only when it passes server validation.

| State | Entry | Legal active-player options | Exit / resolution |
|---|---|---|---|
| `LOBBY` | Game created | Host configures seats/variants; guests claim open seats; host starts | Start initializes and shuffles game. |
| `TURN_START` | Next non-eliminated player selected | Inspect public state; manage assets; propose/respond to trade; if detained, choose an available release route; roll when no pending resolution | A valid roll enters `ROLL_RESOLVE`. |
| `ROLL_RESOLVE` | Dice committed by server | No discretionary action | Apply matching-dice counter; third consecutive matching result goes to `TURN_END` after Send to Detention. Otherwise move then enter `SPACE_RESOLVE`. |
| `SPACE_RESOLVE` | Player arrives/was moved to a space | Only the explicitly offered choice (buy/decline, card-required selection, release-card handling) | Resolve space effects, recursively resolve forced card movement, then `OBLIGATION` or `MANAGE_OR_END`. |
| `AUCTION` | Purchasable unowned deed was declined/unaffordable | Every non-eliminated player may bid or pass; passed player cannot bid again | Highest bidder pays bank and receives deed. If all pass, bank retains it. Then continue resolution. |
| `OBLIGATION` | A payment is due; the exact effect-queue continuation is stored | Pay automatically if cash suffices; otherwise sell improvements, mortgage eligible deeds, and propose/accept an immediate no-promise liquidity trade | On payment, resume the serialized continuation. If no legal liquidation can pay, enter `BANKRUPTCY`. |
| `MANAGE_OR_END` | No mandatory effect remains | Active player may buy/sell improvements, mortgage/redeem, trade, inspect, or end turn; other active seats may request a scarce-improvement auction | End turn starts extra turn if matching dice earned one; otherwise `TURN_END`. A validated scarcity contest enters `IMPROVEMENT_AUCTION`. |
| `IMPROVEMENT_AUCTION` | Finite inventory is smaller than simultaneous declared eligible demand from at least two seats | Eligible demanders bid/pass in ordered rounds | Highest bidder pays the winning bid plus any content-defined base cost and applies one legal level transition; repeat for remaining inventory/demand, then resume `MANAGE_OR_END`. |
| `TURN_END` | Turn is resolved | No player action | Reset consecutive-match counter when appropriate, advance to next non-eliminated player, then `TURN_START`; one survivor enters `GAME_OVER`. |
| `BANKRUPTCY` | Player cannot satisfy obligation after legal liquidation | Bankrupt player may inspect; no further transfers | Transfer/return assets, eliminate player, then interrupted flow or `GAME_OVER`. |
| `GAME_OVER` | One active player remains, or none remain | Inspect final state/history | Immutable read-only result until expiry. |

Out-of-turn players may inspect state and accept/reject a pending trade addressed to them. They may not bid, pay, roll, manage another player's assets, or advance a phase unless the state explicitly grants it. Bot turns call the same legal-action interface and record rationale.

## Turn, movement, and spaces

1. At game start, the bank grants each player the board-data starting cash; player order is determined by recorded random draw with a deterministic tie-break. All players start on Start.
2. On a normal turn, the player rolls two dice. Matching faces grant one extra turn after a fully resolved turn. Three consecutive matching rolls during that player's consecutive turns immediately Send them to Detention; do not move for the third roll. A non-matching roll resets the matching counter when the turn ends.
3. Move forward exactly the rolled total, paying the Start pass amount once each time Start is crossed. Exact Start landing has no extra canonical payment beyond that crossing; see variants for a change.
4. Every landing or card creates an ordered effect queue from versioned content. Resolve first to last. If an effect creates a choice, auction, or obligation, serialize the remaining queue as its continuation and resume it only after that blocking phase resolves. A movement effect inserts the destination's queue immediately after movement; backwards movement never pays Start, an `advance` effect pays when it crosses Start, and Send to Detention never pays. This queue is the sole ordering rule when movement and payment appear in one card.
5. Landing on a player-owned deed creates rent obligation unless an explicit card effect says otherwise. A mortgaged deed charges no rent. A player never pays rent to themselves. Rest has no canonical effect. A fee/tax space creates a bank obligation.

## Deeds, rent, acquisition, and auctions

1. An unowned deed landing offers the active player a buy choice at its deed price if they can pay immediately. Declining or lacking cash starts an auction unless the variant disables it. There is no purchase timer.
2. Auction starts at zero as an ordered ascending round. Priority begins with the next non-eliminated seat after the landing player and rotates in seat order, including the player who declined. At priority, a player bids an integer greater than the current bid and no greater than current cash, or passes permanently. After a bid, priority moves to the next non-passed seat. When only one non-passed bidder remains, that bidder wins only if they hold the current high bid; if every player passes without a bid, the deed remains bank-owned. The winner pays bank and receives the deed atomically. No credit, mortgage, or trade occurs during bidding. There is no timer; a disconnected priority bidder pauses the auction rather than passing.
3. District deed rent is read from independently authored deed data by improvement level. An unimproved deed in a complete, unmortgaged district uses its data-defined complete-district multiplier. A district is not complete while any member is mortgaged.
4. Transit rent is the data-defined amount indexed by the number of transit deeds held by the owner. Utility rent is `utility_roll_total × utility multiplier`, where multiplier is selected by utility count. When a card directs a player to a utility and specifies a special multiplier, use a fresh recorded two-dice utility roll and that multiplier, regardless of usual ownership count.

## Improvements, mortgages, and trades

1. Improvements may be bought only on a complete, unmortgaged district and only from bank inventory. Canonical building is even: no deed in a district may exceed another deed's level by more than one. Buy one level at a time at the deed's data-defined cost. Content defines the inventory pieces consumed/returned by each level transition, including the final landmark transition.
2. Sell improvements only to the bank, one level at a time, for half their purchase cost rounded down to minor units. Canonical selling is also even: remove from a currently highest-level deed so the one-level spread remains valid. Returned inventory becomes immediately available. When at least two seats declare eligible demand that exceeds finite available inventory, the bank auctions scarce units in ordered rounds; no auction runs when inventory is zero.
3. A deed may be mortgaged only if it has no improvements and, for a district, no deed in its district has improvements. Bank pays mortgage value. A mortgaged deed earns no rent and prevents complete-district status.
4. Redeem a mortgage by paying bank `mortgage value + redemption charge`, with charge and rounding supplied by original board rules data. A transferred mortgaged deed remains mortgaged. Its content-defined immediate transfer charge becomes an obligation for the recipient. If that obligation cannot be resolved, the recipient enters bankruptcy normally; the deed follows that bankruptcy branch rather than silently returning without an owner.
5. A trade is a two-party offer containing only cash that each party presently holds, whole deeds, and held Detention-release cards. No future promises, deferred consideration, partial deeds, improvements, bank inventory, or obligations may be traded. Before transfer, the engine validates every included asset, mortgage/improvement constraint, cash balance, and transfer charge. Both parties confirm the exact current offer; any state change invalidates confirmation. During an unresolved obligation, only the debtor may initiate or accept an immediate trade, the counterparty must be active and solvent, and received cash is immediately available to the pending obligation. No trade is available during an auction or unresolved card choice.

## Cards and Detention

1. Each deck is shuffled at start using recorded secure randomness. Drawing removes its top card; ordinary cards go to that deck's discard after resolution and the discard is reshuffled only when the draw pile is empty. A held release card is removed from circulation until used, traded, or returned on holder bankruptcy.
2. Card instructions are original product data but must declare one of: bank/player payment, collection, movement, Send to Detention, release card, repair charge, or choice. Resolve instructions in printed data order; each monetary leg is a separate obligation unless card data explicitly aggregates it.
3. On entering Detention, set detained turns to zero and end the current movement/turn as applicable. At start of each detained turn, the player chooses one legal route: use a held release card; pay the board-data release fee; or attempt a matching dice roll. A matching attempt releases and moves by that roll. A failed attempt increments detained turns and ends turn without movement. After the configured maximum failed attempts, the player must pay the release fee if possible, then roll and move; if unable to pay, normal debt/bankruptcy rules apply. The matching-roll extra-turn rule does not apply to a roll used to leave Detention.

## Debt, bankruptcy, and game end

1. When money is due, automatically pay if cash covers it. Otherwise create one visible obligation containing creditor, amount, reason, and serialized effect-queue continuation. Allow only liquidation actions that can improve payment ability: sell legal improvements, mortgage eligible deeds, and the immediate trades defined above. The player may not roll, end turn, decline debt, or make future promises. There is no debt timer; a disconnected required debtor pauses play and can be replaced only through the session-recovery policy.
2. If the engine proves no legal liquidation sequence can satisfy the full obligation, the player is bankrupt. If the creditor is another player, transfer all deeds and held release cards to that creditor; deeds retain mortgages and each content-defined transfer charge becomes an obligation for the recipient. If the recipient cannot resolve it, resolve their bankruptcy normally. If the creditor is bank, return deeds to bank for auction one at a time; held release cards return to decks.
3. Before deed transfer/return, sell all improvements in each affected district to bank under the canonical selling rule and return inventory. Cash is paid toward the creditor; any unpaid remainder is recorded as discharged only for game accounting, not collected later.
4. Mark the player eliminated, remove them from turns/trades/auctions, and resolve any required bank auctions before resuming. When exactly one non-eliminated player remains, they win. If none remain due to simultaneous/unpayable bank processes, end with no winner and show standings by elimination order.

## Bank and information rules

The bank is always solvent for payments and may create/retire currency; only its finite improvement inventory is scarce. It owns unpurchased and returned deeds, receives purchase/fee/mortgage-redemption money, pays Start/mortgage/sale/card collections, runs auctions, and maintains decks. Public information includes board/deed data, ownership, mortgage/improvement state, cash totals, position, active phase, variants, and event history. Invite, host, and seat capabilities are private and excluded from events and telemetry. Accessibility and reconnect requirements are normative in [PRD](prd.md).

## Rule requirements

| ID | Requirement |
|---|---|
| RULE-001 | The server must implement the state machine above and reject every phase-invalid action. |
| RULE-002 | Random dice, deck order, and random setup must be recorded/replayable and never client-selected. |
| RULE-003 | All money calculations use integer minor units and data-defined explicit rounding. |
| RULE-004 | Every forced movement, payment, rent formula input, auction result, and elimination is emitted as an ordered event. |
| RULE-005 | Canonical rules apply unless a validated, start-locked variant explicitly supersedes one. |
| RULE-006 | Board/card/deed content must be independently authored and versioned; mechanics never require copied wording or data. |
| RULE-007 | Blocking choices and obligations must serialize and resume the exact remaining effect queue. |
| RULE-008 | `legalActions` contains executable commands; `actionAvailability` may additionally describe blocked actions without granting authority. |
| RULE-009 | Gameplay has no automatic turn, purchase, auction, trade, or debt timers in MVP. Connectivity loss never fabricates a pass, bid, trade response, or bankruptcy. |
| RULE-010 | Multiple players may occupy the same board space; uniqueness applies to seat IDs and deed ownership, not position. |
| RULE-011 | Finite improvement inventory, level-transition piece deltas, and multi-seat scarcity auctions are authoritative and preserve inventory conservation. |
| RULE-012 | A host-confirmed `NO_CONTEST` termination ends commands without declaring a winner and does not alter normal retention. |

See [mechanical completeness](feature-parity.md), [game content](game-content.md), and [rule variants](rule-variants.md). The complete combination remains subject to the attorney release gate in [IP safety](../legal/ip-safety.md).
