import fs from "node:fs/promises";
import path from "node:path";
import { validateImportManifest } from "./import-schema.mjs";
import { latexNodesToMarkdown } from "./markdown.mjs";
import { renderTaskFile } from "./task-file.mjs";
import { selectWorkbookNodes } from "./workbook.mjs";

export function generateTaskFiles(rawManifest, registry) {
  const manifest = validateImportManifest(rawManifest);
  const collection = registry.collections.get(manifest.collection);
  if (!collection) throw new Error(`unknown collection ${manifest.collection}`);
  const files = new Map();

  for (const task of manifest.tasks) {
    const statement = latexNodesToMarkdown(
      selectWorkbookNodes(
        collection.statementWorkbook,
        task.slot,
        task.selector,
      ),
    );
    const solution = latexNodesToMarkdown(
      selectWorkbookNodes(
        collection.solutionWorkbook,
        task.slot,
        task.selector,
      ),
    );
    if (!statement || !solution) {
      throw new Error(`${task.id}: empty generated statement or solution`);
    }
    const origin = `${collection.statement.file}, slot ${task.slot}, zadatak ${task.selector}`;
    const relativePath = path.join(task.topic, `${task.id}.md`);
    files.set(
      relativePath,
      renderTaskFile({
        task,
        source: manifest.defaults.source,
        status: manifest.defaults.status,
        origin,
        statement,
        solution,
      }),
    );
  }
  return files;
}

export async function writeTaskFiles(files, outputDirectory) {
  const output = path.resolve(outputDirectory);
  try {
    await fs.access(output);
    throw new Error(`${output}: output directory already exists`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const temporary = `${output}.tmp-${process.pid}-${Date.now()}`;
  try {
    for (const [relativePath, content] of files) {
      const destination = path.join(temporary, relativePath);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, content, "utf8");
    }
    await fs.rename(temporary, output);
  } catch (error) {
    await fs.rm(temporary, { recursive: true, force: true });
    throw error;
  }
}
