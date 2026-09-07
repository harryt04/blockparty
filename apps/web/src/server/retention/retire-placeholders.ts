import "server-only";

/** Same-image operator CLI for the placeholder retirement route's operation. */
import { closeMongoClient, getDb, withMongoTransaction } from "../db/client";
import { placeholderRetirementStore, runPlaceholderRetirement } from "./placeholder-retirement";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode =
    args.length === 1 && args[0] === "--execute"
      ? "execute"
      : args.length === 1 && args[0] === "--dry-run"
        ? "dry-run"
        : undefined;
  if (mode === undefined)
    throw new Error(
      "Usage: pnpm --filter @blockparty/web db:retire-placeholders --dry-run|--execute",
    );

  const result = await runPlaceholderRetirement({
    mode,
    database: placeholderRetirementStore(getDb()),
    transaction: withMongoTransaction,
  });
  process.stdout.write(
    `Placeholder retirement ${result.mode}: ${result.candidateGames} candidates, ${result.retiredGames} retired.\n`,
  );
}

if (process.argv[1]?.endsWith("/retire-placeholders.ts") === true) {
  void main()
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "Placeholder retirement failed"}\n`,
      );
      process.exitCode = 1;
    })
    .finally(() => closeMongoClient());
}
