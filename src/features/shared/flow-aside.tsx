"use client";

import { FlaskConical } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api } from "@/services";
import { useI18n } from "@/hooks/use-i18n";

export function InfoCard({ title, items }: { title: string; items: { label: string; value: React.ReactNode }[] }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <dl className="mt-3 space-y-2.5">
        {items.map((i) => (
          <div key={i.label} className="flex items-start justify-between gap-3 text-sm">
            <dt className="text-slate-500">{i.label}</dt>
            <dd className="text-right font-medium text-slate-800">{i.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/** Testing tips for the development providers (payment gateway, SMS). Hidden with an external backend. */
export function DemoHint({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  if (api.mode === "http") return null;
  return (
    <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/70 p-4 text-sm text-amber-900">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
        <FlaskConical className="h-3.5 w-3.5" aria-hidden /> {t("Testing tips")}
      </p>
      <div className="space-y-1 text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}

export function QuickAmounts({ values, onPick }: { values: number[]; onPick: (v: number) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onPick(v)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-600 transition hover:border-accent-500 hover:text-accent-700"
        >
          ৳{v.toLocaleString("en-IN")}
        </button>
      ))}
    </div>
  );
}
