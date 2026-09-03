/**
 * @blockparty/game-content
 *
 * Immutable, versioned, independently authored content. Exports validated
 * bundles only. Depends on data and validation helpers alone: no
 * infrastructure, no third-party content, no application runtime. See ENG-002.
 */
export * from "./types";
export * from "./canonical";
export * from "./validate";
export { PLACEHOLDER_BUNDLE } from "./bundles/placeholder";

import { PLACEHOLDER_BUNDLE } from "./bundles/placeholder";
import type { ContentBundle } from "./types";
import { validateBundle } from "./validate";

export type ContentBundleRegistry = Readonly<Record<string, ContentBundle>>;

function freezeBundle(bundle: ContentBundle): ContentBundle {
  const seen = new Set<object>();
  const freeze = (value: unknown): void => {
    if (typeof value !== "object" || value === null || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) freeze(item);
    } else {
      for (const key of Object.keys(value)) {
        freeze((value as Record<string, unknown>)[key]);
      }
    }
    Object.freeze(value);
  };
  freeze(bundle);
  return bundle;
}

/**
 * Build an immutable version registry. Keeping the version as the lookup key
 * means a resumed game can request its captured bundle instead of inheriting
 * the deployment default. ENG-027.
 */
export function createBundleRegistry(bundles: readonly ContentBundle[]): ContentBundleRegistry {
  const registry = Object.create(null) as Record<string, ContentBundle>;
  for (const bundle of bundles) {
    if (registry[bundle.contentVersion] !== undefined) {
      throw new Error(`Duplicate content version: ${bundle.contentVersion}`);
    }
    registry[bundle.contentVersion] = freezeBundle(bundle);
  }
  return Object.freeze(registry);
}

/** Every bundle a deployment can read, keyed by contentVersion. ENG-027. */
export const BUNDLES = createBundleRegistry([PLACEHOLDER_BUNDLE]);

/**
 * The bundle a NEW game selects. A resumed game loads its captured version
 * from BUNDLES instead, never this default. See ENG-027 and VAR-011.
 */
export const DEFAULT_CONTENT_VERSION = PLACEHOLDER_BUNDLE.contentVersion;

export function getBundle(
  contentVersion: string,
  options: { readonly production?: boolean } = {},
  registry: ContentBundleRegistry = BUNDLES,
): ContentBundle | undefined {
  const bundle = registry[contentVersion];
  if (bundle === undefined) return undefined;
  if (options.production && !validateBundle(bundle, { production: true }).valid) return undefined;
  return bundle;
}
