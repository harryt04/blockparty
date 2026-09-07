/**
 * Blockparty classic 1.0.0 content.
 *
 * This is the authored magical-city bundle described by CONTENT-012–016. It
 * is registered for reads, but the deployment default remains the placeholder
 * until the classic engine and UI queue is complete.
 */
import type {
  BoardSpace,
  Card,
  ContentBundle,
  Deck,
  Deed,
  District,
  ImprovementLevel,
} from "../types";
import { canonicalHashBundle } from "../canonical";

const route = [
  ["s00", "start", "Moonquill Market"],
  ["s01", "deed", "Brasswick Lane", "deed-brasswick-lane", "district-ash"],
  ["s02", "eventDraw", "Moonletter Post", undefined, "deck-moonletters"],
  ["s03", "deed", "Whisperwell Walk", "deed-whisperwell-walk", "district-ash"],
  ["s04", "fee", "Civic Levy"],
  ["s05", "deed", "Skybridge Line", "deed-skybridge-line", "portal-line"],
  ["s06", "deed", "Moonfen Row", "deed-moonfen-row", "district-moonfen"],
  ["s07", "eventDraw", "Echoes Passage", undefined, "deck-echoes"],
  ["s08", "deed", "Sableglass Street", "deed-sableglass-street", "district-moonfen"],
  ["s09", "deed", "Cloudmere Court", "deed-cloudmere-court", "district-moonfen"],
  ["s10", "detention", "Starhold Academy"],
  ["s11", "deed", "Rosecoil Road", "deed-rosecoil-road", "district-rosecoil"],
  ["s12", "deed", "Weather Loom", "deed-weather-loom", "utility"],
  ["s13", "deed", "Bellspire Avenue", "deed-bellspire-avenue", "district-rosecoil"],
  ["s14", "deed", "Cinderbloom Way", "deed-cinderbloom-way", "district-rosecoil"],
  ["s15", "deed", "Moonrail Line", "deed-moonrail-line", "portal-line"],
  ["s16", "deed", "Copperwake Road", "deed-copperwake-road", "district-copperwake"],
  ["s17", "eventDraw", "Moonletter Post", undefined, "deck-moonletters"],
  ["s18", "deed", "Rainvault Road", "deed-rainvault-road", "district-copperwake"],
  ["s19", "deed", "Starling Row", "deed-starling-row", "district-copperwake"],
  ["s20", "rest", "Giltglass Exchange"],
  ["s21", "deed", "Frostbell Terrace", "deed-frostbell-terrace", "district-starling"],
  ["s22", "eventDraw", "Echoes Passage", undefined, "deck-echoes"],
  ["s23", "deed", "Candlecross", "deed-candlecross", "district-starling"],
  ["s24", "deed", "Thornlight Quay", "deed-thornlight-quay", "district-starling"],
  ["s25", "deed", "Mirrortram Line", "deed-mirrortram-line", "portal-line"],
  ["s26", "deed", "Orrery Lane", "deed-orrery-lane", "district-thornlight"],
  ["s27", "deed", "Highglass Street", "deed-highglass-street", "district-thornlight"],
  ["s28", "deed", "Tide Engine", "deed-tide-engine", "utility"],
  ["s29", "deed", "Glimmercourt", "deed-glimmercourt", "district-thornlight"],
  ["s30", "sendToDetention", "Blackglass Keep"],
  ["s31", "deed", "Nightjar Boulevard", "deed-nightjar-boulevard", "district-nightjar"],
  ["s32", "deed", "Lanternmere Rise", "deed-lanternmere-rise", "district-nightjar"],
  ["s33", "eventDraw", "Moonletter Post", undefined, "deck-moonletters"],
  ["s34", "deed", "Astral Court", "deed-astral-court", "district-nightjar"],
  ["s35", "deed", "Gilded Ferry Line", "deed-gilded-ferry-line", "portal-line"],
  ["s36", "eventDraw", "Echoes Passage", undefined, "deck-echoes"],
  ["s37", "deed", "Crown Observatory", "deed-crown-observatory", "district-crown"],
  ["s38", "fee", "Grand Repair Levy"],
  ["s39", "deed", "Blackstar Keep", "deed-blackstar-keep", "district-crown"],
] as const;

type RouteRow = (typeof route)[number];

function layout(routeIndex: number): { readonly x: number; readonly y: number } {
  if (routeIndex <= 10) return { x: routeIndex, y: 0 };
  if (routeIndex <= 20) return { x: 10, y: routeIndex - 10 };
  if (routeIndex <= 30) return { x: 30 - routeIndex, y: 10 };
  return { x: 0, y: 40 - routeIndex };
}

function spaceEffects(row: RouteRow): BoardSpace["effects"] {
  const [spaceId, type, _name, _deedId, group] = row;
  if (type === "eventDraw")
    return [{ type: "Draw", deckId: group as "deck-moonletters" | "deck-echoes" }];
  if (spaceId === "s04") return [{ type: "PayBank", amount: 20_000, jackpotEligible: true }];
  if (spaceId === "s38") return [{ type: "PayBank", amount: 10_000, jackpotEligible: true }];
  if (type === "sendToDetention") return [{ type: "SendToDetention" }];
  return [];
}

const spaces: readonly BoardSpace[] = route.map((row, routeIndex) => {
  const [spaceId, type, name, deedId] = row;
  return {
    spaceId,
    routeIndex,
    name,
    type,
    ...(deedId === undefined ? {} : { deedId }),
    effects: spaceEffects(row),
    next: route[(routeIndex + 1) % route.length]![0],
    layout: layout(routeIndex),
  } as BoardSpace;
});

const districtRent = (rents: readonly number[]): readonly ImprovementLevel[] => [
  { level: 1, rent: rents[1]!, inventoryDeltas: { house: 1 } },
  { level: 2, rent: rents[2]!, inventoryDeltas: { house: 1 } },
  { level: 3, rent: rents[3]!, inventoryDeltas: { house: 1 } },
  { level: 4, rent: rents[4]!, inventoryDeltas: { house: 1 } },
  { level: 5, rent: rents[5]!, inventoryDeltas: { house: -4, hotel: 1 } },
];

type DistrictDeedSpec = readonly [
  string,
  string,
  string,
  number,
  readonly [number, number, number, number, number, number],
  number,
];

const districtSpecs: readonly DistrictDeedSpec[] = [
  [
    "deed-brasswick-lane",
    "Brasswick Lane",
    "district-ash",
    6_000,
    [200, 1_000, 3_000, 9_000, 16_000, 25_000],
    5_000,
  ],
  [
    "deed-whisperwell-walk",
    "Whisperwell Walk",
    "district-ash",
    6_000,
    [400, 2_000, 6_000, 18_000, 32_000, 45_000],
    5_000,
  ],
  [
    "deed-moonfen-row",
    "Moonfen Row",
    "district-moonfen",
    10_000,
    [600, 3_000, 9_000, 27_000, 40_000, 55_000],
    5_000,
  ],
  [
    "deed-sableglass-street",
    "Sableglass Street",
    "district-moonfen",
    10_000,
    [600, 3_000, 9_000, 27_000, 40_000, 55_000],
    5_000,
  ],
  [
    "deed-cloudmere-court",
    "Cloudmere Court",
    "district-moonfen",
    12_000,
    [800, 4_000, 10_000, 30_000, 45_000, 60_000],
    5_000,
  ],
  [
    "deed-rosecoil-road",
    "Rosecoil Road",
    "district-rosecoil",
    14_000,
    [1_000, 5_000, 15_000, 45_000, 62_500, 75_000],
    10_000,
  ],
  [
    "deed-bellspire-avenue",
    "Bellspire Avenue",
    "district-rosecoil",
    14_000,
    [1_000, 5_000, 15_000, 45_000, 62_500, 75_000],
    10_000,
  ],
  [
    "deed-cinderbloom-way",
    "Cinderbloom Way",
    "district-rosecoil",
    16_000,
    [1_200, 6_000, 18_000, 50_000, 70_000, 90_000],
    10_000,
  ],
  [
    "deed-copperwake-road",
    "Copperwake Road",
    "district-copperwake",
    18_000,
    [1_400, 7_000, 20_000, 55_000, 75_000, 95_000],
    10_000,
  ],
  [
    "deed-rainvault-road",
    "Rainvault Road",
    "district-copperwake",
    18_000,
    [1_400, 7_000, 20_000, 55_000, 75_000, 95_000],
    10_000,
  ],
  [
    "deed-starling-row",
    "Starling Row",
    "district-copperwake",
    20_000,
    [1_600, 8_000, 22_000, 60_000, 80_000, 100_000],
    10_000,
  ],
  [
    "deed-frostbell-terrace",
    "Frostbell Terrace",
    "district-starling",
    22_000,
    [1_800, 9_000, 25_000, 70_000, 87_500, 105_000],
    15_000,
  ],
  [
    "deed-candlecross",
    "Candlecross",
    "district-starling",
    22_000,
    [1_800, 9_000, 25_000, 70_000, 87_500, 105_000],
    15_000,
  ],
  [
    "deed-thornlight-quay",
    "Thornlight Quay",
    "district-starling",
    24_000,
    [2_000, 10_000, 30_000, 75_000, 92_500, 110_000],
    15_000,
  ],
  [
    "deed-orrery-lane",
    "Orrery Lane",
    "district-thornlight",
    26_000,
    [2_200, 11_000, 33_000, 80_000, 97_500, 115_000],
    15_000,
  ],
  [
    "deed-highglass-street",
    "Highglass Street",
    "district-thornlight",
    26_000,
    [2_200, 11_000, 33_000, 80_000, 97_500, 115_000],
    15_000,
  ],
  [
    "deed-glimmercourt",
    "Glimmercourt",
    "district-thornlight",
    28_000,
    [2_400, 12_000, 36_000, 85_000, 102_500, 120_000],
    15_000,
  ],
  [
    "deed-nightjar-boulevard",
    "Nightjar Boulevard",
    "district-nightjar",
    30_000,
    [2_600, 13_000, 39_000, 90_000, 110_000, 127_500],
    20_000,
  ],
  [
    "deed-lanternmere-rise",
    "Lanternmere Rise",
    "district-nightjar",
    30_000,
    [2_600, 13_000, 39_000, 90_000, 110_000, 127_500],
    20_000,
  ],
  [
    "deed-astral-court",
    "Astral Court",
    "district-nightjar",
    32_000,
    [2_800, 15_000, 45_000, 100_000, 120_000, 140_000],
    20_000,
  ],
  [
    "deed-crown-observatory",
    "Crown Observatory",
    "district-crown",
    35_000,
    [3_500, 17_500, 50_000, 110_000, 130_000, 150_000],
    20_000,
  ],
  [
    "deed-blackstar-keep",
    "Blackstar Keep",
    "district-crown",
    40_000,
    [5_000, 20_000, 60_000, 140_000, 170_000, 200_000],
    20_000,
  ],
];

const spaceIdForDeed = (deedId: string): string =>
  spaces.find((space) => space.deedId === deedId)!.spaceId;
const chargesFor = (price: number) => ({
  mortgageValue: price / 2,
  transferCharge: Math.floor(price / 2 / 10),
  redemptionCharge: Math.floor((price / 2) * 1.1),
});

const districtDeeds: readonly Deed[] = districtSpecs.map(
  ([deedId, name, districtId, price, rents, improvementCost]) => ({
    deedId,
    spaceId: spaceIdForDeed(deedId),
    name,
    category: "district",
    districtId,
    price,
    ...chargesFor(price),
    baseRent: rents[0]!,
    completeDistrictMultiplier: 2,
    improvementCost,
    improvementLevels: districtRent(rents),
  }),
);

const transitSpecs: readonly (readonly [string, string, string])[] = [
  ["deed-skybridge-line", "Skybridge Line", "s05"],
  ["deed-moonrail-line", "Moonrail Line", "s15"],
  ["deed-mirrortram-line", "Mirrortram Line", "s25"],
  ["deed-gilded-ferry-line", "Gilded Ferry Line", "s35"],
];

const transitDeeds: readonly Deed[] = transitSpecs.map(([deedId, name, spaceId]) => ({
  deedId,
  spaceId,
  name,
  category: "transit" as const,
  price: 20_000,
  ...chargesFor(20_000),
  baseRent: 0,
  transitRentByCount: [0, 2_500, 5_000, 10_000, 20_000],
}));

const utilitySpecs: readonly (readonly [string, string, string])[] = [
  ["deed-weather-loom", "Weather Loom", "s12"],
  ["deed-tide-engine", "Tide Engine", "s28"],
];

const utilityDeeds: readonly Deed[] = utilitySpecs.map(([deedId, name, spaceId]) => ({
  deedId,
  spaceId,
  name,
  category: "utility" as const,
  price: 15_000,
  ...chargesFor(15_000),
  baseRent: 0,
  utilityMultiplierByCount: [0, 4, 10],
}));

const deeds: readonly Deed[] = [...districtDeeds, ...transitDeeds, ...utilityDeeds];

const districtNames: Readonly<Record<string, string>> = {
  "district-ash": "Ashen Lanterns",
  "district-moonfen": "Moonfen",
  "district-rosecoil": "Rosecoil",
  "district-copperwake": "Copperwake",
  "district-starling": "Starling",
  "district-thornlight": "Thornlight",
  "district-nightjar": "Nightjar",
  "district-crown": "Crown",
};

const districts: readonly District[] = Object.keys(districtNames).map((districtId) => ({
  districtId,
  name: districtNames[districtId]!,
  deedIds: districtDeeds
    .filter((deed) => deed.districtId === districtId)
    .map((deed) => deed.deedId),
}));

const card = (
  cardId: string,
  title: string,
  text: string,
  effects: Card["effects"],
  retainable = false,
): Card => ({
  cardId,
  title,
  text,
  effects,
  retainable,
});

const decks: readonly Deck[] = [
  {
    deckId: "deck-moonletters",
    name: "Moonletters",
    cards: [
      card(
        "moon-01",
        "Follow the Silver Kite",
        "Move to Moonquill Market; collect Start payment when crossed.",
        [{ type: "MoveTo", spaceId: "s00", collectStartWhenCrossed: true }],
      ),
      card(
        "moon-02",
        "Lanterns on the Wind",
        "Move forward 3 spaces, then resolve the destination.",
        [{ type: "MoveBy", spaces: 3 }],
      ),
      card(
        "moon-03",
        "A Shortcut Through Glass",
        "Move to the next portal line; if owned, resolve its rent.",
        [{ type: "Choose", choiceId: "nextPortalLine" }],
      ),
      card("moon-04", "Market Day Dividend", "The bank pays you 5000.", [
        { type: "CollectBank", amount: 5_000 },
      ]),
      card(
        "moon-05",
        "Quiet Repair Work",
        "Pay 2500 for each House and 10000 for each Hotel you own.",
        [{ type: "RepairCharge", perImprovement: 2_500, perLandmark: 10_000 }],
      ),
      card(
        "moon-06",
        "Academy Excuse",
        "Keep this release card for a later Detention departure.",
        [{ type: "GrantDetentionReleaseCard" }],
        true,
      ),
      card("moon-07", "Courier's Misroute", "Move back 3 spaces; resolve the space you reach.", [
        { type: "MoveBy", spaces: -3 },
      ]),
      card("moon-08", "A Favor Returned", "Collect 5000 from each other player.", [
        { type: "CollectEachPlayer", amount: 5_000 },
      ]),
      card(
        "moon-09",
        "The Warden's Bell",
        "Go directly to Starhold Academy. Do not collect Start payment.",
        [{ type: "SendToDetention" }],
      ),
      card("moon-10", "Glasswork Fee", "Pay the bank 1500.", [{ type: "PayBank", amount: 1_500 }]),
      card(
        "moon-11",
        "Observatory Route",
        "Move to Crown Observatory; collect Start payment when crossed.",
        [{ type: "MoveTo", spaceId: "s37", collectStartWhenCrossed: true }],
      ),
      card("moon-12", "Shared Lantern Fund", "Pay each other player 500.", [
        { type: "PayEachPlayer", amount: 500 },
      ]),
      card(
        "moon-13",
        "Tide Reading",
        "Move to the first utility and resolve its fresh utility roll.",
        [{ type: "Choose", choiceId: "utilityRoll" }],
      ),
      card("moon-14", "Neighbourhood Charter", "Collect 10000 from the bank.", [
        { type: "CollectBank", amount: 10_000 },
      ]),
      card("moon-15", "Keep the Peace", "Pay 2000 to the bank.", [
        { type: "PayBank", amount: 2_000 },
      ]),
      card(
        "moon-16",
        "A Door Left Open",
        "Keep this release card for a later Detention departure.",
        [{ type: "GrantDetentionReleaseCard" }],
        true,
      ),
    ],
  },
  {
    deckId: "deck-echoes",
    name: "Echoes",
    cards: [
      card(
        "echo-01",
        "Bell-Tower View",
        "Move to Giltglass Exchange; resolve its landing effect.",
        [{ type: "MoveTo", spaceId: "s20", collectStartWhenCrossed: false }],
      ),
      card("echo-02", "Night Market Receipt", "The bank pays you 2000.", [
        { type: "CollectBank", amount: 2_000 },
      ]),
      card("echo-03", "Borrowed Umbrella", "Pay each other player 500.", [
        { type: "PayEachPlayer", amount: 500 },
      ]),
      card("echo-04", "Ward Boundary", "Move to the next district deed; resolve the destination.", [
        { type: "Choose", choiceId: "nextDistrictDeed" },
      ]),
      card(
        "echo-05",
        "Keep Inspection",
        "Go directly to Starhold Academy. Do not collect Start payment.",
        [{ type: "SendToDetention" }],
      ),
      card("echo-06", "Four-Square Levy", "Pay 4000 to the bank.", [
        { type: "PayBank", amount: 4_000 },
      ]),
      card("echo-07", "Moonfen Harvest", "Collect 3000 from the bank.", [
        { type: "CollectBank", amount: 3_000 },
      ]),
      card(
        "echo-08",
        "Roof Garden Repairs",
        "Pay 2500 for each House and 10000 for each Hotel you own.",
        [{ type: "RepairCharge", perImprovement: 2_500, perLandmark: 10_000 }],
      ),
      card(
        "echo-09",
        "A Note from Academy",
        "Keep this release card for a later Detention departure.",
        [{ type: "GrantDetentionReleaseCard" }],
        true,
      ),
      card("echo-10", "Parade Turns East", "Move forward 5 spaces, then resolve the destination.", [
        { type: "MoveBy", spaces: 5 },
      ]),
      card("echo-11", "Old Debt Settled", "Collect 2500 from each other player.", [
        { type: "CollectEachPlayer", amount: 2_500 },
      ]),
      card("echo-12", "Rain on the Quays", "Pay 2500 to the bank.", [
        { type: "PayBank", amount: 2_500 },
      ]),
      card(
        "echo-13",
        "Blackglass Notice",
        "Go directly to Starhold Academy. Do not collect Start payment.",
        [{ type: "SendToDetention" }],
      ),
      card("echo-14", "Exchange Credit", "The bank pays you 5000.", [
        { type: "CollectBank", amount: 5_000 },
      ]),
      card("echo-15", "A Small Apology", "Pay each other player 1000.", [
        { type: "PayEachPlayer", amount: 1_000 },
      ]),
      card(
        "echo-16",
        "Unlatched Gate",
        "Keep this release card for a later Detention departure.",
        [{ type: "GrantDetentionReleaseCard" }],
        true,
      ),
    ],
  },
];

const bundleWithoutHash: Omit<ContentBundle, "hash"> = {
  contentVersion: "1.0.0",
  rulesSchemaVersion: "1.1.0",
  variantSchemaVersion: "1.0.0",
  created: "2026-09-07",
  provenance: {
    status: "AUTHORED",
    creator: "Blockparty project contributors",
    created: "2026-09-07",
    sourceInputs: ["docs/product/game-content.md", "docs/legal/ip-safety.md"],
    license: "CC BY-SA 4.0",
    similarityDisposition:
      "Original magical-city names, values, copy, and presentation; no third-party game assets consulted.",
  },
  startSpaceId: "s00",
  detentionSpaceId: "s10",
  spaces,
  deeds,
  districts,
  decks,
  economy: {
    currencyLabel: "crowns",
    startingCash: 150_000,
    startPayment: 20_000,
    detentionReleaseFee: 5_000,
    detentionMaxAttempts: 3,
    improvementInventory: { house: 32, hotel: 12 },
    improvementResaleRatio: { numerator: 1, denominator: 2 },
    startingAssetDealCount: 1,
    startingAssetEligibleDeedIds: deeds.map((deed) => deed.deedId),
  },
  jackpotEligibleSpaceIds: ["s04", "s38"],
};

export const CLASSIC_BUNDLE: ContentBundle = {
  ...bundleWithoutHash,
  hash: canonicalHashBundle({ ...bundleWithoutHash, hash: "" }),
};
