import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TaskAttemptDetail } from "@/components/history";
import {
  getTask,
  getTaskSummaries,
  getTasks,
  getTopic,
  getTopics,
} from "@/lib/content";
import { renderMarkdown } from "@/lib/markdown";
import { taskPracticeHref } from "@/lib/task-bank";
import { isTaskHistoryId } from "@/lib/task-history";

type Props = {
  params: Promise<{ locale: string; topic: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

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
  const t = await getTranslations("history");
  return { title: t("attemptTitle", { id: task.id }) };
}

export default async function TaskAttemptPage({ params, searchParams }: Props) {
  const [{ locale, topic: topicSlug, id }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const [topic, task, summaries, t, topicT] = await Promise.all([
    getTopic(topicSlug),
    getTask(topicSlug, id),
    getTaskSummaries(),
    getTranslations({ locale, namespace: "history" }),
    getTranslations({ locale, namespace: "topics" }),
  ]);
  if (!topic || !task) notFound();

  const [statementHtml, correctAnswerHtml, hintsHtml, solutionHtml] =
    await Promise.all([
      renderMarkdown(task.statement),
      renderMarkdown(task.answer),
      Promise.all(task.hints.map(renderMarkdown)),
      renderMarkdown(task.solution),
    ]);
  const similar =
    summaries.find(
      (candidate) => candidate.id !== task.id && candidate.topic === task.topic,
    ) ??
    summaries.find(
      (candidate) => candidate.id !== task.id && candidate.slot === task.slot,
    );
  const returnTo = "/history?tab=tasks";
  const practiceId = crypto.randomUUID();
  const attempt = firstQueryValue(query.attempt);

  return (
    <TaskAttemptDetail
      attemptId={isTaskHistoryId(attempt) ? attempt : ""}
      task={{
        id: task.id,
        slot: task.slot,
        revision: task.revision,
        topicName: topicT(topic.slug),
        statementHtml,
        correctAnswerHtml,
        hintsHtml,
        solutionHtml,
        fieldLabels: task.check.map((field) => field.label ?? null),
      }}
      solveAgainHref={taskPracticeHref(task, returnTo, [], practiceId)}
      similarTask={
        similar
          ? {
              label: t("taskShort", { id: similar.id }),
              href: taskPracticeHref(similar, returnTo, [], practiceId),
            }
          : null
      }
    />
  );
}

function firstQueryValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
