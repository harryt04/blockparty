import type { NextConfig } from "next";

/**
 * Security headers. See SEC-003.
 *
 * CSP starts deny-by-default. `unsafe-inline` for styles is the documented
 * framework exception: Next.js injects inline style tags for streamed CSS.
 * `unsafe-eval` is allowed in development only, for React Refresh.
 *
 * TODO(SEC-003): replace `unsafe-inline` on script-src with a nonce once the
 * app has interactive routes, and add the consented PostHog endpoints to
 * connect-src behind the ANA-001 consent gate.
 */
const isDevelopment = process.env.NODE_ENV === "development";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self'${isDevelopment ? " 'unsafe-eval' 'unsafe-inline'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  // Same-origin API and SSE only. No third-party endpoint without consent.
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // HSTS is also set at the proxy. Duplicating it here is harmless and keeps
  // the header present if the app is exposed directly.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Internal packages ship TypeScript source; Next transpiles them.
  transpilePackages: [
    "@blockparty/contracts",
    "@blockparty/game-content",
    "@blockparty/game-engine",
  ],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
