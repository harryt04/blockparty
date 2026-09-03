import { defineConfig } from "vitest/config";

export default defineConfig({
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
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: {
        lines: 50,
        functions: 50,
        statements: 50,
        branches: 50,
      },
    },
  },
});
