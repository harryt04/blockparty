# Realtime Protocol and Data

**Companion documents:** [architecture](architecture.md), [PRD](../product/prd.md), [glossary](../product/glossary.md), [game engine](game-engine.md), and [security/privacy/analytics](security-privacy-analytics.md).

## PROTO-001: Transport and envelope

Socket.IO runs over WSS on the dedicated game server. HTTP is used for game creation, invitation join, initial bootstrap, and health endpoints; game mutations use socket commands. Every payload is Zod-validated from `packages/contracts` before use. Reject unknown fields for commands and envelopes.

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

All server envelopes contain `protocolVersion`, `type`, `requestId` when responding, `gameId`, and `serverTime` (informational only). State-changing responses additionally carry `aggregateVersion` and `sequence`. `commandId` is client-generated UUIDv7/UUIDv4 and is unique per game; `requestId` correlates a delivery attempt and may change on retry. Event types: `game.snapshot`, `game.events`, `game.commandAck`, `game.error`, `room.presence`, and `game.closed`.

## PROTO-002: Version, sequence, ACK, and errors

`aggregateVersion` increments once per accepted command transaction. `sequence` is a strictly increasing journal-event number per game; one command can emit multiple contiguous sequence values. A client applies events only when the first received sequence equals local sequence + 1 and the ending aggregate version is compatible with the command boundary. It never fabricates state by applying a gap.

`game.commandAck` is durable acceptance, not merely socket receipt: `{commandId, accepted: true, aggregateVersion, firstSequence, lastSequence}`. Repeating a committed `commandId` returns the originally stored ACK/events metadata and does not re-run the engine. An unknown/uncommitted command ID can be retried. A rejected command returns `accepted: false` with no state change.

| Code | Meaning | Client behavior |
|---|---|---|
| `INVALID_ENVELOPE` / `INVALID_PAYLOAD` | Schema or bounded input failed | Show safe error; do not retry unchanged. |
| `UNAUTHENTICATED` / `FORBIDDEN` | Missing/invalid seat capability or wrong seat | Refresh/join flow; do not expose detail. |
| `NOT_FOUND` / `GAME_EXPIRED` | Resource unavailable/retained no longer | Return to home. |
| `STALE_VERSION` | `expectedVersion` differs | Request resync; require user to act on current state. |
| `ILLEGAL_ACTION` / `PHASE_MISMATCH` | Engine rejects action now | Refresh legal actions/state. |
| `DUPLICATE_COMMAND` | Already committed | Treat stored ACK as success. |
| `RATE_LIMITED` / `SERVER_BUSY` | Retryable admission failure | Back off with jitter. |
| `PROTOCOL_UNSUPPORTED` / `CONTENT_UNSUPPORTED` | Client/game incompatible | Force app update or support message. |
| `INTERNAL` | Unexpected server failure | Retry only with same `commandId`; show generic message. |

## PROTO-003: Rooms, presence, and reconnect

A socket joins `game:{gameId}` only after its game-seat command capability is authenticated and authorized. It may join a private `seat:{gameId}:{seatId}` notification room. Room names never grant authorization. Presence is ephemeral and emitted as `connected`, `disconnected`, or `reconnected` seat IDs; it is not a game-rule event unless the recovery policy causes a server command.

On connection, authenticate the secure game-seat cookie, authorize the requested game, join the room, then bootstrap/catch up. Multiple tabs with the same capability share one seat; commands remain idempotent/versioned. On disconnect, mark socket presence absent after a short debounce; do not change ownership or credentials automatically.

**Host transfer.** Store host seat ID and a separate host capability. In the lobby, the host may explicitly transfer to another connected human. During play, a disconnected host transfers at the next safe command boundary to the longest-tenured connected human, breaking ties by seat order; journal `HostTransferred` and rotate host capability atomically. If no human is connected, play remains paused. Host authority never changes game rules after start.

**Disconnected seats.** A disconnected human pauses only when that seat is the required actor, including auction priority; there is no gameplay countdown or automatic pass. A connected host may explicitly replace that human with the single MVP bot at a safe command boundary. Replacement revokes the seat command capability but preserves a separate, non-command-authorizing reclaim claim. A returning human authenticates the claim and requests reclaim; the host approves, then the server transfers control only at a safe boundary, removes the bot, and issues a new seat command capability. Replacement, revocation, request, approval, and transfer are journaled commands. Connectivity never causes forfeiture or bankruptcy.

A safe command boundary exists after a command transaction commits and before the next begins, even when the engine is waiting in a serialized decision phase. Host replacement, reclaim, transfer, and `EndNoContest` commands use the same aggregate-version and idempotency path as gameplay commands; they never interrupt a transaction or partially applied effect.

## PROTO-004: Catch-up, resync, and stale data

Client records the last successfully applied sequence and aggregate version locally only as a cache; server state wins. `game.sync` sends `{lastSequence, aggregateVersion}`. If retained journal events form a contiguous range, server returns `game.events`; if not, or client reports an incompatible protocol/content version, it returns a full authorized `game.snapshot` with its terminal sequence/version. Snapshot replaces local state atomically. On gap, decode failure, `STALE_VERSION`, reconnect, or visibility resume, client stops action submission, requests sync, and re-enables controls after applying current state and legal actions.

Snapshots are seat-authorized projections and never contain seed, future deck order, host/seat/reclaim capabilities, or token material. Bots consume a public-state projection only. Never broadcast an internal full-state object.

## ENG-015: Transactional persistence

The game server handles a command in one PostgreSQL transaction: authenticate/authorize; acquire game serialization lock; lookup `(game_id, command_id)`; load snapshot; verify expected aggregate version; resolve engine; append events with sequential numbers; update snapshot/version; insert command receipt/ACK; commit; then broadcast. Socket broadcast happens after commit and can be repeated safely. Failed transactions emit no success ACK.

Use Drizzle migrations for all schema changes. Store event payloads as validated `jsonb`, with event type/version columns. Do not write raw socket payloads to journal tables.

## ENG-016: Tables and indexes

| Table | Essential columns | Indexes/constraints |
|---|---|---|
| `games` | `id`, `status`, `host_seat_id`, `aggregate_version`, `content_version`, `expires_at` | status/expiry index |
| `game_seats` | `game_id`, `seat_id`, `occupant_type`, `display_name`, `status`, `joined_at`, `replaced_at` | PK `(game_id, seat_id)`; normalized active display-name uniqueness |
| `seat_capabilities` | `game_id`, `seat_id`, `kind`, `token_hash`, `status`, `created_at`, `expires_at` | unique token hash; game/seat/status and expiry indexes; kinds `command` and `reclaim` |
| `host_capabilities` | `game_id`, `host_seat_id`, `token_hash`, `status`, `created_at`, `expires_at` | one active per game; unique token hash |
| `game_snapshots` | `game_id`, `aggregate_version`, `last_sequence`, `state_schema_version`, `state_json` | PK game; version check |
| `game_events` | `game_id`, `sequence`, `aggregate_version`, `type`, `event_version`, `payload`, `created_at` | unique `(game_id, sequence)`; `(game_id, aggregate_version)`; expiry/created index |
| `command_receipts` | `game_id`, `command_id`, `actor_seat_id`, `expected_version`, `ack_json`, `created_at` | unique `(game_id, command_id)` |
| `invitations` | `id`, `game_id`, `status`, `max_uses`, `uses`, `expires_at` | unique opaque ID; game/status; expiry index |
| `audit_log` | `id`, `game_id?`, `seat_id?`, `action`, `metadata`, `created_at` | game/time and seat/time indexes; no raw tokens or names |

Use foreign keys where retention deletion order permits them. `state_json` and payloads must be bounded in size before insert. Snapshots update every accepted command initially; later compaction may retain periodic snapshots only after recovery performance is measured.

## ENG-017: Expiry, backup, recovery, and scale

For an active game, set `expires_at` to 30 days after its last authoritative gameplay action. For a completed game, set it to 30 days after completion. Presence, viewing, analytics, and failed commands do not extend retention. A scheduled job atomically changes due active games to `EXPIRED`, journals the transition, revokes invitation/seat/host capabilities, then deletes expired game data in bounded idempotent batches. Completed games remain read-only until due. Record counts without identifiers; disclose separately how long encrypted backups may retain deleted rows.

Take automated encrypted PostgreSQL backups daily and test restore at least quarterly: restore into isolated DB, run migrations, verify row counts and sample snapshot-plus-event replay/invariants, then destroy the test environment. Initial targets are RPO 24 hours without point-in-time recovery and RTO 4 hours; they are objectives, not zero-data-loss or high-availability promises.

Scale path: (1) measure connection count, command latency, DB locks; (2) make game-server stateless except sockets; (3) introduce Redis Socket.IO adapter and shared rate-limit/presence storage; (4) run multiple replicas with sticky WebSocket routing; (5) protect PostgreSQL with pooling, index review, and read replicas only for non-authoritative reads. Command serialization remains PostgreSQL-backed across replicas.
