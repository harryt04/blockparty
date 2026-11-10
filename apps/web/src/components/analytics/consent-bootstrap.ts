import { PORTFOLIO_EMBED_QUERY, PORTFOLIO_EMBED_VALUE } from "@/components/embed/embed-model";
import { ANALYTICS_CONSENT_KEY } from "./analytics-model";

/**
 * The consent notice is rendered in the server HTML so it is present in the
 * first paint. Rendering it only after hydration pushed the whole page down
 * (Cumulative Layout Shift) and made the notice the Largest Contentful Paint
 * element. This attribute lets a tiny pre-hydration script hide the notice for
 * visitors who need no prompt: those who already chose, and the portfolio
 * preview, which never shows analytics UI. ANA-001 is unchanged: the saved
 * choice is still only read from local storage and never leaves the browser.
 *
 * `AnalyticsProvider` removes the attribute after hydration so React alone
 * decides afterward, for example when consent is later withdrawn.
 */
export const CONSENT_RESOLVED_ATTRIBUTE = "data-consent-resolved";

/**
 * Inline script text. It must stay dependency-free and fail open: any error
 * leaves the notice visible, which is the safe default. It runs under the
 * documented `script-src 'unsafe-inline'` framework exception (SEC-003); the
 * nonce migration tracked in `next.config.ts` must cover this script too.
 */
export const CONSENT_BOOTSTRAP_SCRIPT = `(function(){var d=document.documentElement;try{if(new URLSearchParams(location.search).get(${JSON.stringify(
  PORTFOLIO_EMBED_QUERY,
)})===${JSON.stringify(PORTFOLIO_EMBED_VALUE)}){d.setAttribute(${JSON.stringify(
  CONSENT_RESOLVED_ATTRIBUTE,
)},"");return}}catch(e){}try{var c=localStorage.getItem(${JSON.stringify(
  ANALYTICS_CONSENT_KEY,
)});if(c==="granted"||c==="denied")d.setAttribute(${JSON.stringify(
  CONSENT_RESOLVED_ATTRIBUTE,
)},"")}catch(e){}})();`;
