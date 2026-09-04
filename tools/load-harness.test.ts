import { describe, expect, it } from "vitest";
import { budgetsPass, PERFORMANCE_BUDGETS, summarizePhase, type LoadReport } from "./load-harness";

function report(phases: LoadReport["phases"]): LoadReport {
  return {
    schemaVersion: "1.0.0",
    generatedAt: "2026-09-04T00:00:00.000Z",
    targetOrigin: "https://load.example.test",
    topology: "web=1,mongodb=3",
    release: { gitRevision: "abc", appVersion: "1.0.0", contentVersion: "1.0.0" },
    dataset: { seatCount: 2, botSeatCount: 0 },
    budgets: PERFORMANCE_BUDGETS,
    phases,
  };
}

describe("load harness budget contract", () => {
  it("uses nearest-rank p75 and p95 values and records every protocol operation", () => {
    const phase = summarizePhase("target", 4, 2, [
      {
        lobbyMs: 100,
        ackMs: 200,
        samples: [
          { operation: "create", durationMs: 20, status: 201, ok: true },
          { operation: "join", durationMs: 30, status: 200, ok: true },
          { operation: "command", durationMs: 40, status: 202, ok: true },
          { operation: "sync", durationMs: 10, status: 200, ok: true },
          { operation: "sse", durationMs: 5, status: 200, ok: true },
        ],
      },
      { lobbyMs: 200, ackMs: 300, samples: [] },
      { lobbyMs: 300, ackMs: 400, samples: [] },
      { lobbyMs: 400, ackMs: 500, samples: [] },
    ]);

    expect(phase.lobbyP75Ms).toBe(300);
    expect(phase.authoritativeAckP95Ms).toBe(500);
    expect(phase.operationSamples.map((sample) => sample.operation)).toEqual([
      "create",
      "join",
      "command",
      "sync",
      "sse",
    ]);
  });

  it("fails a report when a phase has an error or exceeds either budget", () => {
    const passing = summarizePhase("target", 1, 1, [{ lobbyMs: 2_999, ackMs: 1_499, samples: [] }]);
    expect(budgetsPass(report([passing]))).toBe(true);

    const failing = summarizePhase("saturation", 2, 2, [
      { lobbyMs: 3_000, ackMs: 1_499, samples: [] },
      new Error("one scenario failed"),
    ]);
    expect(budgetsPass(report([failing]))).toBe(false);

    const atBoundary = summarizePhase("target", 1, 1, [
      { lobbyMs: PERFORMANCE_BUDGETS.lobbyP75Ms, ackMs: 1_499, samples: [] },
    ]);
    expect(budgetsPass(report([atBoundary]))).toBe(false);
  });

  it("keeps sensitive request material out of the report shape", () => {
    const phase = summarizePhase("target", 1, 1, [
      {
        lobbyMs: 100,
        ackMs: 200,
        samples: [{ operation: "command", durationMs: 20, status: 202, ok: true }],
      },
    ]);
    const serialized = JSON.stringify(report([phase]));
    expect(serialized).not.toMatch(/gameId|invitePath|pseudonym|capabilit|cookie|payload|token/iu);
  });
});
