import "client-only";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameSyncClient, type GameSyncState } from "./sync-client";

export type { GameSyncState } from "./sync-client";

/** React binding for the authenticated synchronization coordinator. */
export function useGameSync(gameId: string): {
  readonly state: GameSyncState;
  readonly retry: () => void;
} {
  const [state, setState] = useState<GameSyncState>({
    connection: "connecting",
    lastSequence: 0,
    aggregateVersion: 0,
    resyncing: true,
  });
  const clientRef = useRef<GameSyncClient | undefined>(undefined);

  useEffect(() => {
    const client = new GameSyncClient({ gameId, onState: setState });
    clientRef.current = client;
    void client.start();
    return () => {
      client.close();
      clientRef.current = undefined;
    };
  }, [gameId]);

  const retry = useCallback(() => {
    clientRef.current?.start();
  }, []);

  return { state, retry };
}
