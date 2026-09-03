/**
 * Build-time content validation. See CONTENT-009 and ENG-024.
 *
 * Validation deliberately lives beside the content types. Content is data, so
 * malformed authoring input must be rejected before it can become a RuleSet.
 */
import type { BoardSpace, ContentBundle, Deed, Deck, District } from "./types";
import { canonicalHashBundle } from "./canonical";

const SUPPORTED_VARIANT_SCHEMA_VERSION = "1.0.0";
const SPACE_TYPES = new Set([
  "start",
  "deed",
  "eventDraw",
  "fee",
  "rest",
  "detention",
  "sendToDetention",
]);
const DEED_CATEGORIES = new Set(["district", "transit", "utility"]);

export interface ValidationIssue {
  readonly code: string;
  readonly message: string;
  /** Dotted path into the bundle, for a fixable error message. */
  readonly path: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOwn = (value: UnknownRecord, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const isSafeInteger = (value: unknown): value is number => Number.isSafeInteger(value);

/**
 * Validates a bundle's referential integrity, numeric data, closed effect DSL,
 * and variant bounds. The `production` option also refuses scaffolding content.
 */
export function validateBundle(
  bundle: ContentBundle,
  options: { readonly production: boolean } = { production: false },
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const fail = (code: string, path: string, message: string) =>
    issues.push({ code, path, message });
  const idMessage = (message: string, id: string) => `${message} Offending canonical ID: ${id}.`;

  if (options.production && bundle.provenance.status === "PLACEHOLDER_NOT_FOR_RELEASE") {
    fail(
      "PLACEHOLDER_IN_PRODUCTION",
      "provenance.status",
      "Scaffolding content cannot be served in production. See CONTENT-008.",
    );
  }

  if (bundle.hash !== canonicalHashBundle(bundle)) {
    fail(
      "BUNDLE_HASH_MISMATCH",
      "hash",
      "Recorded bundle hash does not match canonical content. See CONTENT-001.",
    );
  }

  // --- Unique IDs and basic collections (CONTENT-009) --------------------
  const collectIds = (
    values: readonly UnknownRecord[],
    collection: string,
    idKey: string,
  ): Set<string> => {
    const ids = new Set<string>();
    const duplicateCodes: Readonly<Record<string, string>> = {
      spaces: "DUPLICATE_SPACE_ID",
      deeds: "DUPLICATE_DEED_ID",
      districts: "DUPLICATE_DISTRICT_ID",
      decks: "DUPLICATE_DECK_ID",
    };
    for (const value of values) {
      const id = value[idKey];
      if (typeof id !== "string" || id.length === 0) {
        fail(
          "INVALID_ID",
          `${collection}.${String(id)}`,
          "Every entity needs a non-empty canonical ID.",
        );
        continue;
      }
      if (ids.has(id)) {
        fail(
          duplicateCodes[collection] ?? "DUPLICATE_ID",
          `${collection}.${id}`,
          idMessage("Canonical IDs must be unique.", id),
        );
      }
      ids.add(id);
    }
    return ids;
  };

  const spaces: readonly BoardSpace[] = Array.isArray(bundle.spaces) ? bundle.spaces : [];
  const deeds: readonly Deed[] = Array.isArray(bundle.deeds) ? bundle.deeds : [];
  const districts: readonly District[] = Array.isArray(bundle.districts) ? bundle.districts : [];
  const decks: readonly Deck[] = Array.isArray(bundle.decks) ? bundle.decks : [];
  const spaceIds = collectIds(spaces as unknown as readonly UnknownRecord[], "spaces", "spaceId");
  const deedIds = collectIds(deeds as unknown as readonly UnknownRecord[], "deeds", "deedId");
  const districtIds = collectIds(
    districts as unknown as readonly UnknownRecord[],
    "districts",
    "districtId",
  );
  const deckIds = collectIds(decks as unknown as readonly UnknownRecord[], "decks", "deckId");
  const cardIds = new Set<string>();

  for (const deck of decks) {
    const deckRecord = deck as unknown as UnknownRecord;
    const deckId = typeof deckRecord.deckId === "string" ? deckRecord.deckId : "unknown-deck";
    const cards = Array.isArray(deckRecord.cards) ? deckRecord.cards : [];
    for (const card of cards) {
      if (!isRecord(card)) {
        fail("INVALID_CARD", `decks.${deckId}.cards`, "Cards must be objects.");
        continue;
      }
      const cardId = card.cardId;
      if (typeof cardId !== "string" || cardId.length === 0) {
        fail("INVALID_ID", `decks.${deckId}.cards`, "Every card needs a non-empty canonical ID.");
        continue;
      }
      if (cardIds.has(cardId)) {
        fail(
          "DUPLICATE_CARD_ID",
          `decks.${deckId}.cards.${cardId}`,
          idMessage("Card IDs must be unique across decks.", cardId),
        );
      }
      cardIds.add(cardId);
    }
  }

  // --- Numeric primitive helpers (CONTENT-005, CONTENT-009) --------------
  const requireInteger = (value: unknown, path: string, id: string, label: string) => {
    if (!Number.isSafeInteger(value) || (label !== "inventoryDelta" && (value as number) < 0)) {
      fail(
        "NON_INTEGER_VALUE",
        path,
        idMessage(`${label} must be a non-negative safe integer in minor units.`, id),
      );
      return false;
    }
    return true;
  };
  const requireMoney = (value: unknown, path: string, id: string, label: string) => {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
      fail(
        "NON_INTEGER_MONEY",
        path,
        idMessage(`${label} must be a non-negative safe integer in minor units.`, id),
      );
      return false;
    }
    return true;
  };

  // --- Route topology and effects (CONTENT-002, CONTENT-003) --------------
  for (const space of spaces) {
    const spaceId = typeof space.spaceId === "string" ? space.spaceId : "unknown-space";
    if (!spaceIds.has(space.next)) {
      fail(
        "MISSING_ROUTE_TARGET",
        `spaces.${spaceId}.next`,
        `Route target ${String(space.next)} does not exist for space ${spaceId}. Offending canonical IDs: ${spaceId}, ${String(space.next)}.`,
      );
    }
    if (!Number.isSafeInteger(space.routeIndex) || space.routeIndex < 0) {
      fail(
        "INVALID_ROUTE_INDEX",
        `spaces.${spaceId}.routeIndex`,
        idMessage("Route index must be a non-negative safe integer.", spaceId),
      );
    }
    if (
      !isRecord(space.layout) ||
      !Number.isFinite(space.layout.x) ||
      !Number.isFinite(space.layout.y)
    ) {
      fail(
        "INVALID_LAYOUT",
        `spaces.${spaceId}.layout`,
        idMessage("Layout coordinates must be finite numbers.", spaceId),
      );
    }
    if (!SPACE_TYPES.has(space.type)) {
      fail(
        "INVALID_SPACE_TYPE",
        `spaces.${spaceId}.type`,
        idMessage("Space type is not in the supported set.", spaceId),
      );
    }
    if (space.type === "deed") {
      if (space.deedId === undefined || !deedIds.has(space.deedId)) {
        fail(
          "MISSING_DEED",
          `spaces.${spaceId}.deedId`,
          idMessage("Deed space references no valid deed.", spaceId),
        );
      }
    } else if (space.deedId !== undefined) {
      fail(
        "UNEXPECTED_DEED",
        `spaces.${spaceId}.deedId`,
        idMessage("Only deed spaces may reference a deed.", spaceId),
      );
    }
  }

  if (!spaceIds.has(bundle.startSpaceId)) {
    fail(
      "MISSING_START",
      "startSpaceId",
      idMessage("Start space does not exist.", bundle.startSpaceId),
    );
  } else {
    const start = spaces.find((space) => space.spaceId === bundle.startSpaceId);
    if (start?.type !== "start") {
      fail(
        "INVALID_START",
        "startSpaceId",
        idMessage("Start ID must reference a start space.", bundle.startSpaceId),
      );
    }
  }
  if (!spaceIds.has(bundle.detentionSpaceId)) {
    fail(
      "MISSING_DETENTION",
      "detentionSpaceId",
      idMessage("Detention space does not exist.", bundle.detentionSpaceId),
    );
  } else {
    const detention = spaces.find((space) => space.spaceId === bundle.detentionSpaceId);
    if (detention?.type !== "detention") {
      fail(
        "INVALID_DETENTION",
        "detentionSpaceId",
        idMessage("Detention ID must reference a detention space.", bundle.detentionSpaceId),
      );
    }
  }

  const validateEffect = (effect: unknown, path: string, ownerId: string): void => {
    if (!isRecord(effect) || typeof effect.type !== "string") {
      fail(
        "UNREPRESENTABLE_EFFECT",
        path,
        idMessage("Effect is not a supported DSL value.", ownerId),
      );
      return;
    }
    const effectType = effect.type;
    const allowedKeys = {
      PayBank: ["type", "amount", "jackpotEligible"],
      PayEachPlayer: ["type", "amount"],
      CollectBank: ["type", "amount"],
      CollectEachPlayer: ["type", "amount"],
      MoveBy: ["type", "spaces"],
      MoveTo: ["type", "spaceId", "collectStartWhenCrossed"],
      SendToDetention: ["type"],
      Draw: ["type", "deckId"],
      RepairCharge: ["type", "perImprovement", "perLandmark"],
      GrantDetentionReleaseCard: ["type"],
      Choose: ["type", "choiceId"],
    } as const;
    if (!(effectType in allowedKeys)) {
      fail(
        "UNREPRESENTABLE_EFFECT",
        path,
        idMessage(`Effect type ${effectType} is not supported.`, ownerId),
      );
      return;
    }
    const expectedKeys = allowedKeys[effectType as keyof typeof allowedKeys] as readonly string[];
    if (Object.keys(effect).some((key) => !expectedKeys.includes(key))) {
      fail(
        "UNREPRESENTABLE_EFFECT",
        path,
        idMessage(`Effect ${effectType} has unsupported fields.`, ownerId),
      );
    }
    switch (effectType) {
      case "PayBank":
      case "PayEachPlayer":
      case "CollectBank":
      case "CollectEachPlayer":
        requireMoney(effect.amount, `${path}.amount`, ownerId, "Effect amount");
        if (
          effectType === "PayBank" &&
          hasOwn(effect, "jackpotEligible") &&
          typeof effect.jackpotEligible !== "boolean"
        ) {
          fail(
            "UNREPRESENTABLE_EFFECT",
            path,
            idMessage("jackpotEligible must be boolean.", ownerId),
          );
        }
        break;
      case "MoveBy":
        if (!Number.isSafeInteger(effect.spaces)) {
          fail(
            "UNREPRESENTABLE_EFFECT",
            `${path}.spaces`,
            idMessage("MoveBy spaces must be a safe integer.", ownerId),
          );
        }
        break;
      case "MoveTo":
        if (typeof effect.spaceId !== "string" || !spaceIds.has(effect.spaceId)) {
          fail(
            "INVALID_CARD_TARGET",
            `${path}.spaceId`,
            `MoveTo target ${String(effect.spaceId)} does not exist for ${ownerId}. Offending canonical IDs: ${ownerId}, ${String(effect.spaceId)}.`,
          );
        }
        if (typeof effect.collectStartWhenCrossed !== "boolean") {
          fail(
            "UNREPRESENTABLE_EFFECT",
            path,
            idMessage("MoveTo crossing flag must be boolean.", ownerId),
          );
        }
        break;
      case "Draw":
        if (typeof effect.deckId !== "string" || !deckIds.has(effect.deckId)) {
          fail(
            "INVALID_CARD_TARGET",
            `${path}.deckId`,
            `Draw target ${String(effect.deckId)} does not exist for ${ownerId}. Offending canonical IDs: ${ownerId}, ${String(effect.deckId)}.`,
          );
        }
        break;
      case "RepairCharge":
        requireMoney(effect.perImprovement, `${path}.perImprovement`, ownerId, "Repair charge");
        requireMoney(effect.perLandmark, `${path}.perLandmark`, ownerId, "Repair charge");
        break;
      case "Choose":
        if (typeof effect.choiceId !== "string" || effect.choiceId.length === 0) {
          fail(
            "UNREPRESENTABLE_EFFECT",
            path,
            idMessage("Choose requires a canonical choice ID.", ownerId),
          );
        }
        break;
      case "SendToDetention":
      case "GrantDetentionReleaseCard":
        break;
    }
  };

  for (const space of spaces) {
    const spaceId = typeof space.spaceId === "string" ? space.spaceId : "unknown-space";
    const effects: readonly unknown[] = Array.isArray(space.effects) ? space.effects : [];
    if (!Array.isArray(space.effects)) {
      fail(
        "UNREPRESENTABLE_EFFECT",
        `spaces.${spaceId}.effects`,
        idMessage("Effects must be an array.", spaceId),
      );
    }
    effects.forEach((effect, index) =>
      validateEffect(effect, `spaces.${spaceId}.effects.${index}`, spaceId),
    );
  }

  // --- District membership and deed schedules (CONTENT-004, CONTENT-009) -
  const deedSpaceIds = new Set<string>();
  for (const deed of deeds) {
    const deedId = typeof deed.deedId === "string" ? deed.deedId : "unknown-deed";
    if (!DEED_CATEGORIES.has(deed.category)) {
      fail(
        "INVALID_DEED_CATEGORY",
        `deeds.${deedId}.category`,
        idMessage("Deed category is not supported.", deedId),
      );
    }
    requireMoney(deed.price, `deeds.${deedId}.price`, deedId, "Price");
    requireMoney(deed.mortgageValue, `deeds.${deedId}.mortgageValue`, deedId, "Mortgage value");
    requireMoney(
      deed.redemptionCharge,
      `deeds.${deedId}.redemptionCharge`,
      deedId,
      "Redemption charge",
    );
    requireMoney(deed.baseRent, `deeds.${deedId}.baseRent`, deedId, "Base rent");
    const validateRentTable = (
      values: readonly number[] | undefined,
      path: string,
      label: string,
    ) => {
      if (!Array.isArray(values) || values.length < 2) {
        fail(
          "INCOMPLETE_RENT_LEVELS",
          path,
          idMessage(`${label} must include an entry for every supported owner count.`, deedId),
        );
        return;
      }
      values.forEach((value, index) =>
        requireMoney(value, `${path}.${index}`, deedId, `${label} entry`),
      );
    };
    if (deed.category === "district") {
      requireMoney(
        deed.completeDistrictMultiplier,
        `deeds.${deedId}.completeDistrictMultiplier`,
        deedId,
        "Complete district multiplier",
      );
    } else if (deed.category === "transit") {
      validateRentTable(
        deed.transitRentByCount,
        `deeds.${deedId}.transitRentByCount`,
        "Transit rent table",
      );
    } else {
      validateRentTable(
        deed.utilityMultiplierByCount,
        `deeds.${deedId}.utilityMultiplierByCount`,
        "Utility multiplier table",
      );
    }
    if (typeof deed.spaceId !== "string" || !spaceIds.has(deed.spaceId)) {
      fail(
        "MISSING_DEED_SPACE",
        `deeds.${deedId}.spaceId`,
        idMessage("Deed space does not exist.", deedId),
      );
    } else if (deedSpaceIds.has(deed.spaceId)) {
      fail(
        "DUPLICATE_DEED_SPACE",
        `deeds.${deedId}.spaceId`,
        idMessage("A space cannot host multiple deeds.", deedId),
      );
    }
    deedSpaceIds.add(deed.spaceId);
    const space = spaces.find((candidate) => candidate.spaceId === deed.spaceId);
    if (space?.deedId !== deed.deedId) {
      fail(
        "DEED_SPACE_MISMATCH",
        `deeds.${deedId}.spaceId`,
        idMessage("Deed and space references must agree.", deedId),
      );
    }
    if (deed.category === "district") {
      if (deed.transitRentByCount !== undefined || deed.utilityMultiplierByCount !== undefined) {
        fail(
          "UNEXPECTED_RENT_TABLE",
          `deeds.${deedId}`,
          idMessage("District deeds cannot define transit or utility rent tables.", deedId),
        );
      }
      if (deed.districtId === undefined || !districtIds.has(deed.districtId)) {
        fail(
          "INVALID_DISTRICT",
          `deeds.${deedId}.districtId`,
          idMessage("District membership is invalid.", deedId),
        );
      }
      if (
        !requireMoney(
          deed.improvementCost,
          `deeds.${deedId}.improvementCost`,
          deedId,
          "Improvement cost",
        )
      ) {
        fail(
          "INCOMPLETE_RENT_LEVELS",
          `deeds.${deedId}.improvementLevels`,
          idMessage("District deed needs an improvement schedule.", deedId),
        );
      }
      const levels = deed.improvementLevels;
      if (!Array.isArray(levels) || levels.length === 0) {
        fail(
          "INCOMPLETE_RENT_LEVELS",
          `deeds.${deedId}.improvementLevels`,
          idMessage("Rent levels must start at level 1 and be complete.", deedId),
        );
      } else {
        let expectedLevel = 1;
        let cumulativeInventory = 0;
        for (const level of levels) {
          const levelId = `${deedId}-level-${String(level.level)}`;
          if (level.level !== expectedLevel) {
            fail(
              "INCOMPLETE_RENT_LEVELS",
              `deeds.${deedId}.improvementLevels`,
              idMessage("Rent levels must be contiguous from level 1.", levelId),
            );
          }
          requireInteger(
            level.level,
            `deeds.${deedId}.improvementLevels.${level.level}.level`,
            levelId,
            "Level",
          );
          requireMoney(
            level.rent,
            `deeds.${deedId}.improvementLevels.${level.level}.rent`,
            levelId,
            "Rent",
          );
          if (!Number.isSafeInteger(level.inventoryDelta)) {
            fail(
              "NON_INTEGER_VALUE",
              `deeds.${deedId}.improvementLevels.${level.level}.inventoryDelta`,
              idMessage("Inventory delta must be a safe integer.", levelId),
            );
          }
          cumulativeInventory += level.inventoryDelta;
          if (cumulativeInventory < 0) {
            fail(
              "IMPOSSIBLE_INVENTORY",
              `deeds.${deedId}.improvementLevels.${level.level}`,
              idMessage("A level consumes more inventory than the deed can have returned.", deedId),
            );
          }
          expectedLevel += 1;
        }
      }
    } else {
      if (deed.districtId !== undefined) {
        fail(
          "UNEXPECTED_DISTRICT",
          `deeds.${deedId}.districtId`,
          idMessage("Only district deeds belong to a district.", deedId),
        );
      }
      if (deed.improvementCost !== undefined || deed.improvementLevels !== undefined) {
        fail(
          "UNEXPECTED_IMPROVEMENT_SCHEDULE",
          `deeds.${deedId}`,
          idMessage("Only district deeds may have improvement schedules.", deedId),
        );
      }
      if (deed.category === "transit" && deed.utilityMultiplierByCount !== undefined) {
        fail(
          "UNEXPECTED_RENT_TABLE",
          `deeds.${deedId}.utilityMultiplierByCount`,
          idMessage("Transit deeds cannot define utility multipliers.", deedId),
        );
      }
      if (deed.category === "utility" && deed.transitRentByCount !== undefined) {
        fail(
          "UNEXPECTED_RENT_TABLE",
          `deeds.${deedId}.transitRentByCount`,
          idMessage("Utility deeds cannot define transit rent tables.", deedId),
        );
      }
      if (deed.completeDistrictMultiplier !== undefined) {
        fail(
          "UNEXPECTED_RENT_TABLE",
          `deeds.${deedId}.completeDistrictMultiplier`,
          idMessage("Only district deeds may define a complete-district multiplier.", deedId),
        );
      }
    }
  }

  for (const district of districts) {
    const districtId =
      typeof district.districtId === "string" ? district.districtId : "unknown-district";
    const districtDeedIds = new Set<string>();
    for (const deedId of district.deedIds) {
      if (!deedIds.has(deedId)) {
        fail(
          "MISSING_DISTRICT_DEED",
          `districts.${districtId}`,
          idMessage("District names an unknown deed.", districtId),
        );
      }
      if (districtDeedIds.has(deedId)) {
        fail(
          "DUPLICATE_DISTRICT_DEED",
          `districts.${districtId}`,
          idMessage("District deed IDs must be unique.", deedId),
        );
      }
      districtDeedIds.add(deedId);
      const deed = deeds.find((candidate) => candidate.deedId === deedId);
      if (deed?.districtId !== district.districtId) {
        fail(
          "INVALID_DISTRICT",
          `districts.${districtId}.deedIds`,
          idMessage("District and deed membership must agree.", deedId),
        );
      }
    }
  }

  // --- Deck card effects (CONTENT-006, CONTENT-009) ----------------------
  for (const deck of decks) {
    const deckId = typeof deck.deckId === "string" ? deck.deckId : "unknown-deck";
    const cards = Array.isArray(deck.cards) ? deck.cards : [];
    for (const card of cards) {
      if (!isRecord(card)) continue;
      const cardId = typeof card.cardId === "string" ? card.cardId : `${deckId}-unknown-card`;
      const effects = Array.isArray(card.effects) ? card.effects : [];
      if (!Array.isArray(card.effects)) {
        fail(
          "UNREPRESENTABLE_EFFECT",
          `decks.${deckId}.cards.${cardId}.effects`,
          idMessage("Effects must be an array.", cardId),
        );
      }
      effects.forEach((effect, index) =>
        validateEffect(effect, `decks.${deckId}.cards.${cardId}.effects.${index}`, cardId),
      );
    }
  }

  // --- Economy, inventory, and variant bounds (CONTENT-005, CONTENT-007) -
  const economy = bundle.economy as unknown as UnknownRecord;
  const economyId = "economy";
  requireMoney(economy.startingCash, "economy.startingCash", economyId, "Starting cash");
  requireMoney(economy.startPayment, "economy.startPayment", economyId, "Start payment");
  requireMoney(
    economy.detentionReleaseFee,
    "economy.detentionReleaseFee",
    economyId,
    "Detention release fee",
  );
  requireInteger(
    economy.detentionMaxAttempts,
    "economy.detentionMaxAttempts",
    economyId,
    "Detention attempts",
  );
  if (
    !Number.isSafeInteger(economy.detentionMaxAttempts) ||
    (economy.detentionMaxAttempts as number) < 1
  ) {
    fail(
      "VARIANT_OUT_OF_BOUNDS",
      "economy.detentionMaxAttempts",
      "Detention attempts must be at least one.",
    );
  }
  if (typeof economy.currencyLabel !== "string" || economy.currencyLabel.length === 0) {
    fail("INVALID_CURRENCY_LABEL", "economy.currencyLabel", "Currency label must be non-empty.");
  }
  const inventory = isRecord(economy.improvementInventory) ? economy.improvementInventory : {};
  let totalInventory = 0;
  for (const [kind, quantity] of Object.entries(inventory)) {
    if (!isSafeInteger(quantity) || quantity < 0) {
      fail(
        "IMPOSSIBLE_INVENTORY",
        `economy.improvementInventory.${kind}`,
        idMessage("Inventory quantity must be a non-negative safe integer.", kind),
      );
    } else {
      totalInventory += quantity;
    }
  }
  if (Object.keys(inventory).length === 0) {
    fail(
      "IMPOSSIBLE_INVENTORY",
      "economy.improvementInventory",
      "At least one finite improvement inventory quantity is required.",
    );
  }
  // Each schedule uses the same aggregate inventory counter in the current
  // content schema. This catches a bundle that can never reach its declared
  // levels while leaving VAR-008 to the engine.
  const peakDemand = deeds.reduce((total, deed) => {
    if (deed.category !== "district" || !Array.isArray(deed.improvementLevels)) return total;
    let cumulative = 0;
    let deedPeak = 0;
    for (const level of deed.improvementLevels) {
      if (isSafeInteger(level.inventoryDelta)) {
        cumulative += level.inventoryDelta;
        deedPeak = Math.max(deedPeak, cumulative);
      }
    }
    return total + deedPeak;
  }, 0);
  if (peakDemand > totalInventory) {
    fail(
      "IMPOSSIBLE_INVENTORY",
      "economy.improvementInventory",
      idMessage(
        "Finite inventory cannot satisfy every declared improvement schedule.",
        "economy.improvementInventory",
      ),
    );
  }
  if (!isRecord(economy.improvementResaleRatio)) {
    fail(
      "VARIANT_OUT_OF_BOUNDS",
      "economy.improvementResaleRatio",
      "Resale ratio must define a positive numerator and denominator.",
    );
  } else {
    const { numerator, denominator } = economy.improvementResaleRatio;
    if (
      !isSafeInteger(numerator) ||
      !isSafeInteger(denominator) ||
      numerator < 0 ||
      denominator <= 0
    ) {
      fail(
        "VARIANT_OUT_OF_BOUNDS",
        "economy.improvementResaleRatio",
        "Resale ratio must define a positive denominator and integer values.",
      );
    }
  }
  if (bundle.variantSchemaVersion !== SUPPORTED_VARIANT_SCHEMA_VERSION) {
    fail(
      "VARIANT_OUT_OF_BOUNDS",
      "variantSchemaVersion",
      `Variant schema ${String(bundle.variantSchemaVersion)} is unsupported; expected ${SUPPORTED_VARIANT_SCHEMA_VERSION}.`,
    );
  }
  if (
    !Number.isSafeInteger(economy.startingAssetDealCount) ||
    (economy.startingAssetDealCount as number) < 0
  ) {
    fail(
      "VARIANT_OUT_OF_BOUNDS",
      "economy.startingAssetDealCount",
      "Starting asset deal count must be a non-negative safe integer.",
    );
  } else if ((economy.startingAssetDealCount as number) > deeds.length) {
    fail(
      "VARIANT_OUT_OF_BOUNDS",
      "economy.startingAssetDealCount",
      idMessage(
        "Starting asset deal count exceeds available deeds.",
        "economy.startingAssetDealCount",
      ),
    );
  }

  // --- Jackpot references (CONTENT-007) ----------------------------------
  for (const spaceId of bundle.jackpotEligibleSpaceIds) {
    if (!spaceIds.has(spaceId)) {
      fail(
        "MISSING_JACKPOT_SPACE",
        "jackpotEligibleSpaceIds",
        idMessage("Jackpot-eligible space does not exist.", spaceId),
      );
    }
    const space = spaces.find((candidate) => candidate.spaceId === spaceId);
    if (space?.type !== "fee") {
      fail(
        "VARIANT_OUT_OF_BOUNDS",
        `jackpotEligibleSpaceIds.${spaceId}`,
        idMessage("Jackpot eligibility must name a fee space.", spaceId),
      );
    }
  }

  return { valid: issues.length === 0, issues };
}
