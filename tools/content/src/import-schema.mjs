const taskIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const topicPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const selectorPattern = /^[1-9]\d*[a-z]?$/;
const checkKinds = new Set(["value", "values", "interval", "text"]);
const statuses = new Set(["draft", "review"]);

export function validateImportManifest(value) {
  const manifest = record(value, "manifest");
  if (manifest.version !== 1) throw new Error("manifest: unsupported version");
  const collection = boundedString(manifest.collection, "collection", 80);
  const defaults = record(manifest.defaults, "defaults");
  const source = boundedString(defaults.source, "defaults.source", 180);
  const status = boundedString(defaults.status, "defaults.status", 20);
  if (!statuses.has(status)) throw new Error("defaults.status: invalid status");
  if (!Array.isArray(manifest.tasks) || !manifest.tasks.length) {
    throw new Error("tasks: expected a non-empty array");
  }

  const ids = new Set();
  const tasks = manifest.tasks.map((raw, index) => {
    const field = `tasks[${index}]`;
    const task = record(raw, field);
    const id = boundedString(task.id, `${field}.id`, 64);
    if (!taskIdPattern.test(id)) throw new Error(`${field}.id: invalid ID`);
    if (ids.has(id)) throw new Error(`${field}.id: duplicate ${id}`);
    ids.add(id);
    const slot = integer(task.slot, `${field}.slot`, 1, 10);
    const selector = boundedString(task.selector, `${field}.selector`, 12);
    if (!selectorPattern.test(selector)) {
      throw new Error(`${field}.selector: invalid selector`);
    }
    const topic = boundedString(task.topic, `${field}.topic`, 80);
    if (!topicPattern.test(topic)) {
      throw new Error(`${field}.topic: invalid topic`);
    }
    const difficulty = integer(task.difficulty, `${field}.difficulty`, 1, 5);
    const answer = boundedString(task.answer, `${field}.answer`, 2_000);
    if (!Array.isArray(task.hints) || task.hints.length !== 2) {
      throw new Error(`${field}.hints: expected exactly two hints`);
    }
    const hints = task.hints.map((hint, hintIndex) =>
      boundedString(hint, `${field}.hints[${hintIndex}]`, 4_000),
    );
    if (
      !Array.isArray(task.check) ||
      !task.check.length ||
      task.check.length > 10
    ) {
      throw new Error(`${field}.check: expected 1-10 parts`);
    }
    const check = task.check.map((rawPart, partIndex) => {
      const partField = `${field}.check[${partIndex}]`;
      const part = record(rawPart, partField);
      const kind = boundedString(part.kind, `${partField}.kind`, 20);
      if (!checkKinds.has(kind))
        throw new Error(`${partField}.kind: invalid kind`);
      return {
        ...(part.label === undefined
          ? {}
          : { label: boundedString(part.label, `${partField}.label`, 120) }),
        kind,
        expected: boundedString(part.expected, `${partField}.expected`, 1_000),
      };
    });
    return { id, slot, selector, topic, difficulty, answer, hints, check };
  });

  return { version: 1, collection, defaults: { source, status }, tasks };
}

function record(value, field) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field}: expected an object`);
  }
  return value;
}

function boundedString(value, field, maxLength) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > maxLength
  ) {
    throw new Error(`${field}: invalid string`);
  }
  return value;
}

function integer(value, field, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${field}: invalid integer`);
  }
  return value;
}
