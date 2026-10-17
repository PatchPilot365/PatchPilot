import { describe, expect, it } from "vitest";
import { CHECKIN_WINDOW_MS, isCheckinStale } from "./checkin.js";

const NOW = new Date("2026-10-17T12:00:00Z");

describe("isCheckinStale", () => {
  it("is fresh up to and including the 24-hour mark", () => {
    expect(isCheckinStale(new Date(NOW.getTime() - 60_000), NOW)).toBe(false);
    expect(isCheckinStale(new Date(NOW.getTime() - CHECKIN_WINDOW_MS), NOW)).toBe(false);
  });

  it("is stale past 24 hours, or with no check-in at all", () => {
    expect(isCheckinStale(new Date(NOW.getTime() - CHECKIN_WINDOW_MS - 1), NOW)).toBe(true);
    expect(isCheckinStale(null, NOW)).toBe(true);
  });

  it("accepts the ISO string pre-flight carries", () => {
    expect(isCheckinStale("2026-10-15T12:00:00Z", NOW)).toBe(true);
    expect(isCheckinStale("2026-10-17T11:00:00Z", NOW)).toBe(false);
  });
});
