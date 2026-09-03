import "server-only";

/**
 * Collection names and required indexes. See ENG-016 and the MongoDB data
 * model in ENG-002.
 *
 * The index definitions are DATA, not a startup side effect. Indexes are
 * created by an explicit maintenance command that runs BEFORE a new image
 * receives traffic. Never perform an opaque destructive migration at
 * application startup. See ENG-004.
 */
import type { CreateIndexesOptions, IndexSpecification } from "mongodb";

export const COLLECTIONS = {
  games: "games",
  gameEvents: "gameEvents",
  commandReceipts: "commandReceipts",
  invitations: "invitations",
  capabilities: "capabilities",
  hostCapabilities: "hostCapabilities",
  auditLog: "auditLog",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

export interface IndexDefinition {
  readonly key: IndexSpecification;
  readonly options: CreateIndexesOptions;
}

/**
 * Application-controlled cleanup performs the authoritative expiry transition.
 * A MongoDB TTL index may be a secondary guard only, never the transition
 * itself. See ENG-016 and ENG-017.
 */
export const INDEXES: Readonly<Record<CollectionName, readonly IndexDefinition[]>> = {
  games: [
    { key: { status: 1, expiresAt: 1 }, options: { name: "status_expiry" } },
    { key: { expiresAt: 1 }, options: { name: "expiry" } },
  ],
  gameEvents: [
    { key: { gameId: 1, sequence: 1 }, options: { name: "game_sequence", unique: true } },
    { key: { gameId: 1, aggregateVersion: 1 }, options: { name: "game_version" } },
  ],
  commandReceipts: [
    { key: { gameId: 1, commandId: 1 }, options: { name: "game_command", unique: true } },
  ],
  invitations: [
    { key: { inviteId: 1 }, options: { name: "invite_id", unique: true } },
    { key: { gameId: 1, status: 1 }, options: { name: "game_status" } },
    { key: { expiresAt: 1 }, options: { name: "expiry" } },
  ],
  capabilities: [
    { key: { tokenHash: 1 }, options: { name: "token_hash", unique: true } },
    { key: { gameId: 1, seatId: 1, kind: 1, status: 1 }, options: { name: "active_seat_kind" } },
    { key: { expiresAt: 1 }, options: { name: "expiry" } },
  ],
  hostCapabilities: [
    { key: { tokenHash: 1 }, options: { name: "token_hash", unique: true } },
    {
      key: { gameId: 1 },
      options: {
        name: "one_active_host",
        unique: true,
        partialFilterExpression: { status: "active" },
      },
    },
  ],
  auditLog: [
    { key: { gameId: 1, occurredAt: -1 }, options: { name: "game_time" } },
    { key: { seatId: 1, occurredAt: -1 }, options: { name: "seat_time" } },
  ],
};
