import { describe, expect, it } from "vitest";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";
import { STANDARD_CONFIGURATION } from "@blockparty/contracts";
import {
  replay,
  resolve,
  transferDeed,
  type GameState,
  type RuleSet,
  type SeatState,
} from "../src/index";
import { deriveInitialState } from "../src/prng";

const SEED = Uint8Array.from(Array.from({ length: 32 }, (_, index) => (index * 37 + 5) & 0xff));
const RULES: RuleSet = { content: PLACEHOLDER_BUNDLE, configuration: STANDARD_CONFIGURATION };

const seat = (seatId: string, balance = 100_000): SeatState => ({
  seatId,
  kind: "human",
  status: "active",
  balance,
  position: 0,
  deedIds: [],
  detained: false,
  detentionTurnsRemaining: 0,
  detentionReleaseCardIds: [],
});

const stateWithDeed = (
  deedId = "d-sawhorse-lane",
  options: { balance?: number; phase?: GameState["phase"]; improvementLevel?: number } = {},
): GameState => ({
  stateSchemaVersion: "1.0.0",
  contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
  gameId: "game-a9",
  aggregateVersion: 0,
  phase: options.phase ?? "ResolveMove",
  seats: [{ ...seat("seat-a", options.balance ?? 100_000), deedIds: [deedId] }, seat("seat-b")],
  deeds: PLACEHOLDER_BUNDLE.deeds.map((deed) => ({
    deedId: deed.deedId,
    ownerSeatId: deed.deedId === deedId ? "seat-a" : undefined,
    mortgaged: false,
    improvementLevel: deed.deedId === deedId ? (options.improvementLevel ?? 0) : 0,
  })),
  bank: {
    cash: 20_000,
    deedIds: PLACEHOLDER_BUNDLE.deeds
      .map((deed) => deed.deedId)
      .filter((candidate) => candidate !== deedId),
    improvementInventory: { ...PLACEHOLDER_BUNDLE.economy.improvementInventory },
  },
  activeSeatId: "seat-a",
  prioritySeatId: "seat-a",
  consecutiveMatchingRolls: 0,
  effectQueue: [],
  prng: deriveInitialState(SEED),
});

const command = (
  state: GameState,
  type: "MortgageDeed" | "RedeemMortgage",
  deedId = "d-sawhorse-lane",
) => resolve(state, { actorSeatId: "seat-a", command: { type, deedId } }, RULES);

describe("A9 mortgages and transfer charges", () => {
  it("mortgages an eligible deed atomically and replays the ledger event", () => {
    const before = stateWithDeed();
    const result = command(before, "MortgageDeed");

    expect(result).toMatchObject({
      ok: true,
      events: [
        {
          type: "DeedMortgaged",
          payload: { deedId: "d-sawhorse-lane", ownerSeatId: "seat-a", amount: 6_000 },
        },
      ],
      state: { bank: { cash: 14_000 } },
    });
    if (!result.ok) throw new Error("expected mortgage to resolve");
    expect(result.state.seats[0]?.balance).toBe(106_000);
    expect(result.state.deeds.find((deed) => deed.deedId === "d-sawhorse-lane")).toMatchObject({
      ownerSeatId: "seat-a",
      mortgaged: true,
      improvementLevel: 0,
    });
    expect(replay(before, result.events, RULES)).toEqual(result.state);
    expect(Object.isFrozen(result.state)).toBe(true);
  });

  it("rejects mortgage while improved, already mortgaged, or outside the active seat", () => {
    expect(
      command(stateWithDeed("d-sawhorse-lane", { improvementLevel: 1 }), "MortgageDeed"),
    ).toMatchObject({
      ok: false,
      reasonCode: "IMPROVEMENT_PRESENT",
    });

    const districtImproved = stateWithDeed("d-sawhorse-lane");
    const withOtherImprovement: GameState = {
      ...districtImproved,
      deeds: districtImproved.deeds.map((deed) =>
        deed.deedId === "d-chalk-arrow-walk"
          ? { ...deed, ownerSeatId: "seat-a", improvementLevel: 1 }
          : deed,
      ),
      seats: districtImproved.seats.map((candidate) =>
        candidate.seatId === "seat-a"
          ? { ...candidate, deedIds: [...candidate.deedIds, "d-chalk-arrow-walk"] }
          : candidate,
      ),
    };
    expect(command(withOtherImprovement, "MortgageDeed")).toMatchObject({
      ok: false,
      reasonCode: "DISTRICT_HAS_IMPROVEMENTS",
    });

    const already = {
      ...stateWithDeed(),
      deeds: stateWithDeed().deeds.map((deed) =>
        deed.deedId === "d-sawhorse-lane" ? { ...deed, mortgaged: true } : deed,
      ),
    };
    expect(command(already, "MortgageDeed")).toMatchObject({
      ok: false,
      reasonCode: "DEED_ALREADY_MORTGAGED",
    });

    expect(
      resolve(
        { ...stateWithDeed(), activeSeatId: "seat-b" },
        { actorSeatId: "seat-b", command: { type: "MortgageDeed", deedId: "d-sawhorse-lane" } },
        RULES,
      ),
    ).toMatchObject({ ok: false, reasonCode: "DEED_NOT_OWNED" });
  });

  it("allows only the debtor to mortgage during an obligation", () => {
    const before: GameState = {
      ...stateWithDeed("d-sawhorse-lane", { phase: "AwaitDebt" }),
      obligation: {
        debtorSeatId: "seat-a",
        creditorSeatId: "seat-b",
        amount: 200_000,
        reasonCode: "RENT_DUE",
        continuation: [],
      },
    };
    const result = command(before, "MortgageDeed");
    expect(result).toMatchObject({ ok: true, state: { phase: "AwaitDebt" } });
    if (!result.ok) throw new Error("expected debt mortgage to resolve");
    expect(result.state.obligation).toEqual(before.obligation);

    expect(
      resolve(
        before,
        { actorSeatId: "seat-b", command: { type: "MortgageDeed", deedId: "d-sawhorse-lane" } },
        RULES,
      ),
    ).toMatchObject({ ok: false, reasonCode: "OUT_OF_TURN" });
  });

  it("redeems at mortgage value plus the content-defined charge and remains atomic", () => {
    const before = stateWithDeed();
    const mortgaged = command(before, "MortgageDeed");
    if (!mortgaged.ok) throw new Error("expected mortgage to resolve");
    const result = command(mortgaged.state, "RedeemMortgage");

    expect(result).toMatchObject({
      ok: true,
      events: [
        {
          type: "MortgageRedeemed",
          payload: {
            deedId: "d-sawhorse-lane",
            amount: 12_600,
            mortgageValue: 6_000,
            redemptionCharge: 6_600,
          },
        },
      ],
    });
    if (!result.ok) throw new Error("expected redemption to resolve");
    expect(result.state.seats[0]?.balance).toBe(93_400);
    expect(result.state.bank.cash).toBe(26_600);
    expect(result.state.deeds.find((deed) => deed.deedId === "d-sawhorse-lane")?.mortgaged).toBe(
      false,
    );
    expect(replay(before, [...mortgaged.events, ...result.events], RULES)).toEqual(result.state);

    const poor = stateWithDeed("d-sawhorse-lane", { balance: 500 });
    const poorMortgaged = command(poor, "MortgageDeed");
    if (!poorMortgaged.ok) throw new Error("expected poor seat mortgage to resolve");
    const rejected = command(poorMortgaged.state, "RedeemMortgage");
    expect(rejected).toMatchObject({ ok: false, reasonCode: "INSUFFICIENT_FUNDS" });
    expect(poorMortgaged.state.seats[0]?.balance).toBe(6_500);
    expect(poorMortgaged.state.bank.cash).toBe(14_000);
  });

  it("keeps mortgaged deeds mortgaged and charges the recipient without negative cash", () => {
    const mortgaged = command(stateWithDeed(), "MortgageDeed");
    if (!mortgaged.ok) throw new Error("expected mortgage to resolve");
    const recipient = {
      ...mortgaged.state,
      seats: mortgaged.state.seats.map((candidate) =>
        candidate.seatId === "seat-b" ? { ...candidate, balance: 500 } : candidate,
      ),
    };
    const result = transferDeed(recipient, "seat-a", "seat-b", "d-sawhorse-lane", RULES);

    expect(result).toMatchObject({
      ok: true,
      state: {
        phase: "AwaitDebt",
        obligation: {
          debtorSeatId: "seat-b",
          amount: 600,
          reasonCode: "MORTGAGED_DEED_TRANSFER_CHARGE",
        },
      },
      events: [{ type: "DeedTransferred" }, { type: "ObligationCreated" }],
    });
    if (!result.ok) throw new Error("expected transfer to resolve");
    expect(result.state.seats[1]?.balance).toBe(500);
    expect(result.state.deeds.find((deed) => deed.deedId === "d-sawhorse-lane")).toMatchObject({
      ownerSeatId: "seat-b",
      mortgaged: true,
    });
    expect(replay(recipient, result.events, RULES)).toEqual(result.state);

    const solvent = {
      ...mortgaged.state,
      seats: mortgaged.state.seats.map((candidate) =>
        candidate.seatId === "seat-b" ? { ...candidate, balance: 1_000 } : candidate,
      ),
    };
    const paid = transferDeed(solvent, "seat-a", "seat-b", "d-sawhorse-lane", RULES);
    expect(paid).toMatchObject({
      ok: true,
      events: [{ type: "DeedTransferred", payload: { chargePaid: 600 } }],
    });
    if (!paid.ok) throw new Error("expected charged transfer to resolve");
    expect(paid.state.seats[1]?.balance).toBe(400);
    expect(paid.state.bank.cash).toBe(14_600);
  });
});
