import { expect, test } from "@playwright/test";

test.describe("entry actions remain reachable with first-visit notices", () => {
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
