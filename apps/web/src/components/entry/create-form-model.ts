// Pure request mapping is kept separate from the client component for testing.
import {
  CreateGameRequest,
  SHORT_GAME_CONFIGURATION,
  STANDARD_CONFIGURATION,
  VARIANT_KEYS,
  type RulesConfiguration,
} from "@blockparty/contracts";

export type CreateField = "name" | "seatCount" | "botSeatCount" | "preset" | "acknowledged13Plus";

export type CreateFormResult =
  | { readonly ok: true; readonly request: CreateGameRequest }
  | {
      readonly ok: false;
      readonly errors: Partial<Record<CreateField, string>>;
    };

function textValue(form: FormData, field: string): string {
  const value = form.get(field);
  return typeof value === "string" ? value : "";
}

function integerValue(form: FormData, field: CreateField): number | undefined {
  const value = textValue(form, field);
  if (!/^-?\d+$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function selectedConfiguration(form: FormData): RulesConfiguration | undefined {
  const preset = textValue(form, "preset");
  if (preset !== "standard" && preset !== "short-game") return undefined;

  const base = preset === "standard" ? STANDARD_CONFIGURATION : SHORT_GAME_CONFIGURATION;
  const configuration = Object.fromEntries(VARIANT_KEYS.map((key) => [key, form.has(key)])) as Pick<
    RulesConfiguration,
    (typeof VARIANT_KEYS)[number]
  >;
  const matchesPreset = VARIANT_KEYS.every((key) => configuration[key] === base[key]);

  return {
    ...configuration,
    schemaVersion: base.schemaVersion,
    // A changed preset is a deliberate custom configuration, so the wire
    // layer records that the named preset no longer describes its toggles.
    preset: matchesPreset ? base.preset : "custom",
  };
}

/** Convert the accessible HTML form into the strict API request shape. */
export function createRequestFromForm(form: FormData): CreateFormResult {
  const name = textValue(form, "name").trim();
  const seatCount = integerValue(form, "seatCount");
  const botSeatCount = integerValue(form, "botSeatCount");
  const preset = textValue(form, "preset");
  const configuration = selectedConfiguration(form);
  const errors: Partial<Record<CreateField, string>> = {};

  if (name.length > 48) errors.name = "Keep the game name to 48 characters or fewer.";
  if (seatCount === undefined || seatCount < 2 || seatCount > 6) {
    errors.seatCount = "Choose between 2 and 6 total seats.";
  }
  if (botSeatCount === undefined || botSeatCount < 0 || botSeatCount > 5) {
    errors.botSeatCount = "Choose between 0 and 5 bot seats.";
  } else if (seatCount !== undefined && botSeatCount >= seatCount) {
    errors.botSeatCount = "Leave at least one seat open for a person.";
  }
  if (preset !== "standard" && preset !== "short-game") {
    errors.preset = "Choose a rules preset.";
  }
  if (configuration === undefined) {
    errors.preset = "Choose a rules preset.";
  }
  if (!form.has("acknowledged13Plus")) {
    errors.acknowledged13Plus = "Confirm that all players are aged 13 or over.";
  }

  if (Object.keys(errors).length > 0 || seatCount === undefined || botSeatCount === undefined) {
    return { ok: false, errors };
  }

  const parsed = CreateGameRequest.safeParse({
    ...(name.length > 0 ? { name } : {}),
    seatCount,
    botSeatCount,
    preset: configuration?.preset,
    configuration,
    acknowledged13Plus: true,
  });
  if (!parsed.success) {
    return {
      ok: false,
      errors: { preset: "Review the selected rules before creating the lobby." },
    };
  }
  return { ok: true, request: parsed.data };
}

/** Keep landing-page invite navigation on the opaque admission path only. */
export function invitePathFromInput(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  let pathname = trimmed;
  try {
    pathname = new URL(trimmed, "https://blockparty.invalid").pathname;
    const parsed = new URL(trimmed, "https://blockparty.invalid");
    if (parsed.search || parsed.hash) return undefined;
  } catch {
    return undefined;
  }
  const match = /^\/join\/([A-Za-z0-9_-]{22,128})$/u.exec(pathname);
  return match === null ? undefined : `/join/${match[1]}`;
}
