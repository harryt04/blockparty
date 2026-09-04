import { env } from "@/server/env";

export const dynamic = "force-dynamic";

function serviceWorkerSource(cacheVersion: string): string {
  const cacheName = JSON.stringify(`blockparty-app-shell-${cacheVersion}`);
  return `
const CACHE_NAME = ${cacheName};
const OFFLINE_URL = "/offline";
const SHELL_URLS = [
  "/",
  "/offline",
  "/rules",
  "/settings",
  "/accessibility",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/maskable.svg",
];
const PUBLIC_ASSETS = new Set(SHELL_URLS.slice(5));

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("blockparty-app-shell-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && SHELL_URLS.includes(url.pathname)) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) =>
            cached ?? (url.pathname === OFFLINE_URL ? new Response("Offline", { status: 503 }) : Response.redirect(OFFLINE_URL, 302)),
          ),
        ),
    );
    return;
  }

  const isVersionedNextAsset = url.pathname.startsWith("/_next/static/");
  const isPublicShellAsset = PUBLIC_ASSETS.has(url.pathname);
  if (!isVersionedNextAsset && !isPublicShellAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
`;
}

export function GET(): Response {
  return new Response(serviceWorkerSource(env.PWA_CACHE_VERSION), {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Content-Type": "application/javascript; charset=utf-8",
      "Service-Worker-Allowed": "/",
    },
  });
}
