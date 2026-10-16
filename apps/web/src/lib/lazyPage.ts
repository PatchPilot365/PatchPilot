import { lazy, type ComponentType } from "react";

/**
 * Route-level code splitting for pages exported by name (React.lazy only
 * understands default exports). Each page becomes its own chunk, fetched the
 * first time its route renders.
 */
export function lazyPage<K extends string>(
  load: () => Promise<Record<K, ComponentType>>,
  name: K,
) {
  return lazy(() => load().then((m) => ({ default: m[name] })));
}

const RELOADED_AT_KEY = "patchpilot:chunk-reload-at";

/**
 * A tab left open across a release still references the previous build's
 * chunk filenames, which no longer exist on the server — the next navigation
 * to a not-yet-loaded page fails its dynamic import. Vite reports that as
 * `vite:preloadError`; reload once to pick up the new index.html. The
 * timestamp guard stops a reload loop if the chunk is genuinely unreachable
 * (e.g. the server is down), letting the error surface instead.
 */
export function reloadOnStaleChunk() {
  window.addEventListener("vite:preloadError", (event) => {
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(RELOADED_AT_KEY)) || 0;
    } catch {
      // storage unavailable — fall through and reload anyway
    }
    if (Date.now() - last < 10_000) return;
    event.preventDefault();
    try {
      sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    window.location.reload();
  });
}
