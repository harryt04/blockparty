import {
  SHORT_GAME_CONFIGURATION,
  STANDARD_CONFIGURATION,
  VARIANT_KEYS,
  type LobbyProjection,
  type RulesConfiguration,
  type VariantKey,
} from "@blockparty/contracts";
import { CLASSIC_BUNDLE } from "@blockparty/game-content";
import { VARIANT_COPY } from "./variant-copy";

export const CLASSIC_LOBBY_SPACES = CLASSIC_BUNDLE.spaces;

export type LobbySeatKind = LobbyProjection["seats"][number]["kind"];

export function seatKindLabel(kind: LobbySeatKind): string {
  return kind === "open" ? "Open Human" : kind === "bot" ? "Computer" : "Human";
}

export function seatStatusLabel(kind: LobbySeatKind, connected: boolean): string {
  if (kind === "open") return "Waiting for a player";
  return connected ? "Connected" : "Waiting to connect";
}

export function openSeatCount(lobby: LobbyProjection): number {
  return lobby.seats.filter((seat) => seat.kind === "open").length;
}

export function startCondition(lobby: LobbyProjection): string {
  const open = openSeatCount(lobby);
  if (open === 0) return "Every planned Human seat is claimed. The host can start.";
  return `Waiting for ${open} Human seat${open === 1 ? "" : "s"}.`;
}

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
