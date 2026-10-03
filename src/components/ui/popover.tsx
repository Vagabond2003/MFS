"use client";

import { useEffect, useRef, useState } from "react";
import { cn, initials } from "@/lib/utils";

/** Click-to-open popover anchored to its trigger; closes on outside click / Escape. */
export function Popover({
  trigger,
  children,
  align = "right",
  className,
  label,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  className?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className={cn(
            "absolute top-full z-50 mt-2 animate-scale-in overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-float",
            align === "right" ? "right-0" : "left-0",
            className,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** Profile picture, or the name's initials when there is none (or it fails to load). */
export function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = !!src && failed !== src;
  return (
    <span
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-accent-100 text-sm font-bold text-accent-700 ring-2 ring-white",
        className,
      )}
      aria-hidden
    >
      {showImage ? (
        // A plain <img>: pictures come from an authenticated route the image optimizer can't fetch.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" onError={() => setFailed(src)} />
      ) : (
        initials(name)
      )}
    </span>
  );
}
