/**
 * Transport envelopes. See PROTO-001 and PROTO-002.
 *
 * Transport event names are lower-case dot notation (`game.command`).
 * Domain commands and events inside them stay PascalCase.
 *
 * Every schema is `.strict()`: unknown fields are rejected, not ignored.
 */
import { z } from "zod";
import {
  AggregateVersion,
  CommandId,
  GameId,
  ProtocolVersion,
  RequestId,
  Sequence,
  ServerTime,
} from "./common";
import { Command } from "./commands";
import { DomainEvent } from "./events";
import { GameSnapshotProjection, PresenceEvent } from "./projections";

export const TransportType = z.enum([
  "game.command",
  "game.snapshot",
  "game.events",
  "game.commandAck",
  "game.error",
  "room.presence",
  "game.closed",
]);
export type TransportType = z.infer<typeof TransportType>;

/**
 * The client-to-server command envelope.
 *
 * `expectedVersion` is the optimistic-concurrency check: it must match the
 * stored aggregate version or the command is rejected with STALE_VERSION.
 * `commandId` is client-generated and unique per game; repeating a committed
 * one returns the stored ACK without re-running the engine.
 *
 * The envelope carries NO seat, actor, phase, or host claim. The server
 * derives the actor from the authenticated capability. See SEC-002.
 */
export const CommandEnvelope = z
  .object({
    protocolVersion: ProtocolVersion,
    type: z.literal("game.command"),
    requestId: RequestId,
    gameId: GameId,
    commandId: CommandId,
    expectedVersion: AggregateVersion,
    payload: Command,
  })
  .strict();
export type CommandEnvelope = z.infer<typeof CommandEnvelope>;

/** Fields every server envelope carries. */
const serverEnvelopeBase = {
  protocolVersion: ProtocolVersion,
  requestId: RequestId.optional(),
  gameId: GameId,
  serverTime: ServerTime,
};

/**
 * Durable acceptance, not merely HTTP receipt. A `game.commandAck` means the
 * MongoDB transaction committed. See PROTO-002.
 */
export const CommandAckEnvelope = z
  .object({
    ...serverEnvelopeBase,
    type: z.literal("game.commandAck"),
    commandId: CommandId,
    accepted: z.literal(true),
    aggregateVersion: AggregateVersion,
    firstSequence: Sequence,
    lastSequence: Sequence,
  })
  .strict();
export type CommandAckEnvelope = z.infer<typeof CommandAckEnvelope>;

export const SnapshotEnvelope = z
  .object({
    ...serverEnvelopeBase,
    type: z.literal("game.snapshot"),
    aggregateVersion: AggregateVersion,
    sequence: Sequence,
    snapshot: GameSnapshotProjection,
  })
  .strict();
export type SnapshotEnvelope = z.infer<typeof SnapshotEnvelope>;

/**
 * A contiguous event range. The client applies it only when the first
 * `sequence` equals its local sequence + 1; it never fabricates state across
 * a gap and falls back to /sync instead. See PROTO-002.
 */
export const EventsEnvelope = z
  .object({
    ...serverEnvelopeBase,
    type: z.literal("game.events"),
    aggregateVersion: AggregateVersion,
    firstSequence: Sequence,
    lastSequence: Sequence,
    events: z.array(DomainEvent).max(256),
  })
  .strict();
export type EventsEnvelope = z.infer<typeof EventsEnvelope>;

export const PresenceEnvelope = z
  .object({
    ...serverEnvelopeBase,
    type: z.literal("room.presence"),
    presence: z.array(PresenceEvent).max(6),
  })
  .strict();
export type PresenceEnvelope = z.infer<typeof PresenceEnvelope>;

export const ClosedEnvelope = z
  .object({
    ...serverEnvelopeBase,
    type: z.literal("game.closed"),
    reason: z.enum(["COMPLETED", "NO_CONTEST", "EXPIRED", "SERVER_SHUTDOWN"]),
  })
  .strict();
export type ClosedEnvelope = z.infer<typeof ClosedEnvelope>;

/**
 * Every frame the browser may receive over SSE. The browser validates the
 * frame before applying it; an SSE frame is delivery, never authorization.
 */
export const ServerEnvelope = z.discriminatedUnion("type", [
  CommandAckEnvelope,
  SnapshotEnvelope,
  EventsEnvelope,
  PresenceEnvelope,
  ClosedEnvelope,
]);
export type ServerEnvelope = z.infer<typeof ServerEnvelope>;
