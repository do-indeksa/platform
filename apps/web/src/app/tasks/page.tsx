import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getTasks, getTopics } from "@/lib/content";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tasks");
  return { title: t("title"), description: t("description") };
}

export default async function TopicsPage() {
  const t = await getTranslations("tasks");
  const topics = await getTopics();
  const counts = await Promise.all(
    topics.map(async (topic) => (await getTasks(topic.slug)).length),
  );
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-2 text-3xl font-bold">{t("title")}</h1>
      <p className="mb-8 text-zinc-600">{t("intro")}</p>
      <ol className="space-y-2">
        {topics.map((topic, i) => (
          <li key={topic.slug}>
            <Link
              href={`/tasks/${topic.slug}`}
              className="flex items-baseline justify-between gap-4 rounded-lg border border-zinc-200 p-4 transition-colors hover:border-zinc-400"
            >
              <span>
                <span className="mr-3 font-mono text-sm text-zinc-400">
                  {topic.slot}.
                </span>
                <span className="font-medium">{topic.name}</span>
              </span>
              <span className="shrink-0 text-sm text-zinc-500">
                {t("count", { count: counts[i] })}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}
