import type { AgentFlag, AgentIntelligence, AgentPerformance } from "@/types/domain";
import { PERSONAL_LIMITS } from "../policy";
import type { DbState, TransactionRecord } from "../schema";
import { DAY_MS, dayLabel, dhakaDay, dhakaHour, growthPct, median, percentileRank, round3, succeeded, sum, ts, txnsByUser } from "./common";
import { lowCashDays } from "./liquidity";

/**
 * Agent signals over the last 28 days, each compared with the agent's own
 * previous 8 weeks and with the median of all active agents:
 *   NEAR_LIMIT_CASH_OUTS  cash-outs whose total (amount + fee) is within 5% of the per-transaction limit
 *   REPEATED_CUSTOMER     customer-days with 3+ transactions at this agent
 *   OFF_HOURS_ACTIVITY    share of transactions between 23:00 and 05:59
 *   VOLUME_SPIKE          last 7 days' volume vs the agent's weekly average for the 3 weeks before
 * "Rising" = transactions up 35%+ and volume up 10%+ on the previous 28 days, with
 * 20+ transactions and no high-severity flag (counts are steadier than volume,
 * which a few large cash-outs can swing). "Service gap" = 5+ low-cash days in 30, or 5%+ failed attempts.
 */

const WINDOW = 28;
const BASELINE = 56;
const COUNTER_TYPES = new Set(["CASH_IN", "CASH_OUT", "MOBILE_RECHARGE", "BILL_PAYMENT"]);
const NEAR_LIMIT = 0.95 * PERSONAL_LIMITS.VERIFIED.perTransaction;

interface Measures {
  transactions: number;
  attempts: number;
  failed: number;
  volume: number;
  cashOuts: number;
  nearLimit: number;
  repeatCustomerDays: number;
  repeatTxns: number;
  offHours: number;
}

/** The agent's counter transactions (not settlements), successful or failed. */
function counterTxns(db: DbState, agentId: string) {
  return (txnsByUser(db).get(agentId) ?? []).filter(
    (t) => COUNTER_TYPES.has(t.type) && (t.sender.userId === agentId || t.receiver.userId === agentId) && t.status !== "PENDING",
  );
}

function measure(txns: TransactionRecord[], agentId: string): Measures {
  const good = txns.filter(succeeded);
  const cashOuts = good.filter((t) => t.type === "CASH_OUT" && t.receiver.userId === agentId);
  const perCustomerDay = new Map<string, number>();
  for (const t of good) {
    const customer = t.sender.kind === "PERSONAL" ? t.sender.userId : t.receiver.kind === "PERSONAL" ? t.receiver.userId : null;
    if (!customer) continue;
    const key = `${customer}:${dhakaDay(ts(t))}`;
    perCustomerDay.set(key, (perCustomerDay.get(key) ?? 0) + 1);
  }
  const repeated = [...perCustomerDay.values()].filter((n) => n >= 3);
  return {
    transactions: good.length,
    attempts: txns.length,
    failed: txns.length - good.length,
    volume: sum(good.map((t) => t.amount)),
    cashOuts: cashOuts.length,
    nearLimit: cashOuts.filter((t) => t.amount + t.senderFee >= NEAR_LIMIT).length,
    repeatCustomerDays: repeated.length,
    repeatTxns: sum(repeated),
    offHours: good.filter((t) => {
      const h = dhakaHour(ts(t));
      return h >= 23 || h < 6;
    }).length,
  };
}

const between = (txns: TransactionRecord[], from: number, to: number) => txns.filter((t) => ts(t) >= from && ts(t) < to);
const share = (n: number, of: number) => (of ? n / of : 0);

interface AgentRow {
  agentId: string;
  current: Measures;
  previous: Measures; // the 28 days before the window
  baseline: Measures; // the 8 weeks before the window
  last7: number;
  prior21: number;
}

const rowsCache = new WeakMap<DbState, { now: number; rows: Map<string, AgentRow> }>();
function agentRows(db: DbState, now: number) {
  const cached = rowsCache.get(db);
  if (cached && cached.now === now) return cached.rows;
  const rows = new Map<string, AgentRow>();
  const windowStart = now - WINDOW * DAY_MS;
  for (const u of db.users.filter((x) => x.role === "AGENT" && x.status === "VERIFIED")) {
    const txns = counterTxns(db, u.id);
    const current = between(txns, windowStart, now);
    rows.set(u.id, {
      agentId: u.id,
      current: measure(current, u.id),
      previous: measure(between(txns, windowStart - WINDOW * DAY_MS, windowStart), u.id),
      baseline: measure(between(txns, windowStart - BASELINE * DAY_MS, windowStart), u.id),
      last7: sum(between(current, now - 7 * DAY_MS, now).filter(succeeded).map((t) => t.amount)),
      prior21: sum(between(current, windowStart, now - 7 * DAY_MS).filter(succeeded).map((t) => t.amount)),
    });
  }
  rowsCache.set(db, { now, rows });
  return rows;
}

function flagsFor(row: AgentRow, peers: AgentRow[]): AgentFlag[] {
  const active = peers.filter((p) => p.current.transactions >= 10);
  const flags: AgentFlag[] = [];
  const { current: c, baseline: b } = row;
  const baseOrNull = (n: number, of: number) => (b.transactions >= 10 ? round3(share(n, of)) : null);

  const nearShare = share(c.nearLimit, c.cashOuts);
  const nearPeers = median(active.map((p) => share(p.current.nearLimit, p.current.cashOuts)));
  if (c.nearLimit >= 5 && nearShare >= Math.max(0.15, 3 * nearPeers + 0.05)) {
    flags.push({ code: "NEAR_LIMIT_CASH_OUTS", severity: nearShare >= 0.3 || c.nearLimit >= 10 ? "HIGH" : "MEDIUM", value: round3(nearShare), peerMedian: round3(nearPeers), baseline: baseOrNull(b.nearLimit, b.cashOuts), evidence: c.nearLimit });
  }
  const repeatPeers = median(active.map((p) => p.current.repeatCustomerDays));
  if (c.repeatCustomerDays >= 3 && c.repeatCustomerDays >= repeatPeers + 3) {
    flags.push({ code: "REPEATED_CUSTOMER", severity: c.repeatCustomerDays >= 6 ? "HIGH" : "MEDIUM", value: c.repeatCustomerDays, peerMedian: repeatPeers, baseline: b.transactions >= 10 ? b.repeatCustomerDays : null, evidence: c.repeatTxns });
  }
  const offShare = share(c.offHours, c.transactions);
  const offPeers = median(active.map((p) => share(p.current.offHours, p.current.transactions)));
  if (c.offHours >= 5 && offShare >= Math.max(0.05, 3 * offPeers)) {
    flags.push({ code: "OFF_HOURS_ACTIVITY", severity: offShare >= 0.1 ? "HIGH" : "MEDIUM", value: round3(offShare), peerMedian: round3(offPeers), baseline: baseOrNull(b.offHours, b.transactions), evidence: c.offHours });
  }
  const weeklyBefore = row.prior21 / 3;
  if (weeklyBefore > 0 && row.last7 >= 2.5 * weeklyBefore && row.last7 >= 2_000_000) {
    const ratio = row.last7 / weeklyBefore;
    flags.push({ code: "VOLUME_SPIKE", severity: ratio >= 4 ? "HIGH" : "MEDIUM", value: round3(ratio), peerMedian: 1, baseline: null, evidence: c.transactions });
  }
  return flags;
}

/** Admin: every verified agent with flags, growth and service quality. Flagged agents first. */
export function agentIntelligence(db: DbState, now = Date.now()): AgentIntelligence[] {
  const rows = agentRows(db, now);
  const peers = [...rows.values()];
  const result = peers.map((row): AgentIntelligence => {
    const profile = db.agentProfiles.find((p) => p.userId === row.agentId);
    const flags = flagsFor(row, peers);
    const growth = growthPct(row.current.volume, row.previous.volume);
    const txnGrowth = growthPct(row.current.transactions, row.previous.transactions);
    const failureRate28 = round3(share(row.current.failed, row.current.attempts));
    const low = lowCashDays(db, row.agentId, now);
    const gap = low >= 5 || (row.current.attempts >= 20 && failureRate28 >= 0.05);
    return {
      userId: row.agentId,
      agentCode: profile?.agentCode ?? "",
      outletName: profile?.outletName ?? "",
      district: profile?.district ?? null,
      volume28: row.current.volume,
      growthPct: growth,
      transactions28: row.current.transactions,
      transactionsGrowthPct: txnGrowth,
      flags,
      rising: txnGrowth !== null && txnGrowth >= 35 && (growth ?? 0) >= 10 && row.current.transactions >= 20 && !flags.some((f) => f.severity === "HIGH"),
      serviceGap: gap ? { lowCashDays30: low, failureRate28 } : null,
    };
  });
  const weight = (a: AgentIntelligence) => a.flags.filter((f) => f.severity === "HIGH").length * 4 + a.flags.length * 2 + (a.serviceGap ? 1 : 0);
  return result.sort((a, b) => weight(b) - weight(a) || (b.growthPct ?? 0) - (a.growthPct ?? 0));
}

/** An agent's own performance and standing (no other agent is identified). */
export function agentPerformance(db: DbState, agentId: string, now = Date.now()): AgentPerformance {
  const rows = agentRows(db, now);
  const row = rows.get(agentId) ?? {
    agentId,
    current: measure([], agentId),
    previous: measure([], agentId),
    baseline: measure([], agentId),
    last7: 0,
    prior21: 0,
  };
  const district = db.agentProfiles.find((p) => p.userId === agentId)?.district ?? null;
  const sameDistrict = [...rows.values()].filter((r) => r.agentId !== agentId && district && db.agentProfiles.find((p) => p.userId === r.agentId)?.district === district);
  const [scope, peers] = sameDistrict.length >= 4 ? (["DISTRICT", sameDistrict] as const) : (["ALL", [...rows.values()].filter((r) => r.agentId !== agentId)] as const);

  const commissions = db.commissions.filter((c) => c.agentId === agentId);
  const commissionBetween = (from: number, to: number) => sum(commissions.filter((c) => Date.parse(c.createdAt) >= from && Date.parse(c.createdAt) < to).map((c) => c.amount));
  const windowStart = now - WINDOW * DAY_MS;

  const txns = counterTxns(db, agentId).filter(succeeded);
  const weekly = Array.from({ length: 8 }, (_, k) => {
    const from = now - (8 - k) * 7 * DAY_MS;
    const to = from + 7 * DAY_MS;
    return { week: dayLabel(dhakaDay(from)), volume: sum(between(txns, from, to).map((t) => t.amount)), commission: commissionBetween(from, to) };
  });
  const recent = between(txns, windowStart, now);
  const total = sum(recent.map((t) => t.amount));
  const mix = (["CASH_IN", "CASH_OUT", "MOBILE_RECHARGE", "BILL_PAYMENT"] as const).map((type) => {
    const volume = sum(recent.filter((t) => t.type === type).map((t) => t.amount));
    return { type, volume, share: total ? round3(volume / total) : 0 };
  });

  return {
    asOf: new Date(now).toISOString(),
    volume28: row.current.volume,
    volumePrev28: row.previous.volume,
    growthPct: growthPct(row.current.volume, row.previous.volume),
    commission28: commissionBetween(windowStart, now),
    commissionPrev28: commissionBetween(windowStart - WINDOW * DAY_MS, windowStart),
    transactions28: row.current.transactions,
    failureRate28: round3(share(row.current.failed, row.current.attempts)),
    lowCashDays30: lowCashDays(db, agentId, now),
    rank: { percentile: percentileRank(row.current.volume, peers.map((p) => p.current.volume)), peers: peers.length, scope },
    weekly,
    mix,
  };
}
