import { describe, expect, it } from "vitest";
import { isNotActionable, needsManualAction, wasNotPerformed, type JobOutcomeFields } from "./job-outcomes.js";

const failedLr = (exitCode: number | null, output = "winget exited 1"): JobOutcomeFields => ({
  status: "failed",
  channel: "live-response",
  exitCode,
  output,
});

describe("needsManualAction", () => {
  it.each([9, 10, 11])("flags a failed Live Response run ending on verdict %i", (code) => {
    expect(needsManualAction(failedLr(code))).toBe(true);
  });

  it("leaves real failures alone", () => {
    expect(needsManualAction(failedLr(1))).toBe(false);
    expect(needsManualAction(failedLr(-1978335212))).toBe(false);
    expect(needsManualAction(failedLr(7))).toBe(false);
  });

  it("only applies to Live Response, where those verdicts come from", () => {
    expect(needsManualAction({ ...failedLr(9), channel: "win32-app" })).toBe(false);
  });

  it("never applies to a succeeded job", () => {
    expect(needsManualAction({ ...failedLr(9), status: "succeeded" })).toBe(false);
  });
});

describe("wasNotPerformed", () => {
  it("recognises the executor's refusal text", () => {
    const job = failedLr(
      1,
      "Defender Live Response: no write performed — only winget-remediable findings run via Live Response today (no mapped winget package for this software)",
    );
    expect(wasNotPerformed(job)).toBe(true);
  });

  it("does not match an attempted run's transcript", () => {
    expect(wasNotPerformed(failedLr(1, "Defender Live Response: execution error — fetch failed"))).toBe(false);
    expect(wasNotPerformed(failedLr(1, null as unknown as string))).toBe(false);
  });
});

describe("isNotActionable", () => {
  it("covers both refusals and manual-action verdicts", () => {
    expect(isNotActionable(failedLr(9))).toBe(true);
    expect(isNotActionable(failedLr(1, "Win32 app: no write performed — device has no Intune managed device id"))).toBe(true);
    expect(isNotActionable(failedLr(-1978335212))).toBe(false);
  });
});
