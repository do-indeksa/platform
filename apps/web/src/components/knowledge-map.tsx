"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAttempts } from "@/lib/attempts-store";
import {
  masteryLevel,
  slotMastery,
  type Attempt,
  type MasteryLevel,
} from "@/lib/knowledge";
import type { Topic } from "@/lib/content";

const LEVEL_STYLES: Record<MasteryLevel, { text: string; bar: string }> = {
  weak: { text: "text-red-600", bar: "bg-red-500" },
  medium: { text: "text-amber-600", bar: "bg-amber-500" },
  strong: { text: "text-green-700", bar: "bg-green-600" },
};

export function KnowledgeMap({ topics }: { topics: Topic[] }) {
  const t = useTranslations("prep");
  const attempts = useAttempts();

  if (attempts === null) {
    return <p className="animate-pulse text-zinc-500">{t("loading")}</p>;
  }
  if (attempts.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 p-6 text-center">
        <p className="text-zinc-600">{t("empty")}</p>
        <Link
          href="/diagnostic"
          className="mt-4 inline-block rounded-full bg-zinc-900 px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-700"
        >
          {t("diagnosticCta")}
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <ul className="space-y-3">
        {topics.map((topic) => (
          <SlotRow key={topic.slug} topic={topic} attempts={attempts} />
        ))}
      </ul>
      <Link
        href="/diagnostic"
        className="inline-block text-sm text-zinc-500 hover:underline"
      >
        {t("retakeCta")}
      </Link>
    </div>
  );
}

function SlotRow({ topic, attempts }: { topic: Topic; attempts: Attempt[] }) {
  const t = useTranslations("prep");
  const mastery = slotMastery(attempts, topic.slot);

  if (mastery === null) {
    return (
      <li className="flex items-baseline justify-between rounded-lg border border-zinc-200 p-4">
        <Link href={`/tasks/${topic.slug}`} className="hover:underline">
          {topic.slot}. {topic.name}
        </Link>
        <span className="text-sm text-zinc-400">{t("untested")}</span>
      </li>
    );
  }

  const level = masteryLevel(mastery);
  const styles = level ? LEVEL_STYLES[level] : null;
  return (
    <li className="rounded-lg border border-zinc-200 p-4">
      <div className="flex items-baseline justify-between">
        <Link
          href={`/tasks/${topic.slug}`}
          className="font-medium hover:underline"
        >
          {topic.slot}. {topic.name}
        </Link>
        <span className={`text-sm ${styles?.text ?? "text-zinc-500"}`}>
          {t(level ?? "noLevel")}
        </span>
      </div>
      <div aria-hidden className="mt-2 h-2 rounded-full bg-zinc-100">
        <div
          className={`h-full rounded-full ${styles?.bar ?? "bg-zinc-400"}`}
          style={{ width: `${mastery.ratio * 100}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-zinc-500">
        <span>
          {t("recentSummary", {
            correct: mastery.correct,
            total: mastery.total,
          })}
        </span>
        {level === "weak" && (
          <Link href={`/tasks/${topic.slug}`} className="hover:underline">
            {t("practiceCta")}
          </Link>
        )}
      </div>
    </li>
  );
}
