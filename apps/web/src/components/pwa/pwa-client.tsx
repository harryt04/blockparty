"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  isIosDevice,
  networkStatusMessage,
  PWA_DISMISSAL_KEY,
  shouldShowInstallPrompt,
} from "./pwa-model";

interface BeforeInstallPromptEvent extends Event {
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  prompt: () => Promise<void>;
}

function readDismissal(): boolean {
  try {
    return window.localStorage.getItem(PWA_DISMISSAL_KEY) === "true";
  } catch {
    return false;
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

/** Client-only PWA shell: no game data, capabilities, or API responses enter storage. */
export function PwaClient() {
  const [online, setOnline] = useState(true);
  const [engaged, setEngaged] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | undefined>();
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const updateRequested = useRef(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    setDismissed(readDismissal());
    setInstalled(isStandalone());
    setIos(isIosDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints));

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onEngagement = () => setEngaged(true);
    const onInstallAvailable = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(undefined);
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("pointerdown", onEngagement, { capture: true, once: true });
    window.addEventListener("keydown", onEngagement, { capture: true, once: true });
    window.addEventListener("beforeinstallprompt", onInstallAvailable);
    window.addEventListener("appinstalled", onInstalled);

    let removeControllerChange: (() => void) | undefined;
    let removeRegistrationListeners: (() => void) | undefined;
    if ("serviceWorker" in navigator) {
      const onControllerChange = () => {
        if (updateRequested.current) window.location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
      removeControllerChange = () =>
        navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);

      void navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          const inspectWaiting = () => {
            if (registration.waiting && navigator.serviceWorker.controller) {
              setUpdateAvailable(true);
            }
          };
          const onUpdateFound = () => {
            const worker = registration.installing;
            if (!worker) return;
            worker.addEventListener("statechange", inspectWaiting);
          };
          registration.addEventListener("updatefound", onUpdateFound);
          inspectWaiting();
          removeRegistrationListeners = () =>
            registration.removeEventListener("updatefound", onUpdateFound);
        })
        .catch(() => undefined);
    }

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("pointerdown", onEngagement, { capture: true });
      window.removeEventListener("keydown", onEngagement, { capture: true });
      window.removeEventListener("beforeinstallprompt", onInstallAvailable);
      window.removeEventListener("appinstalled", onInstalled);
      removeControllerChange?.();
      removeRegistrationListeners?.();
    };
  }, []);

  const dismissInstall = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(PWA_DISMISSAL_KEY, "true");
    } catch {
      // Private browsing may deny local storage. The current session still dismisses it.
    }
  };

  const install = async () => {
    if (installEvent) {
      await installEvent.prompt();
      const result = await installEvent.userChoice;
      if (result.outcome === "accepted") setInstalled(true);
      setInstallEvent(undefined);
      return;
    }
    setShowIosInstructions(true);
  };

  const update = () => {
    updateRequested.current = true;
    navigator.serviceWorker?.getRegistration("/").then((registration) => {
      registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
    });
  };

  const message = networkStatusMessage(online);
  return (
    <>
      {message ? (
        <div
          role="status"
          aria-live="polite"
          className="sticky top-0 z-40 border-b-2 border-warning bg-warning/10 px-4 py-2 text-center text-sm font-medium text-ink"
        >
          {message}
        </div>
      ) : null}

      {shouldShowInstallPrompt({
        engaged,
        dismissed,
        installed,
        canPrompt: installEvent !== undefined,
        isIos: ios,
      }) ? (
        <aside
          aria-label="Install Blockparty"
          className="fixed inset-x-4 bottom-4 z-30 mx-auto max-w-lg rounded-(--radius-lg) border-2 border-line bg-surface-raised p-4 shadow-lg"
        >
          <Alert className="border-0 p-0">
            <div>
              <AlertTitle>Install Blockparty</AlertTitle>
              <AlertDescription>
                Save the app shell for quick access. Live games still need a connection.
              </AlertDescription>
            </div>
          </Alert>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" onClick={install}>
              Install app
            </Button>
            <Button variant="ghost" onClick={dismissInstall}>
              Dismiss
            </Button>
          </div>
        </aside>
      ) : null}

      {showIosInstructions ? (
        <aside
          aria-label="iOS installation instructions"
          className="fixed inset-x-4 bottom-4 z-30 mx-auto max-w-lg rounded-(--radius-lg) border-2 border-line bg-surface-raised p-4 shadow-lg"
        >
          <h2 className="font-serif text-lg">Add Blockparty to your Home Screen</h2>
          <p className="mt-2 text-sm text-muted-ink">
            In Safari, tap Share, choose Add to Home Screen, then tap Add. Live games still need a
            connection.
          </p>
          <Button
            className="mt-3"
            variant="secondary"
            onClick={() => setShowIosInstructions(false)}
          >
            Close instructions
          </Button>
        </aside>
      ) : null}

      {updateAvailable ? (
        <aside
          aria-label="App update"
          className="fixed inset-x-4 bottom-4 z-30 mx-auto max-w-lg rounded-(--radius-lg) border-2 border-info bg-surface-raised p-4 shadow-lg"
        >
          <p className="font-medium">A new version of Blockparty is ready.</p>
          <p className="mt-1 text-sm text-muted-ink">Update the app shell when you are ready.</p>
          <Button className="mt-3" variant="primary" onClick={update}>
            Update app
          </Button>
        </aside>
      ) : null}
    </>
  );
}
