import { describe, expect, it } from "vitest";
import {
  actionAvailability,
  legalActions,
  replay,
  resolve,
  type GameState,
  type RuleSet,
} from "../src/index";
import { checkInvariants } from "../src/invariants";
import { deriveInitialState, nextInt } from "../src/prng";
import type { ActorScopedCommand } from "@blockparty/contracts";

describe("engine scaffold seam", () => {
  it("rejects unresolved commands with the stable scaffold reason", () => {
    const result = resolve({} as GameState, {} as ActorScopedCommand, {} as RuleSet);

    expect(result).toMatchObject({
      ok: false,
      code: "UNIMPLEMENTED",
      reasonCode: "ENGINE_SCAFFOLD",
    });
  });

  it("exposes inert query seams and explicit unimplemented state builders", () => {
    const state = {} as GameState;
    const rules = {} as RuleSet;

    expect(legalActions(state, "seat-1", rules)).toEqual([]);
    expect(actionAvailability(state, "seat-1", rules)).toEqual([]);
    expect(checkInvariants(state)).toEqual([]);
    expect(() => replay(state, [], rules)).toThrow("UNIMPLEMENTED: replay");
    expect(() => deriveInitialState(new Uint8Array(32))).toThrow("UNIMPLEMENTED: PRNG derivation");
    expect(() => nextInt({ words: [0, 0, 0, 0], draws: 0 }, 6)).toThrow("UNIMPLEMENTED: PRNG draw");
  });
});
