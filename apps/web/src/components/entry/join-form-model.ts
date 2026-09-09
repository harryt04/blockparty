import { DisplayName, JoinGameRequest } from "@blockparty/contracts";
import { PIECE_OPTIONS } from "./piece-options";

export const JOIN_TOKENS = PIECE_OPTIONS;

export type JoinField = "name" | "token" | "acknowledged13Plus";

export type JoinFormResult =
  | { readonly ok: true; readonly request: JoinGameRequest }
  | { readonly ok: false; readonly errors: Partial<Record<JoinField, string>> };

function fieldError(field: JoinField, fallback: string): string {
  if (field === "name") return fallback;
  if (field === "token") return "Choose a token for your seat.";
  return "Confirm that all players are aged 13 or over.";
}

/**
 * Keeps browser validation aligned with the contract while leaving the server
 * as the authority. The parsed display name is normalized before submission.
 * See PRD-FUN-003, UX-011, and SEC-002.
 */
export function joinRequestFromForm(form: FormData): JoinFormResult {
  const nameResult = DisplayName.safeParse(String(form.get("name") ?? ""));
  const token = JOIN_TOKENS.find((candidate) => candidate.token.pieceId === form.get("token"));
  const acknowledged13Plus = form.get("acknowledged13Plus") === "on";
  const errors: Partial<Record<JoinField, string>> = {};

  if (!nameResult.success) {
    errors.name = fieldError("name", "Choose a display name with 1–24 characters for this game.");
  }
  if (token === undefined) errors.token = fieldError("token", "");
  if (!acknowledged13Plus) errors.acknowledged13Plus = fieldError("acknowledged13Plus", "");
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const request = JoinGameRequest.safeParse({
    name: nameResult.data,
    token: token?.token,
    acknowledged13Plus: true,
  });
  if (!request.success) {
    return {
      ok: false,
      errors: { name: "Check the display name and token, then try again." },
    };
  }
  return { ok: true, request: request.data };
}
