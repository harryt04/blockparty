import { spawn } from "node:child_process";
import process from "node:process";
import { LOCAL_MONGODB_URI, startLocalReplicaSet, stopLocalReplicaSet } from "./run-dev.mjs";

const stages = [["format:check"], ["typecheck"], ["lint"], ["test"], ["build"], ["test:browser"]];

function runPnpm(args, env) {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const child = spawn(command, ["run", ...args], {
      env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`pnpm run ${args.join(" ")} exited with ${signal ?? code}`));
    });
  });
}

async function main() {
  const configuredTestUri = process.env.MONGODB_TEST_URI?.trim() || undefined;
  const mongoChild = configuredTestUri === undefined ? await startLocalReplicaSet() : undefined;
  const testUri = configuredTestUri ?? LOCAL_MONGODB_URI;
  const env = {
    ...process.env,
    MONGODB_TEST_URI: testUri,
    MONGODB_URI: testUri,
    MONGODB_DB: process.env.MONGODB_DB ?? `blockparty_ci_${process.pid}`,
  };

  try {
    for (const stage of stages) await runPnpm(stage, env);
  } finally {
    stopLocalReplicaSet(mongoChild);
  }
}

main().catch((error) => {
  process.stderr.write(`CI failed: ${error.message}\n`);
  process.exitCode = 1;
});
