# Canonical Glossary

**Status:** normative product and engineering vocabulary for the classic-table baseline
**Scope:** canonical wire terms and their Blockparty player-facing labels

This document defines **two layers**. Keep them separate.

- The **Term** and **Preferred wire concept** columns are the canonical layer. Use them in requirements, code concepts, commands, domain events, wire fields, database fields, content IDs, analytics, and test fixtures. They do not change when the presentation changes.
- The **Display name** column is the Blockparty presentation layer, defined in [Brand strategy](../brand/brand-strategy.md#two-layers-one-mapping). It supplies the generic player-facing language accepted for this product: Property, Color Set, Rent, Mortgage, Auction, House, Hotel, Detention, Bank, and Trade.

Display names are never input to the engine. A component may render `deed` as “Property” or `district` as “Color Set”, but it must submit the canonical command and wire values. A display-name change must never require a schema migration or a content-version bump.

A dash in the Display name column means the term is internal and never surfaces to a player. Where a display name matches the canonical term, the two layers agree on purpose.

| Term                    | Display name          | Normative meaning                                                                                                                                                | Preferred wire concept      | Avoid                                               |
| ----------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------- |
| actor                   | —                     | Human or bot currently authorized to issue a command for a seat                                                                                                  | `actorSeatId`               | user when the actor can be a bot                    |
| bank                    | Bank                  | Non-player counterparty that owns unowned deeds and improvement inventory, holds decks, receives payments, and pays bank obligations                           | `bank`                      | banker role                                         |
| bankruptcy              | Bankruptcy            | Terminal state for a seat that cannot satisfy an obligation through any legal liquidation sequence                                                               | `BankruptcyDeclared`        | insolvency as a second product term                 |
| deed                    | Property              | One ownable asset tied to a purchasable board space                                                                                                              | `deedId`                    | invented world-specific label                      |
| Detention               | Detention             | Constrained player state and corresponding board location                                                                                                        | `detention`                 | source-specific names                               |
| Detention-release card  | Detention release card| Held card that releases a player from Detention                                                                                                                  | `detentionReleaseCardId`    | copied release-card names                           |
| district                | Color Set             | Complete set of related district deeds that permits improvements                                                                                                 | `districtId`                | block when referring to one Property                |
| game-seat command token | —                     | Secret, device-held capability that authorizes commands for one seat in one game                                                                                 | `seatCapability`            | global guest identity/token                         |
| host capability         | Host controls         | Secret authority for lobby and recovery controls, separate from invite and seat capabilities                                                                     | `hostCapability`            | host flag supplied by client                        |
| improvement             | House or Hotel        | Bank-owned upgrade attached to a district deed: four House levels followed by one Hotel level                                                                   | `improvementLevel`          | landmark as a separate asset                        |
| landmark                | Hotel                 | Retained canonical wire concept for the final improvement level; mechanically it is the Hotel level, not a separate deed                                         | `landmarkLevel`             | a fifth House                                       |
| legal action            | —                     | Command currently executable by an authorized actor                                                                                                              | `legalActions`              | disabled option                                     |
| action availability     | —                     | Safe UI description of relevant allowed or blocked actions and reasons                                                                                           | `actionAvailability`        | source of authorization                             |
| auction                 | Auction               | Ordered process that awards an unowned deed or scarce improvement to the highest valid bidder                                                                    | `AuctionOpened` / `AuctionClosed` | sale or purchase timer                         |
| invite                  | Invite link           | High-entropy admission capability that can claim an open seat but cannot control an occupied one                                                                 | `inviteId`                  | room ID as admission secret                         |
| obligation              | Debt                  | Required payment with creditor, amount, reason, and serialized continuation                                                                                      | `obligation`                | informal debt without state                         |
| mortgage                | Mortgage              | State in which a deed is pledged to the bank, earns no rent, and can later be redeemed under the data-defined charge                           | `mortgaged`                 | loan or collateral in player copy                  |
| rent                    | Rent                  | Data-defined payment obligation created when a player lands on an eligible deed owned by another player                                                         | `RentPaid`                  | fee when the creditor is a player                   |
| redeem mortgage         | Redeem Mortgage       | Pay the bank-defined amount to remove a deed's mortgage                                                                                                          | `RedeemMortgage`            | unmortgage                                          |
| Rest                    | Rest                  | Neutral canonical space with no effect unless a variant changes it                                                                                               | `rest`                      | jackpot as a standard-rule effect                  |
| safe command boundary   | —                     | Point after the previous authoritative command transaction commits and before another begins; an unresolved phase may remain, but no effect is partially applied | `aggregateVersion` boundary | turn boundary when a narrower condition is intended |
| seat                    | Seat                  | One of 2–6 game positions, occupied by a human or bot                                                                                                            | `seatId`                    | account/profile                                     |
| Start                   | Start                 | Route origin whose crossing can grant a content-defined payment                                                                                                  | `start`                     | source-derived slogans                              |
| transit                 | Transit Property      | Non-district deed with rent based on the owner's transit-deed count                                                                                              | `transit`                   | source-specific vehicle category                    |
| utility                 | Utility               | Non-district deed with content-defined dice-based rent                                                                                                           | `utility`                   | copied utility names                                |
| trade                   | Trade                 | Atomic two-party exchange of present cash, whole deeds, and held Detention-release cards, with no future promises                                                  | `TradeProposed` / `TradeAccepted` | debt promise or future consideration            |

## Naming rules

- Domain commands and events use PascalCase, such as `AcquireDeed`, `RedeemMortgage`, and `RulesConfigured`.
- Transport event names use lower-case dot notation, such as `game.command` and `game.events`.
- Display names are presentation values, not identities or accounts.
- Direct references to third-party titles remain restricted to legal research and are never canonical vocabulary.
- Never place a display name in a command, event, wire field, database column, content-bundle ID, analytics property, or test fixture.
- Translate at the presentation boundary. A component renders `district` as “Color Set”; it does not receive “Color Set” from the server.
- Canonical terms remain stable when Blockparty changes its copy, art, or public positioning.

Related specifications: [PRD](prd.md), [Rules](rules.md), [Game content](game-content.md), and [IP safety](../legal/ip-safety.md).
