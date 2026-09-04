import { VARIANT_KEYS, VARIANT_SCHEMA_VERSION, type VariantKey } from "@blockparty/contracts";
import { DEED_CATEGORY_DISPLAY, DISPLAY_NAMES } from "@/components/display-names";
import { VARIANT_COPY } from "@/components/game/variant-copy";

export { VARIANT_KEYS, VARIANT_SCHEMA_VERSION, VARIANT_COPY };

export const DISPLAY_TERM_GUIDE = [
  { label: DISPLAY_NAMES.deed, explanation: "A purchasable Address on the route." },
  {
    label: DISPLAY_NAMES.district,
    explanation: "A group of related Addresses that can form a complete Block.",
  },
  {
    label: DISPLAY_NAMES.bank,
    explanation: "The Committee supplies unowned Addresses, money, and improvements.",
  },
  {
    label: DISPLAY_NAMES.start,
    explanation: "Sunup pays the documented amount when movement passes or lands there.",
  },
  {
    label: DISPLAY_NAMES.rest,
    explanation: "The Stoop is the rest space and may hold a variant-controlled jackpot.",
  },
  {
    label: DISPLAY_NAMES.detention,
    explanation:
      "Noise Complaint is the detained state; the release choices are shown when needed.",
  },
  {
    label: DEED_CATEGORY_DISPLAY.transit.label,
    explanation: "A Food Truck is a transit Address with its category rent rule.",
  },
  {
    label: DEED_CATEGORY_DISPLAY.utility.label,
    explanation: "A Hookup is a utility Address whose rent uses the authoritative roll.",
  },
  {
    label: DEED_CATEGORY_DISPLAY.district.label,
    explanation: "A Block Address follows district ownership, improvement, and rent rules.",
  },
  {
    label: DISPLAY_NAMES.obligation,
    explanation:
      "Owed is an unresolved amount that the debtor must settle or resolve with legal liquidity.",
  },
] as const;

/** Display labels can intentionally repeat across categories (for example, Block). */
export function displayTermKey(label: string, index: number): string {
  return `${label}:${index}`;
}

export const INTERACTION_GUIDE = [
  {
    heading: "Take a turn",
    text: "The active player rolls or chooses the next legal action. Everyone else sees who the app is waiting for.",
  },
  {
    heading: "Inspect the route",
    text: "Open any stop to read its category, owner, price, status, and public economic details. The ordered board list is equivalent to the map.",
  },
  {
    heading: "Resolve a landing",
    text: "The server resolves movement and effects in data order. A purchase, auction, rent payment, or choice appears before the next action.",
  },
  {
    heading: "Manage and trade",
    text: "Owners can use the displayed legal actions to improve, sell, mortgage, redeem, or make a named-player trade when the authoritative state allows it.",
  },
  {
    heading: "Resolve Owed",
    text: "Only the debtor receives payment and legal-liquidity controls. If the debt cannot be resolved, bankruptcy and elimination follow the rules.",
  },
  {
    heading: "Stay connected",
    text: "Live play needs a network. Reconnecting shows the last confirmed state and pauses required play; it never submits an invented action.",
  },
] as const;

export function variantDetails(key: VariantKey) {
  return VARIANT_COPY[key];
}
