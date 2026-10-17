import { describe, expect, it } from "vitest";
import { computeCveTrend, isCountedTowardMetrics, summarizeRemediation } from "./dashboard.js";
import type { JobRecord } from "../jobs.js";
import { summarizeTimeToRemediate } from "../posture/time-to-remediate.js";

function hoursAgo(now: Date, hours: number): Date {
  return new Date(now.getTime() - hours * 3_600_000);
}

function daysAgo(now: Date, days: number): Date {
  return hoursAgo(now, days * 24);
}

describe("summarizeTimeToRemediate", () => {
  const NOW = new Date("2026-06-23T00:00:00Z");

  it("returns nulls and zero counts for an empty window", () => {
    const summary = summarizeTimeToRemediate([], 30);
    expect(summary).toEqual({
      windowDays: 30,
      count: 0,
      avgHours: null,
      p90Hours: null,
      bySeverity: {
        critical: { count: 0, avgHours: null, p90Hours: null },
        high: { count: 0, avgHours: null, p90Hours: null },
        medium: { count: 0, avgHours: null, p90Hours: null },
        low: { count: 0, avgHours: null, p90Hours: null },
      },
    });
  });

  it("computes overall avg/p90 and per-severity breakdown for a known set", () => {
    const rows = [
      { severity: "critical" as const, detectedAt: hoursAgo(NOW, 20), remediatedAt: NOW }, // 20h
      { severity: "critical" as const, detectedAt: hoursAgo(NOW, 40), remediatedAt: NOW }, // 40h
      { severity: "high" as const, detectedAt: hoursAgo(NOW, 100), remediatedAt: NOW }, // 100h
      { severity: "low" as const, detectedAt: hoursAgo(NOW, 240), remediatedAt: NOW }, // 240h
    ];

    const summary = summarizeTimeToRemediate(rows, 30);

    expect(summary.count).toBe(4);
    expect(summary.avgHours).toBe((20 + 40 + 100 + 240) / 4);
    // nearest-rank p90 of [20, 40, 100, 240] (sorted) -> index ceil(0.9*4)-1 = 3
    expect(summary.p90Hours).toBe(240);

    expect(summary.bySeverity.critical).toEqual({ count: 2, avgHours: 30, p90Hours: 40 });
    expect(summary.bySeverity.high).toEqual({ count: 1, avgHours: 100, p90Hours: 100 });
    expect(summary.bySeverity.medium).toEqual({ count: 0, avgHours: null, p90Hours: null });
    expect(summary.bySeverity.low).toEqual({ count: 1, avgHours: 240, p90Hours: 240 });
  });

  it("carries the requested windowDays through unchanged", () => {
    const summary = summarizeTimeToRemediate([], 365);
    expect(summary.windowDays).toBe(365);
  });
});

describe("isCountedTowardMetrics", () => {
  it("counts a genuine clear", () => {
    expect(isCountedTowardMetrics("cleared")).toBe(true);
  });

  it("excludes a reclassified row — the winget-matcher-correction false positive", () => {
    expect(isCountedTowardMetrics("reclassified")).toBe(false);
  });
});

describe("computeCveTrend", () => {
  const NOW = new Date("2026-06-23T00:00:00Z");

  it("returns one zeroed bucket per day for empty input, oldest first", () => {
    const trend = computeCveTrend([], [], NOW, 5);
    expect(trend).toHaveLength(5);
    expect(trend.every((d) => d.detected === 0 && d.remediated === 0)).toBe(true);
    expect(trend[0]!.day < trend[4]!.day).toBe(true);
    expect(trend[4]!.day).toBe(NOW.toISOString().slice(0, 10));
  });

  it("counts an open vuln as detected on its own day, and drops it outside the window", () => {
    const inWindow = { detectedAt: daysAgo(NOW, 2) };
    const outOfWindow = { detectedAt: daysAgo(NOW, 40) };
    const trend = computeCveTrend([inWindow, outOfWindow], [], NOW, 30);
    const day = daysAgo(NOW, 2).toISOString().slice(0, 10);
    expect(trend.find((d) => d.day === day)?.detected).toBe(1);
    expect(trend.reduce((n, d) => n + d.detected, 0)).toBe(1);
  });

  it("counts a remediation event on both its detected day and its remediated day", () => {
    const event = { detectedAt: daysAgo(NOW, 10), remediatedAt: daysAgo(NOW, 1) };
    const trend = computeCveTrend([], [event], NOW, 30);
    const detectedDay = daysAgo(NOW, 10).toISOString().slice(0, 10);
    const remediatedDay = daysAgo(NOW, 1).toISOString().slice(0, 10);
    expect(trend.find((d) => d.day === detectedDay)?.detected).toBe(1);
    expect(trend.find((d) => d.day === remediatedDay)?.remediated).toBe(1);
  });

  it("still counts remediatedAt inside the window even when detectedAt predates it", () => {
    const event = { detectedAt: daysAgo(NOW, 90), remediatedAt: daysAgo(NOW, 1) };
    const trend = computeCveTrend([], [event], NOW, 30);
    expect(trend.reduce((n, d) => n + d.detected, 0)).toBe(0);
    expect(trend.reduce((n, d) => n + d.remediated, 0)).toBe(1);
  });
});

describe("summarizeRemediation", () => {
  const NOW = new Date("2026-10-17T12:00:00Z");
  const job = (status: JobRecord["status"], exitCode: number | null, output: string | null, hours = 1) => ({
    status,
    channel: "live-response" as const,
    exitCode,
    output,
    finishedAt: hoursAgo(NOW, hours).toISOString(),
  });

  it("keeps refusals and manual-action verdicts out of the success rate", () => {
    const result = summarizeRemediation(
      [
        job("succeeded", 0, "upgraded"),
        job("failed", -1978335212, "winget exited -1978335212"),
        job("failed", 1, "Defender Live Response: no write performed — no mapped winget package for this software"),
        job("failed", 9, "bundled with another product"),
      ],
      NOW,
    );
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.notActionable).toBe(2);
    expect(result.successRate).toBe(0.5);
    expect(result.failedLast24h).toBe(1);
    const today = result.days.at(-1)!;
    expect(today).toEqual({ day: "2026-10-17", succeeded: 1, failed: 1, notActionable: 2 });
  });

  it("has no rate when every run was not actionable", () => {
    const result = summarizeRemediation([job("failed", 10, "different installer type")], NOW);
    expect(result.successRate).toBeNull();
    expect(result.notActionable).toBe(1);
  });

  it("ignores jobs that haven't finished", () => {
    const result = summarizeRemediation([{ ...job("running", null, null), finishedAt: null }], NOW);
    expect(result.succeeded + result.failed + result.notActionable).toBe(0);
  });
});
