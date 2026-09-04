import "client-only";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameSyncClient, type GameSyncState } from "./sync-client";

export type { GameSyncState } from "./sync-client";

/** React binding for the authenticated synchronization coordinator. */
export function useGameSync(
  gameId: string,
  options: { readonly onPresence?: () => void } = {},
): {
  readonly state: GameSyncState;
  readonly retry: () => void;
} {
  const { onPresence } = options;
  const [state, setState] = useState<GameSyncState>({
    connection: "connecting",
    lastSequence: 0,
    aggregateVersion: 0,
    resyncing: true,
  });
  const clientRef = useRef<GameSyncClient | undefined>(undefined);

  useEffect(() => {
    const client = new GameSyncClient({
      gameId,
      onState: setState,
      onPresence: onPresence === undefined ? undefined : () => onPresence(),
    });
    clientRef.current = client;
    void client.start();
    return () => {
      client.close();
      clientRef.current = undefined;
    };
  }, [gameId, onPresence]);

  const retry = useCallback(() => {
    clientRef.current?.refresh();
  }, []);

  return { state, retry };
}
