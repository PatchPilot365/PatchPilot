// Run with: pnpm test:scripts  (node --test scripts/release.test.mjs)
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectDevApiSupervisorPids } from "./release.mjs";

const SUPERVISOR_CMD = "node  ../../scripts/run-resilient.mjs pnpm exec tsx src/index.ts";
const SUPERVISOR_SHELL_CMD = "C:\\WINDOWS\\system32\\cmd.exe /d /s /c node ../../scripts/run-resilient.mjs pnpm exec tsx src/index.ts";
const TSX_CMD = "node  C:\\repo\\node_modules\\tsx\\dist\\cli.mjs src/index.ts";

// Shaped after a real Win32_Process snapshot taken with both the api and the
// worker running via start-dev.ps1 / .claude/launch.json (`pnpm --filter ...`).
function filteredChain(base, filter) {
  return [
    { pid: base, ppid: 1, commandLine: `C:\\WINDOWS\\system32\\cmd.exe /d /s /c "pnpm --filter ${filter} dev:resilient"` },
    { pid: base + 1, ppid: base, commandLine: `"node" "C:\\npm\\node_modules\\pnpm\\bin\\pnpm.cjs" "--filter" "${filter}" "dev:resilient"` },
    { pid: base + 2, ppid: base + 1, commandLine: SUPERVISOR_SHELL_CMD },
    { pid: base + 3, ppid: base + 2, commandLine: SUPERVISOR_CMD },
    { pid: base + 4, ppid: base + 3, commandLine: "C:\\WINDOWS\\system32\\cmd.exe /d /s /c pnpm exec tsx src/index.ts" },
    { pid: base + 5, ppid: base + 4, commandLine: TSX_CMD },
  ];
}

test("selects the api's supervisors and never the worker's identical ones", () => {
  const procs = [...filteredChain(100, "@patchpilot/api"), ...filteredChain(200, "@patchpilot/worker")];
  assert.deepEqual(selectDevApiSupervisorPids(procs, 105).sort(), [102, 103]);
});

test("still finds a stale api supervisor that doesn't hold the port", () => {
  const procs = [
    ...filteredChain(100, "@patchpilot/api"),
    ...filteredChain(300, "@patchpilot/api"),
    ...filteredChain(200, "@patchpilot/worker"),
  ];
  assert.deepEqual(selectDevApiSupervisorPids(procs, 105).sort(), [102, 103, 302, 303]);
});

test("falls back to the port holder's ancestry for a bare `pnpm dev:resilient`", () => {
  const bare = (base, ppid) => [
    { pid: base, ppid, commandLine: '"node" "C:\\npm\\node_modules\\pnpm\\bin\\pnpm.cjs" dev:resilient' },
    { pid: base + 1, ppid: base, commandLine: SUPERVISOR_CMD },
    { pid: base + 2, ppid: base + 1, commandLine: TSX_CMD },
  ];
  // Both run from a plain shell inside their app dir: nothing names the app,
  // so only the one actually holding the API port may be selected.
  const procs = [...bare(100, 1), ...bare(200, 1)];
  assert.deepEqual(selectDevApiSupervisorPids(procs, 102), [101]);
});

test("does not mistake another @patchpilot/api-prefixed package for the api", () => {
  const procs = filteredChain(100, "@patchpilot/api-client");
  assert.deepEqual(selectDevApiSupervisorPids(procs, null), []);
});

test("survives a parent-pid cycle in the snapshot", () => {
  const procs = [
    { pid: 10, ppid: 11, commandLine: SUPERVISOR_CMD },
    { pid: 11, ppid: 10, commandLine: "something else" },
  ];
  assert.deepEqual(selectDevApiSupervisorPids(procs, 10), []);
});
