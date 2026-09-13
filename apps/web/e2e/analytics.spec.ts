import { expect, test, type Page } from "@playwright/test";

const POSTHOG_ORIGIN = "http://127.0.0.1:3100";

async function stubAnalytics(page: Page) {
  await page.route("**/capture*", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "http://127.0.0.1:3100",
        "access-control-allow-credentials": "true",
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      },
      json: { status: 1 },
    });
  });
}

test.describe("analytics consent boundary", () => {
  test("denied consent makes no PostHog requests and remains denied", async ({ page }) => {
    const requests: string[] = [];
    await page.on("request", (request) => {
      if (request.url() === `${POSTHOG_ORIGIN}/capture/`) requests.push(request.url());
    });
    await stubAnalytics(page);
    await page.goto("/");
    await page
      .getByRole("complementary", { name: "Analytics consent" })
      .getByRole("button", { name: "Keep analytics off" })
      .click();
    await page.reload();
    await expect(page.getByRole("complementary", { name: "Analytics consent" })).toHaveCount(0);
    expect(requests).toEqual([]);
  });

  test("grant initializes PostHog, sends only allowlisted properties, and withdrawal stops it", async ({
    page,
  }) => {
    const payloads: unknown[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      const body = request.postData();
      if (pathname !== "/capture" && pathname !== "/capture/") return;
      if (body !== null) {
        try {
          payloads.push(JSON.parse(body));
        } catch {
          // Non-JSON requests carry no app data.
        }
      }
    });
    await page.goto("/");
    await page
      .getByRole("complementary", { name: "Analytics consent" })
      .getByRole("button", { name: "Allow analytics" })
      .click();
    await expect.poll(() => payloads.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(payloads);
    expect(serialized).not.toContain("seatCapability");
    expect(serialized).not.toContain("gameId");
    expect(serialized).not.toContain("North Star");

    await page.goto("/settings");
    await page.getByRole("button", { name: "Withdraw analytics consent" }).click();
    const countAfterWithdrawal = payloads.length;
    await page.goto("/");
    await expect(page.getByRole("complementary", { name: "Analytics consent" })).toBeVisible();
    await page.waitForTimeout(250);
    expect(payloads.length).toBe(countAfterWithdrawal);
  });
});
