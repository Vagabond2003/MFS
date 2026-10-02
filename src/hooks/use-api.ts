"use client";

import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";
import { ApiError } from "@/services";
import { toApiError } from "@/services/errors";
import { UNAUTHENTICATED_EVENT } from "./use-auth";

/**
 * Minimal data-fetching hook (no external dependency).
 * - keeps previous data while refetching (`refreshing`) so charts don't flash
 * - re-runs when any of `tags` is invalidated after a mutation
 * - signals the auth provider when the session has ended
 */

export type QueryTag =
  | "wallet"
  | "transactions"
  | "notifications"
  | "profile"
  | "dashboard"
  | "admin"
  | "payment-requests"
  | "settlements";

const listeners = new Map<QueryTag, Set<() => void>>();

export function invalidate(...tags: QueryTag[]) {
  const seen = new Set<() => void>();
  for (const tag of tags) listeners.get(tag)?.forEach((fn) => seen.add(fn));
  seen.forEach((fn) => fn());
}

/** Everything that changes when money moves. */
export function invalidateLedger() {
  invalidate("wallet", "transactions", "notifications", "dashboard", "settlements", "payment-requests", "admin");
}

interface Options {
  tags?: QueryTag[];
  pollMs?: number;
  enabled?: boolean;
}

interface Settled<T> {
  key: string;
  data: T | undefined;
  error: ApiError | null;
}

export function useApi<T>(fetcher: () => Promise<T>, deps: DependencyList, options: Options = {}) {
  const { tags = [], pollMs, enabled = true } = options;
  const [nonce, setNonce] = useState(0);
  const [settled, setSettled] = useState<Settled<T>>({ key: "", data: undefined, error: null });
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  // Each distinct (deps, reload) combination is one request; state only
  // changes when a request settles, so effects never set state synchronously.
  const requestKey = `${JSON.stringify(deps)}#${nonce}`;
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetcherRef
      .current()
      .then((data) => {
        if (!cancelled) setSettled({ key: requestKey, data, error: null });
      })
      .catch((e) => {
        if (cancelled) return;
        const error = toApiError(e);
        setSettled((prev) => ({ key: requestKey, data: prev.data, error }));
        if (error.code === "UNAUTHENTICATED") window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey, enabled]);

  const tagKey = tags.join(",");
  useEffect(() => {
    if (!tagKey) return;
    const list = tagKey.split(",") as QueryTag[];
    for (const t of list) {
      if (!listeners.has(t)) listeners.set(t, new Set());
      listeners.get(t)!.add(reload);
    }
    return () => {
      for (const t of list) listeners.get(t)?.delete(reload);
    };
  }, [tagKey, reload]);

  useEffect(() => {
    if (!pollMs || !enabled) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, pollMs);
    return () => window.clearInterval(id);
  }, [pollMs, enabled, reload]);

  const pending = enabled && settled.key !== requestKey;
  const setData = useCallback((data: T) => setSettled((prev) => ({ ...prev, data })), []);

  return {
    data: settled.data,
    error: pending ? null : settled.error,
    /** First load, nothing to show yet. */
    loading: pending && settled.data === undefined,
    /** Re-fetching while previous data stays on screen. */
    refreshing: pending && settled.data !== undefined,
    reload,
    setData,
  };
}
