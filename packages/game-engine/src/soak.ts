/**
 * Reproducible bot simulation harness. See CONTENT-010 and TEST-006.
 *
 * This is deliberately a pure, bounded runner: the seed is derived from the
 * game index, duration is command count, and a game that reaches the bound is
 * recorded as stalled instead of being retried or silently discarded.
 */
import {
  STANDARD_CONFIGURATION,
  SHORT_GAME_CONFIGURATION,
  VARIANT_KEYS,
  type RulesConfiguration,
  type VariantKey,
} from "@blockparty/contracts";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import {
  chooseBotAction,
  legalActions,
  resolve,
  toBotPublicState,
  type GameState,
  type RuleSet,
  type SeatState,
} from "./index";
import { deriveInitialState } from "./prng";

export interface BotSoakGameResult {
  readonly gameIndex: number;
  readonly seed: string;
  readonly seatCount: number;
  readonly preset: RulesConfiguration["preset"];
  readonly enabledToggles: readonly VariantKey[];
  readonly durationCommands: number;
  readonly eliminatedSeats: number;
  readonly eliminationCommandIndexes: readonly number[];
  readonly remainingImprovementSupply: number;
  readonly assetConcentrationPercent: number;
  readonly stalled: boolean;
  readonly rejectedCommands: number;
  readonly terminalReason?: GameState["terminalReason"];
}

export interface BotSoakReport {
  readonly gameCount: number;
  readonly maxCommandsPerGame: number;
  readonly games: readonly BotSoakGameResult[];
  readonly stalledGames: number;
  readonly stalledRatePercent: number;
  readonly totalCommands: number;
}

export interface BotSoakOptions {
  readonly gameCount?: number;
  readonly maxCommandsPerGame?: number;
}

function seedForGame(gameIndex: number): Uint8Array {
  return Uint8Array.from(
    Array.from({ length: 32 }, (_, byteIndex) =>
      byteIndex < 4 ? (gameIndex >>> ((3 - byteIndex) * 8)) & 0xff : (byteIndex * 67 + 19) & 0xff,
    ),
  );
}

function seedHex(seed: Uint8Array): string {
  return Array.from(seed, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function customConfiguration(toggle: VariantKey): RulesConfiguration {
  return Object.freeze({
    ...STANDARD_CONFIGURATION,
    preset: "custom",
    [toggle]: true,
  });
}

function configurationFor(gameIndex: number): RulesConfiguration {
  if (gameIndex % 10 === 0) return STANDARD_CONFIGURATION;
  if (gameIndex % 10 === 1) return SHORT_GAME_CONFIGURATION;
  return customConfiguration(VARIANT_KEYS[(gameIndex - 2) % VARIANT_KEYS.length] as VariantKey);
}

function enabledToggles(configuration: RulesConfiguration): readonly VariantKey[] {
  return Object.freeze(VARIANT_KEYS.filter((key) => configuration[key]));
}

function initialState(gameIndex: number, seatCount: number): GameState {
  const seed = seedForGame(gameIndex);
  const seats: readonly SeatState[] = Array.from({ length: seatCount }, (_, index) => ({
    seatId: `soak-seat-${index + 1}`,
    kind: "bot",
    status: "active",
    balance: 0,
    position: 0,
    deedIds: [],
    detained: false,
    detentionTurnsRemaining: 0,
    detentionReleaseCardIds: [],
  }));
  return Object.freeze({
    stateSchemaVersion: "1.0.0",
    contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
    gameId: `soak-game-${gameIndex}`,
    aggregateVersion: 0,
    phase: "Lobby",
    seats: Object.freeze(seats),
    deeds: [],
    bank: { cash: 0, deedIds: [], improvementInventory: {} },
    consecutiveMatchingRolls: 0,
    effectQueue: [],
    prng: deriveInitialState(seed),
  });
}

function publicActorId(state: GameState): string | undefined {
  if (state.pendingTrade !== undefined) return state.pendingTrade.counterpartySeatId;
  if (state.phase === "AwaitAuction" || state.phase === "ImprovementAuction") {
    return state.prioritySeatId;
  }
  return state.activeSeatId;
}

function runGame(
  gameIndex: number,
  configuration: RulesConfiguration,
  maxCommandsPerGame: number,
): BotSoakGameResult {
  const seed = seedForGame(gameIndex);
  const rules: RuleSet = { content: PLACEHOLDER_BUNDLE, configuration };
  let state = initialState(gameIndex, 2 + (gameIndex % 5));
  const start = resolve(
    state,
    { actorSeatId: state.seats[0]?.seatId ?? "soak-seat-1", command: { type: "StartGame" } },
    rules,
  );
  if (!start.ok) throw new Error(`Soak setup rejected for seed ${seedHex(seed)}.`);
  state = start.state;
  const recordedDraws: number[] = [];
  let durationCommands = 0;
  let rejectedCommands = 0;
  const eliminationCommandIndexes: number[] = [];

  while (state.phase !== "Finished" && durationCommands < maxCommandsPerGame) {
    const actorSeatId = publicActorId(state);
    if (actorSeatId === undefined) break;
    const actions = legalActions(state, actorSeatId, rules);
    const decision = chooseBotAction(
      toBotPublicState(state, rules),
      actorSeatId,
      actions,
      recordedDraws,
    );
    if (decision === undefined) break;
    const result = resolve(state, { actorSeatId, command: decision.command }, rules);
    durationCommands += 1;
    if (!result.ok) {
      rejectedCommands += 1;
      break;
    }
    for (const event of result.events) {
      if (event.type === "DiceRolled") {
        const dice = event.payload.dice;
        if (Array.isArray(dice)) {
          for (const die of dice) if (typeof die === "number") recordedDraws.push(die);
        }
      }
      if (event.type === "SeatEliminated") eliminationCommandIndexes.push(durationCommands);
    }
    state = result.state;
  }

  const ownedDeedCount = state.seats.reduce((total, seat) => total + seat.deedIds.length, 0);
  const largestHolding = state.seats.reduce(
    (largest, seat) => Math.max(largest, seat.deedIds.length),
    0,
  );
  const assetConcentrationPercent =
    ownedDeedCount === 0 ? 0 : Math.floor((largestHolding * 100) / ownedDeedCount);
  const remainingImprovementSupply = Object.values(state.bank.improvementInventory).reduce(
    (total, quantity) => total + quantity,
    0,
  );
  return {
    gameIndex,
    seed: seedHex(seed),
    seatCount: state.seats.length,
    preset: configuration.preset,
    enabledToggles: enabledToggles(configuration),
    durationCommands,
    eliminatedSeats: state.seats.filter((seat) => seat.status === "eliminated").length,
    eliminationCommandIndexes: Object.freeze(eliminationCommandIndexes),
    remainingImprovementSupply,
    assetConcentrationPercent,
    stalled: state.phase !== "Finished",
    rejectedCommands,
    ...(state.terminalReason === undefined ? {} : { terminalReason: state.terminalReason }),
  };
}

/** Run the required reproducible 5,000-game matrix unless overridden in tests. */
export function runBotSoak(options: BotSoakOptions = {}): BotSoakReport {
  const gameCount = options.gameCount ?? 5000;
  const maxCommandsPerGame = options.maxCommandsPerGame ?? 128;
  if (!Number.isSafeInteger(gameCount) || gameCount < 1) {
    throw new RangeError("gameCount must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(maxCommandsPerGame) || maxCommandsPerGame < 1) {
    throw new RangeError("maxCommandsPerGame must be a positive safe integer.");
  }
  const games = Object.freeze(
    Array.from({ length: gameCount }, (_, gameIndex) =>
      runGame(gameIndex, configurationFor(gameIndex), maxCommandsPerGame),
    ),
  );
  const stalledGames = games.filter((game) => game.stalled).length;
  return Object.freeze({
    gameCount,
    maxCommandsPerGame,
    games,
    stalledGames,
    stalledRatePercent: Math.floor((stalledGames * 100) / gameCount),
    totalCommands: games.reduce((total, game) => total + game.durationCommands, 0),
  });
}
