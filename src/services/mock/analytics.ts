import { format, startOfDay, startOfMonth, startOfWeek, subDays, subMonths, subWeeks } from "date-fns";
import type {
  AdminStats,
  AgentDashboard,
  AgentStatus,
  CommissionSummary,
  MerchantDashboard,
  MerchantStatus,
  PaymentMethod,
  PersonalDashboard,
  TransactionType,
} from "@/types/domain";
import { PERSONAL_LIMITS } from "./policy";
import type { DbState, TransactionRecord, UserRecord } from "./schema";
import { toProfileView, toTransactionView, toWalletView } from "./views";
import { walletOf } from "./ledger";

/** Dashboard aggregates are computed server-side from the ledger. */

const ok = (t: TransactionRecord) => t.status === "SUCCESSFUL" || t.status === "REFUNDED";
const ts = (t: TransactionRecord) => Date.parse(t.createdAt);
const byNewest = (a: TransactionRecord, b: TransactionRecord) => b.createdAt.localeCompare(a.createdAt);

function monthBuckets(n: number) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const start = startOfMonth(subMonths(now, n - 1 - i));
    const end = startOfMonth(subMonths(now, n - 2 - i));
    return { key: format(start, "yyyy-MM"), label: format(start, "MMM"), start: start.getTime(), end: end.getTime() };
  });
}

function dayBuckets(n: number) {
  const today = startOfDay(new Date());
  return Array.from({ length: n }, (_, i) => {
    const start = subDays(today, n - 1 - i);
    return { label: format(start, "d MMM"), start: start.getTime(), end: start.getTime() + 86_400_000 };
  });
}

function inRange(t: TransactionRecord, start: number, end: number) {
  const x = ts(t);
  return x >= start && x < end;
}

/* ───────────── Personal ───────────── */

const SPEND_CATEGORY: Partial<Record<TransactionRecord["type"], string>> = {
  SEND_MONEY: "Send Money",
  MERCHANT_PAYMENT: "Shopping & dining",
  BILL_PAYMENT: "Bills",
  MOBILE_RECHARGE: "Recharge",
  CASH_OUT: "Cash Out",
};

export function personalDashboard(db: DbState, user: UserRecord): PersonalDashboard {
  const uid = user.id;
  const mine = db.transactions.filter((t) => t.sender.userId === uid || t.receiver.userId === uid);
  const isOut = (t: TransactionRecord) => t.sender.userId === uid;

  const summarise = (start: number, end: number) => {
    let income = 0, spending = 0, sent = 0, received = 0, spent = 0, count = 0;
    for (const t of mine) {
      if (!inRange(t, start, end)) continue;
      count++;
      if (!ok(t)) continue;
      if (isOut(t)) {
        const gross = t.amount + t.senderFee;
        spending += gross;
        if (t.type === "SEND_MONEY") sent += t.amount;
        else spent += gross;
      } else {
        income += t.amount - t.receiverFee;
        if (t.type === "SEND_MONEY") received += t.amount;
      }
    }
    return { income, spending, sent, received, spent, saved: income - spending, count };
  };

  const months = monthBuckets(6);
  const monthly = months.map((m) => {
    const s = summarise(m.start, m.end);
    return { month: m.label, income: s.income, spending: s.spending, savings: s.saved, count: s.count };
  });
  const cur = summarise(months[5].start, months[5].end);
  // Month-to-date is compared with the same number of days last month.
  const elapsed = Date.now() - months[5].start;
  const prev = summarise(months[4].start, Math.min(months[4].start + elapsed, months[4].end));

  const since = Date.now() - 30 * 86_400_000;
  const cats = new Map<string, number>();
  for (const t of mine) {
    if (!ok(t) || !isOut(t) || ts(t) < since) continue;
    const c = SPEND_CATEGORY[t.type];
    if (c) cats.set(c, (cats.get(c) ?? 0) + t.amount + t.senderFee);
  }

  const todayStart = startOfDay(new Date()).getTime();
  const usedToday = mine
    .filter((t) => isOut(t) && ts(t) >= todayStart && (ok(t) || t.status === "PENDING"))
    .reduce((s, t) => s + t.amount + t.senderFee, 0);
  const limits = user.status === "VERIFIED" ? PERSONAL_LIMITS.VERIFIED : PERSONAL_LIMITS.PENDING_VERIFICATION;

  return {
    wallet: toWalletView(walletOf(db, uid)),
    month: {
      income: cur.income,
      spending: cur.spending,
      savings: cur.saved,
      transactionCount: cur.count,
      sent: cur.sent,
      received: cur.received,
      spent: cur.spent,
      saved: cur.saved,
    },
    previousMonth: { sent: prev.sent, received: prev.received, spent: prev.spent, saved: prev.saved },
    monthly,
    spendingByCategory: [...cats.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
    recent: [...mine].sort(byNewest).slice(0, 8).map((t) => toTransactionView(db, t, uid)),
    limits: { perTransaction: limits.perTransaction, dailyOut: limits.dailyOut, usedToday },
  };
}

/* ───────────── Agent ───────────── */

function agentFlows(t: TransactionRecord, uid: string) {
  const s = ok(t);
  return {
    cashIn: s && t.type === "CASH_IN" && t.sender.userId === uid ? t.amount : 0,
    cashOut: s && t.type === "CASH_OUT" && t.receiver.userId === uid ? t.amount : 0,
    recharge: s && t.type === "MOBILE_RECHARGE" && t.sender.userId === uid ? t.amount : 0,
    payment: s && t.type === "BILL_PAYMENT" && t.sender.userId === uid ? t.amount : 0,
    commission: t.commission?.userId === uid ? t.commission.amount : 0,
  };
}

export function agentDashboard(db: DbState, user: UserRecord): AgentDashboard {
  const uid = user.id;
  const mine = db.transactions.filter((t) => t.sender.userId === uid || t.receiver.userId === uid);

  const summarise = (start: number, end: number) => {
    const acc = { cashIn: 0, cashOut: 0, recharge: 0, payment: 0, commission: 0, count: 0 };
    for (const t of mine) {
      if (!inRange(t, start, end)) continue;
      if (t.type !== "SETTLEMENT") acc.count++;
      const f = agentFlows(t, uid);
      acc.cashIn += f.cashIn;
      acc.cashOut += f.cashOut;
      acc.recharge += f.recharge;
      acc.payment += f.payment;
      acc.commission += f.commission;
    }
    return acc;
  };

  const months = monthBuckets(6);
  const m = summarise(months[5].start, months[5].end);
  const todayStart = startOfDay(new Date()).getTime();
  const d = summarise(todayStart, todayStart + 86_400_000);

  return {
    wallet: toWalletView(walletOf(db, uid)),
    status: user.status as AgentStatus,
    month: { cashIn: m.cashIn, cashOut: m.cashOut, recharge: m.recharge, transactionCount: m.count, commission: m.commission },
    today: { cashIn: d.cashIn, cashOut: d.cashOut, recharge: d.recharge, commission: d.commission, count: d.count },
    daily: dayBuckets(14).map((b) => {
      const s = summarise(b.start, b.end);
      return { date: b.label, cashIn: s.cashIn, cashOut: s.cashOut };
    }),
    monthly: months.map((b) => {
      const s = summarise(b.start, b.end);
      return { month: b.label, volume: s.cashIn + s.cashOut + s.recharge + s.payment, count: s.count, commission: s.commission };
    }),
  };
}

const COMMISSION_LABEL: Partial<Record<TransactionRecord["type"], string>> = {
  CASH_IN: "Cash In",
  CASH_OUT: "Cash Out",
  MOBILE_RECHARGE: "Recharge",
  BILL_PAYMENT: "Customer Payment",
};

export function commissionSummary(db: DbState, user: UserRecord): CommissionSummary {
  const rows = db.commissions.filter((c) => c.agentId === user.id);
  const now = Date.now();
  const todayStart = startOfDay(new Date()).getTime();
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 6 }).getTime();
  const monthStart = startOfMonth(new Date()).getTime();
  const sumSince = (from: number) => rows.filter((c) => Date.parse(c.createdAt) >= from).reduce((s, c) => s + c.amount, 0);

  const byType = new Map<string, { amount: number; count: number }>();
  for (const c of rows) {
    if (Date.parse(c.createdAt) < monthStart) continue;
    const key = COMMISSION_LABEL[c.type] ?? c.type;
    const cur = byType.get(key) ?? { amount: 0, count: 0 };
    cur.amount += c.amount;
    cur.count++;
    byType.set(key, cur);
  }

  return {
    today: sumSince(todayStart),
    week: sumSince(weekStart),
    month: sumSince(monthStart),
    allTime: rows.reduce((s, c) => s + c.amount, 0),
    byType: [...byType.entries()].map(([type, v]) => ({ type, ...v })).sort((a, b) => b.amount - a.amount),
    daily: dayBuckets(30).map((b) => ({
      date: b.label,
      amount: rows.filter((c) => { const x = Date.parse(c.createdAt); return x >= b.start && x < b.end; }).reduce((s, c) => s + c.amount, 0),
    })),
    monthly: monthBuckets(6).map((b) => ({
      month: b.label,
      amount: rows.filter((c) => { const x = Date.parse(c.createdAt); return x >= b.start && x < b.end; }).reduce((s, c) => s + c.amount, 0),
    })),
    recent: rows
      .filter((c) => Date.parse(c.createdAt) <= now)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 12)
      .map((c) => ({ id: c.id, trxId: c.trxId, type: COMMISSION_LABEL[c.type] ?? c.type, base: c.baseAmount, amount: c.amount, createdAt: c.createdAt })),
  };
}

/* ───────────── Merchant ───────────── */

export function merchantDashboard(db: DbState, user: UserRecord): MerchantDashboard {
  const uid = user.id;
  const payments = db.transactions.filter((t) => t.type === "MERCHANT_PAYMENT" && t.receiver.userId === uid);
  const refunds = db.transactions.filter((t) => t.type === "REFUND" && t.sender.userId === uid && t.status === "SUCCESSFUL");

  const summarise = (start: number, end: number) => {
    let revenue = 0, fees = 0, count = 0, successful = 0, failed = 0;
    for (const t of payments) {
      if (!inRange(t, start, end)) continue;
      count++;
      if (ok(t)) {
        successful++;
        revenue += t.amount;
        fees += t.receiverFee;
      } else if (t.status === "FAILED") failed++;
    }
    const refunded = refunds.filter((t) => inRange(t, start, end)).reduce((s, t) => s + t.amount, 0);
    return { revenue, fees, count, successful, failed, refunded };
  };

  const todayStart = startOfDay(new Date()).getTime();
  const today = summarise(todayStart, todayStart + 86_400_000);
  const months = monthBuckets(6);
  const month = summarise(months[5].start, months[5].end);

  const weekly = Array.from({ length: 8 }, (_, i) => {
    const start = startOfWeek(subWeeks(new Date(), 7 - i), { weekStartsOn: 6 });
    const s = summarise(start.getTime(), start.getTime() + 7 * 86_400_000);
    return { week: format(start, "d MMM"), sales: s.revenue, count: s.count };
  });

  const since = Date.now() - 30 * 86_400_000;
  const methods = new Map<PaymentMethod, { amount: number; count: number }>();
  for (const t of payments) {
    if (!ok(t) || ts(t) < since || !t.paymentMethod) continue;
    const cur = methods.get(t.paymentMethod) ?? { amount: 0, count: 0 };
    cur.amount += t.amount;
    cur.count++;
    methods.set(t.paymentMethod, cur);
  }

  const profile = toProfileView(db, user);

  return {
    wallet: toWalletView(walletOf(db, uid)),
    status: user.status as MerchantStatus,
    business: profile.merchant!,
    today: { revenue: today.revenue, orders: today.count, successful: today.successful, failed: today.failed, refunds: today.refunded },
    month: { revenue: month.revenue, expenses: month.fees + month.refunded, net: month.revenue - month.fees - month.refunded, count: month.count },
    pendingPayments: payments.filter((t) => t.status === "PENDING").reduce((s, t) => s + (t.pendingCredit?.amount ?? 0), 0),
    daily: dayBuckets(14).map((b) => {
      const s = summarise(b.start, b.end);
      return { date: b.label, sales: s.revenue, count: s.count };
    }),
    weekly,
    monthly: months.map((b) => {
      const s = summarise(b.start, b.end);
      return { month: b.label, revenue: s.revenue, refunds: s.refunded, count: s.count };
    }),
    paymentMethods: (["QR_SCAN", "MERCHANT_ID", "PAYMENT_LINK", "ONLINE_CHECKOUT"] as PaymentMethod[])
      .map((method) => ({ method, amount: methods.get(method)?.amount ?? 0, count: methods.get(method)?.count ?? 0 }))
      .filter((m) => m.count > 0),
    recent: [...payments].sort(byNewest).slice(0, 8).map((t) => toTransactionView(db, t, uid)),
  };
}

/* ───────────── Admin ───────────── */

export function adminStats(db: DbState): AdminStats {
  const users = db.users.filter((u) => u.role !== "ADMIN");
  const todayStart = startOfDay(new Date()).getTime();
  const monthStart = startOfMonth(new Date()).getTime();
  // Settlements are internal float/bank movements, not customer volume.
  const nonInternal = db.transactions.filter((t) => t.type !== "SETTLEMENT");

  const today = nonInternal.filter((t) => ts(t) >= todayStart);
  const month = nonInternal.filter((t) => ts(t) >= monthStart);
  const since = Date.now() - 30 * 86_400_000;
  const byType = new Map<TransactionType, { volume: number; count: number }>();
  for (const t of nonInternal) {
    if (ts(t) < since || !ok(t)) continue;
    const cur = byType.get(t.type) ?? { volume: 0, count: 0 };
    cur.volume += t.amount;
    cur.count++;
    byType.set(t.type, cur);
  }

  return {
    users: {
      total: users.length,
      personal: users.filter((u) => u.role === "PERSONAL").length,
      agents: users.filter((u) => u.role === "AGENT").length,
      merchants: users.filter((u) => u.role === "MERCHANT").length,
      suspended: users.filter((u) => u.status === "SUSPENDED").length,
    },
    pendingVerifications: {
      agents: users.filter((u) => u.role === "AGENT" && (u.status === "APPLICATION_SUBMITTED" || u.status === "UNDER_REVIEW")).length,
      merchants: users.filter((u) => u.role === "MERCHANT" && (u.status === "PENDING" || u.status === "UNDER_REVIEW")).length,
    },
    today: {
      volume: today.filter(ok).reduce((s, t) => s + t.amount, 0),
      count: today.length,
      failed: today.filter((t) => t.status === "FAILED").length,
      fees: today.filter(ok).reduce((s, t) => s + t.senderFee + t.receiverFee, 0),
    },
    month: { volume: month.filter(ok).reduce((s, t) => s + t.amount, 0), count: month.length },
    openDisputes: db.disputes.filter((d) => d.status === "OPEN" || d.status === "INVESTIGATING").length,
    daily: dayBuckets(14).map((b) => {
      const inDay = nonInternal.filter((t) => inRange(t, b.start, b.end));
      return { date: b.label, volume: inDay.filter(ok).reduce((s, t) => s + t.amount, 0), count: inDay.length };
    }),
    byType: [...byType.entries()].map(([type, v]) => ({ type, ...v })).sort((a, b) => b.volume - a.volume),
  };
}
