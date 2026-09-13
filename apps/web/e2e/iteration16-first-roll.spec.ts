import { expect, test } from "@playwright/test";
import { BootstrapResponse } from "@blockparty/contracts";

test.use({ serviceWorkers: "block" });

test("live two-seat game exposes the opening roll to the active browser", async ({
  browser,
  page: host,
}) => {
  test.skip(
    process.env.BLOCKPARTY_E2E_LIVE !== "1",
    "Set BLOCKPARTY_E2E_LIVE=1 to run against the live local replica-set server.",
  );
  test.setTimeout(90_000);
  const joinerContext = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 375, height: 900 },
  });
  const joiner = await joinerContext.newPage();

  try {
    await host.setViewportSize({ width: 375, height: 900 });
    await host.goto("/create", { waitUntil: "domcontentloaded" });
    await host.getByRole("button", { name: "Keep analytics off" }).click();
    await host.getByRole("textbox", { name: "Display name" }).fill("First Roll Host");
    await host.getByRole("radio", { name: "Lantern" }).check();
    const createResponsePromise = host.waitForResponse(
      (response) => response.url().endsWith("/api/games") && response.request().method() === "POST",
    );
    await host.getByRole("button", { name: "Create lobby" }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);
    const created = (await createResponse.json()) as { gameId: string; invitePath: string };

    await expect(host).toHaveURL(new RegExp(`/game/${created.gameId}/lobby$`));
    await joiner.goto(created.invitePath, { waitUntil: "domcontentloaded" });
    await joiner.getByRole("button", { name: "Keep analytics off" }).click();
    await joiner.getByRole("textbox", { name: "Display name" }).fill("First Roll Joiner");
    await joiner.getByRole("radio", { name: "Key" }).check();
    const joinResponsePromise = joiner.waitForResponse(
      (response) => response.url().includes("/join") && response.request().method() === "POST",
    );
    await joiner.getByRole("button", { name: "Join the lobby" }).click();
    expect((await joinResponsePromise).status()).toBe(200);
    await expect(host.getByRole("button", { name: "Start game" })).toBeVisible();

    const startResponsePromise = host.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/games/${created.gameId}/commands`) &&
        response.request().method() === "POST",
    );
    await host.getByRole("button", { name: "Start game" }).click();
    expect((await startResponsePromise).ok()).toBe(true);
    await expect(host).toHaveURL(new RegExp(`/game/${created.gameId}$`));
    await expect(joiner).toHaveURL(new RegExp(`/game/${created.gameId}$`));

    async function readState(target: typeof host): Promise<BootstrapResponse> {
      const result = await target.evaluate(async (gameId) => {
        const response = await fetch(`/api/games/${gameId}/bootstrap`);
        return { status: response.status, body: await response.json() };
      }, created.gameId);
      expect(result.status).toBe(200);
      return BootstrapResponse.parse(result.body);
    }

    const states = await Promise.all(
      [host, joiner].map(async (target) => ({ target, state: await readState(target) })),
    );
    const active = states.find(({ state }) =>
      state.snapshot.legalActions.some((action) => action.type === "RollDice"),
    );
    expect(active).toBeDefined();
    if (active === undefined) return;

    await active.target.reload({ waitUntil: "domcontentloaded" });
    await expect(active.target.getByLabel("Connection status: Connected").first()).toBeVisible();
    await expect(active.target.getByLabel("Your turn")).toBeVisible();
    const modal = active.target.locator('[data-modal-layer="true"]');
    if (!(await modal.isVisible())) {
      await active.target.getByRole("button", { name: "Open action sheet" }).click();
    }
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("button", { name: "Roll and advance" })).toBeEnabled();
  } finally {
    await joinerContext.close();
  }
});
