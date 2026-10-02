"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Field, Textarea } from "./form";

function useBodyLock(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

function useFocusOnOpen(open: boolean, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>("[data-autofocus], input, textarea, select, button:not([data-close])");
      (el ?? ref.current)?.focus();
    }, 20);
    return () => {
      window.clearTimeout(t);
      prev?.focus?.();
    };
  }, [open, ref]);
}

/** Portals render only on the client — avoids touching `document` during SSR. */
const noopSubscribe = () => () => {};

function ClientPortal({ children }: { children: React.ReactNode }) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return mounted ? createPortal(children, document.body) : null;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useBodyLock(open);
  useEscape(open, onClose);
  useFocusOnOpen(open, ref);
  if (!open) return null;
  return (
    <ClientPortal>
      <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
        <div className="absolute inset-0 animate-fade-in bg-slate-950/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={cn(
            "relative z-10 flex max-h-[92dvh] w-full animate-slide-up flex-col overflow-hidden rounded-t-3xl bg-white shadow-float outline-none sm:animate-scale-in sm:rounded-2xl",
            size === "sm" && "sm:max-w-md",
            size === "md" && "sm:max-w-lg",
            size === "lg" && "sm:max-w-2xl",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold text-slate-900">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
            </div>
            <button
              type="button"
              data-close
              onClick={onClose}
              className="-mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="scroll-thin flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
          {footer && <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">{footer}</div>}
        </div>
      </div>
    </ClientPortal>
  );
}

/** Right-side drawer on desktop, bottom sheet on mobile. */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = "right",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  side?: "right" | "bottom";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useBodyLock(open);
  useEscape(open, onClose);
  useFocusOnOpen(open, ref);
  if (!open) return null;
  return (
    <ClientPortal>
      <div className="fixed inset-0 z-[60]">
        <div className="absolute inset-0 animate-fade-in bg-slate-950/50" onClick={onClose} aria-hidden />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={cn(
            "absolute flex flex-col bg-white shadow-float outline-none",
            side === "right"
              ? "inset-x-0 bottom-0 max-h-[92dvh] animate-slide-up rounded-t-3xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[480px] sm:animate-slide-in-right sm:rounded-none"
              : "inset-x-0 bottom-0 max-h-[85dvh] animate-slide-up rounded-t-3xl",
          )}
        >
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold text-slate-900">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
            </div>
            <button
              type="button"
              data-close
              onClick={onClose}
              className="-mr-2 grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="scroll-thin flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end">{footer}</div>}
        </div>
      </div>
    </ClientPortal>
  );
}

/** Confirmation for irreversible or sensitive actions, with optional reason input. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "default",
  reason,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  tone?: "default" | "danger";
  reason?: { label: string; placeholder?: string; minLength?: number };
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const tooShort = !!reason && text.trim().length < (reason.minLength ?? 5);

  const close = () => {
    if (busy) return;
    setText("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={
        <span className="flex items-center gap-2">
          {tone === "danger" && <TriangleAlert className="h-5 w-5 text-rose-600" aria-hidden />}
          {title}
        </span>
      }
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            loading={busy}
            disabled={tooShort}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(text.trim());
                setText("");
                onClose();
              } catch {
                // The caller surfaced the error; keep the dialog open to retry.
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-slate-600">
        <div>{description}</div>
        {reason && (
          <Field label={reason.label} required hint={`At least ${reason.minLength ?? 5} characters. Saved to the audit log.`}>
            {(p) => <Textarea {...p} value={text} onChange={(e) => setText(e.target.value)} placeholder={reason.placeholder} rows={3} />}
          </Field>
        )}
      </div>
    </Modal>
  );
}
