import type { DbState } from "@/services/mock/schema";
import { generateSynthetic, toDbState } from "../../scripts/lib/synthetic-state.mjs";

/** Accounts that carry a planted pattern (see scripts/seed-synthetic.mjs). */
export interface Specials {
  nearLimit: string;
  offHours: string;
  rising: string[];
  serviceGap: string;
  decliners: string[];
}

export interface SyntheticDataset {
  db: DbState;
  /** The instant the 90 days of history end; pass it as `now` to every intelligence function. */
  now: number;
  specials: Specials;
}

/**
 * The anchor most tests use. The generator anchors its days to `now`, so an
 * unpinned run gives different data every day; 2026-10-07 is the date the
 * "rising performer" check first failed.
 */
export const PINNED_NOW = "2026-10-07T09:00:00Z";

const cache = new Map<string, SyntheticDataset>();

/** The synthetic dataset with history ending at `anchor` (same anchor → same data). */
export function syntheticAt(anchor: string = PINNED_NOW): SyntheticDataset {
  let ds = cache.get(anchor);
  if (!ds) {
    ds = toDbState(generateSynthetic({ now: anchor })) as unknown as SyntheticDataset;
    cache.set(anchor, ds);
  }
  return ds;
}
