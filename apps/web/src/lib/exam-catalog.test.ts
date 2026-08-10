import { describe, expect, it } from "vitest";
import {
  examCatalogHref,
  filterFtnExams,
  matchingFtnPrograms,
  parseExamQuery,
} from "./exam-catalog";
import { getFtnCatalog } from "./guide";
import type { FtnExamCode } from "./guide-types";

const names: Record<FtnExamCode, string> = {
  P1: "Mathematics",
  P3: "Mathematics with logic",
  P4: "Mathematics and GRID aptitude test",
  P5: "Mathematics and safety aptitude test",
  P6: "Mathematics and civil engineering aptitude test",
  P7: "Architecture admission test",
  P8: "General culture test and interview",
};

describe("exam catalog search", () => {
  it("finds programs without requiring Serbian diacritics", async () => {
    const catalog = await getFtnCatalog();

    expect(filterFtnExams(catalog, names, "racunarstvo")).toMatchObject([
      { code: "P1" },
    ]);
    expect(filterFtnExams(catalog, names, "gradevinarstvo")).toMatchObject([
      { code: "P6" },
    ]);
    expect(filterFtnExams(catalog, names, "FTN P6")).toMatchObject([
      { code: "P6" },
    ]);
  });

  it("finds localized exam names and recovers to the full catalog", async () => {
    const catalog = await getFtnCatalog();

    expect(filterFtnExams(catalog, names, "architecture")).toMatchObject([
      { code: "P7" },
    ]);
    expect(filterFtnExams(catalog, names, "missing program")).toEqual([]);
    expect(filterFtnExams(catalog, names, "")).toHaveLength(7);
  });

  it("exposes the exact program that matched a search", async () => {
    const catalog = await getFtnCatalog();
    const p1 = catalog.exams[0];

    expect(matchingFtnPrograms(p1, "FTN racunarstvo")).toEqual([
      "Računarstvo i automatika (E2)",
    ]);
  });

  it("bounds and serializes a shareable query", () => {
    expect(parseExamQuery(["  P3  ", "ignored"])).toBe("P3");
    expect(parseExamQuery("x".repeat(200))).toHaveLength(120);
    expect(examCatalogHref(" P3 ")).toBe("/exams?q=P3");
    expect(examCatalogHref(" ")).toBe("/exams");
  });
});
