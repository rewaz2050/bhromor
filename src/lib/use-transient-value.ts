"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A value that automatically reverts after `ms` — with the timer always
 * cleared on unmount.
 *
 * Several admin screens hand-rolled this with a bare `setTimeout`, so
 * navigating away mid-flash left a timer that fired setState on an unmounted
 * component (and stacked up when a button was pressed repeatedly).
 */
export function useTransientValue<T>(initial: T, ms = 1800) {
  const [initialValue] = useState<T>(initial);
  const [value, setValue] = useState<T>(initial);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const show = useCallback(
    (next: T) => {
      setValue(next);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setValue(initialValue), ms);
    },
    [initialValue, ms],
  );

  return [value, show] as const;
}
