import { describe, expect, it } from "vitest";
import {
  ANALYTICS_CONSENT_KEY,
  ANALYTICS_CONSENT_VERSION,
  enabledVariantCountBucket,
  playerCountBucket,
  validateAnalyticsProperties,
} from "../src/components/analytics/analytics-model";

describe("consent-gated analytics taxonomy", () => {
  it("accepts the approved event properties and rejects private data", () => {
    expect(
      validateAnalyticsProperties("game_created", {
        player_count_bucket: "3-4",
        consent_version: ANALYTICS_CONSENT_VERSION,
      }),
    ).toBe(true);
    expect(
      validateAnalyticsProperties("game_created", {
        player_count_bucket: "3-4",
        gameId: "00000000-0000-4000-8000-000000000001",
      }),
    ).toBe(false);
    expect(
      validateAnalyticsProperties("invite_joined", {
        result_category: "success",
        seatCapability: "secret",
      }),
    ).toBe(false);
    expect(
      validateAnalyticsProperties("ui_error_shown", {
        error_category: "unknown",
        message: "Invite https://example.test/join/secret",
      }),
    ).toBe(false);
  });

  it("keeps consent storage and buckets bounded", () => {
    expect(ANALYTICS_CONSENT_KEY).toBe("blockparty.analytics-consent.v1");
    expect(playerCountBucket(2)).toBe("2");
    expect(playerCountBucket(4)).toBe("3-4");
    expect(playerCountBucket(6)).toBe("5-6");
    expect(enabledVariantCountBucket(0)).toBe("0");
    expect(enabledVariantCountBucket(1)).toBe("1");
    expect(enabledVariantCountBucket(3)).toBe("2_3");
    expect(enabledVariantCountBucket(8)).toBe("4_plus");
  });
});
