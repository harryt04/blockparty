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
import { MongoClient, type Db } from "mongodb";
import { env, isDatabaseConfigured } from "../env";

/** Cached across hot reloads in development so connections do not leak. */
const globalForMongo = globalThis as unknown as {
  __blockpartyMongoClient?: MongoClient;
};

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("MONGODB_URI is not configured");
    this.name = "DatabaseNotConfiguredError";
  }
}

export function getMongoClient(): MongoClient {
  if (!isDatabaseConfigured || env.MONGODB_URI === undefined) {
    throw new DatabaseNotConfiguredError();
  }
  globalForMongo.__blockpartyMongoClient ??= new MongoClient(env.MONGODB_URI, {
    // Bounded pool and timeouts, so a slow database cannot exhaust the process.
    maxPoolSize: 20,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 5_000,
    connectTimeoutMS: 5_000,
    retryWrites: true,
  });
  return globalForMongo.__blockpartyMongoClient;
}

export function getDb(): Db {
  return getMongoClient().db(env.MONGODB_DB);
}

/**
 * Readiness probe. Returns a coarse status; it never surfaces the host,
 * the credential, or the driver's error text. See SEC-004.
 */
export async function pingDatabase(): Promise<"ok" | "not_configured" | "unreachable"> {
  if (!isDatabaseConfigured) return "not_configured";
  try {
    await getDb().command({ ping: 1 });
    return "ok";
  } catch {
    return "unreachable";
  }
}

/**
 * Graceful shutdown: stop new commands, close SSE streams, wait for
 * transactions, close the change stream, then close this client. ENG-004.
 *
 * TODO(ENG-004): call this from the process signal handlers once the SSE
 * registry and the change stream exist.
 */
export async function closeMongoClient(): Promise<void> {
  const client = globalForMongo.__blockpartyMongoClient;
  if (client === undefined) return;
  globalForMongo.__blockpartyMongoClient = undefined;
  await client.close();
}
