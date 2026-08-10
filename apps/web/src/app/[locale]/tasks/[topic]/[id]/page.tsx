import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Difficulty } from "@/components/difficulty";
import { RenderedMarkdown } from "@/components/rendered-markdown";
import { TaskCheck } from "@/components/task-check";
import { Link } from "@/i18n/navigation";
import { getTask, getTasks, getTopic, getTopics } from "@/lib/content";
import { renderMarkdown } from "@/lib/markdown";

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
  const [topic, tasks] = await Promise.all([
    getTopic(topicSlug),
    getTasks(topicSlug),
  ]);
  const task = tasks.find((candidate) => candidate.id === id);
  if (!topic || !task) notFound();
  const t = await getTranslations("tasks");
  const [statementHtml, hintsHtml, solutionHtml] = await Promise.all([
    renderMarkdown(task.statement),
    Promise.all(task.hints.map(renderMarkdown)),
    renderMarkdown(task.solution),
  ]);
  const taskIndex = tasks.indexOf(task);
  const next = tasks[(taskIndex + 1) % tasks.length];
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-8 sm:py-8">
      <nav className="mb-8 flex items-center justify-between border-b border-zinc-200 pb-4 text-sm">
        <Link
          href={`/tasks/${topic.slug}`}
          className="font-medium text-zinc-600 hover:text-zinc-900"
        >
          {t("exitPractice")}
        </Link>
        <span className="tabular-nums text-zinc-500">
          {t("taskProgress", { current: taskIndex + 1, total: tasks.length })}
        </span>
      </nav>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-zinc-500">
            {t("taskContext", { topic: topic.name })}
          </p>
          <h1 className="text-2xl font-bold">
            {t("taskTitle", { id: task.id })}
          </h1>
        </div>
        <Difficulty level={task.difficulty} />
      </div>
      <RenderedMarkdown
        html={statementHtml}
        openImageLabel={t("openImage")}
        closeImageLabel={t("closeImage")}
      />
      <TaskCheck
        key={task.id}
        taskId={task.id}
        slot={task.slot}
        check={task.check}
        hintsHtml={hintsHtml}
        solutionHtml={solutionHtml}
        nextTaskHref={
          next.id === task.id ? null : `/tasks/${topic.slug}/${next.id}`
        }
      />
      <p className="mt-6 text-sm text-zinc-500">
        {t("sourceLabel", { source: task.source })}
      </p>
    </main>
  );
}
