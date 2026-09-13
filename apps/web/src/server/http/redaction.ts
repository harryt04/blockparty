import "server-only";

/**
 * Structured logging boundary. See SEC-004 and SEC-006.
 *
 * Logs are deliberately allowlisted by key rather than trying to recognize
 * every possible secret value. Sensitive fields collapse before serialization,
 * and Error objects contribute only their class.
 */
const SENSITIVE_KEY =
  /(?:authorization|capabilit|cookie|csrf|display.?name|error|invite|message|name|payload|private|pseudonym|raw|secret|seed|state|token|url)/iu;
const MAX_DEPTH = 4;
const MAX_ITEMS = 32;

function safeErrorName(value: Error): string {
  return value.name.replace(/[^A-Za-z0-9_.-]/gu, "").slice(0, 64) || "Error";
}

function redact(
  value: unknown,
  key: string | undefined,
  depth: number,
  seen: Set<object>,
): unknown {
  if (key !== undefined && SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (value instanceof Error) return { errorClass: safeErrorName(value) };
  if (value === null || typeof value !== "object") {
    if (typeof value === "string") {
      if (/https?:\/\//iu.test(value) || /(?:^|\/)join\/[A-Za-z0-9_-]{22,}/u.test(value)) {
        return "[REDACTED]";
      }
      return value.slice(0, 280);
    }
    if (typeof value === "number" && !Number.isFinite(value)) return "[NON_FINITE]";
    return value;
  }
  if (depth >= MAX_DEPTH || seen.has(value)) return "[REDACTED]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ITEMS).map((item) => redact(item, undefined, depth + 1, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value).slice(0, MAX_ITEMS)) {
    result[childKey] = redact(childValue, childKey, depth + 1, seen);
  }
  return result;
}

export function redactLogContext(value: unknown): unknown {
  return redact(value, undefined, 0, new Set());
}

export type SafeLogLevel = "error" | "warn" | "info";

/** Emits only bounded, redacted JSON; never pass a raw request or exception. */
export function safeLog(
  level: SafeLogLevel,
  event: string,
  context: Record<string, unknown> = {},
): void {
  const safeEvent = event.replace(/[^A-Za-z0-9_.-]/gu, "").slice(0, 64) || "event";
  const entry = redactLogContext({ ...context, event: safeEvent });
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
