import { describe, expect, it } from "vitest";

const modulePath = "./run-dev.mjs";
const { LOCAL_MONGODB_URI, selectDevDatabase } = (await import(modulePath)) as {
  LOCAL_MONGODB_URI: string;
  selectDevDatabase: (
    configuredUri: string | undefined,
    configuredReady: boolean,
  ) => { uri: string; manageLocal: boolean; reason: string };
};

describe("development database selection", () => {
  it("uses a healthy configured replica set without managing a local process", () => {
    expect(selectDevDatabase(" mongodb://configured.example/game ", true)).toEqual({
      uri: "mongodb://configured.example/game",
      manageLocal: false,
      reason: "configured",
    });
  });

  it("falls back to the local replica set when the configured endpoint is unreachable", () => {
    expect(selectDevDatabase("mongodb://unreachable.example/game", false)).toEqual({
      uri: LOCAL_MONGODB_URI,
      manageLocal: true,
      reason: "configured-unreachable",
    });
  });

  it("supplies the local replica set when no database is configured", () => {
    expect(selectDevDatabase("", false)).toEqual({
      uri: LOCAL_MONGODB_URI,
      manageLocal: true,
      reason: "not-configured",
    });
  });
});
