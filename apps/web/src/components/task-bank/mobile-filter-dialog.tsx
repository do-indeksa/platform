"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { Topic } from "@/lib/content";
import type { TaskBankFilters } from "@/lib/task-bank";
import { FilterControls } from "./filter-controls";

type MobileFilterDialogProps = {
  open: boolean;
  filters: TaskBankFilters;
  topics: Pick<Topic, "slug" | "slot">[];
  topicLabels: Record<string, string>;
  onApply: (filters: TaskBankFilters) => void;
  onClose: () => void;
};

export function MobileFilterDialog({
  open,
  filters,
  topics,
  topicLabels,
  onApply,
  onClose,
}: MobileFilterDialogProps) {
  const t = useTranslations("taskBank");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(filters);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setDraft(filters);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [filters, open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="task-filter-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-[min(100%,26rem)] max-w-none border-0 bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/35 xl:hidden"
    >
      <form
        method="dialog"
        className="grid h-full grid-rows-[auto_1fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          onApply(draft);
        }}
      >
        <header className="flex min-h-16 items-center justify-between border-b border-line px-5">
          <h2 id="task-filter-title" className="text-lg font-bold">
            {t("filters")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("closeFilters")}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-page hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <X aria-hidden size={20} />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-6">
          <FilterControls
            filters={draft}
            topics={topics}
            topicLabels={topicLabels}
            onChange={setDraft}
          />
        </div>
        <footer className="border-t border-line bg-surface p-4">
          <button
            type="submit"
            className="min-h-12 w-full rounded-lg bg-brand px-5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {t("showResults")}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
