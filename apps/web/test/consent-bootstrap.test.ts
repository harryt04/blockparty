import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ANALYTICS_CONSENT_KEY } from "../src/components/analytics/analytics-model";
import {
  CONSENT_BOOTSTRAP_SCRIPT,
  CONSENT_RESOLVED_ATTRIBUTE,
} from "../src/components/analytics/consent-bootstrap";

interface Page {
  readonly search?: string;
  readonly storedConsent?: string | null;
  readonly storageThrows?: boolean;
}

/** Runs the inline script against minimal browser stand-ins and returns the html attributes it set. */
function run({ search = "", storedConsent = null, storageThrows = false }: Page): string[] {
  const attributes: string[] = [];
  const documentElement = {
    setAttribute: (name: string, value: string) => {
      expect(value).toBe("");
      attributes.push(name);
    },
  };
  const localStorage = {
    getItem: (key: string) => {
      if (storageThrows) throw new Error("storage blocked");
      return key === ANALYTICS_CONSENT_KEY ? storedConsent : null;
    },
  };
  new Function("document", "location", "localStorage", "URLSearchParams", CONSENT_BOOTSTRAP_SCRIPT)(
    { documentElement },
    { search },
    localStorage,
    URLSearchParams,
  );
  return attributes;
}

describe("consent notice pre-hydration script", () => {
  it("leaves the notice visible for a visitor who has not chosen", () => {
    expect(run({})).toEqual([]);
    expect(run({ storedConsent: "unknown" })).toEqual([]);
  });

  it("hides the notice for a saved choice of either kind", () => {
    expect(run({ storedConsent: "granted" })).toEqual([CONSENT_RESOLVED_ATTRIBUTE]);
    expect(run({ storedConsent: "denied" })).toEqual([CONSENT_RESOLVED_ATTRIBUTE]);
  });

  it("hides the notice in the portfolio preview, which never shows analytics UI", () => {
    expect(run({ search: "?embed=portfolio" })).toEqual([CONSENT_RESOLVED_ATTRIBUTE]);
    expect(run({ search: "?embed=other" })).toEqual([]);
  });

  it("fails open when local storage is unavailable", () => {
    expect(run({ storageThrows: true })).toEqual([]);
    expect(run({ storageThrows: true, search: "?embed=portfolio" })).toEqual([
      CONSENT_RESOLVED_ATTRIBUTE,
    ]);
  });

  it("keeps the stylesheet, provider, and layout wired to the same attribute", () => {
    const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
    expect(CONSENT_RESOLVED_ATTRIBUTE).toBe("data-consent-resolved");
    expect(read("../src/app/globals.css")).toContain(
      `html[${CONSENT_RESOLVED_ATTRIBUTE}] [data-consent-banner]`,
    );
    expect(read("../src/components/analytics/analytics-provider.tsx")).toContain(
      "removeAttribute(CONSENT_RESOLVED_ATTRIBUTE)",
    );
    expect(read("../src/app/layout.tsx")).toContain("CONSENT_BOOTSTRAP_SCRIPT");
  });
});
