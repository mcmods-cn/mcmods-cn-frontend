"use client";

import { useEffect, useState } from "react";

type RotationClock = {
  listeners: Set<() => void>;
  timer: number;
};

const rotationClocks = new Map<number, RotationClock>();

function subscribeToRotationClock(intervalMilliseconds: number, listener: () => void) {
  let clock = rotationClocks.get(intervalMilliseconds);
  if (!clock) {
    const listeners = new Set<() => void>();
    clock = {
      listeners,
      timer: window.setInterval(() => {
        for (const notify of listeners) notify();
      }, intervalMilliseconds),
    };
    rotationClocks.set(intervalMilliseconds, clock);
  }
  clock.listeners.add(listener);
  return () => {
    clock.listeners.delete(listener);
    if (clock.listeners.size) return;
    window.clearInterval(clock.timer);
    if (rotationClocks.get(intervalMilliseconds) === clock) {
      rotationClocks.delete(intervalMilliseconds);
    }
  };
}

export function useRotatingValue<T>(
  values: readonly T[] | undefined,
  intervalMilliseconds = 1200,
) {
  const length = values?.length ?? 0;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (length <= 1 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    return subscribeToRotationClock(
      intervalMilliseconds,
      () => setIndex((current) => (current + 1) % length),
    );
  }, [intervalMilliseconds, length]);

  return length ? values?.[index % length] : undefined;
}
