import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TaskAttemptDetail } from "@/components/history";
import {
  getArchivedTask,
  getTask,
  getTaskSummaries,
  getTasks,
  getTopics,
  type Task,
} from "@/lib/content";
import { renderMarkdown } from "@/lib/markdown";
import { taskPracticeHref } from "@/lib/task-bank";
import type { TaskAttemptContent } from "@/lib/task-history-content";
import { isTaskHistoryId } from "@/lib/task-history";
import { safeTaskHistoryReturnPath } from "@/lib/task-history-filters";

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
  const [topics, task, summaries, t, topicT] = await Promise.all([
    getTopics(),
    getTask(topicSlug, id),
    getTaskSummaries(),
    getTranslations({ locale, namespace: "history" }),
    getTranslations({ locale, namespace: "topics" }),
  ]);
  const topic = topics.find((candidate) => candidate.slug === topicSlug);
  if (!topic || !task) notFound();

  const requestedRevision = firstQueryValue(query.revision);
  const archivedTask =
    requestedRevision !== undefined && requestedRevision !== task.revision
      ? await getArchivedTask(task.id, requestedRevision)
      : undefined;
  const topicName = topicT(topic.slug);
  const archivedContentPromise: Promise<TaskAttemptContent | null> =
    archivedTask === undefined
      ? Promise.resolve(null)
      : renderTaskContent(
          archivedTask,
          topics.some((candidate) => candidate.slug === archivedTask.topic)
            ? topicT(archivedTask.topic)
            : archivedTask.topic,
        );
  const [currentContent, archivedContent] = await Promise.all([
    renderTaskContent(task, topicName),
    archivedContentPromise,
  ]);
  const similar =
    summaries.find(
      (candidate) => candidate.id !== task.id && candidate.topic === task.topic,
    ) ??
    summaries.find(
      (candidate) => candidate.id !== task.id && candidate.slot === task.slot,
    );
  const backHref =
    safeTaskHistoryReturnPath(
      firstQueryValue(query.returnTo),
      new Set(summaries.map((summary) => summary.topic)),
    ) ?? "/history";
  const practiceId = crypto.randomUUID();
  const attempt = firstQueryValue(query.attempt);

  return (
    <TaskAttemptDetail
      attemptId={isTaskHistoryId(attempt) ? attempt : ""}
      backHref={backHref}
      task={{
        id: task.id,
        current: currentContent,
        archived: archivedContent,
      }}
      solveAgainHref={taskPracticeHref(
        task,
        "/history?tab=tasks",
        [],
        practiceId,
      )}
      similarTask={
        similar
          ? {
              label: t("taskShort", { id: similar.id }),
              href: taskPracticeHref(
                similar,
                "/history?tab=tasks",
                [],
                practiceId,
              ),
            }
          : null
      }
    />
  );
}

async function renderTaskContent(
  task: Task,
  topicName: string,
): Promise<TaskAttemptContent> {
  const [statementHtml, correctAnswerHtml, hintsHtml, solutionHtml] =
    await Promise.all([
      renderMarkdown(task.statement),
      renderMarkdown(task.answer),
      Promise.all(task.hints.map(renderMarkdown)),
      renderMarkdown(task.solution),
    ]);
  return {
    revision: task.revision,
    slot: task.slot,
    topicName,
    statementHtml,
    correctAnswerHtml,
    hintsHtml,
    solutionHtml,
    fieldLabels: task.check.map((field) => field.label ?? null),
  };
}

function firstQueryValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
