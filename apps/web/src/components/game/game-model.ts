import type {
  ActionAvailability,
  BoardSpaceProjection,
  Command,
  GameSnapshotProjection,
  LegalAction,
  PendingTradeProjection,
  VariantKey,
} from "@blockparty/contracts";
import { VARIANT_KEYS } from "@blockparty/contracts";
import { getBundle } from "@blockparty/game-content";
import {
  DEED_CATEGORY_DISPLAY,
  SPACE_CATEGORY_DISPLAY,
  formatMoney,
} from "@/components/display-names";
import { LOBBY_VARIANT_COPY } from "./lobby-model";

/** Keep route order explicit at the presentation boundary. */
export function orderedBoard(spaces: readonly BoardSpaceProjection[]): BoardSpaceProjection[] {
  return [...spaces].sort((left, right) => left.routeIndex - right.routeIndex);
}

/**
 * Keep the complete board fact set in the inspect control name. `aria-label`
 * replaces descendant text for assistive technology, so omitting a visible
 * fact here would make the spatial board and its equivalent disagree. See
 * UX-040 and DS-040.
 */
export function boardStopAccessibleLabel(
  space: BoardSpaceProjection,
  seats: readonly GameSnapshotProjection["seats"][number][],
  currencyLabel: string,
  districtNames: Readonly<Record<string, string>>,
): string {
  const seatName = (seatId: string) => seats.find((seat) => seat.seatId === seatId)?.name ?? seatId;
  const category = SPACE_CATEGORY_DISPLAY[space.category];
  const deedCategory =
    space.deedCategory === undefined ? undefined : DEED_CATEGORY_DISPLAY[space.deedCategory];
  const districtName = space.districtId === undefined ? undefined : districtNames[space.districtId];
  const ownership =
    space.ownerSeatId === undefined
      ? space.price === undefined
        ? "Available"
        : `Available for ${formatMoney(space.price, currencyLabel)}`
      : `Owned by ${seatName(space.ownerSeatId)}`;
  const price =
    space.ownerSeatId !== undefined && space.price !== undefined
      ? `Price ${formatMoney(space.price, currencyLabel)}`
      : undefined;
  const occupants =
    space.occupantSeatIds.length === 0
      ? "No players here"
      : `Here now: ${space.occupantSeatIds.map(seatName).join(", ")}`;

  return [
    `Stop ${space.routeIndex}`,
    space.name,
    deedCategory?.label ?? category.label,
    districtName,
    ownership,
    price,
    space.mortgaged === true ? "Mortgaged" : undefined,
    space.improvementLevel !== undefined && space.improvementLevel > 0
      ? `Improvement level ${space.improvementLevel}`
      : undefined,
    occupants,
  ]
    .filter((value): value is string => value !== undefined)
    .join(", ");
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

export interface DetentionRouteContext {
  readonly action: LegalAction;
  readonly label: string;
  readonly description: string;
}

export interface DetentionDecisionContext {
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly releaseFee: number;
  readonly routes: readonly DetentionRouteContext[];
}

export interface ObligationDecisionContext {
  readonly debtorName: string;
  readonly viewerIsDebtor: boolean;
  readonly amount: number;
  readonly creditorName: string;
  readonly creditorIsBank: boolean;
  readonly reason: string;
  readonly balance: number;
  readonly shortfall: number;
  readonly liquidation: readonly LegalAction[];
  readonly blocked: readonly ActionAvailability[];
  readonly canPay: boolean;
  readonly canDeclareBankruptcy: boolean;
}

export interface TradeAssetContext {
  readonly assetId: string;
  readonly label: string;
  readonly mortgaged?: boolean;
  readonly transferCharge: number;
}

export interface TradeSideContext {
  readonly cash: number;
  readonly deeds: readonly TradeAssetContext[];
  readonly detentionReleaseCards: readonly TradeAssetContext[];
  readonly incomingMortgageCharge: number;
  readonly balanceAfter: number;
}

export interface TradeDecisionContext {
  readonly tradeId: string;
  readonly proposerSeatId: string;
  readonly counterpartySeatId: string;
  readonly proposerName: string;
  readonly counterpartyName: string;
  readonly offered: TradeSideContext;
  readonly requested: TradeSideContext;
  readonly proposerBalance: number;
  readonly counterpartyBalance: number;
  readonly viewerIsProposer: boolean;
  readonly canAccept: boolean;
  readonly canReject: boolean;
  readonly canCancel: boolean;
}

export interface TradeComposerContext {
  readonly proposerSeatId: string;
  readonly proposerName: string;
  readonly counterparties: readonly {
    readonly seatId: string;
    readonly name: string;
    readonly balance: number;
    readonly deeds: readonly TradeAssetContext[];
  }[];
  readonly offeredDeeds: readonly TradeAssetContext[];
  readonly offeredDetentionReleaseCards: readonly TradeAssetContext[];
  readonly proposeAction: LegalAction;
}

export interface RecoveryDecisionContext {
  readonly safeBoundary: boolean;
  readonly replacementSeats: readonly {
    readonly seatId: string;
    readonly name: string;
  }[];
  readonly pendingReclaimName?: string;
  readonly pendingHostName?: string;
  readonly viewerCanRequestReclaim: boolean;
  readonly viewerCanClaimHost: boolean;
  readonly viewerIsHost: boolean;
  readonly canEndNoContest: boolean;
}

/**
 * Maps server-advertised recovery authority to named UI context. The browser
 * never infers permission from connection state alone. See UX-018.
 */
export function recoveryDecisionContext(snapshot: GameSnapshotProjection): RecoveryDecisionContext {
  const self = snapshot.seats.find((seat) => seat.isSelf);
  const nameFor = (seatId: string | undefined): string | undefined =>
    seatId === undefined ? undefined : snapshot.seats.find((seat) => seat.seatId === seatId)?.name;
  return {
    safeBoundary: snapshot.recovery.safeBoundary,
    replacementSeats: snapshot.recovery.replacementSeatIds.map((seatId) => ({
      seatId,
      name: nameFor(seatId) ?? "Disconnected player",
    })),
    ...(nameFor(snapshot.recovery.pendingSeatReclaimId) === undefined
      ? {}
      : { pendingReclaimName: nameFor(snapshot.recovery.pendingSeatReclaimId) }),
    ...(nameFor(snapshot.recovery.pendingHostClaimSeatId) === undefined
      ? {}
      : { pendingHostName: nameFor(snapshot.recovery.pendingHostClaimSeatId) }),
    viewerCanRequestReclaim: snapshot.recovery.viewerCanRequestReclaim,
    viewerCanClaimHost: snapshot.recovery.viewerCanClaimHost,
    viewerIsHost: self?.isHost === true,
    canEndNoContest:
      self?.isHost === true &&
      snapshot.legalActions.some((action) => action.type === "EndNoContest"),
  };
}

/**
 * Builds current Noise Complaint release choices from server legalActions.
 * Attempts and the fee come from the captured content bundle, while buttons
 * remain entirely server-advertised. See RULE-009, CONTENT-005, and UX-017.
 */
export function detentionDecisionContext(
  snapshot: GameSnapshotProjection,
): DetentionDecisionContext | undefined {
  const self = snapshot.seats.find((seat) => seat.isSelf);
  if (self?.detained !== true || snapshot.phase !== "AwaitChoice") return undefined;
  const bundle = getBundle(snapshot.versions.contentVersion);
  if (bundle === undefined) return undefined;
  const routes = snapshot.legalActions
    .filter((action) => action.type === "ChoosePendingOption")
    .flatMap((action): DetentionRouteContext[] => {
      const optionId = stringConstraint(action, "optionId");
      if (optionId === undefined) return [];
      if (optionId === "attempt-roll") {
        return [
          {
            action,
            label: "Attempt a matching roll",
            description:
              "A matching roll clears Noise Complaint and moves you. A miss ends your turn.",
          },
        ];
      }
      if (optionId === "pay-release-fee") {
        return [
          {
            action,
            label: "Pay the release fee",
            description: "Pay the data-defined fee, then roll and move in this same turn.",
          },
        ];
      }
      if (optionId.startsWith("use-release-card:")) {
        const cardId = optionId.slice("use-release-card:".length);
        return [
          {
            action,
            label: `Use ${cardTitle(snapshot, cardId)}`,
            description: "Use a held Neighborly Word to leave Noise Complaint without rolling.",
          },
        ];
      }
      return [];
    });
  return {
    attempts: self.detentionTurnsRemaining ?? 0,
    maxAttempts: bundle.economy.detentionMaxAttempts,
    releaseFee: bundle.economy.detentionReleaseFee,
    routes,
  };
}

/** Builds the visible creditor, amount, and liquidation choices for an Owed state. */
export function obligationDecisionContext(
  snapshot: GameSnapshotProjection,
): ObligationDecisionContext | undefined {
  if (snapshot.obligation === undefined) return undefined;
  const obligation = snapshot.obligation;
  const creditor =
    obligation.creditorSeatId === undefined
      ? undefined
      : snapshot.seats.find((seat) => seat.seatId === obligation.creditorSeatId);
  const debtor = snapshot.seats.find((seat) => seat.seatId === obligation.debtorSeatId);
  const balance = selfBalance(snapshot);
  const liquidationTypes = new Set<LegalAction["type"]>([
    "MortgageDeed",
    "SellImprovement",
    "ProposeTrade",
  ]);
  return {
    debtorName: debtor?.name ?? "A player",
    viewerIsDebtor: snapshot.viewerSeatId === obligation.debtorSeatId,
    amount: obligation.amount,
    creditorName: creditor?.name ?? "The Committee",
    creditorIsBank: obligation.creditorSeatId === undefined,
    reason: obligation.reason,
    balance,
    shortfall: Math.max(0, obligation.amount - balance),
    liquidation: snapshot.legalActions.filter((action) => liquidationTypes.has(action.type)),
    blocked: snapshot.actionAvailability.filter((action) => liquidationTypes.has(action.type)),
    canPay: snapshot.legalActions.some((action) => action.type === "PayObligation"),
    canDeclareBankruptcy: snapshot.legalActions.some(
      (action) => action.type === "DeclareBankruptcy",
    ),
  };
}

function cardTitle(snapshot: GameSnapshotProjection, cardId: string): string {
  const card = getBundle(snapshot.versions.contentVersion)
    ?.decks.flatMap((deck) => deck.cards)
    .find((candidate) => candidate.cardId === cardId);
  return card?.title ?? "Neighborly Word";
}

function tradeDeedAsset(snapshot: GameSnapshotProjection, deedId: string): TradeAssetContext {
  const space = snapshot.board.find((candidate) => candidate.deedId === deedId);
  const deed = getBundle(snapshot.versions.contentVersion)?.deeds.find(
    (candidate) => candidate.deedId === deedId,
  );
  return {
    assetId: deedId,
    label: space?.name ?? "Address",
    ...(space?.mortgaged === undefined ? {} : { mortgaged: space.mortgaged }),
    transferCharge: space?.mortgaged === true ? (deed?.transferCharge ?? 0) : 0,
  };
}

function tradeSideContext(
  snapshot: GameSnapshotProjection,
  side: PendingTradeProjection["offered"],
  incomingMortgageCharge: number,
  balanceAfter: number,
): TradeSideContext {
  return {
    cash: side.cash,
    deeds: side.deedIds.map((deedId) => tradeDeedAsset(snapshot, deedId)),
    detentionReleaseCards: side.detentionReleaseCardIds.map((cardId) => ({
      assetId: cardId,
      label: cardTitle(snapshot, cardId),
      transferCharge: 0,
    })),
    incomingMortgageCharge,
    balanceAfter,
  };
}

/** Builds the named-parties-only trade review from canonical projection data. */
export function tradeDecisionContext(
  snapshot: GameSnapshotProjection,
): TradeDecisionContext | undefined {
  const trade = snapshot.pendingTrade;
  if (trade === undefined) return undefined;
  const proposer = snapshot.seats.find((seat) => seat.seatId === trade.proposerSeatId);
  const counterparty = snapshot.seats.find((seat) => seat.seatId === trade.counterpartySeatId);
  if (proposer === undefined || counterparty === undefined) return undefined;
  const offeredCharge = tradeSideContext(
    snapshot,
    trade.offered,
    trade.offered.deedIds.reduce(
      (total, deedId) => total + tradeDeedAsset(snapshot, deedId).transferCharge,
      0,
    ),
    trade.counterpartyBalance -
      trade.requested.cash +
      trade.offered.cash -
      trade.offered.deedIds.reduce(
        (total, deedId) => total + tradeDeedAsset(snapshot, deedId).transferCharge,
        0,
      ),
  );
  const requestedCharge = trade.requested.deedIds.reduce(
    (total, deedId) => total + tradeDeedAsset(snapshot, deedId).transferCharge,
    0,
  );
  const requested = tradeSideContext(
    snapshot,
    trade.requested,
    requestedCharge,
    trade.proposerBalance - trade.offered.cash + trade.requested.cash - requestedCharge,
  );
  const viewerIsProposer = snapshot.viewerSeatId === trade.proposerSeatId;
  const viewerIsCounterparty = snapshot.viewerSeatId === trade.counterpartySeatId;
  return {
    tradeId: trade.tradeId,
    proposerSeatId: trade.proposerSeatId,
    counterpartySeatId: trade.counterpartySeatId,
    proposerName: proposer.name ?? "Proposer",
    counterpartyName: counterparty.name ?? "Counterparty",
    offered: offeredCharge,
    requested,
    proposerBalance: trade.proposerBalance,
    counterpartyBalance: trade.counterpartyBalance,
    viewerIsProposer,
    canAccept: viewerIsCounterparty && snapshot.legalActions.some((a) => a.type === "AcceptTrade"),
    canReject: viewerIsCounterparty && snapshot.legalActions.some((a) => a.type === "RejectTrade"),
    canCancel: viewerIsProposer && snapshot.legalActions.some((a) => a.type === "CancelTrade"),
  };
}

/** Builds the compose inventory without exposing another seat's private cards. */
export function tradeComposerContext(
  snapshot: GameSnapshotProjection,
): TradeComposerContext | undefined {
  const self = snapshot.seats.find((seat) => seat.isSelf);
  const proposeAction = snapshot.legalActions.find((action) => action.type === "ProposeTrade");
  if (self === undefined || proposeAction === undefined) return undefined;
  const counterparties = snapshot.seats
    .filter((seat) => seat.status === "active" && seat.seatId !== self.seatId)
    .map((seat) => ({
      seatId: seat.seatId,
      name: seat.name ?? "Open seat",
      balance: seat.balance ?? 0,
      deeds: (seat.deedIds ?? []).map((deedId) => tradeDeedAsset(snapshot, deedId)),
    }));
  return {
    proposerSeatId: self.seatId,
    proposerName: self.name ?? "You",
    counterparties,
    offeredDeeds: (self.deedIds ?? []).map((deedId) => tradeDeedAsset(snapshot, deedId)),
    offeredDetentionReleaseCards: (self.detentionReleaseCardIds ?? []).map((cardId) => ({
      assetId: cardId,
      label: cardTitle(snapshot, cardId),
      transferCharge: 0,
    })),
    proposeAction,
  };
}

export function latestTradeOutcome(
  snapshot: GameSnapshotProjection,
): "stale" | "accepted" | "rejected" | "cancelled" | undefined {
  const event = [...(snapshot.publicEvents ?? [])]
    .sort((left, right) => right.sequence - left.sequence)
    .find((candidate) =>
      ["TradeStaled", "TradeAccepted", "TradeRejected", "TradeCancelled"].includes(candidate.type),
    );
  switch (event?.type) {
    case "TradeStaled":
      return "stale";
    case "TradeAccepted":
      return "accepted";
    case "TradeRejected":
      return "rejected";
    case "TradeCancelled":
      return "cancelled";
    default:
      return undefined;
  }
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
  const dice = event.payload.dice;
  const first = Array.isArray(dice) ? dice[0] : event.payload.first;
  const second = Array.isArray(dice) ? dice[1] : event.payload.second;
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
