"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PrepPreferences } from "@/lib/prep-settings";

export function PrepSettingsDialog({
  open,
  preferences,
  maxPoints,
  minDate,
  onClose,
  onSave,
}: {
  open: boolean;
  preferences: PrepPreferences;
  maxPoints: number;
  minDate: string;
  onClose: () => void;
  onSave: (preferences: PrepPreferences) => void;
}) {
  const t = useTranslations("prep");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [goalPoints, setGoalPoints] = useState("");
  const [examDate, setExamDate] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setGoalPoints(preferences.goalPoints?.toString() ?? "");
      setExamDate(preferences.examDate ?? "");
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, preferences.examDate, preferences.goalPoints]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="prep-settings-title"
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/45"
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ goalPoints: Number(goalPoints), examDate });
          dialogRef.current?.close();
        }}
        className="p-5 sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="prep-settings-title" className="text-2xl font-bold">
              {t("settingsTitle")}
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted">
              {t("settingsDescription")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            title={t("closeSettings")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-page hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <X aria-hidden className="h-5 w-5" />
            <span className="sr-only">{t("closeSettings")}</span>
          </button>
        </div>

        <div className="mt-7 grid gap-5 sm:grid-cols-2">
          <label
            className="grid gap-2 text-sm font-semibold"
            htmlFor="goal-points"
          >
            {t("goalField")}
            <span className="relative">
              <input
                id="goal-points"
                type="number"
                inputMode="numeric"
                required
                min={1}
                max={maxPoints}
                value={goalPoints}
                onChange={(event) => setGoalPoints(event.target.value)}
                className="h-12 w-full rounded-lg border border-line bg-surface px-3 pr-16 text-base font-medium outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-muted">
                / {maxPoints}
              </span>
            </span>
          </label>
          <label
            className="grid gap-2 text-sm font-semibold"
            htmlFor="exam-date"
          >
            {t("dateField")}
            <input
              id="exam-date"
              type="date"
              required
              min={minDate}
              value={examDate}
              onChange={(event) => setExamDate(event.target.value)}
              className="h-12 w-full rounded-lg border border-line bg-surface px-3 text-base font-medium outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          </label>
        </div>

        <p className="mt-5 text-xs leading-5 text-muted">
          {t("goalDisclaimer", { max: maxPoints })}
        </p>
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="min-h-11 rounded-lg border border-line px-5 text-sm font-semibold transition-colors hover:bg-page"
          >
            {t("cancelSettings")}
          </button>
          <button
            type="submit"
            className="min-h-11 rounded-lg bg-brand px-5 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-hover"
          >
            {t("saveSettings")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
