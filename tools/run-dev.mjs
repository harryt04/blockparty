import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL, URL } from "node:url";

const requireFromWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { MongoClient } = requireFromWeb("mongodb");

export const LOCAL_REPLICA_SET = "blockparty-dev";
export const LOCAL_MONGODB_PORT = 27018;
export const LOCAL_MONGODB_URI =
  `mongodb://127.0.0.1:${LOCAL_MONGODB_PORT}/blockparty` +
  `?replicaSet=${LOCAL_REPLICA_SET}&directConnection=true`;

const LOCAL_ADMIN_URI = `mongodb://127.0.0.1:${LOCAL_MONGODB_PORT}/admin?directConnection=true`;
const LOCAL_DB_PATH = join(tmpdir(), "blockparty-dev-mongodb-8");
const LOCAL_LOG_PATH = join(LOCAL_DB_PATH, "mongod.log");

/**
 * Choose the database used by the dev child without changing production env
 * parsing. An unhealthy configured endpoint falls back to the real local
 * replica set instead of leaving every create request to time out.
 */
export function selectDevDatabase(configuredUri, configuredReady) {
  const normalized = configuredUri?.trim();
  if (normalized && configuredReady) {
    return { uri: normalized, manageLocal: false, reason: "configured" };
  }
  return {
    uri: LOCAL_MONGODB_URI,
    manageLocal: true,
    reason: normalized ? "configured-unreachable" : "not-configured",
  };
}

async function replicaSetReady(uri, timeoutMs) {
  if (!uri) return false;
  const client = new MongoClient(uri, {
    connectTimeoutMS: timeoutMs,
    serverSelectionTimeoutMS: timeoutMs,
  });
  try {
    await client.connect();
    const hello = await client.db("admin").command({ hello: 1 });
    const isPrimary = hello.isWritablePrimary === true || hello.ismaster === true;
    return typeof hello.setName === "string" && isPrimary;
  } catch {
    return false;
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function initializeLocalReplicaSet() {
  const client = new MongoClient(LOCAL_ADMIN_URI, {
    connectTimeoutMS: 500,
    serverSelectionTimeoutMS: 500,
  });
  try {
    await client.connect();
    try {
      await client.db("admin").command({
        replSetInitiate: {
          _id: LOCAL_REPLICA_SET,
          members: [{ _id: 0, host: `127.0.0.1:${LOCAL_MONGODB_PORT}` }],
        },
      });
    } catch (error) {
      if (error?.codeName !== "AlreadyInitialized" && error?.code !== 23) throw error;
    }
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function waitFor(check, attempts, delayMs) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await check()) return true;
    await delay(delayMs);
  }
  return false;
}

async function startLocalReplicaSet() {
  if (await replicaSetReady(LOCAL_MONGODB_URI, 300)) return undefined;

  await mkdir(LOCAL_DB_PATH, { recursive: true });
  const child = spawn(
    "mongod",
    [
      "--dbpath",
      LOCAL_DB_PATH,
      "--bind_ip",
      "127.0.0.1",
      "--port",
      String(LOCAL_MONGODB_PORT),
      "--replSet",
      LOCAL_REPLICA_SET,
      "--oplogSize",
      "128",
      "--logpath",
      LOCAL_LOG_PATH,
      "--logappend",
      "--quiet",
    ],
    { stdio: "ignore" },
  );

  let spawnError;
  child.once("error", (error) => {
    spawnError = error;
  });

  const acceptingConnections = await waitFor(
    async () => {
      if (spawnError) throw spawnError;
      const client = new MongoClient(LOCAL_ADMIN_URI, {
        connectTimeoutMS: 250,
        serverSelectionTimeoutMS: 250,
      });
      try {
        await client.connect();
        await client.db("admin").command({ ping: 1 });
        return true;
      } catch {
        return false;
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    30,
    100,
  );
  if (!acceptingConnections) {
    child.kill("SIGTERM");
    throw new Error(`Local MongoDB did not start. See ${LOCAL_LOG_PATH}`);
  }

  await initializeLocalReplicaSet();
  const becamePrimary = await waitFor(() => replicaSetReady(LOCAL_MONGODB_URI, 300), 40, 100);
  if (!becamePrimary) {
    child.kill("SIGTERM");
    throw new Error(`Local MongoDB replica set did not become primary. See ${LOCAL_LOG_PATH}`);
  }
  return child;
}

export async function runDev() {
  const configuredUri = process.env.MONGODB_URI?.trim();
  const configuredReady = await replicaSetReady(configuredUri, 1_000);
  const database = selectDevDatabase(configuredUri, configuredReady);
  let mongoChild;

  if (database.manageLocal) {
    const fallbackReason =
      database.reason === "configured-unreachable"
        ? "Configured MongoDB is unavailable."
        : "MongoDB is not configured.";
    process.stdout.write(`${fallbackReason} Starting the local development replica set.\n`);
    mongoChild = await startLocalReplicaSet();
  }

  process.stdout.write(
    database.manageLocal
      ? "Local MongoDB replica set is ready for live games.\n"
      : "Configured MongoDB replica set is ready for live games.\n",
  );

  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const webChild = spawn(pnpm, ["--filter", "@blockparty/web", "dev"], {
    env: { ...process.env, MONGODB_URI: database.uri },
    stdio: "inherit",
  });

  let shuttingDown = false;
  const stop = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    webChild.kill(signal);
    mongoChild?.kill(signal);
  };
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => stop(signal));
  }

  webChild.on("error", (error) => {
    process.stderr.write(`Unable to start the web development server: ${error.message}\n`);
    process.exitCode = 1;
    mongoChild?.kill("SIGTERM");
  });

  webChild.on("exit", (code) => {
    mongoChild?.kill("SIGTERM");
    process.exitCode = code ?? 1;
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runDev().catch((error) => {
    process.stderr.write(`Unable to prepare local development: ${error.message}\n`);
    process.exitCode = 1;
  });
}
