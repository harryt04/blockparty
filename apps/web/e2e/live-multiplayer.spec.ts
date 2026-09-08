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

    async function openActionSheetIfNeeded(target: typeof host): Promise<void> {
      const modal = target.locator('[data-modal-layer="true"]');
      if (await modal.isVisible()) return;
      // A blocking decision can auto-open between the visibility check and
      // the trigger click. The trigger's handler is idempotent, so force the
      // same click through that narrow overlay race rather than waiting for a
      // modal that may only exist on the next render.
      await target.getByRole("button", { name: "Open action sheet" }).click({ force: true });
    }

    async function dismissIdleActionSheet(target: typeof host): Promise<void> {
      const modal = target.locator('[data-modal-layer="true"]');
      const idle = modal.getByText("No action is required from you right now.", { exact: true });
      if (!(await idle.isVisible())) return;
      await modal.getByRole("button", { name: "Close" }).click({ force: true });
    }

    async function readBootstrap(target: typeof host, gameId: string): Promise<BootstrapResponse> {
      const response = await target.evaluate(async (id) => {
        const result = await fetch(`/api/games/${id}/bootstrap`);
        return { status: result.status, body: await result.json() };
      }, gameId);
      expect(response.status).toBe(200);
      return BootstrapResponse.parse(response.body);
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
        await host.addStyleTag({
          content: "nextjs-portal { display: none !important; }",
        });
        await expect(host).toHaveScreenshot("live-lobby-375.png", {
          animations: "disabled",
          caret: "hide",
          mask: [host.getByLabel("Invite link"), host.locator("nextjs-portal")],
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

      const initialTurnStates = await Promise.all(
        [host, joiner].map(async (page) => ({
          page,
          state: await readBootstrap(page, created.gameId),
        })),
      );
      const initialTurnPlayers = initialTurnStates.filter(({ state }) =>
        state.snapshot.legalActions.some((action) => action.type === "RollDice"),
      );
      expect(initialTurnPlayers, "one live seat should own the opening roll").toHaveLength(1);
      await openActionSheetIfNeeded(initialTurnPlayers[0]!.page);
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
      await expect
        .poll(async () => {
          const states = await Promise.all([
            readBootstrap(host, created.gameId),
            readBootstrap(joiner, created.gameId),
          ]);
          return states.every((state) =>
            state.snapshot.publicEvents?.some((event) => event.type === "DiceRolled"),
          );
        })
        .toBe(true);
      const players = [
        { name: "host", page: host },
        { name: "joiner", page: joiner },
      ] as const;
      async function bootstrap(
        target: typeof host,
        gameId = created.gameId,
      ): Promise<BootstrapResponse> {
        return readBootstrap(target, gameId);
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

        const managedState = await bootstrap(owner.page);
        const mortgage = managedState.snapshot.legalActions.find(
          (action) => action.type === "MortgageDeed",
        );
        expect(
          mortgage,
          "the acquiring seat should receive an authoritative management action",
        ).toBeDefined();
        if (mortgage === undefined)
          throw new Error("MortgageDeed was not advertised after acquire");

        await owner.page.getByRole("button", { name: "Manage" }).first().click();
        await expect(
          owner.page.getByRole("heading", { name: "Manage your Addresses" }),
        ).toBeVisible();
        await expect(
          owner.page.getByRole("button", { name: "Mortgage this Address" }).first(),
        ).toBeVisible();
        await owner.page.getByRole("button", { name: "Mortgage this Address" }).first().click();
        await expect(
          owner.page.getByRole("button", { name: "Confirm Mortgage this Address" }),
        ).toBeVisible();

        const mortgageResponsePromise = owner.page.waitForResponse(
          (response) =>
            response.url().endsWith(`/api/games/${created.gameId}/commands`) &&
            response.request().method() === "POST",
        );
        await owner.page.getByRole("button", { name: "Confirm Mortgage this Address" }).click();
        const mortgageResponse = await mortgageResponsePromise;
        expect(mortgageResponse.ok()).toBe(true);
        await expect(
          owner.page.locator('[data-property-hand="local"]').getByText("Mortgaged", {
            exact: true,
          }),
        ).toBeVisible();
      }

      let tradeProposer: (typeof players)[number] | undefined;
      for (let step = 0; step < 36 && tradeProposer === undefined; step += 1) {
        const states = await Promise.all(
          players.map(async (player) => ({ player, bootstrap: await bootstrap(player.page) })),
        );
        tradeProposer = states.find(({ bootstrap: current }) =>
          current.snapshot.legalActions.some((action) => action.type === "ProposeTrade"),
        )?.player;
        if (tradeProposer !== undefined) break;

        const actor = states
          .map((state) => ({
            ...state,
            action: supportedProgressionAction(state.bootstrap.snapshot.legalActions),
          }))
          .find(({ action }) => action !== undefined);
        expect(actor, "a live seat should advertise the next trade setup action").toBeDefined();
        if (actor === undefined) throw new Error("No live action was advertised before trade");
        if (actor.action === undefined) throw new Error("Unsupported live trade setup action");
        await issueCommand(
          actor.player.page,
          actor.bootstrap.aggregateVersion,
          commandForLegalAction(actor.action),
        );
      }

      expect(
        tradeProposer,
        "a live seat should advertise an authoritative trade proposal",
      ).toBeDefined();
      if (tradeProposer !== undefined) {
        const proposerBefore = await bootstrap(tradeProposer.page);
        const proposerSeat = proposerBefore.snapshot.seats.find((seat) => seat.isSelf);
        const counterparty = players.find((player) => player !== tradeProposer);
        expect(proposerSeat?.balance, "the proposer should have transferable Tabs").toBeGreaterThan(
          100,
        );
        expect(counterparty).toBeDefined();
        if (proposerSeat === undefined || counterparty === undefined) {
          throw new Error("Trade seats were not present in the authoritative projection");
        }
        const counterpartySeat = proposerBefore.snapshot.seats.find(
          (seat) => seat.seatId !== proposerSeat.seatId,
        );
        expect(counterpartySeat, "the trade counterparty should be active").toBeDefined();
        if (counterpartySeat === undefined) throw new Error("Trade counterparty was not projected");
        const proposerBalance = proposerSeat.balance ?? 0;
        const counterpartyBalance = counterpartySeat.balance ?? 0;

        await expect(
          tradeProposer.page.getByRole("button", { name: "Propose a trade", exact: true }),
        ).toBeVisible();
        await tradeProposer.page
          .getByRole("button", { name: "Propose a trade", exact: true })
          .click();
        await expect(tradeProposer.page.getByLabel("Compose trade")).toBeVisible();
        await tradeProposer.page.getByLabel("Counterpart").selectOption(counterpartySeat.seatId);
        await tradeProposer.page.getByLabel("You give (Tabs)").fill("100");
        await tradeProposer.page.getByLabel("You request (Tabs)").fill("0");
        await tradeProposer.page
          .getByRole("button", { name: "Review what you give and receive" })
          .click();
        await expect(tradeProposer.page.getByLabel("Review trade")).toBeVisible();

        const proposeResponsePromise = tradeProposer.page.waitForResponse(
          (response) =>
            response.url().endsWith(`/api/games/${created.gameId}/commands`) &&
            response.request().method() === "POST",
        );
        await tradeProposer.page.getByRole("button", { name: "Propose this trade" }).click();
        expect((await proposeResponsePromise).ok()).toBe(true);
        await expect(
          counterparty.page.getByRole("heading", { name: "Pending trade" }),
        ).toBeVisible();
        await expect(
          counterparty.page.getByText(`${proposerSeat.name ?? "Proposer"} sent you an offer.`, {
            exact: true,
          }),
        ).toBeVisible();
        await dismissIdleActionSheet(counterparty.page);

        const acceptResponsePromise = counterparty.page.waitForResponse(
          (response) =>
            response.url().endsWith(`/api/games/${created.gameId}/commands`) &&
            response.request().method() === "POST",
        );
        await counterparty.page.getByRole("button", { name: "Accept this trade" }).click();
        expect((await acceptResponsePromise).ok()).toBe(true);
        await expect(
          counterparty.page.getByRole("heading", { name: "Pending trade" }),
        ).toBeHidden();

        await expect
          .poll(async () => {
            const state = await bootstrap(tradeProposer.page);
            const seat = state.snapshot.seats.find((candidate) => candidate.isSelf);
            return seat?.balance;
          })
          .toBe(proposerBalance - 100);
        await expect
          .poll(async () => {
            const state = await bootstrap(counterparty.page);
            const seat = state.snapshot.seats.find(
              (candidate) => candidate.seatId === counterpartySeat.seatId,
            );
            return seat?.balance;
          })
          .toBe(counterpartyBalance + 100);
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

      const auctionPlayers = [
        { name: "host", page: host },
        { name: "joiner", page: joiner },
      ] as const;
      const auctionTurnStates = await Promise.all(
        [host, joiner].map(async (page) => ({
          page,
          state: await readBootstrap(page, auctionCreated.gameId),
        })),
      );
      const auctionTurnPlayer = auctionTurnStates.find(({ state }) =>
        state.snapshot.legalActions.some((action) => action.type === "RollDice"),
      );
      expect(
        auctionTurnPlayer,
        "one live seat should own the auction game opening roll",
      ).toBeDefined();
      if (auctionTurnPlayer === undefined)
        throw new Error("No auction opening roller was advertised");
      const auctionRoll = auctionTurnPlayer.state.snapshot.legalActions.find(
        (action) => action.type === "RollDice",
      );
      expect(
        auctionRoll,
        "the opening roller should retain the advertised RollDice action",
      ).toBeDefined();
      if (auctionRoll === undefined) throw new Error("RollDice was no longer advertised");
      await issueCommand(
        auctionTurnPlayer.page,
        auctionTurnPlayer.state.aggregateVersion,
        commandForLegalAction(auctionRoll),
        auctionCreated.gameId,
      );

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
