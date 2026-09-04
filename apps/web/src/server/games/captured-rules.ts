import "server-only";

/**
 * Load only the immutable content and resolved rules captured by a game.
 * Existing games never consult current deployment defaults. VAR-011/012 and
 * ENG-027.
 */
import { migrateRulesConfiguration } from "@blockparty/contracts";
import { canonicalHashBundle, getBundle } from "@blockparty/game-content";
import { type RuleSet } from "@blockparty/game-engine";
import { isProduction } from "../env";
import type { GameDocument } from "./create-game";

export function capturedRuleSet(game: GameDocument): RuleSet | undefined {
  const bundle = getBundle(game.contentVersion, { production: isProduction });
  if (
    bundle === undefined ||
    game.contentHash !== canonicalHashBundle(bundle) ||
    game.snapshot.contentVersion !== game.contentVersion ||
    game.rulesSchemaVersion !== bundle.rulesSchemaVersion ||
    game.variantSchemaVersion !== bundle.variantSchemaVersion ||
    game.snapshot.stateSchemaVersion !== game.stateSchemaVersion
  ) {
    return undefined;
  }

  try {
    const configuration = migrateRulesConfiguration(game.configuration);
    if (configuration.schemaVersion !== game.variantSchemaVersion) return undefined;
    return { content: bundle, configuration };
  } catch {
    return undefined;
  }
}
