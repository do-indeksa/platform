import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TrainingBuilder } from "@/components/training-builder";
import { getPracticeTaskReferences } from "@/lib/content";
import { getP1Blueprint } from "@/lib/exam-blueprint";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "trainingBuilder" });
  return { title: t("metadataTitle"), description: t("metadataDescription") };
}

export default async function TrainingBuilderPage({ params }: Props) {
  const { locale } = await params;
  const [blueprint, tasks, topicT] = await Promise.all([
    getP1Blueprint(),
    getPracticeTaskReferences(),
    getTranslations({ locale, namespace: "topics" }),
  ]);
  const positions = blueprint.positions.map((position) => ({
    number: position.number,
    topicSlugs: position.topicSlugs,
    name: position.topicSlugs.map((topic) => topicT(topic)).join(" / "),
    availableCount: tasks.filter((task) =>
      position.topicSlugs.includes(task.topic),
    ).length,
  }));

  return (
    <TrainingBuilder
      blueprintVersion={blueprint.version}
      positions={positions}
      tasks={tasks}
    />
  );
}
