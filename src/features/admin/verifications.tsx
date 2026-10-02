"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BadgeCheck, BriefcaseBusiness, Check, Eye, FileSearch, Search, Store, X } from "lucide-react";
import { toast } from "sonner";
import { AccountStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { DescriptionList, Tabs } from "@/components/ui/data";
import { Alert, EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { ConfirmDialog, Modal, Sheet } from "@/components/ui/modal";
import { invalidate, useApi } from "@/hooks/use-api";
import { api } from "@/services";
import { toApiError } from "@/services/errors";
import { cn, formatDateTime, formatRelative } from "@/lib/utils";
import type { VerificationApplication, VerificationDocument } from "@/types/domain";
import { DocumentList, StatusTimeline, VerificationProgress, documentLabel } from "../shared/verification";

type RoleFilter = "ALL" | "AGENT" | "MERCHANT";
type StatusFilter = "PENDING_ANY" | "VERIFIED" | "REJECTED" | "ALL";

export function AdminVerifications() {
  return (
    <Suspense>
      <VerificationsInner />
    </Suspense>
  );
}

function VerificationsInner() {
  const params = useSearchParams();
  const [role, setRole] = useState<RoleFilter>("ALL");
  const [status, setStatus] = useState<StatusFilter>("PENDING_ANY");
  const [selected, setSelected] = useState<string | null>(params.get("user"));
  const queue = useApi(() => api.admin.verificationQueue({ role, status }), [role, status], { tags: ["admin"] });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Verifications" description="Review agent and merchant applications. Approve or reject documents, then record a decision." />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <Tabs<StatusFilter>
            ariaLabel="Status"
            value={status}
            onChange={setStatus}
            tabs={[
              { value: "PENDING_ANY", label: "Awaiting review" },
              { value: "VERIFIED", label: "Verified" },
              { value: "REJECTED", label: "Rejected" },
              { value: "ALL", label: "All" },
            ]}
            className="inline-flex"
          />
          <Tabs<RoleFilter>
            ariaLabel="Role"
            value={role}
            onChange={setRole}
            tabs={[
              { value: "ALL", label: "All" },
              { value: "AGENT", label: "Agents" },
              { value: "MERCHANT", label: "Merchants" },
            ]}
            className="inline-flex"
          />
        </div>
        {queue.error ? (
          <ErrorState message={queue.error.message} onRetry={queue.reload} />
        ) : queue.loading ? (
          <Skeleton className="m-6 h-48" />
        ) : !queue.data?.length ? (
          <EmptyState icon={<BadgeCheck className="h-6 w-6" />} title="Nothing here" description={status === "PENDING_ANY" ? "No applications are waiting. New agent and merchant sign-ups appear here." : "No applications match this filter."} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {queue.data.map((a) => {
              const pendingDocs = a.documents.filter((d) => d.status === "PENDING").length;
              return (
                <li key={a.userId}>
                  <button type="button" onClick={() => setSelected(a.userId)} className="flex w-full flex-col gap-3 px-5 py-4 text-left transition hover:bg-slate-50 sm:flex-row sm:items-center sm:px-6">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", a.role === "AGENT" ? "bg-amber-50 text-amber-700" : "bg-indigo-50 text-indigo-700")}>
                        {a.role === "AGENT" ? <BriefcaseBusiness className="h-5 w-5" aria-hidden /> : <Store className="h-5 w-5" aria-hidden />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{a.businessName ?? a.applicantName}</p>
                        <p className="truncate text-xs text-slate-500">
                          {a.role === "AGENT" ? "Agent" : "Merchant"} · {a.applicantName} · {a.phoneMasked} · submitted {formatRelative(a.submittedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pl-[52px] sm:pl-0">
                      <span className="text-xs text-slate-500">
                        {a.documents.length} docs{pendingDocs ? ` · ${pendingDocs} to review` : ""}
                      </span>
                      <AccountStatusBadge status={a.status} />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <ReviewDrawer userId={selected} onClose={() => setSelected(null)} onChanged={queue.reload} />
    </div>
  );
}

function ReviewDrawer({ userId, onClose, onChanged }: { userId: string | null; onClose: () => void; onChanged: () => void }) {
  const all = useApi(() => api.admin.verificationQueue({ role: "ALL", status: "ALL" }), [userId], { enabled: !!userId });
  const app: VerificationApplication | undefined = all.data?.find((a) => a.userId === userId);
  const [decision, setDecision] = useState<"APPROVE" | "REJECT" | "START_REVIEW" | null>(null);
  const [docReject, setDocReject] = useState<VerificationDocument | null>(null);
  const [preview, setPreview] = useState<VerificationDocument | null>(null);

  const refresh = () => {
    all.reload();
    onChanged();
    invalidate("admin");
  };

  const reviewDoc = async (d: VerificationDocument, status: "APPROVED" | "REJECTED", note: string) => {
    try {
      await api.admin.reviewDocument(d.id, status, note);
      toast.success(`${documentLabel(d.type)} ${status.toLowerCase()}`);
      refresh();
    } catch (e) {
      toast.error(toApiError(e).message);
      throw e;
    }
  };

  const decided = app?.status === "VERIFIED" || app?.status === "REJECTED" || app?.status === "SUSPENDED";

  return (
    <Sheet
      open={!!userId}
      onClose={onClose}
      title={app ? app.businessName ?? app.applicantName : "Application"}
      description={app ? `${app.role === "AGENT" ? "Agent" : "Merchant"} application · ${app.phoneMasked}` : undefined}
      footer={
        app &&
        !decided && (
          <>
            {app.status !== "UNDER_REVIEW" && (
              <Button variant="outline" onClick={() => setDecision("START_REVIEW")}>
                <Search className="h-4 w-4" aria-hidden /> Start review
              </Button>
            )}
            <Button variant="danger" onClick={() => setDecision("REJECT")}>
              <X className="h-4 w-4" aria-hidden /> Reject
            </Button>
            <Button onClick={() => setDecision("APPROVE")}>
              <Check className="h-4 w-4" aria-hidden /> Approve
            </Button>
          </>
        )
      }
    >
      {!app ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="space-y-6">
          <div>
            <AccountStatusBadge status={app.status} />
            <div className="mt-4">
              <VerificationProgress track={app.role} status={app.status} />
            </div>
            {app.reviewNote && (
              <Alert tone={app.status === "REJECTED" ? "danger" : "info"} className="mt-4">
                {app.reviewNote}
              </Alert>
            )}
          </div>
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Application details</h3>
            <DescriptionList items={[{ label: "Applicant", value: app.applicantName }, { label: "Submitted", value: formatDateTime(app.submittedAt) }, ...app.details]} />
          </section>
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Documents</h3>
            <DocumentList
              documents={app.documents}
              actions={(d) => (
                <div className="flex gap-1">
                  <button type="button" onClick={() => setPreview(d)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label={`Preview ${documentLabel(d.type)}`}>
                    <Eye className="h-4 w-4" />
                  </button>
                  {d.status !== "APPROVED" && !decided && (
                    <button type="button" onClick={() => void reviewDoc(d, "APPROVED", "")} className="grid h-8 w-8 place-items-center rounded-lg text-emerald-600 hover:bg-emerald-50" aria-label={`Approve ${documentLabel(d.type)}`}>
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                  {d.status !== "REJECTED" && !decided && (
                    <button type="button" onClick={() => setDocReject(d)} className="grid h-8 w-8 place-items-center rounded-lg text-rose-600 hover:bg-rose-50" aria-label={`Reject ${documentLabel(d.type)}`}>
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            />
          </section>
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Status history</h3>
            <StatusTimeline events={app.timeline} />
          </section>
        </div>
      )}

      <ConfirmDialog
        open={!!decision}
        onClose={() => setDecision(null)}
        title={decision === "APPROVE" ? "Approve this application?" : decision === "REJECT" ? "Reject this application?" : "Start review?"}
        description={
          decision === "APPROVE"
            ? `Pending documents are approved and the ${app?.role === "AGENT" ? "agent can start counter operations" : "merchant can receive payments"} immediately.`
            : decision === "REJECT"
              ? "The applicant is notified with your reason. Their account stays locked."
              : "The applicant is notified that their application is under review."
        }
        confirmLabel={decision === "APPROVE" ? "Approve" : decision === "REJECT" ? "Reject application" : "Start review"}
        tone={decision === "REJECT" ? "danger" : "default"}
        reason={decision === "REJECT" ? { label: "Reason shared with the applicant", placeholder: "e.g. NID photo is unreadable — please re-upload." } : undefined}
        onConfirm={async (note) => {
          try {
            await api.admin.decideVerification(userId!, decision!, note);
            toast.success(decision === "APPROVE" ? "Application approved" : decision === "REJECT" ? "Application rejected" : "Review started");
            refresh();
          } catch (e) {
            toast.error(toApiError(e).message);
            throw e;
          }
        }}
      />
      <ConfirmDialog
        open={!!docReject}
        onClose={() => setDocReject(null)}
        title={`Reject ${docReject ? documentLabel(docReject.type) : "document"}?`}
        description="The applicant will need to upload a new version."
        confirmLabel="Reject document"
        tone="danger"
        reason={{ label: "What's wrong with it?", placeholder: "e.g. Expired trade license", minLength: 3 }}
        onConfirm={(note) => reviewDoc(docReject!, "REJECTED", note)}
      />
      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview ? documentLabel(preview.type) : ""} description={preview?.fileName}>
        <div className="grid aspect-[4/3] place-items-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-center">
          <div>
            <FileSearch className="mx-auto h-10 w-10 text-slate-300" aria-hidden />
            <p className="mt-3 text-sm font-medium text-slate-600">Secure document viewer</p>
            <p className="mx-auto mt-1 max-w-xs text-xs text-slate-500">
              In production this streams the file from private object storage via a short-lived signed URL. The development storage provider keeps only metadata and a SHA-256 hash.
            </p>
          </div>
        </div>
      </Modal>
    </Sheet>
  );
}
