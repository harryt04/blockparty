// Pure request mapping is kept separate from the client component for testing.
import {
  CreateGameRequest,
  DisplayName,
  SHORT_GAME_CONFIGURATION,
  STANDARD_CONFIGURATION,
  VARIANT_KEYS,
  type RulesConfiguration,
} from "@blockparty/contracts";
import { PIECE_OPTIONS } from "./piece-options";

export const CREATE_PIECES = PIECE_OPTIONS;

export type CreateField =
  | "name"
  | "hostName"
  | "hostToken"
  | "humanSeatCount"
  | "botSeatCount"
  | "preset"
  | "acknowledged13Plus";

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
  const hostName = DisplayName.safeParse(textValue(form, "hostName"));
  const hostToken = CREATE_PIECES.find(
    (candidate) => candidate.token.pieceId === form.get("hostToken"),
  );
  const humanSeatCount = integerValue(form, "humanSeatCount");
  const botSeatCount = integerValue(form, "botSeatCount");
  const preset = textValue(form, "preset");
  const configuration = selectedConfiguration(form);
  const errors: Partial<Record<CreateField, string>> = {};

  if (name.length > 48) errors.name = "Keep the game name to 48 characters or fewer.";
  if (!hostName.success) {
    errors.hostName = "Choose a pseudonym with 1–24 characters for this game.";
  }
  if (hostToken === undefined) {
    errors.hostToken = "Choose a piece for your seat.";
  }
  if (humanSeatCount === undefined || humanSeatCount < 1 || humanSeatCount > 6) {
    errors.humanSeatCount = "Choose between 1 and 6 human players.";
  }
  if (botSeatCount === undefined || botSeatCount < 0 || botSeatCount > 5) {
    errors.botSeatCount = "Choose between 0 and 5 bot seats.";
  } else if (
    humanSeatCount !== undefined &&
    (humanSeatCount + botSeatCount < 2 || humanSeatCount + botSeatCount > 6)
  ) {
    errors.botSeatCount = "Choose between 2 and 6 total players.";
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

  if (
    Object.keys(errors).length > 0 ||
    humanSeatCount === undefined ||
    botSeatCount === undefined ||
    !hostName.success ||
    hostToken === undefined
  ) {
    return { ok: false, errors };
  }

  const parsed = CreateGameRequest.safeParse({
    ...(name.length > 0 ? { name } : {}),
    humanSeatCount,
    botSeatCount,
    hostName: hostName.data,
    hostToken: hostToken.token,
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
