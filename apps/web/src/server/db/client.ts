import "server-only";

/**
 * The MongoDB client. See ENG-006 and ENG-015.
 *
 * The client is created lazily and cached. Nothing connects at import time, so
 * a build or a page render never needs a database.
 *
 * MongoDB must run as a replica set: standalone deployments cannot provide the
 * transaction semantics the command path requires.
 */
import { MongoClient, type ClientSession, type Db } from "mongodb";
import { env, isDatabaseConfigured } from "../env";

/** Cached across hot reloads in development so connections do not leak. */
const globalForMongo = globalThis as unknown as {
  __blockpartyMongoRuntime?: MongoRuntime;
};

const MAX_ACTIVE_SESSIONS = 20;

interface MongoRuntime {
  client?: MongoClient;
  activeSessions: number;
  closing: boolean;
  closePromise?: Promise<void>;
}

function runtime(): MongoRuntime {
  globalForMongo.__blockpartyMongoRuntime ??= {
    activeSessions: 0,
    closing: false,
  };
  return globalForMongo.__blockpartyMongoRuntime;
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("MONGODB_URI is not configured");
    this.name = "DatabaseNotConfiguredError";
  }
}

export class DatabaseClosingError extends Error {
  constructor() {
    super("The database is closing");
    this.name = "DatabaseClosingError";
  }
}

export class DatabaseSessionLimitError extends Error {
  constructor() {
    super("The database session limit has been reached");
    this.name = "DatabaseSessionLimitError";
  }
}

export function getMongoClient(): MongoClient {
  if (!isDatabaseConfigured || env.MONGODB_URI === undefined) {
    throw new DatabaseNotConfiguredError();
  }
  const state = runtime();
  if (state.closing) throw new DatabaseClosingError();
  state.client ??= new MongoClient(env.MONGODB_URI, {
    // Bounded pool and timeouts, so a slow database cannot exhaust the process.
    maxPoolSize: 20,
    minPoolSize: 0,
    maxConnecting: 2,
    waitQueueTimeoutMS: 5_000,
    serverSelectionTimeoutMS: 5_000,
    connectTimeoutMS: 5_000,
    retryWrites: true,
  });
  return state.client;
}

export function getDb(): Db {
  return getMongoClient().db(env.MONGODB_DB);
}

export type DatabaseReadiness = "ok" | "not_configured" | "unreachable";

/**
 * A standalone MongoDB responds to `ping` but cannot satisfy the transaction
 * and change-stream contract. Require a writable replica-set primary here so
 * readiness does not send traffic to an unusable database. See ENG-006,
 * ENG-016, and OPS-002.
 */
export async function checkDatabaseReadiness(
  database: Pick<Db, "command">,
): Promise<Exclude<DatabaseReadiness, "not_configured">> {
  try {
    const hello = (await database.command({ hello: 1 })) as {
      readonly setName?: unknown;
      readonly isWritablePrimary?: unknown;
      readonly ismaster?: unknown;
    };
    const isPrimary = hello.isWritablePrimary === true || hello.ismaster === true;
    return typeof hello.setName === "string" && isPrimary ? "ok" : "unreachable";
  } catch {
    return "unreachable";
  }
}

/**
 * Readiness probe. Returns a coarse status; it never surfaces the host,
 * the credential, or the driver's error text. See SEC-004.
 */
export async function pingDatabase(): Promise<"ok" | "not_configured" | "unreachable"> {
  if (!isDatabaseConfigured) return "not_configured";
  return checkDatabaseReadiness(getDb());
}

/**
 * Runs one bounded MongoDB transaction and always ends its session. The
 * adapter owns session admission; command code owns authorization and the
 * transaction's domain operations. See ENG-015.
 */
export async function withMongoTransaction<T>(
  operation: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const state = runtime();
  if (state.closing) throw new DatabaseClosingError();
  if (state.activeSessions >= MAX_ACTIVE_SESSIONS) throw new DatabaseSessionLimitError();

  const session = getMongoClient().startSession();
  state.activeSessions += 1;
  try {
    return await session.withTransaction(() => operation(session));
  } finally {
    await session.endSession();
    state.activeSessions -= 1;
  }
}

/** Number of in-flight adapter-owned sessions, useful for lifecycle evidence. */
export function activeMongoSessionCount(): number {
  return runtime().activeSessions;
}

/**
 * Installs the Node lifecycle hook used by the web image. Route handlers that
 * use `withMongoTransaction` stop admitting work as soon as SIGTERM/SIGINT is
 * received, then the adapter drains sessions before closing the driver.
 */
export function installMongoShutdownHandlers(): () => void {
  const onSignal = () => {
    void import("../lifecycle")
      .then(({ beginServerShutdown }) => beginServerShutdown())
      .then(() => closeMongoClient())
      .then(
        () => process.exit(0),
        () => process.exit(1),
      );
  };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);
  return () => {
    process.off("SIGTERM", onSignal);
    process.off("SIGINT", onSignal);
  };
}

/**
 * Graceful MongoDB shutdown: reject new adapter transactions, wait for
 * transactions already admitted, then close this client. The SSE registry
 * and change-stream owner add their own lifecycle hooks when implemented.
 * See ENG-004.
 */
export async function closeMongoClient(): Promise<void> {
  const state = runtime();
  if (state.closePromise !== undefined) return state.closePromise;
  const client = state.client;
  if (client === undefined) return;

  state.closing = true;
  state.closePromise = (async () => {
    // No new adapter transactions can start after `closing` flips. Existing
    // transactions drain before the driver is closed.
    while (state.activeSessions > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    // The change-stream owner is process-local and must release its cursor
    // before the shared MongoDB client closes. See ENG-007 and PROTO-003.
    const { stopChangeStream } = await import("../sse/change-stream");
    await stopChangeStream();
    await client.close();
    state.client = undefined;
    state.closing = false;
    state.closePromise = undefined;
  })();
  return state.closePromise;
}
