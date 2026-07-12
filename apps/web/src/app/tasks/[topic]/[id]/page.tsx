import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Difficulty } from "@/components/difficulty";
import { Markdown } from "@/components/markdown";
import { getTask, getTasks, getTopic, getTopics } from "@/lib/content";

type Props = { params: Promise<{ topic: string; id: string }> };

export async function generateStaticParams() {
  const topics = await getTopics();
  const params = await Promise.all(
    topics.map(async ({ slug }) =>
      (await getTasks(slug)).map(({ id }) => ({ topic: slug, id })),
    ),
  );
  return params.flat();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { topic, id } = await params;
  const task = await getTask(topic, id);
  if (!task) return {};
  const t = await getTranslations("tasks");
  return { title: t("taskTitle", { id: task.id }) };
}

export default async function TaskPage({ params }: Props) {
  const { topic: topicSlug, id } = await params;
  const [topic, task] = await Promise.all([
    getTopic(topicSlug),
    getTask(topicSlug, id),
  ]);
  if (!topic || !task) notFound();
  const t = await getTranslations("tasks");
  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link
        href={`/tasks/${topic.slug}`}
        className="text-sm text-zinc-500 hover:underline"
      >
        ← {topic.name}
      </Link>
      <div className="mt-2 mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">{t("taskTitle", { id: task.id })}</h1>
        <Difficulty level={task.difficulty} />
      </div>
      <Markdown>{task.statement}</Markdown>
      <details className="group mt-8 rounded-lg border border-zinc-200">
        <summary className="cursor-pointer select-none p-4 font-medium group-open:border-b group-open:border-zinc-200">
          {t("showSolution")}
        </summary>
        <div className="p-4">
          <Markdown>{task.solution}</Markdown>
        </div>
      </details>
      <p className="mt-6 text-sm text-zinc-500">
        {t("sourceLabel", { source: task.source })}
      </p>
    </main>
  );
}
