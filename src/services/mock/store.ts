import { ApiError } from "../errors";
import type { DbState } from "./schema";

/**
 * Persistence for the API handlers. The data lives in PostgreSQL (Supabase);
 * the server installs src/server/db-store.ts as the backend at startup.
 *
 * - `read()`  gives handlers a consistent snapshot.
 * - `write()` is one database transaction: writes are serialised, the
 *   handler mutates a copy, invariants are checked, and only then is it
 *   committed. Any throw rolls the whole thing back, so a balance change can
 *   never be half-applied.
 */
export interface StoreBackend {
  read<T>(fn: (db: DbState) => T): Promise<T>;
  write<T>(fn: (draft: DbState) => T | Promise<T>): Promise<T>;
  reset(): Promise<void>;
}

let backend: StoreBackend | null = null;

export function setStoreBackend(next: StoreBackend) {
  backend = next;
}

function current(): StoreBackend {
  if (!backend) throw new Error("No database backend configured — handlers must run on the server (src/server/rpc.ts).");
  return backend;
}

export function read<T>(fn: (db: DbState) => T): Promise<T> {
  return current().read(fn);
}

export function write<T>(fn: (draft: DbState) => T | Promise<T>): Promise<T> {
  return current().write(fn);
}

export function assertInvariants(db: DbState) {
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

export function resetDatabase() {
  return current().reset();
}
