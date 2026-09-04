import type { VariantKey } from "@blockparty/contracts";

/** Presentation copy for the exactly eight documented toggles. VAR-013. */
export const VARIANT_COPY: Record<
  VariantKey,
  { label: string; effect: string; warning: string; interaction: string }
> = {
  restSpaceJackpot: {
    label: "Jackpot on The Stoop",
    effect: "Selected Permit Fees build a pot paid to the player who lands on The Stoop.",
    warning: "Moves fees into a chance-based payout and can create cash spikes.",
    interaction:
      "Only board-data fees marked jackpot-eligible fund the pot; rent, purchases, mortgages, and ordinary card payments do not.",
  },
  doubleStartOnExactLanding: {
    label: "Double pay for landing exactly on Sunup",
    effect: "A normal dice roll that finishes exactly on Sunup pays two Sunup amounts.",
    warning: "Exact landings inject more money into play.",
    interaction:
      "It does not apply to forced or backward movement, being sent to Noise Complaint, or starting on Sunup; it can stack with the double-ones bonus.",
  },
  noAuctionAfterDeclinedAcquisition: {
    label: "No auction after a declined Address",
    effect:
      "An unowned Address returns to The Committee after its landing offer is declined or unaffordable.",
    warning: "Reduces early liquidity pressure and can lengthen games.",
    interaction:
      "This changes automatic landing auctions only; an auction caused by bank-directed bankruptcy still runs.",
  },
  noIncomeWhileDetained: {
    label: "No income during a Noise Complaint",
    effect: "A detained owner does not collect rent or card-directed income.",
    warning: "A detained player cannot collect income until released.",
    interaction:
      "Sunup payments, sale and mortgage proceeds, jackpot payouts, agreed trade cash, and debt collection are not suppressed.",
  },
  bonusForMatchingOnes: {
    label: "Bonus for rolling double ones",
    effect: "A normal turn roll showing two ones pays the configured bonus once.",
    warning: "Adds a rare cash injection.",
    interaction:
      "The bonus still applies on the roll that sends a player to Noise Complaint for a third consecutive match; it does not apply to release attempts or utility rent rolls.",
  },
  startingAssetsDealt: {
    label: "Deal Addresses at the start",
    effect:
      "Each seat receives the data-defined number of eligible bank-owned Addresses without paying.",
    warning: "Speeds ownership and can make starting opportunities less even.",
    interaction:
      "Addresses are dealt round-robin after seat order is set, with recorded random order; no cards, cash, mortgages, or improvements are dealt.",
  },
  relaxedEvenBuilding: {
    label: "Build without the even-spread rule",
    effect:
      "A player may buy or sell improvements on any eligible Address without keeping a one-level spread in its Block.",
    warning: "Improvement levels can be concentrated and create sharper rent swings.",
    interaction:
      "Complete Block ownership, unmortgaged deeds, maximum level, cost, and finite inventory still apply unless the inventory option is also enabled.",
  },
  unlimitedImprovementInventory: {
    label: "Unlimited Stalls and Block Stages",
    effect: "Improvement purchases are not blocked by finite bank inventory.",
    warning: "Removes an important scarcity lever.",
    interaction:
      "Purchases and sales remain recorded; the displayed bank inventory says unlimited rather than showing a misleading finite count.",
  },
};
