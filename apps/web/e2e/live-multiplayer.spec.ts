import { expect, test } from "@playwright/test";
import { BootstrapResponse, type Command, type LegalAction } from "@blockparty/contracts";

function commandForLegalAction(action: LegalAction): Command {
  const constraints = action.constraints ?? {};
  const stringConstraint = (key: string): string | undefined =>
    typeof constraints[key] === "string" ? constraints[key] : undefined;

  switch (action.type) {
    case "EndTurn":
    case "PayObligation":
    case "PassAuction":
    case "RollDice":
      return { type: action.type };
    case "ChoosePendingOption": {
      const choiceId = stringConstraint("choiceId");
      if (choiceId === undefined) throw new Error("ChoosePendingOption omitted choiceId");
      return {
        type: action.type,
        choiceId,
        optionId: stringConstraint("optionId") ?? "selected",
      };
    }
    case "PlaceAuctionBid": {
      const minimum = constraints.minBid;
      if (typeof minimum !== "number") throw new Error("PlaceAuctionBid omitted minBid");
      return { type: action.type, amount: minimum };
    }
    case "AcquireDeed":
    case "DeclineAcquisition":
    case "MortgageDeed":
    case "RedeemMortgage":
    case "BuyImprovement":
    case "SellImprovement":
    case "RequestScarceImprovement": {
      const deedId = stringConstraint("deedId");
      if (deedId === undefined) throw new Error(`${action.type} omitted deedId`);
      return { type: action.type, deedId };
    }
    case "AcceptTrade":
    case "RejectTrade":
    case "CancelTrade": {
      const tradeId = stringConstraint("tradeId");
      if (tradeId === undefined) throw new Error(`${action.type} omitted tradeId`);
      return { type: action.type, tradeId };
    }
    default:
      throw new Error(`Unsupported live progression action: ${action.type}`);
  }
}

test.describe("live multiplayer authority", () => {
  test.skip(
    process.env.BLOCKPARTY_E2E_LIVE !== "1",
    "Set BLOCKPARTY_E2E_LIVE=1 to run against the live local replica-set server.",
  );
  test.use({ serviceWorkers: "block" });

  test("creates, joins, starts, and syncs authoritative play across two seats", async ({
    browser,
    page: host,
  }) => {
    test.setTimeout(120_000);
    const joinerContext = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 375, height: 900 },
    });
    const joiner = await joinerContext.newPage();
    const captureVisualBaseline = ["chromium", "firefox"].includes(test.info().project.name);

    async function assertNoHorizontalOverflow(target: typeof host, label: string): Promise<void> {
      const dimensions = await target.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth, `${label} page overflow`).toBeLessThanOrEqual(
        dimensions.clientWidth + 1,
      );
    }

    try {
      await host.setViewportSize({ width: 375, height: 900 });
      await host.goto("/create", { waitUntil: "domcontentloaded" });
      await host.getByRole("button", { name: "Keep analytics off" }).click();
      await host.getByRole("textbox", { name: "Your pseudonym" }).fill("Live Host");
      await host.getByRole("radio", { name: "Lantern" }).check();
      await host
        .getByRole("checkbox", { name: "I confirm that all players are aged 13 or over." })
        .check();
      await assertNoHorizontalOverflow(host, "create");

      const createResponsePromise = host.waitForResponse(
        (response) =>
          response.url().endsWith("/api/games") && response.request().method() === "POST",
      );
      await host.getByRole("button", { name: "Create lobby" }).click();
      const createResponse = await createResponsePromise;
      expect(createResponse.status()).toBe(201);
      const created = (await createResponse.json()) as {
        gameId: string;
        invitePath: string;
      };
      expect(created.gameId).toMatch(/^[0-9a-f-]{36}$/);
      expect(created.invitePath).toMatch(/^\/join\//);

      await expect(host).toHaveURL(new RegExp(`/game/${created.gameId}/lobby$`));
      await expect(host.getByText("Open Human seat", { exact: true })).toBeVisible();
      await assertNoHorizontalOverflow(host, "host lobby before join");

      await joiner.goto(created.invitePath, { waitUntil: "domcontentloaded" });
      await joiner.getByRole("button", { name: "Keep analytics off" }).click();
      await joiner.getByRole("textbox", { name: "Name for this game" }).fill("Live Joiner");
      await joiner.getByRole("radio", { name: "Key" }).check();
      await joiner
        .getByRole("checkbox", { name: "I confirm that all players are aged 13 or over." })
        .check();
      const joinResponsePromise = joiner.waitForResponse(
        (response) => response.url().includes("/join") && response.request().method() === "POST",
      );
      await joiner.getByRole("button", { name: "Join the lobby" }).click();
      const joinResponse = await joinResponsePromise;
      expect(joinResponse.status()).toBe(200);
      await expect(joiner).toHaveURL(new RegExp(`/game/${created.gameId}/lobby$`));
      await expect(host.getByText("Live Joiner", { exact: true })).toBeVisible();
      await expect(joiner.getByText("Live Host", { exact: true })).toBeVisible();
      await assertNoHorizontalOverflow(joiner, "join lobby");
      if (captureVisualBaseline) {
        await expect(host).toHaveScreenshot("live-lobby-375.png", {
          animations: "disabled",
          caret: "hide",
          mask: [host.getByLabel("Invite link")],
        });
      }

      const startResponsePromise = host.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/games/${created.gameId}/commands`) &&
          response.request().method() === "POST",
      );
      await host.getByRole("button", { name: "Start game" }).click();
      const startResponse = await startResponsePromise;
      expect(startResponse.ok()).toBe(true);
      await expect(host).toHaveURL(new RegExp(`/game/${created.gameId}$`));
      await expect(joiner).toHaveURL(new RegExp(`/game/${created.gameId}$`));
      await expect(host.getByLabel("Connection status: Connected").first()).toBeVisible();
      await host.setViewportSize({ width: 1280, height: 900 });
      if (captureVisualBaseline) {
        const gameBoard = host.locator(".game-board-viewport");
        await expect(gameBoard).toHaveScreenshot("live-board-1280.png", {
          animations: "disabled",
          caret: "hide",
          maxDiffPixels: 100,
          mask: [gameBoard.getByRole("img")],
        });
      }

      await host.getByRole("button", { name: "Open action sheet" }).click();
      await joiner.getByRole("button", { name: "Open action sheet" }).click();
      const hostRoll = host.getByRole("button", { name: "Roll and advance" });
      const joinerRoll = joiner.getByRole("button", { name: "Roll and advance" });
      await expect
        .poll(
          async () =>
            (await hostRoll.isEnabled())
              ? "host"
              : (await joinerRoll.isEnabled())
                ? "joiner"
                : "none",
          { timeout: 30_000 },
        )
        .not.toBe("none");
      const activePlayer = (await hostRoll.isEnabled()) ? host : joiner;
      const rollResponsePromise = activePlayer.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/games/${created.gameId}/commands`) &&
          response.request().method() === "POST",
      );
      await activePlayer.getByRole("button", { name: "Roll and advance" }).click();
      const rollResponse = await rollResponsePromise;
      expect(rollResponse.ok()).toBe(true);
      await expect(host.getByText(/Dice rolled/)).toBeVisible();
      await expect(joiner.getByText(/Dice rolled/)).toBeVisible();

      const players = [
        { name: "host", page: host },
        { name: "joiner", page: joiner },
      ] as const;
      async function bootstrap(target: typeof host): Promise<BootstrapResponse> {
        const response = await target.evaluate(async (gameId) => {
          const result = await fetch(`/api/games/${gameId}/bootstrap`);
          return { status: result.status, body: await result.json() };
        }, created.gameId);
        expect(response.status).toBe(200);
        return BootstrapResponse.parse(response.body);
      }
      async function issueCommand(
        target: typeof host,
        expectedVersion: number,
        payload: Command,
      ): Promise<void> {
        const response = await target.evaluate(
          async ({ gameId, expectedVersion: version, payload: command }) => {
            const csrf = document.cookie
              .split("; ")
              .find((entry) => entry.startsWith("bp_csrf="))
              ?.slice("bp_csrf=".length);
            if (csrf === undefined) return { status: 0 };
            const result = await fetch(`/api/games/${gameId}/commands`, {
              method: "POST",
              headers: { "content-type": "application/json", "x-csrf-token": csrf },
              body: JSON.stringify({
                protocolVersion: 1,
                type: "game.command",
                requestId: crypto.randomUUID(),
                gameId,
                commandId: crypto.randomUUID(),
                expectedVersion: version,
                payload: command,
              }),
            });
            return { status: result.status };
          },
          { gameId: created.gameId, expectedVersion, payload },
        );
        expect(response.status).toBe(202);
      }
      function supportedProgressionAction(
        actions: readonly LegalAction[],
      ): LegalAction | undefined {
        return actions.find((action) =>
          [
            "RollDice",
            "EndTurn",
            "ChoosePendingOption",
            "PayObligation",
            "PassAuction",
            "PlaceAuctionBid",
            "DeclineAcquisition",
            "MortgageDeed",
            "RedeemMortgage",
            "BuyImprovement",
            "SellImprovement",
            "RequestScarceImprovement",
            "AcceptTrade",
            "RejectTrade",
            "CancelTrade",
          ].includes(action.type),
        );
      }

      let owner: (typeof players)[number] | undefined;
      for (let step = 0; step < 36 && owner === undefined; step += 1) {
        const states = await Promise.all(
          players.map(async (player) => ({ player, bootstrap: await bootstrap(player.page) })),
        );
        const acquisition = states.find(({ bootstrap: current }) =>
          current.snapshot.legalActions.some((action) => action.type === "AcquireDeed"),
        );
        if (acquisition !== undefined) {
          owner = acquisition.player;
          break;
        }

        const actor = states
          .map((state) => ({
            ...state,
            action: supportedProgressionAction(state.bootstrap.snapshot.legalActions),
          }))
          .find(({ action }) => action !== undefined);
        expect(actor, "a live seat should advertise the next authoritative action").toBeDefined();
        if (actor === undefined) throw new Error("No live action was advertised");
        if (actor.action === undefined) throw new Error("Unsupported live progression action");
        await issueCommand(
          actor.player.page,
          actor.bootstrap.aggregateVersion,
          commandForLegalAction(actor.action),
        );
      }

      expect(owner, "a live player should acquire an unowned Address").toBeDefined();
      if (owner !== undefined) {
        await expect(
          owner.page.getByRole("button", { name: "Acquire this Address" }),
        ).toBeVisible();
        const responsePromise = owner.page.waitForResponse(
          (response) =>
            response.url().endsWith(`/api/games/${created.gameId}/commands`) &&
            response.request().method() === "POST",
        );
        await owner.page.getByRole("button", { name: "Acquire this Address" }).click();
        const response = await responsePromise;
        expect(response.ok()).toBe(true);
        await expect
          .poll(() =>
            owner.page.locator('[data-property-hand="local"] [data-property-group]').count(),
          )
          .toBeGreaterThan(0);
      }

      await joiner.setViewportSize({ width: 1280, height: 900 });
      await assertNoHorizontalOverflow(host, "host game");
      await assertNoHorizontalOverflow(joiner, "joiner game");
    } finally {
      await joinerContext.close();
    }
  });
});
