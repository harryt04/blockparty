import { describe, expect, it } from "vitest";
import { STANDARD_CONFIGURATION, type LobbyProjection } from "@blockparty/contracts";
import { configurationValues, inviteUrl, lobbyIsReady } from "../src/components/game/lobby-model";

function lobby(overrides: Partial<LobbyProjection> = {}): LobbyProjection {
  return {
    gameId: "00000000-0000-4000-8000-000000000004",
    status: "LOBBY",
    seatCount: 2,
    seats: [
      {
        seatId: "seat-a",
        name: "Host",
        kind: "human",
        status: "active",
        isHost: true,
        connected: true,
        isSelf: true,
      },
      {
        seatId: "seat-b",
        kind: "open",
        status: "active",
        isHost: false,
        connected: false,
        isSelf: false,
      },
    ],
    configuration: STANDARD_CONFIGURATION,
    versions: {
      contentVersion: "1.0.0",
      rulesSchemaVersion: "1.0.0",
      variantSchemaVersion: "1.0.0",
      stateSchemaVersion: "1.0.0",
      engineVersion: "0.1.0",
    },
    viewerSeatId: "seat-a",
    viewerIsHost: true,
    invitePath: "/join/abcdefghijklmnopqrstuvwxyz123456",
    canStart: false,
    startBlockedReason: "Every seat must be filled by a person or bot.",
    expiresAt: "2026-10-03T15:00:00.000Z",
    ...overrides,
  };
}

describe("lobby presentation model", () => {
  it("does not report an open-seat lobby as ready", () => {
    expect(lobbyIsReady(lobby())).toBe(false);
    expect(lobbyIsReady(lobby({ canStart: true }))).toBe(false);
    expect(
      lobbyIsReady(
        lobby({
          canStart: true,
          seats: lobby().seats.map((seat) =>
            seat.kind === "open" ? { ...seat, kind: "bot" as const, name: "Bot" } : seat,
          ),
        }),
      ),
    ).toBe(true);
  });

  it("keeps all eight variant values at the presentation boundary", () => {
    expect(Object.keys(configurationValues(STANDARD_CONFIGURATION))).toHaveLength(8);
    expect(configurationValues(STANDARD_CONFIGURATION).startingAssetsDealt).toBe(false);
  });

  it("constructs only an opaque invite URL and rejects another route", () => {
    expect(inviteUrl(lobby().invitePath!, "https://play.example")).toBe(
      "https://play.example/join/abcdefghijklmnopqrstuvwxyz123456",
    );
    expect(inviteUrl("/game/private", "https://play.example")).toBeUndefined();
  });
});
