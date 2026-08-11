import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { checkAnswer, type CheckPart } from "./answer";
import {
  getTaskReferences,
  getTaskSummaries,
  getTasks,
  getTopics,
  taskSetRevision,
} from "./content";
import { getP1Blueprint } from "./exam-blueprint";
import { markdownToPlainText, renderMarkdown } from "./markdown";
import { MAX_TASK_ANSWER_PARTS } from "./task-draft";

const tasksDir = path.join(process.cwd(), "..", "..", "content", "tasks");

const STATUSES = ["draft", "review", "verified"];
const CHECK_KINDS = ["value", "values", "interval", "text"];
const REQUIRED_FIELDS = [
  "id",
  "slot",
  "topic",
  "difficulty",
  "source",
  "origin",
  "status",
  "answer",
  "check",
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
  it("derives stable revisions from canonical task files", async () => {
    const tasks = await getTasks("kompleksni-brojevi");
    expect(tasks.length).toBeGreaterThan(0);
    for (const task of tasks) {
      expect(task.revision).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
    expect(new Set(tasks.map((task) => task.revision)).size).toBe(tasks.length);

    const revision = taskSetRevision(tasks);
    expect(revision).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(taskSetRevision(tasks)).toBe(revision);
    expect(taskSetRevision(tasks.toReversed())).not.toBe(revision);
  });

  it("exposes searchable summaries without grading data", async () => {
    const summaries = await getTaskSummaries();
    expect(summaries).toHaveLength(30);
    expect(summaries[0].statementPreview).not.toContain("$");
    expect(summaries[0].statementPreviewHtml).toContain("katex");
    expect(summaries[0]).not.toHaveProperty("answer");
    expect(summaries[0]).not.toHaveProperty("check");
    expect(summaries[0]).not.toHaveProperty("solution");
  });

  it("exposes a lightweight navigation catalog", async () => {
    const references = await getTaskReferences();
    expect(references).toHaveLength(30);
    expect(references[0]).toEqual({
      id: "kb-001",
      slot: 1,
      topic: "kompleksni-brojevi",
    });
    expect(references[0]).not.toHaveProperty("statementPreviewHtml");
  });

  it("creates a readable search index from Markdown and math", () => {
    expect(markdownToPlainText("**Find** $x^2$\n\n- first\n- second")).toBe(
      "Find x^2 first second",
    );
  });

  it("does not pass raw HTML into rendered task previews", async () => {
    const html = await renderMarkdown("<script>alert(1)</script>\n\nSafe");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(1)");
    expect(html).toContain("<p>Safe</p>");
  });

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

      expect(Array.isArray(data.check), `${fileName}: check`).toBe(true);
      expect(data.check.length, `${fileName}: check`).toBeGreaterThan(0);
      expect(data.check.length, `${fileName}: check`).toBeLessThanOrEqual(
        MAX_TASK_ANSWER_PARTS,
      );
      for (const part of data.check as CheckPart[]) {
        const partName = `${fileName}: check ${part.label ?? part.expected}`;
        if (part.label !== undefined) {
          expect(typeof part.label, partName).toBe("string");
          expect(part.label.trim(), partName).not.toBe("");
        }
        expect(CHECK_KINDS, partName).toContain(part.kind);
        expect(typeof part.expected, partName).toBe("string");
        expect(checkAnswer(part, part.expected), partName).toBe("correct");
      }

      if (data.rubric !== undefined) {
        expect(data.status, `${fileName}: rubric status`).toBe("verified");
        expect(Array.isArray(data.rubric), `${fileName}: rubric`).toBe(true);
        expect(data.rubric.length, `${fileName}: rubric`).toBeGreaterThan(0);
        expect(data.rubric.length, `${fileName}: rubric`).toBeLessThanOrEqual(
          10,
        );
        const criterionIds = new Set<string>();
        for (const criterion of data.rubric as Record<string, unknown>[]) {
          expect(criterion.id, `${fileName}: rubric id`).toMatch(
            /^[a-z0-9-]{1,32}$/,
          );
          expect(
            criterionIds.has(criterion.id as string),
            `${fileName}: duplicate rubric id`,
          ).toBe(false);
          criterionIds.add(criterion.id as string);
          expect(
            Number.isInteger(criterion.points),
            `${fileName}: rubric points`,
          ).toBe(true);
          expect(
            criterion.points,
            `${fileName}: rubric points`,
          ).toBeGreaterThan(0);
          expect(typeof criterion.text, `${fileName}: rubric text`).toBe(
            "string",
          );
          expect(
            (criterion.text as string).trim(),
            `${fileName}: rubric text`,
          ).not.toBe("");
        }
      }

      const hintCount = (content.match(/^## Nagoveštaj [12]$/gm) ?? []).length;
      expect(hintCount, `${fileName}: hints`).toBeLessThanOrEqual(2);
      if (hintCount === 2) {
        expect(content, `${fileName}: hints order`).toMatch(
          /^## Nagoveštaj 1$[\s\S]*^## Nagoveštaj 2$/m,
        );
      }
    }
  });

  it("bounds reviewed rubric totals to one point below an exact answer", async () => {
    const blueprints = await Promise.all([
      getP1Blueprint("2025.1"),
      getP1Blueprint("2026.1"),
    ]);
    const rubricTasks = new Set<string>();
    for (const blueprint of blueprints) {
      for (const position of blueprint.positions) {
        for (const topic of position.topicSlugs) {
          for (const task of await getTasks(topic)) {
            if (task.rubric.length === 0) continue;
            rubricTasks.add(task.id);
            expect(
              task.rubric.reduce((sum, criterion) => sum + criterion.points, 0),
              `${blueprint.version}: ${task.id}`,
            ).toBe(position.maxPoints - 1);
          }
        }
      }
    }
    expect([...rubricTasks].toSorted()).toEqual([
      "kb-001",
      "kb-002",
      "kb-003",
      "kv-001",
      "kv-002",
      "kv-003",
      "log-001",
      "log-002",
      "log-003",
    ]);
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
