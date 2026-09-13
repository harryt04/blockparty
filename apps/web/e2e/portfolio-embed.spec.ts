import { expect, test } from "@playwright/test";

test.describe("portfolio embed", () => {
  test("renders a static preview without app side effects", async ({ page }) => {
    const requestedPaths: string[] = [];
    page.on("request", (request) => {
      requestedPaths.push(new URL(request.url()).pathname);
    });

    const response = await page.goto("/?embed=portfolio");

    await expect(page.getByRole("heading", { name: "Own the block." })).toBeVisible();
    await expect(page.getByText("Classic table preview")).toBeVisible();
    await expect(page.getByRole("link", { name: "Set up the table" })).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveCount(0);
    expect(response?.headers()["content-security-policy"]).toContain(
      "frame-ancestors 'self' https://harryt.dev",
    );
    expect(response?.headers()["x-frame-options"]).toBeUndefined();
    expect(requestedPaths).not.toContain("/sw.js");
    expect(requestedPaths.some((pathname) => pathname.startsWith("/api/"))).toBe(false);
  });

  test("keeps the normal landing protected and intact", async ({ page }) => {
    const response = await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Own the block. Build your fortune." }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Set up the table" })).toBeVisible();
    expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(response?.headers()["x-frame-options"]).toBe("DENY");
  });
});
