import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import {
  CommandAckEnvelope,
  CreateGameResponse,
  JoinGameResponse,
  STANDARD_CONFIGURATION,
} from "../packages/contracts/src/index";

/** Versioned output contract for TEST-006 and PRD-NFR-007 evidence. */
export const LOAD_REPORT_SCHEMA_VERSION = "1.0.0" as const;

export const PERFORMANCE_BUDGETS = Object.freeze({
  lobbyP75Ms: 3_000,
  authoritativeAckP95Ms: 1_500,
});

type Operation = "create" | "join" | "command" | "sync" | "sse";

export interface TimingSample {
  readonly operation: Operation;
  readonly durationMs: number;
  readonly status: number;
  readonly ok: boolean;
}

export interface PhaseReport {
  readonly name: string;
  readonly requestedGames: number;
  readonly concurrency: number;
  readonly completedGames: number;
  readonly failedGames: number;
  readonly lobbyP75Ms: number | null;
  readonly authoritativeAckP95Ms: number | null;
  readonly operationSamples: readonly TimingSample[];
}

export interface LoadReport {
  readonly schemaVersion: typeof LOAD_REPORT_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly targetOrigin: string;
  readonly topology: string;
  readonly release: {
    readonly gitRevision: string;
    readonly appVersion: string;
    readonly contentVersion: string;
  };
  readonly dataset: {
    readonly seatCount: 2;
    readonly botSeatCount: 0;
  };
  readonly budgets: typeof PERFORMANCE_BUDGETS;
  readonly phases: readonly PhaseReport[];
  readonly webVitals?: WebVitalsReport;
}

export interface WebVitalsReport {
  readonly path: "/create";
  readonly ttfbMs: number;
  readonly fcpMs: number | null;
  readonly lcpMs: number | null;
  readonly domInteractiveMs: number;
  readonly fullLoadMs: number;
}

interface HarnessOptions {
  readonly baseUrl: string;
  readonly games: number;
  readonly concurrency: number;
  readonly timeoutMs: number;
  readonly topology: string;
  readonly output: string;
  readonly saturation: boolean;
  readonly webVitals: boolean;
}

interface ScenarioResult {
  readonly lobbyMs: number;
  readonly ackMs: number;
  readonly samples: readonly TimingSample[];
}

class LoadRequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Load request failed with HTTP ${status}`);
    this.name = "LoadRequestError";
    this.status = status;
  }
}

/** In-memory cookie jar. Raw cookies never enter reports, logs, or errors. */
class CookieClient {
  private readonly cookies = new Map<string, string>();

  constructor(
    private readonly origin: string,
    private readonly timeoutMs: number,
  ) {}

  async json<T>(
    path: string,
    method: "GET" | "POST",
    body?: unknown,
  ): Promise<{ value: T; sample: TimingSample }> {
    const startedAt = performance.now();
    const response = await this.request(path, method, body);
    const value = (await response.json()) as T;
    return {
      value,
      sample: {
        operation: operationForPath(path),
        durationMs: elapsedMs(startedAt),
        status: response.status,
        ok: response.ok,
      },
    };
  }

  async stream(path: string): Promise<TimingSample> {
    const startedAt = performance.now();
    const response = await this.request(path, "GET");
    if (!response.ok) throw new LoadRequestError(response.status);
    const reader = response.body?.getReader();
    if (reader === undefined) throw new Error("SSE response had no readable body");
    await reader.read();
    await reader.cancel();
    return {
      operation: "sse",
      durationMs: elapsedMs(startedAt),
      status: response.status,
      ok: true,
    };
  }

  private async request(path: string, method: "GET" | "POST", body?: unknown): Promise<Response> {
    const headers = new Headers({
      Accept: "application/json",
      Origin: this.origin,
    });
    const cookie = this.cookieHeader();
    if (cookie !== "") headers.set("Cookie", cookie);
    if (body !== undefined) {
      headers.set("Content-Type", "application/json");
      const csrf = [...this.cookies].find(
        ([name]) => name === "bp_csrf" || name.endsWith("-bp_csrf"),
      )?.[1];
      if (csrf !== undefined) headers.set("x-csrf-token", csrf);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(new URL(path, this.origin), {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      this.storeCookies(response.headers);
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  private storeCookies(headers: Headers): void {
    const setCookies = headers.getSetCookie?.() ?? [];
    for (const setCookie of setCookies) {
      const separator = setCookie.indexOf(";");
      const pair = separator < 0 ? setCookie : setCookie.slice(0, separator);
      const equals = pair.indexOf("=");
      if (equals > 0) this.cookies.set(pair.slice(0, equals), pair.slice(equals + 1));
    }
  }

  private cookieHeader(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

function operationForPath(path: string): Operation {
  if (path === "/api/games") return "create";
  if (path.includes("/join")) return "join";
  if (path.includes("/commands")) return "command";
  return "sync";
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round((performance.now() - startedAt) * 100) / 100);
}

function percentile(values: readonly number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index] ?? null;
}

export function summarizePhase(
  name: string,
  requestedGames: number,
  concurrency: number,
  results: readonly (ScenarioResult | Error)[],
): PhaseReport {
  const successful = results.filter(
    (result): result is ScenarioResult => !(result instanceof Error),
  );
  const samples = successful.flatMap((result) => result.samples);
  return {
    name,
    requestedGames,
    concurrency,
    completedGames: successful.length,
    failedGames: results.length - successful.length,
    lobbyP75Ms: percentile(
      successful.map((result) => result.lobbyMs),
      0.75,
    ),
    authoritativeAckP95Ms: percentile(
      successful.map((result) => result.ackMs),
      0.95,
    ),
    operationSamples: samples,
  };
}

export function budgetsPass(report: LoadReport): boolean {
  return report.phases.every(
    (phase) =>
      phase.failedGames === 0 &&
      phase.lobbyP75Ms !== null &&
      phase.lobbyP75Ms < PERFORMANCE_BUDGETS.lobbyP75Ms &&
      phase.authoritativeAckP95Ms !== null &&
      phase.authoritativeAckP95Ms < PERFORMANCE_BUDGETS.authoritativeAckP95Ms,
  );
}

async function runScenario(options: HarnessOptions): Promise<ScenarioResult> {
  const host = new CookieClient(options.baseUrl, options.timeoutMs);
  const guest = new CookieClient(options.baseUrl, options.timeoutMs);
  const samples: TimingSample[] = [];
  const lobbyStartedAt = performance.now();

  const created = await host.json<unknown>("/api/games", "POST", {
    seatCount: 2,
    botSeatCount: 0,
    preset: STANDARD_CONFIGURATION.preset,
    configuration: STANDARD_CONFIGURATION,
    acknowledged13Plus: true,
  });
  samples.push(created.sample);
  const create = CreateGameResponse.parse(created.value);
  const openSeat = create.lobby.seats.find((seat) => seat.kind === "open");
  if (openSeat === undefined) throw new Error("Create response had no open seat");

  const inviteId = create.invitePath.slice("/join/".length);
  const joined = await guest.json<unknown>(`/api/invites/${inviteId}/join`, "POST", {
    name: "Load seat",
    token: openSeat.token,
    acknowledged13Plus: true,
  });
  samples.push(joined.sample);
  const join = JoinGameResponse.parse(joined.value);
  const lobbyMs = elapsedMs(lobbyStartedAt);

  const started = await host.json<unknown>(`/api/games/${create.gameId}/commands`, "POST", {
    protocolVersion: 1,
    type: "game.command",
    requestId: randomUUID(),
    gameId: create.gameId,
    commandId: randomUUID(),
    expectedVersion: 0,
    payload: { type: "StartGame" },
  });
  samples.push(started.sample);
  const startAck = CommandAckEnvelope.parse(started.value);

  const rolled = await host.json<unknown>(`/api/games/${create.gameId}/commands`, "POST", {
    protocolVersion: 1,
    type: "game.command",
    requestId: randomUUID(),
    gameId: create.gameId,
    commandId: randomUUID(),
    expectedVersion: startAck.aggregateVersion,
    payload: { type: "RollDice" },
  });
  samples.push(rolled.sample);
  CommandAckEnvelope.parse(rolled.value);
  const ackMs = rolled.sample.durationMs;

  const synced = await guest.json<unknown>(
    `/api/games/${join.gameId}/sync?lastSequence=0&aggregateVersion=0`,
    "GET",
  );
  samples.push(synced.sample);
  await guest.stream(`/api/games/${join.gameId}/events`).then((sample) => samples.push(sample));

  return { lobbyMs, ackMs, samples };
}

async function runPhase(options: HarnessOptions, name: string, games: number, concurrency: number) {
  const results: (ScenarioResult | Error)[] = [];
  let next = 0;
  async function worker(): Promise<void> {
    while (next < games) {
      next += 1;
      try {
        results.push(await runScenario(options));
      } catch (error) {
        results.push(error instanceof Error ? error : new Error("Unknown load failure"));
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(games, concurrency) }, () => worker()));
  return summarizePhase(name, games, concurrency, results);
}

async function captureWebVitals(options: HarnessOptions): Promise<WebVitalsReport> {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(new URL("/create", options.baseUrl).toString(), {
      waitUntil: "load",
      timeout: options.timeoutMs,
    });
    return await page.evaluate(() => {
      const browserPerformance = globalThis.performance as unknown as {
        getEntriesByType: (type: string) => PerformanceEntry[];
      };
      const navigation = browserPerformance.getEntriesByType(
        "navigation",
      )[0] as PerformanceNavigationTiming;
      const paints = browserPerformance.getEntriesByType("paint");
      const fcp = paints.find((entry) => entry.name === "first-contentful-paint");
      const largest = browserPerformance.getEntriesByType("largest-contentful-paint").at(-1);
      return {
        path: "/create" as const,
        ttfbMs: Math.round(navigation.responseStart * 100) / 100,
        fcpMs: fcp?.startTime === undefined ? null : Math.round(fcp.startTime * 100) / 100,
        lcpMs: largest?.startTime === undefined ? null : Math.round(largest.startTime * 100) / 100,
        domInteractiveMs: Math.round(navigation.domInteractive * 100) / 100,
        fullLoadMs: Math.round(navigation.loadEventEnd * 100) / 100,
      };
    });
  } finally {
    await browser.close();
  }
}

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function parseOptions(argv: readonly string[]): HarnessOptions {
  const values = new Map<string, string>();
  let saturation = false;
  let webVitals = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--saturation") saturation = true;
    else if (argument === "--web-vitals") webVitals = true;
    else if (argument?.startsWith("--")) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${argument} needs a value`);
      }
      values.set(argument, value);
      index += 1;
    } else throw new Error(`Unknown argument: ${argument}`);
  }

  const baseUrl = values.get("--base-url") ?? process.env.LOAD_BASE_URL;
  if (baseUrl === undefined) throw new Error("Set LOAD_BASE_URL or pass --base-url <url>");
  const parsedBaseUrl = new URL(baseUrl);
  if (
    parsedBaseUrl.protocol !== "https:" &&
    parsedBaseUrl.hostname !== "localhost" &&
    parsedBaseUrl.hostname !== "127.0.0.1"
  ) {
    throw new Error("Load targets must use HTTPS, localhost, or 127.0.0.1");
  }

  return {
    baseUrl: parsedBaseUrl.origin,
    games: parsePositiveInt(values.get("--games") ?? "12", "--games"),
    concurrency: parsePositiveInt(values.get("--concurrency") ?? "6", "--concurrency"),
    timeoutMs: parsePositiveInt(values.get("--timeout-ms") ?? "10000", "--timeout-ms"),
    topology: values.get("--topology") ?? "unspecified",
    output: values.get("--output") ?? "docs/delivery/load-report.json",
    saturation,
    webVitals,
  };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const normal = await runPhase(options, "target", options.games, options.concurrency);
  const phases = [normal];
  if (options.saturation) {
    phases.push(await runPhase(options, "saturation", options.games, options.concurrency * 2));
    phases.push(await runPhase(options, "recovery", options.games, options.concurrency));
  }
  const report: LoadReport = {
    schemaVersion: LOAD_REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    targetOrigin: options.baseUrl,
    topology: options.topology,
    release: {
      gitRevision: process.env.GIT_REVISION ?? "unknown",
      appVersion: process.env.APP_VERSION ?? "unknown",
      contentVersion: process.env.CONTENT_VERSION ?? "unknown",
    },
    dataset: { seatCount: 2, botSeatCount: 0 },
    budgets: PERFORMANCE_BUDGETS,
    phases,
    ...(options.webVitals ? { webVitals: await captureWebVitals(options) } : {}),
  };
  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  for (const phase of report.phases) {
    console.log(
      `${phase.name}: ${phase.completedGames}/${phase.requestedGames} games, lobby p75=${phase.lobbyP75Ms ?? "n/a"}ms, ACK p95=${phase.authoritativeAckP95Ms ?? "n/a"}ms`,
    );
  }
  console.log(`Report written to ${options.output}`);
  if (!budgetsPass(report)) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Load harness failed");
    process.exitCode = 1;
  });
}
