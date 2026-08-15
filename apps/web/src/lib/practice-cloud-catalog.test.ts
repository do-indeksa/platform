import { describe, expect, it } from "vitest";
import { projectPracticeCloudCatalog } from "./practice-cloud-catalog";
import type { ProgressCloudCatalog } from "./progress-cloud-types";

const revision = (character: string) => `sha256:${character.repeat(64)}`;
const task = {
  id: "kb-001",
  revision: revision("a"),
  slot: 1,
  topic: "kompleksni-brojevi",
  answerPartCount: 2,
};

describe("practice cloud catalog", () => {
  it("deduplicates current tasks into a stable strict catalog", () => {
    const catalog = progressCatalog([
      position(2, [
        {
          id: "kv-001",
          revision: revision("b"),
          slot: 2,
          topic: "kvadratne-jednacine",
          answerPartCount: 1,
        },
      ]),
      position(1, [task, { ...task }]),
    ]);

    expect(projectPracticeCloudCatalog(catalog)).toEqual({
      blueprintVersion: "ftn-p1:2026.1",
      tasks: [
        task,
        {
          id: "kv-001",
          revision: revision("b"),
          slot: 2,
          topic: "kvadratne-jednacine",
          answerPartCount: 1,
        },
      ],
      examPositionByTaskId: new Map([
        ["kb-001", 1],
        ["kv-001", 2],
      ]),
    });
  });

  it("keeps legacy task slots separate from current blueprint positions", () => {
    const projected = projectPracticeCloudCatalog(
      progressCatalog([position(2, [task])]),
    );

    expect(projected.tasks).toEqual([task]);
    expect(projected.examPositionByTaskId.get(task.id)).toBe(2);
  });

  it("rejects conflicting duplicates, ambiguous positions, and empty catalogs", () => {
    expect(() =>
      projectPracticeCloudCatalog(
        progressCatalog([
          position(1, [task, { ...task, revision: revision("c") }]),
        ]),
      ),
    ).toThrow("practice catalog has conflicting task kb-001");
    expect(() =>
      projectPracticeCloudCatalog(
        progressCatalog([position(1, [task]), position(2, [{ ...task }])]),
      ),
    ).toThrow("practice task kb-001 has ambiguous exam positions");
    expect(() => projectPracticeCloudCatalog(progressCatalog([]))).toThrow(
      "practice catalog has no tasks",
    );
  });
});

function progressCatalog(
  positions: ProgressCloudCatalog["positions"],
): ProgressCloudCatalog {
  return {
    blueprintVersion: "ftn-p1:2026.1",
    durationMinutes: 240,
    taskCount: 10,
    maxPoints: 60,
    positions,
  };
}

function position(
  examPosition: number,
  candidates: ProgressCloudCatalog["positions"][number]["candidates"],
): ProgressCloudCatalog["positions"][number] {
  return {
    ordinal: examPosition,
    examPosition,
    maxPoints: 6,
    candidates,
  };
}
