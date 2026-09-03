# PWA scaffolding notes

The manifest and the icons exist. The service worker deliberately does NOT.

`PRD-FUN-017` forbids claiming offline play until queued offline behaviour is
implemented authoritatively, and `UX-005` says live gameplay always needs a
network connection. Shipping a cache-first worker now would make the app claim
something it cannot do.

Remaining PWA work, as its own ticket:

- An offline APP SHELL only. Never cached game state.
- A clear offline and reconnecting state driven by the sync client.
- A dismissible, non-modal install prompt after meaningful engagement, with the
  dismissal remembered. Concise manual steps on iOS, shown only on request.
- `PWA_CACHE_VERSION` wired to the cache name so a deploy invalidates it.

The icons here are placeholders. Final artwork needs a provenance record before
release. See CONTENT-008 and LEGAL.
