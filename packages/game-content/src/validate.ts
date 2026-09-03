/**
 * Build-time content validation. See CONTENT-009.
 *
 * A bundle is not selectable until it passes. The checks below are the
 * structural subset; the numerical, effect-reachability, and provenance
 * checks are marked TODO and belong to the content-authoring ticket.
 */
import type { ContentBundle } from "./types";

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

/**
 * Validates a bundle's referential integrity and route topology.
 *
 * `production` refuses a placeholder bundle outright: scaffolding content has
 * no balance evidence and no provenance, so it must never reach a player.
 */
export function validateBundle(
  bundle: ContentBundle,
  options: { readonly production: boolean } = { production: false },
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const fail = (code: string, path: string, message: string) =>
    issues.push({ code, path, message });

  if (options.production && bundle.provenance.status === "PLACEHOLDER_NOT_FOR_RELEASE") {
    fail(
      "PLACEHOLDER_IN_PRODUCTION",
      "provenance.status",
      "Scaffolding content cannot be served in production. See CONTENT-008.",
    );
  }

  // --- Unique IDs (CONTENT-009) -------------------------------------------
  const spaceIds = new Set<string>();
  for (const space of bundle.spaces) {
    if (spaceIds.has(space.spaceId)) {
      fail("DUPLICATE_SPACE_ID", `spaces.${space.spaceId}`, "Space IDs must be unique.");
    }
    spaceIds.add(space.spaceId);
  }

  const deedIds = new Set<string>();
  for (const deed of bundle.deeds) {
    if (deedIds.has(deed.deedId)) {
      fail("DUPLICATE_DEED_ID", `deeds.${deed.deedId}`, "Deed IDs must be unique.");
    }
    deedIds.add(deed.deedId);
  }

  // --- Route topology (CONTENT-002) ---------------------------------------
  for (const space of bundle.spaces) {
    if (!spaceIds.has(space.next)) {
      fail("MISSING_ROUTE_TARGET", `spaces.${space.spaceId}.next`, "Route target does not exist.");
    }
    if (space.type === "deed" && (space.deedId === undefined || !deedIds.has(space.deedId))) {
      fail("MISSING_DEED", `spaces.${space.spaceId}.deedId`, "Deed space references no valid deed.");
    }
  }

  if (!spaceIds.has(bundle.startSpaceId)) {
    fail("MISSING_START", "startSpaceId", "Start space does not exist.");
  }
  if (!spaceIds.has(bundle.detentionSpaceId)) {
    fail("MISSING_DETENTION", "detentionSpaceId", "Detention space does not exist.");
  }

  // --- District membership (CONTENT-004) ----------------------------------
  const districtIds = new Set(bundle.districts.map((district) => district.districtId));
  for (const deed of bundle.deeds) {
    if (deed.category === "district") {
      if (deed.districtId === undefined || !districtIds.has(deed.districtId)) {
        fail("INVALID_DISTRICT", `deeds.${deed.deedId}.districtId`, "District membership is invalid.");
      }
    } else if (deed.districtId !== undefined) {
      fail("UNEXPECTED_DISTRICT", `deeds.${deed.deedId}.districtId`, "Only district deeds belong to a district.");
    }
  }
  for (const district of bundle.districts) {
    for (const deedId of district.deedIds) {
      if (!deedIds.has(deedId)) {
        fail("MISSING_DISTRICT_DEED", `districts.${district.districtId}`, "District names an unknown deed.");
      }
    }
  }

  // --- Integer money (CONTENT-005) ----------------------------------------
  const requireInteger = (value: number, path: string) => {
    if (!Number.isSafeInteger(value) || value < 0) {
      fail("NON_INTEGER_MONEY", path, "Money is a non-negative safe integer in minor units.");
    }
  };
  for (const deed of bundle.deeds) {
    requireInteger(deed.price, `deeds.${deed.deedId}.price`);
    requireInteger(deed.mortgageValue, `deeds.${deed.deedId}.mortgageValue`);
    requireInteger(deed.redemptionCharge, `deeds.${deed.deedId}.redemptionCharge`);
    requireInteger(deed.baseRent, `deeds.${deed.deedId}.baseRent`);
  }
  requireInteger(bundle.economy.startingCash, "economy.startingCash");
  requireInteger(bundle.economy.startPayment, "economy.startPayment");
  requireInteger(bundle.economy.detentionReleaseFee, "economy.detentionReleaseFee");

  // --- Jackpot eligibility (CONTENT-007) ----------------------------------
  for (const spaceId of bundle.jackpotEligibleSpaceIds) {
    if (!spaceIds.has(spaceId)) {
      fail("MISSING_JACKPOT_SPACE", "jackpotEligibleSpaceIds", "Jackpot-eligible space does not exist.");
    }
  }

  // TODO: incomplete rent levels, impossible inventory, unrepresentable
  // effects, invalid card targets, and variant data outside schema bounds.
  // CONTENT-009.

  return { valid: issues.length === 0, issues };
}
