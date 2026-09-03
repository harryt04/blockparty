/**
 * The presentation boundary. See docs/product/glossary.md.
 *
 * Code, commands, events, wire fields, database fields, content IDs, analytics
 * properties, and test fixtures use the CANONICAL WIRE LAYER. This module maps
 * that layer to what a player reads, and it is read in ONE direction only.
 *
 * A display name in a command, event, fixture, or content ID is a defect.
 * A component renders `district` as "Block"; it never receives "Block" from
 * the server. Changing a name here must never require a schema migration or a
 * content-version change.
 */

/** Canonical concept -> Blockparty display name. */
export const DISPLAY_NAMES = {
  bank: "The Committee",
  bankruptcy: "Packed Up",
  deed: "Address",
  detention: "Noise Complaint",
  detentionReleaseCard: "Neighborly Word",
  district: "Block",
  hostCapability: "Host controls",
  improvement: "Stall",
  landmark: "Block Stage",
  invite: "Invite",
  obligation: "Owed",
  redeemMortgage: "Buy Back",
  rest: "The Stoop",
  seat: "Seat",
  start: "Sunup",
  transit: "Food Truck",
  utility: "Hookup",
} as const satisfies Record<string, string>;

export type CanonicalTerm = keyof typeof DISPLAY_NAMES;

export function displayName(term: CanonicalTerm): string {
  return DISPLAY_NAMES[term];
}

/** Plural forms, where the plural is not a simple "+s". */
export const DISPLAY_PLURALS: Partial<Record<CanonicalTerm, string>> = {
  deed: "Addresses",
  district: "Blocks",
  detentionReleaseCard: "Neighborly Words",
};

export function displayPlural(term: CanonicalTerm): string {
  return DISPLAY_PLURALS[term] ?? `${DISPLAY_NAMES[term]}s`;
}

/** Space category -> display label and its stable icon key. DS-040. */
export const SPACE_CATEGORY_DISPLAY = {
  start: { label: "Sunup", icon: "sunrise" },
  deed: { label: "Address", icon: "door-open" },
  eventDraw: { label: "Taped Flyer", icon: "scroll-text" },
  fee: { label: "Permit Fee", icon: "receipt" },
  rest: { label: "The Stoop", icon: "armchair" },
  detention: { label: "Noise Complaint", icon: "volume-off" },
  sendToDetention: { label: "Complaint Called", icon: "megaphone" },
} as const;

export const DEED_CATEGORY_DISPLAY = {
  district: { label: "Block", icon: "layout-grid" },
  transit: { label: "Food Truck", icon: "truck" },
  utility: { label: "Hookup", icon: "plug" },
} as const;

/**
 * Formats integer minor units for display. Money is never a float in the
 * wire layer; the conversion happens here and nowhere else.
 */
export function formatMoney(minorUnits: number, currencyLabel = "credits"): string {
  const major = minorUnits / 100;
  const formatted = major.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(major) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${currencyLabel}`;
}
