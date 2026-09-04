import type {
  BoardSpaceProjection,
  GameSnapshotProjection,
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
