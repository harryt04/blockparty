# Canonical Glossary

**Status:** normative product and engineering vocabulary  
**Scope:** provisional internal language, not a cleared public brand

This document defines **two layers**. Keep them separate.

- The **Term** and **Preferred wire concept** columns are the canonical layer. Use them in requirements, code concepts, commands, domain events, wire fields, and tests. They do not change when the brand changes.
- The **Display name** column is the Blockparty presentation layer, defined in [Brand strategy](../brand/brand-strategy.md#two-layers-one-mapping). It is what a player reads. Blockparty is a **provisional, uncleared** mark with **Civora** as the fallback, so this column is expected to change and the canonical layer is not.

A dash in the Display name column means the term is internal and never surfaces to a player. Where a display name matches the canonical term, the two layers agree on purpose.

| Term                    | Display name          | Normative meaning                                                                                                                                                | Preferred wire concept      | Avoid                                               |
| ----------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------- |
| actor                   | —                     | Human or bot currently authorized to issue a command for a seat                                                                                                  | `actorSeatId`               | user when the actor can be a bot                    |
| bank                    | The Committee         | Non-player game counterparty and inventory holder                                                                                                                | `bank`                      | banker role                                         |
| bankruptcy              | Packed Up             | Terminal state for a seat that cannot satisfy an obligation through any legal liquidation sequence                                                               | `BankruptcyDeclared`        | insolvency as a second product term                 |
| deed                    | Address               | One ownable asset tied to a purchasable board space                                                                                                              | `deedId`                    | property in public copy/code                        |
| Detention               | Noise Complaint       | Constrained player state and corresponding board location                                                                                                        | `detention`                 | third-party branded terminology                     |
| Detention-release card  | Neighborly Word       | Held card that releases a player from Detention                                                                                                                  | `detentionReleaseCardId`    | release terms                                       |
| district                | Block                 | Complete set of related district deeds that permits improvements                                                                                                 | `districtId`                | using district for one deed                         |
| game-seat command token | —                     | Secret, device-held capability that authorizes commands for one seat in one game                                                                                 | `seatCapability`            | global guest identity/token                         |
| host capability         | Host controls         | Secret authority for lobby and recovery controls, separate from invite and seat capabilities                                                                     | `hostCapability`            | host flag supplied by client                        |
| improvement             | Folding Table → Stall | Intermediate upgrade level on a district deed                                                                                                                    | `improvementLevel`          | landmark for every level                            |
| landmark                | Block Stage           | Final improvement level only                                                                                                                                     | `landmarkLevel`             | generic improvement                                 |
| legal action            | —                     | Command currently executable by an authorized actor                                                                                                              | `legalActions`              | disabled option                                     |
| action availability     | —                     | Safe UI description of relevant allowed or blocked actions and reasons                                                                                           | `actionAvailability`        | source of authorization                             |
| invite                  | Invite                | High-entropy admission capability that can claim an open seat but cannot control an occupied one                                                                 | `inviteId`                  | room ID as admission secret                         |
| obligation              | Owed                  | Required payment with creditor, amount, reason, and serialized continuation                                                                                      | `obligation`                | informal debt without state                         |
| redeem mortgage         | Buy Back              | Pay the bank-defined amount to remove a deed's mortgage                                                                                                          | `RedeemMortgage`            | unmortgage in product language                      |
| Rest                    | The Stoop             | Neutral canonical space with no effect unless a variant changes it                                                                                               | `rest`                      | source-derived space name                           |
| safe command boundary   | —                     | Point after the previous authoritative command transaction commits and before another begins; an unresolved phase may remain, but no effect is partially applied | `aggregateVersion` boundary | turn boundary when a narrower condition is intended |
| seat                    | Seat                  | One of 2–6 game positions, occupied by a human or bot                                                                                                            | `seatId`                    | account/profile                                     |
| Start                   | Sunup                 | Route origin whose crossing can grant a content-defined payment                                                                                                  | `start`                     | source-derived slogans                              |
| transit                 | Food Truck            | Non-district deed with rent based on the owner's transit count                                                                                                   | `transit`                   | source-specific vehicle category                    |
| utility                 | Hookup                | Non-district deed with content-defined dice-based rent                                                                                                           | `utility`                   | copied names or formulas                            |

## Naming rules

- Domain commands and events use PascalCase, such as `AcquireDeed`, `RedeemMortgage`, and `RulesConfigured`.
- Transport event names use lower-case dot notation, such as `game.command` and `game.events`.
- Display names are game-scoped pseudonyms, not identities or accounts.
- Direct references to third-party titles remain restricted to legal research and are never canonical vocabulary.
- **Display names are presentation only.** Never place one in a command, event, wire field, database column, content-bundle ID, analytics property, or test fixture. A rename of the display layer must never require a schema migration or a content-version change.
- Translate at the presentation boundary. A component renders `district` as “Block”; it does not receive “Block” from the server.
- Add a display name here and in [Brand strategy](../brand/brand-strategy.md#two-layers-one-mapping) together. A name in one document and not the other is a defect.

Related specifications: [PRD](prd.md), [Rules](rules.md), [Game content](game-content.md), and [IP safety](../legal/ip-safety.md).
