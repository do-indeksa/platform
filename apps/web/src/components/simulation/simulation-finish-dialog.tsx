"use client";

import { AlertTriangle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

export function SimulationFinishDialog({
  open,
  unansweredCount,
  skippedCount,
  onClose,
  onFinish,
}: {
  open: boolean;
  unansweredCount: number;
  skippedCount: number;
  onClose: () => void;
  onFinish: () => void;
}) {
  const t = useTranslations("simulation");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="finish-exam-title"
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/45"
    >
      <div className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-800">
            <AlertTriangle aria-hidden className="h-5 w-5" />
          </span>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            title={t("returnToExam")}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-page hover:text-ink"
          >
            <X aria-hidden className="h-5 w-5" />
            <span className="sr-only">{t("returnToExam")}</span>
          </button>
        </div>
        <h2 id="finish-exam-title" className="mt-5 text-2xl font-bold">
          {t("finishDialogTitle")}
        </h2>
        <p className="mt-3 leading-7 text-muted">
          {unansweredCount === 0
            ? t("finishDialogComplete")
            : t("finishDialogIncomplete", { count: unansweredCount })}
        </p>
        {skippedCount > 0 && (
          <p className="mt-2 text-sm text-amber-800">
            {t("finishDialogSkipped", { count: skippedCount })}
          </p>
        )}
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="min-h-11 rounded-lg border border-line px-5 font-semibold hover:bg-page"
          >
            {t("returnToExam")}
          </button>
          <button
            type="button"
            onClick={() => {
              dialogRef.current?.close();
              onFinish();
            }}
            className="min-h-11 rounded-lg bg-brand px-5 font-semibold text-on-brand hover:bg-brand-ink"
          >
            {t("confirmFinish")}
          </button>
        </div>
      </div>
    </dialog>
  );
}
