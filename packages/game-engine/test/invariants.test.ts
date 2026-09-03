import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import { STANDARD_CONFIGURATION, type Command } from "@blockparty/contracts";
import {
  checkInvariants,
  legalActions,
  replay,
  resolve,
  type GameState,
  type RuleSet,
} from "../src/index";
import { deriveInitialState } from "../src/prng";

const SEED = Uint8Array.from(Array.from({ length: 32 }, (_, index) => (index * 13 + 9) & 0xff));
const SEED_HEX = Array.from(SEED, (byte) => byte.toString(16).padStart(2, "0")).join("");
const RULES: RuleSet = { content: PLACEHOLDER_BUNDLE, configuration: STANDARD_CONFIGURATION };

const lobby = (): GameState => ({
  stateSchemaVersion: "1.0.0",
  contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
  gameId: "game-a16",
  aggregateVersion: 0,
  phase: "Lobby",
  seats: ["seat-a", "seat-b"].map((seatId) => ({
    seatId,
    kind: "human" as const,
    status: "active" as const,
    balance: 0,
    position: 0,
    deedIds: [],
    detained: false,
    detentionTurnsRemaining: 0,
    detentionReleaseCardIds: [],
  })),
  deeds: [],
  bank: { cash: 0, deedIds: [], improvementInventory: {} },
  consecutiveMatchingRolls: 0,
  effectQueue: [],
  prng: deriveInitialState(SEED),
});

function stringConstraint(
  constraints: Readonly<Record<string, number | string | boolean>> | undefined,
  key: string,
): string | undefined {
  const value = constraints?.[key];
  return typeof value === "string" ? value : undefined;
}

function commandForAction(action: ReturnType<typeof legalActions>[number]): Command | undefined {
  const deedId = stringConstraint(action.constraints, "deedId");
  switch (action.type) {
    case "StartGame":
    case "RollDice":
    case "EndTurn":
    case "EndNoContest":
    case "PassAuction":
    case "PayObligation":
    case "DeclareBankruptcy":
      return { type: action.type };
    case "AcquireDeed":
    case "DeclineAcquisition":
    case "MortgageDeed":
    case "RedeemMortgage":
    case "BuyImprovement":
    case "SellImprovement":
    case "RequestScarceImprovement":
      return deedId === undefined ? undefined : { type: action.type, deedId };
    case "PlaceAuctionBid": {
      const minimum = action.constraints?.minBid;
      return typeof minimum === "number" ? { type: action.type, amount: minimum } : undefined;
    }
    case "ChoosePendingOption":
      return {
        type: action.type,
        choiceId: stringConstraint(action.constraints, "choiceId") ?? "missing-choice",
        optionId: stringConstraint(action.constraints, "optionId") ?? "selected",
      };
    case "AcceptTrade":
    case "RejectTrade":
    case "CancelTrade": {
      const tradeId = stringConstraint(action.constraints, "tradeId");
      return tradeId === undefined ? undefined : { type: action.type, tradeId };
    }
    case "ProposeTrade":
      // legalActions intentionally exposes only the counterparty for this
      // composite UI, so the property runner leaves it to the component layer.
      return undefined;
    default:
      return undefined;
  }
}

describe("A16 invariants and replay fixtures", () => {
  it("keeps a fixed-seed legal workflow invariant-safe and replayable", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 99 }), { minLength: 1, maxLength: 24 }),
        (choices) => {
          let state = lobby();
          for (const choice of choices) {
            const candidates = legalActions(state, state.activeSeatId ?? "seat-a", RULES)
              .map((action) => ({ action, command: commandForAction(action) }))
              .filter(
                (
                  candidate,
                ): candidate is { action: (typeof candidate)["action"]; command: Command } =>
                  candidate.command !== undefined,
              );
            if (candidates.length === 0) break;
            const selected = candidates[choice % candidates.length];
            if (selected === undefined) break;
            const before = state;
            const result = resolve(
              before,
              { actorSeatId: before.activeSeatId ?? "seat-a", command: selected.command },
              RULES,
            );
            expect(result.ok, `seed=${SEED_HEX}`).toBe(true);
            if (!result.ok) return;
            expect(checkInvariants(result.state, RULES)).toEqual([]);
            expect(replay(before, result.events, RULES)).toEqual({
              ...result.state,
              prng: before.prng,
            });
            state = result.state;
            if (state.phase === "Finished") break;
          }
        },
      ),
      { numRuns: 32, seed: 1603, endOnFailure: true },
    );
  });

  it("locks an immutable fixed-seed setup-and-roll golden", () => {
    const started = resolve(
      lobby(),
      { actorSeatId: "seat-a", command: { type: "StartGame" } },
      RULES,
    );
    expect(started).toMatchObject({ ok: true });
    if (!started.ok || started.state.activeSeatId === undefined) throw new Error("setup failed");
    const rolled = resolve(
      started.state,
      { actorSeatId: started.state.activeSeatId, command: { type: "RollDice" } },
      RULES,
    );
    expect(rolled).toMatchObject({ ok: true });
    if (!rolled.ok) throw new Error("roll failed");

    const golden = Object.freeze(["GameStarted", "TurnStarted", "DiceRolled", "TokenMoved"]);
    expect(Object.freeze([...started.events, ...rolled.events].map((event) => event.type))).toEqual(
      golden,
    );
    expect(rolled.events[0]?.payload).toMatchObject({ dice: [5, 1], matching: false });
    expect(replay(started.state, rolled.events, RULES)).toEqual({
      ...rolled.state,
      prng: started.state.prng,
    });
  });

  it("reports deliberate corruption at stable invariant boundaries", () => {
    const started = resolve(
      lobby(),
      { actorSeatId: "seat-a", command: { type: "StartGame" } },
      RULES,
    );
    expect(started).toMatchObject({ ok: true });
    if (!started.ok) throw new Error("setup failed");

    const negativeCash = {
      ...started.state,
      seats: started.state.seats.map((seat, index) =>
        index === 0 ? { ...seat, balance: -1 } : seat,
      ),
    };
    expect(checkInvariants(negativeCash, RULES).map((item) => item.code)).toContain(
      "NEGATIVE_SEAT_BALANCE",
    );

    const duplicateSeat = {
      ...started.state,
      seats: [
        ...started.state.seats,
        started.state.seats[0] as (typeof started.state.seats)[number],
      ],
    };
    expect(checkInvariants(duplicateSeat, RULES).map((item) => item.code)).toContain(
      "DUPLICATE_SEAT_ID",
    );

    const unsupportedVersion = { ...started.state, stateSchemaVersion: "9.0.0" };
    expect(checkInvariants(unsupportedVersion, RULES).map((item) => item.code)).toContain(
      "UNSUPPORTED_STATE_SCHEMA",
    );
  });
});
