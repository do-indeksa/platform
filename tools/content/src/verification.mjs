import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const requiredMethods = new Set([
  "source-selector-match",
  "independent-recalculation",
  "machine-check-roundtrip",
  "rendered-math-validation",
]);

export async function auditVerificationRecords(
  tasksDirectory,
  reviewsDirectory,
) {
  const tasks = await loadTasks(tasksDirectory);
  const reviewFiles = (
    await fs.readdir(reviewsDirectory, { withFileTypes: true })
  )
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".md") &&
        entry.name !== "README.md",
    )
    .map((entry) => entry.name)
    .sort();
  const reviewedTasks = new Set();
  const reviewedTopics = new Set();

  for (const file of reviewFiles) {
    const filePath = path.join(reviewsDirectory, file);
    const { data, content } = matter(await fs.readFile(filePath, "utf8"));
    const reviewId = requiredString(data.id, `${filePath}: id`);
    if (reviewId !== path.basename(file, ".md")) {
      throw new Error(`${filePath}: review ID does not match its filename`);
    }
    const verifiedAt = requiredString(
      data.verifiedAt,
      `${filePath}: verifiedAt`,
    );
    if (!validDate(verifiedAt)) {
      throw new Error(`${filePath}: invalid verification date`);
    }
    if (!Array.isArray(data.methods) || !data.methods.length) {
      throw new Error(`${filePath}: methods must be a non-empty array`);
    }
    const methods = new Set(
      data.methods.map((method, index) =>
        requiredString(method, `${filePath}: methods[${index}]`),
      ),
    );
    for (const method of requiredMethods) {
      if (!methods.has(method)) {
        throw new Error(`${filePath}: missing verification method ${method}`);
      }
    }
    if (content.trim().length < 80) {
      throw new Error(`${filePath}: verification evidence is missing`);
    }
    if (!Array.isArray(data.topics) || !data.topics.length) {
      throw new Error(`${filePath}: topics must be a non-empty array`);
    }

    for (const [index, rawTopic] of data.topics.entries()) {
      const field = `${filePath}: topics[${index}]`;
      if (
        !rawTopic ||
        typeof rawTopic !== "object" ||
        Array.isArray(rawTopic)
      ) {
        throw new Error(`${field}: expected an object`);
      }
      const slug = requiredString(rawTopic.slug, `${field}.slug`);
      if (reviewedTopics.has(slug)) {
        throw new Error(`${filePath}: duplicate verified topic ${slug}`);
      }
      reviewedTopics.add(slug);
      if (!Array.isArray(rawTopic.tasks) || !rawTopic.tasks.length) {
        throw new Error(`${field}.tasks: expected a non-empty array`);
      }
      const taskIds = rawTopic.tasks.map((id, taskIndex) =>
        requiredString(id, `${field}.tasks[${taskIndex}]`),
      );
      if (new Set(taskIds).size !== taskIds.length) {
        throw new Error(`${filePath}: duplicate task in topic ${slug}`);
      }

      const topicTasks = [...tasks.values()]
        .filter((task) => task.topic === slug && task.status === "verified")
        .map((task) => task.id)
        .sort();
      if (!topicTasks.length)
        throw new Error(`${filePath}: topic ${slug} has no verified tasks`);
      if (taskIds.toSorted().join(",") !== topicTasks.join(",")) {
        throw new Error(`${filePath}: review must cover every task in ${slug}`);
      }

      for (const taskId of taskIds) {
        const task = tasks.get(taskId);
        if (task.status !== "verified") {
          throw new Error(`${filePath}: ${taskId} is not marked verified`);
        }
        if (reviewedTasks.has(taskId)) {
          throw new Error(`${filePath}: duplicate verified task ${taskId}`);
        }
        reviewedTasks.add(taskId);
      }
    }
  }

  for (const task of tasks.values()) {
    if (task.status === "verified" && !reviewedTasks.has(task.id)) {
      throw new Error(`${task.path}: verified task has no review record`);
    }
  }

  return {
    reviewCount: reviewFiles.length,
    verifiedTaskCount: reviewedTasks.size,
    verifiedTopicCount: reviewedTopics.size,
  };
}

async function loadTasks(tasksDirectory) {
  const tasks = new Map();
  const topics = await fs.readdir(tasksDirectory, { withFileTypes: true });
  for (const topic of topics.filter((entry) => entry.isDirectory())) {
    const directory = path.join(tasksDirectory, topic.name);
    const files = (await fs.readdir(directory)).filter((file) =>
      file.endsWith(".md"),
    );
    for (const file of files) {
      const filePath = path.join(directory, file);
      const { data } = matter(await fs.readFile(filePath, "utf8"));
      const id = requiredString(data.id, `${filePath}: id`);
      if (tasks.has(id))
        throw new Error(`${filePath}: duplicate task ID ${id}`);
      tasks.set(id, {
        id,
        path: filePath,
        topic: requiredString(data.topic, `${filePath}: topic`),
        status: requiredString(data.status, `${filePath}: status`),
      });
    }
  }
  return tasks;
}

function requiredString(value, field) {
  if (typeof value !== "string" || !value.trim() || value.trim() !== value) {
    throw new Error(`${field}: expected a non-empty trimmed string`);
  }
  return value;
}

function validDate(value) {
  if (!datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
