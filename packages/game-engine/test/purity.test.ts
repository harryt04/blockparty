import { describe, expect, it } from "vitest";

const sourceModules = import.meta.glob("../src/**/*.ts", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

describe("engine purity boundary", () => {
  it("contains no runtime clock, host randomness, or Node imports", () => {
    const source = Object.values(sourceModules).join("\n");

    expect(source).not.toMatch(/\bMath\.random\s*\(/);
    expect(source).not.toMatch(/\b(?:new\s+)?Date\s*\(/);
    expect(source).not.toMatch(/\bfrom\s+["']node:/);
  });
});
