import { expect, test, type Page } from "@playwright/test";
import {
  GameSnapshotProjection,
  STANDARD_CONFIGURATION,
  type GameSnapshotProjection as GameSnapshotProjectionType,
} from "@blockparty/contracts";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";

// Browser evidence for PRD-FUN-006–010, PROTO-002, and UX-013–017.
const GAME_ID = "00000000-0000-4000-8000-000000000054";

function snapshot(phase: GameSnapshotProjectionType["phase"], sequence: number) {
  const deeds = new Map(PLACEHOLDER_BUNDLE.deeds.map((deed) => [deed.deedId, deed]));
  const category = {
    start: "start",
    deed: "deed",
    eventDraw: "eventDraw",
    fee: "fee",
    rest: "rest",
    detention: "detention",
    sendToDetention: "sendToDetention",
  } as const;
  const board = PLACEHOLDER_BUNDLE.spaces.map((space) => {
    const deed = space.deedId === undefined ? undefined : deeds.get(space.deedId);
    return {
      spaceId: space.spaceId,
      routeIndex: space.routeIndex,
      name: space.name,
      category: category[space.type],
      ...(deed === undefined
        ? {}
        : {
            deedId: deed.deedId,
            deedCategory: deed.category,
            ...(deed.districtId === undefined ? {} : { districtId: deed.districtId }),
            price: deed.price,
            mortgaged: false,
            improvementLevel: 0,
          }),
      occupantSeatIds: space.routeIndex === 1 ? ["seat-a"] : [],
    };
  });
  const legalActions =
    phase === "TurnStart"
      ? [{ type: "RollDice" as const }]
      : [
          {
            type: "AcquireDeed" as const,
            constraints: { deedId: "d-sawhorse-lane" },
          },
          {
            type: "DeclineAcquisition" as const,
            constraints: { deedId: "d-sawhorse-lane" },
          },
        ];
  const projected = {
    gameId: GAME_ID,
    status: "ACTIVE" as const,
    phase,
    aggregateVersion: sequence,
    sequence,
    versions: {
      contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
      rulesSchemaVersion: PLACEHOLDER_BUNDLE.rulesSchemaVersion,
      variantSchemaVersion: PLACEHOLDER_BUNDLE.variantSchemaVersion,
      stateSchemaVersion: "1.0.0",
      engineVersion: "0.1.0",
    },
    viewerSeatId: "seat-a",
    activeSeatId: "seat-a",
    seats: [
      {
        seatId: "seat-a",
        name: "North Star",
        kind: "human" as const,
        status: "active" as const,
        token: { colorIndex: 1, shape: "barricade" as const, pattern: "solid" as const },
        balance: 145000,
        position: 1,
        deedIds: [],
        isHost: true,
        connected: true,
        isSelf: true,
      },
      {
        seatId: "seat-b",
        name: "Side Street",
        kind: "human" as const,
        status: "active" as const,
        token: { colorIndex: 2, shape: "cooler" as const, pattern: "stripe" as const },
        balance: 155000,
        position: 4,
        deedIds: [],
        isHost: false,
        connected: true,
        isSelf: false,
      },
    ],
    board,
    bank: { cash: 700000, deedIds: [], improvementInventory: {} },
    legalActions,
    actionAvailability: [],
    recovery: {
      safeBoundary: true,
      replacementSeatIds: [],
      viewerCanRequestReclaim: false,
      viewerCanClaimHost: false,
    },
    paused: false,
    expiresAt: "2026-10-03T15:00:00.000Z",
    configuration: STANDARD_CONFIGURATION,
  } satisfies GameSnapshotProjectionType;
  const parsed = GameSnapshotProjection.safeParse(projected);
  if (!parsed.success) throw new Error(parsed.error.message);
  return projected;
}

async function mockLiveStream(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class FakeEventSource extends EventTarget {
      onerror: ((event: Event) => void) | null = null;
      onopen: ((event: Event) => void) | null = null;

      constructor(readonly url: string) {
        super();
        setTimeout(() => this.onopen?.(new Event("open")), 0);
      }

      close(): void {}
    }
    Object.defineProperty(window, "EventSource", { value: FakeEventSource });
  });
}

async function mockGameApi(page: Page): Promise<{ commands: unknown[] }> {
  let phase: GameSnapshotProjectionType["phase"] = "TurnStart";
  let sequence = 1;
  const commands: unknown[] = [];
  await page.route(`**/api/games/${GAME_ID}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/bootstrap") || path.endsWith("/sync")) {
      const projected = snapshot(phase, sequence);
      await route.fulfill({
        json: path.endsWith("/bootstrap")
          ? {
              snapshot: projected,
              aggregateVersion: sequence,
              sequence,
              serverTime: "2026-09-03T15:00:00.000Z",
            }
          : {
              protocolVersion: 1,
              type: "game.snapshot",
              gameId: GAME_ID,
              serverTime: "2026-09-03T15:00:00.000Z",
              aggregateVersion: sequence,
              sequence,
              snapshot: projected,
            },
      });
      return;
    }
    if (path.endsWith("/commands")) {
      const command = JSON.parse(route.request().postData() ?? "{}");
      commands.push(command);
      if (command.payload.type === "RollDice") {
        phase = "AwaitPurchase";
        sequence = 2;
      }
      await route.fulfill({
        json: {
          protocolVersion: 1,
          type: "game.commandAck",
          gameId: GAME_ID,
          serverTime: "2026-09-03T15:00:00.000Z",
          commandId: command.commandId,
          accepted: true,
          aggregateVersion: sequence,
          firstSequence: sequence,
          lastSequence: sequence,
        },
      });
      return;
    }
    await route.fulfill({
      status: 404,
      json: { error: { code: "NOT_FOUND", message: "Not found" } },
    });
  });
  return { commands };
}

test("a player can roll and acquire the current Address", async ({ page }) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Open action sheet" }).click();
  await page.getByRole("button", { name: "Roll and advance" }).click();
  await expect.poll(() => commands.length).toBe(1);
  await expect(page.getByText("Await Purchase", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Open action sheet" }).click();
  await page.getByRole("button", { name: "Acquire this Address" }).click();
  await expect.poll(() => commands.length).toBe(2);
  expect((commands[0] as { payload: { type: string } }).payload.type).toBe("RollDice");
  expect((commands[1] as { payload: { type: string; deedId: string } }).payload).toEqual({
    type: "AcquireDeed",
    deedId: "d-sawhorse-lane",
  });
});
