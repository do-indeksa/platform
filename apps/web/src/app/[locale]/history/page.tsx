import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { HistoryView } from "@/components/history";
import { getTaskSummaries, getTopics } from "@/lib/content";
import { parseHistoryFeedFilters, parseHistoryTab } from "@/lib/history-feed";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("history");
  return { title: t("title"), description: t("description") };
}

export default async function HistoryPage({ params, searchParams }: Props) {
  const [{ locale }, query, summaries, topics] = await Promise.all([
    params,
    searchParams,
    getTaskSummaries(),
    getTopics(),
  ]);
  const topicT = await getTranslations({ locale, namespace: "topics" });
  const topicNames = new Map(
    topics.map((topic) => [topic.slug, topicT(topic.slug)]),
  );
  const tab = parseHistoryTab(firstQueryValue(query.tab));
  const filters = parseHistoryFeedFilters(query);

  return (
    <HistoryView
      initialTab={tab}
      initialFilters={filters}
      tasks={summaries.map(({ id, slot, topic, difficulty }) => ({
        id,
        slot,
        topic,
        topicName: topicNames.get(topic) ?? topic,
        difficulty,
      }))}
    />
  );
}

function firstQueryValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
