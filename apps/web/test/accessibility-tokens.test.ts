import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const playerTokenSource = readFileSync(
  new URL("../src/components/game/player-token.tsx", import.meta.url),
  "utf8",
);

function tokenValues(name: string): string[] {
  return [...stylesheet.matchAll(new RegExp(`--color-${name}:\\s*oklch\\(([^)]+)\\)`, "g"))].map(
    (match) => match[1]!,
  );
}

function luminance(value: string): number {
  const [lightnessPercent, chroma, hue] = value.replace("%", "").split(/\s+/).map(Number);
  const lightness = lightnessPercent! / 100;
  const radians = (hue! * Math.PI) / 180;
  const a = chroma! * Math.cos(radians);
  const b = chroma! * Math.sin(radians);
  let l = lightness + 0.3963377774 * a + 0.2158037573 * b;
  let m = lightness - 0.1055613458 * a - 0.0638541728 * b;
  let s = lightness - 0.0894841773 * a - 1.291485548 * b;
  l **= 3;
  m **= 3;
  s **= 3;
  const red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const srgb = (channel: number) => {
    const clamped = Math.max(0, Math.min(1, channel));
    return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
  };
  return 0.2126 * srgb(red) + 0.7152 * srgb(green) + 0.0722 * srgb(blue);
}

function contrast(first: string, second: string): number {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

describe("accessibility visual tokens", () => {
  it("keeps light and dark text/status tokens at AA contrast", () => {
    const roles = ["ink", "muted-ink", "success", "warning", "danger", "info"];
    const lightSurface = tokenValues("surface")[0]!;
    const darkSurface = tokenValues("surface")[1]!;

    for (const role of roles) {
      expect(contrast(tokenValues(role)[0]!, lightSurface), `${role} light`).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrast(tokenValues(role)[1]!, darkSurface), `${role} dark`).toBeGreaterThanOrEqual(
        4.5,
      );
    }

    expect(contrast(tokenValues("brand-ink")[0]!, tokenValues("brand")[0]!)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrast(tokenValues("brand-ink")[1]!, tokenValues("brand")[1]!)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrast(tokenValues("focus")[0]!, lightSurface)).toBeGreaterThanOrEqual(3);
    expect(contrast(tokenValues("focus")[1]!, darkSurface)).toBeGreaterThanOrEqual(3);
    expect(contrast(tokenValues("line")[0]!, lightSurface)).toBeGreaterThanOrEqual(3);
    expect(contrast(tokenValues("line")[1]!, darkSurface)).toBeGreaterThanOrEqual(3);
  });

  it("defines forced-colour system fallbacks and removes motion immediately", () => {
    expect(stylesheet).toContain("@media (forced-colors: active)");
    for (const systemColor of ["Canvas", "CanvasText", "ButtonText", "Highlight", "GrayText"]) {
      expect(stylesheet).toContain(systemColor);
    }
    expect(stylesheet).toContain("animation: none !important");
    expect(stylesheet).toContain("transition: none !important");
    expect(stylesheet).toContain("[data-token-pattern]");
    expect(playerTokenSource).toContain("data-token-pattern={token.pattern}");
    expect(playerTokenSource).toContain("strokeDasharray={PATTERN_STROKE[token.pattern]}");
  });
});
