# PWA implementation notes

The manifest and original placeholder icons are served from `public/`. The
service worker is generated at `/sw.js` so the server-side `PWA_CACHE_VERSION`
controls the versioned cache name.

Only the public app shell, manifest/icons, and versioned `/_next/static/` assets
are cached. API, SSE, game, capability, and other dynamic responses are never
cached. An offline navigation falls back to `/offline`, which says that live
play requires reconnection; no queued gameplay action is claimed or stored.

The client coordinator registers updates, offers a non-modal install prompt
after engagement, remembers dismissal in device-local preferences, and shows
concise iOS Safari instructions only after the player requests them.

The icons here are placeholders. Final artwork needs a provenance record before
release. See CONTENT-008 and LEGAL.
