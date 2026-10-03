import { BD_PHONE } from "@/lib/validation";
import { formatMoney, maskPhone, normalizePhone } from "@/lib/utils";
import type {
  OperationAuth,
  OperationQuote,
  OperationRequest,
  OperationResult,
  OtpPurpose,
  SummaryRow,
} from "@/types/domain";
import type { OperationsApi } from "../../contracts";
import { ApiError } from "../../errors";
import { BILLERS, MFS_SOURCES, providers } from "../../providers";
import { audit, checkOtp, issueOtp, notify, requireCaller } from "../context";
import { verifySecret } from "../crypto";
import { post, settleDue, walletOf, type PostInput } from "../ledger";
import {
  OPERATION_POLICY,
  OTP_STEP_UP_THRESHOLD,
  PERSONAL_LIMITS,
  SECURITY,
  computeFees,
} from "../policy";
import type { DbState, PartyRecord, PaymentRequestRecord, TransactionRecord, UserRecord } from "../schema";
import { write } from "../store";
import { notifyParties } from "../txn-notify";
import { toTransactionView } from "../views";

const OPERATORS: Record<string, string> = {
  GRAMEENPHONE: "Grameenphone",
  ROBI: "Robi",
  BANGLALINK: "Banglalink",
  TELETALK: "Teletalk",
  AIRTEL: "Airtel",
};

interface Resolved {
  user: UserRecord;
  quote: OperationQuote;
  posting: PostInput;
  otp: { destination: string; purpose: OtpPurpose; context: string; reason?: string } | null;
  paymentRequest: PaymentRequestRecord | null;
  refundOf: TransactionRecord | null;
  gatewaySource: string | null;
}

/* ───────────── Party helpers ───────────── */

function selfParty(db: DbState, u: UserRecord): PartyRecord {
  if (u.role === "AGENT") {
    const a = db.agentProfiles.find((p) => p.userId === u.id);
    return { userId: u.id, name: a?.outletName ?? u.name, account: u.phone, kind: "AGENT" };
  }
  if (u.role === "MERCHANT") {
    const b = db.merchantBusinesses.find((x) => x.userId === u.id);
    return { userId: u.id, name: b?.businessName ?? u.name, account: b?.merchantId ?? u.phone, kind: "MERCHANT" };
  }
  return { userId: u.id, name: u.name, account: u.phone, kind: "PERSONAL" };
}

function requirePhone(raw: string, label: string) {
  const phone = normalizePhone(raw ?? "");
  if (!BD_PHONE.test(phone)) throw new ApiError("VALIDATION", `Enter a valid ${label} (01XXXXXXXXX).`);
  return phone;
}

function personalByPhone(db: DbState, phone: string, label: string) {
  const u = db.users.find((x) => x.phone === phone && x.role === "PERSONAL");
  if (!u) throw new ApiError("NOT_FOUND", `No personal Kosh wallet is registered to ${maskPhone(phone)}.`, { details: { field: label } });
  if (u.status === "SUSPENDED") throw new ApiError("FORBIDDEN", "This wallet cannot transact right now.");
  return u;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function outflowToday(db: DbState, userId: string) {
  const since = startOfToday();
  return db.transactions
    .filter((t) => t.sender.userId === userId && Date.parse(t.createdAt) >= since && (t.status === "SUCCESSFUL" || t.status === "PENDING" || t.status === "REFUNDED"))
    .reduce((s, t) => s + t.amount + t.senderFee, 0);
}

function checkPersonalLimits(db: DbState, u: UserRecord, gross: number) {
  const limits = u.status === "VERIFIED" ? PERSONAL_LIMITS.VERIFIED : PERSONAL_LIMITS.PENDING_VERIFICATION;
  if (gross > limits.perTransaction) {
    throw new ApiError("LIMIT_EXCEEDED", `The per-transaction limit for ${u.status === "VERIFIED" ? "verified" : "unverified"} accounts is ${formatMoney(limits.perTransaction, { whole: true })}.`);
  }
  const used = outflowToday(db, u.id);
  if (used + gross > limits.dailyOut) {
    throw new ApiError("LIMIT_EXCEEDED", `This would exceed the daily limit of ${formatMoney(limits.dailyOut, { whole: true })}. Remaining today: ${formatMoney(Math.max(0, limits.dailyOut - used))}.`);
  }
}

/* ───────────── Resolution: the single place an operation is authorised & priced ───────────── */

function resolve(db: DbState, user: UserRecord, req: OperationRequest): Resolved {
  const policy = OPERATION_POLICY[req.kind];
  if (!policy) throw new ApiError("VALIDATION", "Unknown operation.");
  if (!policy.roles.includes(user.role)) {
    throw new ApiError("FORBIDDEN", `${policy.label} is not available for this account type.`);
  }
  if (policy.requiresVerified && user.status !== "VERIFIED") {
    throw new ApiError("ACCOUNT_NOT_VERIFIED", `Your account must be verified before you can use ${policy.label}.`);
  }
  const amount = req.amount;
  if (!Number.isInteger(amount) || amount <= 0) throw new ApiError("VALIDATION", "Enter a valid amount.");
  if (amount < policy.min) throw new ApiError("VALIDATION", `Minimum amount is ${formatMoney(policy.min, { whole: true })}.`);
  if (amount > policy.max) throw new ApiError("LIMIT_EXCEEDED", `Maximum amount is ${formatMoney(policy.max, { whole: true })}.`);

  const me = selfParty(db, user);
  const fees = computeFees(req.kind, amount);
  const wallet = walletOf(db, user.id);
  let posting: PostInput;
  let otp: Resolved["otp"] = null;
  let paymentRequest: PaymentRequestRecord | null = null;
  let refundOf: TransactionRecord | null = null;
  let gatewaySource: string | null = null;
  const extraRows: SummaryRow[] = [];
  const warnings: string[] = [];

  switch (req.kind) {
    case "SEND_MONEY": {
      const to = requirePhone(req.to, "recipient number");
      if (to === user.phone) throw new ApiError("VALIDATION", "You can't send money to your own number.");
      const r = personalByPhone(db, to, "to");
      posting = { type: "SEND_MONEY", sender: me, receiver: { userId: r.id, name: r.name, account: r.phone, kind: "PERSONAL" }, amount, senderFee: fees.senderFee, description: req.reference?.trim() || "Send Money", reference: req.reference?.trim() || null };
      break;
    }
    case "CASH_OUT": {
      const phone = requirePhone(req.agentNumber, "agent number");
      const agent = db.users.find((u) => u.phone === phone && u.role === "AGENT");
      if (!agent) throw new ApiError("NOT_FOUND", `No agent is registered to ${maskPhone(phone)}.`);
      if (agent.status !== "VERIFIED") throw new ApiError("FORBIDDEN", "This agent is not authorised to process Cash Out.");
      if ((walletOf(db, agent.id).cashInHand ?? 0) < amount) {
        throw new ApiError("VALIDATION", "This agent doesn't have enough cash right now. Try a smaller amount or another agent.");
      }
      const party = selfParty(db, agent);
      posting = { type: "CASH_OUT", sender: me, receiver: party, amount, senderFee: fees.senderFee, commission: { userId: agent.id, amount: fees.commission }, cashEffect: { userId: agent.id, delta: -amount }, description: "Cash Out at agent" };
      extraRows.push({ label: "Cash Out charge", value: "1.85%" });
      break;
    }
    case "MOBILE_RECHARGE": {
      const number = requirePhone(req.number, "mobile number");
      const op = OPERATORS[req.operator];
      if (!op) throw new ApiError("VALIDATION", "Choose an operator.");
      if (req.connection !== "PREPAID" && req.connection !== "POSTPAID") throw new ApiError("VALIDATION", "Choose prepaid or postpaid.");
      posting = { type: "MOBILE_RECHARGE", sender: me, receiver: { userId: null, name: op, account: number, kind: "OPERATOR" }, amount, description: `${req.connection === "PREPAID" ? "Prepaid" : "Postpaid"} recharge${number === user.phone ? " (own number)" : ""}` };
      extraRows.push({ label: "Connection", value: req.connection === "PREPAID" ? "Prepaid" : "Postpaid" });
      break;
    }
    case "BILL_PAYMENT":
    case "AGENT_CUSTOMER_PAYMENT": {
      const biller = BILLERS.find((b) => b.id === req.billerId);
      if (!biller) throw new ApiError("VALIDATION", "Choose a biller.");
      if (!/^[A-Za-z0-9-]{4,20}$/.test(req.accountNumber ?? "")) throw new ApiError("VALIDATION", `Enter a valid ${biller.accountLabel.toLowerCase()}.`);
      const receiver: PartyRecord = { userId: null, name: biller.name, account: req.accountNumber, kind: "BILLER" };
      if (req.kind === "AGENT_CUSTOMER_PAYMENT") {
        const customerPhone = requirePhone(req.customerPhone, "customer number");
        posting = { type: "BILL_PAYMENT", sender: me, receiver, amount, commission: { userId: user.id, amount: fees.commission }, cashEffect: { userId: user.id, delta: amount }, description: `Bill payment for customer ${maskPhone(customerPhone)}`, reference: customerPhone };
        extraRows.push({ label: "Collect in cash", value: formatMoney(amount) });
      } else {
        posting = { type: "BILL_PAYMENT", sender: me, receiver, amount, senderFee: fees.senderFee, description: `${biller.name} bill` };
      }
      break;
    }
    case "MERCHANT_PAYMENT": {
      let merchantUserId: string;
      if (req.paymentCode) {
        const pr = db.paymentRequests.find((p) => p.id === req.paymentCode);
        if (!pr) throw new ApiError("NOT_FOUND", "Payment request not found.");
        if (pr.status !== "AWAITING" || Date.parse(pr.expiresAt) <= Date.now()) throw new ApiError("CONFLICT", "This payment request is no longer active.");
        if (pr.amount !== amount) throw new ApiError("VALIDATION", `This QR requests exactly ${formatMoney(pr.amount)}.`);
        paymentRequest = pr;
        merchantUserId = pr.merchantUserId;
      } else {
        const biz = db.merchantBusinesses.find((b) => b.merchantId === (req.merchantId ?? "").trim().toUpperCase());
        if (!biz) throw new ApiError("NOT_FOUND", "No merchant found with this Merchant ID.");
        merchantUserId = biz.userId;
      }
      const merchant = db.users.find((u) => u.id === merchantUserId)!;
      if (merchant.status !== "VERIFIED") {
        throw new ApiError("FORBIDDEN", "This merchant is not verified to receive payments yet.");
      }
      posting = {
        type: "MERCHANT_PAYMENT",
        sender: me,
        receiver: selfParty(db, merchant),
        amount,
        receiverFee: fees.receiverFee,
        paymentMethod: paymentRequest ? "QR_SCAN" : "MERCHANT_ID",
        description: req.reference?.trim() || `Payment to ${selfParty(db, merchant).name}`,
        reference: req.reference?.trim() || paymentRequest?.note || null,
      };
      break;
    }
    case "ADD_MONEY": {
      const sources: Record<string, PartyRecord> = {
        src_bank_demo: { userId: null, name: "Demo Bank — Savings", account: "•••• 4521", kind: "BANK" },
        src_card_test: { userId: null, name: "Test Visa card", account: "•••• 1111", kind: "BANK" },
      };
      const wallet = MFS_SOURCES.find((s) => s.id === req.sourceId);
      let source = sources[req.sourceId];
      if (wallet) {
        // External wallets aren't linked: the customer authorises each pull with a code sent to that wallet number.
        const walletNumber = requirePhone(req.walletNumber ?? "", `${wallet.label} number`);
        source = { userId: null, name: wallet.label, account: walletNumber, kind: "EXTERNAL" };
        otp = {
          destination: walletNumber,
          purpose: "TRANSACTION",
          context: "",
          reason: `Enter the code sent to your ${wallet.label} number ${maskPhone(walletNumber)} to approve this transfer.`,
        };
      }
      if (!source) throw new ApiError("VALIDATION", "Choose a mobile wallet, bank account or card.");
      gatewaySource = req.sourceId;
      posting = { type: "ADD_MONEY", sender: source, receiver: me, amount, description: `Add Money from ${source.name}` };
      break;
    }
    case "AGENT_CASH_IN": {
      const phone = requirePhone(req.customer, "customer number");
      const c = personalByPhone(db, phone, "customer");
      posting = { type: "CASH_IN", sender: me, receiver: { userId: c.id, name: c.name, account: c.phone, kind: "PERSONAL" }, amount, commission: { userId: user.id, amount: fees.commission }, cashEffect: { userId: user.id, delta: amount }, description: "Cash In at agent" };
      extraRows.push({ label: "Collect in cash", value: formatMoney(amount) });
      break;
    }
    case "AGENT_CASH_OUT": {
      const phone = requirePhone(req.customer, "customer number");
      const c = personalByPhone(db, phone, "customer");
      if ((wallet.cashInHand ?? 0) < amount) throw new ApiError("VALIDATION", "Not enough cash recorded at your outlet for this Cash Out.");
      checkPersonalLimits(db, c, amount + fees.senderFee);
      if (walletOf(db, c.id).available < amount + fees.senderFee) {
        throw new ApiError("INSUFFICIENT_FUNDS", "The customer's balance isn't enough for this Cash Out (amount + fee).");
      }
      posting = { type: "CASH_OUT", sender: { userId: c.id, name: c.name, account: c.phone, kind: "PERSONAL" }, receiver: me, amount, senderFee: fees.senderFee, commission: { userId: user.id, amount: fees.commission }, cashEffect: { userId: user.id, delta: -amount }, description: "Agent-assisted Cash Out" };
      otp = { destination: c.phone, purpose: "CUSTOMER_CASH_OUT", context: "" };
      extraRows.push({ label: "Customer pays fee", value: formatMoney(fees.senderFee) }, { label: "Hand over in cash", value: formatMoney(amount) });
      break;
    }
    case "AGENT_RECHARGE": {
      const number = requirePhone(req.number, "mobile number");
      const op = OPERATORS[req.operator];
      if (!op) throw new ApiError("VALIDATION", "Choose an operator.");
      posting = { type: "MOBILE_RECHARGE", sender: me, receiver: { userId: null, name: op, account: number, kind: "OPERATOR" }, amount, commission: { userId: user.id, amount: fees.commission }, cashEffect: { userId: user.id, delta: amount }, description: "Recharge for customer" };
      extraRows.push({ label: "Collect in cash", value: formatMoney(amount) });
      break;
    }
    case "MERCHANT_REFUND": {
      const original = db.transactions.find((t) => t.trxId === (req.trxId ?? "").trim().toUpperCase());
      if (!original || original.receiver.userId !== user.id || original.type !== "MERCHANT_PAYMENT") {
        throw new ApiError("NOT_FOUND", "Payment not found for this business.");
      }
      if (original.status !== "SUCCESSFUL") throw new ApiError("CONFLICT", "Only successful payments can be refunded.");
      if ((Date.now() - Date.parse(original.createdAt)) / 86_400_000 > SECURITY.refundWindowDays) {
        throw new ApiError("CONFLICT", `Refunds are allowed within ${SECURITY.refundWindowDays} days of payment.`);
      }
      const refundable = original.amount - original.refundedAmount;
      if (amount > refundable) throw new ApiError("VALIDATION", `You can refund at most ${formatMoney(refundable)} on this payment.`);
      if (!req.reason || req.reason.trim().length < 3) throw new ApiError("VALIDATION", "Enter a reason for the refund.");
      refundOf = original;
      posting = { type: "REFUND", sender: me, receiver: original.sender, amount, relatedTrxId: original.trxId, description: `Refund: ${req.reason.trim().slice(0, 80)}` };
      extraRows.push({ label: "Original payment", value: `${original.trxId} · ${formatMoney(original.amount)}` });
      break;
    }
    case "SETTLEMENT": {
      const isAgent = user.role === "AGENT";
      const biz = db.merchantBusinesses.find((b) => b.userId === user.id);
      const bankParty: PartyRecord = isAgent
        ? { userId: null, name: "Demo Bank — Agent Float", account: "•••• 9020", kind: "BANK" }
        : { userId: null, name: biz?.settlementAccount.split(" •")[0] || "Settlement bank", account: biz?.settlementAccount.includes("•") ? `•${biz.settlementAccount.split(" •")[1]}` : "Not linked", kind: "BANK" };
      if (!isAgent && biz?.settlementAccount === "Not linked yet") throw new ApiError("VALIDATION", "Link a settlement bank account first.");
      const settleAt = new Date(Date.now() + 2 * 60_000).toISOString();
      if (req.direction === "FLOAT_TOP_UP") {
        if (!isAgent) throw new ApiError("FORBIDDEN", "Float top-up is only available to agents.");
        if ((wallet.cashInHand ?? 0) < amount) throw new ApiError("VALIDATION", "Top-up can't exceed the cash recorded at your outlet.");
        posting = { type: "SETTLEMENT", status: "PENDING", sender: bankParty, receiver: me, amount, cashEffect: { userId: user.id, delta: -amount }, creditReceiverOnSettle: true, settleAt, settlementDirection: "FLOAT_TOP_UP", description: "Float top-up · cash deposited at bank" };
      } else if (req.direction === "TO_BANK") {
        posting = { type: "SETTLEMENT", status: "PENDING", sender: me, receiver: bankParty, amount, holdSender: true, settleAt, settlementDirection: "TO_BANK", description: "Settlement to bank" };
      } else {
        throw new ApiError("VALIDATION", "Choose a settlement type.");
      }
      warnings.push("Settlements clear in about 2 minutes in this demo environment (T+0 in production).");
      break;
    }
    default:
      throw new ApiError("VALIDATION", "Unsupported operation.");
  }

  // Personal limits apply to customer-initiated outflows.
  if (user.role === "PERSONAL" && posting.sender.userId === user.id) {
    checkPersonalLimits(db, user, amount + (posting.senderFee ?? 0));
  }

  // Effect on the caller's spendable balance.
  let delta = 0;
  if (posting.sender.userId === user.id) delta -= amount + (posting.senderFee ?? 0);
  if (posting.receiver.userId === user.id && posting.status !== "PENDING") delta += amount - (posting.receiverFee ?? 0);
  if (posting.commission?.userId === user.id) delta += posting.commission.amount;
  const balanceAfter = wallet.available + delta;
  if (balanceAfter < 0) throw new ApiError("INSUFFICIENT_FUNDS", `Insufficient balance. Available: ${formatMoney(wallet.available)}.`);

  // Step-up authentication.
  const selfStepUp =
    !otp &&
    req.kind !== "ADD_MONEY" &&
    req.kind !== "MERCHANT_REFUND" &&
    amount + (posting.senderFee ?? 0) >= OTP_STEP_UP_THRESHOLD;
  if (selfStepUp) otp = { destination: user.phone, purpose: "TRANSACTION", context: "" };
  if (otp) otp.context = `op:${user.id}:${req.kind}:${amount}:${posting.sender.account}:${posting.receiver.account}`;

  const senderFee = posting.senderFee ?? 0;
  const myFee = posting.sender.userId === user.id ? senderFee : posting.receiver.userId === user.id ? posting.receiverFee ?? 0 : 0;
  const myCommission = posting.commission?.userId === user.id ? posting.commission.amount : 0;
  const outgoing = posting.sender.userId === user.id;
  const counterparty = outgoing ? posting.receiver : posting.sender;
  const display = (p: PartyRecord) => (p.kind === "PERSONAL" || p.kind === "AGENT" || p.kind === "OPERATOR" ? maskPhone(p.account) : p.account);

  const summary: SummaryRow[] = [
    { label: outgoing ? "To" : "From", value: `${counterparty.name} · ${display(counterparty)}` },
    ...extraRows,
    { label: "Amount", value: formatMoney(amount) },
  ];
  if (req.kind === "AGENT_CASH_OUT") {
    summary.push({ label: "Customer total debit", value: formatMoney(amount + senderFee), emphasis: true });
  } else {
    summary.push({ label: posting.receiverFee && !outgoing ? "Merchant service fee" : "Fee", value: myFee ? formatMoney(myFee) : "Free" });
    summary.push({ label: outgoing ? "Total" : "You receive", value: formatMoney(outgoing ? amount + myFee : amount - myFee), emphasis: true });
  }
  if (myCommission) summary.push({ label: "Your commission", value: formatMoney(myCommission) });

  return {
    user,
    posting,
    otp,
    paymentRequest,
    refundOf,
    gatewaySource,
    quote: {
      kind: req.kind,
      amount,
      fee: myFee,
      commission: myCommission,
      total: outgoing ? amount + myFee : amount - myFee,
      balanceAfter,
      counterparty: { name: counterparty.name, account: display(counterparty), kind: counterparty.kind },
      requiresOtp: !!otp,
      otpTarget: otp ? (otp.purpose === "CUSTOMER_CASH_OUT" ? "CUSTOMER" : "SELF") : null,
      otpDestination: otp ? maskPhone(otp.destination) : null,
      otpReason: otp
        ? otp.reason
          ? otp.reason
          : otp.purpose === "CUSTOMER_CASH_OUT"
          ? `The customer must approve with the code sent to ${maskPhone(otp.destination)}.`
          : `Transactions of ${formatMoney(OTP_STEP_UP_THRESHOLD, { whole: true })} or more need a one-time code.`
        : null,
      summary,
      warnings,
    },
  };
}

/* ───────────── Public handlers ───────────── */

export const operations: OperationsApi = {
  async quote(req) {
    return write((db) => {
      settleDue(db);
      const { user } = requireCaller(db);
      return resolve(db, user, req).quote;
    });
  },

  async requestOtp(req) {
    return write(async (db) => {
      const { user } = requireCaller(db);
      const r = resolve(db, user, req);
      if (!r.otp) throw new ApiError("VALIDATION", "This transaction doesn't need a one-time code.");
      return issueOtp(db, { purpose: r.otp.purpose, destination: r.otp.destination, userId: user.id, context: r.otp.context });
    });
  },

  async execute(req: OperationRequest, auth: OperationAuth): Promise<OperationResult> {
    if (!auth?.idempotencyKey) throw new ApiError("VALIDATION", "Missing idempotency key.");

    // 1) PIN check commits its attempt counter independently of the posting.
    const pinError = await write<ApiError | null>(async (db) => {
      const { user } = requireCaller(db);
      if (db.idempotency[auth.idempotencyKey]) return null; // replay → handled below
      if (user.pinLockedUntil && Date.parse(user.pinLockedUntil) > Date.now()) {
        return new ApiError("PIN_LOCKED", "PIN locked after too many wrong attempts. Try again in 15 minutes.");
      }
      if (!/^\d{5}$/.test(auth.pin ?? "") || !(await verifySecret(auth.pin, user.pinHash))) {
        user.pinFailedCount += 1;
        audit(db, { actor: user, action: "PIN_FAILED", target: user.id });
        if (user.pinFailedCount >= SECURITY.pinMaxAttempts) {
          user.pinFailedCount = 0;
          user.pinLockedUntil = new Date(Date.now() + SECURITY.pinLockMinutes * 60_000).toISOString();
          notify(db, user.id, "SECURITY_ALERT", "PIN locked", "Your PIN was locked for 15 minutes after 3 wrong attempts. If this wasn't you, change your PIN.", "/profile?tab=security");
          return new ApiError("PIN_LOCKED", "Too many wrong attempts. Your PIN is locked for 15 minutes.");
        }
        const left = SECURITY.pinMaxAttempts - user.pinFailedCount;
        return new ApiError("INVALID_PIN", `Incorrect PIN. ${left} attempt${left === 1 ? "" : "s"} left.`, { details: { attemptsLeft: left } });
      }
      user.pinFailedCount = 0;
      return null;
    });
    if (pinError) throw pinError;

    // 2) Re-authorise, verify OTP, call the gateway if needed, then post atomically.
    const outcome = await write<{ error: ApiError } | { ok: OperationResult }>(async (db) => {
      settleDue(db);
      const { user } = requireCaller(db);
      const prior = db.idempotency[auth.idempotencyKey];
      if (prior) {
        if (prior.userId !== user.id) return { error: new ApiError("CONFLICT", "Duplicate request.") };
        const t = db.transactions.find((x) => x.trxId === prior.trxId)!;
        return { ok: { transaction: toTransactionView(db, t, user.id), balanceAfter: walletOf(db, user.id).available } };
      }

      const r = resolve(db, user, req);
      if (r.otp) {
        if (!auth.otp?.challengeId || !auth.otp.code) {
          return { error: new ApiError("OTP_REQUIRED", "Enter the one-time code to continue.") };
        }
        const err = await checkOtp(db, { challengeId: auth.otp.challengeId, code: auth.otp.code, purpose: r.otp.purpose, context: r.otp.context });
        if (err) return { error: err };
      }

      let t: TransactionRecord;
      if (r.gatewaySource) {
        const charge = await providers.gateway.charge(r.gatewaySource, r.posting.amount);
        t = charge.approved
          ? post(db, { ...r.posting, reference: charge.reference })
          : post(db, { ...r.posting, status: "FAILED", reference: charge.reference, failureReason: charge.declineReason ?? "Declined" });
      } else {
        t = post(db, r.posting);
      }

      if (r.paymentRequest && t.status === "SUCCESSFUL") {
        r.paymentRequest.status = "PAID";
        r.paymentRequest.paidAt = t.createdAt;
        r.paymentRequest.trxId = t.trxId;
        r.paymentRequest.payer = t.sender;
      }
      if (r.refundOf && t.status === "SUCCESSFUL") {
        r.refundOf.refundedAmount += t.amount;
        if (r.refundOf.refundedAmount >= r.refundOf.amount) r.refundOf.status = "REFUNDED";
      }

      notifyParties(db, t);
      audit(db, {
        actor: user,
        action: `TXN_${req.kind}`,
        target: t.trxId,
        metadata: { amount: t.amount, fee: t.senderFee + t.receiverFee, status: t.status },
      });
      db.idempotency[auth.idempotencyKey] = { trxId: t.trxId, userId: user.id, createdAt: t.createdAt };
      return { ok: { transaction: toTransactionView(db, t, user.id), balanceAfter: walletOf(db, user.id).available } };
    });

    if ("error" in outcome) throw outcome.error;
    return outcome.ok;
  },
};
