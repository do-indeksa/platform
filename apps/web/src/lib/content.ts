import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { parse } from "yaml";
import type { CheckPart } from "@/lib/answer";
import { markdownToPlainText, renderMarkdown } from "./markdown";

const contentDir = path.join(process.cwd(), "..", "..", "content");
const taskSnapshotsDir = path.join(contentDir, "snapshots", "tasks");
const taskIdPattern = /^(?=.{5,64}$)[a-z][a-z0-9]*-[0-9]{3}$/;
const taskRevisionPattern = /^sha256:([a-f0-9]{64})$/;
const taskTopicPattern = /^[a-z][a-z0-9-]{1,63}$/;

export type Topic = {
  slug: string;
  slot: number;
  name: string;
  prefix: string;
};

export type TaskRubricCriterion = {
  id: string;
  points: number;
  text: string;
};

export type Task = {
  id: string;
  revision: string;
  slot: number;
  topic: string;
  difficulty: number;
  source: string;
  status: "draft" | "review" | "verified";
  answer: string;
  check: CheckPart[];
  rubric: TaskRubricCriterion[];
  statement: string;
  hints: string[];
  solution: string;
};

export function taskSetRevision(
  tasks: readonly Pick<Task, "id" | "revision">[],
): string {
  const hash = createHash("sha256");
  for (const task of tasks) {
    hash.update(task.id);
    hash.update("\0");
    hash.update(task.revision);
    hash.update("\n");
  }
  return `sha256:${hash.digest("hex")}`;
}

export type TaskSummary = Pick<
  Task,
  "id" | "slot" | "topic" | "difficulty" | "source"
> & {
  statementPreview: string;
  statementPreviewHtml: string;
};

export type TaskReference = Pick<Task, "id" | "slot" | "topic">;

export type TaskWorkspaceReference = TaskReference & {
  partCount: number;
  maxHints: number;
};

let taskSummariesPromise: Promise<TaskSummary[]> | undefined;
let taskReferencesPromise: Promise<TaskReference[]> | undefined;
let taskWorkspaceReferencesPromise:
  Promise<TaskWorkspaceReference[]> | undefined;

export async function getTopics(): Promise<Topic[]> {
  const raw = await fs.readFile(path.join(contentDir, "topics.yaml"), "utf8");
  const { topics } = parse(raw) as { topics: Topic[] };
  return topics.toSorted((a, b) => a.slot - b.slot);
}

export async function getTopic(slug: string): Promise<Topic | undefined> {
  const topics = await getTopics();
  return topics.find((topic) => topic.slug === slug);
}

export async function getTasks(topicSlug: string): Promise<Task[]> {
  const dir = path.join(contentDir, "tasks", topicSlug);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const tasks = await Promise.all(
    files
      .filter((file) => file.endsWith(".md"))
      .map((file) => readTask(path.join(dir, file))),
  );
  return tasks
    .filter((task) => task.status === "review" || task.status === "verified")
    .toSorted((a, b) => a.id.localeCompare(b.id));
}

export async function getTask(
  topicSlug: string,
  id: string,
): Promise<Task | undefined> {
  const tasks = await getTasks(topicSlug);
  return tasks.find((task) => task.id === id);
}

// Invalid or missing lookups are absent; an existing corrupt snapshot is fatal.
export async function getArchivedTask(
  taskId: string,
  revision: string,
): Promise<Task | undefined> {
  const revisionMatch =
    typeof taskId === "string" &&
    taskIdPattern.test(taskId) &&
    typeof revision === "string"
      ? taskRevisionPattern.exec(revision)
      : null;
  if (!revisionMatch) return undefined;

  const filePath = path.join(
    taskSnapshotsDir,
    taskId,
    `${revisionMatch[1]}.md`,
  );
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }

  if (taskRevision(raw) !== revision) {
    throw new Error(`${filePath}: archived task hash mismatch`);
  }
  const task = parseTask(raw, filePath);
  if (task.id !== taskId) {
    throw new Error(`${filePath}: archived task ID mismatch`);
  }
  if (typeof task.topic !== "string" || !taskTopicPattern.test(task.topic)) {
    throw new Error(`${filePath}: archived task topic is invalid`);
  }
  if (task.status !== "verified") {
    throw new Error(`${filePath}: archived task is not verified`);
  }
  return task;
}

export function getTaskSummaries(): Promise<TaskSummary[]> {
  if (process.env.NODE_ENV === "development") return buildTaskSummaries();
  // Git-backed content is immutable for a running production process.
  taskSummariesPromise ??= buildTaskSummaries();
  return taskSummariesPromise;
}

export function getTaskReferences(): Promise<TaskReference[]> {
  if (process.env.NODE_ENV === "development") return buildTaskReferences();
  taskReferencesPromise ??= taskSummariesPromise
    ? taskSummariesPromise.then((summaries) =>
        summaries.map(({ id, slot, topic }) => ({ id, slot, topic })),
      )
    : buildTaskReferences();
  return taskReferencesPromise;
}

export function getTaskWorkspaceReferences(): Promise<
  TaskWorkspaceReference[]
> {
  if (process.env.NODE_ENV === "development") {
    return buildTaskWorkspaceReferences();
  }
  taskWorkspaceReferencesPromise ??= buildTaskWorkspaceReferences();
  return taskWorkspaceReferencesPromise;
}

async function buildTaskSummaries(): Promise<TaskSummary[]> {
  const topics = await getTopics();
  const groups = await Promise.all(
    topics.map(async (topic) => {
      const tasks = await getTasks(topic.slug);
      return Promise.all(
        tasks.map(async (task) => ({
          id: task.id,
          slot: task.slot,
          topic: task.topic,
          difficulty: task.difficulty,
          source: task.source,
          statementPreview: markdownToPlainText(task.statement),
          statementPreviewHtml: await renderMarkdown(task.statement),
        })),
      );
    }),
  );
  return groups.flat();
}

async function buildTaskReferences(): Promise<TaskReference[]> {
  const topics = await getTopics();
  const groups = await Promise.all(
    topics.map(async (topic) =>
      (await getTasks(topic.slug)).map(({ id, slot, topic: taskTopic }) => ({
        id,
        slot,
        topic: taskTopic,
      })),
    ),
  );
  return groups.flat();
}

async function buildTaskWorkspaceReferences(): Promise<
  TaskWorkspaceReference[]
> {
  const topics = await getTopics();
  const groups = await Promise.all(
    topics.map(async (topic) =>
      (await getTasks(topic.slug)).map(
        ({ id, slot, topic: taskTopic, check, hints }) => ({
          id,
          slot,
          topic: taskTopic,
          partCount: check.length,
          maxHints: hints.length,
        }),
      ),
    ),
  );
  return groups.flat();
}

async function readTask(filePath: string): Promise<Task> {
  const raw = await fs.readFile(filePath, "utf8");
  return parseTask(raw, filePath);
}

function parseTask(raw: string, filePath: string): Task {
  const { data, content } = matter(raw);
  const sections = parseSections(content);
  return {
    ...(data as Omit<
      Task,
      "revision" | "rubric" | "statement" | "hints" | "solution"
    >),
    revision: taskRevision(raw),
    rubric: parseTaskRubric(data.rubric, filePath),
    statement: sections.get("Zadatak") ?? "",
    hints: [sections.get("Nagoveštaj 1"), sections.get("Nagoveštaj 2")].filter(
      (hint) => hint !== undefined,
    ),
    solution: sections.get("Rešenje") ?? "",
  };
}

function taskRevision(raw: string): string {
  return `sha256:${createHash("sha256").update(raw).digest("hex")}`;
}

function parseTaskRubric(
  value: unknown,
  filePath: string,
): TaskRubricCriterion[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) {
    throw new Error(`${filePath}: rubric must contain 1-10 criteria`);
  }
  const ids = new Set<string>();
  return value.map((candidate, index) => {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      Array.isArray(candidate)
    ) {
      throw new Error(`${filePath}: rubric criterion ${index + 1} is invalid`);
    }
    const criterion = candidate as Record<string, unknown>;
    if (
      typeof criterion.id !== "string" ||
      !/^[a-z0-9-]{1,32}$/.test(criterion.id) ||
      ids.has(criterion.id) ||
      !Number.isInteger(criterion.points) ||
      (criterion.points as number) < 1 ||
      (criterion.points as number) > 60 ||
      typeof criterion.text !== "string" ||
      criterion.text.trim().length < 1 ||
      criterion.text.length > 1_000
    ) {
      throw new Error(`${filePath}: rubric criterion ${index + 1} is invalid`);
    }
    ids.add(criterion.id);
    return {
      id: criterion.id,
      points: criterion.points as number,
      text: criterion.text,
    };
  });
}

function parseSections(content: string): Map<string, string> {
  const parts = content.split(
    /^## (Zadatak|Nagoveštaj 1|Nagoveštaj 2|Rešenje)$/m,
  );
  const sections = new Map<string, string>();
  for (let i = 1; i < parts.length; i += 2) {
    sections.set(parts[i], parts[i + 1].trim());
  }
  return sections;
}
