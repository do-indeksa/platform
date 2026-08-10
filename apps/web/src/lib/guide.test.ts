import { describe, expect, it } from "vitest";
import { getFtnP1Programs } from "./guide";

describe("FTN P1 program guide", () => {
  it("loads the current official P1 program group", async () => {
    const guide = await getFtnP1Programs();

    expect(guide.examId).toBe("ftn-p1");
    expect(guide.source).toBe("https://ftn.uns.ac.rs/upis/pet-zelja/");
    expect(guide.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(guide.programs).toHaveLength(10);
    expect(new Set(guide.programs).size).toBe(10);
    expect(guide.programs).toContain(
      "Softversko inženjerstvo i informacione tehnologije",
    );
  });
});
