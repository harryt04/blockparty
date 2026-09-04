"use client";

import { useEffect, useRef, useState } from "react";
import type { GameSnapshotProjection } from "@blockparty/contracts";
import {
  announcementForConnection,
  announcementForSnapshot,
  type AnnouncementPriority,
  type ConnectionAnnouncementState,
  type LiveAnnouncement,
} from "./live-announcements-model";

export interface CommandAnnouncement {
  readonly id: number;
  readonly message: string;
  readonly priority: AnnouncementPriority;
}

/**
 * One-shot live regions for authoritative, turn-critical changes. It never
 * moves focus; the event log remains the complete readable history. See
 * PRD-NFR-005, UX-040, and DS-070.
 */
export function LiveAnnouncements({
  snapshot,
  connection,
  command,
}: {
  snapshot: GameSnapshotProjection;
  connection: ConnectionAnnouncementState;
  command?: CommandAnnouncement;
}) {
  const previousSnapshot = useRef<GameSnapshotProjection | undefined>(undefined);
  const previousConnection = useRef<ConnectionAnnouncementState | undefined>(undefined);
  const lastKey = useRef<string | undefined>(undefined);
  const lastCommandId = useRef<number | undefined>(undefined);
  const [polite, setPolite] = useState<LiveAnnouncement | undefined>(undefined);
  const [assertive, setAssertive] = useState<LiveAnnouncement | undefined>(undefined);

  useEffect(() => {
    const isNewCommand = command !== undefined && command.id !== lastCommandId.current;
    const next =
      isNewCommand && command !== undefined
        ? {
            key: `command:${command.id}`,
            message: command.message,
            priority: command.priority,
          }
        : (announcementForConnection(previousConnection.current, connection) ??
          announcementForSnapshot(previousSnapshot.current, snapshot));
    if (isNewCommand && command !== undefined) lastCommandId.current = command.id;
    previousSnapshot.current = snapshot;
    previousConnection.current = connection;
    if (next === undefined || next.key === lastKey.current) return;
    lastKey.current = next.key;
    if (next.priority === "assertive") setAssertive(next);
    else setPolite(next);
  }, [command, connection, snapshot]);

  return (
    <div className="sr-only" aria-label="Game announcements">
      <p key={polite?.key} role="status" aria-live="polite" aria-atomic="true">
        {polite?.message ?? ""}
      </p>
      <p key={assertive?.key} role="alert" aria-live="assertive" aria-atomic="true">
        {assertive?.message ?? ""}
      </p>
    </div>
  );
}
