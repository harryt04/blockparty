import { describe, expect, it } from "vitest";
import { createRequestFromForm } from "../src/components/entry/create-form-model";

function formWithoutPiece(): FormData {
  const form = new FormData();
  form.set("name", "QA Bot Game");
  form.set("hostName", "Human Tester");
  form.set("humanSeatCount", "1");
  form.set("botSeatCount", "1");
  form.set("preset", "standard");
  return form;
}

describe("create form defaults", () => {
  it("uses the first piece when the untouched picker submits no radio value", () => {
    const result = createRequestFromForm(formWithoutPiece());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.hostToken).toEqual({
        colorIndex: 1,
        pieceId: "piece-lantern",
        pattern: "solid",
      });
    }
  });
});
