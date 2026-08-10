import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PrepPlanView } from "@/components/prep";
import { getTaskReferences, getTopics } from "@/lib/content";
import { getP1Blueprint } from "@/lib/exam-blueprint";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("prep");
  return { title: t("title"), description: t("description") };
}

export default async function PrepPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [topics, taskReferences, blueprint, topicT] = await Promise.all([
    getTopics(),
    getTaskReferences(),
    getP1Blueprint(),
    getTranslations({ locale, namespace: "topics" }),
  ]);
  const positions = blueprint.positions.map((position) => ({
    number: position.number,
    topicSlugs: position.topicSlugs,
    name: position.topicSlugs.map((topic) => topicT(topic)).join(" / "),
  }));

  return (
    <PrepPlanView
      positions={positions}
      topicSlots={topics.map(({ slug, slot }) => ({ slug, slot }))}
      taskReferences={taskReferences}
      maxPoints={blueprint.maxPoints}
    />
  );
}
