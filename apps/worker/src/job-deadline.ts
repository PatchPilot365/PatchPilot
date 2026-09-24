/**
 * Distinguishes "the job's time limit ran out" from "the executor itself threw".
 * Both end the job the same way, but only the first is a worker decision that
 * overrode a run still in flight — which is the one worth auditing.
 */
export class JobTimeoutError extends Error {}

/**
 * A job's time limit, as an AbortSignal the executor can honour.
 *
 * Two things the old bare `Promise.race` + `setTimeout` got wrong, both hit
 * live on a scheduled fire that queued nine jobs against one device:
 *
 *  - Time spent waiting for the device's Live Response lock counted against
 *    the limit, so jobs queued behind others timed out without ever being
 *    sent. `pause()` / `start()` let the Live Response path stop the clock
 *    while it waits its turn and restart it (fresh) once it has the device.
 *  - Timing out only stopped *waiting* for the executor, not the executor: a
 *    job already marked "failed" went on to take the device lock, dispatch a
 *    Defender action and keep overwriting its own output. Aborting `signal`
 *    tells the executor to stop, never dispatch, and cancel any action it has
 *    in flight; `expired()` is the hard backstop for an executor that doesn't
 *    wind down within the grace period.
 */
export class JobDeadline {
  private readonly controller = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private graceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly limitMs: number) {}

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get expiredAlready(): boolean {
    return this.controller.signal.aborted;
  }

  /** (Re)starts the full time limit from now. No-op once it has expired. */
  start(): void {
    if (this.expiredAlready) return;
    this.pause();
    this.timer = setTimeout(
      () => this.controller.abort(new JobTimeoutError(`remediation timed out after ${this.limitMs}ms`)),
      this.limitMs,
    );
  }

  /** Stops the clock without expiring, e.g. while queued for a device. */
  pause(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  /**
   * Rejects with a JobTimeoutError `graceMs` after the limit expires — the
   * time the executor gets to notice `signal`, cancel what it dispatched and
   * return its own transcript. Never settles if the limit never expires.
   */
  expired(graceMs: number): Promise<never> {
    return new Promise<never>((_, reject) => {
      const fire = (): void => {
        this.graceTimer = setTimeout(
          () => reject(new JobTimeoutError(`remediation timed out after ${this.limitMs}ms`)),
          graceMs,
        );
      };
      if (this.expiredAlready) fire();
      else this.signal.addEventListener("abort", fire, { once: true });
    });
  }

  /** Clears every pending timer; call once the job has an outcome. */
  clear(): void {
    this.pause();
    if (this.graceTimer !== undefined) clearTimeout(this.graceTimer);
    this.graceTimer = undefined;
  }
}
