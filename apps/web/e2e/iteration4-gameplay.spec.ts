import { expect, test, type Page } from "@playwright/test";
import {
  GameSnapshotProjection,
  STANDARD_CONFIGURATION,
  type DomainEvent,
  type GameSnapshotProjection as GameSnapshotProjectionType,
} from "@blockparty/contracts";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";

// Browser evidence for PRD-FUN-006–010, PROTO-002, and UX-013–017.
const GAME_ID = "00000000-0000-4000-8000-000000000054";

// Keep the mocked API boundary authoritative in every browser. WebKit can
// otherwise let a previously registered service worker bypass page routes.
test.use({ serviceWorkers: "block" });

function snapshot(
  phase: GameSnapshotProjectionType["phase"],
  sequence: number,
  overrides: Partial<GameSnapshotProjectionType> = {},
) {
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
        token: { colorIndex: 1, pieceId: "piece-lantern" as const, pattern: "solid" as const },
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
        token: { colorIndex: 2, pieceId: "piece-key" as const, pattern: "stripe" as const },
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
    ...overrides,
  } satisfies GameSnapshotProjectionType;
  const parsed = GameSnapshotProjection.safeParse(projected);
  if (!parsed.success) throw new Error(parsed.error.message);
  return projected;
}

function event(
  type: DomainEvent["type"],
  sequence: number,
  payload: Record<string, unknown> = {},
  actorSeatId?: string,
): DomainEvent {
  return {
    gameId: GAME_ID,
    sequence,
    aggregateVersion: sequence,
    type,
    eventVersion: 1,
    ...(actorSeatId === undefined ? {} : { actorSeatId }),
    occurredAt: "2026-09-03T15:00:00.000Z",
    payload,
  };
}

async function mockLiveStream(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sources: FakeEventSource[] = [];
    class FakeEventSource extends EventTarget {
      onerror: ((event: Event) => void) | null = null;
      onopen: ((event: Event) => void) | null = null;

      constructor(readonly url: string) {
        super();
        sources.push(this);
        setTimeout(() => this.onopen?.(new Event("open")), 0);
      }

      emit(type: string, data: unknown): void {
        this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
      }

      close(): void {}
    }
    Object.defineProperty(window, "__emitGameEnvelope", {
      value: (envelope: unknown) => {
        for (const source of sources) source.emit("game.snapshot", envelope);
      },
      configurable: true,
    });
    Object.defineProperty(window, "__emitGameConnectionError", {
      value: () => sources.at(-1)?.onerror?.(new Event("error")),
      configurable: true,
    });
    Object.defineProperty(window, "EventSource", { value: FakeEventSource });
  });
}

async function mockGameApi(
  page: Page,
  options: {
    readonly failFirstCommand?: boolean;
    readonly delayAuthoritativeResult?: boolean;
  } = {},
): Promise<{ commands: unknown[] }> {
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
      if (options.failFirstCommand === true && commands.length === 1) {
        await route.abort("connectionreset");
        return;
      }
      if (command.payload.type === "RollDice") {
        phase = "AwaitPurchase";
        sequence = 2;
      } else if (options.delayAuthoritativeResult === true) {
        // Model a committed command whose newer snapshot has not reached the
        // client yet, so retry identity retention is exercised independently
        // from the normal SSE delivery path.
        sequence += 1;
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
      if (command.payload.type === "RollDice") {
        void page.evaluate(
          (envelope) => {
            (
              window as unknown as {
                __emitGameEnvelope?: (value: unknown) => void;
              }
            ).__emitGameEnvelope?.(envelope);
          },
          {
            protocolVersion: 1,
            type: "game.snapshot",
            gameId: GAME_ID,
            serverTime: "2026-09-03T15:00:00.000Z",
            aggregateVersion: sequence,
            sequence,
            snapshot: snapshot(phase, sequence),
          },
        );
      }
      return;
    }
    await route.fulfill({
      status: 404,
      json: { error: { code: "NOT_FOUND", message: "Not found" } },
    });
  });
  return { commands };
}

async function emitSnapshot(page: Page, projected: GameSnapshotProjectionType): Promise<void> {
  await page.evaluate(
    (envelope) => {
      (
        window as unknown as {
          __emitGameEnvelope?: (value: unknown) => void;
        }
      ).__emitGameEnvelope?.(envelope);
    },
    {
      protocolVersion: 1,
      type: "game.snapshot",
      gameId: GAME_ID,
      serverTime: "2026-09-03T15:00:00.000Z",
      aggregateVersion: projected.aggregateVersion,
      sequence: projected.sequence,
      snapshot: projected,
    },
  );
}

test("a player can roll and acquire the current Address", async ({ page }) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Open action sheet" }).click();
  await page.getByRole("button", { name: "Roll and advance" }).click();
  await expect.poll(() => commands.length).toBe(1);
  await expect(page.getByText("Await Purchase · 2 players ·", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Acquire this Address" }).click();
  await expect.poll(() => commands.length).toBe(2);
  expect((commands[0] as { payload: { type: string } }).payload.type).toBe("RollDice");
  expect((commands[1] as { payload: { type: string; deedId: string } }).payload).toEqual({
    type: "AcquireDeed",
    deedId: "d-sawhorse-lane",
  });
});

test("acquisition decision exposes only its foreground choices", async ({ page }) => {
  await mockLiveStream(page);
  await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("AwaitPurchase", 1, {
      legalActions: [
        { type: "AcquireDeed", constraints: { deedId: "d-sawhorse-lane" } },
        { type: "DeclineAcquisition", constraints: { deedId: "d-sawhorse-lane" } },
        // A malformed projection must not let an unrelated primary action leak
        // into the foreground decision surface.
        { type: "RollDice" },
      ],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Acquire an Address");
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  await expect(dialog.getByRole("button", { name: "Acquire this Address" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Decline and open the auction" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Roll and advance" })).toHaveCount(0);
});

test("auction decision exposes only its foreground choices", async ({ page }) => {
  await mockLiveStream(page);
  await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("AwaitAuction", 1, {
      prioritySeatId: "seat-a",
      auction: {
        deedId: "d-sawhorse-lane",
        minimumNextBid: 4_001,
        prioritySeatId: "seat-a",
        passedSeatIds: [],
      },
      legalActions: [
        {
          type: "PlaceAuctionBid",
          constraints: { minBid: 4_001, maxBid: 145_000 },
        },
        { type: "PassAuction" },
        // A malformed projection must not let an unrelated primary action leak
        // into the foreground decision surface.
        { type: "RollDice" },
      ],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  await expect(dialog).toContainText("Untimed Address auction");
  await expect(dialog.getByLabel("Place bid")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Pass on this auction" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Roll and advance" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Acquire this Address" })).toHaveCount(0);
});

test("decision sheet returns focus after its command finishes", async ({ page }) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Open action sheet" }).click();
  await page.getByRole("button", { name: "Roll and advance" }).click();
  await expect(page.getByText("Await Purchase · 2 players ·", { exact: false })).toBeVisible();

  const trigger = page.getByRole("button", { name: "Open action sheet" });
  await page.getByRole("button", { name: "Decline and open the auction" }).click();
  await expect.poll(() => commands.length).toBe(2);
  await expect(trigger).toBeFocused();
});

test("same-task activation submits a game command only once", async ({ page }) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  const actionSheetButton = page.getByRole("button", { name: "Open action sheet" });
  await actionSheetButton.click();
  const rollButton = page.getByRole("button", { name: "Roll and advance" });
  await rollButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });

  await expect.poll(() => commands.length).toBe(1);
  await expect(page.getByText("Await Purchase · 2 players ·", { exact: false })).toBeVisible();
  expect((commands[0] as { payload: { type: string } }).payload.type).toBe("RollDice");
});

test("same-task acquisition activation submits a game command only once", async ({ page }) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("AwaitPurchase", 1);
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  const acquire = page.getByRole("button", { name: "Acquire this Address" });
  await acquire.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });

  await expect.poll(() => commands.length).toBe(1);
  expect((commands[0] as { payload: { type: string; deedId: string } }).payload).toEqual({
    type: "AcquireDeed",
    deedId: "d-sawhorse-lane",
  });
});

test("same-task pending-trade acceptance submits a game command only once", async ({ page }) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("TurnStart", 1, {
      pendingTrade: {
        tradeId: "trade-same-task-1",
        proposerSeatId: "seat-b",
        counterpartySeatId: "seat-a",
        offered: { cash: 2_000, deedIds: [], detentionReleaseCardIds: [] },
        requested: { cash: 0, deedIds: [], detentionReleaseCardIds: [] },
        proposerBalance: 153_000,
        counterpartyBalance: 145_000,
        aggregateVersion: 1,
      },
      legalActions: [
        { type: "AcceptTrade", constraints: { tradeId: "trade-same-task-1" } },
        { type: "RejectTrade", constraints: { tradeId: "trade-same-task-1" } },
      ],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  const accept = page.getByRole("button", { name: "Accept this trade" });
  await accept.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });

  await expect.poll(() => commands.length).toBe(1);
  expect((commands[0] as { payload: { type: string; tradeId: string } }).payload).toEqual({
    type: "AcceptTrade",
    tradeId: "trade-same-task-1",
  });
});

test("same-task pending-trade rejection submits a game command only once", async ({ page }) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("TurnStart", 1, {
      pendingTrade: {
        tradeId: "trade-reject-same-task-1",
        proposerSeatId: "seat-b",
        counterpartySeatId: "seat-a",
        offered: { cash: 2_000, deedIds: [], detentionReleaseCardIds: [] },
        requested: { cash: 0, deedIds: [], detentionReleaseCardIds: [] },
        proposerBalance: 153_000,
        counterpartyBalance: 145_000,
        aggregateVersion: 1,
      },
      legalActions: [
        { type: "AcceptTrade", constraints: { tradeId: "trade-reject-same-task-1" } },
        { type: "RejectTrade", constraints: { tradeId: "trade-reject-same-task-1" } },
      ],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  const reject = page.getByRole("button", { name: "Reject this trade" });
  await reject.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });

  await expect.poll(() => commands.length).toBe(1);
  expect((commands[0] as { payload: { type: string; tradeId: string } }).payload).toEqual({
    type: "RejectTrade",
    tradeId: "trade-reject-same-task-1",
  });
});

test("same-task auction bidding submits a game command only once", async ({ page }) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("AwaitAuction", 1, {
      prioritySeatId: "seat-a",
      auction: {
        deedId: "d-sawhorse-lane",
        minimumNextBid: 4_001,
        prioritySeatId: "seat-a",
        passedSeatIds: [],
      },
      legalActions: [
        {
          type: "PlaceAuctionBid",
          constraints: { minBid: 4_001, maxBid: 145_000 },
        },
        { type: "PassAuction" },
      ],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  const bid = page.getByRole("button", { name: "Submit bid" });
  await bid.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });

  await expect.poll(() => commands.length).toBe(1);
  expect((commands[0] as { payload: { type: string; amount: number } }).payload).toEqual({
    type: "PlaceAuctionBid",
    amount: 4_001,
  });
});

test("same-task detention choice submits a game command only once", async ({ page }) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("AwaitChoice", 1, {
      seats: snapshot("AwaitChoice", 1).seats.map((seat) =>
        seat.seatId === "seat-a" ? { ...seat, detained: true, detentionTurnsRemaining: 2 } : seat,
      ),
      legalActions: [
        {
          type: "ChoosePendingOption",
          constraints: { choiceId: "choice-same-task", optionId: "attempt-roll" },
        },
      ],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  const attempt = page.getByRole("button", { name: "Attempt a matching roll" });
  await attempt.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });

  await expect.poll(() => commands.length).toBe(1);
  expect((commands[0] as { payload: unknown }).payload).toEqual({
    type: "ChoosePendingOption",
    choiceId: "choice-same-task",
    optionId: "attempt-roll",
  });
});

test("same-task bankruptcy confirmation submits a game command only once", async ({ page }) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("AwaitChoice", 1, {
      obligation: {
        debtorSeatId: "seat-a",
        creditorSeatId: "seat-b",
        amount: 200_000,
        reasonCode: "RENT_DUE",
        reason: "Rent is due to Side Street.",
      },
      legalActions: [{ type: "DeclareBankruptcy" }],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Declare bankruptcy" }).click();
  const confirm = page.getByRole("button", { name: "Confirm bankruptcy" });
  await confirm.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });

  await expect.poll(() => commands.length).toBe(1);
  expect((commands[0] as { payload: unknown }).payload).toEqual({
    type: "DeclareBankruptcy",
  });
});

test("a retry after a lost response reuses the command identity", async ({ page }) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page, { failFirstCommand: true });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Open action sheet" }).click();
  await page.getByRole("button", { name: "Roll and advance" }).click();
  await expect(
    page.getByText("The action could not be sent. Check your connection and try again.", {
      exact: true,
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Open action sheet" }).click();
  await page.getByRole("button", { name: "Roll and advance" }).click();
  await expect.poll(() => commands.length).toBe(2);
  expect(commands[1]).toMatchObject({
    commandId: (commands[0] as { commandId: string }).commandId,
    requestId: (commands[0] as { requestId: string }).requestId,
  });
  await expect(page.getByText("Await Purchase · 2 players ·", { exact: false })).toBeVisible();
});

test("a retry before the authoritative result reuses the acknowledged command identity", async ({
  page,
}) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page, { delayAuthoritativeResult: true });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Open action sheet" }).click();
  await page.getByRole("button", { name: "Roll and advance" }).click();
  await expect(page.getByText("Await Purchase · 2 players ·", { exact: false })).toBeVisible();

  const acquire = page.getByRole("button", { name: "Acquire this Address" });
  await acquire.click();
  await expect.poll(() => commands.length).toBe(2);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Action accepted. Waiting for the authoritative result." })
      .first(),
  ).toBeVisible();

  // The mocked command acknowledgement arrives without a newer snapshot. Re-open
  // the still-visible legal action and verify this retry remains idempotent.
  await page.getByRole("button", { name: "Open action sheet" }).click();
  await page.getByRole("button", { name: "Acquire this Address" }).click();
  await expect.poll(() => commands.length).toBe(3);
  expect(commands[2]).toMatchObject({
    commandId: (commands[1] as { commandId: string }).commandId,
    requestId: (commands[1] as { requestId: string }).requestId,
  });
});

test("auction decision exposes context, bounds bids, and prevents duplicate submission", async ({
  page,
}) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("AwaitAuction", 1, {
      prioritySeatId: "seat-a",
      auction: {
        deedId: "d-sawhorse-lane",
        minimumNextBid: 4_001,
        prioritySeatId: "seat-a",
        passedSeatIds: [],
      },
      legalActions: [
        {
          type: "PlaceAuctionBid",
          constraints: { minBid: 4_001, maxBid: 145_000 },
        },
        { type: "PassAuction" },
      ],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Untimed Address auction");
  await expect(dialog).toContainText("Minimum next bid");
  await expect(dialog).toContainText("40.01 Tabs");
  await expect(dialog.getByLabel("Place bid")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Pass on this auction" })).toBeVisible();

  const bid = dialog.getByRole("button", { name: "Submit bid" });
  await bid.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });
  await expect.poll(() => commands.length).toBe(1);
  expect((commands[0] as { payload: { type: string; amount: number } }).payload).toEqual({
    type: "PlaceAuctionBid",
    amount: 4_001,
  });
});

test("an acknowledged auction retry reuses its command identity", async ({ page }) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page, { delayAuthoritativeResult: true });
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("AwaitAuction", 1, {
      prioritySeatId: "seat-a",
      auction: {
        deedId: "d-sawhorse-lane",
        minimumNextBid: 4_001,
        prioritySeatId: "seat-a",
        passedSeatIds: [],
      },
      legalActions: [
        {
          type: "PlaceAuctionBid",
          constraints: { minBid: 4_001, maxBid: 145_000 },
        },
        { type: "PassAuction" },
      ],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  const bid = page.getByRole("button", { name: "Submit bid" });
  await bid.click();
  await expect.poll(() => commands.length).toBe(1);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Action accepted. Waiting for the authoritative result." })
      .first(),
  ).toBeVisible();

  // The acknowledgement is accepted without a newer authoritative snapshot.
  // Retrying the still-visible bid must preserve both capability-safe IDs.
  await page.getByRole("button", { name: "Open action sheet" }).click();
  await page.getByRole("button", { name: "Submit bid" }).click();
  await expect.poll(() => commands.length).toBe(2);
  expect(commands[1]).toMatchObject({
    commandId: (commands[0] as { commandId: string }).commandId,
    requestId: (commands[0] as { requestId: string }).requestId,
  });
});

test("an acknowledged pending-trade retry reuses its command identity", async ({ page }) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page, { delayAuthoritativeResult: true });
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("TurnStart", 1, {
      pendingTrade: {
        tradeId: "trade-ack-retry-1",
        proposerSeatId: "seat-b",
        counterpartySeatId: "seat-a",
        offered: { cash: 2_000, deedIds: [], detentionReleaseCardIds: [] },
        requested: { cash: 0, deedIds: [], detentionReleaseCardIds: [] },
        proposerBalance: 153_000,
        counterpartyBalance: 145_000,
        aggregateVersion: 1,
      },
      legalActions: [
        { type: "AcceptTrade", constraints: { tradeId: "trade-ack-retry-1" } },
        { type: "RejectTrade", constraints: { tradeId: "trade-ack-retry-1" } },
      ],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  const accept = page.getByRole("button", { name: "Accept this trade" });
  await accept.click();
  await expect.poll(() => commands.length).toBe(1);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Action accepted. Waiting for the authoritative result." })
      .first(),
  ).toBeVisible();

  // The acknowledgement arrives without a newer snapshot. Retrying the still-visible
  // offer must preserve both capability-safe IDs and remain idempotent.
  // Pending-trade response controls live in the decision card rather than the
  // action sheet, so the still-visible response is directly retryable.
  await page.getByRole("button", { name: "Accept this trade" }).click();
  await expect.poll(() => commands.length).toBe(2);
  expect(commands[1]).toMatchObject({
    commandId: (commands[0] as { commandId: string }).commandId,
    requestId: (commands[0] as { requestId: string }).requestId,
  });
});

test("an acknowledged pending-trade rejection retry reuses its command identity", async ({
  page,
}) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page, { delayAuthoritativeResult: true });
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("TurnStart", 1, {
      pendingTrade: {
        tradeId: "trade-reject-ack-retry-1",
        proposerSeatId: "seat-b",
        counterpartySeatId: "seat-a",
        offered: { cash: 2_000, deedIds: [], detentionReleaseCardIds: [] },
        requested: { cash: 0, deedIds: [], detentionReleaseCardIds: [] },
        proposerBalance: 153_000,
        counterpartyBalance: 145_000,
        aggregateVersion: 1,
      },
      legalActions: [
        { type: "AcceptTrade", constraints: { tradeId: "trade-reject-ack-retry-1" } },
        { type: "RejectTrade", constraints: { tradeId: "trade-reject-ack-retry-1" } },
      ],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  const reject = page.getByRole("button", { name: "Reject this trade" });
  await reject.click();
  await expect.poll(() => commands.length).toBe(1);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Action accepted. Waiting for the authoritative result." })
      .first(),
  ).toBeVisible();

  // The acknowledgement arrives without a newer authoritative snapshot.
  // Retrying the still-visible rejection must preserve both capability-safe IDs.
  await reject.click();
  await expect.poll(() => commands.length).toBe(2);
  expect(commands[1]).toMatchObject({
    commandId: (commands[0] as { commandId: string }).commandId,
    requestId: (commands[0] as { requestId: string }).requestId,
  });
});

test("paused auction preserves context, disables bid or pass, and submits nothing", async ({
  page,
}) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("AwaitAuction", 1, {
      prioritySeatId: "seat-b",
      paused: true,
      seats: snapshot("AwaitAuction", 1).seats.map((seat) =>
        seat.seatId === "seat-b" ? { ...seat, connected: false } : seat,
      ),
      auction: {
        deedId: "d-sawhorse-lane",
        highBid: 4_000,
        highBidderSeatId: "seat-b",
        minimumNextBid: 4_001,
        prioritySeatId: "seat-b",
        passedSeatIds: [],
      },
      legalActions: [
        {
          type: "PlaceAuctionBid",
          constraints: { minBid: 4_001, maxBid: 145_000 },
        },
        { type: "PassAuction" },
      ],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Sawhorse Lane");
  await expect(dialog).toContainText("Current bid");
  await expect(dialog).toContainText("40 Tabs");
  await expect(dialog).toContainText("Minimum next bid");
  await expect(dialog).toContainText("40.01 Tabs");
  await expect(dialog).toContainText("Your cash");
  await expect(dialog).toContainText("1,450 Tabs");
  await expect(dialog.getByText("Auction paused while Side Street reconnects.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Submit bid" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Pass on this auction" })).toBeDisabled();
  await expect(page.getByRole("note").filter({ hasText: "Play is paused" })).toBeVisible();
  expect(commands).toHaveLength(0);
});

test("paused acquisition keeps property context visible without submitting a choice", async ({
  page,
}) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("AwaitPurchase", 1, {
      paused: true,
      seats: snapshot("AwaitPurchase", 1).seats.map((seat) =>
        seat.seatId === "seat-a" ? { ...seat, connected: false } : seat,
      ),
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Acquire an Address");
  await expect(dialog).toContainText("Sawhorse Lane");
  await expect(dialog).toContainText("Price");
  await expect(dialog).toContainText("120 Tabs");
  await expect(dialog.getByRole("button", { name: "Acquire this Address" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Decline and open the auction" })).toBeDisabled();
  await expect(page.getByRole("note").filter({ hasText: "Play is paused" })).toBeVisible();
  expect(commands).toHaveLength(0);
});

test("reconnected acquisition re-enables the authoritative choice", async ({ page }) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("AwaitPurchase", 1, {
      paused: true,
      seats: snapshot("AwaitPurchase", 1).seats.map((seat) =>
        seat.seatId === "seat-a" ? { ...seat, connected: false } : seat,
      ),
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  const dialog = page.getByRole("dialog");
  const acquire = dialog.getByRole("button", { name: "Acquire this Address" });
  await expect(acquire).toBeDisabled();
  await expect(page.getByRole("note").filter({ hasText: "Play is paused" })).toBeVisible();

  await emitSnapshot(
    page,
    snapshot("AwaitPurchase", 2, {
      paused: false,
      seats: snapshot("AwaitPurchase", 2).seats,
    }),
  );

  await expect(page.getByRole("note").filter({ hasText: "Play is paused" })).toHaveCount(0);
  await expect(acquire).toBeEnabled();
  await acquire.click();
  await expect.poll(() => commands.length).toBe(1);
  expect((commands[0] as { payload: unknown }).payload).toEqual({
    type: "AcquireDeed",
    deedId: "d-sawhorse-lane",
  });
});

test("transport loss disables an open acquisition decision without submitting", async ({
  page,
}) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("AwaitPurchase", 1);
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  const acquire = page.getByRole("button", { name: "Acquire this Address" });
  await expect(acquire).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __emitGameConnectionError?: () => void }).__emitGameConnectionError?.();
  });

  await expect(
    page.getByRole("alert").filter({ hasText: "Connection lost. Reconnecting" }),
  ).toBeVisible();
  await expect(acquire).toBeDisabled();
  expect(commands).toHaveLength(0);
});

test("transport loss disables an open auction decision without submitting", async ({ page }) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("AwaitAuction", 1, {
      prioritySeatId: "seat-a",
      auction: {
        deedId: "d-sawhorse-lane",
        highBid: 4_000,
        highBidderSeatId: "seat-b",
        minimumNextBid: 4_001,
        prioritySeatId: "seat-a",
        passedSeatIds: [],
      },
      legalActions: [
        {
          type: "PlaceAuctionBid",
          constraints: { minBid: 4_001, maxBid: 145_000 },
        },
        { type: "PassAuction" },
      ],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  const dialog = page.getByRole("dialog");
  const bid = dialog.getByRole("button", { name: "Submit bid" });
  const pass = dialog.getByRole("button", { name: "Pass on this auction" });
  await expect(dialog).toContainText("Sawhorse Lane");
  await expect(bid).toBeVisible();
  await expect(pass).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { __emitGameConnectionError?: () => void }).__emitGameConnectionError?.();
  });

  await expect(
    page.getByRole("alert").filter({ hasText: "Connection lost. Reconnecting" }),
  ).toBeVisible();
  await expect(bid).toBeDisabled();
  await expect(pass).toBeDisabled();
  await expect(dialog.getByRole("spinbutton")).toBeDisabled();
  expect(commands).toHaveLength(0);
});

test("reconnected auction re-enables the authoritative bid", async ({ page }) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("AwaitAuction", 1, {
      paused: true,
      prioritySeatId: "seat-a",
      seats: snapshot("AwaitAuction", 1).seats.map((seat) =>
        seat.seatId === "seat-a" ? { ...seat, connected: false } : seat,
      ),
      auction: {
        deedId: "d-sawhorse-lane",
        minimumNextBid: 4_001,
        prioritySeatId: "seat-a",
        passedSeatIds: [],
      },
      legalActions: [
        {
          type: "PlaceAuctionBid",
          constraints: { minBid: 4_001, maxBid: 145_000 },
        },
        { type: "PassAuction" },
      ],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  const dialog = page.getByRole("dialog");
  const bid = dialog.getByRole("button", { name: "Submit bid" });
  await expect(bid).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Pass on this auction" })).toBeDisabled();
  await expect(page.getByRole("note").filter({ hasText: "Play is paused" })).toBeVisible();

  await emitSnapshot(
    page,
    snapshot("AwaitAuction", 2, {
      prioritySeatId: "seat-a",
      auction: {
        deedId: "d-sawhorse-lane",
        minimumNextBid: 4_001,
        prioritySeatId: "seat-a",
        passedSeatIds: [],
      },
      legalActions: [
        {
          type: "PlaceAuctionBid",
          constraints: { minBid: 4_001, maxBid: 145_000 },
        },
        { type: "PassAuction" },
      ],
    }),
  );

  await expect(page.getByRole("note").filter({ hasText: "Play is paused" })).toHaveCount(0);
  await expect(bid).toBeEnabled();
  await bid.click();
  await expect.poll(() => commands.length).toBe(1);
  expect((commands[0] as { payload: unknown }).payload).toEqual({
    type: "PlaceAuctionBid",
    amount: 4_001,
  });
});

test("reconnected pending trade re-enables the authoritative response", async ({ page }) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("TurnStart", 1, {
      paused: true,
      seats: snapshot("TurnStart", 1).seats.map((seat) =>
        seat.seatId === "seat-b" ? { ...seat, connected: false } : seat,
      ),
      pendingTrade: {
        tradeId: "trade-reconnect-1",
        proposerSeatId: "seat-b",
        counterpartySeatId: "seat-a",
        offered: { cash: 2_000, deedIds: [], detentionReleaseCardIds: [] },
        requested: { cash: 0, deedIds: [], detentionReleaseCardIds: [] },
        proposerBalance: 153_000,
        counterpartyBalance: 145_000,
        aggregateVersion: 1,
      },
      legalActions: [
        { type: "AcceptTrade", constraints: { tradeId: "trade-reconnect-1" } },
        { type: "RejectTrade", constraints: { tradeId: "trade-reconnect-1" } },
      ],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  const accept = page.getByRole("button", { name: "Accept this trade" });
  await expect(accept).toBeDisabled();
  await expect(page.getByRole("note").filter({ hasText: "Play is paused" })).toBeVisible();
  expect(commands).toHaveLength(0);

  await emitSnapshot(
    page,
    snapshot("TurnStart", 2, {
      paused: false,
      pendingTrade: {
        tradeId: "trade-reconnect-1",
        proposerSeatId: "seat-b",
        counterpartySeatId: "seat-a",
        offered: { cash: 2_000, deedIds: [], detentionReleaseCardIds: [] },
        requested: { cash: 0, deedIds: [], detentionReleaseCardIds: [] },
        proposerBalance: 153_000,
        counterpartyBalance: 145_000,
        aggregateVersion: 2,
      },
      legalActions: [
        { type: "AcceptTrade", constraints: { tradeId: "trade-reconnect-1" } },
        { type: "RejectTrade", constraints: { tradeId: "trade-reconnect-1" } },
      ],
    }),
  );

  await expect(page.getByRole("note").filter({ hasText: "Play is paused" })).toHaveCount(0);
  await expect(accept).toBeEnabled();
  await accept.click();
  await expect.poll(() => commands.length).toBe(1);
  expect((commands[0] as { payload: unknown }).payload).toEqual({
    type: "AcceptTrade",
    tradeId: "trade-reconnect-1",
  });
});

test("reconnected pending trade enables exactly one authoritative rejection", async ({ page }) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("TurnStart", 1, {
      paused: true,
      seats: snapshot("TurnStart", 1).seats.map((seat) =>
        seat.seatId === "seat-b" ? { ...seat, connected: false } : seat,
      ),
      pendingTrade: {
        tradeId: "trade-reject-reconnect-1",
        proposerSeatId: "seat-b",
        counterpartySeatId: "seat-a",
        offered: { cash: 2_000, deedIds: [], detentionReleaseCardIds: [] },
        requested: { cash: 0, deedIds: [], detentionReleaseCardIds: [] },
        proposerBalance: 153_000,
        counterpartyBalance: 145_000,
        aggregateVersion: 1,
      },
      legalActions: [
        { type: "AcceptTrade", constraints: { tradeId: "trade-reject-reconnect-1" } },
        { type: "RejectTrade", constraints: { tradeId: "trade-reject-reconnect-1" } },
      ],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  const reject = page.getByRole("button", { name: "Reject this trade" });
  await expect(reject).toBeDisabled();
  await expect(page.getByRole("note").filter({ hasText: "Play is paused" })).toBeVisible();
  expect(commands).toHaveLength(0);

  await emitSnapshot(
    page,
    snapshot("TurnStart", 2, {
      paused: false,
      pendingTrade: {
        tradeId: "trade-reject-reconnect-1",
        proposerSeatId: "seat-b",
        counterpartySeatId: "seat-a",
        offered: { cash: 2_000, deedIds: [], detentionReleaseCardIds: [] },
        requested: { cash: 0, deedIds: [], detentionReleaseCardIds: [] },
        proposerBalance: 153_000,
        counterpartyBalance: 145_000,
        aggregateVersion: 2,
      },
      legalActions: [
        { type: "AcceptTrade", constraints: { tradeId: "trade-reject-reconnect-1" } },
        { type: "RejectTrade", constraints: { tradeId: "trade-reject-reconnect-1" } },
      ],
    }),
  );

  await expect(page.getByRole("note").filter({ hasText: "Play is paused" })).toHaveCount(0);
  await expect(reject).toBeEnabled();
  await reject.click();
  await expect.poll(() => commands.length).toBe(1);
  expect((commands[0] as { payload: unknown }).payload).toEqual({
    type: "RejectTrade",
    tradeId: "trade-reject-reconnect-1",
  });
});

test("detention decision focuses its heading and submits only an advertised route", async ({
  page,
}) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("AwaitChoice", 1, {
      seats: snapshot("AwaitChoice", 1).seats.map((seat) =>
        seat.seatId === "seat-a" ? { ...seat, detained: true, detentionTurnsRemaining: 2 } : seat,
      ),
      legalActions: [
        {
          type: "ChoosePendingOption",
          constraints: { choiceId: "choice-1", optionId: "attempt-roll" },
        },
      ],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  const heading = page.getByRole("heading", { name: "Noise Complaint: choose your exit" });
  await expect(heading).toBeFocused();
  await expect(page.getByText("2 of 3 failed matching attempts used.")).toBeVisible();
  await page.getByRole("button", { name: "Attempt a matching roll" }).click();
  await expect.poll(() => commands.length).toBe(1);
  expect((commands[0] as { payload: unknown }).payload).toEqual({
    type: "ChoosePendingOption",
    choiceId: "choice-1",
    optionId: "attempt-roll",
  });
});

test("paused detention keeps the exit choices visible without submitting a roll", async ({
  page,
}) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("AwaitChoice", 1, {
      paused: true,
      seats: snapshot("AwaitChoice", 1).seats.map((seat) =>
        seat.seatId === "seat-a"
          ? { ...seat, connected: false, detained: true, detentionTurnsRemaining: 2 }
          : seat,
      ),
      legalActions: [
        {
          type: "ChoosePendingOption",
          constraints: { choiceId: "choice-paused", optionId: "attempt-roll" },
        },
      ],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("heading", { name: "Noise Complaint: choose your exit" }),
  ).toBeVisible();
  await expect(page.getByText("2 of 3 failed matching attempts used.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Attempt a matching roll" })).toBeDisabled();
  await expect(page.getByRole("note").filter({ hasText: "Play is paused" })).toBeVisible();
  expect(commands).toHaveLength(0);
});

test("reconnected detention re-enables the authoritative exit route", async ({ page }) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("AwaitChoice", 1, {
      paused: true,
      seats: snapshot("AwaitChoice", 1).seats.map((seat) =>
        seat.seatId === "seat-a"
          ? { ...seat, connected: false, detained: true, detentionTurnsRemaining: 2 }
          : seat,
      ),
      legalActions: [
        {
          type: "ChoosePendingOption",
          constraints: { choiceId: "choice-reconnect", optionId: "attempt-roll" },
        },
      ],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  const attempt = page.getByRole("button", { name: "Attempt a matching roll" });
  await expect(attempt).toBeDisabled();
  await expect(page.getByRole("note").filter({ hasText: "Play is paused" })).toBeVisible();

  await emitSnapshot(
    page,
    snapshot("AwaitChoice", 2, {
      paused: false,
      seats: snapshot("AwaitChoice", 2).seats.map((seat) =>
        seat.seatId === "seat-a" ? { ...seat, detained: true, detentionTurnsRemaining: 2 } : seat,
      ),
      legalActions: [
        {
          type: "ChoosePendingOption",
          constraints: { choiceId: "choice-reconnect", optionId: "attempt-roll" },
        },
      ],
    }),
  );

  await expect(page.getByRole("note").filter({ hasText: "Play is paused" })).toHaveCount(0);
  await expect(attempt).toBeEnabled();
  await attempt.click();
  await expect.poll(() => commands.length).toBe(1);
  expect((commands[0] as { payload: unknown }).payload).toEqual({
    type: "ChoosePendingOption",
    choiceId: "choice-reconnect",
    optionId: "attempt-roll",
  });
});

test("debt decision shows payment context and confirms bankruptcy destructively", async ({
  page,
}) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("AwaitChoice", 1, {
      obligation: {
        debtorSeatId: "seat-a",
        creditorSeatId: "seat-b",
        amount: 200_000,
        reasonCode: "RENT_DUE",
        reason: "Rent is due to Side Street.",
      },
      legalActions: [{ type: "DeclareBankruptcy" }],
      actionAvailability: [
        {
          type: "MortgageDeed",
          available: false,
          reasonCode: "DEBT_MODE_ONLY",
          reason: "Liquidate assets before paying this Owed.",
        },
      ],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Owed: payment required" })).toBeFocused();
  await expect(page.getByText("Amount due").locator("..")).toContainText("2,000 Tabs");
  await expect(page.getByText("Liquidate assets before paying this Owed.")).toBeVisible();
  await page.getByRole("button", { name: "Declare bankruptcy" }).click();
  await expect(page.getByRole("dialog")).toContainText("This cannot be undone");
  await page.getByRole("button", { name: "Confirm bankruptcy" }).click();
  await expect.poll(() => commands.length).toBe(1);
  expect((commands[0] as { payload: unknown }).payload).toEqual({
    type: "DeclareBankruptcy",
  });
});

test("paused debt keeps payment context visible without submitting bankruptcy", async ({
  page,
}) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("AwaitChoice", 1, {
      paused: true,
      seats: snapshot("AwaitChoice", 1).seats.map((seat) =>
        seat.seatId === "seat-a" ? { ...seat, connected: false } : seat,
      ),
      obligation: {
        debtorSeatId: "seat-a",
        creditorSeatId: "seat-b",
        amount: 200_000,
        reasonCode: "RENT_DUE",
        reason: "Rent is due to Side Street.",
      },
      legalActions: [{ type: "DeclareBankruptcy" }],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Owed: payment required" })).toBeVisible();
  await expect(page.getByText("Amount due").locator("..")).toContainText("2,000 Tabs");
  await expect(page.getByRole("button", { name: "Declare bankruptcy" })).toBeDisabled();
  await expect(page.getByRole("note").filter({ hasText: "Play is paused" })).toBeVisible();
  expect(commands).toHaveLength(0);
});

test("reconnected debt re-enables the authoritative bankruptcy decision", async ({ page }) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("AwaitChoice", 1, {
      paused: true,
      seats: snapshot("AwaitChoice", 1).seats.map((seat) =>
        seat.seatId === "seat-a" ? { ...seat, connected: false } : seat,
      ),
      obligation: {
        debtorSeatId: "seat-a",
        creditorSeatId: "seat-b",
        amount: 200_000,
        reasonCode: "RENT_DUE",
        reason: "Rent is due to Side Street.",
      },
      legalActions: [{ type: "DeclareBankruptcy" }],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  const bankruptcy = page.getByRole("button", { name: "Declare bankruptcy" });
  await expect(bankruptcy).toBeDisabled();
  await expect(page.getByRole("note").filter({ hasText: "Play is paused" })).toBeVisible();
  await expect(page.getByText("Amount due").locator("..")).toContainText("2,000 Tabs");
  expect(commands).toHaveLength(0);

  await emitSnapshot(
    page,
    snapshot("AwaitChoice", 2, {
      paused: false,
      obligation: {
        debtorSeatId: "seat-a",
        creditorSeatId: "seat-b",
        amount: 200_000,
        reasonCode: "RENT_DUE",
        reason: "Rent is due to Side Street.",
      },
      legalActions: [{ type: "DeclareBankruptcy" }],
    }),
  );

  await expect(page.getByRole("note").filter({ hasText: "Play is paused" })).toHaveCount(0);
  await expect(bankruptcy).toBeEnabled();
  await bankruptcy.click();
  await page.getByRole("button", { name: "Confirm bankruptcy" }).click();
  await expect.poll(() => commands.length).toBe(1);
  expect((commands[0] as { payload: unknown }).payload).toEqual({
    type: "DeclareBankruptcy",
  });
});

test("pending trade focuses the offer and accepts only for its named counterparty", async ({
  page,
}) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("TurnStart", 1, {
      pendingTrade: {
        tradeId: "trade-1",
        proposerSeatId: "seat-b",
        counterpartySeatId: "seat-a",
        offered: { cash: 2_000, deedIds: [], detentionReleaseCardIds: [] },
        requested: { cash: 0, deedIds: ["d-sawhorse-lane"], detentionReleaseCardIds: [] },
        proposerBalance: 153_000,
        counterpartyBalance: 145_000,
        aggregateVersion: 1,
      },
      legalActions: [
        { type: "AcceptTrade", constraints: { tradeId: "trade-1" } },
        { type: "RejectTrade", constraints: { tradeId: "trade-1" } },
      ],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Pending trade" })).toBeFocused();
  await expect(page.getByText("Side Street sent you an offer.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "You receive" }).locator("..").getByText("20 Tabs", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accept this trade" }).click();
  await expect.poll(() => commands.length).toBe(1);
  expect((commands[0] as { payload: unknown }).payload).toEqual({
    type: "AcceptTrade",
    tradeId: "trade-1",
  });
});

test("closing a dedicated decision restores focus to the action entry", async ({ page }) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("TurnStart", 1, {
      pendingTrade: {
        tradeId: "trade-focus-close-1",
        proposerSeatId: "seat-b",
        counterpartySeatId: "seat-a",
        offered: { cash: 2_000, deedIds: [], detentionReleaseCardIds: [] },
        requested: { cash: 0, deedIds: [], detentionReleaseCardIds: [] },
        proposerBalance: 153_000,
        counterpartyBalance: 145_000,
        aggregateVersion: 1,
      },
      legalActions: [{ type: "AcceptTrade", constraints: { tradeId: "trade-focus-close-1" } }],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  const trigger = page.getByRole("button", { name: "Open action sheet" });
  await expect(page.getByRole("heading", { name: "Pending trade" })).toBeFocused();
  await page.getByRole("button", { name: "Accept this trade" }).click();
  await expect.poll(() => commands.length).toBe(1);
  await emitSnapshot(page, snapshot("TurnStart", 2));
  await expect(trigger).toBeFocused();

  await emitSnapshot(
    page,
    snapshot("AwaitChoice", 3, {
      seats: snapshot("AwaitChoice", 3).seats.map((seat) =>
        seat.seatId === "seat-a" ? { ...seat, detained: true, detentionTurnsRemaining: 2 } : seat,
      ),
      legalActions: [
        {
          type: "ChoosePendingOption",
          constraints: { choiceId: "choice-focus-close", optionId: "attempt-roll" },
        },
      ],
    }),
  );
  await expect(
    page.getByRole("heading", { name: "Noise Complaint: choose your exit" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Attempt a matching roll" }).click();
  await expect.poll(() => commands.length).toBe(2);
  await emitSnapshot(page, snapshot("TurnStart", 4));
  await expect(trigger).toBeFocused();

  await emitSnapshot(
    page,
    snapshot("AwaitChoice", 5, {
      obligation: {
        debtorSeatId: "seat-a",
        creditorSeatId: "seat-b",
        amount: 200_000,
        reasonCode: "RENT_DUE",
        reason: "Rent is due to Side Street.",
      },
      legalActions: [{ type: "PayObligation" }],
    }),
  );
  await expect(page.getByRole("heading", { name: "Owed: payment required" })).toBeFocused();
  await page.getByRole("button", { name: "Pay what is Owed" }).click();
  await expect.poll(() => commands.length).toBe(3);
  await emitSnapshot(page, snapshot("TurnStart", 6));
  await expect(trigger).toBeFocused();
});

test("paused pending trade keeps the offer visible without fabricating acceptance", async ({
  page,
}) => {
  await mockLiveStream(page);
  const { commands } = await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("TurnStart", 1, {
      paused: true,
      seats: snapshot("TurnStart", 1).seats.map((seat) =>
        seat.seatId === "seat-b" ? { ...seat, connected: false } : seat,
      ),
      pendingTrade: {
        tradeId: "trade-paused-1",
        proposerSeatId: "seat-b",
        counterpartySeatId: "seat-a",
        offered: { cash: 2_000, deedIds: [], detentionReleaseCardIds: [] },
        requested: { cash: 0, deedIds: [], detentionReleaseCardIds: [] },
        proposerBalance: 153_000,
        counterpartyBalance: 145_000,
        aggregateVersion: 1,
      },
      legalActions: [
        { type: "AcceptTrade", constraints: { tradeId: "trade-paused-1" } },
        { type: "RejectTrade", constraints: { tradeId: "trade-paused-1" } },
      ],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Pending trade" })).toBeFocused();
  await expect(page.getByText("Side Street sent you an offer.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept this trade" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reject this trade" })).toBeDisabled();
  await expect(page.getByRole("note").filter({ hasText: "Play is paused" })).toBeVisible();
  expect(commands).toHaveLength(0);
});

test("pending trade keeps unrelated turn actions out of the generic sheet", async ({ page }) => {
  await mockLiveStream(page);
  await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("TurnStart", 1, {
      pendingTrade: {
        tradeId: "trade-foreground-1",
        proposerSeatId: "seat-b",
        counterpartySeatId: "seat-a",
        offered: { cash: 2_000, deedIds: [], detentionReleaseCardIds: [] },
        requested: { cash: 0, deedIds: [], detentionReleaseCardIds: [] },
        proposerBalance: 153_000,
        counterpartyBalance: 145_000,
        aggregateVersion: 1,
      },
      legalActions: [
        { type: "AcceptTrade", constraints: { tradeId: "trade-foreground-1" } },
        { type: "RejectTrade", constraints: { tradeId: "trade-foreground-1" } },
        { type: "RollDice" },
      ],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Pending trade" })).toBeVisible();
  await page.getByRole("button", { name: "Open action sheet" }).click();
  const dialog = page.getByRole("dialog", { name: "Your actions" });
  await expect(dialog.getByText("No action is required from you right now.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Roll and advance" })).toHaveCount(0);
});

test("detention keeps unrelated turn actions out of the generic sheet", async ({ page }) => {
  await mockLiveStream(page);
  await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("AwaitChoice", 1, {
      seats: snapshot("AwaitChoice", 1).seats.map((seat) =>
        seat.seatId === "seat-a" ? { ...seat, detained: true, detentionTurnsRemaining: 2 } : seat,
      ),
      legalActions: [
        { type: "ChoosePendingOption", constraints: { choiceId: "choice-foreground-1" } },
        { type: "RollDice" },
      ],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("heading", { name: "Noise Complaint: choose your exit" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open action sheet" }).click();
  const dialog = page.getByRole("dialog", { name: "Your actions" });
  await expect(dialog.getByText("No action is required from you right now.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Roll and advance" })).toHaveCount(0);
});

test("debt keeps unrelated turn actions out of the generic sheet", async ({ page }) => {
  await mockLiveStream(page);
  await mockGameApi(page);
  await page.route(`**/api/games/${GAME_ID}/bootstrap`, async (route) => {
    const projected = snapshot("AwaitChoice", 1, {
      obligation: {
        debtorSeatId: "seat-a",
        creditorSeatId: "seat-b",
        amount: 200_000,
        reasonCode: "RENT_DUE",
        reason: "Rent is due to Side Street.",
      },
      legalActions: [{ type: "DeclareBankruptcy" }, { type: "RollDice" }],
    });
    await route.fulfill({
      json: {
        snapshot: projected,
        aggregateVersion: 1,
        sequence: 1,
        serverTime: "2026-09-03T15:00:00.000Z",
      },
    });
  });
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Owed: payment required" })).toBeVisible();
  await page.getByRole("button", { name: "Open action sheet" }).click();
  const dialog = page.getByRole("dialog", { name: "Your actions" });
  await expect(dialog.getByText("No action is required from you right now.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Roll and advance" })).toHaveCount(0);
});

test("authoritative decision events produce one live announcement", async ({ page }) => {
  await mockLiveStream(page);
  await mockGameApi(page);
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();

  await emitSnapshot(
    page,
    snapshot("AwaitPurchase", 2, {
      publicEvents: [event("PendingChoiceCreated", 2, { choiceId: "choice-2" }, "seat-a")],
    }),
  );
  const announcement = page.getByRole("group", { name: "Game announcements" }).getByRole("alert");
  await expect(announcement).toContainText("A decision is required before play can continue.");
  await expect(announcement).toHaveCount(1);
});

test("reconnect transitions announce once and stay quiet through transport churn", async ({
  page,
}) => {
  await mockLiveStream(page);
  await mockGameApi(page);
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();

  const announcement = page.getByRole("group", { name: "Game announcements" }).getByRole("alert");
  await page.evaluate(() => {
    (window as unknown as { __emitGameConnectionError?: () => void }).__emitGameConnectionError?.();
  });
  await expect(announcement).toHaveText("Connection lost. Reconnecting to the live game.");

  // A second transport error while the retry is already scheduled must not
  // create another announcement or replace the actionable recovery message.
  await page.evaluate(() => {
    (window as unknown as { __emitGameConnectionError?: () => void }).__emitGameConnectionError?.();
  });
  await expect(announcement).toHaveText("Connection lost. Reconnecting to the live game.");
  await expect(page.getByText("Connected", { exact: true })).toBeVisible({ timeout: 5_000 });
});

test("desktop keeps the board anchor, player rail, hand, and decision reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockLiveStream(page);
  await mockGameApi(page);
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  await expect(page.locator('[data-responsive-region="player-rail"]')).toBeVisible();
  await expect(page.locator('[data-responsive-region="board"]')).toBeVisible();
  await expect(page.locator('[data-property-hand="local"]')).toBeVisible();
  await expect(page.locator('[data-responsive-region="context-panel"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Open action sheet" })).toBeVisible();

  const board = await page.locator('[data-responsive-region="board"]').boundingBox();
  const playerRail = await page.locator('[data-responsive-region="player-rail"]').boundingBox();
  const context = await page.locator('[data-responsive-region="context-panel"]').boundingBox();
  expect(board?.x).toBeGreaterThan(playerRail?.x ?? -1);
  expect(context?.x).toBeGreaterThan(board?.x ?? -1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
});

test("phone keeps the three regions stacked without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockLiveStream(page);
  await mockGameApi(page);
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  await expect(page.locator('[data-responsive-region="board"]')).toBeVisible();
  await expect(page.locator('[data-property-hand="local"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Open action sheet" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test("320px phone keeps status, inspection controls, navigation, and decisions reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await mockLiveStream(page);
  await mockGameApi(page);
  await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("region", { name: "Current game status" })).toBeVisible();
  await expect(page.locator("[data-mobile-cash]")).toContainText("Cash");
  await expect(page.locator("[data-mobile-cash]")).toContainText("1,450 Tabs");
  await expect(page.getByRole("button", { name: "Open action sheet" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Game sections" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom in on board" })).toBeVisible();
  await expect(page.locator('[data-board-zoom="1"]')).toBeVisible();

  await page.getByRole("button", { name: "Zoom in on board" }).click();
  await expect(page.locator('[data-board-zoom="1.25"]')).toBeVisible();
  await page.getByRole("button", { name: "Reset board view" }).click();
  await expect(page.locator('[data-board-zoom="1"]')).toBeVisible();

  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator("#properties-section")
        .evaluate((element) => element.getBoundingClientRect().top),
    )
    .toBeLessThan(140);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
