#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditTaskOrigins } from "./audit.mjs";
import { generateTaskFiles, writeTaskFiles } from "./generate.mjs";
import { assertSnapshotHistoryIsAppendOnly } from "./snapshot-history.mjs";
import { auditTaskSnapshots, writeTaskSnapshots } from "./snapshots.mjs";
import { loadSourceRegistry } from "./sources.mjs";
import { auditVerificationRecords } from "./verification.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const defaults = {
  registry: path.join(repoRoot, "content/sources/ftn-p1/sources.json"),
  reviews: path.join(repoRoot, "content/reviews"),
  snapshots: path.join(repoRoot, "content/snapshots/tasks"),
  tasks: path.join(repoRoot, "content/tasks"),
};

try {
  const [command, ...rawArguments] = process.argv.slice(2);
  const argumentsMap = parseArguments(rawArguments);
  if (command === "check") {
    const registry = await loadSourceRegistry(
      argumentsMap.registry ?? defaults.registry,
    );
    const tasksDirectory = argumentsMap.tasks ?? defaults.tasks;
    const [report, verification, snapshots] = await Promise.all([
      auditTaskOrigins(tasksDirectory, registry),
      auditVerificationRecords(
        tasksDirectory,
        argumentsMap.reviews ?? defaults.reviews,
      ),
      auditTaskSnapshots(
        tasksDirectory,
        argumentsMap.snapshots ?? defaults.snapshots,
      ),
    ]);
    process.stdout.write(
      `content pipeline: ${report.taskCount} origins across ${report.slotCount} slots; ` +
        `${verification.verifiedTaskCount} verified tasks across ${verification.verifiedTopicCount} topics; ` +
        `${snapshots.snapshotCount} immutable snapshots\n`,
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
  } else if (command === "snapshot") {
    const report = await writeTaskSnapshots(
      argumentsMap.tasks ?? defaults.tasks,
      argumentsMap.snapshots ?? defaults.snapshots,
    );
    process.stdout.write(
      `content pipeline: created ${report.createdCount} snapshots; ` +
        `${report.existingCount} already existed\n`,
    );
  } else if (command === "check-snapshot-history") {
    if (!argumentsMap.base) {
      throw new Error("check-snapshot-history requires --base");
    }
    await assertSnapshotHistoryIsAppendOnly(repoRoot, argumentsMap.base);
    process.stdout.write("content pipeline: snapshot history is append-only\n");
  } else {
    throw new Error(
      "usage: cli.mjs check | snapshot | check-snapshot-history --base REF | " +
        "generate --manifest FILE --output DIR",
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
