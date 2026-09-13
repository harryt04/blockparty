import "server-only";

/** One-shot database maintenance for the same image that serves the app. */
import { closeMongoClient, getDb } from "./client";
import { ensureIndexes } from "./collections";

export async function runDatabaseMaintenance(): Promise<{
  collections: number;
  indexes: number;
}> {
  try {
    return await ensureIndexes(getDb());
  } finally {
    await closeMongoClient();
  }
}

async function main(): Promise<void> {
  const result = await runDatabaseMaintenance();
  process.stdout.write(
    `MongoDB maintenance complete: ${result.collections} collections, ${result.indexes} indexes.\n`,
  );
}

if (process.argv[1]?.endsWith("/maintenance.ts") === true) {
  void main().catch(async (error: unknown) => {
    await closeMongoClient();
    process.stderr.write(
      `${error instanceof Error ? error.message : "MongoDB maintenance failed"}\n`,
    );
    process.exitCode = 1;
  });
}
