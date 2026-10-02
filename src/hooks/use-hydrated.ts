"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during SSR and the first client render, true once React has hydrated.
 * Used to keep credential forms from being submitted natively (before React
 * attaches its handlers), which would otherwise put fields in the URL.
 */
export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
