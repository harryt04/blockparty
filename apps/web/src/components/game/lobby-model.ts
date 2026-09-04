import {
  SHORT_GAME_CONFIGURATION,
  STANDARD_CONFIGURATION,
  VARIANT_KEYS,
  type LobbyProjection,
  type RulesConfiguration,
  type VariantKey,
} from "@blockparty/contracts";

export const LOBBY_VARIANT_COPY: Record<VariantKey, { label: string; warning: string }> = {
  restSpaceJackpot: {
    label: "Jackpot on The Stoop",
    warning: "Fees build a pot that one landing collects.",
  },
  doubleStartOnExactLanding: {
    label: "Double pay for landing exactly on Sunup",
    warning: "Exact landings put more money into play.",
  },
  noAuctionAfterDeclinedAcquisition: {
    label: "No auction after a declined Address",
    warning: "Declined Addresses return to the Committee instead.",
  },
  noIncomeWhileDetained: {
    label: "No income during a Noise Complaint",
    warning: "Detained players do not collect income.",
  },
  bonusForMatchingOnes: {
    label: "Bonus for rolling double ones",
    warning: "Matching ones add a rare bonus payment.",
  },
  startingAssetsDealt: {
    label: "Deal Addresses at the start",
    warning: "Starting ownership is quicker and less even.",
  },
  relaxedEvenBuilding: {
    label: "Build without the even-spread rule",
    warning: "Improvements can be concentrated in one Block.",
  },
  unlimitedImprovementInventory: {
    label: "Unlimited Stalls and Block Stages",
    warning: "Improvement scarcity no longer limits purchases.",
  },
};

export function lobbyIsReady(lobby: LobbyProjection): boolean {
  return lobby.canStart && lobby.seats.every((seat) => seat.kind !== "open");
}

export function configurationValues(
  configuration: RulesConfiguration,
): Record<VariantKey, boolean> {
  return Object.fromEntries(VARIANT_KEYS.map((key) => [key, configuration[key]])) as Record<
    VariantKey,
    boolean
  >;
}

export function inviteUrl(path: string, origin: string): string | undefined {
  if (!path.startsWith("/join/")) return undefined;
  return new URL(path, origin).toString();
}

export function presetConfiguration(preset: "standard" | "short-game") {
  return preset === "standard" ? STANDARD_CONFIGURATION : SHORT_GAME_CONFIGURATION;
}
