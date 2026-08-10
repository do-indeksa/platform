import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parseWorkbook } from "./workbook.mjs";

const sha256Pattern = /^[a-f0-9]{64}$/;

export async function loadSourceRegistry(registryPath) {
  const absoluteRegistry = path.resolve(registryPath);
  const directory = path.dirname(absoluteRegistry);
  const value = JSON.parse(await fs.readFile(absoluteRegistry, "utf8"));
  if (value?.version !== 1 || !Array.isArray(value.collections)) {
    throw new Error("source registry: invalid document");
  }

  const collections = new Map();
  for (const raw of value.collections) {
    if (!raw || typeof raw !== "object" || typeof raw.id !== "string") {
      throw new Error("source registry: invalid collection");
    }
    if (collections.has(raw.id)) {
      throw new Error(`source registry: duplicate collection ${raw.id}`);
    }
    const statement = await loadSource(directory, raw.statement, "statement");
    const solution = await loadSource(directory, raw.solution, "solution");
    const statementWorkbook = parseWorkbook(statement.content, statement.file);
    const solutionWorkbook = parseWorkbook(solution.content, solution.file);
    compareWorkbookShapes(statementWorkbook, solutionWorkbook, raw.id);
    collections.set(raw.id, {
      id: raw.id,
      language: raw.language,
      license: raw.license,
      statement,
      solution,
      statementWorkbook,
      solutionWorkbook,
    });
  }
  if (!collections.size) throw new Error("source registry: no collections");
  return { path: absoluteRegistry, collections };
}

async function loadSource(directory, descriptor, field) {
  if (
    !descriptor ||
    typeof descriptor.file !== "string" ||
    !sha256Pattern.test(descriptor.sha256)
  ) {
    throw new Error(`source registry: invalid ${field}`);
  }
  const resolved = path.resolve(directory, descriptor.file);
  if (!resolved.startsWith(`${directory}${path.sep}`)) {
    throw new Error(`source registry: ${field} escapes its directory`);
  }
  const content = await fs.readFile(resolved, "utf8");
  const digest = createHash("sha256").update(content).digest("hex");
  if (digest !== descriptor.sha256) {
    throw new Error(`${descriptor.file}: SHA-256 mismatch`);
  }
  return { file: descriptor.file, path: resolved, content, sha256: digest };
}

function compareWorkbookShapes(statement, solution, collectionId) {
  const slots = [...statement.slots.keys()];
  if (slots.join(",") !== [...solution.slots.keys()].join(",")) {
    throw new Error(`${collectionId}: statement and solution slots differ`);
  }
  for (const slot of slots) {
    if (
      statement.slots.get(slot).items.length !==
      solution.slots.get(slot).items.length
    ) {
      throw new Error(`${collectionId}: slot ${slot} task counts differ`);
    }
  }
}
