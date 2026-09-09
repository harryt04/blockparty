import { afterEach, describe, expect, it, vi } from "vitest";

describe("development security headers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("keeps local HTTP bundles loadable in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BLOCKPARTY_LOCAL_HTTP_TEST", "");

    const { default: config } = await import("../next.config");
    const headers = await config.headers?.();
    const contentSecurityPolicy = headers?.[0]?.headers.find(
      ({ key }) => key === "Content-Security-Policy",
    )?.value;

    expect(contentSecurityPolicy).toBeDefined();
    expect(contentSecurityPolicy).not.toContain("upgrade-insecure-requests");
  });
});
