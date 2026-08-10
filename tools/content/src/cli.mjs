#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditTaskOrigins } from "./audit.mjs";
import { generateTaskFiles, writeTaskFiles } from "./generate.mjs";
import { loadSourceRegistry } from "./sources.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const defaults = {
  registry: path.join(repoRoot, "content/sources/ftn-p1/sources.json"),
  tasks: path.join(repoRoot, "content/tasks"),
};

try {
  const [command, ...rawArguments] = process.argv.slice(2);
  const argumentsMap = parseArguments(rawArguments);
  if (command === "check") {
    const registry = await loadSourceRegistry(
      argumentsMap.registry ?? defaults.registry,
    );
    const report = await auditTaskOrigins(
      argumentsMap.tasks ?? defaults.tasks,
      registry,
    );
    process.stdout.write(
      `content pipeline: ${report.taskCount} task origins across ${report.slotCount} slots verified\n`,
    );
  } else if (command === "generate") {
    if (!argumentsMap.manifest || !argumentsMap.output) {
      throw new Error("generate requires --manifest and --output");
    }
    const registry = await loadSourceRegistry(
      argumentsMap.registry ?? defaults.registry,
    );
    const manifest = JSON.parse(
      await fs.readFile(path.resolve(argumentsMap.manifest), "utf8"),
    );
    const files = generateTaskFiles(manifest, registry);
    await writeTaskFiles(files, argumentsMap.output);
    process.stdout.write(
      `content pipeline: generated ${files.size} task files\n`,
    );
  } else {
    throw new Error(
      "usage: cli.mjs check | generate --manifest FILE --output DIR",
    );
  }
} catch (error) {
  process.stderr.write(`content pipeline: ${error.message}\n`);
  process.exitCode = 1;
}

function parseArguments(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!name?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`invalid argument ${name ?? ""}`.trim());
    }
    result[name.slice(2)] = value;
  }
  return result;
}
