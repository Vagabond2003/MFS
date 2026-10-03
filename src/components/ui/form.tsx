"use client";

import { forwardRef, useId, useState } from "react";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { passwordStrength } from "@/lib/validation";
import { useI18n } from "@/hooks/use-i18n";

const control =
  "block w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[15px] text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-500/15";

interface FieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  required?: boolean;
  optional?: boolean;
  className?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => React.ReactNode;
}

/** Label + control + hint/error with correct aria wiring. */
export function Field({ label, hint, error, required, optional, className, children }: FieldProps) {
  const { t } = useI18n();
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={id} className="flex items-center gap-1 text-sm font-medium text-slate-700">
          {label}
          {required && <span className="text-rose-500" aria-hidden>*</span>}
          {optional && <span className="font-normal text-slate-400">{t("(optional)")}</span>}
        </label>
      )}
      {children({ id, "aria-invalid": !!error, "aria-describedby": describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] font-medium text-rose-600" role="alert">
          {/* Validation messages come from the shared English schemas. */}
          {t(error)}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { leading?: React.ReactNode; trailing?: React.ReactNode }>(
  function Input({ className, leading, trailing, ...props }, ref) {
    if (!leading && !trailing) return <input ref={ref} className={cn(control, "h-11", className)} {...props} />;
    return (
      <div className="relative">
        {leading && <div className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400">{leading}</div>}
        <input ref={ref} className={cn(control, "h-11", leading && "pl-10", trailing && "pr-11", className)} {...props} />
        {trailing && <div className="absolute inset-y-0 right-2 flex items-center">{trailing}</div>}
      </div>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn(control, "min-h-24 py-2.5", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(control, "h-11 appearance-none pr-10", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
    </div>
  );
});

/** `strengthOf`: pass the current value (e.g. from RHF `watch`) to show a strength meter. */
export const PasswordInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { strengthOf?: string }>(
  function PasswordInput({ strengthOf, className, ...props }, ref) {
    const { t } = useI18n();
    const [visible, setVisible] = useState(false);
    const value = strengthOf ?? "";
    const strength = passwordStrength(value);
    return (
      <div>
        <div className="relative">
          <input ref={ref} type={visible ? "text" : "password"} className={cn(control, "h-11 pr-11", className)} {...props} />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute inset-y-0 right-1.5 my-auto grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={visible ? t("Hide password") : t("Show password")}
            aria-pressed={visible}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {strengthOf !== undefined && value && (
          <div className="mt-2 flex items-center gap-2" aria-live="polite">
            <div className="flex flex-1 gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 flex-1 rounded-full bg-slate-200 transition-colors",
                    i < strength.score && (strength.score <= 1 ? "bg-rose-500" : strength.score === 2 ? "bg-amber-500" : "bg-emerald-500"),
                  )}
                />
              ))}
            </div>
            <span className="w-16 text-right text-xs font-medium text-slate-500">{t(strength.label)}</span>
          </div>
        )}
      </div>
    );
  },
);

/** Bangladeshi mobile number with a fixed +88 prefix. */
export const PhoneInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function PhoneInput(
  { className, ...props },
  ref,
) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[15px] font-medium text-slate-500">+88</span>
      <input
        ref={ref}
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={14}
        placeholder="01XXXXXXXXX"
        className={cn(control, "h-11 pl-12 tracking-wide", className)}
        {...props}
      />
    </div>
  );
});

/** Taka amount entry. The value is a string; conversion happens via toMinor(). */
export const AmountInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function AmountInput(
  { className, ...props },
  ref,
) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-xl font-semibold text-slate-400">৳</span>
      <input
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        className={cn(control, "tabular h-14 pl-10 text-2xl font-semibold tracking-tight", className)}
        {...props}
      />
    </div>
  );
});

export function Checkbox({
  label,
  description,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; description?: React.ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-start gap-3", className)}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer rounded-[5px] border-slate-300 accent-[var(--accent-600)]"
        {...props}
      />
      <span className="text-sm text-slate-600">
        <span className="font-medium text-slate-800">{label}</span>
        {description && <span className="mt-0.5 block text-slate-500">{description}</span>}
      </span>
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-accent-600" : "bg-slate-300",
      )}
    >
      <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
    </button>
  );
}

/** Pill-style choice chips (operators, quick amounts, categories). */
export function ChoiceChips<T extends string | number>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T | null | undefined;
  onChange: (v: T) => void;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
              active
                ? "border-accent-600 bg-accent-600 text-accent-fg"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
