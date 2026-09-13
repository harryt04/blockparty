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

  it("allows only the portfolio landing preview to be framed", async () => {
    const { default: config } = await import("../next.config");
    const headers = await config.headers?.();
    const defaultRule = headers?.find(({ source }) => source === "/:path*");
    const deniedRule = headers?.find(
      ({ source, missing }) => source === "/:path*" && missing !== undefined,
    );
    const invalidEmbedRule = headers?.find(
      ({ source, has }) => source === "/:path*" && has !== undefined,
    );
    const portfolioRule = headers?.find(({ source }) => source === "/");
    const defaultContentSecurityPolicy = defaultRule?.headers.find(
      ({ key }) => key === "Content-Security-Policy",
    )?.value;
    const portfolioContentSecurityPolicy = portfolioRule?.headers.find(
      ({ key }) => key === "Content-Security-Policy",
    )?.value;

    expect(defaultContentSecurityPolicy).toContain("frame-ancestors 'none'");
    expect(deniedRule?.headers).toContainEqual({ key: "X-Frame-Options", value: "DENY" });
    expect(invalidEmbedRule?.headers).toContainEqual({
      key: "X-Frame-Options",
      value: "DENY",
    });
    expect(portfolioRule?.has).toEqual([{ type: "query", key: "embed", value: "portfolio" }]);
    expect(portfolioContentSecurityPolicy).toContain("frame-ancestors 'self' https://harryt.dev");
    expect(portfolioRule?.headers).not.toContainEqual({ key: "X-Frame-Options", value: "DENY" });
  });
});
