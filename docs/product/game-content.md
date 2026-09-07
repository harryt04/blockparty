# Blockparty classic content specification

**Content schema:** `1.0.0`
**Status:** complete numerical draft; names and prose require product-owner approval
**Authority:** this document is the content contract for CO-003. The engine and
bundle implementation must consume stable IDs and integer minor-unit values;
the display names and copy below are presentation data at the boundary.

This bundle uses the accepted classic scale while authoring an original magical
city. It does not copy a board name, card title, card wording, illustration,
token, or interface asset. Public release remains subject to the provenance and
attorney gates in [IP safety](../legal/ip-safety.md).

<a id="versioned-content-bundle"></a>

## Bundle identity and counts

| Field | Value |
| --- | --- |
| `contentVersion` | `1.0.0` |
| `rulesSchemaVersion` | `1.1.0` |
| `variantSchemaVersion` | `1.0.0` |
| route | 40 ordered spaces, indices `0`–`39`, forward wrap at `39 → 0` |
| ownable deeds | 28 total: 22 district deeds, 4 portal-line deeds, 2 utility deeds |
| districts | 8 groups: sizes `2, 3, 3, 3, 3, 3, 3, 2` |
| draw spaces | 6 total: 3 for `deck-moonletters`, 3 for `deck-echoes` |
| fee spaces | 2 |
| corner anchors | `s00`, `s10`, `s20`, `s30` |
| currency | crown; all amounts below are integer minor units, `100` minor units = `1` crown |

The four corner anchors are Moonquill Market (Start), Starhold Academy
(Detention / Just Visiting), Giltglass Exchange (Rest), and Blackglass Keep
(Send to Detention). They are board locations, not deeds.

## Board route

`type` and all IDs are canonical wire data. `display name` is the player-facing
label. A deed row points to exactly one deed in the deed table below. A draw row
draws only from its named deck. A fee row applies its listed bank effect.

| Index | Space ID | Type | Display name | Group/deck | Deed ID | Landing effect |
| ---: | --- | --- | --- | --- | --- | --- |
| 0 | `s00` | `start` | Moonquill Market | — | — | Passing collects `20000` from the bank once per forward crossing; exact landing adds no second payment |
| 1 | `s01` | `deed` | Brasswick Lane | `district-ash` | `deed-brasswick-lane` | Offer acquisition; otherwise run the mandatory auction |
| 2 | `s02` | `eventDraw` | Moonletter Post | `deck-moonletters` | — | Draw the next Moonletter and resolve its ordered effects |
| 3 | `s03` | `deed` | Whisperwell Walk | `district-ash` | `deed-whisperwell-walk` | Offer acquisition; otherwise run the mandatory auction |
| 4 | `s04` | `fee` | Civic Levy | — | — | Pay `20000` to the bank; variant data may make this fee jackpot-eligible |
| 5 | `s05` | `deed` | Skybridge Line | `portal-line` | `deed-skybridge-line` | Offer acquisition; rent uses owned portal-line count |
| 6 | `s06` | `deed` | Moonfen Row | `district-moonfen` | `deed-moonfen-row` | Offer acquisition; otherwise run the mandatory auction |
| 7 | `s07` | `eventDraw` | Echoes Passage | `deck-echoes` | — | Draw the next Echo and resolve its ordered effects |
| 8 | `s08` | `deed` | Sableglass Street | `district-moonfen` | `deed-sableglass-street` | Offer acquisition; otherwise run the mandatory auction |
| 9 | `s09` | `deed` | Cloudmere Court | `district-moonfen` | `deed-cloudmere-court` | Offer acquisition; otherwise run the mandatory auction |
| 10 | `s10` | `detention` | Starhold Academy | — | — | Detained players use the Detention rules; visitors have no effect |
| 11 | `s11` | `deed` | Rosecoil Road | `district-rosecoil` | `deed-rosecoil-road` | Offer acquisition; otherwise run the mandatory auction |
| 12 | `s12` | `deed` | Weather Loom | `utility` | `deed-weather-loom` | Offer acquisition; rent uses the recorded movement roll and utility count |
| 13 | `s13` | `deed` | Bellspire Avenue | `district-rosecoil` | `deed-bellspire-avenue` | Offer acquisition; otherwise run the mandatory auction |
| 14 | `s14` | `deed` | Cinderbloom Way | `district-rosecoil` | `deed-cinderbloom-way` | Offer acquisition; otherwise run the mandatory auction |
| 15 | `s15` | `deed` | Moonrail Line | `portal-line` | `deed-moonrail-line` | Offer acquisition; rent uses owned portal-line count |
| 16 | `s16` | `deed` | Copperwake Road | `district-copperwake` | `deed-copperwake-road` | Offer acquisition; otherwise run the mandatory auction |
| 17 | `s17` | `eventDraw` | Moonletter Post | `deck-moonletters` | — | Draw the next Moonletter and resolve its ordered effects |
| 18 | `s18` | `deed` | Rainvault Road | `district-copperwake` | `deed-rainvault-road` | Offer acquisition; otherwise run the mandatory auction |
| 19 | `s19` | `deed` | Starling Row | `district-copperwake` | `deed-starling-row` | Offer acquisition; otherwise run the mandatory auction |
| 20 | `s20` | `rest` | Giltglass Exchange | — | — | No canonical effect |
| 21 | `s21` | `deed` | Frostbell Terrace | `district-starling` | `deed-frostbell-terrace` | Offer acquisition; otherwise run the mandatory auction |
| 22 | `s22` | `eventDraw` | Echoes Passage | `deck-echoes` | — | Draw the next Echo and resolve its ordered effects |
| 23 | `s23` | `deed` | Candlecross | `district-starling` | `deed-candlecross` | Offer acquisition; otherwise run the mandatory auction |
| 24 | `s24` | `deed` | Thornlight Quay | `district-starling` | `deed-thornlight-quay` | Offer acquisition; otherwise run the mandatory auction |
| 25 | `s25` | `deed` | Mirrortram Line | `portal-line` | `deed-mirrortram-line` | Offer acquisition; rent uses owned portal-line count |
| 26 | `s26` | `deed` | Orrery Lane | `district-thornlight` | `deed-orrery-lane` | Offer acquisition; otherwise run the mandatory auction |
| 27 | `s27` | `deed` | Highglass Street | `district-thornlight` | `deed-highglass-street` | Offer acquisition; otherwise run the mandatory auction |
| 28 | `s28` | `deed` | Tide Engine | `utility` | `deed-tide-engine` | Offer acquisition; rent uses the recorded movement roll and utility count |
| 29 | `s29` | `deed` | Glimmercourt | `district-thornlight` | `deed-glimmercourt` | Offer acquisition; otherwise run the mandatory auction |
| 30 | `s30` | `sendToDetention` | Blackglass Keep | — | — | Send the player to `s10`; do not collect Start payment |
| 31 | `s31` | `deed` | Nightjar Boulevard | `district-nightjar` | `deed-nightjar-boulevard` | Offer acquisition; otherwise run the mandatory auction |
| 32 | `s32` | `deed` | Lanternmere Rise | `district-nightjar` | `deed-lanternmere-rise` | Offer acquisition; otherwise run the mandatory auction |
| 33 | `s33` | `eventDraw` | Moonletter Post | `deck-moonletters` | — | Draw the next Moonletter and resolve its ordered effects |
| 34 | `s34` | `deed` | Astral Court | `district-nightjar` | `deed-astral-court` | Offer acquisition; otherwise run the mandatory auction |
| 35 | `s35` | `deed` | Gilded Ferry Line | `portal-line` | `deed-gilded-ferry-line` | Offer acquisition; rent uses owned portal-line count |
| 36 | `s36` | `eventDraw` | Echoes Passage | `deck-echoes` | — | Draw the next Echo and resolve its ordered effects |
| 37 | `s37` | `deed` | Crown Observatory | `district-crown` | `deed-crown-observatory` | Offer acquisition; otherwise run the mandatory auction |
| 38 | `s38` | `fee` | Grand Repair Levy | — | — | Pay `10000` to the bank; variant data may make this fee jackpot-eligible |
| 39 | `s39` | `deed` | Blackstar Keep | `district-crown` | `deed-blackstar-keep` | Offer acquisition; otherwise run the mandatory auction |

The route contains exactly 40 rows, 22 district deed rows, 4 portal-line deed
rows, 2 utility deed rows, 6 draw rows, 2 fee rows, and 4 corner anchors.
The apparent repeated display labels on draw spaces are intentional: the deck
identity is carried by the canonical `deckId`, while the presentation can use a
single recognizable post/doorway treatment.

## Districts and deed values

All rent arrays are indexed `[level0, house1, house2, house3, house4, hotel]`.
Level-zero rent is the first value unless the owner has every deed in the group
and none is mortgaged, in which case it is doubled by the complete-district
rule. Mortgage is half the purchase price. Redemption costs the mortgage value
plus a 10% bank charge, rounded down to the nearest minor unit. A mortgaged
deed changing hands creates the same 10% charge as an immediate obligation for
the recipient. `build` is the cost of each one-level improvement in the group.

| Group ID | Display group | Deed ID | Space | Purchase | Mortgage | Rent schedule | Build |
| --- | --- | --- | ---: | ---: | ---: | --- | ---: |
| `district-ash` | Ashen Lanterns | `deed-brasswick-lane` | 1 | 6000 | 3000 | `200,1000,3000,9000,16000,25000` | 5000 |
| `district-ash` | Ashen Lanterns | `deed-whisperwell-walk` | 3 | 6000 | 3000 | `400,2000,6000,18000,32000,45000` | 5000 |
| `district-moonfen` | Moonfen | `deed-moonfen-row` | 6 | 10000 | 5000 | `600,3000,9000,27000,40000,55000` | 5000 |
| `district-moonfen` | Moonfen | `deed-sableglass-street` | 8 | 10000 | 5000 | `600,3000,9000,27000,40000,55000` | 5000 |
| `district-moonfen` | Moonfen | `deed-cloudmere-court` | 9 | 12000 | 6000 | `800,4000,10000,30000,45000,60000` | 5000 |
| `district-rosecoil` | Rosecoil | `deed-rosecoil-road` | 11 | 14000 | 7000 | `1000,5000,15000,45000,62500,75000` | 10000 |
| `district-rosecoil` | Rosecoil | `deed-bellspire-avenue` | 13 | 14000 | 7000 | `1000,5000,15000,45000,62500,75000` | 10000 |
| `district-rosecoil` | Rosecoil | `deed-cinderbloom-way` | 14 | 16000 | 8000 | `1200,6000,18000,50000,70000,90000` | 10000 |
| `district-copperwake` | Copperwake | `deed-copperwake-road` | 16 | 18000 | 9000 | `1400,7000,20000,55000,75000,95000` | 10000 |
| `district-copperwake` | Copperwake | `deed-rainvault-road` | 18 | 18000 | 9000 | `1400,7000,20000,55000,75000,95000` | 10000 |
| `district-copperwake` | Copperwake | `deed-starling-row` | 19 | 20000 | 10000 | `1600,8000,22000,60000,80000,100000` | 10000 |
| `district-starling` | Starling | `deed-frostbell-terrace` | 21 | 22000 | 11000 | `1800,9000,25000,70000,87500,105000` | 15000 |
| `district-starling` | Starling | `deed-candlecross` | 23 | 22000 | 11000 | `1800,9000,25000,70000,87500,105000` | 15000 |
| `district-starling` | Starling | `deed-thornlight-quay` | 24 | 24000 | 12000 | `2000,10000,30000,75000,92500,110000` | 15000 |
| `district-thornlight` | Thornlight | `deed-orrery-lane` | 26 | 26000 | 13000 | `2200,11000,33000,80000,97500,115000` | 15000 |
| `district-thornlight` | Thornlight | `deed-highglass-street` | 27 | 26000 | 13000 | `2200,11000,33000,80000,97500,115000` | 15000 |
| `district-thornlight` | Thornlight | `deed-glimmercourt` | 29 | 28000 | 14000 | `2400,12000,36000,85000,102500,120000` | 15000 |
| `district-nightjar` | Nightjar | `deed-nightjar-boulevard` | 31 | 30000 | 15000 | `2600,13000,39000,90000,110000,127500` | 20000 |
| `district-nightjar` | Nightjar | `deed-lanternmere-rise` | 32 | 30000 | 15000 | `2600,13000,39000,90000,110000,127500` | 20000 |
| `district-nightjar` | Nightjar | `deed-astral-court` | 34 | 32000 | 16000 | `2800,15000,45000,100000,120000,140000` | 20000 |
| `district-crown` | Crown | `deed-crown-observatory` | 37 | 35000 | 17500 | `3500,17500,50000,110000,130000,150000` | 20000 |
| `district-crown` | Crown | `deed-blackstar-keep` | 39 | 40000 | 20000 | `5000,20000,60000,140000,170000,200000` | 20000 |

The district groups are eight distinct groups with sizes `2, 3, 3, 3, 3, 3,
3, 2`. Each deed has four House levels and one Hotel level; no deed may be
improved unless its group is complete and unmortgaged, and building remains
even across the group.

## Portal lines and utilities

| Deed ID | Display name | Space | Purchase | Mortgage | `transitRentByCount` / `utilityMultiplierByCount` |
| --- | --- | ---: | ---: | ---: | --- |
| `deed-skybridge-line` | Skybridge Line | 5 | 20000 | 10000 | `transitRentByCount: [0,2500,5000,10000,20000]` |
| `deed-moonrail-line` | Moonrail Line | 15 | 20000 | 10000 | `transitRentByCount: [0,2500,5000,10000,20000]` |
| `deed-mirrortram-line` | Mirrortram Line | 25 | 20000 | 10000 | `transitRentByCount: [0,2500,5000,10000,20000]` |
| `deed-gilded-ferry-line` | Gilded Ferry Line | 35 | 20000 | 10000 | `transitRentByCount: [0,2500,5000,10000,20000]` |
| `deed-weather-loom` | Weather Loom | 12 | 15000 | 7500 | `utilityMultiplierByCount: [0,4,10]` |
| `deed-tide-engine` | Tide Engine | 28 | 15000 | 7500 | `utilityMultiplierByCount: [0,4,10]` |

Portal rent uses the owner's count of portal-line deeds, indexed from zero.
Utility rent is the recorded two-dice total multiplied by the owner's utility
count multiplier. A card that moves a player to a utility records and uses its
own fresh two-dice roll and declared multiplier.

## Economy and improvement inventory

| Field | Value |
| --- | ---: |
| starting cash per player | `150000` minor units (`1500` crowns) |
| Start pass payment | `20000` minor units (`200` crowns) |
| Detention release fee | `5000` minor units (`50` crowns) |
| maximum failed Detention attempts | `3`; after the third failed attempt, fee payment is required if possible |
| bank Houses at game start | `32` |
| bank Hotels at game start | `12` |
| House levels | `1`–`4`; each consumes one House |
| Hotel transition | level `4 → 5` consumes four Houses and one Hotel |
| Hotel downgrade | level `5 → 4` returns one Hotel and four Houses |
| improvement sale | half of purchase cost, rounded down, one level at a time |
| complete-district level-zero rent | `2 ×` the deed's level-zero rent while every group deed is owned and unmortgaged |
| mortgage redemption | mortgage value plus 10%, rounded down |
| fee amounts | `s04 = 20000`; `s38 = 10000` |

Improvement scarcity auctions use the finite kind-specific inventory. A Hotel
transition consumes all four Houses atomically; if any required unit is absent,
the transition is unavailable. Returned pieces are immediately available and
bankruptcy returns or transfers them according to [RULE-014](rules.md#rule-requirements).

## Decks

Both decks contain exactly 16 cards. The listed order is the stable authoring
order, not the runtime draw order: the server shuffles each deck with recorded
randomness at game start, keeps deck order private, and reshuffles only an empty
discard pile. `retain` means the card leaves circulation until used, traded, or
returned by bankruptcy.

### Moonletters (`deck-moonletters`)

| Card ID | Title | Original player-facing instruction | Effect | Retain |
| --- | --- | --- | --- | --- |
| `moon-01` | Follow the Silver Kite | Move to `s00`; collect Start payment when crossed. | `MoveTo(s00,true)` | no |
| `moon-02` | Lanterns on the Wind | Move forward 3 spaces, then resolve the destination. | `MoveBy(3)` | no |
| `moon-03` | A Shortcut Through Glass | Move to the next portal line; if owned, resolve its rent. | `Choose(nextPortalLine)` | no |
| `moon-04` | Market Day Dividend | The bank pays you `5000`. | `CollectBank(5000)` | no |
| `moon-05` | Quiet Repair Work | Pay `2500` for each House and `10000` for each Hotel you own. | `RepairCharge(2500,10000)` | no |
| `moon-06` | Academy Excuse | Keep this release card for a later Detention departure. | `GrantDetentionReleaseCard` | yes |
| `moon-07` | Courier's Misroute | Move back 3 spaces; resolve the space you reach. | `MoveBy(-3)` | no |
| `moon-08` | A Favor Returned | Collect `5000` from each other player. | `CollectEachPlayer(5000)` | no |
| `moon-09` | The Warden's Bell | Go directly to Starhold Academy. Do not collect Start payment. | `SendToDetention` | no |
| `moon-10` | Glasswork Fee | Pay the bank `1500`. | `PayBank(1500)` | no |
| `moon-11` | Observatory Route | Move to `s37`; collect Start payment when crossed. | `MoveTo(s37,true)` | no |
| `moon-12` | Shared Lantern Fund | Pay each other player `500`. | `PayEachPlayer(500)` | no |
| `moon-13` | Tide Reading | Roll a fresh utility check if the destination is a utility, then resolve it. | `Choose(utilityRoll)` | no |
| `moon-14` | Neighbourhood Charter | Collect `10000` from the bank. | `CollectBank(10000)` | no |
| `moon-15` | Keep the Peace | Pay `2000` to the bank. | `PayBank(2000)` | no |
| `moon-16` | A Door Left Open | Keep this release card for a later Detention departure. | `GrantDetentionReleaseCard` | yes |

### Echoes (`deck-echoes`)

| Card ID | Title | Original player-facing instruction | Effect | Retain |
| --- | --- | --- | --- | --- |
| `echo-01` | Bell-Tower View | Move to `s20`; resolve its landing effect. | `MoveTo(s20,false)` | no |
| `echo-02` | Night Market Receipt | The bank pays you `2000`. | `CollectBank(2000)` | no |
| `echo-03` | Borrowed Umbrella | Pay each other player `500`. | `PayEachPlayer(500)` | no |
| `echo-04` | Ward Boundary | Move to the next district deed; resolve the destination. | `Choose(nextDistrictDeed)` | no |
| `echo-05` | Keep Inspection | Go directly to Starhold Academy. Do not collect Start payment. | `SendToDetention` | no |
| `echo-06` | Four-Square Levy | Pay `4000` to the bank. | `PayBank(4000)` | no |
| `echo-07` | Moonfen Harvest | Collect `3000` from the bank. | `CollectBank(3000)` | no |
| `echo-08` | Roof Garden Repairs | Pay `2500` for each House and `10000` for each Hotel you own. | `RepairCharge(2500,10000)` | no |
| `echo-09` | A Note from Academy | Keep this release card for a later Detention departure. | `GrantDetentionReleaseCard` | yes |
| `echo-10` | Parade Turns East | Move forward 5 spaces, then resolve the destination. | `MoveBy(5)` | no |
| `echo-11` | Old Debt Settled | Collect `2500` from each other player. | `CollectEachPlayer(2500)` | no |
| `echo-12` | Rain on the Quays | Pay `2500` to the bank. | `PayBank(2500)` | no |
| `echo-13` | Blackglass Notice | Go directly to `s10`. Do not collect Start payment. | `MoveTo(s10,false)` | no |
| `echo-14` | Exchange Credit | The bank pays you `5000`. | `CollectBank(5000)` | no |
| `echo-15` | A Small Apology | Pay each other player `1000`. | `PayEachPlayer(1000)` | no |
| `echo-16` | Unlatched Gate | Keep this release card for a later Detention departure. | `GrantDetentionReleaseCard` | yes |

`Choose` entries are bounded content choices resolved by the engine; they are
not executable scripts. Card effects are applied in table order, and each
payment becomes its own obligation as required by the canonical rules.

| Choice ID | Resolution |
| --- | --- |
| `nextPortalLine` | Select the first portal-line space strictly ahead of the current position, wrapping at `s39 → s00`; resolve its landing effect |
| `utilityRoll` | Move to the first utility strictly ahead, record a fresh two-dice roll, and resolve utility rent with the card's multiplier rule |
| `nextDistrictDeed` | Select the first district deed strictly ahead, wrapping at `s39 → s00`; resolve its landing effect |

## Player pieces

The six pieces are selectable at entry, one per occupied seat. Each has a
stable ID, a distinct silhouette/color/pattern pair, and an accessible spoken
name. Color and pattern are redundant cues and may not be used independently
to identify a player.

| Piece ID | Display name | Silhouette | Color role | Pattern |
| --- | --- | --- | --- | --- |
| `piece-lantern` | Lantern | hanging lantern | Azure | solid ring |
| `piece-key` | Key | long key | Oxide | diagonal hatch |
| `piece-crescent` | Crescent | crescent moon | Violet | dotted field |
| `piece-tower` | Tower | narrow observatory tower | Iron | cross-hatch |
| `piece-fox` | Fox | seated fox | Sky | vertical rule |
| `piece-teapot` | Teapot | round teapot | Plum | double stripe |

Piece art, color values, and pattern geometry require their own provenance
records under `CONTENT-008`; this table defines the contract, not final art.

## Provenance and release gates

The content author records creator, date, source brief, license, AI-tool record
when applicable, similarity review, numerical review, and product-owner review
for the route, deed values, deck copy, and piece assets. The code/content
license split is recorded by CO-004. This draft is numerically complete and
internally referential; names, card prose, silhouettes, and public distribution
remain blocked until the product owner and attorney gates approve them.

The implementation must validate exactly 40 route rows, 28 deeds, 8 districts,
6 draw spaces, 2 fees, 32 Houses, 12 Hotels, 32 cards, and 6 pieces before the
`1.0.0` bundle can be registered. The canonical hash is generated from the
validated wire data and is not hand-entered in this specification.
