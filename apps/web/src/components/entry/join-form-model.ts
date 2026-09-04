import { DisplayName, JoinGameRequest, type SeatToken } from "@blockparty/contracts";

export const JOIN_TOKENS = [
  { token: { colorIndex: 1, shape: "barricade", pattern: "solid" }, label: "Barricade" },
  { token: { colorIndex: 2, shape: "cooler", pattern: "stripe" }, label: "Cooler" },
  { token: { colorIndex: 3, shape: "boombox", pattern: "dot" }, label: "Boombox" },
  { token: { colorIndex: 4, shape: "hydrant", pattern: "cross" }, label: "Hydrant" },
  { token: { colorIndex: 5, shape: "flyer", pattern: "chevron" }, label: "Flyer" },
  { token: { colorIndex: 6, shape: "stoop", pattern: "grid" }, label: "Stoop" },
] satisfies readonly { token: SeatToken; label: string }[];

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
  const token = JOIN_TOKENS.find((candidate) => candidate.token.shape === form.get("token"));
  const acknowledged13Plus = form.get("acknowledged13Plus") === "on";
  const errors: Partial<Record<JoinField, string>> = {};

  if (!nameResult.success) {
    errors.name = fieldError("name", "Choose a pseudonym with 1–24 characters for this game.");
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
      errors: { name: "Check the pseudonym and token, then try again." },
    };
  }
  return { ok: true, request: request.data };
}
