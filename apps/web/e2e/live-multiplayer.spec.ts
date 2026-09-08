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
    test.setTimeout(180_000);
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
      async function bootstrap(
        target: typeof host,
        gameId = created.gameId,
      ): Promise<BootstrapResponse> {
        const response = await target.evaluate(async (id) => {
          const result = await fetch(`/api/games/${id}/bootstrap`);
          return { status: result.status, body: await result.json() };
        }, gameId);
        expect(response.status).toBe(200);
        return BootstrapResponse.parse(response.body);
      }
      async function issueCommand(
        target: typeof host,
        expectedVersion: number,
        payload: Command,
        gameId = created.gameId,
      ): Promise<void> {
        const response = await target.evaluate(
          async ({ gameId: id, expectedVersion: version, payload: command }) => {
            const csrf = document.cookie
              .split("; ")
              .find((entry) => entry.startsWith("bp_csrf="))
              ?.slice("bp_csrf=".length);
            if (csrf === undefined) return { status: 0 };
            const result = await fetch(`/api/games/${id}/commands`, {
              method: "POST",
              headers: { "content-type": "application/json", "x-csrf-token": csrf },
              body: JSON.stringify({
                protocolVersion: 1,
                type: "game.command",
                requestId: crypto.randomUUID(),
                gameId: id,
                commandId: crypto.randomUUID(),
                expectedVersion: version,
                payload: command,
              }),
            });
            return { status: result.status };
          },
          { gameId, expectedVersion, payload },
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

      await host.goto("/create", { waitUntil: "domcontentloaded" });
      await host.getByRole("textbox", { name: "Your pseudonym" }).fill("Auction Host");
      await host.getByRole("radio", { name: "Lantern" }).check();
      await host
        .getByRole("checkbox", { name: "I confirm that all players are aged 13 or over." })
        .check();
      const auctionCreateResponsePromise = host.waitForResponse(
        (response) =>
          response.url().endsWith("/api/games") && response.request().method() === "POST",
      );
      await host.getByRole("button", { name: "Create lobby" }).click();
      const auctionCreated = (await (await auctionCreateResponsePromise).json()) as {
        gameId: string;
        invitePath: string;
      };
      await expect(host).toHaveURL(new RegExp(`/game/${auctionCreated.gameId}/lobby$`));

      await joiner.goto(auctionCreated.invitePath, { waitUntil: "domcontentloaded" });
      await joiner.getByRole("textbox", { name: "Name for this game" }).fill("Auction Joiner");
      await joiner.getByRole("radio", { name: "Key" }).check();
      await joiner
        .getByRole("checkbox", { name: "I confirm that all players are aged 13 or over." })
        .check();
      const auctionJoinResponsePromise = joiner.waitForResponse(
        (response) => response.url().includes("/join") && response.request().method() === "POST",
      );
      await joiner.getByRole("button", { name: "Join the lobby" }).click();
      expect((await auctionJoinResponsePromise).status()).toBe(200);
      await expect(host.getByText("Auction Joiner", { exact: true })).toBeVisible();

      const auctionStartResponsePromise = host.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/games/${auctionCreated.gameId}/commands`) &&
          response.request().method() === "POST",
      );
      await host.getByRole("button", { name: "Start game" }).click();
      expect((await auctionStartResponsePromise).ok()).toBe(true);
      await expect(host).toHaveURL(new RegExp(`/game/${auctionCreated.gameId}$`));
      await expect(joiner).toHaveURL(new RegExp(`/game/${auctionCreated.gameId}$`));
      await host.getByRole("button", { name: "Open action sheet" }).click();
      await joiner.getByRole("button", { name: "Open action sheet" }).click();

      const auctionPlayers = [
        { name: "host", page: host },
        { name: "joiner", page: joiner },
      ] as const;
      await expect
        .poll(
          async () => {
            const available = await Promise.all(
              auctionPlayers.map(async (player) => ({
                player,
                enabled: await player.page
                  .getByRole("button", { name: "Roll and advance" })
                  .isEnabled(),
              })),
            );
            return available.find(({ enabled }) => enabled)?.player.name ?? "none";
          },
          { timeout: 30_000 },
        )
        .not.toBe("none");
      const auctionRoller = (await host
        .getByRole("button", { name: "Roll and advance" })
        .isEnabled())
        ? "host"
        : "joiner";
      const auctionRollerPage = auctionRoller === "host" ? host : joiner;
      const auctionRollResponsePromise = auctionRollerPage.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/games/${auctionCreated.gameId}/commands`) &&
          response.request().method() === "POST",
      );
      await auctionRollerPage.getByRole("button", { name: "Roll and advance" }).click();
      expect((await auctionRollResponsePromise).ok()).toBe(true);

      let auctionParticipant: (typeof auctionPlayers)[number] | undefined;
      for (let step = 0; step < 36 && auctionParticipant === undefined; step += 1) {
        const states = await Promise.all(
          auctionPlayers.map(async (player) => ({
            player,
            bootstrap: await bootstrap(player.page, auctionCreated.gameId),
          })),
        );
        const auction = states.find(
          ({ bootstrap: current }) =>
            current.snapshot.phase === "AwaitAuction" &&
            current.snapshot.auction !== undefined &&
            current.snapshot.legalActions.some(
              (action) => action.type === "PlaceAuctionBid" || action.type === "PassAuction",
            ),
        );
        if (auction !== undefined) {
          auctionParticipant = auction.player;
          break;
        }

        const acquisition = states.find(({ bootstrap: current }) =>
          current.snapshot.legalActions.some((action) => action.type === "DeclineAcquisition"),
        );
        if (acquisition !== undefined) {
          const decline = acquisition.bootstrap.snapshot.legalActions.find(
            (action) => action.type === "DeclineAcquisition",
          );
          expect(
            decline,
            "a declined acquisition should include its deed constraint",
          ).toBeDefined();
          if (decline === undefined)
            throw new Error("DeclineAcquisition action was not advertised");
          await expect(
            acquisition.player.page.getByRole("button", { name: "Decline and open the auction" }),
          ).toBeVisible();
          await issueCommand(
            acquisition.player.page,
            acquisition.bootstrap.aggregateVersion,
            commandForLegalAction(decline),
            auctionCreated.gameId,
          );
          continue;
        }

        const actor = states
          .map((state) => ({
            ...state,
            action: supportedProgressionAction(state.bootstrap.snapshot.legalActions),
          }))
          .find(({ action }) => action !== undefined);
        expect(actor, "a live seat should advertise the next auction setup action").toBeDefined();
        if (actor === undefined) throw new Error("No live action was advertised before auction");
        if (actor.action === undefined) throw new Error("Unsupported live auction setup action");
        await issueCommand(
          actor.player.page,
          actor.bootstrap.aggregateVersion,
          commandForLegalAction(actor.action),
          auctionCreated.gameId,
        );
      }

      expect(
        auctionParticipant,
        "a declined Address should open an authoritative auction",
      ).toBeDefined();
      if (auctionParticipant !== undefined) {
        await expect(
          auctionParticipant.page
            .getByLabel("Auction decision")
            .getByRole("heading", { name: "Untimed Address auction" }),
        ).toBeVisible();
        await expect(auctionParticipant.page.getByLabel("Place bid")).toBeVisible();
        await expect(
          auctionParticipant.page.getByRole("button", { name: "Pass on this auction" }),
        ).toBeVisible();

        const auctionState = await bootstrap(auctionParticipant.page, auctionCreated.gameId);
        const bid = auctionState.snapshot.legalActions.find(
          (action) => action.type === "PlaceAuctionBid",
        );
        const minimum = bid?.constraints?.minBid;
        expect(typeof minimum, "the auction should expose a server-provided bid floor").toBe(
          "number",
        );
        if (typeof minimum !== "number") throw new Error("PlaceAuctionBid omitted minBid");
        await auctionParticipant.page.getByLabel("Place bid").fill(String(minimum));
        const bidResponsePromise = auctionParticipant.page.waitForResponse(
          (response) =>
            response.url().endsWith(`/api/games/${auctionCreated.gameId}/commands`) &&
            response.request().method() === "POST",
        );
        await auctionParticipant.page.getByRole("button", { name: "Submit bid" }).click();
        const bidResponse = await bidResponsePromise;
        expect(bidResponse.ok()).toBe(true);
        await expect(
          auctionParticipant.page.getByText("Current bid", { exact: true }),
        ).toBeVisible();
      }

      await joiner.setViewportSize({ width: 1280, height: 900 });
      await assertNoHorizontalOverflow(host, "host game");
      await assertNoHorizontalOverflow(joiner, "joiner game");
    } finally {
      await joinerContext.close();
    }
  });
});
