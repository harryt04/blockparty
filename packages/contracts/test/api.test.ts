import { describe, expect, it } from "vitest";
import { CreateGameRequest, InviteStatusResponse, STANDARD_CONFIGURATION } from "../src/index";

const hostToken = { colorIndex: 1, pieceId: "piece-lantern", pattern: "solid" } as const;

describe("classic creation and admission contracts", () => {
  it("accepts host-inclusive human counts and rejects the historical total-seat field", () => {
    const request = {
      humanSeatCount: 2,
      botSeatCount: 1,
      hostName: "River",
      hostToken,
      preset: "standard" as const,
      configuration: STANDARD_CONFIGURATION,
      acknowledged13Plus: true as const,
    };

    expect(CreateGameRequest.parse(request)).toMatchObject({
      humanSeatCount: 2,
      botSeatCount: 1,
      hostName: "River",
      hostToken,
    });
    expect(CreateGameRequest.safeParse({ ...request, seatCount: 3 }).success).toBe(false);
  });

  it.each([
    { humanSeatCount: 1, botSeatCount: 0 },
    { humanSeatCount: 4, botSeatCount: 3 },
  ])("rejects a table outside the 2–6 seat boundary: %o", (counts) => {
    expect(
      CreateGameRequest.safeParse({
        ...counts,
        hostName: "River",
        hostToken,
        preset: "standard",
        configuration: STANDARD_CONFIGURATION,
        acknowledged13Plus: true,
      }).success,
    ).toBe(false);
  });

  it("accepts the six-seat upper boundary", () => {
    expect(
      CreateGameRequest.safeParse({
        humanSeatCount: 4,
        botSeatCount: 2,
        hostName: "River",
        hostToken,
        preset: "standard",
        configuration: STANDARD_CONFIGURATION,
        acknowledged13Plus: true,
      }).success,
    ).toBe(true);
  });

  it("requires the invite response to expose only structured available pieces", () => {
    const parsed = InviteStatusResponse.safeParse({
      status: "OPEN",
      openSeatCount: 1,
      seatCount: 2,
      availablePieces: [hostToken],
    });

    expect(parsed.success).toBe(true);
    expect(
      InviteStatusResponse.safeParse({
        status: "OPEN",
        availablePieces: [{ ...hostToken, pieceId: "piece-unknown" }],
      }).success,
    ).toBe(false);
  });
});
