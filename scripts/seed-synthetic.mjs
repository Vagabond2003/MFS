#!/usr/bin/env node
/**
 * Synthetic history for the merchant & agent intelligence features.
 *
 *   node --env-file=.env.local scripts/seed-synthetic.mjs              seed (refuses if synthetic rows exist)
 *   node --env-file=.env.local scripts/seed-synthetic.mjs --reset      remove synthetic rows only
 *   node --env-file=.env.local scripts/seed-synthetic.mjs --dry-run    generate and validate, write nothing
 *   node scripts/seed-synthetic.mjs --offline --emit=FILE              no database: write the data as JSON
 *                                                                      (used by scripts/check-intelligence.mjs)
 *
 * What it creates (all ids prefixed `syn_`, all users is_demo = true):
 *   4 personal customers, 4 agents and 4 merchants across 4 districts, with 90
 *   days of transactions ending today. With the seed.sql accounts that makes 5 of
 *   each role — kept small on purpose, since the app loads the whole database into
 *   memory. Fees, commissions and limits come from
 *   src/services/mock/policy.ts, and every posting is replayed with the same
 *   balance rules as ledger.post(), so final wallets satisfy the ledger
 *   invariants (integer, never negative). Notifications and audit logs are not
 *   generated for history.
 *
 * The existing demo agent (usr_sabbir_tele) and merchant (usr_nafiztong) get a
 * district and synthetic history on top of their current balances; names,
 * credentials and status are never touched. --reset removes the history and
 * any later app transaction with a synthetic user, reverses their effect on the
 * remaining accounts' balances and clears the demo district.
 *
 * Planted patterns: weekly seasonality, cash-out spikes on days 1–5 of the month,
 * 2 declining merchants, 2 agents with abnormal patterns (near-limit cash-outs and
 * repeated customers; off-hours bursts), 1 fast-growing agent, and Gazipur as a
 * district whose single agent can't keep up with demand.
 *
 * Deterministic: a fixed-seed RNG; days are anchored to the run date (Asia/Dhaka).
 */
import { writeFileSync } from "node:fs";
import postgres from "postgres";

// The fee/limit rules are imported straight from the app's TypeScript (Node runs it natively).
// Node notes that package.json has no "type"; that's expected here, so keep the output clean.
process.removeAllListeners("warning");
process.on("warning", (w) => w.code !== "MODULE_TYPELESS_PACKAGE_JSON" && console.warn(w.message));
const { computeFees, OPERATION_POLICY, PERSONAL_LIMITS } = await import("../src/services/mock/policy.ts");

const args = new Set(process.argv.slice(2).filter((a) => !a.startsWith("--emit=")));
const EMIT = process.argv.find((a) => a.startsWith("--emit="))?.slice("--emit=".length) ?? null;
const RESET = args.has("--reset");
const DRY = args.has("--dry-run") || args.has("--offline");
const OFFLINE = args.has("--offline");

const DEMO_AGENT = "usr_sabbir_tele";
const DEMO_MERCHANT = "usr_nafiztong";
const DEMO_ADMIN = "usr_demo_admin";
/** Hashes of the documented demo password (demo@1234) and PIN (24680), as in supabase/seed.sql. */
const DEMO_PASSWORD_HASH = "pbkdf2_sha256$60000$iMw//H+lNAadzlFcud7B1g==$FpVghehLRROJEBtlct5Z1plO3VWKc2Pwns87Q8Pd4/M=";
const DEMO_PIN_HASH = "pbkdf2_sha256$60000$C0M1D0VJl8h0Kz6N4rsT9g==$Hz5IHuXi2Af/Mb1yJh5zKTTr5PVQKBnrG19L/gW6gx8=";

/* ───────────── Deterministic randomness ───────────── */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261004);
const between = (a, b) => a + rand() * (b - a);
const int = (a, b) => Math.floor(between(a, b + 1));
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const chance = (p) => rand() < p;
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
/** Whole-taka amount (in poisha) from a log-normal around `median`, clamped to [min, max] taka. */
function taka(median, spread, min, max) {
  const v = Math.exp(Math.log(median) + spread * gauss());
  return Math.round(Math.min(max, Math.max(min, v))) * 100;
}
const TRX_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/* ───────────── Calendar (Asia/Dhaka, UTC+6, no DST) ───────────── */

const DHAKA_MS = 6 * 3_600_000;
const DAY_MS = 86_400_000;
const NOW = Date.now();
const TODAY = Math.floor((NOW + DHAKA_MS) / DAY_MS); // Dhaka day number
const DAYS = 90;
const FIRST_DAY = TODAY - (DAYS - 1);
const at = (day, hour, minute = 0, second = 0) => day * DAY_MS - DHAKA_MS + hour * 3_600_000 + minute * 60_000 + second * 1000;
const dow = (day) => new Date(day * DAY_MS).getUTCDay(); // 0 = Sunday; Friday/Saturday are the weekend
const dom = (day) => new Date(day * DAY_MS).getUTCDate();
const iso = (ms) => new Date(ms).toISOString();

/* ───────────── Reference data ───────────── */

const DISTRICTS = {
  Dhaka: ["Mirpur", "Dhanmondi", "Uttara", "Mohammadpur", "Badda", "Jatrabari"],
  Chattogram: ["Agrabad", "Panchlaish", "Halishahar", "Chawkbazar"],
  Gazipur: ["Tongi", "Board Bazar", "Joydebpur", "Konabari"],
  Narayanganj: ["Chashara", "Fatullah", "Siddhirganj"],
  Sylhet: ["Zindabazar", "Amberkhana", "Shibganj"],
  Rajshahi: ["Shaheb Bazar", "Uposhohor", "Kazla"],
  Khulna: ["Sonadanga", "Boyra", "Khalishpur"],
  Cumilla: ["Kandirpar", "Tomsom Bridge", "Rajganj"],
};
// 4 customers, 4 agents and 4 merchants: with Ashraful, Sabbir_Tele and Nafiztong
// (seed.sql, all in Dhaka) that is 5 accounts per role. Gazipur has the most
// customers for its one agent and one shop — the underserved district.
const CUSTOMERS_PER_DISTRICT = { Chattogram: 1, Gazipur: 2, Narayanganj: 1 };
const AGENTS_PER_DISTRICT = { Dhaka: 1, Chattogram: 1, Gazipur: 1, Narayanganj: 1 };
const MERCHANTS = {
  Dhaka: ["RESTAURANT"],
  Chattogram: ["GROCERY"],
  Gazipur: ["GROCERY"],
  Narayanganj: ["PHARMACY"],
};
const FIRST = ["Rahim", "Karim", "Nusrat", "Farhana", "Tanvir", "Sadia", "Imran", "Mehedi", "Shirin", "Arif", "Jannat", "Sumon", "Rubel", "Lamia", "Fahim", "Tania", "Rakib", "Mitu", "Hasan", "Ayesha", "Nafis", "Shuvo", "Priya", "Ritu", "Jamal", "Kamrul", "Shakil", "Munni", "Rasel", "Sharmin", "Tamim", "Anika", "Habib", "Rokeya", "Saiful", "Nadia", "Faruk", "Shapla", "Masud", "Keya"];
const LAST = ["Hossain", "Rahman", "Islam", "Ahmed", "Akter", "Khan", "Chowdhury", "Uddin", "Sarkar", "Begum", "Mia", "Sheikh", "Roy", "Das", "Haque", "Talukder", "Mollah", "Bhuiyan", "Sikder", "Biswas"];
const BUSINESS = {
  RESTAURANT: ["Kacchi House", "Spice Garden", "Biriyani Bari", "Tehari Ghar", "Rooftop Grill", "Bhai Bhai Hotel", "Café Mithai", "Fuchka Corner", "Bhorta Bhaat", "Chai Adda"],
  GROCERY: ["Fresh Bazar", "Daily Needs", "Ma Grocery", "Green Basket", "Neighbour Mart", "Ghorer Bazar", "Sobji Mela", "Ration Point"],
  RETAIL: ["Style Point", "Shoe Palace", "Gadget Hut", "Saree Kutir", "Home Decor BD"],
  ECOMMERCE: ["ShopKoro Online", "Deshi Bazar Online", "Kinbo Online"],
  PHARMACY: ["Shefa Pharmacy", "Care Pharma", "Health Plus Pharmacy", "Arogya Medicine Corner"],
  SERVICES: ["Quick Fix Mobile Repair", "Sparkle Laundry", "CityCut Salon", "Fixit Electric"],
  OTHER: ["Book Corner", "Stationery House", "Flower Shop", "Toy Land", "Gift Box"],
};
const BANKS = ["City Bank", "BRAC Bank", "Dutch-Bangla Bank", "Eastern Bank", "Prime Bank", "Islami Bank"];
const OPERATORS = { 7: "Grameenphone", 3: "Grameenphone", 8: "Robi", 9: "Banglalink", 4: "Banglalink", 6: "Airtel", 5: "Teletalk" };
const BILLERS = [
  { id: "desco", name: "DESCO Electricity" },
  { id: "dpdc", name: "DPDC Electricity" },
  { id: "titas", name: "Titas Gas" },
  { id: "wasa", name: "Dhaka WASA" },
  { id: "metrofiber", name: "MetroFiber Internet (demo)" },
  { id: "skytv", name: "SkyView Cable TV (demo)" },
  { id: "greenfield", name: "Greenfield School (demo)" },
];
const MFS = ["bKash", "Nagad", "Rocket", "Upay"];
const AGENT_FLOAT_BANK = { userId: null, name: "Demo Bank — Agent Float", account: "•••• 9020", kind: "BANK" };
const DEMO_BANK = { userId: null, name: "Demo Bank — Savings", account: "•••• 4521", kind: "BANK" };

// Day-of-week multipliers (Sun..Sat). Friday/Saturday are the weekend in Bangladesh.
const DOW = {
  RESTAURANT: [0.9, 0.85, 0.85, 0.95, 1.3, 1.45, 1.1],
  GROCERY: [0.95, 0.9, 0.9, 0.95, 1.05, 1.35, 1.2],
  RETAIL: [1.0, 1.0, 1.0, 1.05, 1.2, 0.65, 1.1],
  ECOMMERCE: [1.1, 1.05, 1.05, 1.0, 1.0, 0.85, 0.95],
  PHARMACY: [1.0, 1.0, 1.0, 1.0, 1.05, 0.9, 1.0],
  SERVICES: [1.05, 1.0, 1.0, 1.05, 1.15, 0.6, 1.1],
  OTHER: [1.0, 1.0, 1.0, 1.05, 1.2, 0.7, 1.05],
  CASH_OUT: [1.15, 1.0, 1.0, 1.05, 1.3, 0.6, 0.85],
  CASH_IN: [1.05, 1.05, 1.0, 1.0, 1.1, 0.7, 0.95],
};
// Hour-of-day weights (0..23, Dhaka time).
const H = (peaks) => Array.from({ length: 24 }, (_, h) => peaks.reduce((s, [c, w, width]) => s + w * Math.exp(-((h - c) ** 2) / (2 * width ** 2)), 0) + (h >= 8 && h <= 22 ? 0.05 : 0.002));
const HOURS = {
  RESTAURANT: H([[13.5, 1, 1.2], [21, 1.3, 1.3]]),
  GROCERY: H([[10, 1, 1.5], [18.5, 1.1, 1.6]]),
  DEFAULT: H([[12, 0.8, 2], [18, 1, 2.2]]),
  AGENT: H([[11, 0.7, 2], [18.5, 1, 1.8]]),
};
const hourIn = (weights) => weighted(weights);

/* ───────────── Database / base state ───────────── */

const sqlClient = OFFLINE ? null : postgres(process.env.DATABASE_URL ?? "", { prepare: false, ssl: "require", max: 1, onnotice: () => {} });
if (!OFFLINE && !process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run with: node --env-file=.env.local scripts/seed-synthetic.mjs");
  process.exit(1);
}

async function columnsOf(table) {
  const rows = await sqlClient`select column_name from information_schema.columns where table_schema = 'public' and table_name = ${table}`;
  return new Set(rows.map((r) => r.column_name));
}

async function baseState() {
  if (OFFLINE) {
    return {
      phones: new Set(["01300000000", "01700000001", "01814557644", "01773519331"]),
      emails: new Set(["admin@example.com"]),
      agentCodes: new Set(["AG-10001"]),
      merchantIds: new Set(["MR-40001"]),
      trxIds: new Set(),
      demoAgent: { user: { id: DEMO_AGENT, name: "Sabbir_Tele", phone: "01814557644", status: "VERIFIED", role: "AGENT" }, outletName: "Sabbir_Tele", wallet: { available: 0, cashInHand: 5_000_000 } },
      demoMerchant: { user: { id: DEMO_MERCHANT, name: "Nafiztong", phone: "01773519331", status: "VERIFIED", role: "MERCHANT" }, business: { merchantId: "MR-40001", businessName: "Nafiztong", category: "OTHER", settlementAccount: "Not set" }, wallet: { available: 0, cashInHand: null } },
      hasLanguage: true,
    };
  }
  const users = await sqlClient`select id, role, name, phone, email, status from users`;
  const agentCodes = await sqlClient`select agent_code from agent_profiles`;
  const merchantIds = await sqlClient`select merchant_id from merchant_businesses`;
  const trxIds = await sqlClient`select trx_id from transactions`;
  const wallets = await sqlClient`select user_id, available, cash_in_hand from wallets where user_id in (${DEMO_AGENT}, ${DEMO_MERCHANT})`;
  const [agentProfile] = await sqlClient`select outlet_name from agent_profiles where user_id = ${DEMO_AGENT}`;
  const [business] = await sqlClient`select merchant_id, business_name, category, settlement_account from merchant_businesses where user_id = ${DEMO_MERCHANT}`;
  const wallet = (id) => {
    const w = wallets.find((x) => x.user_id === id);
    return w ? { available: Number(w.available), cashInHand: w.cash_in_hand === null ? null : Number(w.cash_in_hand) } : null;
  };
  const user = (id) => users.find((u) => u.id === id);
  return {
    phones: new Set(users.map((u) => u.phone)),
    emails: new Set(users.map((u) => u.email).filter(Boolean)),
    agentCodes: new Set(agentCodes.map((r) => r.agent_code)),
    merchantIds: new Set(merchantIds.map((r) => r.merchant_id)),
    trxIds: new Set(trxIds.map((r) => r.trx_id)),
    demoAgent: user(DEMO_AGENT) && wallet(DEMO_AGENT) && agentProfile ? { user: user(DEMO_AGENT), outletName: agentProfile.outlet_name, wallet: wallet(DEMO_AGENT) } : null,
    demoMerchant: user(DEMO_MERCHANT) && wallet(DEMO_MERCHANT) && business
      ? { user: user(DEMO_MERCHANT), business: { merchantId: business.merchant_id, businessName: business.business_name, category: business.category, settlementAccount: business.settlement_account }, wallet: wallet(DEMO_MERCHANT) }
      : null,
    hasLanguage: (await columnsOf("users")).has("language"),
  };
}

/* ───────────── Generation ───────────── */

function generate(base) {
  let seq = 0;
  const id = (kind) => `syn_${kind}_${(++seq).toString(36).padStart(6, "0")}`;
  const unique = (set, make) => {
    let v;
    do v = make();
    while (set.has(v));
    set.add(v);
    return v;
  };
  const phone = (group) => unique(base.phones, () => `01${pick([7, 8, 9, 6, 5, 3, 4])}${group}${String(int(0, 9_999_999)).padStart(7, "0")}`);
  const personName = () => `${pick(FIRST)} ${pick(LAST)}`;
  const nid = () => String(int(1_000_000_000, 9_999_999_999)) + String(int(100, 999));
  const dob = () => `${int(1968, 2004)}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`;
  const createdBefore = (minDays, maxDays) => iso(at(FIRST_DAY - int(minDays, maxDays), int(9, 20), int(0, 59)));

  const out = {
    users: [], personalProfiles: [], agentProfiles: [], merchantProfiles: [], merchantBusinesses: [],
    statusHistory: [], wallets: [], transactions: [], commissions: [],
  };
  const wallets = new Map(); // userId → mutable wallet record

  function addUser({ role, name, phone: ph, email, status }) {
    const createdAt = createdBefore(15, 420);
    const user = {
      id: id("usr"), role, name, phone: ph, email: email ?? null, passwordHash: DEMO_PASSWORD_HASH, pinHash: DEMO_PIN_HASH,
      status, twoFactorEnabled: false, ...(base.hasLanguage ? { language: "en" } : {}), isDemo: true, failedLoginCount: 0,
      lockedUntil: null, pinFailedCount: 0, pinLockedUntil: null, createdAt, updatedAt: createdAt, lastLoginAt: null,
    };
    out.users.push(user);
    const w = { id: id("wal"), userId: user.id, currency: "BDT", available: 0, savings: 0, pending: 0, cashInHand: role === "AGENT" ? 0 : null, version: 0, updatedAt: createdAt };
    out.wallets.push(w);
    wallets.set(user.id, w);
    return user;
  }
  function history(user, entries) {
    for (const [status, note, actorId, offsetDays] of entries) {
      out.statusHistory.push({ id: id("sth"), userId: user.id, status, note, actorId, at: iso(Date.parse(user.createdAt) + offsetDays * DAY_MS) });
    }
  }

  /* ── Agents ── */
  const agents = [];
  let agentIndex = 0;
  for (const [district, count] of Object.entries(AGENTS_PER_DISTRICT)) {
    for (let i = 0; i < count; i++) {
      const ownerName = personName();
      const area = DISTRICTS[district][i % DISTRICTS[district].length];
      const user = addUser({ role: "AGENT", name: ownerName, phone: phone(6), email: `syn.agent${++agentIndex}@example.com`, status: "VERIFIED" });
      const outletName = pick([`${area} Telecom`, `${ownerName.split(" ")[1]} Store`, `${ownerName.split(" ")[0]} Enterprise`, `Bismillah Telecom ${area}`, `Maa Store ${area}`]);
      out.agentProfiles.push({
        userId: user.id, agentCode: unique(base.agentCodes, () => `AG-${int(30000, 39999)}`), dateOfBirth: dob(), address: `${area}, ${district}`,
        outletName, businessAddress: `Shop ${int(1, 40)}, ${area}, ${district}`, emergencyName: personName(), emergencyRelation: pick(["Spouse", "Brother", "Sister", "Father", "Mother"]),
        emergencyPhone: phone(1), nidNumber: nid(), reviewNote: null, district, area,
      });
      history(user, [["APPLICATION_SUBMITTED", "Agent application submitted", null, 0], ["VERIFIED", "Approved", DEMO_ADMIN, 2]]);
      wallets.get(user.id).cashInHand = taka(150_000, 0.25, 90_000, 260_000); // opening cash recorded at the outlet
      agents.push({ user, party: { userId: user.id, name: outletName, account: user.phone, kind: "AGENT" }, district, area, appeal: 1, role: "normal" });
    }
  }
  const agentIn = (d) => agents.filter((a) => a.district === d);
  const special = {
    nearLimit: agentIn("Chattogram")[0],
    offHours: agentIn("Narayanganj")[0],
    rising: agentIn("Dhaka")[0],
    gap: agentIn("Gazipur")[0],
  };
  special.nearLimit.role = "anomaly-near-limit";
  special.offHours.role = "anomaly-off-hours";
  special.rising.role = "rising";
  special.gap.role = "service-gap";
  wallets.get(special.gap.user.id).cashInHand = 1_500_000; // thin cash buffer for its demand
  wallets.get(special.nearLimit.user.id).cashInHand = 150_000_000; // a large cash desk feeding the near-limit withdrawals
  wallets.get(special.rising.user.id).cashInHand = 40_000_000; // a growing outlet keeps more cash
  if (base.demoAgent) {
    const a = base.demoAgent;
    wallets.set(a.user.id, { userId: a.user.id, available: a.wallet.available, savings: 0, pending: 0, cashInHand: a.wallet.cashInHand ?? 0, version: 0, updatedAt: null, demo: true, start: { ...a.wallet } });
    agents.push({ user: a.user, party: { userId: a.user.id, name: a.outletName ?? a.user.name, account: a.user.phone, kind: "AGENT" }, district: "Dhaka", area: "Mirpur", appeal: 2.2, role: "demo" });
  }
  const appeal = (a, day) => (a.role === "rising" ? 0.15 + 4.5 * ((day - FIRST_DAY) / (DAYS - 1)) ** 2 : a.appeal);

  /* ── Merchants ── */
  const merchants = [];
  let merchantIndex = 0;
  for (const [district, categories] of Object.entries(MERCHANTS)) {
    categories.forEach((category, i) => {
      const ownerName = personName();
      const area = DISTRICTS[district][(i + 1) % DISTRICTS[district].length];
      const businessName = `${BUSINESS[category][(merchantIndex + i) % BUSINESS[category].length]} ${area}`;
      const user = addUser({ role: "MERCHANT", name: ownerName, phone: phone(8), email: `syn.merchant${++merchantIndex}@example.com`, status: "VERIFIED" });
      const biz = {
        id: id("biz"), userId: user.id, merchantId: unique(base.merchantIds, () => `MR-${int(60000, 69999)}`), businessName, category,
        businessAddress: `${int(1, 90)} ${area} Road, ${district}`, registrationNumber: `C-${int(100000, 999999)}/${int(2012, 2024)}`,
        tradeLicenseNumber: `TRAD/${district.slice(0, 3).toUpperCase()}/${int(10000, 99999)}/${int(2020, 2025)}`, taxId: chance(0.7) ? String(int(100_000_000, 999_999_999)) + String(int(100, 999)) : null,
        settlementAccount: `${pick(BANKS)} •${int(1000, 9999)}`, district, area,
      };
      out.merchantBusinesses.push(biz);
      out.merchantProfiles.push({ userId: user.id, ownerName, ownerNidNumber: nid(), reviewNote: null });
      history(user, [["PENDING", "Merchant application submitted", null, 0], ["VERIFIED", "Approved", DEMO_ADMIN, 3]]);
      merchants.push({
        user, biz, district, category, party: { userId: user.id, name: businessName, account: biz.merchantId, kind: "MERCHANT" },
        rate: category === "RESTAURANT" ? between(0.6, 1.2) : category === "GROCERY" ? between(0.55, 1.05) : category === "OTHER" ? between(0.45, 0.8) : between(0.2, 0.6),
        qrShare: between(0.3, 0.9), failRate: 0.012, regulars: [], decline: null, settleDow: int(0, 6),
      });
    });
  }
  const gazipurShop = merchants.find((m) => m.district === "Gazipur");
  gazipurShop.rate = 2.6; // one shop for a whole district
  // Two merchants whose activity falls away over the last month (the first goes quiet for the final week).
  const decliners = [
    merchants.find((m) => m.district === "Dhaka" && m.category === "RESTAURANT"),
    merchants.find((m) => m.district === "Narayanganj" && m.category === "PHARMACY"),
  ];
  decliners.forEach((m, i) => {
    m.decline = { start: TODAY - int(20, 23), quietDays: i < 1 ? int(7, 9) : 0 };
    m.failRate = 0.05;
    m.rate = Math.max(m.rate, 0.9);
  });
  if (base.demoMerchant) {
    const d = base.demoMerchant;
    wallets.set(d.user.id, { userId: d.user.id, available: d.wallet.available, savings: 0, pending: 0, cashInHand: d.wallet.cashInHand, version: 0, updatedAt: null, demo: true, start: { ...d.wallet } });
    merchants.push({
      user: d.user, biz: { ...d.business, userId: d.user.id, district: "Dhaka", area: "Dhanmondi" }, district: "Dhaka", category: d.business.category,
      party: { userId: d.user.id, name: d.business.businessName, account: d.business.merchantId, kind: "MERCHANT" },
      rate: 2.8, qrShare: 0.7, failRate: 0.01, regulars: [], decline: null, settleDow: null, demo: true,
    });
  }
  const activity = (m, day) => {
    if (m.demo) return 0.85 + 0.35 * ((day - FIRST_DAY) / (DAYS - 1));
    if (!m.decline || day < m.decline.start) return 1;
    if (TODAY - day < m.decline.quietDays) return 0;
    // Falls over ten days, then trickles along at a tenth of its old level.
    return Math.max(0.1, 1 - (day - m.decline.start) / 10);
  };

  /* ── Customers ── */
  const customers = [];
  for (const [district, count] of Object.entries(CUSTOMERS_PER_DISTRICT)) {
    for (let i = 0; i < count; i++) {
      const verified = i === 0 || chance(0.92); // the planted patterns need a verified customer in each district
      const user = addUser({ role: "PERSONAL", name: personName(), phone: phone(5), email: null, status: verified ? "VERIFIED" : "PENDING_VERIFICATION" });
      const area = pick(DISTRICTS[district]);
      out.personalProfiles.push({ userId: user.id, dateOfBirth: dob(), address: `House ${int(1, 120)}, ${area}, ${district}`, nidNumber: verified ? nid() : null, selfieStatus: verified ? "VERIFIED" : "NOT_SUBMITTED" });
      history(user, verified ? [["PENDING_VERIFICATION", "Account created", null, 0], ["VERIFIED", "e-KYC passed (NID + selfie match)", null, 0]] : [["PENDING_VERIFICATION", "Account created", null, 0]]);
      // Gazipur's customers stand in for a crowded district: they cash out at their one agent far more often.
      const agentVisits = district === "Gazipur" ? 8 : 1;
      customers.push({ user, district, party: { userId: user.id, name: user.name, account: user.phone, kind: "PERSONAL" }, level: Math.exp(0.45 * gauss()), salaryDay: int(1, 5), agentVisits });
    }
  }
  const customersIn = (d) => customers.filter((c) => c.district === d);
  // Each merchant has regulars; Gazipur shoppers also travel to Dhaka shops (Dhaka has no synthetic customers of its own).
  for (const m of merchants) {
    const local = customersIn(m.district);
    const pool = m.district === "Dhaka" ? [...local, ...customersIn("Gazipur").slice(0, 20)] : local;
    m.regulars = Array.from({ length: Math.min(pool.length, int(8, 22)) }, () => pick(pool));
  }
  // Repeat customers behind the two abnormal agents (verified, so the larger limits apply).
  const nearLimitMules = customersIn("Chattogram").filter((c) => c.user.status === "VERIFIED").slice(0, 3);
  const offHoursRegulars = customersIn("Narayanganj").filter((c) => c.user.status === "VERIFIED").slice(0, 2);

  /* ── Ledger simulation (same balance rules as ledger.post) ── */
  const trxIds = base.trxIds;
  const outflow = new Map(); // `${userId}:${day}` → gross outflow (personal daily limit)
  const limitsOf = (u) => (u.status === "VERIFIED" ? PERSONAL_LIMITS.VERIFIED : PERSONAL_LIMITS.PENDING_VERIFICATION);
  const touch = (w, ms) => {
    w.version += 1;
    w.updatedAt = iso(ms);
  };
  const W = (userId) => wallets.get(userId);
  const canAfford = (userId, gross) => W(userId).available >= gross;
  const withinLimits = (c, gross, day) => gross <= limitsOf(c.user).perTransaction && (outflow.get(`${c.user.id}:${day}`) ?? 0) + gross <= limitsOf(c.user).dailyOut;
  const recordOutflow = (c, gross, day) => outflow.set(`${c.user.id}:${day}`, (outflow.get(`${c.user.id}:${day}`) ?? 0) + gross);

  function post(p, ms) {
    const status = p.status ?? "SUCCESSFUL";
    const senderFee = p.senderFee ?? 0;
    const receiverFee = p.receiverFee ?? 0;
    const commission = status === "SUCCESSFUL" && p.commission?.amount ? p.commission : null;
    const t = {
      id: id("txn"), trxId: unique(trxIds, () => Array.from({ length: 10 }, () => pick(TRX_ALPHABET)).join("")), type: p.type, status,
      amount: p.amount, senderFee, receiverFee, commission, sender: p.sender, receiver: p.receiver, description: p.description,
      reference: p.reference ?? null, paymentMethod: p.paymentMethod ?? null, relatedTrxId: p.relatedTrxId ?? null, refundedAmount: 0,
      pendingHold: null, pendingCredit: null, cashEffect: null, settleAt: null, failureReason: p.failureReason ?? null,
      createdAt: iso(ms), completedAt: status === "SUCCESSFUL" ? iso(ms) : null, settlementDirection: p.settlementDirection ?? null,
    };
    if (status === "SUCCESSFUL") {
      if (p.sender.userId) {
        const w = W(p.sender.userId);
        w.available -= p.amount + senderFee;
        touch(w, ms);
      }
      if (p.receiver.userId) {
        const w = W(p.receiver.userId);
        w.available += p.amount - receiverFee;
        touch(w, ms);
      }
      if (commission) {
        const w = W(commission.userId);
        w.available += commission.amount;
        touch(w, ms);
        out.commissions.push({ id: id("com"), agentId: commission.userId, trxId: t.trxId, type: t.type, baseAmount: t.amount, amount: commission.amount, createdAt: t.createdAt });
      }
      if (p.cashEffect) {
        const w = W(p.cashEffect.userId);
        w.cashInHand += p.cashEffect.delta;
        touch(w, ms);
        t.cashEffect = p.cashEffect;
      }
    }
    // Settlements cleared two minutes after they were requested (what settleDue() leaves behind).
    if (p.settlement === "TO_BANK") {
      t.pendingHold = { userId: p.sender.userId, amount: p.amount };
      t.settleAt = t.completedAt = iso(ms + 120_000);
    } else if (p.settlement === "FLOAT_TOP_UP") {
      t.pendingCredit = { userId: p.receiver.userId, amount: p.amount };
      t.settleAt = t.completedAt = iso(ms + 120_000);
    }
    for (const w of [p.sender.userId, p.receiver.userId, p.cashEffect?.userId].filter(Boolean).map(W)) {
      if (w.available < 0 || (w.cashInHand ?? 0) < 0) throw new Error(`Generator bug: negative balance on ${w.userId} at ${t.createdAt}`);
    }
    out.transactions.push(t);
    return t;
  }

  const fail = (p, ms, reason) => post({ ...p, status: "FAILED", failureReason: reason, cashEffect: null }, ms);

  /* ── Event builders ── */
  const events = []; // { ms, run } collected while planning
  const queue = []; // min-heap by time while running
  let running = false;
  const less = (i, j) => queue[i].ms < queue[j].ms || (queue[i].ms === queue[j].ms && queue[i].n < queue[j].n);
  const swap = (i, j) => ([queue[i], queue[j]] = [queue[j], queue[i]]);
  function siftDown(i) {
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < queue.length && less(l, m)) m = l;
      if (r < queue.length && less(r, m)) m = r;
      if (m === i) return;
      swap(i, m);
      i = m;
    }
  }
  function siftUp(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(i, p)) return;
      swap(i, p);
      i = p;
    }
  }
  const heapify = () => {
    running = true;
    for (let i = (queue.length >> 1) - 1; i >= 0; i--) siftDown(i);
  };
  function popEarliest() {
    const top = queue[0];
    const last = queue.pop();
    if (queue.length) {
      queue[0] = last;
      siftDown(0);
    }
    return top;
  }
  let order = 0;
  const schedule = (ms, run) => {
    if (ms > NOW - 5 * 60_000) return;
    const e = { ms, run, n: order++ };
    if (running) {
      queue.push(e);
      siftUp(queue.length - 1);
    } else events.push(e);
  };
  const timeOn = (day, hourWeights) => at(day, hourIn(hourWeights), int(0, 59), int(0, 59));

  function addMoney(c, amount, ms, sourceName) {
    const external = sourceName !== "bank";
    const sender = external ? { userId: null, name: sourceName, account: c.user.phone, kind: "EXTERNAL" } : DEMO_BANK;
    const reference = `GW${ms.toString(36).toUpperCase()}`;
    if (amount % 100 === 13) return fail({ type: "ADD_MONEY", sender, receiver: c.party, amount, description: `Add Money from ${sender.name}`, reference }, ms, "Declined by issuer (test rule)");
    return post({ type: "ADD_MONEY", sender, receiver: c.party, amount, description: `Add Money from ${sender.name}`, reference }, ms);
  }
  /** Top up a customer just before a purchase they could not otherwise afford (Add Money from a bank or wallet). */
  function ensureFunds(c, gross, ms) {
    if (canAfford(c.user.id, gross)) return true;
    const need = gross - W(c.user.id).available;
    const { min, max } = OPERATION_POLICY.ADD_MONEY;
    const amount = Math.min(max, Math.max(min, Math.ceil((need * between(1.2, 2.5)) / 10_000) * 10_000, Math.ceil(need / 100) * 100));
    if (amount < need) return false;
    addMoney(c, amount, ms - int(3, 25) * 60_000, chance(0.6) ? pick(MFS) : "bank");
    return canAfford(c.user.id, gross);
  }
  function chooseAgent(c, day) {
    const local = agents.filter((a) => a.district === c.district);
    const pool = local.length && !(c.district === "Gazipur" && chance(0.25)) ? local : agents.filter((a) => a.district === "Dhaka");
    return pool[weighted(pool.map((a) => appeal(a, day)))];
  }
  function agentFailureRate(a) {
    return a.role === "service-gap" ? 0.07 : 0.008;
  }

  function cashOut(c, a, amount, ms, day, { assisted = chance(0.4) } = {}) {
    const fees = computeFees("AGENT_CASH_OUT", amount);
    const gross = amount + fees.senderFee;
    if (!withinLimits(c, gross, day)) return null;
    const p = {
      type: "CASH_OUT", sender: c.party, receiver: a.party, amount, senderFee: fees.senderFee,
      commission: { userId: a.user.id, amount: fees.commission }, cashEffect: { userId: a.user.id, delta: -amount },
      description: assisted ? "Agent-assisted Cash Out" : "Cash Out at agent",
    };
    if ((W(a.user.id).cashInHand ?? 0) < amount) {
      // The counter can't pay out. Real handlers refuse before posting; the overloaded agent's turned-away attempts are recorded.
      return a.role === "service-gap" && chance(0.6) ? fail(p, ms, "Agent had insufficient cash") : null;
    }
    if (!ensureFunds(c, gross, ms)) return null;
    if (chance(agentFailureRate(a))) return fail(p, ms, "Customer did not confirm the one-time code");
    recordOutflow(c, gross, day);
    return post(p, ms);
  }
  function cashIn(c, a, amount, ms) {
    const fees = computeFees("AGENT_CASH_IN", amount);
    const p = {
      type: "CASH_IN", sender: a.party, receiver: c.party, amount, commission: { userId: a.user.id, amount: fees.commission },
      cashEffect: { userId: a.user.id, delta: amount }, description: "Cash In at agent",
    };
    if (W(a.user.id).available < amount) return a.role === "service-gap" && chance(0.5) ? fail(p, ms, "Agent e-money float too low") : null;
    if (chance(agentFailureRate(a))) return fail(p, ms, "Customer did not confirm the one-time code");
    return post(p, ms);
  }

  /* ── Daily schedule ── */
  for (let day = FIRST_DAY; day <= TODAY; day++) {
    const d = dow(day);
    const salaryWindow = dom(day) <= 5;

    // Customers
    for (const c of customers) {
      // Monthly income arrives on days 1–5 (salary / remittance) → spending and cash-outs follow.
      if (dom(day) === c.salaryDay && chance(0.85)) {
        // About 1 in 80 lands on a ".13" amount, which the development gateway declines (a FAILED row, as in production).
        const amount = taka(14_000 * c.level, 0.3, 3_000, c.user.status === "VERIFIED" ? 40_000 : 12_000) + (chance(0.0125) ? 13 : 0);
        schedule(at(day, int(8, 12), int(0, 59)), () => addMoney(c, amount, at(day, int(8, 12), int(0, 59)), chance(0.55) ? "bank" : pick(MFS)));
      }
      const cashOutRate = 0.03 * c.agentVisits * c.level * DOW.CASH_OUT[d] * (salaryWindow ? 2.4 : 0.85);
      for (let k = poisson(cashOutRate); k > 0; k--) {
        const ms = timeOn(day, HOURS.AGENT);
        const amount = taka(salaryWindow ? 4_500 : 2_800, 0.55, 100, 20_000);
        schedule(ms, () => cashOut(c, chooseAgent(c, day), amount, ms, day));
      }
      for (let k = poisson(0.024 * c.level * DOW.CASH_IN[d]); k > 0; k--) {
        const ms = timeOn(day, HOURS.AGENT);
        const amount = taka(2_500, 0.6, 100, 25_000);
        schedule(ms, () => cashIn(c, chooseAgent(c, day), amount, ms));
      }
      for (let k = poisson(0.011 * c.level * (salaryWindow ? 1.6 : 1)); k > 0; k--) {
        const ms = timeOn(day, HOURS.DEFAULT);
        const to = chance(0.7) ? pick(customersIn(c.district)) : pick(customers);
        if (to === c) continue;
        const amount = taka(1_800, 0.7, 50, 15_000);
        schedule(ms, () => {
          const fees = computeFees("SEND_MONEY", amount);
          const gross = amount + fees.senderFee;
          if (!withinLimits(c, gross, day) || !ensureFunds(c, gross, ms)) return;
          recordOutflow(c, gross, day);
          const ref = chance(0.4) ? pick(["Family", "Rent share", "Lunch", "Loan return", "Gift"]) : null;
          post({ type: "SEND_MONEY", sender: c.party, receiver: to.party, amount, senderFee: fees.senderFee, description: ref ?? "Send Money", reference: ref }, ms);
        });
      }
      for (let k = poisson(0.006 * c.level); k > 0; k--) {
        const ms = timeOn(day, HOURS.DEFAULT);
        const amount = taka(120, 0.6, 20, 1_000);
        schedule(ms, () => {
          if (!withinLimits(c, amount, day) || !ensureFunds(c, amount, ms)) return;
          recordOutflow(c, amount, day);
          const op = OPERATORS[c.user.phone[2]] ?? "Grameenphone";
          post({ type: "MOBILE_RECHARGE", sender: c.party, receiver: { userId: null, name: op, account: c.user.phone, kind: "OPERATOR" }, amount, description: "Prepaid recharge (own number)" }, ms);
        });
      }
      for (let k = poisson(0.005 * c.level * (salaryWindow ? 2 : 0.8)); k > 0; k--) {
        const ms = timeOn(day, HOURS.DEFAULT);
        const biller = pick(BILLERS);
        const amount = taka(1_400, 0.5, 100, 12_000);
        schedule(ms, () => {
          const fees = computeFees("BILL_PAYMENT", amount);
          const gross = amount + fees.senderFee;
          if (!withinLimits(c, gross, day) || !ensureFunds(c, gross, ms)) return;
          recordOutflow(c, gross, day);
          post({ type: "BILL_PAYMENT", sender: c.party, receiver: { userId: null, name: biller.name, account: String(int(10_000_000, 99_999_999)), kind: "BILLER" }, amount, senderFee: fees.senderFee, description: `${biller.name} bill` }, ms);
        });
      }
    }

    // Merchants: payments from regulars and walk-ins, refunds, weekly settlement.
    for (const m of merchants) {
      const n = poisson(m.rate * (DOW[m.category] ?? DOW.OTHER)[d] * (dom(day) <= 7 ? 1.2 : 1) * activity(m, day));
      for (let k = 0; k < n; k++) {
        const ms = timeOn(day, HOURS[m.category] ?? HOURS.DEFAULT);
        const amount = m.category === "RESTAURANT" ? taka(650, 0.5, 80, 6_000)
          : m.category === "GROCERY" ? taka(900, 0.6, 50, 9_000)
            : m.category === "PHARMACY" ? taka(550, 0.6, 50, 6_000)
              : m.category === "RETAIL" ? taka(2_200, 0.6, 200, 20_000)
                : m.category === "ECOMMERCE" ? taka(1_800, 0.5, 200, 15_000)
                  : m.category === "SERVICES" ? taka(900, 0.5, 100, 8_000)
                    : taka(450, 0.6, 30, 5_000);
        schedule(ms, () => {
          const walkIns = customersIn(m.district);
          const pool = chance(0.62) || !walkIns.length ? m.regulars : walkIns;
          // The customer pays the 1.5% fee on top; the merchant receives the full amount.
          const fees = computeFees("MERCHANT_PAYMENT", amount);
          const gross = amount + fees.senderFee;
          // Whoever is at the counter: prefer someone who can pay; otherwise they top up first.
          let c = pick(pool);
          for (let tries = 0; tries < 4 && !canAfford(c.user.id, gross); tries++) c = pick(pool);
          if (!withinLimits(c, gross, day) || !ensureFunds(c, gross, ms)) return;
          const qr = chance(m.qrShare);
          const p = {
            type: "MERCHANT_PAYMENT", sender: c.party, receiver: m.party, amount, senderFee: fees.senderFee, receiverFee: fees.receiverFee,
            paymentMethod: qr ? "QR_SCAN" : "MERCHANT_ID", description: `Payment to ${m.party.name}`, reference: null,
          };
          if (chance(m.failRate)) return fail(p, ms, "Customer cancelled at the counter");
          recordOutflow(c, gross, day);
          const t = post(p, ms);
          if (chance(0.012)) {
            const later = ms + int(1, 7) * DAY_MS + int(0, 6) * 3_600_000;
            const refundAmount = chance(0.6) ? amount : Math.round(amount / 200) * 100;
            schedule(later, () => {
              if (W(m.user.id).available < refundAmount || t.status !== "SUCCESSFUL") return;
              post({ type: "REFUND", sender: m.party, receiver: t.sender, amount: refundAmount, relatedTrxId: t.trxId, description: `Refund: ${pick(["Item out of stock", "Wrong amount charged", "Order cancelled", "Duplicate payment"])}` }, later);
              t.refundedAmount += refundAmount;
              if (t.refundedAmount >= t.amount) t.status = "REFUNDED";
            });
          }
        });
      }
      if (m.settleDow !== null && d === m.settleDow) {
        const ms = at(day, 18, int(0, 50));
        schedule(ms, () => {
          const available = W(m.user.id).available;
          if (available < 500_000) return;
          const amount = Math.floor((available * 0.8) / 10_000) * 10_000;
          const [bankName, tail] = m.biz.settlementAccount.split(" •");
          post({ type: "SETTLEMENT", sender: m.party, receiver: { userId: null, name: bankName, account: `•${tail}`, kind: "BANK" }, amount, description: "Settlement to bank", settlementDirection: "TO_BANK", settlement: "TO_BANK" }, ms);
        });
      }
    }

    // Agents: walk-in services and float management.
    for (const a of agents) {
      const scale = appeal(a, day);
      for (let k = poisson(0.1 * scale); k > 0; k--) {
        const ms = timeOn(day, HOURS.AGENT);
        const amount = taka(150, 0.6, 20, 1_000);
        const number = `01${pick([7, 8, 9, 6, 5])}${String(int(0, 99_999_999)).padStart(8, "0")}`;
        schedule(ms, () => {
          if (W(a.user.id).available < amount) return;
          const fees = computeFees("AGENT_RECHARGE", amount);
          post({ type: "MOBILE_RECHARGE", sender: a.party, receiver: { userId: null, name: OPERATORS[number[2]] ?? "Grameenphone", account: number, kind: "OPERATOR" }, amount, commission: { userId: a.user.id, amount: fees.commission }, cashEffect: { userId: a.user.id, delta: amount }, description: "Recharge for customer" }, ms);
        });
      }
      for (let k = poisson(0.05 * scale * (salaryWindow ? 1.8 : 1)); k > 0; k--) {
        const ms = timeOn(day, HOURS.AGENT);
        const amount = taka(1_500, 0.5, 100, 15_000);
        const biller = pick(BILLERS);
        const customerPhone = `01${pick([7, 8, 9, 6, 5])}${String(int(0, 99_999_999)).padStart(8, "0")}`;
        schedule(ms, () => {
          if (W(a.user.id).available < amount) return;
          const fees = computeFees("AGENT_CUSTOMER_PAYMENT", amount);
          post({ type: "BILL_PAYMENT", sender: a.party, receiver: { userId: null, name: biller.name, account: String(int(10_000_000, 99_999_999)), kind: "BILLER" }, amount, commission: { userId: a.user.id, amount: fees.commission }, cashEffect: { userId: a.user.id, delta: amount }, description: `Bill payment for customer ${customerPhone.slice(0, 3)}•••••${customerPhone.slice(-3)}`, reference: customerPhone }, ms);
        });
      }
      // Morning float check. The overloaded Gazipur agent only gets to the bank every few days.
      if (a.role !== "service-gap" || (day - FIRST_DAY) % 4 === 0) {
        const ms = at(day, 9, int(0, 30));
        schedule(ms, () => {
          const w = W(a.user.id);
          if (w.available < 2_500_000 && (w.cashInHand ?? 0) > 3_000_000) {
            const amount = Math.floor(Math.min(w.cashInHand - 1_500_000, 6_000_000) / 100_000) * 100_000;
            if (amount >= OPERATION_POLICY.SETTLEMENT.min) {
              post({ type: "SETTLEMENT", sender: AGENT_FLOAT_BANK, receiver: a.party, amount, cashEffect: { userId: a.user.id, delta: -amount }, description: "Float top-up · cash deposited at bank", settlementDirection: "FLOAT_TOP_UP", settlement: "FLOAT_TOP_UP" }, ms);
            }
          } else if (w.available > 25_000_000 && !w.demo) {
            const amount = Math.floor((w.available - 15_000_000) / 100_000) * 100_000;
            post({ type: "SETTLEMENT", sender: a.party, receiver: AGENT_FLOAT_BANK, amount, description: "Settlement to bank", settlementDirection: "TO_BANK", settlement: "TO_BANK" }, ms);
          }
        });
      }
    }

    // Anomaly 1 — Chattogram agent, last 7 weeks: cash-outs just under the per-transaction limit, by the same few customers.
    if (TODAY - day < 50 && [0, 1, 3].includes(d) && chance(0.85)) {
      for (const c of nearLimitMules) {
        if (!chance(0.6)) continue;
        const ms = at(day, int(15, 20), int(0, 59));
        // Largest amount whose gross (amount + 1.85% fee) stays under the 25,000 per-transaction limit.
        const amount = int(24_000, 24_540) * 100;
        schedule(ms, () => cashOut(c, special.nearLimit, amount, ms, day, { assisted: true }));
      }
    }
    // Anomaly 2 — Narayanganj agent: bursts between 1 and 4 a.m., mostly the same two customers.
    if ((d === 2 || d === 5) && chance(0.9)) {
      const start = at(day, int(1, 3), int(0, 40));
      for (let k = 0; k < int(5, 8); k++) {
        const ms = start + k * int(2, 7) * 60_000;
        const c = chance(0.8) ? pick(offHoursRegulars) : pick(customersIn("Narayanganj"));
        const amount = taka(5_000, 0.3, 1_000, 9_500);
        schedule(ms, () => (chance(0.5) ? cashOut(c, special.offHours, amount, ms, day, { assisted: true }) : cashIn(c, special.offHours, amount, ms)));
      }
    }
  }

  // Customers already had some money when the window opens (balance carried over from before).
  for (const c of customers) {
    const ms = at(FIRST_DAY, int(7, 8), int(0, 59));
    const amount = taka(6_000 * c.level, 0.4, 500, c.user.status === "VERIFIED" ? 30_000 : 8_000);
    schedule(ms, () => addMoney(c, amount, ms, chance(0.5) ? "bank" : pick(MFS)));
  }

  // Opening float for every synthetic agent on day one, before anything else that day.
  for (const a of agents) {
    if (a.role === "demo") continue;
    const ms = at(FIRST_DAY, 8, int(0, 30));
    schedule(ms, () => {
      const w = W(a.user.id);
      const amount = Math.floor((w.cashInHand * (a === special.nearLimit ? 0.1 : 0.55)) / 100_000) * 100_000;
      post({ type: "SETTLEMENT", sender: AGENT_FLOAT_BANK, receiver: a.party, amount, cashEffect: { userId: a.user.id, delta: -amount }, description: "Float top-up · cash deposited at bank", settlementDirection: "FLOAT_TOP_UP", settlement: "FLOAT_TOP_UP" }, ms);
    });
  }

  // Run strictly in time order (refunds are scheduled while running, so use a heap).
  queue.push(...events.splice(0));
  heapify();
  while (queue.length) {
    const e = popEarliest();
    e.run();
  }

  // Last-seen timestamps for synthetic users.
  const lastSeen = new Map();
  for (const t of out.transactions) for (const uid of [t.sender.userId, t.receiver.userId]) if (uid) lastSeen.set(uid, t.createdAt > (lastSeen.get(uid) ?? "") ? t.createdAt : lastSeen.get(uid));
  for (const u of out.users) u.lastLoginAt = lastSeen.get(u.id) ?? null;

  return {
    out,
    demo: {
      agent: base.demoAgent ? { userId: DEMO_AGENT, start: W(DEMO_AGENT).start, end: W(DEMO_AGENT), district: "Dhaka", area: "Mirpur" } : null,
      merchant: base.demoMerchant ? { userId: DEMO_MERCHANT, start: W(DEMO_MERCHANT).start, end: W(DEMO_MERCHANT), district: "Dhaka", area: "Dhanmondi" } : null,
    },
    specials: { nearLimit: special.nearLimit.user.id, offHours: special.offHours.user.id, rising: [special.rising.user.id], serviceGap: special.gap.user.id, decliners: decliners.map((m) => m.user.id) },
    agents,
    merchants,
  };
}

/* ───────────── Validation ───────────── */

function validate({ out, demo }) {
  const problems = [];
  for (const w of out.wallets) {
    for (const v of [w.available, w.savings, w.pending, w.cashInHand ?? 0]) {
      if (!Number.isInteger(v) || v < 0) problems.push(`wallet ${w.userId} has invalid balance ${v}`);
    }
  }
  for (const d of [demo.agent, demo.merchant].filter(Boolean)) {
    if (d.end.available < 0 || (d.end.cashInHand ?? 0) < 0) problems.push(`demo wallet ${d.userId} would go negative`);
  }
  const trx = new Set();
  for (const t of out.transactions) {
    if (trx.has(t.trxId)) problems.push(`duplicate trx_id ${t.trxId}`);
    trx.add(t.trxId);
    if (!Number.isInteger(t.amount) || t.amount <= 0) problems.push(`bad amount on ${t.id}`);
    if (Date.parse(t.createdAt) > NOW) problems.push(`future transaction ${t.id}`);
    if (t.status === "FAILED" && (t.commission || t.cashEffect)) problems.push(`failed txn with effects ${t.id}`);
  }
  const commissioned = out.transactions.filter((t) => t.commission).length;
  if (commissioned !== out.commissions.length) problems.push(`commission rows ${out.commissions.length} != commissioned txns ${commissioned}`);
  return problems;
}

/* ───────────── Rows for PostgreSQL ───────────── */

const snake = (s) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const NESTED = { sender: ["userId", "name", "account", "kind"], receiver: ["userId", "name", "account", "kind"], commission: ["userId", "amount"], pendingHold: ["userId", "amount"], pendingCredit: ["userId", "amount"], cashEffect: ["userId", "delta"] };
function toRow(record) {
  const row = {};
  for (const [k, v] of Object.entries(record)) {
    if (NESTED[k]) for (const nk of NESTED[k]) row[`${snake(k)}_${snake(nk)}`] = v ? (v[nk] ?? null) : null;
    else if (k !== "demo" && k !== "start") row[snake(k)] = v ?? null;
  }
  return row;
}

async function insert(tx, table, records) {
  if (!records.length) return;
  const rows = records.map(toRow);
  const columns = Object.keys(rows[0]);
  const perChunk = Math.max(1, Math.floor(30_000 / columns.length));
  for (let i = 0; i < rows.length; i += perChunk) {
    await tx`insert into ${tx(table)} ${tx(rows.slice(i, i + perChunk), columns)}`;
  }
}

/* ───────────── Seed / reset ───────────── */

/** Synthetic accounts that show each planted pattern (they share the demo password and PIN). */
function printAccountsToTry(result) {
  const S = result.specials;
  const user = (id) => result.out.users.find((u) => u.id === id);
  const district = (id) => result.out.agentProfiles.find((a) => a.userId === id)?.district ?? result.out.merchantBusinesses.find((b) => b.userId === id)?.district;
  const rows = [
    ["Agent with a cash shortfall", S.serviceGap],
    ["Agent with near-limit cash-outs", S.nearLimit],
    ["Agent with off-hours bursts", S.offHours],
    ["Fast-growing agent", S.rising[0]],
    ["Declining merchant", S.decliners[0]],
  ].filter(([, id]) => user(id));
  console.log("Accounts to try (password demo@1234, PIN 24680):");
  for (const [label, id] of rows) console.log(`  ${label.padEnd(33)} ${user(id).phone}  ${user(id).name} (${district(id)})`);
}

async function seed() {
  const base = await baseState();
  if (!OFFLINE) {
    const agentCols = await columnsOf("agent_profiles");
    const bizCols = await columnsOf("merchant_businesses");
    if (!agentCols.has("district") || !bizCols.has("district")) {
      console.error("This database is older than supabase/schema.sql (no district columns). Rebuild it with schema.sql + seed.sql first (this deletes all data).");
      process.exit(1);
    }
    const [{ n }] = await sqlClient`select count(*)::int as n from users where id like 'syn\\_%'`;
    if (n > 0 && !DRY) {
      console.error(`Synthetic data already exists (${n} users). Run with --reset first.`);
      process.exit(1);
    }
    if (!base.demoAgent) console.warn(`Note: ${DEMO_AGENT} not found — the demo agent gets no history.`);
    if (!base.demoMerchant) console.warn(`Note: ${DEMO_MERCHANT} not found — the demo merchant gets no history.`);
  }

  const result = generate(base);
  const problems = validate(result);
  const { out, demo } = result;
  const count = (type) => out.transactions.filter((t) => t.type === type).length;
  console.log(`Generated ${out.users.length} users (${result.agents.length} agents, ${result.merchants.length} merchants), ${out.transactions.length} transactions, ${out.commissions.length} commission rows over ${DAYS} days.`);
  console.log(`  by type: ${["MERCHANT_PAYMENT", "CASH_OUT", "CASH_IN", "ADD_MONEY", "SEND_MONEY", "MOBILE_RECHARGE", "BILL_PAYMENT", "SETTLEMENT", "REFUND"].map((t) => `${t}=${count(t)}`).join(" ")}`);
  console.log(`  failed: ${out.transactions.filter((t) => t.status === "FAILED").length}, refunded originals: ${out.transactions.filter((t) => t.status === "REFUNDED").length}`);
  for (const d of [demo.agent, demo.merchant].filter(Boolean)) {
    console.log(`  ${d.userId}: e-money ${d.start.available / 100} → ${d.end.available / 100} taka${d.end.cashInHand !== null ? `, cash ${(d.start.cashInHand ?? 0) / 100} → ${d.end.cashInHand / 100} taka` : ""}`);
  }
  if (problems.length) {
    console.error(`Validation failed:\n  ${problems.slice(0, 20).join("\n  ")}`);
    process.exit(1);
  }
  console.log("Validation passed: balances are whole poisha and never negative; commission rows match.");
  printAccountsToTry(result);

  if (EMIT) {
    // Include the demo agent/merchant (with their end balances) so the dataset is self-contained.
    const demoRecords = { users: [], agentProfiles: [], merchantBusinesses: [], wallets: [] };
    if (base.demoAgent && demo.agent) {
      demoRecords.users.push({ ...base.demoAgent.user, isDemo: false });
      demoRecords.agentProfiles.push({ userId: DEMO_AGENT, agentCode: "AG-10001", outletName: base.demoAgent.outletName, district: demo.agent.district, area: demo.agent.area });
      demoRecords.wallets.push({ id: "wal_sabbir_tele", userId: DEMO_AGENT, available: demo.agent.end.available, cashInHand: demo.agent.end.cashInHand, savings: 0, pending: 0 });
    }
    if (base.demoMerchant && demo.merchant) {
      demoRecords.users.push({ ...base.demoMerchant.user, isDemo: false });
      demoRecords.merchantBusinesses.push({ id: "biz_nafiztong", userId: DEMO_MERCHANT, ...base.demoMerchant.business, district: demo.merchant.district, area: demo.merchant.area });
      demoRecords.wallets.push({ id: "wal_nafiztong", userId: DEMO_MERCHANT, available: demo.merchant.end.available, cashInHand: null, savings: 0, pending: 0 });
    }
    writeFileSync(EMIT, JSON.stringify({ generatedAt: iso(NOW), ...result.out, demo, demoRecords, specials: result.specials }, null, 0));
    console.log(`Wrote ${EMIT}`);
  }
  if (DRY) return;

  await sqlClient.begin(async (tx) => {
    await insert(tx, "users", out.users);
    await insert(tx, "personal_profiles", out.personalProfiles);
    await insert(tx, "agent_profiles", out.agentProfiles);
    await insert(tx, "merchant_profiles", out.merchantProfiles);
    await insert(tx, "merchant_businesses", out.merchantBusinesses);
    await insert(tx, "account_status_history", out.statusHistory);
    await insert(tx, "wallets", out.wallets.filter((w) => !w.demo));
    await insert(tx, "transactions", out.transactions);
    await insert(tx, "commissions", out.commissions);
    for (const d of [demo.agent, demo.merchant].filter(Boolean)) {
      const dAvail = d.end.available - d.start.available;
      const dCash = (d.end.cashInHand ?? 0) - (d.start.cashInHand ?? 0);
      await tx`update wallets set available = available + ${dAvail}, cash_in_hand = case when cash_in_hand is null then null else cash_in_hand + ${dCash} end,
               version = version + ${d.end.version}, updated_at = greatest(updated_at, now()) where user_id = ${d.userId}`;
    }
    if (demo.agent) await tx`update agent_profiles set district = ${demo.agent.district}, area = ${demo.agent.area} where user_id = ${DEMO_AGENT}`;
    if (demo.merchant) await tx`update merchant_businesses set district = ${demo.merchant.district}, area = ${demo.merchant.area} where user_id = ${DEMO_MERCHANT}`;
  });
  console.log("Seeded. Sign in as the demo agent or merchant to see their insights; synthetic users share the demo password and PIN.");
}

async function reset() {
  const hasDistrict = (await columnsOf("agent_profiles")).has("district");
  await sqlClient.begin(async (tx) => {
    // Removed: the synthetic history, plus any later app transaction with a synthetic user
    // (e.g. a real customer cashing out at a synthetic agent) — it can't outlive that user.
    const doomed = tx`(id like 'syn\\_%' or sender_user_id like 'syn\\_%' or receiver_user_id like 'syn\\_%' or commission_user_id like 'syn\\_%'
                       or cash_effect_user_id like 'syn\\_%' or pending_hold_user_id like 'syn\\_%' or pending_credit_user_id like 'syn\\_%')`;
    // Undo their effect on the accounts that stay (same rules as ledger.post for settled rows).
    const rows = await tx`select status, amount, sender_fee, receiver_fee, sender_user_id, receiver_user_id, commission_user_id, commission_amount, cash_effect_user_id, cash_effect_delta
                          from transactions where ${doomed} and status in ('SUCCESSFUL', 'REFUNDED')`;
    const delta = new Map();
    const add = (userId, available, cash = 0) => {
      if (!userId || userId.startsWith("syn_")) return;
      const d = delta.get(userId) ?? { available: 0, cash: 0 };
      d.available += available;
      d.cash += cash;
      delta.set(userId, d);
    };
    for (const r of rows) {
      add(r.sender_user_id, -(Number(r.amount) + Number(r.sender_fee)));
      add(r.receiver_user_id, Number(r.amount) - Number(r.receiver_fee));
      add(r.commission_user_id, Number(r.commission_amount ?? 0));
      add(r.cash_effect_user_id, 0, Number(r.cash_effect_delta ?? 0));
    }
    for (const [userId, d] of delta) {
      if (!d.available && !d.cash) continue;
      const [w] = await tx`select available, cash_in_hand from wallets where user_id = ${userId}`;
      if (!w) continue;
      if (Number(w.available) - d.available < 0 || (w.cash_in_hand !== null && Number(w.cash_in_hand) - d.cash < 0)) {
        throw new Error(`Can't reset: ${userId} has since spent synthetic money (its balance would go negative). Nothing was changed.`);
      }
      await tx`update wallets set available = available - ${d.available}, cash_in_hand = case when cash_in_hand is null then null else cash_in_hand - ${d.cash} end,
               version = version + 1, updated_at = now() where user_id = ${userId}`;
    }
    const removed = {};
    removed.commissions = (await tx`delete from commissions where id like 'syn\\_%' or agent_id like 'syn\\_%' or trx_id in (select trx_id from transactions where ${doomed})`).count;
    removed.transactions = (await tx`delete from transactions where ${doomed}`).count;
    removed.history = (await tx`delete from account_status_history where id like 'syn\\_%'`).count;
    removed.wallets = (await tx`delete from wallets where id like 'syn\\_%'`).count;
    await tx`delete from personal_profiles where user_id like 'syn\\_%'`;
    await tx`delete from agent_profiles where user_id like 'syn\\_%'`;
    await tx`delete from merchant_profiles where user_id like 'syn\\_%'`;
    await tx`delete from merchant_businesses where id like 'syn\\_%'`;
    // Sessions, notifications, one-time codes etc. of synthetic users go with them (on delete cascade).
    removed.users = (await tx`delete from users where id like 'syn\\_%'`).count;
    if (hasDistrict) {
      await tx`update agent_profiles set district = null, area = null where user_id = ${DEMO_AGENT}`;
      await tx`update merchant_businesses set district = null, area = null where user_id = ${DEMO_MERCHANT}`;
    }
    const [{ exists }] = await tx`select to_regclass('public.ai_insights') is not null as exists`;
    if (exists) removed.aiInsights = (await tx`delete from ai_insights`).count;
    console.log(`Removed synthetic data: ${Object.entries(removed).map(([k, v]) => `${k}=${v}`).join(", ")}. Balances of the remaining accounts restored.`);
  });
}

try {
  if (RESET) {
    if (OFFLINE) throw new Error("--reset needs the database (drop --offline).");
    await reset();
  } else {
    await seed();
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await sqlClient?.end({ timeout: 5 });
}
