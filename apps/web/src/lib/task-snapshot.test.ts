import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { getArchivedTask, getTasks, getTopics } from "./content";

describe("archived task resolver", () => {
  it("resolves every verified task from its immutable revision", async () => {
    const topics = await getTopics();
    const tasks = (
      await Promise.all(topics.map((topic) => getTasks(topic.slug)))
    )
      .flat()
      .filter((task) => task.status === "verified");

    expect(tasks).toHaveLength(30);
    for (const task of tasks) {
      await expect(getArchivedTask(task.id, task.revision)).resolves.toEqual(
        task,
      );
    }
  });

  it.each([
    ["../kb-001", `sha256:${"a".repeat(64)}`],
    ["kb-001/../../tasks", `sha256:${"a".repeat(64)}`],
    ["kb-001", "../tasks/kb-001.md"],
    ["kb-001", `sha256:${"A".repeat(64)}`],
    ["kb-001", `sha256:${"a".repeat(63)}`],
  ])(
    "rejects an invalid lookup before reading the filesystem: %s",
    async (taskId, revision) => {
      const readFile = vi.spyOn(fs, "readFile");
      try {
        await expect(
          getArchivedTask(taskId, revision),
        ).resolves.toBeUndefined();
        expect(readFile).not.toHaveBeenCalled();
      } finally {
        readFile.mockRestore();
      }
    },
  );

  it("returns no content for an unknown valid revision or wrong task ID", async () => {
    const task = (await getTasks("kompleksni-brojevi"))[0];
    await expect(
      getArchivedTask(task.id, `sha256:${"0".repeat(64)}`),
    ).resolves.toBeUndefined();
    await expect(
      getArchivedTask("kv-001", task.revision),
    ).resolves.toBeUndefined();
  });

  it("fails loudly when archived bytes do not match the requested revision", async () => {
    const task = (await getTasks("kompleksni-brojevi"))[0];
    const readFile = vi
      .spyOn(fs, "readFile")
      .mockResolvedValue("corrupt snapshot" as never);
    try {
      await expect(getArchivedTask(task.id, task.revision)).rejects.toThrow(
        "archived task hash mismatch",
      );
    } finally {
      readFile.mockRestore();
    }
  });

  it.each([
    ["wrong ID", { id: "other-001" }, "archived task ID mismatch"],
    ["invalid topic", { topic: "../tasks" }, "archived task topic is invalid"],
    ["review status", { status: "review" }, "archived task is not verified"],
  ])(
    "fails loudly for archived task metadata with %s",
    async (_, override, message) => {
      const raw = archivedTaskFile(override);
      const revision = `sha256:${createHash("sha256").update(raw).digest("hex")}`;
      const readFile = vi.spyOn(fs, "readFile").mockResolvedValue(raw as never);
      try {
        await expect(getArchivedTask("kb-001", revision)).rejects.toThrow(
          message,
        );
      } finally {
        readFile.mockRestore();
      }
    },
  );
});

function archivedTaskFile(
  override: Partial<{ id: string; topic: string; status: string }>,
): string {
  const data = {
    id: "kb-001",
    topic: "kompleksni-brojevi",
    status: "verified",
    ...override,
  };
  return `---\nid: ${data.id}\ntopic: ${data.topic}\nstatus: ${data.status}\n---\n\n## Zadatak\n\nTest.\n\n## Rešenje\n\nTest.\n`;
}
