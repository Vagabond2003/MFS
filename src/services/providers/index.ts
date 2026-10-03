/**
 * External-service abstractions.
 *
 * In production these are backend adapters (an SMS gateway, a KYC vendor, S3
 * or similar object storage, a bank/card gateway, biller aggregators). The UI
 * never talks to them directly. This repo ships development implementations
 * used by the mock API so every flow can be exercised end-to-end locally.
 * Swap an implementation by providing another class with the same interface.
 */

import type { Biller, BillDetails, FundingSource, Money } from "@/types/domain";

/* ───────────── SMS / OTP delivery ───────────── */

export interface SmsProvider {
  readonly name: string;
  /** Whether codes may be echoed back to the client (development only). */
  readonly exposesCodes: boolean;
  send(to: string, message: string): Promise<{ messageId: string }>;
}

export class DevSmsProvider implements SmsProvider {
  readonly name = "dev-console-sms";
  readonly exposesCodes = true;
  async send(to: string, message: string) {
    if (typeof console !== "undefined") console.info(`[dev-sms → ${to}] ${message}`);
    return { messageId: `dev-${Date.now().toString(36)}` };
  }
}

/* ───────────── KYC / identity ───────────── */

export interface KycProvider {
  readonly name: string;
  startLivenessCheck(): Promise<{ checkId: string; status: "PENDING" | "VERIFIED" | "FAILED" }>;
  matchNid(nid: string, dateOfBirth: string): Promise<{ match: boolean }>;
}

export class DevKycProvider implements KycProvider {
  readonly name = "dev-kyc";
  async startLivenessCheck() {
    return { checkId: `kyc_${Math.random().toString(36).slice(2, 10)}`, status: "VERIFIED" as const };
  }
  /** Any NID ending in 0000 is treated as a mismatch so the failure path can be tested. */
  async matchNid(nid: string) {
    return { match: !nid.endsWith("0000") };
  }
}

/* ───────────── Object storage (document uploads) ───────────── */

export interface StorageProvider {
  readonly name: string;
  put(file: File, key: string): Promise<{ key: string; sha256: string }>;
}

export class DevStorageProvider implements StorageProvider {
  readonly name = "dev-metadata-only";
  /** Hashes the bytes. The bytes themselves are stored by src/server/documents.ts (document_files table). */
  async put(file: File, key: string) {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const sha256 = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    return { key, sha256 };
  }
}

/* ───────────── QR payload codec (shared by merchant & payer) ───────────── */

export interface ParsedQr {
  kind: "STATIC" | "DYNAMIC";
  merchantId: string;
  businessName: string;
  paymentCode: string | null;
  amount: Money | null;
}

/**
 * Format (pipe-delimited, versioned):
 *   static : KOSH1|S|<merchantId>|<businessName>
 *   dynamic: KOSH1|D|<merchantId>|<businessName>|<paymentCode>|<amountMinor>
 * A production deployment would use the national QR standard (EMVCo-based).
 */
export const qrCodec = {
  encodeStatic(merchantId: string, businessName: string) {
    return ["KOSH1", "S", merchantId, sanitize(businessName)].join("|");
  },
  encodeDynamic(merchantId: string, businessName: string, paymentCode: string, amount: Money) {
    return ["KOSH1", "D", merchantId, sanitize(businessName), paymentCode, String(amount)].join("|");
  },
  decode(payload: string): ParsedQr | null {
    const parts = payload.trim().split("|");
    if (parts[0] !== "KOSH1") return null;
    if (parts[1] === "S" && parts.length === 4) {
      return { kind: "STATIC", merchantId: parts[2], businessName: parts[3], paymentCode: null, amount: null };
    }
    if (parts[1] === "D" && parts.length === 6) {
      const amount = Number(parts[5]);
      if (!Number.isInteger(amount)) return null;
      return { kind: "DYNAMIC", merchantId: parts[2], businessName: parts[3], paymentCode: parts[4], amount };
    }
    return null;
  },
};

function sanitize(s: string) {
  return s.replace(/\|/g, " ").slice(0, 60);
}

/* ───────────── Payment gateway (Add Money) ───────────── */

export interface PaymentGateway {
  readonly name: string;
  fundingSources(userId: string): Promise<FundingSource[]>;
  charge(sourceId: string, amount: Money): Promise<{ approved: boolean; reference: string; declineReason?: string }>;
}

/** External mobile wallets that can fund Add Money. The wallet number is entered per transfer. */
export const MFS_SOURCES: FundingSource[] = [
  { id: "src_mfs_bkash", kind: "MFS", label: "bKash", masked: "Mobile wallet" },
  { id: "src_mfs_nagad", kind: "MFS", label: "Nagad", masked: "Mobile wallet" },
  { id: "src_mfs_rocket", kind: "MFS", label: "Rocket", masked: "Mobile wallet" },
  { id: "src_mfs_upay", kind: "MFS", label: "Upay", masked: "Mobile wallet" },
];

export class DevPaymentGateway implements PaymentGateway {
  readonly name = "dev-gateway";
  async fundingSources(): Promise<FundingSource[]> {
    return [
      ...MFS_SOURCES,
      { id: "src_bank_demo", kind: "BANK", label: "Demo Bank — Savings", masked: "•••• 4521" },
      { id: "src_card_test", kind: "CARD", label: "Test Visa card", masked: "•••• 1111" },
    ];
  }
  /** Declines charges ending in .13 taka so the failure path is testable. */
  async charge(sourceId: string, amount: Money) {
    const reference = `GW${Date.now().toString(36).toUpperCase()}`;
    if (amount % 100 === 13) return { approved: false, reference, declineReason: "Declined by issuer (test rule)" };
    return { approved: true, reference };
  }
}

/* ───────────── Biller aggregator ───────────── */

export const BILLERS: Biller[] = [
  { id: "desco", name: "DESCO Electricity", category: "ELECTRICITY", accountLabel: "Account number" },
  { id: "dpdc", name: "DPDC Electricity", category: "ELECTRICITY", accountLabel: "Customer number" },
  { id: "titas", name: "Titas Gas", category: "GAS", accountLabel: "Customer code" },
  { id: "wasa", name: "Dhaka WASA", category: "WATER", accountLabel: "Bill number" },
  { id: "metrofiber", name: "MetroFiber Internet (demo)", category: "INTERNET", accountLabel: "Subscriber ID" },
  { id: "skytv", name: "SkyView Cable TV (demo)", category: "TV", accountLabel: "Subscriber ID" },
  { id: "greenfield", name: "Greenfield School (demo)", category: "EDUCATION", accountLabel: "Student ID" },
];

export interface BillerGateway {
  readonly name: string;
  fetchBill(billerId: string, accountNumber: string): Promise<BillDetails | null>;
}

export class DevBillerGateway implements BillerGateway {
  readonly name = "dev-biller";
  /** Deterministic fake bill derived from the account number. */
  async fetchBill(billerId: string, accountNumber: string): Promise<BillDetails | null> {
    if (!BILLERS.some((b) => b.id === billerId)) return null;
    if (!/^[A-Za-z0-9-]{4,20}$/.test(accountNumber)) return null;
    let h = 0;
    for (const c of `${billerId}:${accountNumber}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const amountDue = (400 + (h % 3600)) * 100;
    const due = new Date();
    due.setDate(due.getDate() + 5 + (h % 10));
    const period = due.toLocaleString("en-US", { month: "long", year: "numeric" });
    const names = ["A. Rahman (demo)", "S. Karim (demo)", "N. Sultana (demo)", "M. Hasan (demo)"];
    return {
      billerId,
      accountNumber,
      customerName: names[h % names.length],
      amountDue,
      dueDate: due.toISOString(),
      period,
    };
  }
}

export const providers = {
  sms: new DevSmsProvider() as SmsProvider,
  kyc: new DevKycProvider() as KycProvider,
  storage: new DevStorageProvider() as StorageProvider,
  gateway: new DevPaymentGateway() as PaymentGateway,
  billers: new DevBillerGateway() as BillerGateway,
};
