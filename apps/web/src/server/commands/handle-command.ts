import "server-only";

/**
 * THE single authoritative command path. See ENG-015 and the flow in ENG-002.
 *
 * Every lobby, gameplay, host, replacement, reclaim, transfer, and
 * EndNoContest command runs through here. There is no second path and no rule
 * shortcut around the engine.
 *
 * MongoDB optimistic concurrency is the serialization mechanism: the snapshot
 * update carries the prior aggregate version in its predicate, and each event
 * has a unique (gameId, sequence) key. A concurrent writer therefore commits
 * one version and the other aborts or returns STALE_VERSION. State is never
 * silently overwritten.
 */
import type { CommandEnvelope, ErrorCode } from "@blockparty/contracts";
import type { AuthenticatedSeat } from "../auth/session";

export interface CommandAccepted {
  readonly ok: true;
  readonly commandId: string;
  readonly aggregateVersion: number;
  readonly firstSequence: number;
  readonly lastSequence: number;
}

export interface CommandRejected {
  readonly ok: false;
  readonly code: ErrorCode;
  readonly reason: string;
}

export type CommandOutcome = CommandAccepted | CommandRejected;

/**
 * Runs one command in one MongoDB session transaction.
 *
 * TODO(ENG-015): implement, in this exact order.
 *
 *  1. Parse the request with CommandEnvelope; enforce body, nesting, and
 *     payload limits. (The caller does this and hands us the parsed envelope.)
 *  2. Authenticate the seat, host, or reclaim cookie. Derive the actor and the
 *     capability kind from the SERVER credential. Ignore every client-provided
 *     identity, seat, phase, and authorization claim.
 *  3. Start a session and a transaction. Read the command receipt FIRST, then
 *     load the game aggregate with its captured content, rules, and state
 *     versions.
 *  4. Reject an expired, terminal, unsupported, unauthorized, or stale
 *     aggregate. `expectedVersion` must match the stored aggregate version.
 *  5. Call the pure engine with the immutable snapshot, the validated
 *     actor-scoped command, and the captured RuleSet:
 *
 *         import { resolve } from "@blockparty/game-engine";
 *
 *  6. Insert the ordered domain events, update the snapshot and the aggregate
 *     version, write the durable command receipt and ACK, and commit.
 *  7. ONLY after commit, publish the committed range to local SSE subscribers
 *     and return the authoritative ACK.
 *
 * A duplicate committed commandId returns its stored receipt and event range
 * without running the engine again. A transient transaction retry reuses the
 * same command ID and expected version; it never re-runs against newly loaded
 * state as a new action.
 *
 * A safe-command-boundary operation (bot replacement, reclaim, host transfer,
 * EndNoContest) runs between transactions and never interrupts a partially
 * resolved effect queue. See PROTO-003.
 */
export async function handleCommand(
  _envelope: CommandEnvelope,
  _actor: AuthenticatedSeat,
): Promise<CommandOutcome> {
  return {
    ok: false,
    code: "UNIMPLEMENTED",
    reason: "COMMAND_PATH_SCAFFOLD",
  };
}
