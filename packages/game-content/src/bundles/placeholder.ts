/**
 * SCAFFOLDING CONTENT. NOT FOR RELEASE.
 *
 * This bundle exists so the app boots, the board renders, and the projection
 * shapes are exercisable. It is NOT the authored MVP content:
 *
 *   - The values are unbalanced and carry no simulation evidence (CONTENT-010).
 *   - The provenance record is a placeholder (CONTENT-008).
 *   - The canonical hash is valid, but this bundle is still scaffolding and
 *     is not an authored release bundle (CONTENT-001, CONTENT-008).
 *
 * `validateBundle` refuses this bundle in production for exactly that reason.
 * Authoring the first real bundle is its own ticket; do not grow this file.
 *
 * Topology guardrail (DS-001, AGENTS.md): the route is a winding, irregular
 * neighborhood street with uneven segment lengths and inward turns. It is not
 * a square grid and not a familiar perimeter board. Keep it that way.
 *
 * Money is integer minor units throughout: 100 units = 1 credit.
 */
import type { BoardSpace, ContentBundle, Deck, Deed, District } from "../types";

const spaces: readonly BoardSpace[] = [
  {
    spaceId: "s00",
    routeIndex: 0,
    name: "Sunup Corner",
    type: "start",
    effects: [],
    next: "s01",
    layout: { x: 2, y: 0 },
  },
  {
    spaceId: "s01",
    routeIndex: 1,
    name: "Sawhorse Lane",
    type: "deed",
    deedId: "d-sawhorse-lane",
    effects: [],
    next: "s02",
    layout: { x: 5, y: 0 },
  },
  {
    spaceId: "s02",
    routeIndex: 2,
    name: "Chalk Arrow Walk",
    type: "deed",
    deedId: "d-chalk-arrow-walk",
    effects: [],
    next: "s03",
    layout: { x: 7, y: 1 },
  },
  {
    spaceId: "s03",
    routeIndex: 3,
    name: "Taped Flyer Post",
    type: "eventDraw",
    effects: [{ type: "Draw", deckId: "deck-flyers" }],
    next: "s04",
    layout: { x: 8, y: 4 },
  },
  {
    spaceId: "s04",
    routeIndex: 4,
    name: "Food Truck Row",
    type: "deed",
    deedId: "d-food-truck-row",
    effects: [],
    next: "s05",
    layout: { x: 7, y: 6 },
  },
  {
    spaceId: "s05",
    routeIndex: 5,
    name: "String Light Bend",
    type: "deed",
    deedId: "d-string-light-bend",
    effects: [],
    next: "s06",
    layout: { x: 8, y: 8 },
  },
  {
    spaceId: "s06",
    routeIndex: 6,
    name: "The Quiet Kerb",
    type: "detention",
    effects: [],
    next: "s07",
    layout: { x: 6, y: 10 },
  },
  {
    spaceId: "s07",
    routeIndex: 7,
    name: "Boombox Steps",
    type: "deed",
    deedId: "d-boombox-steps",
    effects: [],
    next: "s08",
    layout: { x: 3, y: 10 },
  },
  {
    spaceId: "s08",
    routeIndex: 8,
    name: "Permit Window",
    type: "fee",
    effects: [{ type: "PayBank", amount: 7500, jackpotEligible: true }],
    next: "s09",
    layout: { x: 1, y: 8 },
  },
  {
    spaceId: "s09",
    routeIndex: 9,
    name: "Hydrant Hookup",
    type: "deed",
    deedId: "d-hydrant-hookup",
    effects: [],
    next: "s10",
    layout: { x: 0, y: 6 },
  },
  {
    spaceId: "s10",
    routeIndex: 10,
    name: "Folding Table Close",
    type: "deed",
    deedId: "d-folding-table-close",
    effects: [],
    next: "s11",
    layout: { x: 1, y: 4 },
  },
  {
    spaceId: "s11",
    routeIndex: 11,
    name: "The Stoop",
    type: "rest",
    effects: [],
    next: "s12",
    layout: { x: 3, y: 5 },
  },
  {
    spaceId: "s12",
    routeIndex: 12,
    name: "Cooler Yard",
    type: "deed",
    deedId: "d-cooler-yard",
    effects: [],
    next: "s13",
    layout: { x: 3, y: 3 },
  },
  {
    spaceId: "s13",
    routeIndex: 13,
    name: "Second Flyer Post",
    type: "eventDraw",
    effects: [{ type: "Draw", deckId: "deck-flyers" }],
    next: "s14",
    layout: { x: 1, y: 2 },
  },
  {
    spaceId: "s14",
    routeIndex: 14,
    name: "Noise Complaint Called",
    type: "sendToDetention",
    effects: [{ type: "SendToDetention" }],
    next: "s15",
    layout: { x: 0, y: 0 },
  },
  {
    spaceId: "s15",
    routeIndex: 15,
    name: "Second Truck Stop",
    type: "deed",
    deedId: "d-second-truck-stop",
    effects: [],
    next: "s00",
    layout: { x: 0, y: -2 },
  },
];

/** Three improvement levels for every district deed. Placeholder values. */
const improvementLevels = [
  { level: 1, rent: 4000, inventoryDelta: 1 },
  { level: 2, rent: 12000, inventoryDelta: 1 },
  { level: 3, rent: 30000, inventoryDelta: -2 },
] as const;

const deeds: readonly Deed[] = [
  {
    deedId: "d-sawhorse-lane",
    spaceId: "s01",
    name: "Sawhorse Lane",
    category: "district",
    districtId: "dist-north",
    price: 12000,
    mortgageValue: 6000,
    redemptionCharge: 6600,
    baseRent: 1000,
    improvementCost: 10000,
    improvementLevels,
  },
  {
    deedId: "d-chalk-arrow-walk",
    spaceId: "s02",
    name: "Chalk Arrow Walk",
    category: "district",
    districtId: "dist-north",
    price: 14000,
    mortgageValue: 7000,
    redemptionCharge: 7700,
    baseRent: 1200,
    improvementCost: 10000,
    improvementLevels,
  },
  {
    deedId: "d-food-truck-row",
    spaceId: "s04",
    name: "Food Truck Row",
    category: "transit",
    price: 20000,
    mortgageValue: 10000,
    redemptionCharge: 11000,
    baseRent: 2500,
  },
  {
    deedId: "d-string-light-bend",
    spaceId: "s05",
    name: "String Light Bend",
    category: "district",
    districtId: "dist-east",
    price: 18000,
    mortgageValue: 9000,
    redemptionCharge: 9900,
    baseRent: 1600,
    improvementCost: 15000,
    improvementLevels,
  },
  {
    deedId: "d-boombox-steps",
    spaceId: "s07",
    name: "Boombox Steps",
    category: "district",
    districtId: "dist-east",
    price: 20000,
    mortgageValue: 10000,
    redemptionCharge: 11000,
    baseRent: 1800,
    improvementCost: 15000,
    improvementLevels,
  },
  {
    deedId: "d-hydrant-hookup",
    spaceId: "s09",
    name: "Hydrant Hookup",
    category: "utility",
    price: 15000,
    mortgageValue: 7500,
    redemptionCharge: 8250,
    baseRent: 0,
  },
  {
    deedId: "d-folding-table-close",
    spaceId: "s10",
    name: "Folding Table Close",
    category: "district",
    districtId: "dist-west",
    price: 26000,
    mortgageValue: 13000,
    redemptionCharge: 14300,
    baseRent: 2400,
    improvementCost: 20000,
    improvementLevels,
  },
  {
    deedId: "d-cooler-yard",
    spaceId: "s12",
    name: "Cooler Yard",
    category: "district",
    districtId: "dist-west",
    price: 28000,
    mortgageValue: 14000,
    redemptionCharge: 15400,
    baseRent: 2600,
    improvementCost: 20000,
    improvementLevels,
  },
  {
    deedId: "d-second-truck-stop",
    spaceId: "s15",
    name: "Second Truck Stop",
    category: "transit",
    price: 20000,
    mortgageValue: 10000,
    redemptionCharge: 11000,
    baseRent: 2500,
  },
];

const districts: readonly District[] = [
  {
    districtId: "dist-north",
    name: "North Kerb",
    deedIds: ["d-sawhorse-lane", "d-chalk-arrow-walk"],
  },
  {
    districtId: "dist-east",
    name: "East Verge",
    deedIds: ["d-string-light-bend", "d-boombox-steps"],
  },
  {
    districtId: "dist-west",
    name: "West Close",
    deedIds: ["d-folding-table-close", "d-cooler-yard"],
  },
];

const decks: readonly Deck[] = [
  {
    deckId: "deck-flyers",
    name: "Taped Flyers",
    cards: [
      {
        cardId: "c-flyer-01",
        title: "Street closed early",
        text: "The barricade goes up ahead of schedule. Move to Sunup Corner.",
        effects: [{ type: "MoveTo", spaceId: "s00", collectStartWhenCrossed: true }],
        retainable: false,
      },
      {
        cardId: "c-flyer-02",
        title: "Everyone chips in",
        text: "Collect a share from every other player.",
        effects: [{ type: "CollectEachPlayer", amount: 2000 }],
        retainable: false,
      },
      {
        cardId: "c-flyer-03",
        title: "Table repairs",
        text: "Pay for the stalls and stages you put up.",
        effects: [{ type: "RepairCharge", perImprovement: 2500, perLandmark: 10000 }],
        retainable: false,
      },
      {
        cardId: "c-flyer-04",
        title: "A neighbourly word",
        text: "Keep this. It settles one noise complaint.",
        effects: [{ type: "GrantDetentionReleaseCard" }],
        retainable: true,
      },
    ],
  },
];

export const PLACEHOLDER_BUNDLE: ContentBundle = {
  contentVersion: "0.0.0-placeholder",
  rulesSchemaVersion: "1.0.0",
  variantSchemaVersion: "1.0.0",
  created: "2026-09-03",
  provenance: {
    status: "PLACEHOLDER_NOT_FOR_RELEASE",
    creator: "scaffolding",
    created: "2026-09-03",
    sourceInputs: ["docs/product/game-content.md", "docs/design/design-system.md"],
    license: "unreleased",
    aiToolRecord:
      "Generated as build scaffolding. No third-party board, values, or card text consulted.",
    similarityDisposition: "Not reviewed. Blocks release until replaced by an authored bundle.",
  },
  // Canonical SHA-256 over this bundle without the hash field. CONTENT-001.
  hash: "4ff6b56b74c9d7ad7cd2687bb6b8faab1b96d9ed29b35a92df01af4f21488db7",
  startSpaceId: "s00",
  detentionSpaceId: "s06",
  spaces,
  deeds,
  districts,
  decks,
  economy: {
    currencyLabel: "credits",
    startingCash: 150000,
    startPayment: 20000,
    detentionReleaseFee: 5000,
    detentionMaxAttempts: 3,
    improvementInventory: { stall: 32, stage: 12 },
    improvementResaleRatio: { numerator: 1, denominator: 2 },
    startingAssetDealCount: 1,
  },
  jackpotEligibleSpaceIds: ["s08"],
};
