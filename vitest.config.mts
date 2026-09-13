import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        test: {
          name: "contracts",
          root: "packages/contracts",
          include: ["test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "game-content",
          root: "packages/game-content",
          include: ["test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "game-engine",
          root: "packages/game-engine",
          include: ["test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "web",
          root: "apps/web",
          include: ["test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "load-harness",
          root: "tools",
          include: ["*.test.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["apps/web/src/**/*.ts", "packages/*/src/**/*.ts", "tools/load-harness.ts"],
      exclude: [
        "**/*.d.ts",
        "**/instrumentation*.ts",
        "**/maintenance.ts",
        "**/verify-restore.ts",
        "**/retire-placeholders.ts",
      ],
      reporter: ["text", "json-summary", "html", "lcov"],
      thresholds: {
        lines: 50,
        functions: 50,
        statements: 50,
        branches: 50,
      },
    },
  },
});
