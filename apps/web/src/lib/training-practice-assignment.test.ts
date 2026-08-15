import { describe, expect, it } from "vitest";
import type { TrainingPracticeTask } from "./training-practice-assignment";
import { createTrainingPracticeAssignment } from "./training-practice-assignment";

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const revision = (character: string) => `sha256:${character.repeat(64)}`;
const catalog: TrainingPracticeTask[] = [
  {
    id: "kb-001",
    revision: revision("a"),
    slot: 1,
    topic: "kompleksni-brojevi",
    difficulty: 2,
    answerPartCount: 2,
  },
  {
    id: "log-001",
    revision: revision("b"),
    slot: 4,
    topic: "logaritmi",
    difficulty: 3,
    answerPartCount: 1,
  },
];

describe("training practice assignment", () => {
  it("keeps selected order and snapshots only immutable task metadata", async () => {
    const assignment = await createTrainingPracticeAssignment(
      runId,
      "2026.1",
      ["log-001", "kb-001"],
      catalog,
    );

    expect(assignment).toEqual({
      runId,
      blueprintVersion: "ftn-p1:2026.1",
      contentRevision:
        "sha256:80c86bbec6cf67c8143334ca11542304b1fe22ddc82f5cd6f5cde565b696cbe8",
      tasks: [
        {
          id: "log-001",
          revision: revision("b"),
          slot: 4,
          topic: "logaritmi",
          answerPartCount: 1,
        },
        {
          id: "kb-001",
          revision: revision("a"),
          slot: 1,
          topic: "kompleksni-brojevi",
          answerPartCount: 2,
        },
      ],
    });
    expect(JSON.stringify(assignment)).not.toMatch(
      /difficulty|statement|solution|expectedAnswer|gradingRule/i,
    );
  });

  it("changes the aggregate revision when selected order changes", async () => {
    const first = await createTrainingPracticeAssignment(
      runId,
      "2026.1",
      ["kb-001", "log-001"],
      catalog,
    );
    const second = await createTrainingPracticeAssignment(
      runId,
      "2026.1",
      ["log-001", "kb-001"],
      catalog,
    );
    expect(first?.contentRevision).not.toBe(second?.contentRevision);
  });

  it.each([
    ["missing task", ["unknown"]],
    ["duplicate task", ["kb-001", "kb-001"]],
    ["empty set", []],
  ])("fails closed for %s", async (_name, selectedTaskIds) => {
    await expect(
      createTrainingPracticeAssignment(
        runId,
        "2026.1",
        selectedTaskIds,
        catalog,
      ),
    ).resolves.toBeNull();
  });

  it("fails closed for duplicate catalog identities", async () => {
    await expect(
      createTrainingPracticeAssignment(
        runId,
        "2026.1",
        ["kb-001"],
        [...catalog, { ...catalog[0] }],
      ),
    ).resolves.toBeNull();
  });

  it.each([
    ["run id", "not-a-uuid", "2026.1", catalog],
    ["blueprint", runId, "latest", catalog],
    [
      "task revision",
      runId,
      "2026.1",
      [{ ...catalog[0], revision: "mutable" }],
    ],
    ["task slot", runId, "2026.1", [{ ...catalog[0], slot: 11 }]],
    ["task topic", runId, "2026.1", [{ ...catalog[0], topic: "../topic" }]],
    ["answer shape", runId, "2026.1", [{ ...catalog[0], answerPartCount: 0 }]],
  ])("fails closed for malformed %s", async (_name, id, version, tasks) => {
    await expect(
      createTrainingPracticeAssignment(id, version, [tasks[0].id], tasks),
    ).resolves.toBeNull();
  });
});
