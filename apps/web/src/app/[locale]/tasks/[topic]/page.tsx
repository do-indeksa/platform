import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getTopic, getTopics } from "@/lib/content";

type Props = { params: Promise<{ locale: string; topic: string }> };

export async function generateStaticParams() {
  const topics = await getTopics();
  return topics.map(({ slug }) => ({ topic: slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, topic: topicSlug } = await params;
  const topic = await getTopic(topicSlug);
  if (!topic) return {};
  const [t, topicT] = await Promise.all([
    getTranslations({ locale, namespace: "tasks" }),
    getTranslations({ locale, namespace: "topics" }),
  ]);
  return {
    title: topicT(topic.slug),
    description: t("topicDescription", { topic: topicT(topic.slug) }),
  };
}

export default async function TopicPage({ params }: Props) {
  const { locale, topic: topicSlug } = await params;
  const topic = await getTopic(topicSlug);
  if (!topic) notFound();
  redirect({
    href: { pathname: "/tasks", query: { topic: topic.slug } },
    locale,
  });
}
