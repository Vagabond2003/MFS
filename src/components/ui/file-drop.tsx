"use client";

import { useRef, useState } from "react";
import { CircleCheck, FileText, ImageIcon, LoaderCircle, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/services";
import type { UploadPurpose } from "@/services/contracts";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { validateUploadFile } from "@/lib/validation";
import type { UploadedFileRef } from "@/types/domain";

/**
 * Document upload with client-side checks (type, size) for fast feedback.
 * The API re-validates type, size and the file's magic bytes.
 */
export function FileDrop({
  label,
  hint,
  purpose,
  value,
  onChange,
  error,
  required,
}: {
  label: string;
  hint?: string;
  purpose: UploadPurpose;
  value: UploadedFileRef | null | undefined;
  onChange: (v: UploadedFileRef | null) => void;
  error?: string;
  required?: boolean;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handle = async (file: File | undefined) => {
    if (!file) return;
    const problem = validateUploadFile(file);
    if (problem) {
      setLocalError(problem);
      return;
    }
    setLocalError(null);
    setBusy(true);
    try {
      onChange(await api.uploads.upload(file, purpose));
    } catch (e) {
      setLocalError(errorMessage(e));
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const shownError = localError ?? error;
  const isImage = value?.mimeType.startsWith("image/");

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1 text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-500" aria-hidden>*</span>}
      </p>
      {value ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-emerald-600 shadow-sm">
            {isImage ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">{value.fileName}</p>
            <p className="flex items-center gap-1 text-xs text-emerald-700">
              <CircleCheck className="h-3.5 w-3.5" aria-hidden /> {t("Uploaded · {size} KB", { size: (value.sizeBytes / 1024).toFixed(0) })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700"
            aria-label={t("Remove {label}", { label })}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void handle(e.dataTransfer.files?.[0]);
          }}
          disabled={busy}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3.5 text-left transition",
            dragging ? "border-accent-500 bg-accent-50" : "border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-slate-50",
            shownError && "border-rose-300",
          )}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-slate-500 shadow-sm">
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-slate-700">{busy ? t("Uploading and checking…") : t("Click to upload or drag a file here")}</span>
            <span className="block text-xs text-slate-500">{hint ?? t("JPG, PNG or PDF · up to 5 MB")}</span>
          </span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => void handle(e.target.files?.[0])}
      />
      {shownError && (
        <p className="text-[13px] font-medium text-rose-600" role="alert">
          {t(shownError)}
        </p>
      )}
    </div>
  );
}
