import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { selectWorkbookNodes } from "./workbook.mjs";

const originPattern = /^([^,/]+\.tex), slot (10|[1-9]), zadatak (\d+[a-z]?)$/;

export async function auditTaskOrigins(tasksDirectory, registry) {
  const sourceCollections = new Map(
    [...registry.collections.values()].map((collection) => [
      collection.statement.file,
      collection,
    ]),
  );
  const topics = await fs.readdir(tasksDirectory, { withFileTypes: true });
  const origins = new Set();
  let taskCount = 0;
  const slots = new Set();

  for (const topic of topics.filter((entry) => entry.isDirectory())) {
    const directory = path.join(tasksDirectory, topic.name);
    const files = (await fs.readdir(directory)).filter((file) =>
      file.endsWith(".md"),
    );
    for (const file of files) {
      const filePath = path.join(directory, file);
      const { data } = matter(await fs.readFile(filePath, "utf8"));
      const match = String(data.origin ?? "").match(originPattern);
      if (!match) throw new Error(`${filePath}: unsupported origin`);
      const collection = sourceCollections.get(match[1]);
      if (!collection)
        throw new Error(`${filePath}: unregistered source ${match[1]}`);
      const slot = Number(match[2]);
      const selector = match[3];
      if (data.id !== path.basename(file, ".md")) {
        throw new Error(`${filePath}: ID does not match its filename`);
      }
      if (data.topic !== topic.name || data.slot !== slot) {
        throw new Error(`${filePath}: topic or slot does not match its origin`);
      }
      const originKey = `${collection.id}:${slot}:${selector}`;
      if (origins.has(originKey))
        throw new Error(`${filePath}: duplicate origin`);
      origins.add(originKey);
      selectWorkbookNodes(collection.statementWorkbook, slot, selector);
      selectWorkbookNodes(collection.solutionWorkbook, slot, selector);
      slots.add(slot);
      taskCount += 1;
    }
  }
  if (!taskCount) throw new Error("task origin audit: no tasks found");
  return { taskCount, slotCount: slots.size, originCount: origins.size };
}
