import { describe, expect, it } from "vitest";
import { getDiagnosticCloudCatalog } from "./diagnostic-cloud-catalog";

describe("diagnostic cloud catalog", () => {
  it("contains only bounded validation metadata", async () => {
    const catalog = await getDiagnosticCloudCatalog();

    expect(catalog.blueprintVersion).toMatch(/^ftn-p1:\d{4}\.\d+$/);
    expect(catalog.durationMinutes).toBeGreaterThan(0);
    expect(catalog.taskCount).toBe(10);
    expect(catalog.maxPoints).toBe(60);
    expect(catalog.positions).toHaveLength(10);
    for (const [index, position] of catalog.positions.entries()) {
      expect(position).toMatchObject({
        ordinal: index + 1,
        examPosition: index + 1,
        maxPoints: expect.any(Number),
      });
      expect(position.candidates.length).toBeGreaterThan(0);
      for (const task of position.candidates) {
        expect(Object.keys(task).toSorted()).toEqual([
          "answerPartCount",
          "id",
          "revision",
          "slot",
          "topic",
        ]);
        expect(task.answerPartCount).toBeGreaterThanOrEqual(1);
        expect(task.answerPartCount).toBeLessThanOrEqual(6);
      }
    }
    expect(JSON.stringify(catalog)).not.toMatch(
      /statement|solution|expected|grading|hint/i,
    );
  });
});
