import { describe, expect, it } from "vitest";
import { getFtnCatalog, getFtnP1Programs } from "./guide";

describe("FTN admissions catalog", () => {
  it("loads the current official exam groups without invented P2 or physics", async () => {
    const catalog = await getFtnCatalog();

    expect(catalog.source).toBe("https://ftn.uns.ac.rs/upis/pet-zelja/");
    expect(catalog.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(catalog.exams.map((exam) => exam.code)).toEqual([
      "P1",
      "P3",
      "P4",
      "P5",
      "P6",
      "P7",
      "P8",
    ]);
    expect(catalog.exams.flatMap((exam) => exam.programs)).toHaveLength(29);
    expect(JSON.stringify(catalog).toLowerCase()).not.toContain("fizik");
  });

  it("keeps the overview P1 guide derived from the catalog", async () => {
    const guide = await getFtnP1Programs();

    expect(guide.examId).toBe("ftn-p1");
    expect(guide.programs).toHaveLength(10);
    expect(new Set(guide.programs).size).toBe(10);
    expect(guide.programs).toContain(
      "Softversko inženjerstvo i informacione tehnologije",
    );
  });
});
