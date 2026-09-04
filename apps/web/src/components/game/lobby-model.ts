import {
  SHORT_GAME_CONFIGURATION,
  STANDARD_CONFIGURATION,
  VARIANT_KEYS,
  type LobbyProjection,
  type RulesConfiguration,
  type VariantKey,
} from "@blockparty/contracts";
import { VARIANT_COPY } from "./variant-copy";

export const LOBBY_VARIANT_COPY: Record<VariantKey, { label: string; warning: string }> =
  Object.fromEntries(
    VARIANT_KEYS.map((key) => [
      key,
      { label: VARIANT_COPY[key].label, warning: VARIANT_COPY[key].warning },
    ]),
  ) as Record<VariantKey, { label: string; warning: string }>;

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
