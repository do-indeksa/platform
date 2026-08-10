export function renderTaskFile({
  task,
  source,
  status,
  origin,
  statement,
  solution,
}) {
  const lines = [
    "---",
    `id: ${task.id}`,
    `slot: ${task.slot}`,
    `topic: ${task.topic}`,
    `difficulty: ${task.difficulty}`,
    `source: ${yamlString(source)}`,
    `origin: ${yamlString(origin)}`,
    `status: ${status}`,
    `answer: ${yamlString(task.answer)}`,
    "check:",
  ];
  for (const part of task.check) {
    if (part.label !== undefined)
      lines.push(`  - label: ${yamlString(part.label)}`);
    else lines.push(`  - kind: ${part.kind}`);
    if (part.label !== undefined) lines.push(`    kind: ${part.kind}`);
    lines.push(`    expected: ${yamlString(part.expected)}`);
  }
  lines.push(
    "---",
    "",
    "## Zadatak",
    "",
    statement,
    "",
    "## Nagoveštaj 1",
    "",
    task.hints[0],
    "",
    "## Nagoveštaj 2",
    "",
    task.hints[1],
    "",
    "## Rešenje",
    "",
    solution,
    "",
  );
  return lines.join("\n");
}

function yamlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}
