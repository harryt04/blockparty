import { afterEach, beforeEach, vi } from "vitest";

// Route fixtures use September 2026 game lifetimes. Keep their clock stable as
// the real calendar advances, without faking the timers used by streams and IO.
beforeEach(() => {
  vi.setSystemTime(new Date("2026-09-03T15:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});
