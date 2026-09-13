import { describe, expect, it } from "vitest";
import {
  isPortfolioEmbedParam,
  PORTFOLIO_EMBED_QUERY,
  PORTFOLIO_EMBED_VALUE,
} from "../src/components/embed/embed-model";

describe("portfolio embed contract", () => {
  it("recognizes only the exact portfolio parameter", () => {
    expect(PORTFOLIO_EMBED_QUERY).toBe("embed");
    expect(PORTFOLIO_EMBED_VALUE).toBe("portfolio");
    expect(isPortfolioEmbedParam("portfolio")).toBe(true);
    expect(isPortfolioEmbedParam(["portfolio"])).toBe(false);
    expect(isPortfolioEmbedParam("other")).toBe(false);
    expect(isPortfolioEmbedParam(undefined)).toBe(false);
  });
});
