import { beforeEach, describe, expect, it, vi } from "vitest";
import { GraphError } from "@patchpilot/graph";

// executeRemediation reads tenant → device → exclusion for a CVE-less (KB) Live
// Response job, in that order; each select resolves the next queued result.
const dbState = vi.hoisted(() => ({ results: [] as unknown[][] }));

vi.mock("@patchpilot/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@patchpilot/db")>();
  const chain = (): unknown => {
    const rows = dbState.results.shift() ?? [];
    const step = { from: () => step, where: () => step, limit: async () => rows };
    return step;
  };
  return { ...actual, db: { select: chain } };
});

vi.mock("@patchpilot/graph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@patchpilot/graph")>();
  return {
    ...actual,
    env: { DEMO_MODE: false, ENTRA_TENANT_ID: "home" },
    assertWritesAllowed: vi.fn(async () => ({ allowed: true })),
    reserveLiveResponseDeviceSlot: vi.fn(async () => ({ allowed: true })),
  };
});

const kbRun = vi.hoisted(() => ({ impl: async (_opts: { onProgress: (t: string) => Promise<void> }) => ({}) }));

vi.mock("./live-response.js", () => ({
  fetchDefenderLastSeen: vi.fn(async () => new Date()),
  runLiveResponseKbRemediation: (opts: { onProgress: (t: string) => Promise<void> }) => kbRun.impl(opts),
  runLiveResponseRemediation: vi.fn(),
  runLiveResponseChocolateyRemediation: vi.fn(),
}));

const { executeRemediation } = await import("./executor.js");

const job = {
  jobId: "00000000-0000-4000-8000-000000000001",
  tenantId: "tenant-1",
  deviceId: "device-1",
  cveId: null,
  kbId: "KB5000001",
  channel: "live-response" as const,
  engineer: "engineer@example.com",
};

beforeEach(() => {
  dbState.results = [
    [{ tenantId: "tenant-1" }],
    [{ id: "device-1", managedDeviceId: "md-1", hostname: "PC-01", defenderMachineId: "m-1", lastSeen: new Date() }],
    [],
  ];
});

describe("executeRemediation — run that throws part-way", () => {
  it("keeps the progress transcript ahead of the error", async () => {
    const reported: string[] = [];
    kbRun.impl = async ({ onProgress }) => {
      await onProgress("Started Live Response session\nUploaded script");
      throw new Error("fetch failed");
    };

    const result = await executeRemediation(job, (t) => {
      reported.push(t);
    });

    expect(reported).toEqual(["Started Live Response session\nUploaded script"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toBe(
      "Started Live Response session\nUploaded script\nDefender Live Response: execution error — fetch failed",
    );
  });

  it("keeps it for a Graph error too", async () => {
    kbRun.impl = async ({ onProgress }) => {
      await onProgress("Started Live Response session\n");
      throw new GraphError(429, "Too many requests");
    };

    const result = await executeRemediation(job);

    expect(result.output).toBe(
      "Started Live Response session\nDefender Live Response: Too many requests (HTTP 429).",
    );
  });

  it("is just the error when nothing was reported", async () => {
    kbRun.impl = async () => {
      throw new Error("fetch failed");
    };

    const result = await executeRemediation(job);

    expect(result.output).toBe("Defender Live Response: execution error — fetch failed");
  });
});
