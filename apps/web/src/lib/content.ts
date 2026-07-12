import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { parse } from "yaml";

const contentDir = path.join(process.cwd(), "..", "..", "content");

export type Topic = {
  slug: string;
  slot: number;
  name: string;
  prefix: string;
};

export type Task = {
  id: string;
  slot: number;
  topic: string;
  difficulty: number;
  source: string;
  status: "draft" | "review" | "verified";
  answer: string;
  statement: string;
  solution: string;
};

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

async function readTask(filePath: string): Promise<Task> {
  const raw = await fs.readFile(filePath, "utf8");
  const { data, content } = matter(raw);
  const [, statement = "", solution = ""] = content.split(
    /^## (?:Zadatak|Rešenje)$/m,
  );
  return {
    ...(data as Omit<Task, "statement" | "solution">),
    statement: statement.trim(),
    solution: solution.trim(),
  };
}
