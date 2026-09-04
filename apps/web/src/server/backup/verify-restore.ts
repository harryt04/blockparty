import "server-only";

/** CLI entrypoint for the isolated restore integrity check. See OPS-009. */
import { closeMongoClient, getDb } from "../db/client";
import { RestoreIntegrityError, verifyRestoredDataset } from "./restore-integrity";

async function main(): Promise<void> {
  try {
    const report = await verifyRestoredDataset(getDb());
    process.stdout.write(`Restore integrity verified: ${JSON.stringify(report)}\n`);
  } catch (error: unknown) {
    if (error instanceof RestoreIntegrityError) {
      process.stderr.write(`Restore integrity failed: ${error.violations.join(", ")}\n`);
    } else {
      process.stderr.write("Restore integrity check failed.\n");
    }
    process.exitCode = 1;
  } finally {
    await closeMongoClient();
  }
}

if (process.argv[1]?.endsWith("/verify-restore.ts") === true) {
  void main();
}
