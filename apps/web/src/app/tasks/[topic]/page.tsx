import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Difficulty } from "@/components/difficulty";
import { getTasks, getTopic, getTopics } from "@/lib/content";

type Props = { params: Promise<{ topic: string }> };

export async function generateStaticParams() {
  const topics = await getTopics();
  return topics.map(({ slug }) => ({ topic: slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const topic = await getTopic((await params).topic);
  if (!topic) return {};
  const t = await getTranslations("tasks");
  return {
    title: topic.name,
    description: t("topicDescription", { topic: topic.name, slot: topic.slot }),
  };
}

export default async function TopicPage({ params }: Props) {
  const topic = await getTopic((await params).topic);
  if (!topic) notFound();
  const t = await getTranslations("tasks");
  const tasks = await getTasks(topic.slug);
  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/tasks" className="text-sm text-zinc-500 hover:underline">
        {t("allSlots")}
      </Link>
      <h1 className="mt-2 mb-8 text-3xl font-bold">
        {topic.slot}. {topic.name}
      </h1>
      <ul className="space-y-2">
        {tasks.map((task) => (
          <li key={task.id}>
            <Link
              href={`/tasks/${topic.slug}/${task.id}`}
              className="flex items-baseline justify-between gap-4 rounded-lg border border-zinc-200 p-4 transition-colors hover:border-zinc-400"
            >
              <span className="font-mono text-sm">{task.id}</span>
              <Difficulty level={task.difficulty} />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
