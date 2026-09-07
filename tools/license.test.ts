import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "..");

function readRepositoryFile(relativePath: string): string {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

describe("distribution license metadata", () => {
  it("ships the complete AGPL notice and documents the content split", () => {
    const license = readRepositoryFile("LICENSE");
    const contentLicense = readRepositoryFile("CONTENT-LICENSE.md");

    expect(license).toContain("GNU AFFERO GENERAL PUBLIC LICENSE");
    expect(license).toContain("END OF TERMS AND CONDITIONS");
    expect(contentLicense).toContain("CC BY-SA 4.0");
    expect(contentLicense).toContain("AGPL-3.0-or-later");
  });

  it("keeps every workspace package on the declared SPDX code license", () => {
    const packagePaths = [
      "package.json",
      "apps/web/package.json",
      "packages/contracts/package.json",
      "packages/game-content/package.json",
      "packages/game-engine/package.json",
    ];

    for (const packagePath of packagePaths) {
      const manifest = JSON.parse(readRepositoryFile(packagePath)) as {
        license?: string;
      };
      expect(manifest.license, packagePath).toBe("AGPL-3.0-or-later");
    }
  });

  it("keeps notice, contributor, and trademark policy discoverable", () => {
    const readme = readRepositoryFile("README.md");

    expect(readme).toContain("CONTENT-LICENSE.md");
    expect(readme).toContain("NOTICE.md");
    expect(readme).toContain("TRADEMARKS.md");
    expect(readRepositoryFile("CONTRIBUTING.md")).toContain("provenance");
    expect(readRepositoryFile("TRADEMARKS.md")).toContain("not cleared");
  });
});
