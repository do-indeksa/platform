"use client";

import { useTranslations } from "next-intl";
import { MarkButton } from "@/components/mark-button";
import { recordAttempts, useAttempts } from "@/lib/attempts-store";

export function TaskSelfCheck({
  taskId,
  slot,
}: {
  taskId: string;
  slot: number;
}) {
  const t = useTranslations("tasks");
  const attempts = useAttempts();
  const last = attempts?.findLast((attempt) => attempt.taskId === taskId);

  return (
    <section className="mt-8 space-y-3 rounded-lg border border-zinc-200 p-4">
      <p className="text-sm text-zinc-600">{t("selfCheckPrompt")}</p>
      <div className="flex gap-2">
        <MarkButton
          active={last?.correct === true}
          onClick={() =>
            recordAttempts([
              { taskId, slot, correct: true, source: "practice" },
            ])
          }
          className="border-green-600 text-green-700"
        >
          {t("selfCheckCorrect")}
        </MarkButton>
        <MarkButton
          active={last?.correct === false}
          onClick={() =>
            recordAttempts([
              { taskId, slot, correct: false, source: "practice" },
            ])
          }
          className="border-red-500 text-red-600"
        >
          {t("selfCheckIncorrect")}
        </MarkButton>
      </div>
    </section>
  );
}
