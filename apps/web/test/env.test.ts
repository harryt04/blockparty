import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseServerEnv } from "../src/server/env";

describe("server environment parsing", () => {
  it("treats blank optional values from .env.example as unset", () => {
    const parsed = parseServerEnv({
      NODE_ENV: "test",
      MONGODB_URI: "",
      COOKIE_SECRET: "",
      INTERNAL_CLEANUP_SECRET: "",
    });

    expect(parsed.MONGODB_URI).toBeUndefined();
    expect(parsed.COOKIE_SECRET).toBeUndefined();
    expect(parsed.INTERNAL_CLEANUP_SECRET).toBeUndefined();
  });

  it("preserves a configured replica-set URI", () => {
    const parsed = parseServerEnv({
      NODE_ENV: "test",
      MONGODB_URI: "mongodb://mongo.example/blockparty?replicaSet=rs0",
      MONGODB_DB: "blockparty_test",
    });

    expect(parsed.MONGODB_URI).toBe("mongodb://mongo.example/blockparty?replicaSet=rs0");
    expect(parsed.MONGODB_DB).toBe("blockparty_test");
  });
});
