import { z } from "zod";

/** Consent is intentionally separate from presentation preferences. ANA-001. */
export const ANALYTICS_CONSENT_KEY = "blockparty.analytics-consent.v1";
export const ANALYTICS_ID_KEY = "blockparty.analytics-id.v1";
export const ANALYTICS_CONSENT_VERSION = "1";

export type AnalyticsConsent = "granted" | "denied";

const bucket = z.enum(["2", "3-4", "5-6"]);
const durationBucket = z.enum(["under_1m", "1_5m", "5_15m", "15m_plus"]);
const countBucket = z.enum(["0", "1", "2_3", "4_plus"]);
const viewportBucket = z.enum(["narrow", "standard", "wide"]);
const commonProperties = {
  app_version: z.string().max(64).optional(),
  content_version: z.string().max(64).optional(),
  protocol_version: z.string().max(16).optional(),
  surface: z.literal("web").optional(),
  viewport_bucket: viewportBucket.optional(),
  pwa_display_mode: z.enum(["browser", "standalone"]).optional(),
  locale: z
    .string()
    .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
    .max(10)
    .optional(),
  consent_version: z.literal(ANALYTICS_CONSENT_VERSION).optional(),
  game_player_count_bucket: bucket.optional(),
  duration_bucket: durationBucket.optional(),
  count_bucket: countBucket.optional(),
};

const eventSchemas = {
  consent_presented: z
    .object({ ...commonProperties, consent_version: z.literal(ANALYTICS_CONSENT_VERSION) })
    .strict(),
  consent_updated: z
    .object({ ...commonProperties, choice: z.enum(["granted", "denied", "withdrawn"]) })
    .strict(),
  game_create_started: z
    .object({
      ...commonProperties,
      player_count_bucket: bucket.optional(),
      duration_bucket: durationBucket.optional(),
    })
    .strict(),
  game_created: z
    .object({
      ...commonProperties,
      player_count_bucket: bucket.optional(),
      duration_bucket: durationBucket.optional(),
    })
    .strict(),
  rule_configuration_saved: z
    .object({
      ...commonProperties,
      preset: z.enum(["standard", "short_game", "custom"]),
      enabled_variant_count_bucket: countBucket,
    })
    .strict(),
  invite_join_started: z
    .object({
      ...commonProperties,
      result_category: z.enum(["started"]).optional(),
      duration_bucket: durationBucket.optional(),
    })
    .strict(),
  invite_joined: z
    .object({
      ...commonProperties,
      result_category: z.enum(["success", "unavailable", "rejected", "network", "unknown"]),
      duration_bucket: durationBucket.optional(),
    })
    .strict(),
  game_started: z
    .object({
      ...commonProperties,
      player_count_bucket: bucket.optional(),
      duration_bucket: durationBucket.optional(),
    })
    .strict(),
  game_finished: z
    .object({
      ...commonProperties,
      player_count_bucket: bucket.optional(),
      finish_reason_category: z.enum(["winner", "no_contest", "no_winner", "expired"]),
      duration_bucket: durationBucket.optional(),
    })
    .strict(),
  reconnect_result: z
    .object({
      ...commonProperties,
      result_category: z.enum(["success", "unavailable", "network", "unknown"]),
    })
    .strict(),
  pwa_install_prompted: z
    .object({
      ...commonProperties,
      browser_family: z.enum(["chromium", "firefox", "webkit", "safari", "edge", "other"]),
    })
    .strict(),
  pwa_installed: z
    .object({
      ...commonProperties,
      browser_family: z.enum(["chromium", "firefox", "webkit", "safari", "edge", "other"]),
    })
    .strict(),
  ui_error_shown: z
    .object({
      ...commonProperties,
      error_category: z.enum(["network", "authorization", "validation", "unavailable", "unknown"]),
    })
    .strict(),
} as const;

export type AnalyticsEventName = keyof typeof eventSchemas;
export type AnalyticsEventProperties = Record<string, unknown>;

/**
 * The allowlist is the privacy boundary. Strict schemas reject names, URLs,
 * capabilities, raw errors, game IDs, and every other unapproved property.
 * ANA-002 and SEC-004.
 */
export function validateAnalyticsProperties(
  event: string,
  properties: unknown,
): properties is AnalyticsEventProperties {
  const schema = eventSchemas[event as AnalyticsEventName];
  return schema !== undefined && schema.safeParse(properties).success;
}

export function isAnalyticsEventName(value: string): value is AnalyticsEventName {
  return value in eventSchemas;
}

export function playerCountBucket(count: number): "2" | "3-4" | "5-6" {
  if (count <= 2) return "2";
  if (count <= 4) return "3-4";
  return "5-6";
}

export function enabledVariantCountBucket(count: number): "0" | "1" | "2_3" | "4_plus" {
  if (count === 0) return "0";
  if (count === 1) return "1";
  if (count <= 3) return "2_3";
  return "4_plus";
}

export function readAnalyticsConsent(storage: Storage | undefined): AnalyticsConsent | undefined {
  if (storage === undefined) return undefined;
  let value: string | null;
  try {
    value = storage.getItem(ANALYTICS_CONSENT_KEY);
  } catch {
    return undefined;
  }
  return value === "granted" || value === "denied" ? value : undefined;
}

export function browserFamily(
  userAgent: string,
): "chromium" | "firefox" | "webkit" | "safari" | "edge" | "other" {
  if (/Edg\//.test(userAgent)) return "edge";
  if (/Firefox\//.test(userAgent)) return "firefox";
  if (/Chrome\//.test(userAgent)) return "chromium";
  if (/Safari\//.test(userAgent)) return "safari";
  if (/AppleWebKit\//.test(userAgent)) return "webkit";
  return "other";
}
