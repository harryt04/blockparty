"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEFAULT_PRESENTATION_PREFERENCES,
  PRESENTATION_PREFERENCES_KEY,
  parsePresentationPreferences,
  serializePresentationPreferences,
  type PresentationPreferences,
  type ThemePreference,
} from "./presentation-preferences-model";

interface PresentationPreferencesContextValue {
  readonly preferences: PresentationPreferences;
  readonly setPreference: <K extends keyof PresentationPreferences>(
    key: K,
    value: PresentationPreferences[K],
  ) => void;
  readonly reset: () => void;
}

const PresentationPreferencesContext = createContext<PresentationPreferencesContextValue | null>(
  null,
);

export function PresentationPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(DEFAULT_PRESENTATION_PREFERENCES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      setPreferences(
        parsePresentationPreferences(window.localStorage.getItem(PRESENTATION_PREFERENCES_KEY)),
      );
    } catch {
      // Private browsing or a storage policy can make localStorage unavailable.
      setPreferences(DEFAULT_PRESENTATION_PREFERENCES);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(
        PRESENTATION_PREFERENCES_KEY,
        serializePresentationPreferences(preferences),
      );
    } catch {
      // The controls still work for this visit when storage is unavailable.
    }
  }, [loaded, preferences]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = preferences.theme;
    root.dataset.contrast = preferences.contrast ? "high" : "default";
    root.dataset.reducedMotion = preferences.reducedMotion ? "true" : "false";
    root.dataset.boardLabels = preferences.boardLabels ? "true" : "false";
  }, [preferences]);

  const value = useMemo<PresentationPreferencesContextValue>(
    () => ({
      preferences,
      setPreference: (key, value) => setPreferences((current) => ({ ...current, [key]: value })),
      reset: () => setPreferences(DEFAULT_PRESENTATION_PREFERENCES),
    }),
    [preferences],
  );

  return (
    <PresentationPreferencesContext.Provider value={value}>
      {children}
    </PresentationPreferencesContext.Provider>
  );
}

export function usePresentationPreferences(): PresentationPreferencesContextValue {
  const value = useContext(PresentationPreferencesContext);
  if (value === null) {
    throw new Error(
      "usePresentationPreferences must be used inside PresentationPreferencesProvider",
    );
  }
  return value;
}

function PreferenceToggle({
  name,
  label,
  description,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const descriptionId = `${name}-description`;
  return (
    <label className="flex min-h-11 items-start gap-3 rounded-(--radius-md) border border-line p-3">
      <input
        className="mt-1 size-5 shrink-0 accent-brand"
        type="checkbox"
        name={name}
        checked={checked}
        aria-describedby={descriptionId}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="block font-medium">{label}</span>
        <span id={descriptionId} className="block text-sm text-muted-ink">
          {description}
        </span>
      </span>
    </label>
  );
}

export function PresentationPreferencesPanel() {
  const { preferences, setPreference, reset } = usePresentationPreferences();
  const [savedMessage, setSavedMessage] = useState("Preferences are stored on this device only.");

  function update<K extends keyof PresentationPreferences>(
    key: K,
    value: PresentationPreferences[K],
  ) {
    setPreference(key, value);
    setSavedMessage("Preference saved on this device.");
  }

  function resetPreferences() {
    reset();
    setSavedMessage("Preferences reset on this device.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Display and feedback</CardTitle>
        <CardDescription>
          These settings affect presentation only. They never change rules, turns, commands, or the
          state other players see.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <label className="flex min-h-11 flex-col gap-1 rounded-(--radius-md) border border-line p-3">
          <span className="font-medium">Theme</span>
          <span className="text-sm text-muted-ink">Choose a light, dark, or system theme.</span>
          <select
            className="mt-1 min-h-11 rounded-(--radius-md) border border-line bg-surface px-3 text-ink"
            name="theme"
            value={preferences.theme}
            onChange={(event) => update("theme", event.target.value as ThemePreference)}
          >
            <option value="system">Use my system setting</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>

        <PreferenceToggle
          name="contrast"
          label="Use higher contrast"
          description="Strengthen borders, focus, and supporting text."
          checked={preferences.contrast}
          onChange={(value) => update("contrast", value)}
        />
        <PreferenceToggle
          name="reducedMotion"
          label="Reduce animation"
          description="Skip decorative movement and show authoritative final states immediately."
          checked={preferences.reducedMotion}
          onChange={(value) => update("reducedMotion", value)}
        />
        <PreferenceToggle
          name="sound"
          label="Play optional sounds"
          description="Sound is off by default and never carries information by itself."
          checked={preferences.sound}
          onChange={(value) => update("sound", value)}
        />
        <PreferenceToggle
          name="haptics"
          label="Use optional haptics"
          description="Haptics are off by default and never replace visible feedback."
          checked={preferences.haptics}
          onChange={(value) => update("haptics", value)}
        />
        <PreferenceToggle
          name="boardLabels"
          label="Always show board stop names"
          description="Keep names visible in the visual board list; names remain available to assistive technology."
          checked={preferences.boardLabels}
          onChange={(value) => update("boardLabels", value)}
        />

        <p className="text-sm text-muted-ink" role="status" aria-live="polite">
          {savedMessage}
        </p>
        <Button variant="secondary" onClick={resetPreferences}>
          Reset presentation preferences
        </Button>
      </CardContent>
    </Card>
  );
}
