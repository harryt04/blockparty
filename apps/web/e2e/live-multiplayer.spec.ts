import { expect, test } from "@playwright/test";

test.describe("live multiplayer authority", () => {
  test.skip(
    process.env.BLOCKPARTY_E2E_LIVE !== "1",
    "Set BLOCKPARTY_E2E_LIVE=1 to run against the live local replica-set server.",
  );
  test.use({ serviceWorkers: "block" });

  test("creates, joins, starts, and syncs one authoritative command across two seats", async ({
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

      await joiner.setViewportSize({ width: 1280, height: 900 });
      await assertNoHorizontalOverflow(host, "host game");
      await assertNoHorizontalOverflow(joiner, "joiner game");
    } finally {
      await joinerContext.close();
    }
  });
});
