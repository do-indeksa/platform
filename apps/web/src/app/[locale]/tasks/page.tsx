import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TaskBank } from "@/components/task-bank";
import { getTaskSummaries, getTopics } from "@/lib/content";
import { parseTaskBankState, toURLSearchParams } from "@/lib/task-bank";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tasks");
  return { title: t("title"), description: t("description") };
}

export default async function TasksPage({ searchParams }: Props) {
  const [topics, tasks, topicT, rawSearchParams] = await Promise.all([
    getTopics(),
    getTaskSummaries(),
    getTranslations("topics"),
    searchParams,
  ]);
  const topicLabels = Object.fromEntries(
    topics.map((topic) => [topic.slug, topicT(topic.slug)]),
  );
  const state = parseTaskBankState(
    toURLSearchParams(rawSearchParams),
    new Map(topics.map((topic) => [topic.slug, topic.slot])),
    new Set(tasks.map((task) => task.id)),
  );

  return (
    <TaskBank
      tasks={tasks}
      topics={topics.map(({ slug, slot }) => ({ slug, slot }))}
      topicLabels={topicLabels}
      initialFilters={state.filters}
      initialSelectedTaskIds={state.selectedTaskIds}
    />
  );
}
