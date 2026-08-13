import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TaskWorkspace } from "@/components/task-workspace";
import {
  getTask,
  getTaskWorkspaceReferences,
  getTasks,
  getTopic,
  getTopics,
  type TaskWorkspaceReference,
} from "@/lib/content";
import { renderMarkdown } from "@/lib/markdown";
import { buildTaskProblemReportUrl } from "@/lib/task-problem-report";
import {
  parsePracticeId,
  parsePracticeSet,
  safeTaskBankReturnPath,
  taskBankHref,
} from "@/lib/task-bank";

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
  const t = await getTranslations("tasks");
  return { title: t("taskTitle", { id: task.id }) };
}

export default async function TaskPage({ params, searchParams }: Props) {
  const { locale, topic: topicSlug, id } = await params;
  const [topic, tasks, references, query] = await Promise.all([
    getTopic(topicSlug),
    getTasks(topicSlug),
    getTaskWorkspaceReferences(),
    searchParams,
  ]);
  const task = tasks.find((candidate) => candidate.id === id);
  if (!topic || !task) notFound();
  const [t, workspaceTopicT] = await Promise.all([
    getTranslations("tasks"),
    getTranslations("tasks.workspaceTopics"),
  ]);
  const [statementHtml, hintsHtml, solutionHtml] = await Promise.all([
    renderMarkdown(task.statement),
    Promise.all(task.hints.map(renderMarkdown)),
    renderMarkdown(task.solution),
  ]);
  const referenceById = new Map(
    references.map((reference) => [reference.id, reference]),
  );
  const currentReference = referenceById.get(task.id);
  if (!currentReference) notFound();
  const practiceSet = parsePracticeSet(
    firstQueryValue(query.set),
    new Set(referenceById.keys()),
  );
  const practiceId = parsePracticeId(firstQueryValue(query.practice));
  const selectedSequence = practiceSet
    .map((taskId) => referenceById.get(taskId))
    .filter(
      (reference): reference is TaskWorkspaceReference =>
        reference !== undefined,
    );
  const topicSequence = tasks
    .map((candidate) => referenceById.get(candidate.id))
    .filter(
      (reference): reference is TaskWorkspaceReference =>
        reference !== undefined,
    );
  const sequence = practiceSet.includes(task.id)
    ? selectedSequence
    : topicSequence;
  const taskIndex = sequence.findIndex((candidate) => candidate.id === task.id);
  if (taskIndex < 0) notFound();
  const returnTo =
    safeTaskBankReturnPath(firstQueryValue(query.returnTo)) ??
    taskBankHref({
      query: "",
      positions: [],
      topics: [topic.slug],
      difficulties: [],
      progress: "all",
      sort: "position",
    });
  const activePracticeSet = practiceSet.includes(task.id) ? practiceSet : [];
  const workspaceSequence = sequence.map((candidate) => ({
    id: candidate.id,
    revision: candidate.revision,
    slot: candidate.slot,
    topic: candidate.topic,
    href: taskHref(candidate, returnTo, activePracticeSet, practiceId),
    partCount: candidate.partCount,
    maxHints: candidate.maxHints,
  }));
  const reportHref = buildTaskProblemReportUrl({
    taskId: task.id,
    taskRevision: task.revision,
    topic: topic.slug,
    locale,
  });
  return (
    <TaskWorkspace
      key={task.id}
      taskId={task.id}
      slot={task.slot}
      taskRevision={task.revision}
      taskTopic={task.topic}
      topicName={workspaceTopicT(topic.slug)}
      source={task.source}
      statementHtml={statementHtml}
      check={task.check}
      hintsHtml={hintsHtml}
      solutionHtml={solutionHtml}
      sequence={workspaceSequence}
      taskIndex={taskIndex}
      returnTo={returnTo}
      reportHref={reportHref}
      reportAccessibleLabel={t("reportProblemLabel", { id: task.id })}
      practiceId={practiceId}
    />
  );
}

function firstQueryValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function taskHref(
  task: TaskWorkspaceReference,
  returnTo: string,
  practiceSet: readonly string[],
  practiceId: string | null,
): string {
  const params = new URLSearchParams({ returnTo });
  if (practiceSet.length > 0) params.set("set", practiceSet.join(","));
  if (practiceId) params.set("practice", practiceId);
  return `/tasks/${task.topic}/${task.id}?${params}`;
}
