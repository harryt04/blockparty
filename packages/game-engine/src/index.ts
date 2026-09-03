/**
 * @blockparty/game-engine
 *
 * A pure TypeScript reducer. See ENG-020.
 *
 * It performs no IO, no date read, no `Math.random`, no mutation, no logging,
 * no database work, and no authorization-token check. The server authorizes
 * identity and seat ownership BEFORE calling `resolve`; the engine then
 * independently rejects actions that are not legal for that seat and phase.
 *
 * Engine events are semantic (`DiceRolled`, `RentPaid`), never transport
 * events. The server assigns journal sequence and aggregate version after
 * resolution; the engine does not know they exist.
 *
 * SCAFFOLD: every entry point carries its real signature and returns a typed
 * UNIMPLEMENTED rejection. Rules land ticket by ticket behind these seams.
 */
import type {
  ActorScopedCommand,
  CommandType,
  DomainEventType,
  Money,
  Phase,
  RulesConfiguration,
  SeatId,
} from "@blockparty/contracts";
import type { ContentBundle } from "@blockparty/game-content";
import type { PrngState } from "./prng";

export * from "./prng";
export * from "./invariants";

export const ENGINE_VERSION = "0.1.0";
export const STATE_SCHEMA_VERSION = "1.0.0";

/**
 * The resolved rules the engine runs under: the immutable content bundle plus
 * the configuration captured at start. A resumed game passes its captured
 * versions here, never current deployment defaults. See VAR-011.
 */
export interface RuleSet {
  readonly content: ContentBundle;
  readonly configuration: RulesConfiguration;
}

export interface SeatState {
  readonly seatId: SeatId;
  readonly kind: "human" | "bot";
  readonly status: "active" | "eliminated";
  readonly balance: Money;
  readonly position: number;
  readonly deedIds: readonly string[];
  readonly detained: boolean;
  readonly detentionTurnsRemaining: number;
  readonly detentionReleaseCardIds: readonly string[];
}

/**
 * The authoritative game state. See ENG-021.
 *
 * `seed` and `prng` are secret server data. They are excluded from every
 * projection, analytics event, URL, and log. See ENG-022 and PROTO-004.
 *
 * SCAFFOLD: ownership, decks, auctions, trades, the pending choice, and the
 * effect-queue continuation are added by the tickets that implement them.
 */
export interface GameState {
  readonly stateSchemaVersion: string;
  readonly contentVersion: string;
  readonly gameId: string;
  readonly aggregateVersion: number;
  readonly phase: Phase;
  readonly seats: readonly SeatState[];
  readonly activeSeatId?: SeatId;
  readonly prioritySeatId?: SeatId;
  /** Server-only. Never projected. */
  readonly prng: PrngState;
}

/** An event the engine emits. The server adds sequence and version after. */
export interface EngineEvent {
  readonly type: DomainEventType;
  readonly eventVersion: number;
  readonly actorSeatId?: SeatId;
  readonly payload: Readonly<Record<string, unknown>>;
}

function payloadSeatId(event: EngineEvent, key: string): SeatId | undefined {
  const value = event.payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * The event-only foundation for replay. Rule tickets extend this reducer with
 * their state transitions; random events are deliberately never re-drawn.
 */
function applyEvent(state: GameState, event: EngineEvent): GameState {
  switch (event.type) {
    case "GameStarted":
      return {
        ...state,
        phase: "TurnStart",
        activeSeatId: payloadSeatId(event, "firstSeatId") ?? state.activeSeatId,
        prioritySeatId: payloadSeatId(event, "firstSeatId") ?? state.prioritySeatId,
      };
    case "TurnStarted":
      return {
        ...state,
        phase: "AwaitRoll",
        activeSeatId: payloadSeatId(event, "seatId") ?? state.activeSeatId,
        prioritySeatId: payloadSeatId(event, "seatId") ?? state.prioritySeatId,
      };
    case "DiceRolled":
      // Dice values are event data. Replay changes no PRNG state and never
      // asks the random source to reconstruct the recorded outcome. ENG-022.
      return { ...state, phase: "ResolveMove" };
    case "TurnEnded":
      return {
        ...state,
        phase: "TurnStart",
        activeSeatId: payloadSeatId(event, "nextSeatId") ?? state.activeSeatId,
        prioritySeatId: payloadSeatId(event, "nextSeatId") ?? state.prioritySeatId,
      };
    case "GameCompleted":
    case "GameEndedNoContest":
      return { ...state, phase: "Finished" };
    default:
      return state;
  }
}

export interface Rejection {
  readonly ok: false;
  /** A contracts ErrorCode the server maps to an HTTP status. */
  readonly code: "ILLEGAL_ACTION" | "PHASE_MISMATCH" | "INVALID_PAYLOAD" | "UNIMPLEMENTED";
  readonly reasonCode: string;
  readonly message: string;
}

export interface Acceptance {
  readonly ok: true;
  readonly state: GameState;
  readonly events: readonly EngineEvent[];
}

export type Resolution = Acceptance | Rejection;

export interface LegalAction {
  readonly type: CommandType;
  readonly constraints?: Readonly<Record<string, number | string | boolean>>;
}

export interface ActionAvailability {
  readonly type: CommandType;
  readonly available: false;
  readonly reasonCode: string;
  readonly reason: string;
}

const unimplemented = (surface: string): Rejection => ({
  ok: false,
  code: "UNIMPLEMENTED",
  reasonCode: "ENGINE_SCAFFOLD",
  message: `${surface} is not implemented yet. See docs/engineering/game-engine.md.`,
});

/**
 * Accepts or rejects one actor-scoped command against an immutable state.
 * Returns a new immutable state plus ordered domain events, or a rejection.
 * The server performs no rule shortcut around this call. See ENG-015 step 5.
 */
export function resolve(
  _state: GameState,
  _command: ActorScopedCommand,
  _rules: RuleSet,
): Resolution {
  return unimplemented("resolve");
}

/**
 * The commands this seat may execute right now, with bounded parameters such
 * as a minimum and maximum auction bid. Advisory: the server still validates
 * every submitted payload. See ENG-023.
 */
export function legalActions(
  _state: GameState,
  _actorSeatId: SeatId,
  _rules: RuleSet,
): readonly LegalAction[] {
  return [];
}

/**
 * Relevant blocked actions with stable reason codes and safe display copy.
 * UI data only; it never grants authority. See PRD-FUN-009.
 */
export function actionAvailability(
  _state: GameState,
  _actorSeatId: SeatId,
  _rules: RuleSet,
): readonly ActionAvailability[] {
  return [];
}

/**
 * Rebuilds state from an ordered event range. Replay consumes no PRNG:
 * every chance outcome is already recorded in the events. See ENG-022.
 */
export function replay(
  initialState: GameState,
  events: readonly EngineEvent[],
  _rules: RuleSet,
): GameState {
  return events.reduce(applyEvent, initialState);
}
