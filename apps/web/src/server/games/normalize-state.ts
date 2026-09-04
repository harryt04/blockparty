import "server-only";

import type { GameState } from "@blockparty/game-engine";

/**
 * MongoDB can return BSON null for optional fields written as JavaScript
 * `undefined` by older clients. The engine's state contract uses `undefined`
 * for absence, so normalize that legacy representation at the server
 * boundary before projection or command resolution. See ENG-006 and ENG-022.
 */
export function normalizeGameState(state: GameState): GameState {
  return normalizeNulls(state) as GameState;
}

function normalizeNulls(value: unknown): unknown {
  if (value === null) return undefined;
  if (Array.isArray(value)) return value.map(normalizeNulls);
  if (typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      normalizeNulls(entry),
    ]),
  );
}
