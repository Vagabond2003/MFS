import { ApiError } from "../errors";
import { DB_VERSION, type DbState } from "./schema";

/**
 * In-browser persistence for the mock server.
 *
 * - `read()`  gives handlers a consistent snapshot.
 * - `write()` emulates a serialisable database transaction: writes are queued
 *   (one at a time, like a row lock on the wallet), the handler mutates a
 *   *copy* of the state, invariants are checked, and only then is the copy
 *   committed and persisted. Any throw rolls the whole thing back, so a
 *   balance change can never be half-applied.
 */

const STORAGE_KEY = "kosh.mock-db";
let state: DbState | null = null;
let loading: Promise<DbState> | null = null;
let queue: Promise<unknown> = Promise.resolve();

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function persist(db: DbState) {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Quota or private mode — the session keeps working in memory.
  }
}

async function load(): Promise<DbState> {
  if (state) return state;
  if (!loading) {
    loading = (async () => {
      const raw = storage()?.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as DbState;
          if (parsed.version === DB_VERSION) {
            state = parsed;
            return parsed;
          }
        } catch {
          /* fall through to reseed */
        }
      }
      const { buildSeed } = await import("./seed");
      const seeded = await buildSeed();
      state = seeded;
      persist(seeded);
      return seeded;
    })().finally(() => {
      loading = null;
    });
  }
  return loading;
}

if (typeof window !== "undefined") {
  // Keep tabs in sync: another tab committed a write.
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    if (!e.newValue) {
      state = null;
      return;
    }
    try {
      const next = JSON.parse(e.newValue) as DbState;
      if (next.version === DB_VERSION) state = next;
    } catch {
      /* ignore */
    }
  });
}

export async function read<T>(fn: (db: DbState) => T): Promise<T> {
  await queue.catch(() => undefined);
  const db = await load();
  return fn(db);
}

export function write<T>(fn: (draft: DbState) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const current = await load();
    const draft = structuredClone(current);
    const result = await fn(draft);
    assertInvariants(draft);
    state = draft;
    persist(draft);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

function assertInvariants(db: DbState) {
  for (const w of db.wallets) {
    const values = [w.available, w.savings, w.pending, w.cashInHand ?? 0];
    if (values.some((v) => !Number.isInteger(v))) {
      throw new ApiError("UNKNOWN", "Ledger invariant violated: non-integer balance");
    }
    if (values.some((v) => v < 0)) {
      throw new ApiError("INSUFFICIENT_FUNDS", "Insufficient balance for this transaction");
    }
  }
}

export async function resetDatabase() {
  await queue.catch(() => undefined);
  storage()?.removeItem(STORAGE_KEY);
  state = null;
  await load();
}
