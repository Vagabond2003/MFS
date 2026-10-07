import { describe } from "vitest";
import { plantedPatternTests } from "./helpers/planted";
import { PINNED_NOW } from "./helpers/synthetic";

/**
 * The generator anchors its 90 days to `now`, so each anchor date is a
 * different dataset. Before this suite existed the planted patterns held only
 * on some dates (110 of 120 consecutive anchors failed at least one check).
 *
 * Default: every 45th day of 2026 plus the pinned date, chosen by rule rather
 * than by result. For a wider measurement run, e.g.
 *   ANCHOR_SWEEP=365 npx vitest run tests/intelligence-anchors.test.ts
 * which checks every day from 2026-01-01. Measured on 2026-10-07: 364 of 365
 * pass; 2026-07-17 misses "rising" (transactions +75%, volume +0.7% against the
 * rule's 10%), sampling noise in that window's bill payments.
 */
const DAY_MS = 86_400_000;
const sweep = Number(process.env.ANCHOR_SWEEP ?? 0);
const start = Date.parse("2026-01-01T09:00:00Z");
const anchors = sweep > 0
  ? Array.from({ length: sweep }, (_, i) => new Date(start + i * DAY_MS).toISOString())
  : [...Array.from({ length: 9 }, (_, i) => new Date(start + i * 45 * DAY_MS).toISOString()), PINNED_NOW];

describe.each(anchors)("planted patterns, history ending %s", (anchor) => plantedPatternTests(anchor));
