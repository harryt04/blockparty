import "client-only";

/**
 * Browser synchronization state. See PROTO-004.
 *
 * `lastSequence` and `aggregateVersion` are a RECOVERABLE CACHE, never
 * authority. The database snapshot is always authoritative. On a gap the
 * client stops submitting commands, calls /sync, and re-enables controls only
 * after applying the current state and legal actions.
 *
 * SCAFFOLD: this holds the shape and the recovery rules. Wiring it to the
 * stream and to the command path is the sync ticket.
 */
import { useCallback, useState } from "react";
import type { GameSnapshotProjection } from "@blockparty/contracts";
import type { ConnectionState } from "@/components/shell/connection-status";

export interface GameSyncState {
  readonly connection: ConnectionState;
  readonly snapshot?: GameSnapshotProjection;
  readonly lastSequence: number;
  readonly aggregateVersion: number;
  /** True while recovering. Every game-changing control is disabled. */
  readonly resyncing: boolean;
}

const INITIAL: GameSyncState = {
  connection: "reconnecting",
  lastSequence: 0,
  aggregateVersion: 0,
  resyncing: true,
};

export function useGameSync(_gameId: string) {
  const [state, setState] = useState<GameSyncState>(INITIAL);

  /**
   * Replaces local state atomically from an authoritative snapshot.
   * A snapshot replacement is never merged into a partial local state.
   */
  const applySnapshot = useCallback((snapshot: GameSnapshotProjection) => {
    setState({
      connection: "connected",
      snapshot,
      lastSequence: snapshot.sequence,
      aggregateVersion: snapshot.aggregateVersion,
      resyncing: false,
    });
  }, []);

  // TODO(PROTO-004): open the stream, apply contiguous ranges, call /sync on a
  // gap, and re-fetch on visibility resume.

  return { state, applySnapshot };
}
