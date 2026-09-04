import { describe, expect, it } from "vitest";
import { joinRequestFromForm, JOIN_TOKENS } from "../src/components/entry/join-form-model";

function form(overrides: Record<string, string> = {}) {
  const value = new FormData();
  value.set("name", "  Ada   Lovelace  ");
  value.set("token", JOIN_TOKENS[0]!.token.shape);
  value.set("acknowledged13Plus", "on");
  for (const [key, entry] of Object.entries(overrides)) value.set(key, entry);
  return value;
}

describe("join form request mapping", () => {
  it("normalizes a pseudonym and submits the canonical token shape", () => {
    expect(joinRequestFromForm(form())).toEqual({
      ok: true,
      request: {
        name: "Ada Lovelace",
        token: JOIN_TOKENS[0]!.token,
        acknowledged13Plus: true,
      },
    });
  });

  it("reports accessible errors without creating a request", () => {
    const invalid = form({ name: "\u202Ename" });
    invalid.delete("token");
    invalid.delete("acknowledged13Plus");

    expect(joinRequestFromForm(invalid)).toEqual({
      ok: false,
      errors: {
        name: "Choose a pseudonym with 1–24 characters for this game.",
        token: "Choose a token for your seat.",
        acknowledged13Plus: "Confirm that all players are aged 13 or over.",
      },
    });
  });

  it("keeps the request free of invite and capability fields", () => {
    const result = joinRequestFromForm(form());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request).not.toHaveProperty("inviteId");
      expect(result.request).not.toHaveProperty("seatCapability");
      expect(JSON.stringify(result.request)).not.toContain("cookie");
    }
  });
});
