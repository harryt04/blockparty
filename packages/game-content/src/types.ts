/**
 * Content bundle types. See CONTENT-001 through CONTENT-011 in
 * docs/product/game-content.md.
 *
 * Content is immutable data, separate from runtime state. Every value is an
 * integer in minor units. Effects are typed data, never executable scripts.
 */

export type Money = number;
export type SpaceId = string;
export type DeedId = string;
export type DistrictId = string;
export type DeckId = string;
export type CardId = string;
export type ChoiceId = string;

/**
 * The closed effect set. A new effect type requires schema review,
 * deterministic engine support, accessibility copy, migration fixtures, and a
 * content-version change. See CONTENT-003.
 */
export type ContentEffect =
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

export type SpaceType =
  | "start"
  | "deed"
  | "eventDraw"
  | "fee"
  | "rest"
  | "detention"
  | "sendToDetention";

/**
 * One stop on the route. `routeIndex` orders the route; `next` records the
 * winding topology explicitly rather than implying a closed grid. See
 * CONTENT-002 and the DS-001 grid guardrail.
 */
export interface BoardSpace {
  readonly spaceId: SpaceId;
  readonly routeIndex: number;
  readonly name: string;
  readonly type: SpaceType;
  /** Present when type is "deed". */
  readonly deedId?: DeedId;
  /** Effects resolved in array order when a token lands here. RULE-007. */
  readonly effects: readonly ContentEffect[];
  /** The next stop along the route. */
  readonly next: SpaceId;
  /**
   * Layout hint for the SVG route drawing, in an abstract unit grid.
   * Presentation only: the engine never reads it.
   */
  readonly layout: { readonly x: number; readonly y: number };
}

export type DeedCategory = "district" | "transit" | "utility";

export interface ImprovementLevel {
  readonly level: number;
  readonly rent: Money;
  /** Inventory pieces this level consumes, relative to the level below. */
  readonly inventoryDelta: number;
}

export interface Deed {
  readonly deedId: DeedId;
  readonly spaceId: SpaceId;
  readonly name: string;
  readonly category: DeedCategory;
  /** Required when category is "district". */
  readonly districtId?: DistrictId;
  readonly price: Money;
  readonly mortgageValue: Money;
  readonly redemptionCharge: Money;
  readonly baseRent: Money;
  readonly improvementCost?: Money;
  readonly improvementLevels?: readonly ImprovementLevel[];
}

export interface District {
  readonly districtId: DistrictId;
  readonly name: string;
  readonly deedIds: readonly DeedId[];
}

export interface Economy {
  readonly currencyLabel: string;
  readonly startingCash: Money;
  readonly startPayment: Money;
  readonly detentionReleaseFee: Money;
  readonly detentionMaxAttempts: number;
  /** Finite bank inventory by improvement kind. VAR-008 bypasses it. */
  readonly improvementInventory: Readonly<Record<string, number>>;
  /** Numerator/denominator, so resale rounding stays integer and data-defined. */
  readonly improvementResaleRatio: { readonly numerator: number; readonly denominator: number };
  /** Deeds dealt per seat when VAR-006 is on. See CONTENT-007. */
  readonly startingAssetDealCount: number;
}

export interface Card {
  readonly cardId: CardId;
  readonly title: string;
  readonly text: string;
  readonly effects: readonly ContentEffect[];
  /** A retainable card is held until played, such as a Detention release. */
  readonly retainable: boolean;
}

export interface Deck {
  readonly deckId: DeckId;
  readonly name: string;
  readonly cards: readonly Card[];
}

/**
 * Provenance is mandatory. Missing provenance blocks release. CONTENT-008.
 */
export interface Provenance {
  readonly status: "PLACEHOLDER_NOT_FOR_RELEASE" | "AUTHORED" | "REVIEWED";
  readonly creator: string;
  readonly created: string;
  readonly sourceInputs: readonly string[];
  readonly license: string;
  readonly aiToolRecord?: string;
  readonly reviewedBy?: string;
  readonly similarityDisposition?: string;
}

export interface ContentBundle {
  readonly contentVersion: string;
  readonly rulesSchemaVersion: string;
  readonly variantSchemaVersion: string;
  readonly created: string;
  readonly provenance: Provenance;
  /** Canonical hash of the bundle, recorded on a started game. CONTENT-001. */
  readonly hash: string;
  readonly startSpaceId: SpaceId;
  readonly detentionSpaceId: SpaceId;
  readonly spaces: readonly BoardSpace[];
  readonly deeds: readonly Deed[];
  readonly districts: readonly District[];
  readonly decks: readonly Deck[];
  readonly economy: Economy;
  /** Fees that fund the jackpot when VAR-001 is on. CONTENT-007. */
  readonly jackpotEligibleSpaceIds: readonly SpaceId[];
}
