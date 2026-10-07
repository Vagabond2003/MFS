#!/usr/bin/env node
/**
 * Large synthetic dataset for offline evaluation: training the churn model
 * (ml/) and the fairness check. It is never loaded by the app and never
 * written to a database — this script has no database code at all. It writes
 * a JSON file in the same shape as `seed-synthetic.mjs --emit`, with the
 * transactions in a gzipped JSON-lines file next to it (one string would be
 * too large for Node; gzip keeps ~500 MB down to a fraction), so
 * scripts/lib/synthetic-state.mjs turns it into a DbState.
 *
 *   node --max-old-space-size=8192 scripts/generate-large.mjs        → data/large/synthetic.json + transactions.jsonl.gz
 *   … --out=FILE                                                     another path
 *
 * What it simulates (fixed seed, fixed end date, so every run is identical):
 *   1,600 merchants, 80 agents and 4,000 customers in 8 districts over 330 days.
 *
 *   Merchant churn has a ground-truth process that the models never see:
 *   each merchant has a daily hazard of deciding to leave, raised by short
 *   tenure, small size, customers concentrated in a few people, few repeat
 *   customers, failed payments and refunds, a category effect, and an
 *   unobserved random "frailty". Once a merchant decides, 65% fade out over
 *   10–45 days (more failures and refunds on the way) and 35% stop abruptly.
 *   8% of those who stop come back 20–60 days later. Merchants who stay
 *   sometimes have a 7–20 day dip (holidays, repairs) that looks like a
 *   decline but isn't. District has no effect on the hazard.
 *
 *   Agents serve the customers of their district; 10 agents, picked at random
 *   regardless of district or size, carry a planted pattern for the last 55
 *   days (near-limit cash-outs, off-hours bursts, or repeated customers).
 *
 * The ground truth is written under `truth` (for checking, never as a feature).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { gzipSync } from "node:zlib";

process.removeAllListeners("warning");
process.on("warning", (w) => w.code !== "MODULE_TYPELESS_PACKAGE_JSON" && console.warn(w.message));
const { computeFees } = await import("../src/services/mock/policy.ts");

const OUT = process.argv.find((a) => a.startsWith("--out="))?.slice(6) ?? "data/large/synthetic.json";

/* ───────────── Randomness and calendar ───────────── */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261008);
const between = (a, b) => a + rand() * (b - a);
const int = (a, b) => Math.floor(between(a, b + 1));
const chance = (p) => rand() < p;
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
function gauss() {
  const u = 1 - rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}
function poisson(lambda) {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gauss()));
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > limit);
  return k - 1;
}
function weighted(weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  let x = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x <= 0) return i;
  }
  return weights.length - 1;
}
const taka = (median, spread, min, max) => Math.round(Math.min(max, Math.max(min, Math.exp(Math.log(median) + spread * gauss())))) * 100;

const DHAKA_MS = 6 * 3_600_000;
const DAY_MS = 86_400_000;
const NOW = Date.parse("2026-10-01T06:00:00Z"); // noon in Dhaka; history ends here
const TODAY = Math.floor((NOW + DHAKA_MS) / DAY_MS);
const DAYS = 330;
const MERCHANTS = 1_600;
const CUSTOMERS = 4_000;
const FIRST_DAY = TODAY - DAYS + 1;
const at = (day, hour, minute = 0, second = 0) => day * DAY_MS - DHAKA_MS + hour * 3_600_000 + minute * 60_000 + second * 1000;
const dow = (day) => new Date(day * DAY_MS).getUTCDay();
const dom = (day) => new Date(day * DAY_MS).getUTCDate();
const iso = (ms) => new Date(ms).toISOString();

/* ───────────── Reference data ───────────── */

const DISTRICTS = { Dhaka: 0.3, Chattogram: 0.16, Gazipur: 0.1, Narayanganj: 0.08, Sylhet: 0.09, Rajshahi: 0.09, Khulna: 0.09, Cumilla: 0.09 };
const CATEGORIES = {
  // weight, median payments a day, churn log-hazard effect, amount (median, spread, min, max taka)
  GROCERY: { w: 0.24, rate: 1.6, effect: -0.2, amount: [900, 0.6, 50, 9_000] },
  RESTAURANT: { w: 0.2, rate: 1.4, effect: 0.1, amount: [650, 0.5, 80, 6_000] },
  PHARMACY: { w: 0.12, rate: 1.0, effect: -0.3, amount: [550, 0.6, 50, 6_000] },
  RETAIL: { w: 0.14, rate: 0.6, effect: 0, amount: [2_200, 0.6, 200, 20_000] },
  SERVICES: { w: 0.1, rate: 0.6, effect: 0, amount: [900, 0.5, 100, 8_000] },
  ECOMMERCE: { w: 0.08, rate: 0.8, effect: 0.3, amount: [1_800, 0.5, 200, 15_000] },
  OTHER: { w: 0.12, rate: 0.7, effect: 0, amount: [450, 0.6, 30, 5_000] },
};
const DOW = [1.0, 0.95, 0.95, 1.0, 1.15, 1.25, 1.1]; // Sun..Sat
const H = (peaks) => Array.from({ length: 24 }, (_, h) => peaks.reduce((s, [c, w, width]) => s + w * Math.exp(-((h - c) ** 2) / (2 * width ** 2)), 0) + (h >= 8 && h <= 22 ? 0.05 : 0.002));
const SHOP_HOURS = H([[12, 0.9, 2.2], [19, 1, 2]]);
const AGENT_HOURS = H([[11, 0.7, 2], [18.5, 1, 1.8]]);
const NAMES = ["Rahim", "Karim", "Nusrat", "Farhana", "Tanvir", "Sadia", "Imran", "Mehedi", "Shirin", "Arif", "Jannat", "Sumon", "Rubel", "Lamia", "Fahim", "Tania"];
const SURNAMES = ["Hossain", "Rahman", "Islam", "Ahmed", "Akter", "Khan", "Chowdhury", "Uddin", "Sarkar", "Begum"];

/* ───────────── Records ───────────── */

const out = { users: [], personalProfiles: [], agentProfiles: [], merchantProfiles: [], merchantBusinesses: [], statusHistory: [], wallets: [], transactions: [], commissions: [] };
const truth = { merchants: {}, agents: {} };
let seq = 0;
const id = (kind) => `lg_${kind}_${(++seq).toString(36).padStart(7, "0")}`;
let phoneSeq = 0;
const phone = () => `019${String(10_000_000 + ++phoneSeq).slice(-8)}`;
let trxSeq = 0;
const trxId = () => `LG${(++trxSeq).toString(36).toUpperCase().padStart(8, "0")}`;
const HASH = "pbkdf2_sha256$60000$iMw//H+lNAadzlFcud7B1g==$FpVghehLRROJEBtlct5Z1plO3VWKc2Pwns87Q8Pd4/M=";

function addUser(role, status, createdMs) {
  const createdAt = iso(createdMs);
  const user = {
    id: id("usr"), role, name: `${pick(NAMES)} ${pick(SURNAMES)}`, phone: phone(), email: null, passwordHash: HASH, pinHash: HASH, status,
    twoFactorEnabled: false, language: "en", isDemo: true, failedLoginCount: 0, lockedUntil: null, pinFailedCount: 0, pinLockedUntil: null,
    createdAt, updatedAt: createdAt, lastLoginAt: null,
  };
  out.users.push(user);
  return user;
}

function post(p) {
  const t = {
    id: id("txn"), trxId: trxId(), type: p.type, status: p.status ?? "SUCCESSFUL", amount: p.amount, senderFee: p.senderFee ?? 0, receiverFee: 0,
    commission: null, sender: p.sender, receiver: p.receiver, description: p.description, reference: null, paymentMethod: p.paymentMethod ?? null,
    relatedTrxId: p.relatedTrxId ?? null, refundedAmount: 0, pendingHold: null, pendingCredit: null, cashEffect: p.status === "FAILED" ? null : p.cashEffect ?? null,
    settleAt: null, failureReason: p.failureReason ?? null, createdAt: iso(p.ms), completedAt: p.status === "FAILED" ? null : iso(p.ms), settlementDirection: null,
  };
  out.transactions.push(t);
  return t;
}

/* ───────────── Customers ───────────── */

const districtNames = Object.keys(DISTRICTS);
const customersIn = Object.fromEntries(districtNames.map((d) => [d, []]));
for (let i = 0; i < CUSTOMERS; i++) {
  const district = districtNames[weighted(Object.values(DISTRICTS))];
  const verified = chance(0.9);
  const user = addUser("PERSONAL", verified ? "VERIFIED" : "PENDING_VERIFICATION", at(FIRST_DAY - int(30, 700), 10));
  out.personalProfiles.push({ userId: user.id, dateOfBirth: "1995-01-01", address: district, nidNumber: null, selfieStatus: verified ? "VERIFIED" : "NOT_SUBMITTED" });
  out.wallets.push({ id: id("wal"), userId: user.id, currency: "BDT", available: 0, savings: 0, pending: 0, cashInHand: null, version: 0, updatedAt: iso(NOW) });
  const c = { user, district, level: Math.exp(0.45 * gauss()), agents: [], party: { userId: user.id, name: user.name, account: user.phone, kind: "PERSONAL" } };
  customersIn[district].push(c);
}

/* ───────────── Agents ───────────── */

const agents = [];
for (const [district, w] of Object.entries(DISTRICTS)) {
  for (let i = 0; i < Math.max(3, Math.round(80 * w)); i++) {
    const user = addUser("AGENT", "VERIFIED", at(FIRST_DAY - int(60, 900), 10));
    const outletName = `${pick(SURNAMES)} Telecom ${i + 1}`;
    out.agentProfiles.push({
      userId: user.id, agentCode: `AG-L${String(agents.length + 1).padStart(4, "0")}`, dateOfBirth: "1990-01-01", address: district, outletName, businessAddress: district,
      emergencyName: "x", emergencyRelation: "Other", emergencyPhone: user.phone, nidNumber: "1000000000", reviewNote: null, district, area: district,
    });
    const a = { user, district, size: Math.exp(0.6 * gauss()), cash: 200_000_000, anomaly: null, party: { userId: user.id, name: outletName, account: user.phone, kind: "AGENT" } };
    agents.push(a);
  }
}
// Each customer uses one or two agents of their district, busier outlets more often.
for (const [district, list] of Object.entries(customersIn)) {
  const local = agents.filter((a) => a.district === district);
  for (const c of list) for (let k = 0; k < (chance(0.4) ? 2 : 1); k++) c.agents.push(local[weighted(local.map((a) => a.size))]);
}
// Planted patterns on 10 agents chosen at random.
const ANOMALIES = ["NEAR_LIMIT_CASH_OUTS", "OFF_HOURS_ACTIVITY", "REPEATED_CUSTOMER"];
const shuffled = [...agents].sort(() => rand() - 0.5);
shuffled.slice(0, 10).forEach((a, i) => {
  a.anomaly = ANOMALIES[i % 3];
  const verifiedLocals = customersIn[a.district].filter((c) => c.user.status === "VERIFIED");
  a.accomplices = Array.from({ length: int(2, 3) }, () => pick(verifiedLocals));
});
const ANOMALY_FROM = TODAY - 54;

/* ───────────── Merchants ───────────── */

const merchants = [];
const categoryNames = Object.keys(CATEGORIES);
for (let i = 0; i < MERCHANTS; i++) {
  const district = districtNames[weighted(Object.values(DISTRICTS))];
  const category = categoryNames[weighted(Object.values(CATEGORIES).map((c) => c.w))];
  const cat = CATEGORIES[category];
  const joinsLater = chance(0.3);
  const startDay = joinsLater ? FIRST_DAY + int(0, DAYS - 60) : FIRST_DAY - int(60, 700);
  const status = chance(0.97) ? "VERIFIED" : "UNDER_REVIEW";
  const user = addUser("MERCHANT", status, at(startDay, 10));
  const size = Math.exp(0.6 * gauss());
  const pool = customersIn[district];
  const regularsCount = Math.min(pool.length, Math.max(2, Math.round((4 + 22 * Math.sqrt(size)) * between(0.5, 1.5))));
  const regulars = Array.from({ length: regularsCount }, () => pick(pool));
  const zipf = between(0.3, 1.6);
  const regularWeights = regulars.map((_, k) => 1 / (k + 1) ** zipf);
  const topShare = regularWeights[0] / regularWeights.reduce((s, x) => s + x, 0);
  const walkIn = between(0.1, 0.5);
  const failProp = Math.min(0.15, 0.015 * Math.exp(0.6 * gauss()));
  const refundProp = Math.min(0.1, 0.008 * Math.exp(0.7 * gauss()));
  const frailty = 0.6 * gauss();
  const logHazard = 1.6 * (topShare - 0.35) - 0.6 * Math.log(size) + 0.9 * (walkIn - 0.3) + 25 * (failProp - 0.015) + 30 * (refundProp - 0.008) + cat.effect + frailty;
  const businessName = `${pick(SURNAMES)} ${category.charAt(0)}${category.slice(1).toLowerCase()} ${i + 1}`;
  const biz = {
    id: id("biz"), userId: user.id, merchantId: `MR-L${String(i + 1).padStart(5, "0")}`, businessName, category, businessAddress: district,
    registrationNumber: "-", tradeLicenseNumber: "-", taxId: null, settlementAccount: "City Bank •1234", district, area: district,
  };
  out.merchantBusinesses.push(biz);
  out.merchantProfiles.push({ userId: user.id, ownerName: user.name, ownerNidNumber: "1000000000", reviewNote: null });
  out.wallets.push({ id: id("wal"), userId: user.id, currency: "BDT", available: 0, savings: 0, pending: 0, cashInHand: null, version: 0, updatedAt: iso(NOW) });
  const m = {
    user, district, category, cat, startDay, size, regulars, regularWeights, walkIn, failProp, refundProp, logHazard,
    state: "ACTIVE", declineFrom: 0, stopDay: 0, returnDay: 0, dipUntil: 0, events: [],
    party: { userId: user.id, name: businessName, account: biz.merchantId, kind: "MERCHANT" },
  };
  merchants.push(m);
  truth.merchants[user.id] = { category, district, startDay: startDay - FIRST_DAY, size: +size.toFixed(3), topShare: +topShare.toFixed(3), walkIn: +walkIn.toFixed(3), failProp: +failProp.toFixed(4), refundProp: +refundProp.toFixed(4), events: m.events };
}

/* ───────────── Day by day ───────────── */

const BASE_HAZARD = 0.0009;
const pendingRefunds = []; // { day, merchant, payment }

for (let day = FIRST_DAY; day <= TODAY; day++) {
  const d = dow(day);
  const monthStart = dom(day) <= 5;
  const last = day === TODAY;
  const before = (ms) => !last || ms <= NOW - 60_000;

  // Merchants
  for (const m of merchants) {
    if (day < m.startDay) continue;
    // State changes.
    if (m.state === "ACTIVE") {
      const age = day - m.startDay;
      const hazard = BASE_HAZARD * Math.exp(m.logHazard) * (1 + 1.5 * Math.exp(-age / 45));
      if (chance(hazard)) {
        const gradual = chance(0.65);
        const length = gradual ? int(10, 45) : 0;
        m.state = gradual ? "DECLINING" : "STOPPED";
        m.declineFrom = day;
        m.stopDay = day + length;
        m.events.push({ decided: day - FIRST_DAY, stops: m.stopDay - FIRST_DAY, gradual });
      } else if (day >= m.dipUntil && chance(1 / 120)) {
        m.dipUntil = day + int(7, 20);
      }
    }
    if (m.state === "DECLINING" && day >= m.stopDay) m.state = "STOPPED";
    if (m.state === "STOPPED" && !m.returnDay && day === m.stopDay) {
      if (chance(0.08)) {
        m.returnDay = day + int(20, 60);
        m.events[m.events.length - 1].returns = m.returnDay - FIRST_DAY;
      } else m.returnDay = -1;
    }
    if (m.state === "STOPPED" && m.returnDay > 0 && day >= m.returnDay) {
      m.state = "ACTIVE";
      m.returnDay = 0;
    }

    let activity = 1;
    let fail = m.failProp;
    let refund = m.refundProp;
    if (m.state === "STOPPED") activity = 0;
    else if (m.state === "DECLINING") {
      activity = 1 - 0.85 * ((day - m.declineFrom) / Math.max(1, m.stopDay - m.declineFrom));
      fail *= 2.5;
      refund *= 2;
    } else if (day < m.dipUntil) activity = 0.35;
    if (!activity) continue;

    const n = poisson(m.cat.rate * m.size * DOW[d] * (monthStart ? 1.15 : 1) * activity);
    for (let k = 0; k < n; k++) {
      const ms = at(day, weighted(SHOP_HOURS), int(0, 59), int(0, 59));
      if (!before(ms)) continue;
      const c = chance(m.walkIn) ? pick(customersIn[m.district]) : m.regulars[weighted(m.regularWeights)];
      const amount = taka(...m.cat.amount);
      const p = {
        type: "MERCHANT_PAYMENT", sender: c.party, receiver: m.party, amount, senderFee: computeFees("MERCHANT_PAYMENT", amount).senderFee, ms,
        paymentMethod: chance(0.6) ? "QR_SCAN" : "MERCHANT_ID", description: `Payment to ${m.party.name}`,
      };
      if (chance(fail)) {
        post({ ...p, status: "FAILED", failureReason: "Customer cancelled at the counter" });
        continue;
      }
      const t = post(p);
      if (chance(refund)) pendingRefunds.push({ day: day + int(1, 5), m, t });
    }
  }
  // Refunds due today.
  for (let i = pendingRefunds.length - 1; i >= 0; i--) {
    const r = pendingRefunds[i];
    if (r.day !== day) continue;
    pendingRefunds.splice(i, 1);
    const ms = at(day, int(10, 19), int(0, 59));
    if (!before(ms)) continue;
    const amount = chance(0.6) ? r.t.amount : Math.max(100, Math.round(r.t.amount / 200) * 100);
    post({ type: "REFUND", sender: r.m.party, receiver: r.t.sender, amount, ms, relatedTrxId: r.t.trxId, description: "Refund: Order cancelled" });
    r.t.refundedAmount += amount;
    if (r.t.refundedAmount >= r.t.amount) r.t.status = "REFUNDED";
  }

  // Customers at agents.
  for (const list of Object.values(customersIn)) {
    for (const c of list) {
      for (let k = poisson(0.05 * c.level * (monthStart ? 2 : 0.85)); k > 0; k--) counter(c, pick(c.agents), "CASH_OUT", taka(monthStart ? 4_500 : 2_800, 0.55, 100, 20_000), day, weighted(AGENT_HOURS));
      for (let k = poisson(0.03 * c.level); k > 0; k--) counter(c, pick(c.agents), "CASH_IN", taka(2_500, 0.6, 100, 25_000), day, weighted(AGENT_HOURS));
    }
  }
  for (const a of agents) {
    for (let k = poisson(0.6 * a.size); k > 0; k--) {
      const ms = at(day, weighted(AGENT_HOURS), int(0, 59), int(0, 59));
      if (!before(ms)) continue;
      const amount = chance(0.7) ? taka(150, 0.6, 20, 1_000) : taka(1_500, 0.5, 100, 15_000);
      const recharge = amount <= 100_000 && chance(0.7);
      post({
        type: recharge ? "MOBILE_RECHARGE" : "BILL_PAYMENT", sender: a.party, receiver: { userId: null, name: recharge ? "Grameenphone" : "DESCO Electricity", account: "-", kind: recharge ? "OPERATOR" : "BILLER" },
        amount, ms, cashEffect: { userId: a.user.id, delta: amount }, description: recharge ? "Recharge for customer" : "Bill payment for customer",
      });
      a.cash += amount;
    }
    // Planted patterns.
    if (!a.anomaly || day < ANOMALY_FROM) continue;
    if (a.anomaly === "NEAR_LIMIT_CASH_OUTS" && [0, 1, 3].includes(d)) {
      for (const c of a.accomplices) for (let k = poisson(0.8); k > 0; k--) counter(c, a, "CASH_OUT", int(24_000, 24_540) * 100, day, int(15, 20), true);
    } else if (a.anomaly === "OFF_HOURS_ACTIVITY" && (d === 2 || d === 5)) {
      const hour = int(1, 3);
      for (let k = int(5, 8); k > 0; k--) counter(chance(0.8) ? pick(a.accomplices) : pick(customersIn[a.district]), a, chance(0.5) ? "CASH_OUT" : "CASH_IN", taka(5_000, 0.3, 1_000, 9_500), day, hour, true);
    } else if (a.anomaly === "REPEATED_CUSTOMER" && (d === 1 || d === 4)) {
      for (const c of a.accomplices.slice(0, 2)) for (let k = int(3, 4); k > 0; k--) counter(c, a, chance(0.5) ? "CASH_OUT" : "CASH_IN", taka(3_000, 0.4, 500, 9_000), day, weighted(AGENT_HOURS), true);
    }
  }
}

function counter(c, a, type, amount, day, hour, planted = false) {
  const ms = at(day, hour, int(0, 59), int(0, 59));
  if (day === TODAY && ms > NOW - 60_000) return;
  if (type === "CASH_OUT") {
    const gross = amount + computeFees("AGENT_CASH_OUT", amount).senderFee;
    if (gross > (c.user.status === "VERIFIED" ? 2_500_000 : 500_000)) return;
    const failed = !planted && chance(0.01);
    post({ type, sender: c.party, receiver: a.party, amount, senderFee: gross - amount, ms, status: failed ? "FAILED" : "SUCCESSFUL", failureReason: failed ? "Customer did not confirm the one-time code" : null, cashEffect: { userId: a.user.id, delta: -amount }, description: "Cash Out at agent" });
    if (!failed) a.cash -= amount;
  } else {
    post({ type, sender: a.party, receiver: c.party, amount, ms, cashEffect: { userId: a.user.id, delta: amount }, description: "Cash In at agent" });
    a.cash += amount;
  }
}

/* ───────────── Output ───────────── */

for (const a of agents) {
  out.wallets.push({ id: id("wal"), userId: a.user.id, currency: "BDT", available: 50_000_000, savings: 0, pending: 0, cashInHand: Math.max(0, a.cash), version: 0, updatedAt: iso(NOW) });
  truth.agents[a.user.id] = { district: a.district, size: +a.size.toFixed(3), anomaly: a.anomaly };
}
out.transactions.sort((x, y) => (x.createdAt < y.createdAt ? -1 : x.createdAt > y.createdAt ? 1 : 0));

const churned = Object.values(truth.merchants).filter((m) => m.events.length).length;
mkdirSync(dirname(OUT), { recursive: true });
const txFile = join(dirname(OUT), "transactions.jsonl.gz");
const chunks = [];
for (let i = 0; i < out.transactions.length; i += 10_000) chunks.push(Buffer.from(out.transactions.slice(i, i + 10_000).map((t) => JSON.stringify(t)).join("\n") + "\n"));
writeFileSync(txFile, gzipSync(Buffer.concat(chunks), { level: 6 }));
const count = out.transactions.length;
out.transactions = [];
writeFileSync(
  OUT,
  JSON.stringify({
    generatedAt: iso(NOW),
    ...out,
    transactionsFile: basename(txFile),
    demoRecords: { users: [], agentProfiles: [], merchantBusinesses: [], wallets: [] },
    specials: {},
    truth,
    meta: { firstDay: iso(at(FIRST_DAY, 0)), days: DAYS, merchants: merchants.length, agents: agents.length, customers: CUSTOMERS, seed: 20261008 },
  }),
);
console.log(`Wrote ${OUT} and ${txFile}: ${out.users.length} users (${merchants.length} merchants, ${agents.length} agents), ${count} transactions over ${DAYS} days; ${churned} merchants decided to leave at least once.`);
