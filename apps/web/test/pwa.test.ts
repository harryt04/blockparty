import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/env", () => ({ env: { PWA_CACHE_VERSION: "1" } }));

import { GET } from "../src/app/sw.js/route";
import {
  isIosDevice,
  networkStatusMessage,
  PWA_DISMISSAL_KEY,
  shouldShowInstallPrompt,
} from "../src/components/pwa/pwa-model";

describe("PWA shell policy", () => {
  it("uses the versioned server configuration in the worker cache name", async () => {
    const response = GET();
    const source = await response.text();

    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("service-worker-allowed")).toBe("/");
    expect(source).toContain('const CACHE_NAME = "blockparty-app-shell-1"');
    expect(source).toContain('"/offline"');
    expect(source).toContain('"/manifest.webmanifest"');
    expect(source).toContain('event.data?.type === "SKIP_WAITING"');
    expect(source).toContain('url.pathname.startsWith("/_next/static/")');
    expect(source).not.toContain("/api/");
    expect(source).not.toContain("EventSource");
  });

  it("only shows install after engagement and keeps dismissal device-local", () => {
    expect(PWA_DISMISSAL_KEY).toBe("blockparty.pwa-install-dismissed.v1");
    expect(
      shouldShowInstallPrompt({
        engaged: false,
        dismissed: false,
        installed: false,
        canPrompt: true,
        isIos: false,
      }),
    ).toBe(false);
    expect(
      shouldShowInstallPrompt({
        engaged: true,
        dismissed: true,
        installed: false,
        canPrompt: true,
        isIos: false,
      }),
    ).toBe(false);
    expect(
      shouldShowInstallPrompt({
        engaged: true,
        dismissed: false,
        installed: false,
        canPrompt: true,
        isIos: false,
      }),
    ).toBe(true);
  });

  it("recognizes iOS manual-install devices and states the network boundary", () => {
    expect(isIosDevice("Mozilla/5.0 (iPhone)", "iPhone", 5)).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (Macintosh)", "MacIntel", 5)).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (X11; Linux x86_64)", "Linux x86_64", 0)).toBe(false);
    expect(networkStatusMessage(false)).toBe("Offline. Live play requires reconnection.");
    expect(networkStatusMessage(true)).toBeUndefined();
  });
});
