"use client";

import { CloudCheck, CloudOff, LoaderCircle, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  retryDiagnosticCloud,
  useDiagnosticCloud,
} from "@/lib/diagnostic-cloud-sync";

export function DiagnosticCloudStatus() {
  const t = useTranslations("diagnostic");
  const { enabled, status } = useDiagnosticCloud();
  if (!enabled || status === "idle" || status === "loading") return null;

  if (status === "offline") {
    return (
      <span className="flex flex-wrap items-center justify-end gap-2 text-xs text-amber-800">
        <CloudOff aria-hidden className="h-4 w-4" />
        {t("cloudLocalOnly")}
        <button
          type="button"
          onClick={() => void retryDiagnosticCloud()}
          className="inline-flex items-center gap-1 font-semibold hover:underline"
        >
          <RotateCw aria-hidden className="h-3.5 w-3.5" />
          {t("retryCloud")}
        </button>
      </span>
    );
  }
  if (status === "syncing") {
    return (
      <span className="flex items-center gap-2 text-xs text-muted">
        <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
        {t("cloudSaving")}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs text-muted">
      <CloudCheck aria-hidden className="h-4 w-4 text-emerald-700" />
      {t("cloudSaved")}
    </span>
  );
}
