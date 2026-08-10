import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Difficulty } from "@/components/difficulty";
import { RenderedMarkdown } from "@/components/rendered-markdown";
import { TaskCheck } from "@/components/task-check";
import { Link } from "@/i18n/navigation";
import {
  getTask,
  getTaskReferences,
  getTasks,
  getTopic,
  getTopics,
  type TaskReference,
} from "@/lib/content";
import { renderMarkdown } from "@/lib/markdown";
import {
  parsePracticeSet,
  safeTaskBankReturnPath,
  taskBankHref,
} from "@/lib/task-bank";

type Props = {
  params: Promise<{ topic: string; id: string }>;
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
  const { topic: topicSlug, id } = await params;
  const [topic, tasks, references, query] = await Promise.all([
    getTopic(topicSlug),
    getTasks(topicSlug),
    getTaskReferences(),
    searchParams,
  ]);
  const task = tasks.find((candidate) => candidate.id === id);
  if (!topic || !task) notFound();
  const [t, topicT] = await Promise.all([
    getTranslations("tasks"),
    getTranslations("topics"),
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
  const selectedSequence = practiceSet
    .map((taskId) => referenceById.get(taskId))
    .filter((reference): reference is TaskReference => reference !== undefined);
  const topicSequence = tasks
    .map((candidate) => referenceById.get(candidate.id))
    .filter((reference): reference is TaskReference => reference !== undefined);
  const sequence = practiceSet.includes(task.id)
    ? selectedSequence
    : topicSequence;
  const taskIndex = sequence.findIndex((candidate) => candidate.id === task.id);
  const next = sequence[(taskIndex + 1) % sequence.length];
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
  const nextTaskHref =
    next && next.id !== task.id
      ? taskHref(
          next,
          returnTo,
          practiceSet.includes(task.id) ? practiceSet : [],
        )
      : null;
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-8 sm:py-8">
      <nav className="mb-8 flex items-center justify-between border-b border-zinc-200 pb-4 text-sm">
        <Link
          href={returnTo}
          className="font-medium text-zinc-600 hover:text-zinc-900"
        >
          {t("exitPractice")}
        </Link>
        <span className="tabular-nums text-zinc-500">
          {t("taskProgress", {
            current: taskIndex + 1,
            total: sequence.length,
          })}
        </span>
      </nav>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-zinc-500">
            {t("taskContext", { topic: topicT(topic.slug) })}
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
        nextTaskHref={nextTaskHref}
      />
      <p className="mt-6 text-sm text-zinc-500">
        {t("sourceLabel", { source: task.source })}
      </p>
    </main>
  );
}

function firstQueryValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function taskHref(
  task: TaskReference,
  returnTo: string,
  practiceSet: readonly string[],
): string {
  const params = new URLSearchParams({ returnTo });
  if (practiceSet.length > 0) params.set("set", practiceSet.join(","));
  return `/tasks/${task.topic}/${task.id}?${params}`;
}
