import { maskPhone } from "@/lib/utils";
import type {
  AccountStatus,
  AdminUserRow,
  AuditLogEntry,
  DisputeView,
  VerificationApplication,
} from "@/types/domain";
import type { AdminApi } from "../../contracts";
import { ApiError } from "../../errors";
import { adminStats } from "../analytics";
import { audit, maskIp, notify, requireCaller } from "../context";
import { randomId } from "../crypto";
import { settleDue } from "../ledger";
import type { DbState, DisputeRecord, UserRecord } from "../schema";
import { read, write } from "../store";
import { toDocumentView, toProfileView, toTransactionView, toWalletView } from "../views";
import { filterTransactions, paginate } from "./account";

const ADMIN = ["ADMIN"] as const;

function businessName(db: DbState, u: UserRecord) {
  if (u.role === "MERCHANT") return db.merchantBusinesses.find((b) => b.userId === u.id)?.businessName ?? null;
  if (u.role === "AGENT") return db.agentProfiles.find((a) => a.userId === u.id)?.outletName ?? null;
  return null;
}

function toRow(db: DbState, u: UserRecord): AdminUserRow {
  return {
    id: u.id,
    name: u.name,
    role: u.role,
    phoneMasked: maskPhone(u.phone),
    email: u.email,
    status: u.status,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    businessName: businessName(db, u),
    isDemo: u.isDemo,
  };
}

const PENDING_STATUSES: AccountStatus[] = ["APPLICATION_SUBMITTED", "UNDER_REVIEW", "PENDING"];

function toApplication(db: DbState, u: UserRecord): VerificationApplication {
  const profile = toProfileView(db, u);
  const agent = db.agentProfiles.find((a) => a.userId === u.id);
  const biz = db.merchantBusinesses.find((b) => b.userId === u.id);
  const details: { label: string; value: string }[] =
    u.role === "AGENT" && agent
      ? [
          { label: "Agent code", value: agent.agentCode },
          { label: "Outlet", value: agent.outletName },
          { label: "Outlet address", value: agent.businessAddress },
          { label: "Home address", value: agent.address },
          { label: "Date of birth", value: agent.dateOfBirth },
          { label: "NID", value: profile.nidMasked ?? "—" },
          { label: "Emergency contact", value: `${agent.emergencyName} (${agent.emergencyRelation}) · ${maskPhone(agent.emergencyPhone)}` },
          { label: "Email", value: u.email ?? "—" },
        ]
      : biz
        ? [
            { label: "Merchant ID", value: biz.merchantId },
            { label: "Owner", value: profile.merchant?.ownerName ?? u.name },
            { label: "Category", value: biz.category },
            { label: "Business address", value: biz.businessAddress },
            { label: "Registration no.", value: biz.registrationNumber },
            { label: "Trade license", value: biz.tradeLicenseNumber },
            { label: "TIN / BIN", value: biz.taxId ?? "—" },
            { label: "Owner NID", value: profile.nidMasked ?? "—" },
            { label: "Email", value: u.email ?? "—" },
          ]
        : [];
  return {
    userId: u.id,
    role: u.role === "AGENT" ? "AGENT" : "MERCHANT",
    applicantName: u.name,
    businessName: businessName(db, u),
    phoneMasked: maskPhone(u.phone),
    status: u.status as VerificationApplication["status"],
    submittedAt: profile.timeline[0]?.at ?? u.createdAt,
    documents: db.documents.filter((d) => d.userId === u.id).map(toDocumentView),
    details,
    timeline: profile.timeline,
    reviewNote: profile.reviewNote,
  };
}

function toDisputeView(db: DbState, d: DisputeRecord): DisputeView {
  const u = db.users.find((x) => x.id === d.userId);
  return {
    id: d.id,
    trxId: d.trxId,
    raisedBy: { id: d.userId, name: u?.name ?? "Unknown", role: u?.role ?? "PERSONAL" },
    reason: d.reason,
    status: d.status,
    amount: d.amount,
    resolution: d.resolution,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function setStatus(db: DbState, u: UserRecord, status: AccountStatus, note: string | null, actor: UserRecord) {
  u.status = status;
  u.updatedAt = new Date().toISOString();
  db.statusHistory.push({ id: randomId("sth"), userId: u.id, status, note, actorId: actor.id, at: u.updatedAt });
}

export const admin: AdminApi = {
  async stats() {
    return write((db) => {
      requireCaller(db, ADMIN);
      settleDue(db);
      return adminStats(db);
    });
  },

  async users({ role = "ALL", status = "ALL", search, page, pageSize }) {
    return read((db) => {
      requireCaller(db, ADMIN);
      const q = search?.trim().toLowerCase();
      const rows = db.users
        .filter((u) => u.role !== "ADMIN")
        .filter((u) => role === "ALL" || u.role === role)
        .filter((u) => status === "ALL" || u.status === status)
        .map((u) => toRow(db, u))
        .filter((r) => !q || `${r.name} ${r.businessName ?? ""} ${r.email ?? ""} ${r.phoneMasked}`.toLowerCase().includes(q) || db.users.find((u) => u.id === r.id)?.phone.includes(q))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return paginate(rows, page, pageSize ?? 10);
    });
  },

  async user(id) {
    return read((db) => {
      requireCaller(db, ADMIN);
      const u = db.users.find((x) => x.id === id && x.role !== "ADMIN");
      if (!u) throw new ApiError("NOT_FOUND", "User not found.");
      const w = db.wallets.find((x) => x.userId === u.id);
      return {
        ...toRow(db, u),
        profile: toProfileView(db, u),
        wallet: w ? toWalletView(w) : null,
        transactionCount: db.transactions.filter((t) => t.sender.userId === u.id || t.receiver.userId === u.id).length,
      };
    });
  },

  async setUserStatus(id, action, reason) {
    await write((db) => {
      const { user: actor } = requireCaller(db, ADMIN);
      const u = db.users.find((x) => x.id === id);
      if (!u || u.role === "ADMIN") throw new ApiError("NOT_FOUND", "User not found.");
      if (reason.trim().length < 5) throw new ApiError("VALIDATION", "Give a reason (at least 5 characters).");
      if (action === "SUSPEND") {
        if (u.status === "SUSPENDED") return;
        setStatus(db, u, "SUSPENDED", reason.trim(), actor);
        const now = new Date().toISOString();
        for (const s of db.sessions) if (s.userId === u.id && !s.revokedAt) s.revokedAt = now;
        notify(db, u.id, "SECURITY_ALERT", "Account suspended", `Your account was suspended: ${reason.trim()}. Contact support for help.`);
        audit(db, { actor, action: "USER_SUSPENDED", target: u.id, metadata: { reason: reason.trim() } });
      } else {
        if (u.status !== "SUSPENDED") return;
        const previous = [...db.statusHistory]
          .filter((h) => h.userId === u.id && h.status !== "SUSPENDED")
          .sort((a, b) => b.at.localeCompare(a.at))[0]?.status;
        const fallback: Record<string, AccountStatus> = { PERSONAL: "PENDING_VERIFICATION", AGENT: "UNDER_REVIEW", MERCHANT: "UNDER_REVIEW" };
        setStatus(db, u, previous ?? fallback[u.role], `Reactivated: ${reason.trim()}`, actor);
        notify(db, u.id, "ACCOUNT_VERIFICATION", "Account reactivated", "Your account has been reactivated.");
        audit(db, { actor, action: "USER_REACTIVATED", target: u.id, metadata: { reason: reason.trim() } });
      }
    });
  },

  async verificationQueue({ role = "ALL", status = "PENDING_ANY" }) {
    return read((db) => {
      requireCaller(db, ADMIN);
      return db.users
        .filter((u) => (u.role === "AGENT" || u.role === "MERCHANT") && (role === "ALL" || u.role === role))
        .filter((u) => (status === "PENDING_ANY" ? PENDING_STATUSES.includes(u.status) : status === "ALL" || u.status === status))
        .map((u) => toApplication(db, u))
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    });
  },

  async decideVerification(userId, decision, note) {
    return write((db) => {
      const { user: actor } = requireCaller(db, ADMIN);
      const u = db.users.find((x) => x.id === userId && x.role !== "ADMIN");
      if (!u) throw new ApiError("NOT_FOUND", "Application not found.");
      if (u.role === "PERSONAL") {
        // Personal e-KYC review: approve or keep pending.
        if (decision !== "APPROVE") throw new ApiError("VALIDATION", "Personal KYC can only be approved here; leave it pending otherwise.");
        if (u.status !== "PENDING_VERIFICATION") throw new ApiError("CONFLICT", "This customer isn't pending verification.");
        setStatus(db, u, "VERIFIED", note.trim() || "KYC approved by reviewer", actor);
        const pp = db.personalProfiles.find((x) => x.userId === u.id);
        if (pp && pp.selfieStatus === "NOT_SUBMITTED") pp.selfieStatus = "PENDING";
        for (const d of db.documents) if (d.userId === u.id && d.status === "PENDING") d.status = "APPROVED";
        notify(db, u.id, "ACCOUNT_VERIFICATION", "You're verified", "Your identity was verified. Full limits are now active.", "/profile");
        audit(db, { actor, action: "KYC_APPROVED", target: u.id, metadata: { role: "PERSONAL" } });
        return toApplication(db, u);
      }
      if (u.status === "SUSPENDED") throw new ApiError("CONFLICT", "Reactivate the account before changing verification.");
      const docs = db.documents.filter((d) => d.userId === u.id);
      const text = note.trim();
      const setNote = (v: string | null) => {
        const p = u.role === "AGENT" ? db.agentProfiles.find((a) => a.userId === u.id) : db.merchantProfiles.find((m) => m.userId === u.id);
        if (p) p.reviewNote = v;
      };

      if (decision === "START_REVIEW") {
        if (u.status === "VERIFIED") throw new ApiError("CONFLICT", "Already verified.");
        setStatus(db, u, "UNDER_REVIEW", text || "Review started", actor);
        notify(db, u.id, "ACCOUNT_VERIFICATION", "Application under review", "Our team has started reviewing your documents.", u.role === "AGENT" ? "/dashboard/agent/verification" : "/dashboard/merchant/business");
      } else if (decision === "APPROVE") {
        if (docs.some((d) => d.status === "REJECTED")) {
          throw new ApiError("CONFLICT", "Some documents are rejected. Ask the applicant to re-upload, or reject the application.");
        }
        const now = new Date().toISOString();
        for (const d of docs) {
          if (d.status === "PENDING") {
            d.status = "APPROVED";
            d.reviewedAt = now;
            d.reviewedBy = actor.id;
          }
        }
        setStatus(db, u, "VERIFIED", text || "Approved", actor);
        setNote(text || "Approved");
        notify(
          db,
          u.id,
          "ACCOUNT_VERIFICATION",
          u.role === "AGENT" ? "You're a verified agent" : "Your business is verified",
          u.role === "AGENT" ? "Agent operations (Cash In, Cash Out, Recharge) are now enabled." : "You can now receive merchant payments and generate QR codes.",
          u.role === "AGENT" ? "/dashboard/agent" : "/dashboard/merchant",
        );
      } else if (decision === "REJECT") {
        if (text.length < 5) throw new ApiError("VALIDATION", "Explain why the application is rejected (at least 5 characters).");
        setStatus(db, u, "REJECTED", text, actor);
        setNote(text);
        notify(db, u.id, "ACCOUNT_VERIFICATION", "Application not approved", text, u.role === "AGENT" ? "/dashboard/agent/verification" : "/dashboard/merchant/business");
      } else {
        throw new ApiError("VALIDATION", "Unknown decision.");
      }
      audit(db, { actor, action: `VERIFICATION_${decision === "START_REVIEW" ? "REVIEW_STARTED" : decision === "APPROVE" ? "APPROVED" : "REJECTED"}`, target: u.id, metadata: { role: u.role, note: text || null } });
      return toApplication(db, u);
    });
  },

  async reviewDocument(documentId, status, note) {
    await write((db) => {
      const { user: actor } = requireCaller(db, ADMIN);
      const d = db.documents.find((x) => x.id === documentId && x.userId);
      if (!d) throw new ApiError("NOT_FOUND", "Document not found.");
      if (status === "REJECTED" && note.trim().length < 3) throw new ApiError("VALIDATION", "Add a note explaining the rejection.");
      d.status = status;
      d.reviewNote = note.trim() || null;
      d.reviewedAt = new Date().toISOString();
      d.reviewedBy = actor.id;
      audit(db, { actor, action: `DOCUMENT_${status}`, target: d.userId, metadata: { document: d.type } });
    });
  },

  async transactions(q) {
    return read((db) => {
      requireCaller(db, ADMIN);
      const views = [...db.transactions]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((t) => toTransactionView(db, t, null));
      return paginate(filterTransactions(views, q), q.page, q.pageSize ?? 15);
    });
  },

  async disputes({ status = "ALL" }) {
    return read((db) => {
      requireCaller(db, ADMIN);
      return db.disputes
        .filter((d) => status === "ALL" || d.status === status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((d) => toDisputeView(db, d));
    });
  },

  async updateDispute(id, status, resolution) {
    return write((db) => {
      const { user: actor } = requireCaller(db, ADMIN);
      const d = db.disputes.find((x) => x.id === id);
      if (!d) throw new ApiError("NOT_FOUND", "Dispute not found.");
      if ((status === "RESOLVED" || status === "REJECTED") && resolution.trim().length < 5) {
        throw new ApiError("VALIDATION", "Add a resolution note for the customer.");
      }
      d.status = status;
      d.resolution = resolution.trim() || d.resolution;
      d.updatedAt = new Date().toISOString();
      notify(db, d.userId, "SYSTEM_ANNOUNCEMENT", `Dispute ${status.toLowerCase()}`, d.resolution ?? `Your dispute on ${d.trxId} is now ${status.toLowerCase()}.`, `/transactions?trx=${d.trxId}`);
      audit(db, { actor, action: "DISPUTE_UPDATED", target: d.trxId, metadata: { status } });
      return toDisputeView(db, d);
    });
  },

  async auditLogs({ search, action, page, pageSize }) {
    return read((db) => {
      requireCaller(db, ADMIN);
      const q = search?.trim().toLowerCase();
      const rows: AuditLogEntry[] = [...db.auditLogs]
        .filter((a) => !action || action === "ALL" || a.action === action)
        .filter((a) => !q || `${a.action} ${a.actorName} ${a.target ?? ""}`.toLowerCase().includes(q))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((a) => ({
          id: a.id,
          action: a.action,
          actor: { id: a.actorId, name: a.actorName, role: a.actorRole },
          target: a.target,
          ipMasked: maskIp(a.ip),
          createdAt: a.createdAt,
          metadata: a.metadata,
        }));
      return paginate(rows, page, pageSize ?? 20);
    });
  },
};
