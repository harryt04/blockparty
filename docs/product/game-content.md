# Original Game Content Specification

**Content schema:** `1.0.0`  
**Status:** implementation contract for independently authored data

This document defines what `packages/game-content` must supply without prescribing or copying any third-party board, values, card wording, order, or visual presentation. Content is designed from the project's own brief, simulations, and playtests. See [IP safety](../legal/ip-safety.md) for provenance and release controls.

## Versioned content bundle

| ID          | Requirement                                                                                                                                                                                                                                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CONTENT-001 | A content bundle has immutable `contentVersion`, `rulesSchemaVersion`, `variantSchemaVersion`, creation date, author/reviewer records, and a canonical hash. A started game embeds or durably references that exact bundle.                                                                                                         |
| CONTENT-002 | The board defines an original route topology with stable space IDs, route order/edges, Start and Detention destinations, and independently selected quantities and arrangement. It must not reconstruct a third-party board's sequence or visual geometry.                                                                          |
| CONTENT-003 | Every space declares one type and a validated effect queue: Start, deed, event draw, fee, Rest, Detention, Send to Detention, or another counsel-approved original type. Effects use the bounded DSL below.                                                                                                                         |
| CONTENT-004 | Every deed defines original name, category (`district`, `transit`, or `utility`), purchase and mortgage values, transfer/redemption charges, rent formula/table, and optional improvement schedule. District membership is explicit and referentially valid.                                                                        |
| CONTENT-005 | The economy defines starting cash, Start payment, Detention release fee/attempt count, improvement costs/resale rounding, finite inventory quantities, per-level inventory piece deltas, scarce-unit auction cost treatment, currency label, and bank-directed fees. All values are integer minor units and independently balanced. |
| CONTENT-006 | Decks contain independently authored titles, text, art references, weights/order rules, retainability, and effect queues. No card may paraphrase or preserve a third-party card's distinctive wording, collection, or ordering.                                                                                                     |
| CONTENT-007 | Variant data defines jackpot-eligible fees, starting-asset deal count/eligibility, and any configured multipliers required by [Rule variants](rule-variants.md). It cannot add a ninth MVP toggle through content.                                                                                                                  |
| CONTENT-008 | Every creative or numerical asset records provenance: creator, date, source inputs, license/assignment, AI-tool record where applicable, review, and similarity disposition. Missing provenance blocks release.                                                                                                                     |
| CONTENT-009 | Build-time validation rejects duplicate IDs, missing route targets, invalid district membership, negative/non-integer values, incomplete rent levels, impossible inventory, unrepresentable effects, invalid card targets, and variant data outside schema bounds.                                                                  |
| CONTENT-010 | Balance evidence includes reproducible simulations and human playtests across 2–6 seats, all-human and bot mixes, standard/short presets, and each variant independently. Record duration, elimination timing, money supply, asset concentration, and stalled-game rate.                                                            |
| CONTENT-011 | Release review compares the complete selection and arrangement, economy, board presentation, terminology, decks, and art against identified legal risks. Public release requires the attorney gate; mechanical implementation alone is not a safety conclusion.                                                                     |

Rent data is category-specific and remains part of each deed's immutable
content: district deeds provide `completeDistrictMultiplier` for level-zero
rent when every deed in the district is owned and unmortgaged; transit deeds
provide `transitRentByCount`, indexed by the owner's transit-deed count; and
utility deeds provide `utilityMultiplierByCount`, indexed by the owner's
utility-deed count. Index zero is reserved in both count tables so the index
matches the canonical owned count. All entries are non-negative integer minor
units (or integer multipliers) validated before the bundle is selectable.

## Effect DSL

Effects are typed data, not executable scripts. The initial closed set is:

```ts
type ContentEffect =
  | { type: "PayBank"; amount: Money; jackpotEligible?: boolean }
  | { type: "PayEachPlayer"; amount: Money }
  | { type: "CollectBank"; amount: Money }
  | { type: "CollectEachPlayer"; amount: Money }
  | { type: "MoveBy"; spaces: number }
  | { type: "MoveTo"; spaceId: SpaceId; collectStartWhenCrossed: boolean }
  | { type: "SendToDetention" }
  | { type: "Draw"; deckId: DeckId }
  | { type: "RepairCharge"; perImprovement: Money; perLandmark: Money }
  | { type: "GrantDetentionReleaseCard" }
  | { type: "Choose"; choiceId: ChoiceId };
```

The engine resolves effects in array order using [RULE-007](rules.md). New effect types require schema review, deterministic engine support, accessibility copy, migration fixtures, and a content-version change.

## Authoring and balancing workflow

1. Write desired strategic outcomes and target game length without consulting a third-party data table.
2. Draft original topology, values, names, effects, and visual concepts with provenance records.
3. Validate schema and run seeded simulations at 2, 3, 4, 5, and 6 seats.
4. Playtest for comprehensibility, negotiation quality, runaway leaders, elimination timing, and deadlocks.
5. Adjust values from project evidence, preserving each revision and rationale.
6. Run brand, accessibility, similarity, license, and attorney release reviews before publishing.

The raw prompt in `docs/mvp-prd-prompt.md` is superseded historical input and is not an implementation or content-authoring authority.
