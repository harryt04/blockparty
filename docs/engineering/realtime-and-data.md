# Realtime Protocol and Data

**Companion documents:** [architecture](architecture.md), [PRD](../product/prd.md), [glossary](../product/glossary.md), [game engine](game-engine.md), and [security/privacy/analytics](security-privacy-analytics.md).

This document describes the HTTP and Server-Sent Events protocol implemented by the single Next.js App Router application. It replaces the earlier Socket.IO/PostgreSQL transport and persistence proposal. The application is authoritative; SSE is delivery, not authority.

## PROTO-001: Transport and envelope

Next.js Node.js Route Handlers expose HTTPS JSON endpoints and an authenticated SSE endpoint. Game creation, invitation join, bootstrap, synchronization, health, and game mutations use HTTP. Committed changes are delivered through `GET /api/games/[gameId]/events` as Server-Sent Events. Every payload is Zod-validated from `packages/contracts`; reject unknown fields for commands and envelopes.

```json
{
  "protocolVersion": 1,
  "type": "game.command",
  "requestId": "uuid",
  "gameId": "uuid",
  "commandId": "uuid",
  "expectedVersion": 42,
  "payload": { "type": "RollDice" }
}
```

All server envelopes contain `protocolVersion`, `type`, `requestId` when responding, `gameId`, and informational `serverTime`. State-changing responses additionally carry `aggregateVersion` and `sequence`. `commandId` is client-generated UUIDv7/UUIDv4 and unique per game; `requestId` correlates one delivery attempt and may change on retry.

Transport types are `game.command`, `game.snapshot`, `game.events`, `game.commandAck`, `game.error`, `room.presence`, and `game.closed`. SSE frames carry a transport type and serialized envelope; the browser must validate the frame before applying it.

## PROTO-002: Version, sequence, ACK, and errors

`aggregateVersion` increments once per accepted command transaction. `sequence` is a strictly increasing journal-event number per game; one command can emit multiple contiguous sequence values. A client applies events only when the first received sequence equals local sequence + 1. It never fabricates state across a gap.

`game.commandAck` is durable acceptance, not merely HTTP receipt: `{commandId, accepted: true, aggregateVersion, firstSequence, lastSequence}`. Repeating a committed `commandId` returns the stored ACK/events metadata and does not re-run the engine. An unknown or uncommitted command ID may be retried with the same command ID. A rejected command returns `accepted: false` with no state change.

| Code                                           | Meaning                                  | Client behavior                                             |
| ---------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| `INVALID_ENVELOPE` / `INVALID_PAYLOAD`         | Schema or bounded input failed           | Show safe error; do not retry unchanged.                    |
| `UNAUTHENTICATED` / `FORBIDDEN`                | Missing/invalid capability or wrong seat | Refresh/join flow; do not expose detail.                    |
| `NOT_FOUND` / `GAME_EXPIRED`                   | Resource unavailable/retained no longer  | Return to home.                                             |
| `STALE_VERSION`                                | `expectedVersion` differs                | Request sync; require the user to act on current state.     |
| `ILLEGAL_ACTION` / `PHASE_MISMATCH`            | Engine rejects action now                | Refresh legal actions/state.                                |
| `DUPLICATE_COMMAND`                            | Already committed                        | Treat stored ACK as success.                                |
| `RATE_LIMITED` / `SERVER_BUSY`                 | Retryable admission failure              | Back off with jitter.                                       |
| `PROTOCOL_UNSUPPORTED` / `CONTENT_UNSUPPORTED` | Client/game incompatible                 | Force app update or support message.                        |
| `INTERNAL`                                     | Unexpected server failure                | Retry only with the same `commandId`; show generic message. |

## PROTO-003: SSE subscriptions, presence, and reconnect

An SSE request authenticates the secure game-seat cookie before subscribing. A subscriber receives only the authorized projection for its seat. No URL path, SSE connection, in-memory subscription, or event frame grants authorization. Capabilities are never passed in query parameters.

The server registers a local subscriber, sends keep-alives, and publishes committed events after the MongoDB transaction commits. A MongoDB change stream feeds the local subscriber registry in production. A dropped stream or process restart does not lose state: the client reconnects and calls `game.sync`.

Presence is ephemeral and emitted as `connected`, `disconnected`, or `reconnected` seat IDs. Multiple tabs with one capability share the seat's earliest connected tenure. A required-seat pause/resume or deterministic host transfer is recorded as a safe-boundary journal transition; it never fabricates a pass, bid, trade response, or bankruptcy. The selected human claims a separate host capability after transfer through the authenticated host-claim route. Commands remain idempotent and versioned.

Host transfer, disconnected-seat pause, bot replacement, reclaim, and `EndNoContest` follow the safe command boundary defined by the [architecture](architecture.md#authoritative-command-and-event-flow). Replacement revokes the seat command capability but preserves a separate reclaim claim. Returning players authenticate the claim, request reclaim, and receive a new command capability only after host approval and safe-boundary transfer.

## PROTO-004: Catch-up, resync, and stale data

`GET /api/games/[gameId]/sync?lastSequence=N&aggregateVersion=V` authenticates the seat and returns a contiguous authorized `game.events` range when retained events are available. Otherwise it returns a complete authorized `game.snapshot` with terminal sequence/version. Snapshot replacement is atomic in the client.

On an SSE gap, decode failure, stale version, reconnect, process restart, or visibility resume, the client stops action submission, requests sync, and re-enables controls only after applying current state and legal actions. The last sequence/version is a cache, not authority.

Snapshots and events never contain seed material, future deck order, raw capabilities, token hashes, host/reclaim credentials, or unauthorized private state. Bots receive public state only. The server must never serialize an internal full-state object directly to a client.

## ENG-015: Transactional persistence

The Next.js server handles every command in one MongoDB session transaction: authenticate/authorize; look up `(gameId, commandId)`; load the game aggregate; verify expected aggregate version; resolve the engine; append events with sequential numbers; update the snapshot/version; insert the command receipt/ACK; commit; then publish to SSE. Failed transactions emit no success ACK.

Use the official MongoDB driver. MongoDB must run as a replica set because standalone deployments cannot provide the required transaction semantics. The snapshot update includes the prior version in its predicate, and unique keys protect event sequences and command IDs. Do not write raw HTTP payloads to the journal.

## ENG-016: Collections and indexes

The complete collection shape is defined in [MongoDB data model](architecture.md#mongodb-data-model). In summary:

| Collection         | Required indexes/constraints                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `games`            | Unique `_id`; status/expiry index; bounded snapshot and captured version metadata.             |
| `gameEvents`       | Unique `(gameId, sequence)`; `(gameId, aggregateVersion)` index; validated event version/type. |
| `commandReceipts`  | Unique `(gameId, commandId)`; bounded ACK/event metadata.                                      |
| `invitations`      | Unique opaque invite ID; game/status/expiry indexes.                                           |
| `capabilities`     | Unique token hash; game/seat/kind/status and expiry indexes.                                   |
| `hostCapabilities` | One active capability per game; unique token hash.                                             |
| `auditLog`         | Game/time and seat/time indexes; no raw tokens or names.                                       |

Use string UUIDs for domain identifiers. Validate document and event sizes before insert. Application-controlled cleanup performs the authoritative expiry transition; a MongoDB TTL index may be a secondary cleanup guard only.

## ENG-017: Expiry, backup, recovery, and scale

For an active game, set expiry to 30 days after its last authoritative gameplay action. For a completed game, set expiry to 30 days after completion. Presence, viewing, analytics, and failed commands do not extend retention. The scheduled cleanup handler atomically changes due active games to `EXPIRED`, journals the transition, revokes invitation/seat/host capabilities, then deletes expired data in bounded idempotent batches. Completed games remain read-only until due.

Take encrypted MongoDB backups at least daily and test restore at least quarterly: restore into an isolated replica set, run compatibility/index maintenance, verify row/document counts and sampled snapshot-plus-event replay/invariants, then destroy the test environment. Initial targets are RPO 24 hours without point-in-time recovery and RTO 4 hours; they are objectives, not zero-data-loss or high-availability promises.

Initial deployment uses one Next.js application replica and one private MongoDB replica set. If multiple app replicas are later needed, each may consume MongoDB change streams and serve local SSE clients, but connection limits, cross-replica event delivery, rate limits, and recovery must be load-tested first. MongoDB remains the durable serialization layer. Redis is deferred and is not required for the initial design.
