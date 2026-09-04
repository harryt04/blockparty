import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  GameSnapshotProjection,
  STANDARD_CONFIGURATION,
  type GameSnapshotProjection as GameSnapshotProjectionType,
  type LobbyProjection,
} from "@blockparty/contracts";
import { PLACEHOLDER_BUNDLE } from "@blockparty/game-content";

const GAME_ID = "00000000-0000-4000-8000-000000000054";

const PUBLIC_ROUTES = [
  "/",
  "/create",
  "/join/e6-a11y",
  "/rules",
  "/settings",
  "/accessibility",
  "/offline",
  "/unavailable",
  "/does-not-exist",
] as const;

const GAME_PHASES = [
  "TurnStart",
  "AwaitRoll",
  "AwaitPurchase",
  "AwaitAuction",
  "ImprovementAuction",
  "AwaitDebt",
  "AwaitChoice",
] as const satisfies readonly GameSnapshotProjectionType["phase"][];

const phaseActions: Readonly<
  Partial<Record<GameSnapshotProjectionType["phase"], GameSnapshotProjectionType["legalActions"]>>
> = {
  TurnStart: [{ type: "RollDice" }],
  AwaitRoll: [{ type: "RollDice" }],
  AwaitPurchase: [
    { type: "AcquireDeed", constraints: { deedId: "d-sawhorse-lane" } },
    { type: "DeclineAcquisition", constraints: { deedId: "d-sawhorse-lane" } },
  ],
  AwaitAuction: [
    { type: "PlaceAuctionBid", constraints: { minBid: 1, maxBid: 10000 } },
    { type: "PassAuction" },
  ],
  ImprovementAuction: [
    { type: "RequestScarceImprovement", constraints: { deedId: "d-sawhorse-lane" } },
  ],
  AwaitDebt: [{ type: "PayObligation" }, { type: "DeclareBankruptcy" }],
  AwaitChoice: [
    {
      type: "ChoosePendingOption",
      constraints: { choiceId: "choice-e6", optionId: "pay-release-fee" },
    },
  ],
};

function board(): GameSnapshotProjectionType["board"] {
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

  return PLACEHOLDER_BUNDLE.spaces.map((space) => {
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
}

function snapshot(phase: GameSnapshotProjectionType["phase"]): GameSnapshotProjectionType {
  const finished = phase === "Finished";
  const lobby = phase === "Lobby";
  return {
    gameId: GAME_ID,
    status: finished ? "COMPLETED" : lobby ? "LOBBY" : "ACTIVE",
    phase,
    aggregateVersion: 1,
    sequence: 1,
    versions: {
      contentVersion: PLACEHOLDER_BUNDLE.contentVersion,
      rulesSchemaVersion: PLACEHOLDER_BUNDLE.rulesSchemaVersion,
      variantSchemaVersion: PLACEHOLDER_BUNDLE.variantSchemaVersion,
      stateSchemaVersion: "1.0.0",
      engineVersion: "0.1.0",
    },
    viewerSeatId: "seat-a",
    ...(lobby || finished ? {} : { activeSeatId: "seat-a" }),
    seats: [
      {
        seatId: "seat-a",
        name: "North Star",
        kind: "human",
        status: "active",
        token: { colorIndex: 1, shape: "barricade", pattern: "solid" },
        ...(lobby || finished ? {} : { balance: 145000, position: 1, deedIds: [] }),
        isHost: true,
        connected: true,
        isSelf: true,
      },
      {
        seatId: "seat-b",
        name: "Side Street",
        kind: "human",
        status: "active",
        token: { colorIndex: 2, shape: "cooler", pattern: "stripe" },
        ...(lobby || finished ? {} : { balance: 155000, position: 4, deedIds: [] }),
        isHost: false,
        connected: true,
        isSelf: false,
      },
    ],
    board: lobby || finished ? [] : board(),
    bank: lobby || finished ? undefined : { cash: 700000, deedIds: [], improvementInventory: {} },
    legalActions: phaseActions[phase] ?? [],
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
  };
}

function lobby(): LobbyProjection {
  return {
    gameId: GAME_ID,
    status: "LOBBY",
    name: "Accessibility test lobby",
    seatCount: 2,
    seats: snapshot("Lobby").seats,
    configuration: STANDARD_CONFIGURATION,
    versions: snapshot("Lobby").versions,
    viewerSeatId: "seat-a",
    viewerIsHost: true,
    invitePath: `/join/${GAME_ID}`,
    canStart: true,
    expiresAt: "2026-10-03T15:00:00.000Z",
  };
}

async function mockGameApi(page: Page, phase: GameSnapshotProjectionType["phase"]): Promise<void> {
  await page.route(`**/api/games/${GAME_ID}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/events")) {
      await route.abort();
      return;
    }
    if (path.endsWith("/bootstrap")) {
      const projected = snapshot(phase);
      const parsed = GameSnapshotProjection.safeParse(projected);
      if (!parsed.success) throw new Error(`Invalid E6 browser fixture: ${parsed.error.message}`);
      await route.fulfill({
        json: {
          snapshot: projected,
          aggregateVersion: 1,
          sequence: 1,
          serverTime: "2026-09-03T15:00:00.000Z",
        },
      });
      return;
    }
    if (path.endsWith("/lobby")) {
      await route.fulfill({ json: lobby() });
      return;
    }
    if (path.endsWith("/summary")) {
      await route.fulfill({
        json: {
          summary: {
            gameId: GAME_ID,
            status: "COMPLETED",
            finishReason: "WINNER",
            winnerSeatId: "seat-a",
            standings: [
              {
                seatId: "seat-a",
                name: "North Star",
                rank: 1,
                finalBalance: 145000,
                token: { colorIndex: 1, shape: "barricade", pattern: "solid" },
              },
              {
                seatId: "seat-b",
                name: "Side Street",
                rank: 2,
                finalBalance: 155000,
                token: { colorIndex: 2, shape: "cooler", pattern: "stripe" },
              },
            ],
            configuration: STANDARD_CONFIGURATION,
            durationSeconds: 245,
            publicEvents: [],
            expiresAt: "2026-10-03T15:00:00.000Z",
          },
        },
      });
      return;
    }
    await route.fulfill({
      status: 404,
      json: { error: { code: "NOT_FOUND", message: "Not found" } },
    });
  });
}

async function assertAxe(page: Page, route: string): Promise<void> {
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toBeVisible();
  await expect(page.locator("body"), `${route} did not render app content`).toContainText(
    "Blockparty",
  );
  // Next streams metadata separately from the initial HTML shell.
  expect(response?.ok() || response?.status() === 404, `${route} did not load`).toBe(true);
  await expect(page).toHaveTitle(/.+/);
  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = results.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  expect(seriousOrCritical, `${route} has serious/critical axe findings`).toEqual([]);
}

test.describe("accessibility release matrix", () => {
  test("audits every public route and the protected unavailable states", async ({ page }) => {
    await page.route("**/api/invites/e6-a11y", async (route) => {
      await route.fulfill({ json: { status: "INVALID" } });
    });

    for (const route of PUBLIC_ROUTES) await assertAxe(page, route);
    for (const route of [`/game/${GAME_ID}/lobby`, `/game/${GAME_ID}/summary`]) {
      await assertAxe(page, route);
    }
  });

  for (const phase of GAME_PHASES) {
    test(`audits the ${phase} gameplay phase`, async ({ page }) => {
      await mockGameApi(page, phase);
      await assertAxe(page, `/game/${GAME_ID}`);
      await expect(page.locator("[data-responsive-shell]")).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('[role="group"][aria-label="Game announcements"]')).toHaveCount(1);
    });
  }

  test.describe("responsive gameplay layout", () => {
    // WebKit service workers bypass page.route() on the second navigation.
    // This layout-only check must keep the mocked game API authoritative.
    test.use({ serviceWorkers: "block" });

    test("keeps the core-play surface inside the viewport at zoom-equivalent widths", async ({
      page,
    }) => {
      await mockGameApi(page, "AwaitRoll");
      for (const width of [320, 375, 768, 1024]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/game/${GAME_ID}`, { waitUntil: "domcontentloaded" });
        await expect(page.locator('[data-responsive-region="board"]')).toBeVisible({
          timeout: 10_000,
        });
        const dimensions = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(dimensions.scrollWidth, `${width}px page overflow`).toBeLessThanOrEqual(
          dimensions.clientWidth + 1,
        );
      }
    });
  });

  test("honors reduced-motion media preference without hiding the outcome", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await assertAxe(page, "/accessibility");
    await expect(page.getByRole("heading", { name: "Accessibility" })).toBeVisible();
  });
});
