import { expect, test, type Page } from "@playwright/test";

async function waitForServiceWorker(page: Page): Promise<void> {
  await page.waitForFunction(
    () => navigator.serviceWorker?.controller?.scriptURL.endsWith("/sw.js") === true,
  );
}

test.describe("PWA shell and network truth", () => {
  test("registers a versioned shell cache with no game or API responses", async ({ page }) => {
    await page.goto("/");
    const manifest = await page.evaluate(async () => {
      const response = await fetch("/manifest.webmanifest");
      return { ok: response.ok, body: await response.json() };
    });
    expect(manifest.ok).toBe(true);
    expect(manifest.body).toMatchObject({
      name: "Blockparty",
      display: "standalone",
      start_url: "/",
    });
    const workerSource = await page.evaluate(async () => (await fetch("/sw.js")).text());
    expect(workerSource).toContain('event.data?.type === "SKIP_WAITING"');

    await waitForServiceWorker(page);
    const cache = await page.evaluate(async () => {
      const names = await caches.keys();
      const name = names.find((candidate) => candidate.startsWith("blockparty-app-shell-"));
      if (!name) return undefined;
      const requests = await (await caches.open(name)).keys();
      return { name, urls: requests.map((request) => new URL(request.url).pathname) };
    });

    expect(cache?.name).toMatch(/^blockparty-app-shell-.+/);
    expect(cache?.urls).toEqual(
      expect.arrayContaining(["/", "/offline", "/manifest.webmanifest", "/icons/icon.svg"]),
    );
    expect(cache?.urls.some((url) => url.startsWith("/api/") || url.includes("/game/"))).toBe(
      false,
    );
  });

  test("shows the offline boundary and serves the offline fallback", async ({
    page,
    context,
  }, testInfo) => {
    await page.goto("/");
    await waitForServiceWorker(page);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.getByRole("status")).toContainText(
      "Offline. Live play requires reconnection.",
    );
    const cachedOffline = await page.evaluate(async () => {
      const names = await caches.keys();
      const name = names.find((candidate) => candidate.startsWith("blockparty-app-shell-"));
      if (!name) return undefined;
      const response = await caches.match(new URL("/offline", location.origin).toString());
      return response?.text();
    });
    expect(await cachedOffline).toContain("You are offline");

    // The first visit installs the worker. A controlled online revisit fills
    // the versioned static asset cache before the simulated disconnect.
    await page.reload({ waitUntil: "networkidle" });
    await context.setOffline(true);
    // WebKit's Playwright offline emulation cannot reload a service-worker
    // controlled page, so it still exercises the offline UI on the cached page.
    if (testInfo.project.name !== "webkit") {
      const response = await page.reload({ waitUntil: "domcontentloaded" });
      expect(response?.ok()).toBe(true);
    }
    await expect(page.getByText("A private game, one link away.", { exact: true })).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.getByRole("status")).toContainText(
      "Offline. Live play requires reconnection.",
    );
    await context.setOffline(false);
  });

  test("offers install only after engagement and remembers dismissal", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt");
      Object.defineProperty(event, "prompt", { value: async () => undefined });
      Object.defineProperty(event, "userChoice", {
        value: Promise.resolve({ outcome: "dismissed" }),
      });
      window.dispatchEvent(event);
    });
    await expect(page.getByRole("complementary", { name: "Install Blockparty" })).toHaveCount(0);
    await page.evaluate(() => window.dispatchEvent(new Event("pointerdown")));
    const prompt = page.getByRole("complementary", { name: "Install Blockparty" });
    await expect(prompt).toBeVisible({ timeout: 10_000 });
    await prompt.getByRole("button", { name: "Dismiss" }).click();
    await expect(prompt).toHaveCount(0);
    expect(
      await page.evaluate(() => localStorage.getItem("blockparty.pwa-install-dismissed.v1")),
    ).toBe("true");
  });
});
