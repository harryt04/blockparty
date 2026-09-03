/**
 * @blockparty/game-content
 *
 * Immutable, versioned, independently authored content. Exports validated
 * bundles only. Depends on data and validation helpers alone: no
 * infrastructure, no third-party content, no application runtime. See ENG-002.
 */
export * from "./types";
export * from "./validate";
export { PLACEHOLDER_BUNDLE } from "./bundles/placeholder";

import { PLACEHOLDER_BUNDLE } from "./bundles/placeholder";
import type { ContentBundle } from "./types";

/** Every bundle a deployment can read, keyed by contentVersion. ENG-027. */
export const BUNDLES: Readonly<Record<string, ContentBundle>> = {
  [PLACEHOLDER_BUNDLE.contentVersion]: PLACEHOLDER_BUNDLE,
};

/**
 * The bundle a NEW game selects. A resumed game loads its captured version
 * from BUNDLES instead, never this default. See ENG-027 and VAR-011.
 */
export const DEFAULT_CONTENT_VERSION = PLACEHOLDER_BUNDLE.contentVersion;

export function getBundle(contentVersion: string): ContentBundle | undefined {
  return BUNDLES[contentVersion];
}
