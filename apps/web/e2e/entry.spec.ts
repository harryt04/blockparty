import { expect, test } from "@playwright/test";

test.describe("entry actions remain reachable with first-visit notices", () => {
  test("keeps mutation submits disabled until the client form hydrates", async ({ page }) => {
    await page.context().route("**/_next/static/**/*.js", async (route) => {
      await route.abort();
    });
    await page.goto("/create", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Create lobby" })).toBeDisabled();
  });

  test("mirrors an existing CSRF cookie when joining from a browser with prior game access", async ({
    page,
  }) => {
    const inviteId = "a".repeat(32);
    const csrf = "join-csrf-token";
    await page.route(`**/api/invites/${inviteId}`, async (route) => {
      await route.fulfill({
        json: {
          status: "OPEN",
          openSeatCount: 1,
          seatCount: 2,
          configuration: {
            schemaVersion: "1.0.0",
            preset: "standard",
            restSpaceJackpot: false,
            doubleStartOnExactLanding: false,
            noAuctionAfterDeclinedAcquisition: false,
            noIncomeWhileDetained: false,
            bonusForMatchingOnes: false,
            startingAssetsDealt: false,
            relaxedEvenBuilding: false,
            unlimitedImprovementInventory: false,
          },
        },
      });
    });
    await page.route(`**/api/invites/${inviteId}/join`, async (route) => {
      expect(route.request().headers()["x-csrf-token"]).toBe(csrf);
      await route.fulfill({
        status: 400,
        json: {
          protocolVersion: 1,
          type: "game.error",
          serverTime: "2026-09-04T16:00:00.000Z",
          error: {
            code: "INVALID_PAYLOAD",
            message: "Test boundary response.",
            retryable: false,
          },
        },
      });
    });
    await page.goto(`/join/${inviteId}`);
    await page.getByRole("textbox", { name: "Name for this game" }).fill("Second Player");
    await page.getByRole("radio", { name: "Barricade" }).check();
    await page
      .getByRole("checkbox", { name: "I confirm that all players are aged 13 or over." })
      .check();
    await page
      .context()
      .addCookies([{ name: "bp_csrf", value: csrf, url: "http://127.0.0.1:3100" }]);
    await page.getByRole("button", { name: "Join the lobby" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Test boundary response." }),
    ).toBeVisible();
  });

  test("can submit the create form while analytics consent is pending", async ({ page }) => {
    await page.goto("/create");
    await page
      .getByRole("checkbox", { name: "I confirm that all players are aged 13 or over." })
      .check();
    await page.getByRole("button", { name: "Create lobby" }).click();

    // The browser-visible action must reach the form handler even when the
    // local test server has no database configured.
    await expect(
      page.getByRole("alert").filter({ hasText: "Lobby was not created" }),
    ).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Analytics consent" })).toBeVisible();
  });
});
