import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * These exist because generateWuaRemediationCom (packages/shared/src/scripts.ts)
 * shipped without ever printing the `PatchPilot-Exit: <n>` sentinel this file's
 * parseVerdict() requires — every Live Response KB job reported "failed"
 * regardless of the real outcome, with nothing in the suite that would have
 * caught it. `parseVerdict` itself is private, so its contract (last-match-wins,
 * no-sentinel -> null -> failure, the sentinel is NOT Defender's own exit_code)
 * is exercised end-to-end through runLiveResponseKbRemediation's real exitCode,
 * the same way a caller actually observes it.
 *
 * Redis (the per-device lock) and @patchpilot/graph's HTTP-calling functions are
 * mocked; @patchpilot/graph's pure exports (GraphError, sha256Hex) and all of
 * @patchpilot/shared stay real.
 */

const redisState = vi.hoisted(() => ({
  exists: vi.fn(async () => 0),
  set: vi.fn(async () => "OK"),
  eval: vi.fn(async () => 1),
}));

vi.mock("./queue.js", () => ({
  connection: redisState,
}));

const graphMocks = vi.hoisted(() => ({
  graphGet: vi.fn(),
  graphWrite: vi.fn(),
  graphUpload: vi.fn(),
}));

vi.mock("@patchpilot/graph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@patchpilot/graph")>();
  return {
    ...actual,
    graphGet: graphMocks.graphGet,
    graphWrite: graphMocks.graphWrite,
    graphUpload: graphMocks.graphUpload,
  };
});

const { runLiveResponseKbRemediation } = await import("./live-response.js");

const baseInput = {
  engineer: "engineer@contoso.com",
  homeTenantId: "home-tenant-id",
  tenantId: "tenant-1",
  machineId: "machine-1",
  kbId: "5040442",
};

/** Wires the full dispatch path (library-script-not-present -> upload -> run
 *  -> action succeeded on the first poll -> fetch the result blob) so each
 *  test only has to supply the script's own stdout. */
function primeSuccessfulDispatch(scriptOutput: string, defenderExitCode = 0): void {
  graphMocks.graphGet
    .mockResolvedValueOnce({ ok: true, status: 200, data: { value: [] } }) // /libraryfiles: not present yet
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { value: "https://sas.example.invalid/result-blob" },
    }); // GetLiveResponseResultDownloadLink
  graphMocks.graphUpload.mockResolvedValueOnce({ ok: true, status: 200, data: {} });
  graphMocks.graphWrite.mockResolvedValueOnce({
    ok: true,
    status: 200,
    data: { id: "action-1", status: "Succeeded" }, // terminal on the first read -> no poll loop
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ script_output: scriptOutput, exit_code: defenderExitCode }),
    })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  redisState.exists.mockResolvedValue(0);
  redisState.set.mockResolvedValue("OK");
  redisState.eval.mockResolvedValue(1);
  vi.unstubAllGlobals();
});

describe("runLiveResponseKbRemediation — PatchPilot-Exit sentinel handling", () => {
  it("maps a PatchPilot-Exit: 0 output to exitCode 0", async () => {
    // Defender's own exit_code is deliberately wrong (4) here — the sentinel,
    // not Defender's field, must be what decides the outcome.
    primeSuccessfulDispatch("PatchPilot: KB5040442 installed (HResult 0).\nPatchPilot-Exit: 0", 4);
    const result = await runLiveResponseKbRemediation(baseInput);
    expect(result.exitCode).toBe(0);
  });

  it("maps a PatchPilot-Exit: 4 output to exitCode 4, not coerced to 1", async () => {
    // Defender's own exit_code lies the other way here (0) — proven live: a
    // script that actually exited 4 was reported by Defender as exit_code 0.
    primeSuccessfulDispatch("PatchPilot: install did not succeed cleanly.\nPatchPilot-Exit: 4", 0);
    const result = await runLiveResponseKbRemediation(baseInput);
    expect(result.exitCode).toBe(4);
  });

  it("treats a missing sentinel as a failure (exitCode 1), never falling back to Defender's exit_code", async () => {
    primeSuccessfulDispatch("some unrelated device output with no sentinel at all", 0);
    const result = await runLiveResponseKbRemediation(baseInput);
    expect(result.exitCode).toBe(1);
  });

  it("takes the LAST sentinel line when more than one is present", async () => {
    primeSuccessfulDispatch("PatchPilot-Exit: 0\n(some echoed device output)\nPatchPilot-Exit: 4", 0);
    const result = await runLiveResponseKbRemediation(baseInput);
    expect(result.exitCode).toBe(4);
  });

  it("parses a negative sentinel value", async () => {
    primeSuccessfulDispatch("PatchPilot-Exit: -1", 0);
    const result = await runLiveResponseKbRemediation(baseInput);
    expect(result.exitCode).toBe(-1);
  });

  it("uploads the WUA library script once when not yet present, and invokes it by name", async () => {
    primeSuccessfulDispatch("PatchPilot-Exit: 0", 0);
    await runLiveResponseKbRemediation(baseInput);
    expect(graphMocks.graphUpload).toHaveBeenCalledTimes(1);
    const uploadCall = graphMocks.graphUpload.mock.calls[0]![0];
    expect(uploadCall.file.fileName).toMatch(/^PatchPilot-WUA-[0-9a-f]{8}\.ps1$/);
    expect(uploadCall.file.content).toContain("KB5040442");

    const runCall = graphMocks.graphWrite.mock.calls[0]![0];
    expect(runCall.path).toBe("/machines/machine-1/runliveresponse");
    const scriptNameParam = runCall.body.Commands[0].params.find(
      (p: { key: string }) => p.key === "ScriptName",
    );
    expect(scriptNameParam.value).toBe(uploadCall.file.fileName);
  });
});

describe("Live Response job time limit (control)", () => {
  it("stops the job's clock while queued for the device and restarts it once the lock is held", async () => {
    vi.useFakeTimers();
    try {
      const calls: string[] = [];
      redisState.exists.mockResolvedValueOnce(1); // another job holds the device
      redisState.set.mockImplementationOnce(async () => {
        calls.push("lock-busy");
        return null as unknown as string;
      });
      redisState.set.mockImplementationOnce(async () => {
        calls.push("lock-acquired");
        return "OK";
      });
      primeSuccessfulDispatch("PatchPilot-Exit: 0");

      const run = runLiveResponseKbRemediation({
        ...baseInput,
        control: {
          onDeviceWait: () => calls.push("wait"),
          onDeviceTurn: () => calls.push("turn"),
        },
      });
      await vi.advanceTimersByTimeAsync(3_000);
      const result = await run;

      expect(result.exitCode).toBe(0);
      expect(calls).toEqual(["wait", "lock-busy", "lock-acquired", "turn"]);
      expect(result.output).toContain("queued behind it");
    } finally {
      vi.useRealTimers();
    }
  });

  it("never dispatches an action once the time limit has already run out", async () => {
    graphMocks.graphGet.mockResolvedValueOnce({ ok: true, status: 200, data: { value: [] } });
    graphMocks.graphUpload.mockResolvedValueOnce({ ok: true, status: 200, data: {} });
    const controller = new AbortController();
    controller.abort();

    const result = await runLiveResponseKbRemediation({ ...baseInput, control: { signal: controller.signal } });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("nothing was dispatched");
    expect(graphMocks.graphWrite).not.toHaveBeenCalled();
    expect(redisState.eval).toHaveBeenCalledTimes(1); // lock released
  });

  it("cancels an action still in flight when the time limit runs out", async () => {
    const controller = new AbortController();
    graphMocks.graphGet.mockResolvedValueOnce({ ok: true, status: 200, data: { value: [] } });
    graphMocks.graphUpload.mockResolvedValueOnce({ ok: true, status: 200, data: {} });
    graphMocks.graphWrite
      .mockImplementationOnce(async () => {
        // The limit runs out while Defender is accepting the action.
        controller.abort();
        return { ok: true, status: 201, data: { id: "action-1", status: "Pending" } };
      })
      .mockResolvedValueOnce({ ok: true, status: 200, data: {} }); // cancel

    const result = await runLiveResponseKbRemediation({ ...baseInput, control: { signal: controller.signal } });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("time limit reached");
    expect(graphMocks.graphWrite).toHaveBeenCalledTimes(2);
    expect(graphMocks.graphWrite.mock.calls[1]![0].path).toBe("/machineactions/action-1/cancel");
    expect(redisState.eval).toHaveBeenCalledTimes(1); // lock released
  });
});
