import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { practiceTaskSetRevision } from "./practice-cloud-revision";

const tasks = [
  { id: "kb-001", revision: `sha256:${"a".repeat(64)}` },
  { id: "kv-001", revision: `sha256:${"b".repeat(64)}` },
];

describe("practice cloud content revision", () => {
  it("matches the server-side ordered task-set hash", async () => {
    const hash = createHash("sha256");
    for (const task of tasks) {
      hash.update(task.id);
      hash.update("\0");
      hash.update(task.revision);
      hash.update("\n");
    }

    await expect(practiceTaskSetRevision(tasks)).resolves.toBe(
      `sha256:${hash.digest("hex")}`,
    );
  });

  it("keeps task order in the assignment identity", async () => {
    await expect(practiceTaskSetRevision(tasks)).resolves.not.toBe(
      await practiceTaskSetRevision(tasks.toReversed()),
    );
  });

  it("rejects empty or malformed task snapshots", async () => {
    await expect(practiceTaskSetRevision([])).rejects.toBeInstanceOf(TypeError);
    await expect(
      practiceTaskSetRevision([
        { id: "../secret", revision: tasks[0].revision },
      ]),
    ).rejects.toBeInstanceOf(TypeError);
  });
});
