import { describe, expect, it } from "vitest";
import { remediationSubtitle } from "./remediationSubtitle";

const base = { days: [], succeeded: 0, failed: 0, notActionable: 0, successRate: null, failedLast24h: 0 };

describe("remediationSubtitle", () => {
  it("scales the API's 0–1 success fraction to a percentage", () => {
    expect(
      remediationSubtitle({ ...base, succeeded: 55, failed: 345, successRate: 55 / 400, failedLast24h: 24 }),
    ).toBe("400 runs · 14% success · 24 failed in last 24h");
  });

  it("shows 100% when every run succeeded", () => {
    expect(remediationSubtitle({ ...base, succeeded: 3, successRate: 1 })).toBe(
      "3 runs · 100% success · 0 failed in last 24h",
    );
  });

  it("says so when there are no runs", () => {
    expect(remediationSubtitle(base)).toBe("No remediation runs in this window");
  });

  it("names not-actionable runs without counting them in the rate", () => {
    expect(
      remediationSubtitle({ ...base, succeeded: 3, failed: 1, notActionable: 5, successRate: 0.75, failedLast24h: 1 }),
    ).toBe("4 runs · 75% success · 1 failed in last 24h · 5 not actionable");
  });

  it("still names not-actionable runs when nothing actionable ran", () => {
    expect(remediationSubtitle({ ...base, notActionable: 2 })).toBe(
      "No actionable remediation runs in this window · 2 not actionable",
    );
  });
});
