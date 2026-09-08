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
  readonly rentLevel: string;
  readonly buildCost?: number;
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
  const ownedDeedIds = new Set(self.deedIds);
  const groups = new Map<string, PropertyHandGroup>();

  for (const deedId of self.deedIds) {
    const deed = deedById.get(deedId);
    const space = spaceByDeedId.get(deedId);
    if (deed === undefined || space === undefined) continue;

    const group = groupFor(deed, districtNameById);
    const improvementLevel = space.improvementLevel ?? 0;
    const district =
      deed.districtId === undefined
        ? undefined
        : bundle.districts.find((candidate) => candidate.districtId === deed.districtId);
    const districtComplete =
      district !== undefined && district.deedIds.every((id) => ownedDeedIds.has(id));
    const maximumImprovementLevel = deed.improvementLevels?.at(-1)?.level ?? 0;
    const transitCount = bundle.deeds.filter(
      (candidate) => candidate.category === "transit" && ownedDeedIds.has(candidate.deedId),
    ).length;
    const utilityCount = bundle.deeds.filter(
      (candidate) => candidate.category === "utility" && ownedDeedIds.has(candidate.deedId),
    ).length;
    const currentRent =
      deed.improvementLevels?.find((level) => level.level === improvementLevel)?.rent ??
      (deed.category === "district" && districtComplete
        ? deed.baseRent * (deed.completeDistrictMultiplier ?? 1)
        : deed.category === "transit"
          ? (deed.transitRentByCount?.[transitCount] ?? 0)
          : deed.category === "utility"
            ? (deed.utilityMultiplierByCount?.[utilityCount] ?? 0)
            : deed.baseRent);
    const improvementLabel =
      improvementLevel === 0
        ? "No Houses or Hotel"
        : improvementLevel === maximumImprovementLevel
          ? "Hotel"
          : `${improvementLevel} ${improvementLevel === 1 ? "House" : "Houses"}`;
    const handDeed: PropertyHandDeed = {
      deedId: deed.deedId,
      spaceId: deed.spaceId,
      name: deed.name,
      groupId: group.groupId,
      groupName: group.label,
      categoryLabel: DEED_CATEGORY_DISPLAY[deed.category].label,
      rent: currentRent,
      rentIsVariable: deed.category === "utility",
      rentLevel: improvementLabel,
      ...(deed.improvementCost === undefined ? {} : { buildCost: deed.improvementCost }),
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
