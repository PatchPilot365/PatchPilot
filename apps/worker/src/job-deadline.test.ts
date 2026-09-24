import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobDeadline, JobTimeoutError } from "./job-deadline.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("JobDeadline", () => {
  it("aborts its signal once the limit runs out", () => {
    const deadline = new JobDeadline(1_000);
    deadline.start();
    vi.advanceTimersByTime(999);
    expect(deadline.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.signal.reason).toBeInstanceOf(JobTimeoutError);
  });

  it("doesn't count paused time, and restarts the full limit on start()", () => {
    const deadline = new JobDeadline(1_000);
    deadline.start();
    vi.advanceTimersByTime(900);
    deadline.pause(); // queued behind another job for the device
    vi.advanceTimersByTime(60_000);
    expect(deadline.signal.aborted).toBe(false);
    deadline.start(); // this job's turn on the device
    vi.advanceTimersByTime(999);
    expect(deadline.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(deadline.signal.aborted).toBe(true);
  });

  it("expired() rejects only after the grace period following the limit", async () => {
    const deadline = new JobDeadline(1_000);
    deadline.start();
    let rejected: unknown;
    deadline.expired(500).catch((err: unknown) => {
      rejected = err;
    });
    await vi.advanceTimersByTimeAsync(1_499);
    expect(rejected).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(rejected).toBeInstanceOf(JobTimeoutError);
  });

  it("clear() cancels both the limit and the grace backstop", async () => {
    const deadline = new JobDeadline(1_000);
    deadline.start();
    let rejected = false;
    deadline.expired(500).catch(() => {
      rejected = true;
    });
    deadline.clear();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(deadline.signal.aborted).toBe(false);
    expect(rejected).toBe(false);
  });
});
