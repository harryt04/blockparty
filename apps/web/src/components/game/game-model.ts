import type {
  ActionAvailability,
  BoardSpaceProjection,
  Command,
  GameSnapshotProjection,
  LegalAction,
  VariantKey,
} from "@blockparty/contracts";
import { VARIANT_KEYS } from "@blockparty/contracts";
import { getBundle } from "@blockparty/game-content";
import { DEED_CATEGORY_DISPLAY } from "@/components/display-names";
import { LOBBY_VARIANT_COPY } from "./lobby-model";

/** Keep route order explicit at the presentation boundary. */
export function orderedBoard(spaces: readonly BoardSpaceProjection[]): BoardSpaceProjection[] {
  return [...spaces].sort((left, right) => left.routeIndex - right.routeIndex);
}

export function boardLayout(snapshot: GameSnapshotProjection) {
  const bundle = getBundle(snapshot.versions.contentVersion);
  return Object.fromEntries((bundle?.spaces ?? []).map((space) => [space.spaceId, space.layout]));
}

export function districtNames(snapshot: GameSnapshotProjection): Readonly<Record<string, string>> {
  const bundle = getBundle(snapshot.versions.contentVersion);
  return Object.fromEntries(
    (bundle?.districts ?? []).map((district) => [district.districtId, district.name]),
  );
}

export function activeSpace(snapshot: GameSnapshotProjection): BoardSpaceProjection | undefined {
  const activeSeat = snapshot.seats.find((seat) => seat.seatId === snapshot.activeSeatId);
  return activeSeat?.position === undefined
    ? undefined
    : snapshot.board.find((space) => space.routeIndex === activeSeat.position);
}

export function enabledVariantLabels(
  configuration: GameSnapshotProjection["configuration"],
): readonly string[] {
  return VARIANT_KEYS.filter((key: VariantKey) => configuration[key]).map(
    (key) => LOBBY_VARIANT_COPY[key].label,
  );
}

/**
 * Turns only server-advertised constraints into a command payload. The server
 * remains authoritative and revalidates this payload. See PRD-FUN-006/009.
 */
export function commandForLegalAction(action: LegalAction, amount?: number): Command | undefined {
  const constraints = action.constraints;
  const stringConstraint = (key: string): string | undefined =>
    typeof constraints?.[key] === "string" ? constraints[key] : undefined;

  switch (action.type) {
    case "RollDice":
    case "EndTurn":
    case "EndNoContest":
    case "PassAuction":
    case "PayObligation":
    case "DeclareBankruptcy":
    case "StartGame":
      return { type: action.type };
    case "AcquireDeed":
    case "DeclineAcquisition":
    case "MortgageDeed":
    case "RedeemMortgage":
    case "BuyImprovement":
    case "SellImprovement":
    case "RequestScarceImprovement": {
      const deedId = stringConstraint("deedId");
      return deedId === undefined ? undefined : { type: action.type, deedId };
    }
    case "PlaceAuctionBid": {
      const minimum = constraints?.minBid;
      const maximum = constraints?.maxBid;
      const bid = amount ?? (typeof minimum === "number" ? minimum : undefined);
      return typeof bid === "number" && typeof minimum === "number" && typeof maximum === "number"
        ? { type: "PlaceAuctionBid", amount: bid }
        : undefined;
    }
    case "ChoosePendingOption": {
      const choiceId = stringConstraint("choiceId");
      const optionId = stringConstraint("optionId");
      return choiceId === undefined || optionId === undefined
        ? undefined
        : { type: "ChoosePendingOption", choiceId, optionId };
    }
    case "AcceptTrade":
    case "RejectTrade":
    case "CancelTrade": {
      const tradeId = stringConstraint("tradeId");
      return tradeId === undefined ? undefined : { type: action.type, tradeId };
    }
    default:
      // Compose-only actions (for example ProposeTrade) get a dedicated
      // surface in their later ticket and are not guessed from a projection.
      return undefined;
  }
}

export interface AcquisitionDecisionContext {
  readonly deedId: string;
  readonly spaceName: string;
  readonly categoryLabel: string;
  readonly price: number;
  readonly balance: number;
  readonly projectedBalance: number;
  readonly canAcquire: boolean;
  readonly baseRent?: number;
}

export interface AuctionDecisionContext {
  readonly deedId: string;
  readonly spaceName: string;
  readonly categoryLabel: string;
  readonly highBid: number;
  readonly minimumNextBid: number;
  readonly maximumBid: number;
  readonly balance: number;
  readonly prioritySeatId: string;
  readonly priorityName: string;
  readonly priorityConnected: boolean;
  readonly leaderName?: string;
  readonly passedNames: readonly string[];
}

export const MANAGEMENT_ACTION_TYPES = [
  "BuyImprovement",
  "SellImprovement",
  "MortgageDeed",
  "RedeemMortgage",
] as const satisfies readonly LegalAction["type"][];

type ManagementActionType = (typeof MANAGEMENT_ACTION_TYPES)[number];

export interface ManagementActionContext {
  readonly type: ManagementActionType;
  readonly action: LegalAction;
}

export interface ManagementDeedContext {
  readonly deedId: string;
  readonly spaceName: string;
  readonly categoryLabel: string;
  readonly districtName?: string;
  readonly improvementLevel: number;
  readonly maximumImprovementLevel: number;
  readonly districtComplete?: boolean;
  readonly nextImprovementCost?: number;
  readonly improvementResaleValue?: number;
  readonly mortgageValue: number;
  readonly redemptionAmount: number;
  readonly actions: readonly ManagementActionContext[];
}

export interface ManagementDecisionContext {
  readonly deeds: readonly ManagementDeedContext[];
  readonly blocked: readonly ActionAvailability[];
  readonly inventoryKind?: string;
  readonly inventoryAvailable?: number;
  readonly inventoryUnlimited: boolean;
  readonly balance: number;
}

function deedPresentation(
  snapshot: GameSnapshotProjection,
  deedId: string,
): {
  readonly space: BoardSpaceProjection | undefined;
  readonly categoryLabel: string;
  readonly baseRent: number | undefined;
} {
  const space = snapshot.board.find((candidate) => candidate.deedId === deedId);
  const deed = getBundle(snapshot.versions.contentVersion)?.deeds.find(
    (candidate) => candidate.deedId === deedId,
  );
  return {
    space,
    categoryLabel:
      space?.deedCategory === undefined
        ? "Address"
        : DEED_CATEGORY_DISPLAY[space.deedCategory].label,
    baseRent: deed?.baseRent,
  };
}

function selfBalance(snapshot: GameSnapshotProjection): number {
  return snapshot.seats.find((seat) => seat.isSelf)?.balance ?? 0;
}

function stringConstraint(action: LegalAction | undefined, key: string): string | undefined {
  const value = action?.constraints?.[key];
  return typeof value === "string" ? value : undefined;
}

function managementDeedId(action: LegalAction): string | undefined {
  const deedId = action.constraints?.deedId;
  return typeof deedId === "string" ? deedId : undefined;
}

function isManagementAction(type: LegalAction["type"]): type is ManagementActionType {
  return (MANAGEMENT_ACTION_TYPES as readonly string[]).includes(type);
}

/**
 * Builds the Manage inventory from the captured content and current public
 * projection. Buttons remain keyed to server legalActions; these values are
 * previews only. See RULE-005/RULE-008 and UX-016.
 */
export function managementDecisionContext(
  snapshot: GameSnapshotProjection,
): ManagementDecisionContext | undefined {
  const self = snapshot.seats.find((seat) => seat.isSelf);
  if (self === undefined || self.deedIds === undefined) return undefined;

  const bundle = getBundle(snapshot.versions.contentVersion);
  if (bundle === undefined) return undefined;
  const deedById = new Map(bundle.deeds.map((deed) => [deed.deedId, deed]));
  const spaceByDeedId = new Map(
    snapshot.board.flatMap((space) => (space.deedId === undefined ? [] : [[space.deedId, space]])),
  );
  const districtById = new Map(bundle.districts.map((district) => [district.districtId, district]));
  const districtNameById = districtNames(snapshot);
  const actions = snapshot.legalActions.filter(
    (action): action is LegalAction & { readonly type: ManagementActionType } =>
      isManagementAction(action.type) && managementDeedId(action) !== undefined,
  );
  const managementActionTypes = new Set<LegalAction["type"]>(MANAGEMENT_ACTION_TYPES);
  const blocked = snapshot.actionAvailability.filter((action) =>
    managementActionTypes.has(action.type),
  );
  const inventoryKind = Object.keys(bundle.economy.improvementInventory)[0];
  const inventoryUnlimited = snapshot.configuration.unlimitedImprovementInventory;

  const deeds = self.deedIds.flatMap((deedId) => {
    const deed = deedById.get(deedId);
    const space = spaceByDeedId.get(deedId);
    if (deed === undefined || space === undefined) return [];
    const district = deed.districtId === undefined ? undefined : districtById.get(deed.districtId);
    const districtSpaces =
      district === undefined
        ? []
        : district.deedIds.flatMap((id) => {
            const districtSpace = spaceByDeedId.get(id);
            return districtSpace === undefined ? [] : [districtSpace];
          });
    const districtComplete =
      district === undefined
        ? undefined
        : districtSpaces.length === district.deedIds.length &&
          districtSpaces.every(
            (districtSpace) =>
              districtSpace.ownerSeatId === self.seatId && districtSpace.mortgaged !== true,
          );
    const improvementLevel = space.improvementLevel ?? 0;
    const improvementLevels = deed.improvementLevels ?? [];
    const maximumImprovementLevel = improvementLevels.at(-1)?.level ?? 0;
    const nextLevel = improvementLevels.find((level) => level.level === improvementLevel + 1);
    const actionsForDeed = actions
      .filter((action) => managementDeedId(action) === deedId)
      .map((action) => ({ type: action.type, action }));

    return [
      {
        deedId,
        spaceName: space.name,
        categoryLabel: DEED_CATEGORY_DISPLAY[deed.category].label,
        ...(deed.districtId === undefined
          ? {}
          : { districtName: districtNameById[deed.districtId] }),
        improvementLevel,
        maximumImprovementLevel,
        ...(districtComplete === undefined ? {} : { districtComplete }),
        ...(nextLevel === undefined || deed.improvementCost === undefined
          ? {}
          : { nextImprovementCost: deed.improvementCost }),
        ...(improvementLevel <= 0 || deed.improvementCost === undefined
          ? {}
          : {
              improvementResaleValue: Math.floor(
                (deed.improvementCost * bundle.economy.improvementResaleRatio.numerator) /
                  bundle.economy.improvementResaleRatio.denominator,
              ),
            }),
        mortgageValue: deed.mortgageValue,
        redemptionAmount: deed.mortgageValue + deed.redemptionCharge,
        actions: actionsForDeed,
      },
    ];
  });

  if (deeds.length === 0 && blocked.length === 0) return undefined;
  return {
    deeds,
    blocked,
    ...(inventoryKind === undefined ? {} : { inventoryKind }),
    ...(inventoryKind === undefined || inventoryUnlimited || snapshot.bank === undefined
      ? {}
      : { inventoryAvailable: snapshot.bank.improvementInventory[inventoryKind] ?? 0 }),
    inventoryUnlimited,
    balance: self.balance ?? 0,
  };
}

/** Display-only acquisition context. Authority remains in legalActions. See UX-014. */
export function acquisitionDecisionContext(
  snapshot: GameSnapshotProjection,
): AcquisitionDecisionContext | undefined {
  if (snapshot.phase !== "AwaitPurchase") return undefined;
  const deedId = stringConstraint(
    snapshot.legalActions.find(
      (action) => action.type === "AcquireDeed" || action.type === "DeclineAcquisition",
    ),
    "deedId",
  );
  if (deedId === undefined) return undefined;
  const presentation = deedPresentation(snapshot, deedId);
  if (presentation.space?.name === undefined || presentation.space.price === undefined) {
    return undefined;
  }
  const balance = selfBalance(snapshot);
  return {
    deedId,
    spaceName: presentation.space.name,
    categoryLabel: presentation.categoryLabel,
    price: presentation.space.price,
    balance,
    projectedBalance: balance - presentation.space.price,
    canAcquire: snapshot.legalActions.some((action) => action.type === "AcquireDeed"),
    ...(presentation.baseRent === undefined ? {} : { baseRent: presentation.baseRent }),
  };
}

/** Display-only auction context. It intentionally has no timer or client authority. See UX-014/RULE-009. */
export function auctionDecisionContext(
  snapshot: GameSnapshotProjection,
): AuctionDecisionContext | undefined {
  if (snapshot.phase !== "AwaitAuction" || snapshot.auction === undefined) return undefined;
  const auction = snapshot.auction;
  const presentation = deedPresentation(snapshot, auction.deedId);
  if (presentation.space?.name === undefined) return undefined;
  const priority = snapshot.seats.find((seat) => seat.seatId === auction.prioritySeatId);
  if (priority === undefined) return undefined;
  const leader = snapshot.seats.find((seat) => seat.seatId === auction.highBidderSeatId);
  const passedNames = auction.passedSeatIds.flatMap((seatId) => {
    const seat = snapshot.seats.find((candidate) => candidate.seatId === seatId);
    return seat?.name === undefined ? [] : [seat.name];
  });
  const bidAction = snapshot.legalActions.find((action) => action.type === "PlaceAuctionBid");
  const maximumBid =
    typeof bidAction?.constraints?.maxBid === "number"
      ? bidAction.constraints.maxBid
      : selfBalance(snapshot);
  return {
    deedId: auction.deedId,
    spaceName: presentation.space.name,
    categoryLabel: presentation.categoryLabel,
    highBid: auction.highBid ?? 0,
    minimumNextBid: auction.minimumNextBid,
    maximumBid,
    balance: selfBalance(snapshot),
    prioritySeatId: auction.prioritySeatId,
    priorityName: priority.name ?? "Open seat",
    priorityConnected: priority.connected,
    ...(leader?.name === undefined ? {} : { leaderName: leader.name }),
    passedNames,
  };
}

export function latestDiceResult(
  snapshot: GameSnapshotProjection,
): { readonly first: number; readonly second: number } | undefined {
  const event = [...(snapshot.publicEvents ?? [])]
    .sort((left, right) => right.sequence - left.sequence)
    .find((candidate) => candidate.type === "DiceRolled");
  if (event === undefined) return undefined;
  const first = event.payload.first;
  const second = event.payload.second;
  return typeof first === "number" &&
    Number.isInteger(first) &&
    first >= 1 &&
    first <= 6 &&
    typeof second === "number" &&
    Number.isInteger(second) &&
    second >= 1 &&
    second <= 6
    ? { first, second }
    : undefined;
}
