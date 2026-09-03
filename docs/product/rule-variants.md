# Rule variants and presets

**Variants schema:** `1.0.0`  
This specification overlays [canonical Rules](rules.md) and independently authored [game content](game-content.md) for games in [PRD](prd.md). A game captures one immutable resolved configuration at start. No setting may change after `LOBBY` exits, including by deployment defaults.

## Presets

| Preset               | Defaults                                                                        | Intended effect / warning                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `standard` (default) | All eight toggles false                                                         | Closest to canonical rules; still uses independently authored board data, not another game's data.                                                                               |
| `short-game`         | `startingAssetsDealt=true`; `relaxedEvenBuilding=true`; all other toggles false | Faster early ownership/development and materially different strategy. Expect a shorter but higher-variance game; do not describe it as an official commercial short-game format. |

Selecting a preset writes its resolved values into the lobby. The host may then change individual toggles before start; the UI labels the configuration `custom` when it no longer equals a preset.

## Exactly eight MVP toggles

| ID      | Key                                 | Default | Effect                                                                                                                                              | Duration/balance warning                                                                          |
| ------- | ----------------------------------- | ------: | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| VAR-001 | `restSpaceJackpot`                  |   false | On Rest, pay the accumulated jackpot to the landing player, then reset it. Selected bank fees fund the jackpot.                                     | Transfers fees from bank to chance-based payout; can create cash spikes.                          |
| VAR-002 | `doubleStartOnExactLanding`         |   false | A normal exact landing on Start pays one additional Start amount, for two total Start amounts for that landing.                                     | Increases cash injection and benefits exact rolls.                                                |
| VAR-003 | `noAuctionAfterDeclinedAcquisition` |   false | An unowned deed stays bank-owned after decline/unaffordability instead of entering auction.                                                         | Reduces early liquidity pressure and can lengthen games.                                          |
| VAR-004 | `noIncomeWhileDetained`             |   false | A detained player collects no rent or card-directed income; bank payments still occur.                                                              | Makes Detention much harsher and can accelerate elimination.                                      |
| VAR-005 | `bonusForMatchingOnes`              |   false | Rolling double ones awards the configured Start amount from bank in addition to normal matching-dice behavior.                                      | Adds a rare cash injection; stacks with exact Start if both occur.                                |
| VAR-006 | `startingAssetsDealt`               |   false | After starting cash/order, deal the data-defined number of bank-owned deeds fairly to each player without payment; remaining deeds stay bank-owned. | Speeds ownership and can produce uneven district opportunities; deal algorithm must be auditable. |
| VAR-007 | `relaxedEvenBuilding`               |   false | A player may buy/sell improvements on any eligible deed without the within-district one-level spread rule.                                          | Enables concentrated rent spikes and shorter, swingier games.                                     |
| VAR-008 | `unlimitedImprovementInventory`     |   false | Ignore finite bank improvement inventory for purchases/sales.                                                                                       | Removes a strategic scarcity lever and may shorten endgame.                                       |

## Canonical configuration details and interactions

1. **Jackpot funding.** When `restSpaceJackpot` is true, only board-data fees explicitly tagged `jackpotEligible` fund the pot (initially fee/tax spaces and bank penalties, not purchases, rent, mortgage charges, auction bids, or card payments unless the card is explicitly tagged). The pot begins at zero. Fees still go to bank when the toggle is false. If a player cannot pay an eligible fee, only the amount actually paid after debt resolution enters the pot. A bank-directed bankruptcy does not fabricate the unpaid balance.
2. **Start payments.** `doubleStartOnExactLanding` applies only to a normal dice movement that finishes on Start. It does not apply to a forced movement, backward movement, Send to Detention, or starting the game on Start. It stacks with `bonusForMatchingOnes` when both trigger on the same roll.
3. **Declined deed.** `noAuctionAfterDeclinedAcquisition` replaces only the automatic auction caused by an unowned landing. Bank-directed bankruptcy auctions still run under [Rules](rules.md).
4. **Detention income.** `noIncomeWhileDetained` suppresses rent owed to the detained owner and card-directed collection paid to that owner. It does not suppress Start money, sale proceeds, mortgage proceeds, a jackpot, trade cash already agreed, or debt collection against the detained player. Suppressed rent is not deferred; it is zero for that landing.
5. **Matching ones.** `bonusForMatchingOnes` triggers once per roll when both dice show one, whether the player is later sent to Detention for a third consecutive match. It does not trigger for a utility's special rent roll or a detained release attempt unless board data explicitly defines such a roll as a normal turn roll (canonical rules do not).
6. **Dealt assets.** `startingAssetsDealt` uses a board-data `startingAssetDealCount`, must never deal a deed twice, and must use recorded random order. It deals round-robin from eligible bank-owned deeds after player order is set. It may deal district/transit/utility deeds but never improvements, mortgages, cards, or cash. If eligible deeds are fewer than seats × count, validation rejects start rather than unevenly dealing.
7. **Relaxed construction.** `relaxedEvenBuilding` changes only the even buy/sell constraint. Complete-district ownership, no-mortgaged-district building, maximum level, cost, and (unless VAR-008 is true) inventory still apply.
8. **Inventory.** `unlimitedImprovementInventory` means purchases never fail because inventory is exhausted. The implementation still records purchases/sales but does not decrement/block on the bank count; displayed inventory is “unlimited,” not a misleading finite number.

## Validation and persistence

| ID      | Requirement                                                                                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| VAR-009 | A configuration is an object with `schemaVersion`, `preset`, and exactly the eight boolean keys in the table. Unknown keys, missing keys, non-booleans, unsupported schema versions, and inconsistent resolved preset values are rejected before game start. |
| VAR-010 | A host may select/modify a configuration only in `LOBBY`; start atomically validates it, resolves the effective values, stores a content hash, and emits a `RulesConfigured` domain event.                                                                   |
| VAR-011 | The game snapshot/event stream stores the resolved configuration, schema version, and board/rules versions. Reconnect/replay never reads current deployment defaults for an existing game.                                                                   |
| VAR-012 | A schema migration must be additive or provide a deterministic migrator plus regression fixtures for every unexpired configuration. A major semantic change requires a new schema version and cannot reinterpret existing games.                             |
| VAR-013 | The lobby and in-game rules panel show enabled toggles, their warnings, and interaction notes in plain language.                                                                                                                                             |
| VAR-014 | Engine tests cover default behavior, each toggle independently, every documented interaction, configuration rejection, and lock-after-start enforcement.                                                                                                     |

### Example resolved configuration

```json
{
  "schemaVersion": "1.0.0",
  "preset": "standard",
  "restSpaceJackpot": false,
  "doubleStartOnExactLanding": false,
  "noAuctionAfterDeclinedAcquisition": false,
  "noIncomeWhileDetained": false,
  "bonusForMatchingOnes": false,
  "startingAssetsDealt": false,
  "relaxedEvenBuilding": false,
  "unlimitedImprovementInventory": false
}
```

The canonical rule engine is in [Rules](rules.md); terms are in [Glossary](glossary.md); content constants are in [Game content](game-content.md); the coverage checklist is [mechanical completeness](feature-parity.md); product constraints are in [PRD](prd.md).
