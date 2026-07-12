import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { getTasks, getTopics } from "./content";
import { renderMarkdown } from "./markdown";

const tasksDir = path.join(process.cwd(), "..", "..", "content", "tasks");

const STATUSES = ["draft", "review", "verified"];
const REQUIRED_FIELDS = [
  "id",
  "slot",
  "topic",
  "difficulty",
  "source",
  "origin",
  "status",
  "answer",
];

async function readAllTaskFiles() {
  const topicDirs = await fs.readdir(tasksDir);
  const files = await Promise.all(
    topicDirs.map(async (topicDir) => {
      const names = await fs.readdir(path.join(tasksDir, topicDir));
      return names
        .filter((name) => name.endsWith(".md"))
        .map((name) => ({
          topicDir,
          filePath: path.join(tasksDir, topicDir, name),
        }));
    }),
  );
  return Promise.all(
    files.flat().map(async ({ topicDir, filePath }) => ({
      topicDir,
      fileName: path.basename(filePath, ".md"),
      ...matter(await fs.readFile(filePath, "utf8")),
    })),
  );
}

describe("topics.yaml", () => {
  it("defines 10 slots exactly once", async () => {
    const topics = await getTopics();
    expect(topics.map((topic) => topic.slot)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(new Set(topics.map((topic) => topic.slug)).size).toBe(10);
  });

  it("every topic has at least one published task", async () => {
    const topics = await getTopics();
    for (const topic of topics) {
      expect((await getTasks(topic.slug)).length, topic.slug).toBeGreaterThan(
        0,
      );
    }
  });
});

describe("task files", () => {
  it("frontmatter matches the schema", async () => {
    const taskFiles = await readAllTaskFiles();
    const topics = await getTopics();
    const topicBySlug = new Map(topics.map((topic) => [topic.slug, topic]));
    const ids = new Set<string>();

    expect(taskFiles.length).toBeGreaterThan(0);
    for (const { topicDir, fileName, data, content } of taskFiles) {
      for (const field of REQUIRED_FIELDS) {
        expect(data[field], `${fileName}: ${field}`).not.toBeNull();
        expect(data[field], `${fileName}: ${field}`).toBeDefined();
      }
      for (const field of ["id", "topic", "source", "origin", "answer"]) {
        expect(typeof data[field], `${fileName}: ${field}`).toBe("string");
        expect(data[field].trim(), `${fileName}: ${field}`).not.toBe("");
      }
      expect(data.id).toBe(fileName);
      expect(ids.has(data.id), `duplicate id ${data.id}`).toBe(false);
      ids.add(data.id);
      expect(data.topic).toBe(topicDir);
      expect(data.slot).toBe(topicBySlug.get(data.topic)?.slot);
      expect(data.difficulty).toBeGreaterThanOrEqual(1);
      expect(data.difficulty).toBeLessThanOrEqual(5);
      expect(STATUSES).toContain(data.status);
      expect(content).toMatch(/^## Zadatak$/m);
      expect(content).toMatch(/^## Rešenje$/m);
    }
  });

  it("statements and solutions render without KaTeX errors", async () => {
    const taskFiles = await readAllTaskFiles();
    for (const { fileName, content } of taskFiles) {
      const html = await renderMarkdown(content);
      expect(html.includes("katex-error"), fileName).toBe(false);
      expect(
        html.includes("#cc0000"),
        `${fileName}: undefined LaTeX command`,
      ).toBe(false);
      expect(
        (content.match(/\$/g) ?? []).length % 2,
        `${fileName}: unbalanced $`,
      ).toBe(0);
    }
  });
});
