"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createAnalyticsAdapter,
  saveAnalyticsConsent,
  type AnalyticsAdapter,
} from "./analytics-client";
import {
  ANALYTICS_CONSENT_KEY,
  ANALYTICS_CONSENT_VERSION,
  readAnalyticsConsent,
  type AnalyticsConsent,
  type AnalyticsEventName,
  type AnalyticsEventProperties,
} from "./analytics-model";

type ConsentState = AnalyticsConsent | "unset";

interface AnalyticsContextValue {
  readonly consent: ConsentState;
  readonly ready: boolean;
  readonly grant: () => Promise<void>;
  readonly deny: () => void;
  readonly withdraw: () => void;
  readonly track: (event: AnalyticsEventName, properties?: AnalyticsEventProperties) => boolean;
}

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const adapter = useRef<AnalyticsAdapter | undefined>(undefined);
  if (adapter.current === undefined) adapter.current = createAnalyticsAdapter();
  const [consent, setConsent] = useState<ConsentState>("unset");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const storage = safeStorage();
    const saved = readAnalyticsConsent(storage);
    setConsent(saved ?? "unset");
    setReady(true);
    if (saved === "granted") void adapter.current?.enable();
  }, []);

  const track = useCallback(
    (event: AnalyticsEventName, properties?: AnalyticsEventProperties) =>
      adapter.current?.track(event, properties) ?? false,
    [],
  );

  const value = useMemo<AnalyticsContextValue>(
    () => ({
      consent,
      ready,
      grant: async () => {
        await adapter.current?.enable();
        saveAnalyticsConsent(safeStorage(), "granted");
        setConsent("granted");
        adapter.current?.track("consent_presented", {
          consent_version: ANALYTICS_CONSENT_VERSION,
        });
        adapter.current?.track("consent_updated", { choice: "granted" });
      },
      deny: () => {
        adapter.current?.deny();
        setConsent("denied");
      },
      withdraw: () => {
        adapter.current?.withdraw();
        setConsent("unset");
      },
      track,
    }),
    [consent, ready, track],
  );

  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics(): AnalyticsContextValue {
  const value = useContext(AnalyticsContext);
  if (value === null) throw new Error("useAnalytics must be used inside AnalyticsProvider");
  return value;
}

export function AnalyticsConsentBanner() {
  const { consent, ready, grant, deny } = useAnalytics();
  if (!ready || consent !== "unset") return null;

  return (
    <aside
      aria-label="Analytics consent"
      className="mx-4 my-4 max-w-lg rounded-(--radius-lg) border-2 border-line bg-surface-raised p-4 shadow-lg sm:mx-auto"
    >
      <Card className="border-0">
        <CardHeader className="p-0">
          <CardTitle>Help improve Blockparty?</CardTitle>
          <CardDescription>
            Allow optional, pseudonymous product analytics. Game operation never depends on this
            choice. No session replay is enabled.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 p-0 pt-4">
          <Button variant="primary" onClick={() => void grant()}>
            Allow analytics
          </Button>
          <Button variant="secondary" onClick={deny}>
            Keep analytics off
          </Button>
        </CardContent>
      </Card>
    </aside>
  );
}

export function AnalyticsPreferencePanel() {
  const { consent, ready, grant, withdraw } = useAnalytics();
  if (!ready) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Analytics consent</CardTitle>
        <CardDescription>
          Optional product analytics use a random device identifier and approved event categories
          only. Names, invite links, game IDs, capabilities, and game state are not sent. Session
          replay is disabled.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {consent === "granted" ? (
          <>
            <p className="text-sm text-muted-ink">Analytics are on for this device.</p>
            <Button className="mt-3" variant="secondary" onClick={withdraw}>
              Withdraw analytics consent
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-ink">Analytics are off.</p>
            <Button className="mt-3" variant="secondary" onClick={() => void grant()}>
              Allow analytics
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export { ANALYTICS_CONSENT_KEY };
