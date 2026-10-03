"use client";

import { useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/feedback";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";
import { AVATAR_RULES, validateAvatarFile } from "@/lib/validation";
import { api, errorMessage } from "@/services";
import type { UploadedFileRef } from "@/types/domain";

/**
 * Choose, preview and upload a profile picture (JPG, PNG or WebP, ≤ 2 MB).
 * The file is checked here for quick feedback and again on the server
 * (type, size and magic bytes). `onUploaded` decides what the upload is for:
 * the profile page saves it, the registration forms keep it for sign-up.
 */
export function AvatarPicker({
  name,
  currentUrl,
  onUploaded,
  onRemove,
  size = "lg",
  className,
}: {
  name: string;
  currentUrl?: string | null;
  /** `preview` is a data URL of the chosen image, for callers that outlive this picker. */
  onUploaded: (ref: UploadedFileRef, preview: string) => Promise<void> | void;
  onRemove?: () => Promise<void> | void;
  size?: "md" | "lg";
  className?: string;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = preview ?? currentUrl ?? null;

  const choose = async (file: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!file) return;
    const problem = validateAvatarFile(file);
    if (problem) {
      setError(t(problem));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const ref = await api.uploads.upload(file, "AVATAR");
      const dataUrl = await readAsDataUrl(file);
      await onUploaded(ref, dataUrl);
      setPreview(dataUrl);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!onRemove) return;
    setError(null);
    setBusy(true);
    try {
      await onRemove();
      setPreview(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div className="relative">
        <Avatar name={name || "?"} src={shown} className={size === "lg" ? "h-20 w-20 text-2xl" : "h-14 w-14 text-lg"} />
        {busy && (
          <span className="absolute inset-0 grid place-items-center rounded-full bg-white/70">
            <Spinner className="h-5 w-5" />
          </span>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            <Camera className="h-4 w-4" aria-hidden /> {shown ? t("Change photo") : t("Choose photo")}
          </Button>
          {shown && onRemove && (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={remove}>
              <Trash2 className="h-4 w-4" aria-hidden /> {t("Remove")}
            </Button>
          )}
        </div>
        <p className={cn("mt-1.5 text-xs", error ? "font-medium text-rose-600" : "text-slate-500")} role={error ? "alert" : undefined}>
          {error ?? t("JPG, PNG or WebP · up to 2 MB")}
        </p>
        <input
          ref={input}
          type="file"
          accept={AVATAR_RULES.accept}
          className="sr-only"
          tabIndex={-1}
          aria-label={t("Profile picture")}
          onChange={(e) => choose(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
