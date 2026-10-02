"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface CodeInputProps {
  length: number;
  value: string;
  onChange: (v: string) => void;
  /** Mask characters (PIN). */
  secret?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  label: string;
  onComplete?: (v: string) => void;
}

/**
 * Segmented numeric entry for OTPs and PINs. One real <input> per digit,
 * supports paste, backspace navigation and the one-time-code autofill hint.
 */
export function CodeInput({ length, value, onChange, secret, autoFocus, disabled, invalid, label, onComplete }: CodeInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const setAt = (i: number, d: string) => {
    const next = (value.slice(0, i) + d + value.slice(i + 1)).replace(/\D/g, "").slice(0, length);
    onChange(next);
    if (next.length === length) onComplete?.(next);
  };

  return (
    <div role="group" aria-label={label} className="flex justify-between gap-2 sm:justify-start">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type={secret ? "password" : "text"}
          inputMode="numeric"
          autoComplete={i === 0 && !secret ? "one-time-code" : "off"}
          maxLength={length}
          disabled={disabled}
          aria-label={`${label} digit ${i + 1}`}
          aria-invalid={invalid || undefined}
          value={d}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, "");
            if (!raw) return;
            if (raw.length > 1) {
              // Paste or autofill into one box
              const next = (value.slice(0, i) + raw).slice(0, length);
              onChange(next);
              refs.current[Math.min(next.length, length - 1)]?.focus();
              if (next.length === length) onComplete?.(next);
              return;
            }
            setAt(i, raw);
            refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              e.preventDefault();
              if (value[i]) onChange(value.slice(0, i) + value.slice(i + 1));
              else if (i > 0) {
                onChange(value.slice(0, i - 1) + value.slice(i));
                refs.current[i - 1]?.focus();
              }
            } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
            else if (e.key === "ArrowRight" && i < length - 1) refs.current[i + 1]?.focus();
          }}
          className={cn(
            "tabular h-12 w-11 rounded-xl border border-slate-200 bg-white text-center text-xl font-semibold text-slate-900 shadow-sm outline-none transition focus:border-accent-500 focus:ring-4 focus:ring-accent-500/15 sm:h-13 sm:w-12",
            invalid && "border-rose-400",
            disabled && "bg-slate-50 opacity-60",
          )}
        />
      ))}
    </div>
  );
}

/** Development-only helper that surfaces the mock SMS code. */
export function DevCodeHint({ code }: { code?: string }) {
  if (!code) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <span className="rounded bg-amber-200 px-1.5 py-0.5 font-bold uppercase tracking-wide">Dev</span>
      Mock SMS provider — code: <span className="tabular font-mono text-sm font-bold tracking-widest">{code}</span>
    </div>
  );
}
