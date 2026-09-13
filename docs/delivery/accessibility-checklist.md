# Accessibility release checklist

This is the human evidence packet for E6. The automated portion runs with
`pnpm run test:browser`; it audits the public routes, protected lobby/game/
summary surfaces, supported gameplay decision phases, and the 320/375/768/1024
CSS-pixel responsive matrix in Chromium, Firefox, and WebKit.

The browser suite is evidence for PRD-NFR-002, PRD-NFR-005, UX-040, and
TEST-005. It does not replace the human checks below. A blank or `Pending`
cell is a release blocker, and any `Fail` cell must link an issue before the
record can be approved.

## Automated run record

| Run date                | Commit/build | Chromium | Firefox | WebKit  | Serious/critical axe findings | Overflow at 320/375/768/1024 | Issue links |
| ----------------------- | ------------ | -------- | ------- | ------- | ----------------------------- | ---------------------------- | ----------- |
| Pending human execution | Pending      | Pending  | Pending | Pending | Pending                       | Pending                      | —           |

Automated execution on 2026-09-03 passed all 30 checks across Chromium,
Firefox, and WebKit: no serious or critical axe findings and no overflow at
320, 375, 768, or 1024 CSS pixels. The pending row above remains reserved for
the release build record because this working tree has not been committed.

Run the suite from the repository root. If browser binaries are not installed,
run `pnpm exec playwright install chromium firefox webkit` first. Set
`PLAYWRIGHT_BASE_URL` when auditing a deployed HTTPS build; otherwise the
config starts the local web service on port 3100.

## Manual assistive-technology record

Record the app version, date, device/OS, browser version, and issue links for
each session. Use a fresh game with one player at each decision phase where a
live game is needed. Verify that no capability, name, or private game data is
spoken or copied into the record.

| Date / build | Device and OS             | Browser / AT               | Keyboard journey | 200% / 400% zoom           | VoiceOver / NVDA result | iOS Safari / Android Chrome result | Issue links | Reviewer |
| ------------ | ------------------------- | -------------------------- | ---------------- | -------------------------- | ----------------------- | ---------------------------------- | ----------- | -------- |
| Pending      | Desktop / OS pending      | Chrome / NVDA pending      | Pending          | Pending                    | Pending                 | N/A                                | —           | Pending  |
| Pending      | Desktop / OS pending      | Firefox / NVDA pending     | Pending          | Pending                    | Pending                 | N/A                                | —           | Pending  |
| Pending      | Desktop / OS pending      | Safari / VoiceOver pending | Pending          | Pending                    | Pending                 | N/A                                | —           | Pending  |
| Pending      | iPhone / iOS pending      | iOS Safari / VoiceOver     | Pending          | 200% / 400% reflow pending | Pending                 | Pending                            | —           | Pending  |
| Pending      | Android / version pending | Android Chrome / TalkBack  | Pending          | 200% / 400% reflow pending | Pending                 | Pending                            | —           | Pending  |

## Session script

For each session, verify:

1. Skip link, landmarks, headings, logical `Tab`/`Shift+Tab`, `Enter`/`Space`,
   `Home`/`End`, and board-list navigation work without a pointer.
2. Every required decision identifies the actor, available action, current
   cash/debt state, and result; routine movement and presence changes stay
   silent.
3. Dialogs and sheets label themselves, trap focus, restore focus, and do not
   dismiss an irreversible required choice with `Escape`.
4. At 200% and 400% zoom, text and controls reflow without page-level
   horizontal scrolling; at 320 CSS px, the required decision remains usable.
5. VoiceOver/NVDA (and TalkBack on Android) can identify ownership, selection,
   affordability, urgency, connection state, and game completion without
   color, sound, or animation.
6. Reduced motion, forced colors/high contrast, and muted sound/haptics leave
   the final authoritative outcome visible and understandable.
