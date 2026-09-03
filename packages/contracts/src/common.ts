/**
 * Shared primitives for every wire schema.
 *
 * Vocabulary here is the canonical wire layer from docs/product/glossary.md.
 * A display name ("Address", "Block", "Noise Complaint") in this package is a
 * defect: the UI translates at the presentation boundary, not the server.
 */
import { z } from "zod";

/** Opaque UUID string. Domain IDs are UUIDs, never MongoDB ObjectIds. */
export const Uuid = z.uuid();
export type Uuid = z.infer<typeof Uuid>;

export const GameId = Uuid;
export type GameId = z.infer<typeof GameId>;

export const SeatId = z.string().min(1).max(64);
export type SeatId = z.infer<typeof SeatId>;

export const CommandId = Uuid;
export type CommandId = z.infer<typeof CommandId>;

export const RequestId = Uuid;
export type RequestId = z.infer<typeof RequestId>;

/**
 * Invite IDs carry at least 128 bits of CSPRNG entropy, URL-safe encoded.
 * They are not UUIDs and never derive from a game ID. See SEC-002.
 */
export const InviteId = z
  .string()
  .min(22)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, "Invite IDs are URL-safe base64url");
export type InviteId = z.infer<typeof InviteId>;

/**
 * Money is integer minor units. Never a float. Rounding is data-defined.
 * See the cross-cutting invariants in AGENTS.md.
 */
export const Money = z.int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
export type Money = z.infer<typeof Money>;

/** Non-negative money, for prices and balances that cannot go below zero. */
export const NonNegativeMoney = z.int().min(0).max(Number.MAX_SAFE_INTEGER);
export type NonNegativeMoney = z.infer<typeof NonNegativeMoney>;

/** Increments once per accepted command transaction. See PROTO-002. */
export const AggregateVersion = z.int().min(0);
export type AggregateVersion = z.infer<typeof AggregateVersion>;

/** Strictly increasing journal-event number, per game. See PROTO-002. */
export const Sequence = z.int().min(0);
export type Sequence = z.infer<typeof Sequence>;

export const PROTOCOL_VERSION = 1 as const;
export const ProtocolVersion = z.literal(PROTOCOL_VERSION);
export type ProtocolVersion = z.infer<typeof ProtocolVersion>;

/** Informational only. A client never treats server time as authority. */
export const ServerTime = z.iso.datetime();
export type ServerTime = z.infer<typeof ServerTime>;

export const SemanticVersion = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "Expected a semantic version");
export type SemanticVersion = z.infer<typeof SemanticVersion>;

/** The immutable versions a started game captures. See ENG-027 and VAR-011. */
export const CapturedVersions = z
  .object({
    contentVersion: SemanticVersion,
    rulesSchemaVersion: SemanticVersion,
    variantSchemaVersion: SemanticVersion,
    stateSchemaVersion: SemanticVersion,
    engineVersion: SemanticVersion,
  })
  .strict();
export type CapturedVersions = z.infer<typeof CapturedVersions>;

/**
 * True when the string holds a C0/C1 control character, a bidirectional
 * override or isolate, or a zero-width joiner-style formatting character.
 * These are scanned by code point so this source file stays plain ASCII.
 */
function hasUnsafeCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    const isC0 = codePoint <= 0x1f;
    const isC1 = codePoint >= 0x7f && codePoint <= 0x9f;
    const isBidi =
      (codePoint >= 0x202a && codePoint <= 0x202e) || (codePoint >= 0x2066 && codePoint <= 0x2069);
    if (isC0 || isC1 || isBidi) return true;
  }
  return false;
}

/** Reserved pseudonyms are configuration, not a new wire field. PRD-FUN-003. */
export const DEFAULT_DISPLAY_NAME_DENYLIST = [
  "admin",
  "administrator",
  "moderator",
  "system",
  "support",
] as const;

function graphemeCount(value: string): number {
  return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value))
    .length;
}

/**
 * Normalizes a game-scoped pseudonym. Never a real name, email, or account.
 * The denylist is injectable so deployments can add local reserved names
 * without changing the wire shape. See PRD-FUN-003.
 */
export function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

export function createDisplayNameSchema(
  denylist: readonly string[] = DEFAULT_DISPLAY_NAME_DENYLIST,
) {
  const normalizedDenylist = new Set(
    denylist.map((entry) => normalizeDisplayName(entry).toLowerCase()),
  );
  return z
    .string()
    .refine((value) => !hasUnsafeCharacter(value), {
      message: "Control and bidirectional override characters are not allowed",
    })
    .transform(normalizeDisplayName)
    .refine((value) => graphemeCount(value) >= 1 && graphemeCount(value) <= 24, {
      message: "Names must contain 1-24 Unicode grapheme clusters",
    })
    .refine((value) => !normalizedDenylist.has(value.toLowerCase()), {
      message: "That pseudonym is reserved",
    });
}

export const DisplayName = createDisplayNameSchema();
export type DisplayName = z.infer<typeof DisplayName>;

export const SeatKind = z.enum(["human", "bot", "open"]);
export type SeatKind = z.infer<typeof SeatKind>;

export const SeatStatus = z.enum(["active", "eliminated", "replaced", "disconnected"]);
export type SeatStatus = z.infer<typeof SeatStatus>;

export const GameStatus = z.enum(["LOBBY", "ACTIVE", "COMPLETED", "NO_CONTEST", "EXPIRED"]);
export type GameStatus = z.infer<typeof GameStatus>;

/** The phases in the ENG-021 state machine. */
export const Phase = z.enum([
  "Lobby",
  "TurnStart",
  "AwaitRoll",
  "ResolveMove",
  "AwaitPurchase",
  "AwaitAuction",
  "ImprovementAuction",
  "AwaitDebt",
  "AwaitChoice",
  "TurnEnd",
  "Finished",
]);
export type Phase = z.infer<typeof Phase>;

/** Total seats in one game. See PRD-FUN-002. */
export const SeatCount = z.int().min(2).max(6);
export type SeatCount = z.infer<typeof SeatCount>;
