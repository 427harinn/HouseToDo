import { useEffect, useRef, useState } from "react";

export type DelayedBusyStatusOptions = {
  delayMs: number;
  minVisibleMs: number;
};

/**
 * Delays a transient busy indicator and keeps it visible long enough to avoid
 * a show/hide flash when a request finishes immediately after the delay.
 */
export function useDelayedBusyStatus(
  active: boolean,
  { delayMs, minVisibleMs }: DelayedBusyStatusOptions
) {
  const [visible, setVisible] = useState(false);
  const visibleSinceRef = useRef<number | null>(null);
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearShowTimer = () => {
      if (showTimerRef.current !== null) {
        window.clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };
    const clearHideTimer = () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };

    if (active) {
      clearHideTimer();
      if (visibleSinceRef.current === null) {
        showTimerRef.current = window.setTimeout(() => {
          showTimerRef.current = null;
          visibleSinceRef.current = Date.now();
          setVisible(true);
        }, Math.max(0, delayMs));
      }
    } else if (visibleSinceRef.current === null) {
      clearShowTimer();
      setVisible(false);
    } else {
      clearShowTimer();
      const remainingMs = Math.max(0, minVisibleMs - (Date.now() - visibleSinceRef.current));
      clearHideTimer();
      hideTimerRef.current = window.setTimeout(() => {
        hideTimerRef.current = null;
        visibleSinceRef.current = null;
        setVisible(false);
      }, remainingMs);
    }

    return () => {
      clearShowTimer();
      clearHideTimer();
    };
  }, [active, delayMs, minVisibleMs, visible]);

  useEffect(() => () => {
    if (showTimerRef.current !== null) window.clearTimeout(showTimerRef.current);
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
  }, []);

  return visible;
}
