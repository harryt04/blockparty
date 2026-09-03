import { describe, expect, it } from "vitest";
import { cn } from "../src/lib/utils";

describe("cn", () => {
  it("combines conditional classes and lets later Tailwind utilities win", () => {
    const visible = false;

    expect(cn("px-2", visible ? "hidden" : undefined, "px-4", { block: true })).toBe("px-4 block");
  });
});
