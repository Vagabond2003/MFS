"use client";

import { CalendarDays, Percent, ShieldCheck, Trophy, Wallet } from "lucide-react";
import { ChartCard, ColumnChart, TrendChart } from "@/components/charts/charts";
import { AccountStatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { DescriptionList, StatTile, Table, TD, TH, THead, TR } from "@/components/ui/data";
import { Alert, EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useApi } from "@/hooks/use-api";
import { api } from "@/services";
import { useI18n } from "@/hooks/use-i18n";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { DocumentList, StatusTimeline, VerificationProgress } from "../shared/verification";

/* ───────────── Commission ───────────── */

export function AgentCommissionView() {
  const { t, lang } = useI18n();
  const c = useApi(() => api.agent.commissions(), [], { tags: ["dashboard", "transactions"] });
  const d = c.data;
  if (c.error && !d) return <ErrorState message={c.error.message} onRetry={c.reload} />;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("Business")} title={t("Commission")} description={t("What you earn on every Cash In, Cash Out, recharge and customer payment.")} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={t("Today")} value={d ? formatMoney(d.today) : "—"} icon={<CalendarDays className="h-4 w-4" />} />
        <StatTile label={t("This week")} value={d ? formatMoney(d.week) : "—"} icon={<Percent className="h-4 w-4" />} />
        <StatTile label={t("This month")} value={d ? formatMoney(d.month) : "—"} icon={<Wallet className="h-4 w-4" />} />
        <StatTile label={t("All time")} value={d ? formatMoney(d.allTime) : "—"} icon={<Trophy className="h-4 w-4" />} />
      </div>
      {d ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <ChartCard title={t("Daily commission")} description={t("Last 30 days")} xKey="date" data={d.daily} series={[{ key: "amount", label: t("Commission") }]}>
            <TrendChart data={d.daily} xKey="date" series={[{ key: "amount", label: t("Commission") }]} />
          </ChartCard>
          <ChartCard title={t("Monthly commission")} description={t("Last 6 months")} xKey="month" data={d.monthly} series={[{ key: "amount", label: t("Commission") }]}>
            <ColumnChart data={d.monthly} xKey="month" series={[{ key: "amount", label: t("Commission") }]} />
          </ChartCard>
        </div>
      ) : (
        <Skeleton className="h-80 rounded-2xl" />
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <Card>
          <CardHeader title={t("By service")} description={t("This month")} />
          <CardBody>
            {d?.byType.length ? (
              <ul className="space-y-4">
                {d.byType.map((row) => {
                  const pct = d.month ? (row.amount / d.month) * 100 : 0;
                  return (
                    <li key={row.type}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-700">{t(row.type)}</span>
                        <span className="tabular font-semibold text-slate-900">{formatMoney(row.amount)}</span>
                      </div>
                      <div className="mt-1.5 h-2 rounded-full bg-accent-100">
                        <div className="h-2 rounded-full bg-accent-600" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{t("{n} transactions", { n: row.count })} · {pct.toFixed(0)}%</p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title={t("No commission this month yet")} />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("Recent commission")} />
          <div className="mt-4">
            {d?.recent.length ? (
              <Table>
                <THead>
                  <TH>{t("Transaction")}</TH>
                  <TH>{t("Service")}</TH>
                  <TH align="right">{t("Base amount")}</TH>
                  <TH align="right">{t("Commission")}</TH>
                  <TH>{t("Date")}</TH>
                </THead>
                <tbody>
                  {d.recent.map((r) => (
                    <TR key={r.id}>
                      <TD className="tabular font-mono text-xs">{r.trxId}</TD>
                      <TD>{t(r.type)}</TD>
                      <TD align="right" className="tabular">{formatMoney(r.base)}</TD>
                      <TD align="right" className="tabular font-semibold text-emerald-700">+{formatMoney(r.amount)}</TD>
                      <TD className="whitespace-nowrap text-slate-500">{formatDateTime(r.createdAt, lang)}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState title={t("No commission yet")} description={t("Commission appears here after your first counter transaction.")} />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ───────────── Verification ───────────── */

export function AgentVerificationView() {
  const { t } = useI18n();
  const profile = useApi(() => api.profile.get(), [], { tags: ["profile"] });
  const p = profile.data;
  if (profile.error && !p) return <ErrorState message={profile.error.message} onRetry={profile.reload} />;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("Business")} title={t("Agent verification")} description={t("Track your application and the documents our team is reviewing.")} />
      {!p ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (
        <>
          <Card className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-100 text-accent-700">
                  <ShieldCheck className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-sm text-slate-500">{t("Current status")}</p>
                  <AccountStatusBadge status={p.user.status} />
                </div>
              </div>
              <p className="tabular text-sm text-slate-500">{t("Agent code")} {p.agent?.agentCode}</p>
            </div>
            <div className="mt-6">
              <VerificationProgress track="AGENT" status={p.user.status} />
            </div>
            {p.user.status === "REJECTED" && p.reviewNote && (
              <Alert tone="danger" title={t("Application not approved")} className="mt-5">
                {t(p.reviewNote)}
              </Alert>
            )}
            {p.user.status === "VERIFIED" && (
              <Alert tone="success" className="mt-5">
                {t("Your agent account is verified. All counter operations are enabled.")}
              </Alert>
            )}
          </Card>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader title={t("Submitted documents")} description={t("Reviewed by an administrator")} />
              <CardBody>
                <DocumentList documents={p.documents} />
              </CardBody>
            </Card>
            <div className="space-y-6">
              <Card>
                <CardHeader title={t("Outlet")} />
                <CardBody>
                  <DescriptionList
                    items={[
                      { label: t("Outlet"), value: p.agent?.outletName ?? "—" },
                      { label: t("Address"), value: p.agent?.businessAddress ?? "—" },
                      { label: t("NID"), value: p.nidMasked ?? "—" },
                      { label: t("Emergency contact"), value: p.agent ? `${p.agent.emergencyContact.name} · ${p.agent.emergencyContact.phone}` : "—" },
                    ]}
                  />
                </CardBody>
              </Card>
              <Card>
                <CardHeader title={t("Status history")} />
                <CardBody>
                  <StatusTimeline events={p.timeline} />
                </CardBody>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
