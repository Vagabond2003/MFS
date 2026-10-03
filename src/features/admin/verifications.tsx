"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BadgeCheck, BriefcaseBusiness, Check, Download, ExternalLink, Eye, FileSearch, Search, Store, X } from "lucide-react";
import { toast } from "sonner";
import { AccountStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { DescriptionList, Tabs } from "@/components/ui/data";
import { Alert, EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { ConfirmDialog, Modal, Sheet } from "@/components/ui/modal";
import { invalidate, useApi } from "@/hooks/use-api";
import { api } from "@/services";
import { useI18n } from "@/hooks/use-i18n";
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
  const { t, lang } = useI18n();
  const params = useSearchParams();
  const [role, setRole] = useState<RoleFilter>("ALL");
  const [status, setStatus] = useState<StatusFilter>("PENDING_ANY");
  const [selected, setSelected] = useState<string | null>(params.get("user"));
  const queue = useApi(() => api.admin.verificationQueue({ role, status }), [role, status], { tags: ["admin"] });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("Admin")} title={t("Verifications")} description={t("Review agent and merchant applications. Approve or reject documents, then record a decision.")} />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <Tabs<StatusFilter>
            ariaLabel={t("Status")}
            value={status}
            onChange={setStatus}
            tabs={[
              { value: "PENDING_ANY", label: t("Awaiting review") },
              { value: "VERIFIED", label: t("Verified") },
              { value: "REJECTED", label: t("Rejected") },
              { value: "ALL", label: t("All") },
            ]}
            className="inline-flex"
          />
          <Tabs<RoleFilter>
            ariaLabel={t("Role")}
            value={role}
            onChange={setRole}
            tabs={[
              { value: "ALL", label: t("All") },
              { value: "AGENT", label: t("Agents") },
              { value: "MERCHANT", label: t("Merchants") },
            ]}
            className="inline-flex"
          />
        </div>
        {queue.error ? (
          <ErrorState message={queue.error.message} onRetry={queue.reload} />
        ) : queue.loading ? (
          <Skeleton className="m-6 h-48" />
        ) : !queue.data?.length ? (
          <EmptyState icon={<BadgeCheck className="h-6 w-6" />} title={t("Nothing here")} description={status === "PENDING_ANY" ? t("No applications are waiting. New agent and merchant sign-ups appear here.") : t("No applications match this filter.")} />
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
                          {a.role === "AGENT" ? t("Agent") : t("Merchant")} · {a.applicantName} · {a.phoneMasked} · {t("submitted {when}", { when: formatRelative(a.submittedAt, lang) })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pl-[52px] sm:pl-0">
                      <span className="text-xs text-slate-500">
                        {t("{n} docs", { n: a.documents.length })}{pendingDocs ? ` · ${t("{n} to review", { n: pendingDocs })}` : ""}
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
  const { t, lang } = useI18n();
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
      toast.success(status === "APPROVED" ? t("{doc} approved", { doc: t(documentLabel(d.type)) }) : t("{doc} rejected", { doc: t(documentLabel(d.type)) }));
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
      title={app ? app.businessName ?? app.applicantName : t("Application")}
      description={app ? `${app.role === "AGENT" ? t("Agent application") : t("Merchant application")} · ${app.phoneMasked}` : undefined}
      footer={
        app &&
        !decided && (
          <>
            {app.status !== "UNDER_REVIEW" && (
              <Button variant="outline" onClick={() => setDecision("START_REVIEW")}>
                <Search className="h-4 w-4" aria-hidden /> {t("Start review")}
              </Button>
            )}
            <Button variant="danger" onClick={() => setDecision("REJECT")}>
              <X className="h-4 w-4" aria-hidden /> {t("Reject")}
            </Button>
            <Button onClick={() => setDecision("APPROVE")}>
              <Check className="h-4 w-4" aria-hidden /> {t("Approve")}
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
                {t(app.reviewNote)}
              </Alert>
            )}
          </div>
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("Application details")}</h3>
            <DescriptionList items={[{ label: t("Applicant"), value: app.applicantName }, { label: t("Submitted"), value: formatDateTime(app.submittedAt, lang) }, ...app.details.map((row) => ({ ...row, label: t(row.label), value: t(row.value) }))]} />
          </section>
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("Documents")}</h3>
            <DocumentList
              documents={app.documents}
              actions={(d) => (
                <div className="flex gap-1">
                  <button type="button" onClick={() => setPreview(d)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label={t("Preview {doc}", { doc: t(documentLabel(d.type)) })}>
                    <Eye className="h-4 w-4" />
                  </button>
                  {d.status !== "APPROVED" && !decided && (
                    <button type="button" onClick={() => void reviewDoc(d, "APPROVED", "")} className="grid h-8 w-8 place-items-center rounded-lg text-emerald-600 hover:bg-emerald-50" aria-label={t("Approve {doc}", { doc: t(documentLabel(d.type)) })}>
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                  {d.status !== "REJECTED" && !decided && (
                    <button type="button" onClick={() => setDocReject(d)} className="grid h-8 w-8 place-items-center rounded-lg text-rose-600 hover:bg-rose-50" aria-label={t("Reject {doc}", { doc: t(documentLabel(d.type)) })}>
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            />
          </section>
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("Status history")}</h3>
            <StatusTimeline events={app.timeline} />
          </section>
        </div>
      )}

      <ConfirmDialog
        open={!!decision}
        onClose={() => setDecision(null)}
        title={decision === "APPROVE" ? t("Approve this application?") : decision === "REJECT" ? t("Reject this application?") : t("Start review?")}
        description={
          decision === "APPROVE"
            ? app?.role === "AGENT"
              ? t("Pending documents are approved and the agent can start counter operations immediately.")
              : t("Pending documents are approved and the merchant can receive payments immediately.")
            : decision === "REJECT"
              ? t("The applicant is notified with your reason. Their account stays locked.")
              : t("The applicant is notified that their application is under review.")
        }
        confirmLabel={decision === "APPROVE" ? t("Approve") : decision === "REJECT" ? t("Reject application") : t("Start review")}
        tone={decision === "REJECT" ? "danger" : "default"}
        reason={decision === "REJECT" ? { label: t("Reason shared with the applicant"), placeholder: t("e.g. NID photo is unreadable — please re-upload.") } : undefined}
        onConfirm={async (note) => {
          try {
            await api.admin.decideVerification(userId!, decision!, note);
            toast.success(decision === "APPROVE" ? t("Application approved") : decision === "REJECT" ? t("Application rejected") : t("Review started"));
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
        title={t("Reject {doc}?", { doc: docReject ? t(documentLabel(docReject.type)) : t("document") })}
        description={t("The applicant will need to upload a new version.")}
        confirmLabel={t("Reject document")}
        tone="danger"
        reason={{ label: t("What's wrong with it?"), placeholder: t("e.g. Expired trade license"), minLength: 3 }}
        onConfirm={(note) => reviewDoc(docReject!, "REJECTED", note)}
      />
      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview ? t(documentLabel(preview.type)) : ""} description={preview?.fileName} size="lg">
        {preview && <DocumentViewer key={preview.id} doc={preview} />}
      </Modal>
    </Sheet>
  );
}

type ViewerState = { kind: "loading" } | { kind: "ready"; url: string; mimeType: string } | { kind: "error"; message: string };

/** Loads a document's file from GET /api/documents/:id (admins only, audit-logged) and shows it. */
function DocumentViewer({ doc }: { doc: VerificationDocument }) {
  const { t } = useI18n();
  const [state, setState] = useState<ViewerState>({ kind: "loading" });

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/documents/${encodeURIComponent(doc.id)}`, { credentials: "same-origin", cache: "no-store" });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          if (!cancelled) setState({ kind: "error", message: body?.error?.message ?? t("The file could not be loaded. Please try again.") });
          return;
        }
        const blob = await res.blob();
        url = URL.createObjectURL(blob);
        if (!cancelled) setState({ kind: "ready", url, mimeType: blob.type || doc.mimeType });
      } catch {
        if (!cancelled) setState({ kind: "error", message: t("The file could not be loaded. Please try again.") });
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [doc.id, doc.mimeType, t]);

  if (state.kind === "loading") return <Skeleton className="aspect-[4/3] w-full rounded-2xl" />;
  if (state.kind === "error") {
    return (
      <div className="grid aspect-[4/3] place-items-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center">
        <div>
          <FileSearch className="mx-auto h-10 w-10 text-slate-300" aria-hidden />
          <p className="mx-auto mt-3 max-w-sm text-sm text-slate-600">{state.message}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
        {state.mimeType === "application/pdf" ? (
          <iframe src={state.url} title={doc.fileName} className="h-[65dvh] w-full" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a private blob, not an optimisable asset
          <img src={state.url} alt={t(documentLabel(doc.type))} className="mx-auto max-h-[65dvh] w-auto object-contain" />
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <a href={state.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <ExternalLink className="h-4 w-4" aria-hidden /> {t("Open in new tab")}
        </a>
        <a href={state.url} download={doc.fileName} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <Download className="h-4 w-4" aria-hidden /> {t("Download")}
        </a>
      </div>
    </div>
  );
}
