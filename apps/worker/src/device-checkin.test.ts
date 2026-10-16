import { describe, expect, it } from "vitest";
import { checkinVerdict, CHECKIN_WINDOW_MS } from "./device-checkin.js";

const NOW = new Date("2026-10-17T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("checkinVerdict", () => {
  it("lets a device seen within the last 24 hours through", () => {
    expect(checkinVerdict("PC1", ago(60_000), "Defender", NOW)).toEqual({ recent: true });
    expect(checkinVerdict("PC1", ago(CHECKIN_WINDOW_MS), "Defender", NOW)).toEqual({ recent: true });
  });

  it("uses a rolling window, not the calendar day", () => {
    // Seen 23:00 the previous day, job at 01:00 — still the same check-in window.
    const job = new Date("2026-10-17T01:00:00Z");
    expect(checkinVerdict("PC1", new Date("2026-10-16T23:00:00Z"), "Defender", job)).toEqual({ recent: true });
  });

  it("skips a device last seen more than 24 hours ago, naming when and from where", () => {
    const v = checkinVerdict("PC1", ago(CHECKIN_WINDOW_MS + 1), "Defender", NOW);
    expect(v.recent).toBe(false);
    if (!v.recent) {
      expect(v.reason).toContain("PC1 last checked in 2026-10-16T11:59:59.999Z (Defender)");
      expect(v.reason).toContain("Skipped without contacting the device");
    }
  });

  it("skips a device with no recorded check-in at all", () => {
    const v = checkinVerdict("PC1", null, "last sync", NOW);
    expect(v.recent).toBe(false);
    if (!v.recent) expect(v.reason).toContain("no recorded check-in (last sync)");
  });
});
