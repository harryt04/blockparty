export const PORTFOLIO_EMBED_QUERY = "embed";
export const PORTFOLIO_EMBED_VALUE = "portfolio";

export function isPortfolioEmbedParam(value: string | string[] | undefined): boolean {
  return value === PORTFOLIO_EMBED_VALUE;
}

export function isPortfolioEmbedLocation(): boolean {
  if (typeof window === "undefined") return false;
  return (
    new URLSearchParams(window.location.search).get(PORTFOLIO_EMBED_QUERY) === PORTFOLIO_EMBED_VALUE
  );
}
