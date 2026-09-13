import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { admitCommand, beginServerShutdown, isServerDraining } from "../src/server/lifecycle";

describe("server lifecycle", () => {
  it("stops admission and waits for already admitted commands", async () => {
    const release = admitCommand();
    expect(release).toBeTypeOf("function");

    let drained = false;
    const shutdown = beginServerShutdown().then(() => {
      drained = true;
    });
    await Promise.resolve();

    expect(isServerDraining()).toBe(true);
    expect(admitCommand()).toBeUndefined();
    expect(drained).toBe(false);

    release?.();
    await shutdown;
    expect(drained).toBe(true);
  });
});
