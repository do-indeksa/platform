import { describe, expect, it } from "vitest";
import { getFtnP1Programs } from "./guide";
import { buildLandingProgramGroups } from "./landing";

describe("landing program groups", () => {
  it("uses every current FTN P1 program exactly once", async () => {
    const { programs } = await getFtnP1Programs();
    const groups = buildLandingProgramGroups(programs);

    expect(groups.map((group) => group.id)).toEqual([
      "software",
      "systems",
      "information",
      "interdisciplinary",
    ]);
    expect(
      groups
        .flatMap((group) => group.programs)
        .filter((program): program is string => program !== null)
        .toSorted(),
    ).toEqual(programs.toSorted());
  });

  it("requires an explicit regroup when the catalog changes", async () => {
    const { programs } = await getFtnP1Programs();

    expect(() => buildLandingProgramGroups(programs.slice(1))).toThrow(
      /catalog drift/,
    );
    expect(() => buildLandingProgramGroups([...programs, programs[0]])).toThrow(
      /catalog drift/,
    );
  });
});
