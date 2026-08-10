import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

const guideDir = path.join(process.cwd(), "..", "..", "content", "guide");

export type Cutoff = {
  year: number;
  budget: number;
  selfFinanced?: number;
};

export type Program = {
  name: string;
  cutoffs: Cutoff[];
};

export type FtnCutoffs = {
  source: string;
  note: string;
  programs: Program[];
};

export type FtnExamPrograms = {
  examId: "ftn-p1";
  source: string;
  retrievedAt: string;
  programs: string[];
};

export async function getFtnCutoffs(): Promise<FtnCutoffs> {
  const raw = await fs.readFile(
    path.join(guideDir, "ftn", "cutoffs.yaml"),
    "utf8",
  );
  return parse(raw) as FtnCutoffs;
}

export async function getFtnP1Programs(): Promise<FtnExamPrograms> {
  const raw = await fs.readFile(
    path.join(guideDir, "ftn", "p1-programs.yaml"),
    "utf8",
  );
  return parseExamPrograms(parse(raw));
}

function parseExamPrograms(value: unknown): FtnExamPrograms {
  if (!isRecord(value)) throw new Error("invalid FTN exam program guide");
  const programs = value.programs;
  if (
    value.examId !== "ftn-p1" ||
    typeof value.source !== "string" ||
    !value.source.startsWith("https://ftn.uns.ac.rs/") ||
    typeof value.retrievedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.retrievedAt) ||
    !Array.isArray(programs) ||
    programs.length === 0 ||
    programs.length > 100 ||
    !programs.every(
      (program) =>
        typeof program === "string" &&
        program.trim() === program &&
        program.length > 0 &&
        program.length <= 160,
    ) ||
    new Set(programs).size !== programs.length
  ) {
    throw new Error("invalid FTN P1 program guide");
  }
  return {
    examId: "ftn-p1",
    source: value.source,
    retrievedAt: value.retrievedAt,
    programs: [...programs],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
