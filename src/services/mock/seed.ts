/**
 * DEVELOPMENT SEED DATA — fictional people, businesses and numbers.
 *
 * Generates ~6 months of activity by replaying events through the same
 * ledger `post()` used at runtime, so every seeded balance is exactly the sum
 * of its transaction history.
 */
import { startOfDay, subDays } from "date-fns";
import { DEMO_PASSWORD, DEMO_PIN } from "@/config/demo-accounts";
import type { AccountStatus, BusinessCategory, DocumentType, Role } from "@/types/domain";
import { ApiError } from "../errors";
import { hashSecret, randomId } from "./crypto";
import { post, walletOf, type PostInput } from "./ledger";
import { computeFees } from "./policy";
import { DB_VERSION, type DbState, type PartyRecord, type TransactionRecord, type UserRecord } from "./schema";
import { describeForUser } from "./txn-notify";

const DAY = 86_400_000;
const T = (taka: number) => taka * 100;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface UserSpec {
  key: string;
  role: Role;
  name: string;
  phone: string;
  email: string | null;
  status: AccountStatus;
  twoFactor: boolean;
  createdDaysAgo: number;
}

const USERS: UserSpec[] = [
  { key: "nadia", role: "PERSONAL", name: "Nadia Islam", phone: "01710000001", email: "nadia.demo@example.com", status: "VERIFIED", twoFactor: false, createdDaysAgo: 420 },
  { key: "tanvir", role: "PERSONAL", name: "Tanvir Ahmed", phone: "01710000002", email: "tanvir.demo@example.com", status: "VERIFIED", twoFactor: false, createdDaysAgo: 330 },
  { key: "farhana", role: "PERSONAL", name: "Farhana Kabir", phone: "01710000003", email: null, status: "PENDING_VERIFICATION", twoFactor: false, createdDaysAgo: 190 },
  { key: "rafiq", role: "AGENT", name: "Rafiq Hossain", phone: "01810000001", email: "rafiq.agent.demo@example.com", status: "VERIFIED", twoFactor: false, createdDaysAgo: 260 },
  { key: "shirin", role: "AGENT", name: "Shirin Akter", phone: "01810000002", email: "shirin.agent.demo@example.com", status: "UNDER_REVIEW", twoFactor: false, createdDaysAgo: 4 },
  { key: "spice", role: "MERCHANT", name: "Imran Chowdhury", phone: "01910000001", email: "spicegarden.demo@example.com", status: "VERIFIED", twoFactor: false, createdDaysAgo: 280 },
  { key: "fresh", role: "MERCHANT", name: "Sabina Yasmin", phone: "01910000002", email: "freshmart.demo@example.com", status: "PENDING", twoFactor: false, createdDaysAgo: 1 },
  { key: "admin", role: "ADMIN", name: "Platform Admin", phone: "01300000000", email: "admin@example.com", status: "ACTIVE", twoFactor: true, createdDaysAgo: 500 },
];

const CONTACT_NAMES = ["Rashed Karim", "Mim Akter", "Sajid Hasan", "Lamia Noor", "Arif Mahmud", "Tania Sultana", "Jahid Hasan", "Nusrat Jahan"];
const CUSTOMER_NAMES = [
  "Abdul Malek", "Rokeya Begum", "Sohel Rana", "Mahmuda Khatun", "Habibur Rahman", "Shapla Akter", "Delwar Hossain",
  "Morium Begum", "Kamrul Islam", "Anwara Khatun", "Masud Parvez", "Rehana Parvin", "Nurul Amin", "Jesmin Ara",
  "Faruk Ahmed", "Selina Akter", "Mizanur Rahman", "Popy Das", "Tapan Saha", "Ruma Akter", "Shafiq Ullah", "Lipi Rani",
];
const EXT_MERCHANTS = [
  { name: "Daily Needs Superstore", id: "MR-51230", min: 300, max: 4500 },
  { name: "Café Aroma", id: "MR-51877", min: 150, max: 900 },
  { name: "City Care Pharmacy", id: "MR-52011", min: 120, max: 2500 },
  { name: "BookNook Store", id: "MR-52390", min: 250, max: 1800 },
  { name: "Urban Threads", id: "MR-53144", min: 800, max: 6000 },
  { name: "QuickRide Transport", id: "MR-53420", min: 90, max: 650 },
];
const OPERATORS = [
  { name: "Grameenphone", code: "GRAMEENPHONE", prefix: "017" },
  { name: "Robi", code: "ROBI", prefix: "018" },
  { name: "Banglalink", code: "BANGLALINK", prefix: "019" },
  { name: "Airtel", code: "AIRTEL", prefix: "016" },
  { name: "Teletalk", code: "TELETALK", prefix: "015" },
];
const FAIL_REASONS = ["Network timeout at provider", "Declined by receiving institution", "Session timed out"];

export async function buildSeed(): Promise<DbState> {
  const now = Date.now();
  const today = startOfDay(new Date(now));
  const rng = mulberry32(20261002);
  const r = {
    chance: (p: number) => rng() < p,
    int: (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min,
    pick: <V>(arr: V[]) => arr[Math.floor(rng() * arr.length)],
    taka: (min: number, max: number, step = 10) => Math.max(step, Math.round((min + rng() * (max - min)) / step) * step) * 100,
    phone: (prefix?: string) =>
      `${prefix ?? `01${"3456789"[Math.floor(rng() * 7)]}`}${String(Math.floor(rng() * 1e8)).padStart(8, "0")}`,
  };
  const iso = (ms: number) => new Date(ms).toISOString();
  const dayAt = (daysAgo: number, hFrom: number, hTo: number) => {
    const d = subDays(today, daysAgo).getTime();
    return d + Math.floor((hFrom + rng() * (hTo - hFrom)) * 3_600_000);
  };

  const db: DbState = {
    version: DB_VERSION,
    seededAt: iso(now),
    users: [],
    personalProfiles: [],
    agentProfiles: [],
    merchantProfiles: [],
    merchantBusinesses: [],
    statusHistory: [],
    documents: [],
    wallets: [],
    transactions: [],
    commissions: [],
    notifications: [],
    otpCodes: [],
    sessions: [],
    auditLogs: [],
    disputes: [],
    paymentRequests: [],
    rateLimits: {},
    idempotency: {},
  };

  /* ───────────── Users, profiles, wallets ───────────── */

  const hashes = await Promise.all(USERS.map(async () => [await hashSecret(DEMO_PASSWORD), await hashSecret(DEMO_PIN)] as const));
  const U: Record<string, UserRecord> = {};
  USERS.forEach((s, i) => {
    const created = iso(now - s.createdDaysAgo * DAY - 3_600_000 * 5);
    const user: UserRecord = {
      id: `usr_demo_${s.key}`,
      role: s.role,
      name: s.name,
      phone: s.phone,
      email: s.email,
      passwordHash: hashes[i][0],
      pinHash: hashes[i][1],
      status: s.status,
      twoFactorEnabled: s.twoFactor,
      isDemo: true,
      failedLoginCount: 0,
      lockedUntil: null,
      pinFailedCount: 0,
      pinLockedUntil: null,
      createdAt: created,
      updatedAt: created,
      lastLoginAt: null,
    };
    U[s.key] = user;
    db.users.push(user);
    if (s.role !== "ADMIN") {
      db.wallets.push({
        id: `wal_${s.key}`,
        userId: user.id,
        currency: "BDT",
        available: 0,
        savings: 0,
        pending: 0,
        cashInHand: s.role === "AGENT" ? (s.key === "rafiq" ? T(150_000) : 0) : null,
        version: 0,
        updatedAt: created,
      });
    }
  });

  const history = (key: string, status: AccountStatus, daysAgo: number, note: string | null, actor: string | null = null) =>
    db.statusHistory.push({ id: randomId("sth"), userId: U[key].id, status, note, actorId: actor, at: iso(now - daysAgo * DAY) });

  const doc = (key: string, type: DocumentType, fileName: string, status: "PENDING" | "APPROVED", daysAgo: number) =>
    db.documents.push({
      id: randomId("doc"),
      userId: U[key].id,
      type,
      fileName,
      mimeType: fileName.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
      sizeBytes: 180_000 + Math.floor(rng() * 1_200_000),
      sha256: "demo",
      storageKey: `demo/${key}/${type.toLowerCase()}`,
      status,
      uploadedAt: iso(now - daysAgo * DAY),
      reviewedAt: status === "APPROVED" ? iso(now - (daysAgo - 1) * DAY) : null,
      reviewNote: null,
      reviewedBy: status === "APPROVED" ? U.admin.id : null,
    });

  db.personalProfiles.push(
    { userId: U.nadia.id, dateOfBirth: "1994-03-18", address: "House 12, Road 7, Dhanmondi, Dhaka 1205", nidNumber: "1994261845372", selfieStatus: "VERIFIED" },
    { userId: U.tanvir.id, dateOfBirth: "1990-11-02", address: "Flat 4B, Lake View Tower, Gulshan 1, Dhaka 1212", nidNumber: "4612957830", selfieStatus: "VERIFIED" },
    { userId: U.farhana.id, dateOfBirth: "1999-07-25", address: "Ward 5, Station Road, Mymensingh 2200", nidNumber: null, selfieStatus: "NOT_SUBMITTED" },
  );
  history("nadia", "PENDING_VERIFICATION", 420, "Account created");
  history("nadia", "VERIFIED", 418, "e-KYC completed", U.admin.id);
  history("tanvir", "PENDING_VERIFICATION", 330, "Account created");
  history("tanvir", "VERIFIED", 329, "e-KYC completed", U.admin.id);
  history("farhana", "PENDING_VERIFICATION", 190, "Account created — identity verification not yet submitted");
  doc("nadia", "NID_FRONT", "nid-front.jpg", "APPROVED", 419);
  doc("nadia", "SELFIE", "selfie-check.jpg", "APPROVED", 419);
  doc("tanvir", "NID_FRONT", "nid-front.jpg", "APPROVED", 330);
  doc("tanvir", "SELFIE", "selfie-check.jpg", "APPROVED", 330);

  db.agentProfiles.push(
    {
      userId: U.rafiq.id,
      agentCode: "AG-10231",
      dateOfBirth: "1985-05-09",
      address: "Mirpur 10, Block C, Dhaka 1216",
      outletName: "Hossain Telecom Point",
      businessAddress: "Shop 14, Mirpur 10 Market, Dhaka 1216",
      emergencyName: "Selina Hossain",
      emergencyRelation: "Spouse",
      emergencyPhone: "01711112233",
      nidNumber: "1985269300417",
      reviewNote: "Documents verified. Outlet visit completed.",
    },
    {
      userId: U.shirin.id,
      agentCode: "AG-10498",
      dateOfBirth: "1992-09-14",
      address: "Kazir Dewri, Chattogram 4000",
      outletName: "Akter Mobile Corner",
      businessAddress: "12 Station Road, Kazir Dewri, Chattogram 4000",
      emergencyName: "Monir Akter",
      emergencyRelation: "Brother",
      emergencyPhone: "01822334455",
      nidNumber: "9215708832",
      reviewNote: null,
    },
  );
  history("rafiq", "APPLICATION_SUBMITTED", 260, "Agent application submitted");
  history("rafiq", "UNDER_REVIEW", 259, "Review started", U.admin.id);
  history("rafiq", "VERIFIED", 256, "Documents verified. Outlet visit completed.", U.admin.id);
  history("shirin", "APPLICATION_SUBMITTED", 4, "Agent application submitted");
  history("shirin", "UNDER_REVIEW", 2, "Review started", U.admin.id);
  doc("rafiq", "NID_FRONT", "nid-front.jpg", "APPROVED", 260);
  doc("rafiq", "NID_BACK", "nid-back.jpg", "APPROVED", 260);
  doc("rafiq", "PHOTO", "photograph.jpg", "APPROVED", 260);
  doc("shirin", "NID_FRONT", "nid-front.jpg", "PENDING", 4);
  doc("shirin", "NID_BACK", "nid-back.jpg", "PENDING", 4);
  doc("shirin", "PHOTO", "photograph.jpg", "PENDING", 4);

  const business = (key: string, merchantId: string, name: string, category: BusinessCategory, address: string, reg: string, tl: string, tin: string | null, acct: string) =>
    db.merchantBusinesses.push({
      id: randomId("biz"),
      userId: U[key].id,
      merchantId,
      businessName: name,
      category,
      businessAddress: address,
      registrationNumber: reg,
      tradeLicenseNumber: tl,
      taxId: tin,
      settlementAccount: acct,
    });
  db.merchantProfiles.push(
    { userId: U.spice.id, ownerName: U.spice.name, ownerNidNumber: "1988264519023", reviewNote: "Business verified." },
    { userId: U.fresh.id, ownerName: U.fresh.name, ownerNidNumber: "3398127654", reviewNote: null },
  );
  business("spice", "MR-40021", "Spice Garden Restaurant", "RESTAURANT", "House 22, Road 11, Banani, Dhaka 1213", "C-178245/2019", "TRAD/DNCC/045812/2024", "512398746011", "Demo Bank •••• 7781");
  business("fresh", "MR-40022", "FreshMart Grocery", "GROCERY", "Plot 9, Sector 4, Uttara, Dhaka 1230", "C-190377/2023", "TRAD/DNCC/078341/2025", null, "Demo Bank •••• 3304");
  history("spice", "PENDING", 280, "Merchant application submitted");
  history("spice", "UNDER_REVIEW", 279, "Review started", U.admin.id);
  history("spice", "VERIFIED", 277, "Business verified.", U.admin.id);
  history("fresh", "PENDING", 1, "Merchant application submitted");
  doc("spice", "TRADE_LICENSE", "trade-license.pdf", "APPROVED", 280);
  doc("spice", "BUSINESS_REGISTRATION", "registration-certificate.pdf", "APPROVED", 280);
  doc("spice", "OWNER_NID", "owner-nid.jpg", "APPROVED", 280);
  doc("spice", "TAX_CERTIFICATE", "tin-certificate.pdf", "APPROVED", 280);
  doc("fresh", "TRADE_LICENSE", "trade-license.pdf", "PENDING", 1);
  doc("fresh", "BUSINESS_REGISTRATION", "registration-certificate.pdf", "PENDING", 1);
  doc("fresh", "OWNER_NID", "owner-nid.jpg", "PENDING", 1);

  /* ───────────── Parties ───────────── */

  const me = (key: string): PartyRecord => {
    const u = U[key];
    if (u.role === "MERCHANT") {
      const b = db.merchantBusinesses.find((x) => x.userId === u.id)!;
      return { userId: u.id, name: b.businessName, account: b.merchantId, kind: "MERCHANT" };
    }
    if (u.role === "AGENT") {
      const a = db.agentProfiles.find((x) => x.userId === u.id)!;
      return { userId: u.id, name: a.outletName, account: u.phone, kind: "AGENT" };
    }
    return { userId: u.id, name: u.name, account: u.phone, kind: "PERSONAL" };
  };
  const contacts = CONTACT_NAMES.map((name) => ({ userId: null, name, account: r.phone(), kind: "PERSONAL" as const }));
  const customers = CUSTOMER_NAMES.map((name) => ({ userId: null, name, account: r.phone(), kind: "PERSONAL" as const }));
  const bank = (label = "Demo Bank", acct = "•••• 4521"): PartyRecord => ({ userId: null, name: label, account: acct, kind: "BANK" });
  const biller = (name: string, acct: string): PartyRecord => ({ userId: null, name, account: acct, kind: "BILLER" });
  const operator = (number: string) => {
    const op = OPERATORS.find((o) => number.startsWith(o.prefix)) ?? OPERATORS[0];
    return { userId: null, name: op.name, account: number, kind: "OPERATOR" as const };
  };

  /* ───────────── Event generation ───────────── */

  type SeedEvent = { at: number; run: (at: string) => void };
  const events: SeedEvent[] = [];
  const add = (at: number, run: SeedEvent["run"]) => {
    if (at < now - 60_000) events.push({ at, run });
  };

  const attempt = (input: PostInput, failRate = 0.03): TransactionRecord | null => {
    if (input.cashEffect) {
      const w = walletOf(db, input.cashEffect.userId);
      if ((w.cashInHand ?? 0) + input.cashEffect.delta < 0) return null;
    }
    if (r.chance(failRate)) {
      return post(db, { ...input, status: "FAILED", commission: null, cashEffect: null, failureReason: r.pick(FAIL_REASONS) });
    }
    try {
      return post(db, input);
    } catch (e) {
      if (e instanceof ApiError && e.code === "INSUFFICIENT_FUNDS") {
        return post(db, { ...input, status: "FAILED", commission: null, cashEffect: null, failureReason: "Insufficient balance" });
      }
      throw e;
    }
  };

  // Opening balances
  add(now - 181 * DAY, (at) => {
    post(db, { type: "ADD_MONEY", sender: bank(), receiver: me("nadia"), amount: T(28_000), description: "Opening transfer from bank", createdAt: at });
    post(db, { type: "ADD_MONEY", sender: bank(), receiver: me("tanvir"), amount: T(15_000), description: "Opening transfer from bank", createdAt: at });
    post(db, { type: "ADD_MONEY", sender: bank(), receiver: me("farhana"), amount: T(2_500), description: "Opening transfer from bank", createdAt: at });
    post(db, {
      type: "SETTLEMENT",
      sender: bank("Demo Bank — Agent Float", "•••• 9020"),
      receiver: me("rafiq"),
      amount: T(120_000),
      description: "Opening e-money float",
      settlementDirection: "FLOAT_TOP_UP",
      createdAt: at,
    });
  });

  const PERSONAL = [
    { key: "nadia", salary: T(36_000), salaryDay: 1, billDay: 6, send: 0.13, recv: 0.06, shop: 0.24, recharge: 0.12, cashOut: 0.06, cashIn: 0.01, shopScale: 1 },
    { key: "tanvir", salary: T(30_000), salaryDay: 3, billDay: 8, send: 0.11, recv: 0.07, shop: 0.2, recharge: 0.1, cashOut: 0.07, cashIn: 0.01, shopScale: 0.9 },
    { key: "farhana", salary: T(9_000), salaryDay: 5, billDay: 10, send: 0.06, recv: 0.1, shop: 0.12, recharge: 0.12, cashOut: 0.05, cashIn: 0.09, shopScale: 0.5 },
  ];
  const personalKeys = PERSONAL.map((p) => p.key);

  for (let d = 180; d >= 0; d--) {
    const date = subDays(today, d);
    const dom = date.getDate();
    const weekday = date.getDay();
    const weekend = weekday === 5 || weekday === 6; // Fri/Sat in Bangladesh

    for (const p of PERSONAL) {
      if (dom === p.salaryDay) {
        add(dayAt(d, 9, 11), (at) =>
          post(db, { type: "ADD_MONEY", sender: bank("Demo Bank", "•••• 4521"), receiver: me(p.key), amount: p.salary, description: "Monthly transfer from salary account", createdAt: at }),
        );
      }
      if (dom === p.billDay) {
        add(dayAt(d, 18, 22), (at) => attempt({ type: "BILL_PAYMENT", sender: me(p.key), receiver: biller("DESCO Electricity", `DSC${p.key.length}8841203`), amount: r.taka(900, 2600), senderFee: T(5), description: "Electricity bill", createdAt: at }));
      }
      if (dom === p.billDay + 2) {
        add(dayAt(d, 18, 22), (at) => attempt({ type: "BILL_PAYMENT", sender: me(p.key), receiver: biller("MetroFiber Internet (demo)", `MF-${p.key.length}20931`), amount: T(p.key === "farhana" ? 800 : 1500), senderFee: T(5), description: "Internet bill", createdAt: at }));
      }
      if (dom === p.billDay + 4 && p.key !== "farhana") {
        add(dayAt(d, 18, 22), (at) => attempt({ type: "BILL_PAYMENT", sender: me(p.key), receiver: biller("Titas Gas", `TG${p.key.length}55012`), amount: T(1080), senderFee: T(5), description: "Gas bill", createdAt: at }));
      }
      if (r.chance(p.send)) {
        const toDemo = r.chance(0.3);
        const others = personalKeys.filter((k) => k !== p.key);
        const receiver = toDemo ? me(r.pick(others)) : r.pick(contacts);
        const amount = r.taka(300, 8000, 50);
        add(dayAt(d, 8, 22), (at) =>
          attempt({ type: "SEND_MONEY", sender: me(p.key), receiver, amount, senderFee: computeFees("SEND_MONEY", amount).senderFee, description: r.pick(["Family support", "Shared dinner", "Rent share", "Gift", "Loan return", "Groceries"]), createdAt: at }),
        );
      }
      if (r.chance(p.recv)) {
        add(dayAt(d, 8, 22), (at) =>
          post(db, { type: "SEND_MONEY", sender: r.pick(contacts), receiver: me(p.key), amount: r.taka(500, 6000, 50), description: r.pick(["Payback", "For the trip", "Eid gift", "Tuition fee"]), createdAt: at }),
        );
      }
      if (r.chance(p.shop * (weekend ? 1.4 : 1))) {
        const atSpice = r.chance(0.3);
        const m = r.pick(EXT_MERCHANTS);
        const amount = atSpice ? r.taka(350, 2400) : r.taka(m.min * p.shopScale, m.max * p.shopScale);
        const receiver: PartyRecord = atSpice ? me("spice") : { userId: null, name: m.name, account: m.id, kind: "MERCHANT" };
        add(dayAt(d, 10, 22), (at) =>
          attempt({
            type: "MERCHANT_PAYMENT",
            sender: me(p.key),
            receiver,
            amount,
            receiverFee: computeFees("MERCHANT_PAYMENT", amount).receiverFee,
            paymentMethod: r.chance(0.7) ? "QR_SCAN" : "MERCHANT_ID",
            description: `Payment to ${receiver.name}`,
            createdAt: at,
          }),
        );
      }
      if (r.chance(p.recharge)) {
        const self = r.chance(0.7);
        const number = self ? U[p.key].phone : r.phone(r.pick(OPERATORS).prefix);
        add(dayAt(d, 8, 23), (at) =>
          attempt({ type: "MOBILE_RECHARGE", sender: me(p.key), receiver: operator(number), amount: r.pick([T(20), T(50), T(100), T(149), T(199), T(299), T(499)]), description: self ? "Recharge (own number)" : "Recharge for family", createdAt: at }),
        );
      }
      if (r.chance(p.cashOut)) {
        const amount = r.taka(1000, 6000, 100);
        const f = computeFees("CASH_OUT", amount);
        add(dayAt(d, 9, 21), (at) =>
          attempt({ type: "CASH_OUT", sender: me(p.key), receiver: me("rafiq"), amount, senderFee: f.senderFee, commission: { userId: U.rafiq.id, amount: f.commission }, cashEffect: { userId: U.rafiq.id, delta: -amount }, description: "Cash out at agent", createdAt: at }),
        );
      }
      if (r.chance(p.cashIn)) {
        const amount = r.taka(1000, 8000, 100);
        add(dayAt(d, 9, 21), (at) =>
          attempt({ type: "CASH_IN", sender: me("rafiq"), receiver: me(p.key), amount, commission: { userId: U.rafiq.id, amount: computeFees("AGENT_CASH_IN", amount).commission }, cashEffect: { userId: U.rafiq.id, delta: amount }, description: "Cash in at agent", createdAt: at }, 0.01),
        );
      }
    }

    // Agent: walk-in customers
    const visits = r.int(3, 7) + (weekend ? 2 : 0);
    for (let i = 0; i < visits; i++) {
      const roll = rng();
      const customer = r.pick(customers);
      if (roll < 0.42) {
        const amount = r.taka(300, 12000, 50);
        add(dayAt(d, 9, 21), (at) =>
          attempt({ type: "CASH_IN", sender: me("rafiq"), receiver: customer, amount, commission: { userId: U.rafiq.id, amount: computeFees("AGENT_CASH_IN", amount).commission }, cashEffect: { userId: U.rafiq.id, delta: amount }, description: "Cash in for walk-in customer", createdAt: at }, 0.015),
        );
      } else if (roll < 0.84) {
        const amount = r.taka(300, 10000, 50);
        const f = computeFees("AGENT_CASH_OUT", amount);
        add(dayAt(d, 9, 21), (at) =>
          attempt({ type: "CASH_OUT", sender: customer, receiver: me("rafiq"), amount, senderFee: f.senderFee, commission: { userId: U.rafiq.id, amount: f.commission }, cashEffect: { userId: U.rafiq.id, delta: -amount }, description: "Customer cash out", createdAt: at }, 0.015),
        );
      } else if (roll < 0.95) {
        const amount = r.pick([T(20), T(50), T(100), T(200), T(300), T(500)]);
        const number = customer.account;
        add(dayAt(d, 9, 21), (at) =>
          attempt({ type: "MOBILE_RECHARGE", sender: me("rafiq"), receiver: operator(number), amount, commission: { userId: U.rafiq.id, amount: computeFees("AGENT_RECHARGE", amount).commission }, description: `Recharge for ${customer.name}`, createdAt: at }, 0.02),
        );
      } else {
        const amount = r.taka(500, 3000, 10);
        add(dayAt(d, 9, 21), (at) =>
          attempt({ type: "BILL_PAYMENT", sender: me("rafiq"), receiver: biller(r.pick(["DESCO Electricity", "Dhaka WASA", "Titas Gas"]), `AC${r.int(100000, 999999)}`), amount, commission: { userId: U.rafiq.id, amount: computeFees("AGENT_CUSTOMER_PAYMENT", amount).commission }, cashEffect: { userId: U.rafiq.id, delta: amount }, description: `Bill payment for ${customer.name}`, reference: customer.account, createdAt: at }, 0.02),
        );
      }
    }
    // Agent: evening float rebalance
    add(dayAt(d, 20.5, 20.6), (at) => {
      const w = walletOf(db, U.rafiq.id);
      const cash = w.cashInHand ?? 0;
      if (w.available < T(60_000) && cash > T(90_000)) {
        post(db, { type: "SETTLEMENT", sender: bank("Demo Bank — Agent Float", "•••• 9020"), receiver: me("rafiq"), amount: T(70_000), cashEffect: { userId: U.rafiq.id, delta: -T(70_000) }, settlementDirection: "FLOAT_TOP_UP", description: "Float top-up · cash deposited at bank", createdAt: at });
      } else if (cash < T(45_000) && w.available > T(110_000)) {
        post(db, { type: "SETTLEMENT", sender: me("rafiq"), receiver: bank("Demo Bank — Agent Float", "•••• 9020"), amount: T(60_000), cashEffect: { userId: U.rafiq.id, delta: T(60_000) }, settlementDirection: "TO_BANK", description: "Settlement to bank · cash withdrawn for outlet", createdAt: at });
      } else if (w.available > T(230_000)) {
        post(db, { type: "SETTLEMENT", sender: me("rafiq"), receiver: bank("Demo Bank — Agent Float", "•••• 9020"), amount: T(100_000), settlementDirection: "TO_BANK", description: "Settlement to bank", createdAt: at });
      }
    });

    // Merchant: walk-in & online customers
    const orders = r.int(4, 8) + (weekend ? 3 : 0);
    for (let i = 0; i < orders; i++) {
      const amount = r.taka(180, 2800);
      const roll = rng();
      const method = roll < 0.55 ? "QR_SCAN" : roll < 0.8 ? "MERCHANT_ID" : roll < 0.92 ? "PAYMENT_LINK" : "ONLINE_CHECKOUT";
      const customer = r.pick(customers);
      const ts = dayAt(d, 11, 22.5);
      const recent = method === "ONLINE_CHECKOUT" && now - ts < DAY;
      add(ts, (at) => {
        const input: PostInput = {
          type: "MERCHANT_PAYMENT",
          sender: customer,
          receiver: me("spice"),
          amount,
          receiverFee: computeFees("MERCHANT_PAYMENT", amount).receiverFee,
          paymentMethod: method,
          description: method === "ONLINE_CHECKOUT" ? "Online order" : "Dine-in / takeaway",
          createdAt: at,
        };
        const t = recent
          ? post(db, { ...input, status: "PENDING", creditReceiverOnSettle: true, settleAt: iso(startOfDay(new Date(now + DAY)).getTime() + 10 * 3_600_000) })
          : attempt(input, 0.03);
        if (t && t.status === "SUCCESSFUL" && r.chance(0.018)) {
          const full = r.chance(0.6);
          const refund = full ? t.amount : Math.round(t.amount * 0.3 / 100) * 100;
          add(Date.parse(at) + 2 * 3_600_000, (at2) => {
            const rt = attempt({ type: "REFUND", sender: me("spice"), receiver: t.sender, amount: refund, relatedTrxId: t.trxId, description: full ? "Order cancelled — full refund" : "Partial refund — item unavailable", createdAt: at2 }, 0);
            if (rt?.status === "SUCCESSFUL") {
              t.refundedAmount += refund;
              if (t.refundedAmount >= t.amount) t.status = "REFUNDED";
            }
          });
        }
      });
    }
    // Merchant: weekly settlement on Sundays
    if (weekday === 0) {
      add(dayAt(d, 21, 21.2), (at) => {
        const w = walletOf(db, U.spice.id);
        if (w.available > T(10_000)) {
          const amount = Math.floor((w.available * 0.85) / 10_000) * 10_000;
          post(db, { type: "SETTLEMENT", sender: me("spice"), receiver: bank("Demo Bank", "•••• 7781"), amount, settlementDirection: "TO_BANK", description: "Weekly settlement to bank", createdAt: at });
        }
      });
    }
  }

  // Replay in time order (refund events are inserted as they are scheduled).
  events.sort((a, b) => a.at - b.at);
  for (let i = 0; i < events.length; i++) {
    const before = events.length;
    events[i].run(iso(events[i].at));
    if (events.length !== before) {
      // A refund was scheduled; keep the remaining tail ordered.
      const tail = events.splice(i + 1).sort((a, b) => a.at - b.at);
      events.push(...tail);
    }
  }

  /* ───────────── Currently-pending items ───────────── */

  post(db, {
    type: "ADD_MONEY",
    status: "PENDING",
    sender: bank("Demo Bank", "•••• 4521"),
    receiver: me("nadia"),
    amount: T(5_000),
    description: "Bank transfer (NPSB) — clearing",
    creditReceiverOnSettle: true,
    settleAt: iso(now + 20 * 60_000),
    createdAt: iso(now - 25 * 60_000),
  });
  const rafiqW = walletOf(db, U.rafiq.id);
  if (rafiqW.available > T(40_000)) {
    post(db, { type: "SETTLEMENT", status: "PENDING", sender: me("rafiq"), receiver: bank("Demo Bank — Agent Float", "•••• 9020"), amount: T(25_000), holdSender: true, settlementDirection: "TO_BANK", description: "Settlement to bank", settleAt: iso(now + 6 * 3_600_000), createdAt: iso(now - 2 * 3_600_000) });
  }
  const spiceW = walletOf(db, U.spice.id);
  if (spiceW.available > T(8_000)) {
    const amount = Math.floor((spiceW.available * 0.5) / 10_000) * 10_000;
    post(db, { type: "SETTLEMENT", status: "PENDING", sender: me("spice"), receiver: bank("Demo Bank", "•••• 7781"), amount, holdSender: true, settlementDirection: "TO_BANK", description: "Settlement to bank", settleAt: iso(now + 5 * 3_600_000), createdAt: iso(now - 90 * 60_000) });
  }

  // Savings pots (DPS) — held separately from the spendable balance.
  walletOf(db, U.nadia.id).savings = T(85_000);
  walletOf(db, U.tanvir.id).savings = T(42_500);
  walletOf(db, U.farhana.id).savings = T(6_000);

  /* ───────────── Notifications ───────────── */

  for (const key of ["nadia", "tanvir", "farhana", "rafiq", "spice"]) {
    const uid = U[key].id;
    const mine = db.transactions
      .filter((t) => t.sender.userId === uid || t.receiver.userId === uid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 12);
    for (const t of mine) {
      const n = describeForUser(t, uid);
      if (!n) continue;
      db.notifications.push({
        id: randomId("ntf"),
        userId: uid,
        type: n.type,
        title: n.title,
        body: n.body,
        read: now - Date.parse(t.createdAt) > 1.5 * DAY,
        link: `/transactions?trx=${t.trxId}`,
        createdAt: t.createdAt,
      });
    }
  }
  const announce = iso(now - 3 * 3_600_000);
  for (const u of db.users.filter((x) => x.role !== "ADMIN")) {
    db.notifications.push({ id: randomId("ntf"), userId: u.id, type: "SYSTEM_ANNOUNCEMENT", title: "Scheduled maintenance", body: "Some services may be briefly unavailable on Friday between 2:00–3:00 AM while we upgrade our systems.", read: false, link: null, createdAt: announce });
  }
  const sysNote = (key: string, type: "ACCOUNT_VERIFICATION" | "SECURITY_ALERT", title: string, body: string, hoursAgo: number, link: string | null, read = false) =>
    db.notifications.push({ id: randomId("ntf"), userId: U[key].id, type, title, body, read, link, createdAt: iso(now - hoursAgo * 3_600_000) });
  sysNote("farhana", "ACCOUNT_VERIFICATION", "Complete your verification", "Verify your identity to raise your limits from ৳5,000 to ৳25,000 per transaction.", 30, "/profile");
  sysNote("shirin", "ACCOUNT_VERIFICATION", "Application under review", "Our team has started reviewing your agent documents. This usually takes 1–3 business days.", 48, "/dashboard/agent/verification");
  sysNote("shirin", "ACCOUNT_VERIFICATION", "Application received", "We received your agent application and documents.", 96, "/dashboard/agent/verification", true);
  sysNote("fresh", "ACCOUNT_VERIFICATION", "Documents received", "We received your business documents. Merchant payments will be enabled once verification is complete.", 20, "/dashboard/merchant/business");
  sysNote("tanvir", "SECURITY_ALERT", "Failed sign-in attempt", "Someone entered a wrong password for your account from Chrome on Windows. If this wasn't you, change your password.", 8, "/profile?tab=security");
  sysNote("nadia", "SECURITY_ALERT", "New sign-in", "Your account was accessed from Chrome on Android. If this wasn't you, sign out of all devices.", 26, "/profile?tab=sessions", true);

  /* ───────────── Sessions & audit logs ───────────── */

  const pastSession = (key: string, device: string, location: string, daysAgo: number, revoked: boolean) =>
    db.sessions.push({
      id: randomId("ses"),
      userId: U[key].id,
      device,
      location,
      ip: "198.51.100.17",
      remember: true,
      createdAt: iso(now - daysAgo * DAY),
      lastActiveAt: iso(now - (daysAgo > 1 ? daysAgo - 1 : 0.2) * DAY),
      expiresAt: iso(now + (30 - daysAgo) * DAY),
      revokedAt: revoked ? iso(now - (daysAgo - 1) * DAY) : null,
    });
  pastSession("nadia", "Chrome on Android", "Chattogram, BD (approx.)", 1.1, false);
  pastSession("nadia", "Safari on iOS", "Dhaka, BD (approx.)", 9, true);
  pastSession("rafiq", "Chrome on Android", "Dhaka, BD (approx.)", 2, false);
  pastSession("spice", "Edge on Windows", "Dhaka, BD (approx.)", 3, false);

  const log = (actorKey: string | null, action: string, target: string | null, hoursAgo: number, metadata: Record<string, string | number | boolean | null> = {}) => {
    const actor = actorKey ? U[actorKey] : null;
    db.auditLogs.push({
      id: randomId("aud"),
      actorId: actor?.id ?? null,
      actorRole: actor?.role ?? "SYSTEM",
      actorName: actor?.name ?? "System",
      action,
      target,
      ip: "198.51.100.17",
      createdAt: iso(now - hoursAgo * 3_600_000),
      metadata: { device: "Chrome on Android", ...metadata },
    });
  };
  for (const key of ["nadia", "tanvir", "farhana", "rafiq", "spice", "admin"]) {
    for (const h of [190, 120, 74, 27]) log(key, "LOGIN_SUCCESS", U[key].id, h + r.int(0, 6), { method: key === "admin" ? "PASSWORD_OTP" : "PASSWORD" });
  }
  log(null, "LOGIN_FAILED", U.tanvir.id, 8, { reason: "Wrong password", device: "Chrome on Windows", identifier: "017•••••002" });
  log("shirin", "USER_REGISTERED", U.shirin.id, 96, { role: "AGENT" });
  log("admin", "VERIFICATION_REVIEW_STARTED", U.shirin.id, 48, { role: "AGENT" });
  log("fresh", "USER_REGISTERED", U.fresh.id, 24, { role: "MERCHANT" });
  log("admin", "VERIFICATION_APPROVED", U.rafiq.id, 256 * 24, { role: "AGENT" });
  log("admin", "VERIFICATION_APPROVED", U.spice.id, 277 * 24, { role: "MERCHANT" });
  log("nadia", "PIN_CHANGED", U.nadia.id, 400);
  log("spice", "SETTLEMENT_REQUESTED", U.spice.id, 1.5, { amount: "pending" });
  for (const key of Object.keys(U)) {
    const last = db.auditLogs.filter((a) => a.actorId === U[key].id && a.action === "LOGIN_SUCCESS").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    U[key].lastLoginAt = last?.createdAt ?? null;
  }

  /* ───────────── Disputes ───────────── */

  const recentOut = (key: string, type: TransactionRecord["type"], skip = 0) =>
    db.transactions
      .filter((t) => t.sender.userId === U[key].id && t.type === type && t.status === "SUCCESSFUL")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[skip];
  const dispute = (key: string, t: TransactionRecord | undefined, reason: string, status: "OPEN" | "INVESTIGATING" | "RESOLVED", resolution: string | null, hoursAgo: number) => {
    if (!t) return;
    db.disputes.push({ id: randomId("dsp"), trxId: t.trxId, userId: U[key].id, reason, status, resolution, amount: t.amount, createdAt: iso(now - hoursAgo * 3_600_000), updatedAt: iso(now - (hoursAgo / 2) * 3_600_000) });
  };
  dispute("nadia", recentOut("nadia", "MERCHANT_PAYMENT", 1), "I was charged but the merchant says the payment did not arrive.", "OPEN", null, 20);
  dispute("tanvir", recentOut("tanvir", "SEND_MONEY", 0), "Sent to a wrong number by mistake — requesting reversal.", "INVESTIGATING", null, 52);
  dispute("nadia", recentOut("nadia", "BILL_PAYMENT", 1), "Bill shows unpaid at the biller.", "RESOLVED", "Biller confirmed the payment was posted on their side. No action required.", 300);

  return db;
}
