import "server-only";

/**
 * Drives deterministic bot actions after a human command commits. Bot commands
 * still use the normal versioned command path; this module only supplies the
 * server-derived actor and the policy decision. See PRD-FUN-011 and ENG-026.
 */
import { CommandEnvelope, PROTOCOL_VERSION } from "@blockparty/contracts";
import { chooseBotAction, legalActions, toBotPublicState } from "@blockparty/game-engine";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/client";
import { COLLECTIONS } from "../db/collections";
import type { GameDocument } from "../games/create-game";
import { capturedRuleSet } from "../games/captured-rules";
import { normalizeGameState } from "../games/normalize-state";
import type { AuthenticatedSeat } from "../auth/session";
import { handleCommand } from "./handle-command";

const MAX_BOT_ACTIONS_PER_TRIGGER = 64;

/**
 * Runs bot turns until a human is active, the game pauses/finishes, or the
 * bounded bot budget is exhausted. There is deliberately no timer or fake
 * pass: a bot acts only when its current state advertises a legal action.
 */
export async function runBotTurns(gameId: string): Promise<void> {
  const database = getDb();

  for (let actionIndex = 0; actionIndex < MAX_BOT_ACTIONS_PER_TRIGGER; actionIndex += 1) {
    const persistedGame = await database
      .collection<GameDocument>(COLLECTIONS.games)
      .findOne({ _id: gameId });
    if (persistedGame === null || persistedGame.status !== "ACTIVE" || persistedGame.paused) return;

    const game = { ...persistedGame, snapshot: normalizeGameState(persistedGame.snapshot) };
    const actorSeatId = game.snapshot.activeSeatId;
    const actorSeat = game.snapshot.seats.find((seat) => seat.seatId === actorSeatId);
    if (actorSeatId === undefined || actorSeat?.kind !== "bot") return;

    const rules = capturedRuleSet(game);
    if (rules === undefined) return;
    const actions = legalActions(game.snapshot, actorSeatId, rules);
    const decision = chooseBotAction(
      toBotPublicState(game.snapshot, rules),
      actorSeatId,
      actions,
      game.snapshot.lastRoll ?? [],
    );
    if (decision === undefined) return;

    const envelope = CommandEnvelope.parse({
      protocolVersion: PROTOCOL_VERSION,
      type: "game.command",
      requestId: randomUUID(),
      gameId,
      commandId: randomUUID(),
      expectedVersion: game.aggregateVersion,
      payload: decision.command,
    });
    const actor: AuthenticatedSeat = { gameId, seatId: actorSeatId, kind: "seat" };
    const outcome = await handleCommand(envelope, actor, { botDecision: decision });
    if (!outcome.ok) return;
  }
}
