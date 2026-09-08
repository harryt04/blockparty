import type { GameSnapshotProjection } from "@blockparty/contracts";
import { getBundle, type Deed } from "@blockparty/game-content";
import { DEED_CATEGORY_DISPLAY } from "@/components/display-names";

export interface PropertyHandDeed {
  readonly deedId: string;
  readonly spaceId: string;
  readonly name: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly categoryLabel: string;
  readonly rent: number;
  readonly rentIsVariable: boolean;
  readonly improvementLevel: number;
  readonly mortgaged: boolean;
}

export interface PropertyHandGroup {
  readonly groupId: string;
  readonly label: string;
  readonly deeds: readonly PropertyHandDeed[];
}

function groupFor(
  deed: Deed,
  districtNameById: Readonly<Record<string, string>>,
): {
  readonly groupId: string;
  readonly label: string;
} {
  if (deed.districtId !== undefined) {
    return {
      groupId: deed.districtId,
      label: districtNameById[deed.districtId] ?? deed.districtId,
    };
  }

  return {
    groupId: deed.category,
    label: `${DEED_CATEGORY_DISPLAY[deed.category].label} Properties`,
  };
}

/**
 * Derive the local property hand from the authorized projection and captured
 * content. Unknown deed IDs are omitted rather than turned into guessed UI.
 * See UX-044 and DS-060.
 */
export function propertyHandGroups(snapshot: GameSnapshotProjection): readonly PropertyHandGroup[] {
  const self = snapshot.seats.find((seat) => seat.isSelf);
  const bundle = getBundle(snapshot.versions.contentVersion);
  if (self?.deedIds === undefined || bundle === undefined) return [];

  const spaceByDeedId = new Map(
    snapshot.board.flatMap((space) => (space.deedId === undefined ? [] : [[space.deedId, space]])),
  );
  const districtNameById = Object.fromEntries(
    bundle.districts.map((district) => [district.districtId, district.name]),
  );
  const deedById = new Map(bundle.deeds.map((deed) => [deed.deedId, deed]));
  const groups = new Map<string, PropertyHandGroup>();

  for (const deedId of self.deedIds) {
    const deed = deedById.get(deedId);
    const space = spaceByDeedId.get(deedId);
    if (deed === undefined || space === undefined) continue;

    const group = groupFor(deed, districtNameById);
    const improvementLevel = space.improvementLevel ?? 0;
    const currentRent =
      deed.improvementLevels?.find((level) => level.level === improvementLevel)?.rent ??
      deed.baseRent;
    const handDeed: PropertyHandDeed = {
      deedId: deed.deedId,
      spaceId: deed.spaceId,
      name: deed.name,
      groupId: group.groupId,
      groupName: group.label,
      categoryLabel: DEED_CATEGORY_DISPLAY[deed.category].label,
      rent: currentRent,
      rentIsVariable: deed.category !== "district",
      improvementLevel,
      mortgaged: space.mortgaged === true,
    };

    const existing = groups.get(group.groupId);
    groups.set(
      group.groupId,
      existing === undefined
        ? { groupId: group.groupId, label: group.label, deeds: [handDeed] }
        : { ...existing, deeds: [...existing.deeds, handDeed] },
    );
  }

  return [...groups.values()];
}
