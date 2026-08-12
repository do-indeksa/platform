import { describe, expect, it } from "vitest";
import type { JournalAttempt } from "./attempt-journal";
import {
  buildTrainingSet,
  createDefaultTrainingBuilderDraft,
  mergeTrainingBuilderAttempts,
  parseTrainingBuilderDraft,
  replaceTrainingPositions,
  setTrainingPositionQuantity,
  type TrainingBuilderPosition,
  type TrainingBuilderTask,
} from "./training-builder";

const positions: TrainingBuilderPosition[] = [
  { number: 1, topicSlugs: ["complex"], availableCount: 3 },
  { number: 2, topicSlugs: ["quadratic"], availableCount: 3 },
  { number: 4, topicSlugs: ["logs"], availableCount: 3 },
];

const tasks: TrainingBuilderTask[] = [
  { id: "kb-001", topic: "complex", difficulty: 1 },
  { id: "kb-002", topic: "complex", difficulty: 3 },
  { id: "kb-003", topic: "complex", difficulty: 5 },
  { id: "kv-001", topic: "quadratic", difficulty: 2 },
  { id: "kv-002", topic: "quadratic", difficulty: 3 },
  { id: "kv-003", topic: "quadratic", difficulty: 4 },
  { id: "log-001", topic: "logs", difficulty: 2 },
  { id: "log-002", topic: "logs", difficulty: 3 },
  { id: "log-003", topic: "logs", difficulty: 4 },
];
const blueprintVersion = "2026.1";

describe("training builder draft", () => {
  it("starts with a bounded, truthful five-task composition", () => {
    expect(
      createDefaultTrainingBuilderDraft(positions, blueprintVersion),
    ).toMatchObject({
      blueprintVersion,
      quantities: { 1: 3, 4: 2 },
      difficulty: "balanced",
      onlyNew: true,
      shuffle: true,
      prioritizeMistakes: false,
    });
  });

  it("validates every persisted field and rejects stale positions", () => {
    const draft = createDefaultTrainingBuilderDraft(
      positions,
      blueprintVersion,
    );
    expect(
      parseTrainingBuilderDraft(draft, positions, blueprintVersion),
    ).toEqual(draft);
    expect(
      parseTrainingBuilderDraft(
        { ...draft, quantities: { 1: 4 } },
        positions,
        blueprintVersion,
      ),
    ).toBeNull();
    expect(
      parseTrainingBuilderDraft(
        { ...draft, quantities: { 3: 1 } },
        positions,
        blueprintVersion,
      ),
    ).toBeNull();
    expect(
      parseTrainingBuilderDraft(
        { ...draft, shuffle: "yes" },
        positions,
        blueprintVersion,
      ),
    ).toBeNull();
    expect(
      parseTrainingBuilderDraft(
        { ...draft, blueprintVersion: "2027.1" },
        positions,
        blueprintVersion,
      ),
    ).toBeNull();
  });

  it("caps quantities by availability and the ten-task set limit", () => {
    let draft = replaceTrainingPositions(
      createDefaultTrainingBuilderDraft(positions, blueprintVersion),
      positions,
      [1, 2, 4],
    );
    draft = setTrainingPositionQuantity(draft, positions[0], 99);
    expect(draft.quantities[1]).toBe(3);
    draft = setTrainingPositionQuantity(draft, positions[1], -1);
    expect(draft.quantities[2]).toBeUndefined();
  });

  it("never lets one position exceed the remaining set capacity", () => {
    const manyPositions = Array.from({ length: 10 }, (_, index) => ({
      number: index + 1,
      topicSlugs: [`topic-${index + 1}`],
      availableCount: 3,
    }));
    let draft = replaceTrainingPositions(
      createDefaultTrainingBuilderDraft(manyPositions, blueprintVersion),
      manyPositions,
      manyPositions.map(({ number }) => number),
    );

    expect(Object.values(draft.quantities)).toHaveLength(10);
    expect(
      Object.values(draft.quantities).reduce((sum, value) => sum + value),
    ).toBe(10);
    draft = setTrainingPositionQuantity(draft, manyPositions[0], 3);
    expect(draft.quantities[1]).toBe(1);
  });
});

describe("training set selection", () => {
  it("keeps migrated legacy attempts without duplicating rich journal rows", () => {
    const submittedAt = "2026-08-10T10:00:00.000Z";
    expect(
      mergeTrainingBuilderAttempts(
        [{ taskId: "kb-001", outcome: "INCORRECT", submittedAt }],
        [
          {
            taskId: "kb-001",
            slot: 1,
            correct: false,
            source: "practice",
            helpLevel: 0,
            at: submittedAt,
          },
          {
            taskId: "kb-001",
            slot: 1,
            correct: true,
            source: "practice",
            helpLevel: 0,
            at: "2026-08-10T11:00:00.000Z",
          },
        ],
      ),
    ).toEqual([
      { taskId: "kb-001", outcome: "INCORRECT", submittedAt },
      {
        taskId: "kb-001",
        outcome: "CORRECT",
        submittedAt: "2026-08-10T11:00:00.000Z",
      },
    ]);
  });

  it("uses the current position-to-topic mapping and interleaves positions", () => {
    const draft = {
      ...createDefaultTrainingBuilderDraft(positions, blueprintVersion),
      onlyNew: false,
      shuffle: false,
    };
    expect(buildTrainingSet({ draft, positions, tasks, attempts: [] })).toEqual(
      {
        taskIds: ["kb-002", "log-002", "kb-001", "log-001", "kb-003"],
        counts: { 1: 3, 4: 2 },
      },
    );
  });

  it("filters attempted tasks and prioritizes the latest mistakes", () => {
    const draft = {
      ...createDefaultTrainingBuilderDraft(positions, blueprintVersion),
      quantities: { 1: 2 },
      onlyNew: false,
      shuffle: false,
      prioritizeMistakes: true,
    };
    const attempts = [
      attempt("kb-001", "CORRECT", "2026-08-10T10:00:00.000Z"),
      attempt("kb-003", "INCORRECT", "2026-08-10T11:00:00.000Z"),
    ];
    expect(
      buildTrainingSet({ draft, positions, tasks, attempts }).taskIds,
    ).toEqual(["kb-003", "kb-002"]);
    expect(
      buildTrainingSet({
        draft: { ...draft, onlyNew: true },
        positions,
        tasks,
        attempts,
      }).taskIds,
    ).toEqual(["kb-002"]);
  });

  it("uses a stable seed when shuffled and never duplicates tasks", () => {
    const draft = replaceTrainingPositions(
      createDefaultTrainingBuilderDraft(positions, blueprintVersion),
      positions,
      [1, 2, 4],
    );
    const first = buildTrainingSet({
      draft,
      positions,
      tasks,
      attempts: [],
      seed: "practice-one",
    });
    const second = buildTrainingSet({
      draft,
      positions,
      tasks,
      attempts: [],
      seed: "practice-one",
    });
    expect(second.taskIds).toEqual(first.taskIds);
    expect(new Set(first.taskIds).size).toBe(first.taskIds.length);
    expect(first.taskIds).toHaveLength(3);
  });

  it("applies foundation and advanced ordering strategies", () => {
    const base = {
      ...createDefaultTrainingBuilderDraft(positions, blueprintVersion),
      quantities: { 1: 3 },
      onlyNew: false,
      shuffle: false,
    };

    expect(
      buildTrainingSet({
        draft: { ...base, difficulty: "foundation" },
        positions,
        tasks,
        attempts: [],
      }).taskIds,
    ).toEqual(["kb-001", "kb-002", "kb-003"]);
    expect(
      buildTrainingSet({
        draft: { ...base, difficulty: "advanced" },
        positions,
        tasks,
        attempts: [],
      }).taskIds,
    ).toEqual(["kb-003", "kb-002", "kb-001"]);
  });

  it("returns an honest empty set when filters exclude every candidate", () => {
    const draft = {
      ...createDefaultTrainingBuilderDraft(positions, blueprintVersion),
      quantities: { 1: 2 },
      onlyNew: true,
    };
    const attempts = tasks
      .filter(({ topic }) => topic === "complex")
      .map(({ id }, index) =>
        attempt(id, "CORRECT", `2026-08-10T10:0${index}:00.000Z`),
      );

    expect(buildTrainingSet({ draft, positions, tasks, attempts })).toEqual({
      taskIds: [],
      counts: {},
    });
  });
});

function attempt(
  taskId: string,
  outcome: JournalAttempt["outcome"],
  submittedAt: string,
): Pick<JournalAttempt, "taskId" | "outcome" | "submittedAt"> {
  return { taskId, outcome, submittedAt };
}
