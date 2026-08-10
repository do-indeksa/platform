import { describe, expect, it } from "vitest";
import { generateVariant } from "./variant";

describe("generateVariant", () => {
  it("assembles the latest blueprint deterministically without duplicate tasks", async () => {
    const variant = await generateVariant({ random: () => 0 });

    expect(variant.blueprint.version).toBe("2026.1");
    expect(variant.tasks).toHaveLength(10);
    expect(variant.tasks.map((item) => item.examPosition)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(new Set(variant.tasks.map((item) => item.task.id)).size).toBe(10);
    expect(variant.tasks.map((item) => item.task.topic)).toEqual([
      "kompleksni-brojevi",
      "kvadratna-jednacina",
      "eksponencijalne",
      "logaritmi",
      "trigonometrija",
      "vektori-analitika",
      "planimetrija",
      "stereometrija",
      "analiza-funkcije",
      "kombinatorika",
    ]);
    expect(variant.tasks[2]).toMatchObject({
      examPosition: 3,
      task: { slot: 4, topic: "eksponencijalne" },
    });
    expect(variant.tasks[3]).toMatchObject({
      examPosition: 4,
      task: { slot: 3, topic: "logaritmi" },
    });
    expect(variant.tasks.every((item) => item.maxPoints === 6)).toBe(true);
  });

  it("can reproduce the historical 2025 position order", async () => {
    const variant = await generateVariant({
      version: "2025.1",
      random: () => 0,
    });

    expect(variant.tasks[2].task.topic).toBe("logaritmi");
    expect(variant.tasks[3].task.topic).toBe("eksponencijalne");
  });

  it.each([-0.01, 1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid random sample: %s",
    async (sample) => {
      await expect(generateVariant({ random: () => sample })).rejects.toThrow(
        "variant random source must return a finite value in [0, 1)",
      );
    },
  );
});
