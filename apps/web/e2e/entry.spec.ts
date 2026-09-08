import { expect, test } from "@playwright/test";

test.describe("entry actions remain reachable with first-visit notices", () => {
  // WebKit can let a previously registered shell worker bypass page.route()
  // for API requests. Entry tests need the mocked API boundary to stay
  // authoritative. See TEST-002 and the E6 browser matrix.
  test.use({ serviceWorkers: "block" });

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
          availablePieces: [{ colorIndex: 2, pieceId: "piece-key", pattern: "stripe" }],
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
    await page.getByRole("radio", { name: "Key" }).check();
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

  test("refreshes open pieces after a concurrent claimant wins without clearing the form", async ({
    page,
  }) => {
    const inviteId = "b".repeat(32);
    let statusRequests = 0;
    const standardConfiguration = {
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
    };

    await page.route(`**/api/invites/${inviteId}`, async (route) => {
      statusRequests += 1;
      await route.fulfill({
        json: {
          status: "OPEN",
          openSeatCount: 2,
          seatCount: 3,
          availablePieces:
            statusRequests === 1
              ? [
                  { colorIndex: 1, pieceId: "piece-lantern", pattern: "solid" },
                  { colorIndex: 2, pieceId: "piece-key", pattern: "stripe" },
                ]
              : [{ colorIndex: 2, pieceId: "piece-key", pattern: "stripe" }],
          configuration: standardConfiguration,
        },
      });
    });
    await page.route(`**/api/invites/${inviteId}/join`, async (route) => {
      await route.fulfill({
        status: 404,
        json: {
          protocolVersion: 1,
          type: "game.error",
          serverTime: "2026-09-07T16:00:00.000Z",
          error: {
            code: "NOT_FOUND",
            message: "That game or invite is not available.",
            retryable: false,
          },
        },
      });
    });

    for (const width of [375, 1280]) {
      statusRequests = 0;
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/join/${inviteId}`);
      await page.getByRole("textbox", { name: "Name for this game" }).fill("  Ada   Lovelace  ");
      await page.getByRole("radio", { name: "Lantern" }).check();
      await page
        .getByRole("checkbox", { name: "I confirm that all players are aged 13 or over." })
        .check();
      await page.getByRole("button", { name: "Join the lobby" }).click();

      await expect(
        page.getByRole("alert").filter({ hasText: "That piece was just claimed" }),
      ).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Name for this game" })).toHaveValue(
        "  Ada   Lovelace  ",
      );
      await expect(
        page.getByRole("checkbox", { name: "I confirm that all players are aged 13 or over." }),
      ).toBeChecked();
      await expect(page.getByRole("radio", { name: "Lantern" })).toBeDisabled();
      await expect(page.getByRole("radio", { name: "Key" })).toBeEnabled();
      await expect(page.getByRole("radio", { name: "Key" })).toBeFocused();
      expect(statusRequests).toBe(2);
    }
  });

  test("can submit the create form while analytics consent is pending", async ({ page }) => {
    await page.goto("/create");
    await page.getByRole("textbox", { name: "Your pseudonym" }).fill("Host");
    await page.getByRole("radio", { name: "Lantern" }).check();
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

  test("sends only one create request while the first request is pending", async ({ page }) => {
    let requestCount = 0;
    await page.route("**/api/games", async (route) => {
      requestCount += 1;
      const body = route.request().postDataJSON() as Record<string, unknown>;
      for (const field of ["capability", "seatCapability", "hostCapability", "reclaimClaim"]) {
        expect(body).not.toHaveProperty(field);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      await route.fulfill({
        status: 400,
        json: {
          protocolVersion: 1,
          type: "game.error",
          serverTime: "2026-09-07T16:00:00.000Z",
          error: {
            code: "INVALID_PAYLOAD",
            message: "Test pending boundary response.",
            retryable: false,
          },
        },
      });
    });
    await page.goto("/create");
    await page.getByRole("textbox", { name: "Your pseudonym" }).fill("Host");
    await page.getByRole("radio", { name: "Lantern" }).check();
    await page
      .getByRole("checkbox", { name: "I confirm that all players are aged 13 or over." })
      .check();

    await page.getByRole("button", { name: "Create lobby" }).evaluate((button) => {
      const submitButton = button as HTMLButtonElement;
      submitButton.click();
      submitButton.click();
    });
    await expect(
      page.getByRole("alert").filter({ hasText: "Test pending boundary response." }),
    ).toBeVisible();
    expect(requestCount).toBe(1);
  });

  test("keeps the rules summary collapsed and the composer within narrow viewports", async ({
    page,
  }) => {
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/create");
      await expect(page.locator("main details")).not.toHaveAttribute("open", "");
      await expect(page.locator("main summary")).toContainText("Standard · all house rules off");
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth, `${width}px create page overflow`).toBeLessThanOrEqual(
        dimensions.clientWidth + 1,
      );
    }
  });
});
