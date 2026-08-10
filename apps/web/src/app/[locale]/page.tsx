import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OverviewDashboard } from "@/components/overview";
import { getTaskSummaries, getTopics } from "@/lib/content";
import { getP1Blueprint } from "@/lib/exam-blueprint";
import { getFtnP1Programs } from "@/lib/guide";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  return { title: t("metadataTitle"), description: t("metadataDescription") };
}

export default async function Home({ params }: Props) {
  const { locale } = await params;
  const [topics, tasks, blueprint, programGuide, topicT] = await Promise.all([
    getTopics(),
    getTaskSummaries(),
    getP1Blueprint(),
    getFtnP1Programs(),
    getTranslations({ locale, namespace: "topics" }),
  ]);
  const officialVariant = blueprint.sources.find(
    (source) => source.role === "officialVariant",
  );
  if (!officialVariant) {
    throw new Error(
      `P1 blueprint ${blueprint.version} has no official variant`,
    );
  }

  const positions = blueprint.positions.map((position) => ({
    number: position.number,
    topicSlugs: position.topicSlugs,
    name: position.topicSlugs.map((topic) => topicT(topic)).join(" / "),
    taskCount: tasks.filter((task) => position.topicSlugs.includes(task.topic))
      .length,
  }));

  return (
    <OverviewDashboard
      exam={{
        version: blueprint.version,
        taskCount: blueprint.taskCount,
        durationMinutes: blueprint.durationMinutes,
        maxPoints: blueprint.maxPoints,
        officialVariantUrl: officialVariant.url,
      }}
      positions={positions}
      tasks={tasks.map(({ id, slot, topic, difficulty }) => ({
        id,
        slot,
        topic,
        difficulty,
      }))}
      topicSlots={topics.map(({ slug, slot }) => ({ slug, slot }))}
      programs={programGuide.programs}
      programSource={programGuide.source}
    />
  );
}
