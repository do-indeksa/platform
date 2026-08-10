import { describe, expect, it } from "vitest";
import { getTopics } from "./content";
import { getP1Blueprint, getP1BlueprintVersions } from "./exam-blueprint";

describe("FTN P1 blueprints", () => {
  it("selects the current annual blueprint by default", async () => {
    await expect(getP1BlueprintVersions()).resolves.toEqual({
      latestVersion: "2026.1",
      versions: ["2025.1", "2026.1"],
    });

    const blueprint = await getP1Blueprint();
    expect(blueprint.version).toBe("2026.1");
    expect(blueprint.status).toBe("current");
  });

  it.each(["2025.1", "2026.1"])(
    "validates the published %s format and grading boundary",
    async (version) => {
      const blueprint = await getP1Blueprint(version);
      const topicSlugs = new Set(
        (await getTopics()).map((topic) => topic.slug),
      );

      expect(blueprint).toMatchObject({
        examId: "ftn-p1",
        durationMinutes: 240,
        taskCount: 10,
        maxPoints: 60,
        grading: {
          methodGraded: true,
          partialCredit: true,
          binaryTrainerEstimateOfficial: false,
        },
      });
      expect(blueprint.positions.map((position) => position.number)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
      ]);
      expect(
        blueprint.positions.reduce(
          (total, position) => total + position.maxPoints,
          0,
        ),
      ).toBe(60);
      expect(
        blueprint.positions.every((position) =>
          position.topicSlugs.every((slug) => topicSlugs.has(slug)),
        ),
      ).toBe(true);
      expect(
        blueprint.sources.every(
          (source) =>
            source.url.startsWith("https://") &&
            /^\d{4}-\d{2}-\d{2}$/.test(source.retrievedAt),
        ),
      ).toBe(true);
      expect(
        blueprint.sources
          .filter((source) => source.url.toLowerCase().includes(".pdf"))
          .every((source) => /^[a-f0-9]{64}$/.test(source.sha256 ?? "")),
      ).toBe(true);
    },
  );

  it("keeps the observed 2025 and 2026 position swap explicit", async () => {
    const [blueprint2025, blueprint2026] = await Promise.all([
      getP1Blueprint("2025.1"),
      getP1Blueprint("2026.1"),
    ]);

    expect(blueprint2025.positions[2].topicSlugs).toEqual(["logaritmi"]);
    expect(blueprint2025.positions[3].topicSlugs).toEqual(["eksponencijalne"]);
    expect(blueprint2026.positions[2].topicSlugs).toEqual(["eksponencijalne"]);
    expect(blueprint2026.positions[3].topicSlugs).toEqual(["logaritmi"]);
  });

  it("rejects blueprint versions outside the index", async () => {
    await expect(getP1Blueprint("2024.1")).rejects.toThrow(
      "unknown ftn-p1 blueprint version: 2024.1",
    );
  });
});
