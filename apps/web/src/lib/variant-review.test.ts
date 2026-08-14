import { describe, expect, it, vi } from "vitest";

const reviewTaskId = "kv-999";

vi.mock("./content", async () => {
  const actual = await vi.importActual<typeof import("./content")>("./content");

  return {
    ...actual,
    getTasks: async (topicSlug: string) => {
      const tasks = await actual.getTasks(topicSlug);
      if (topicSlug !== "kvadratna-jednacina") return tasks;

      return [
        {
          ...tasks[0],
          id: reviewTaskId,
          status: "review" as const,
          rubric: [],
        },
        ...tasks,
      ];
    },
  };
});

import {
  generateVariant,
  resolveExamVariantTaskIds,
  resolveVariantTaskIds,
} from "./variant";

const verifiedTaskIds = [
  "kb-001",
  "kv-001",
  "eks-001",
  "log-001",
  "trig-001",
  "vek-001",
  "plan-001",
  "ster-001",
  "fun-001",
  "komb-001",
];

describe("exam eligibility boundary", () => {
  it("keeps a review candidate out of deterministic generation", async () => {
    const variant = await generateVariant({ random: () => 0 });

    expect(variant.tasks.map(({ task }) => task.id)).toEqual(verifiedTaskIds);
  });

  it("preserves broad historical resolution without admitting new runs", async () => {
    const taskIds = verifiedTaskIds.with(1, reviewTaskId);

    await expect(resolveVariantTaskIds(taskIds)).resolves.toMatchObject({
      tasks: expect.arrayContaining([
        expect.objectContaining({
          task: expect.objectContaining({ id: reviewTaskId, status: "review" }),
        }),
      ]),
    });
    await expect(resolveExamVariantTaskIds(taskIds)).resolves.toBeNull();
  });
});
