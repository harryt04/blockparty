/**
 * Post-resolution invariants. See ENG-023.
 *
 * A failure here is a programmer or data-corruption signal, not a client
 * error. The caller halts the command transaction, alerts, and retains the
 * offending journal context. It never returns the failure to the player as a
 * rejected action.
 */
import type { GameState } from "./index";

export interface InvariantViolation {
  readonly code: string;
  readonly message: string;
}

/**
 * Validates after every resolution and every replay.
 *
 * TODO(ENG-023): implement each check as its rule lands.
 *
 *   - exactly one phase-compatible priority actor, unless lobby or finished;
 *   - seat IDs and deed ownership are unique; any number of active seats may
 *     share a board position;
 *   - money and obligations use safe integers; cash never goes negative;
 *   - asset, improvement, mortgage, and deck-card transitions meet the RuleSet;
 *   - auction high bid and bidder are coherent; a passed bidder cannot bid;
 *   - improvement levels conserve each finite inventory type, unless VAR-008;
 *   - trades are escrow-free: assets stay owned until atomic acceptance;
 *   - no eliminated seat receives a turn;
 *   - a finished game meets the configured winner condition;
 *   - contentVersion and stateSchemaVersion are supported.
 */
export function checkInvariants(_state: GameState): readonly InvariantViolation[] {
  return [];
}
