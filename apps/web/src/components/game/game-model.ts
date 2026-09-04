import type {
  BoardSpaceProjection,
  Command,
  GameSnapshotProjection,
  LegalAction,
  VariantKey,
} from "@blockparty/contracts";
import { VARIANT_KEYS } from "@blockparty/contracts";
import { getBundle } from "@blockparty/game-content";
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
