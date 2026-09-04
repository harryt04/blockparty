import "server-only";

/**
 * Parsed server configuration. See OPS-003 and ENG-004.
 *
 * `MONGODB_URI` is optional on purpose: the app must boot, build, and render
 * every page with no database configured. `/api/health/ready` reports
 * `degraded` in that case instead of throwing.
 *
 * No secret is exposed through a NEXT_PUBLIC_ variable.
 */
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),

  // Transactions require a replica set. A standalone URI cannot serve the
  // command path. See ENG-015.
  MONGODB_URI: z.string().min(1).optional(),
  MONGODB_DB: z.string().min(1).default("blockparty"),

  COOKIE_SECRET: z.string().min(32).optional(),

  /** Comma-separated first-party origin allowlist. Never "*". SEC-003. */
  ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),

  PROTOCOL_VERSION: z.coerce.number().int().default(1),
  APP_VERSION: z.string().default("0.0.0"),
  PWA_CACHE_VERSION: z.string().default("1"),

  /** Unset disables the internal cleanup route entirely. */
  INTERNAL_CLEANUP_SECRET: z.string().min(16).optional(),

  RATE_LIMIT_CREATE_PER_MINUTE: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_JOIN_PER_MINUTE: z.coerce.number().int().min(1).default(30),
  RATE_LIMIT_COMMANDS_PER_MINUTE: z.coerce.number().int().min(1).default(120),
  RATE_LIMIT_SYNC_PER_MINUTE: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_SSE_CONNECTIONS: z.coerce.number().int().min(1).default(8),
  RATE_LIMIT_INTERNAL_PER_MINUTE: z.coerce.number().int().min(1).default(10),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // Names only. A value could be a secret, so it never reaches a log.
  const fields = Object.keys(parsed.error.flatten().fieldErrors).join(", ");
  throw new Error(`Invalid server configuration for: ${fields}`);
}

export const env = parsed.data;

export const allowedOrigins: readonly string[] = env.ALLOWED_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/** True when a database is configured. False remains valid for build/health checks. */
export const isDatabaseConfigured = env.MONGODB_URI !== undefined;

export const isProduction = env.NODE_ENV === "production";
