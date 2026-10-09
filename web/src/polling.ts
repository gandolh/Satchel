import { useCallback, useEffect, useEffectEvent, useSyncExternalStore } from "react";

/**
 * Page visibility, polling and media queries: the small browser plumbing the
 * chat list uses and the thread reuses. Phase 1 has no live channel, so
 * screens poll, and only while someone can see them.
 */

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function isVisible(): boolean {
  return document.visibilityState === "visible";
}

/** Whether the page is visible right now; re-renders when that changes. */
export function usePageVisible(): boolean {
  return useSyncExternalStore(subscribeVisibility, isVisible, () => true);
}

export interface PollingOptions {
  /** Time between runs while the page is visible. */
  intervalMs: number;
  /** False pauses polling entirely. Default true. */
  enabled?: boolean;
  /** Changing it restarts polling with an immediate run (a different conversation, say). */
  resetKey?: string | number;
}

/**
 * Run `task` now, then every `intervalMs` while the page is visible, and at
 * once whenever it becomes visible again (the interval restarts from there).
 * A run never overlaps the previous one: a slow request skips ticks instead of
 * stacking them. `task` always sees the latest props; it reports its own
 * errors, since a rejection here is swallowed.
 */
export function usePolling(task: () => unknown, { intervalMs, enabled = true, resetKey }: PollingOptions): void {
  const runTask = useEffectEvent(task);

  useEffect(() => {
    if (!enabled) return;
    let running = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const run = async () => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      try {
        await runTask();
      } catch {
        // The task shows its own errors; the next tick tries again.
      } finally {
        running = false;
      }
    };
    const restart = () => {
      clearInterval(timer);
      timer = setInterval(() => void run(), intervalMs);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      void run();
      restart();
    };

    void run();
    restart();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, intervalMs, resetKey]);
}

/** From here up the list and the thread sit side by side. */
export const WIDE_QUERY = "(min-width: 900px)";

/** Whether a media query matches; re-renders when it flips. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
