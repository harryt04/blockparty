import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PresentationPreferencesProvider } from "@/components/settings/presentation-preferences";
import "./globals.css";

export const metadata: Metadata = {
  // TODO(BRAND): Blockparty is provisional and uncleared; Civora is the
  // fallback. The name lives in components/shell/wordmark.tsx so a change
  // re-skins the wordmark and nothing else.
  title: {
    default: "Blockparty",
    template: "%s | Blockparty",
  },
  description:
    "A private, browser-based property board game for two to six players. No accounts. One invite link.",
  applicationName: "Blockparty",
  manifest: "/manifest.webmanifest",
  // Capabilities and invite IDs must not leak through a referrer. SEC-003.
  referrer: "strict-origin-when-cross-origin",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Never suppress browser zoom. DS-060.
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Focus is never obscured by sticky UI. UX-040. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-(--radius-md) focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-ink"
        >
          Skip to main content
        </a>
        <PresentationPreferencesProvider>{children}</PresentationPreferencesProvider>
      </body>
    </html>
  );
}
