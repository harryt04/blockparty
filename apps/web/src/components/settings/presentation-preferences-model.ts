/**
 * Device-only presentation preferences. See UX-005, DS-060, and C13.
 *
 * This module deliberately contains no game or server data. A malformed or
 * older local value falls back to the safe defaults instead of influencing a
 * command, projection, or rules configuration.
 */

export const PRESENTATION_PREFERENCES_KEY = "blockparty.presentation-preferences.v1";

export type ThemePreference = "system" | "light" | "dark";

export interface PresentationPreferences {
  readonly theme: ThemePreference;
  readonly contrast: boolean;
  readonly reducedMotion: boolean;
  readonly sound: boolean;
  readonly haptics: boolean;
  readonly boardLabels: boolean;
}

export const DEFAULT_PRESENTATION_PREFERENCES: PresentationPreferences = {
  theme: "system",
  contrast: false,
  reducedMotion: false,
  sound: false,
  haptics: false,
  boardLabels: true,
};

function isTheme(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function parsePresentationPreferences(value: string | null): PresentationPreferences {
  if (value === null) return DEFAULT_PRESENTATION_PREFERENCES;

  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_PRESENTATION_PREFERENCES;
    const candidate = parsed as Record<string, unknown>;
    if (
      !isTheme(candidate.theme) ||
      !isBoolean(candidate.contrast) ||
      !isBoolean(candidate.reducedMotion) ||
      !isBoolean(candidate.sound) ||
      !isBoolean(candidate.haptics) ||
      !isBoolean(candidate.boardLabels)
    ) {
      return DEFAULT_PRESENTATION_PREFERENCES;
    }
    return {
      theme: candidate.theme,
      contrast: candidate.contrast,
      reducedMotion: candidate.reducedMotion,
      sound: candidate.sound,
      haptics: candidate.haptics,
      boardLabels: candidate.boardLabels,
    };
  } catch {
    return DEFAULT_PRESENTATION_PREFERENCES;
  }
}

export function serializePresentationPreferences(preferences: PresentationPreferences): string {
  return JSON.stringify(preferences);
}
