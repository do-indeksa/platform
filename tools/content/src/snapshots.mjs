import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

const taskIdPattern = /^[a-z][a-z0-9]*-[0-9]{3}$/;
const snapshotNamePattern = /^([a-f0-9]{64})\.md$/;

export async function writeTaskSnapshots(tasksDirectory, snapshotsDirectory) {
  const tasks = await loadVerifiedTasks(tasksDirectory);
  let createdCount = 0;
  let existingCount = 0;

  for (const task of tasks.values()) {
    const directory = path.join(snapshotsDirectory, task.id);
    const destination = path.join(directory, `${task.digest}.md`);
    await fs.mkdir(directory, { recursive: true });
    try {
      await fs.writeFile(destination, task.raw, { flag: "wx" });
      createdCount += 1;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const existing = await fs.readFile(destination);
      if (!existing.equals(task.raw)) {
        throw new Error(`${destination}: snapshot content does not match`);
      }
      existingCount += 1;
    }
  }

  return { createdCount, existingCount, verifiedTaskCount: tasks.size };
}

export async function auditTaskSnapshots(tasksDirectory, snapshotsDirectory) {
  const tasks = await loadVerifiedTasks(tasksDirectory);
  const snapshots = new Map();
  const taskDirectories = await readDirectory(snapshotsDirectory);

  for (const taskDirectory of taskDirectories) {
    if (
      !taskDirectory.isDirectory() ||
      !taskIdPattern.test(taskDirectory.name)
    ) {
      throw new Error(
        `${path.join(snapshotsDirectory, taskDirectory.name)}: invalid snapshot task directory`,
      );
    }
    const directory = path.join(snapshotsDirectory, taskDirectory.name);
    const entries = await readDirectory(directory);
    if (!entries.length)
      throw new Error(`${directory}: empty snapshot directory`);

    for (const entry of entries) {
      const filePath = path.join(directory, entry.name);
      const match = entry.isFile() && snapshotNamePattern.exec(entry.name);
      if (!match) throw new Error(`${filePath}: invalid snapshot file`);
      const raw = await fs.readFile(filePath);
      const digest = hash(raw);
      if (digest !== match[1]) {
        throw new Error(
          `${filePath}: snapshot hash does not match its filename`,
        );
      }
      const { data } = matter(raw.toString("utf8"));
      if (data.id !== taskDirectory.name) {
        throw new Error(
          `${filePath}: snapshot task ID does not match its path`,
        );
      }
      if (data.status !== "verified") {
        throw new Error(`${filePath}: snapshot task is not verified`);
      }
      const topic = requiredString(data.topic, `${filePath}: topic`);
      const key = snapshotKey(data.id, digest);
      if (snapshots.has(key))
        throw new Error(`${filePath}: duplicate snapshot`);
      snapshots.set(key, { id: data.id, topic });
    }
  }

  for (const task of tasks.values()) {
    const snapshot = snapshots.get(snapshotKey(task.id, task.digest));
    if (!snapshot) {
      throw new Error(`${task.path}: verified task has no immutable snapshot`);
    }
    if (snapshot.topic !== task.topic) {
      throw new Error(
        `${task.path}: current task topic differs from its snapshot`,
      );
    }
  }

  return { currentTaskCount: tasks.size, snapshotCount: snapshots.size };
}

async function loadVerifiedTasks(tasksDirectory) {
  const tasks = new Map();
  const topics = await readDirectory(tasksDirectory);
  for (const topic of topics.filter((entry) => entry.isDirectory())) {
    const directory = path.join(tasksDirectory, topic.name);
    const files = (await readDirectory(directory)).filter(
      (entry) => entry.isFile() && entry.name.endsWith(".md"),
    );
    for (const file of files) {
      const filePath = path.join(directory, file.name);
      const raw = await fs.readFile(filePath);
      const { data } = matter(raw.toString("utf8"));
      if (data.status !== "verified") continue;
      const id = requiredString(data.id, `${filePath}: id`);
      if (!taskIdPattern.test(id))
        throw new Error(`${filePath}: invalid task ID`);
      if (file.name !== `${id}.md`) {
        throw new Error(`${filePath}: task ID does not match its filename`);
      }
      if (tasks.has(id))
        throw new Error(`${filePath}: duplicate task ID ${id}`);
      const taskTopic = requiredString(data.topic, `${filePath}: topic`);
      if (taskTopic !== topic.name) {
        throw new Error(`${filePath}: task topic does not match its directory`);
      }
      tasks.set(id, {
        id,
        path: filePath,
        raw,
        digest: hash(raw),
        topic: taskTopic,
      });
    }
  }
  return new Map(
    [...tasks].sort(([left], [right]) => left.localeCompare(right)),
  );
}

async function readDirectory(directory) {
  try {
    return (await fs.readdir(directory, { withFileTypes: true })).toSorted(
      (left, right) => left.name.localeCompare(right.name),
    );
  } catch (error) {
    if (error?.code === "ENOENT")
      throw new Error(`${directory}: directory is missing`);
    throw error;
  }
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function snapshotKey(id, digest) {
  return `${id}\0${digest}`;
}

function requiredString(value, field) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw new Error(`${field}: expected a non-empty trimmed string`);
  }
  return value;
}
