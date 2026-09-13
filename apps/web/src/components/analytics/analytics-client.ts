"use client";

import type posthogType from "posthog-js";
import {
  ANALYTICS_CONSENT_KEY,
  ANALYTICS_ID_KEY,
  ANALYTICS_CONSENT_VERSION,
  isAnalyticsEventName,
  validateAnalyticsProperties,
  type AnalyticsConsent,
  type AnalyticsEventName,
  type AnalyticsEventProperties,
} from "./analytics-model";

type PostHog = typeof posthogType;

export interface AnalyticsAdapter {
  readonly enabled: boolean;
  enable(): Promise<boolean>;
  deny(): void;
  withdraw(): void;
  track(event: AnalyticsEventName, properties?: AnalyticsEventProperties): boolean;
}

function randomAnalyticsId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function analyticsId(storage: Storage): string {
  let existing: string | null = null;
  try {
    existing = storage.getItem(ANALYTICS_ID_KEY);
  } catch {
    // Storage can be readable only intermittently in private browsing modes.
  }
  if (existing !== null && /^[0-9a-f-]{32,36}$/i.test(existing)) return existing;
  const created = randomAnalyticsId();
  try {
    storage.setItem(ANALYTICS_ID_KEY, created);
  } catch {
    // A transient storage failure still permits a consented in-memory ID.
  }
  return created;
}

function remove(storage: Storage | undefined, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Consent remains enforced in memory for this visit.
  }
}

function set(storage: Storage | undefined, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Consent remains enforced in memory for this visit.
  }
}

function storageOrUndefined(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * A deliberately thin PostHog capture wrapper. The capture endpoint is called
 * only after consent; page capture, autocapture, and replay do not exist here.
 * ANA-001, ANA-002, and SEC-004.
 */
export function createAnalyticsAdapter({
  apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY,
  apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST,
  storage,
}: {
  apiKey?: string;
  apiHost?: string;
  storage?: Storage;
} = {}): AnalyticsAdapter {
  let active = false;
  let distinctId: string | undefined;
  let posthog: PostHog | undefined;
  let captureUrl: string | undefined;

  return {
    get enabled() {
      return active;
    },
    async enable() {
      if (active) return true;
      const consentStorage = storage ?? storageOrUndefined();
      if (
        apiKey === undefined ||
        apiKey.length === 0 ||
        apiHost === undefined ||
        consentStorage === undefined
      ) {
        return false;
      }
      try {
        captureUrl = new URL("/capture/", apiHost).toString();
      } catch {
        return false;
      }
      const id = analyticsId(consentStorage);
      // Load the optional SDK only after consent. Its lifecycle is kept in
      // memory; the allowlisted capture request below is the only transport.
      try {
        const imported = await import("posthog-js");
        const instance = imported.default;
        instance.init(apiKey, {
          api_host: apiHost,
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          disable_session_recording: true,
          disable_external_dependency_loading: true,
          advanced_disable_decide: true,
          advanced_disable_feature_flags: true,
          disable_web_experiments: true,
          disable_surveys: true,
          request_batching: false,
          persistence: "memory",
        });
        instance.opt_in_capturing();
        posthog = instance;
      } catch {
        // The explicit capture transport remains optional and fail-closed.
      }
      distinctId = id;
      active = true;
      return true;
    },
    deny() {
      active = false;
      const consentStorage = storage ?? storageOrUndefined();
      set(consentStorage, ANALYTICS_CONSENT_KEY, "denied");
      remove(consentStorage, ANALYTICS_ID_KEY);
    },
    withdraw() {
      posthog?.opt_out_capturing();
      posthog?.reset();
      posthog = undefined;
      active = false;
      distinctId = undefined;
      const consentStorage = storage ?? storageOrUndefined();
      remove(consentStorage, ANALYTICS_CONSENT_KEY);
      remove(consentStorage, ANALYTICS_ID_KEY);
    },
    track(event, properties = {}) {
      if (
        !active ||
        distinctId === undefined ||
        captureUrl === undefined ||
        !isAnalyticsEventName(event)
      )
        return false;
      const safeProperties = {
        ...properties,
        consent_version: ANALYTICS_CONSENT_VERSION,
      };
      if (!validateAnalyticsProperties(event, safeProperties)) return false;
      void fetch(captureUrl, {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          event,
          properties: { ...safeProperties, distinct_id: distinctId },
        }),
      }).catch(() => undefined);
      return true;
    },
  };
}

export function saveAnalyticsConsent(
  storage: Storage | undefined,
  consent: AnalyticsConsent,
): void {
  set(storage, ANALYTICS_CONSENT_KEY, consent);
}
