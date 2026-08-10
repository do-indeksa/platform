import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import {
  ftnExamCodes,
  type FtnCatalog,
  type FtnCutoffs,
  type FtnExam,
  type FtnExamCode,
  type FtnExamId,
  type FtnExamPrograms,
  type FtnFaculty,
} from "./guide-types";

export type {
  Cutoff,
  FtnCatalog,
  FtnCutoffs,
  FtnExam,
  FtnExamCode,
  FtnExamId,
  FtnExamPrograms,
  FtnFaculty,
  Program,
} from "./guide-types";

const guideDir = path.join(process.cwd(), "..", "..", "content", "guide");

export async function getFtnCutoffs(): Promise<FtnCutoffs> {
  const raw = await fs.readFile(
    path.join(guideDir, "ftn", "cutoffs.yaml"),
    "utf8",
  );
  return parse(raw) as FtnCutoffs;
}

export async function getFtnCatalog(): Promise<FtnCatalog> {
  const raw = await fs.readFile(
    path.join(guideDir, "ftn", "catalog.yaml"),
    "utf8",
  );
  return parseCatalog(parse(raw));
}

export async function getFtnP1Programs(): Promise<FtnExamPrograms> {
  const catalog = await getFtnCatalog();
  const p1 = catalog.exams.find((exam) => exam.id === "ftn-p1");
  if (!p1) throw new Error("FTN P1 is missing from the catalog");

  return {
    examId: "ftn-p1",
    source: catalog.source,
    retrievedAt: catalog.retrievedAt,
    programs: [...p1.programs],
  };
}

function parseCatalog(value: unknown): FtnCatalog {
  if (!isRecord(value)) throw new Error("invalid FTN catalog");
  const faculty = parseFaculty(value.faculty);
  const exams = parseExams(value.exams);
  const source = officialFtnUrl(value.source, "catalog source");
  const retrievedAt = boundedString(value.retrievedAt, "retrieval date", 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(retrievedAt)) {
    throw new Error("invalid FTN catalog retrieval date");
  }

  const programNames = exams.flatMap((exam) => exam.programs);
  if (new Set(programNames).size !== programNames.length) {
    throw new Error("a program belongs to more than one FTN exam group");
  }

  return { source, retrievedAt, faculty, exams };
}

function parseFaculty(value: unknown): FtnFaculty {
  if (!isRecord(value) || value.id !== "ftn" || value.slug !== "ftn") {
    throw new Error("invalid FTN faculty");
  }

  return {
    id: "ftn",
    slug: "ftn",
    name: boundedString(value.name, "faculty name", 120),
    university: boundedString(value.university, "university name", 120),
    city: boundedString(value.city, "faculty city", 80),
    officialUrl: officialFtnUrl(value.officialUrl, "faculty URL"),
    programsUrl: officialFtnUrl(value.programsUrl, "programs URL"),
  };
}

function parseExams(value: unknown): FtnExam[] {
  if (!Array.isArray(value) || value.length !== ftnExamCodes.length) {
    throw new Error("invalid FTN exam groups");
  }

  const exams = value.map(parseExam);
  const actualCodes = exams.map((exam) => exam.code);
  if (actualCodes.some((code, index) => code !== ftnExamCodes[index])) {
    throw new Error("unexpected FTN exam code or order");
  }
  if (
    exams.some((exam) =>
      exam.code === "P1"
        ? exam.status !== "available"
        : exam.status !== "planned",
    )
  ) {
    throw new Error("invalid FTN exam availability");
  }

  return exams;
}

function parseExam(value: unknown): FtnExam {
  if (!isRecord(value) || !isExamCode(value.code)) {
    throw new Error("invalid FTN exam");
  }
  const expectedId = `ftn-${value.code.toLowerCase()}` as FtnExamId;
  if (
    value.id !== expectedId ||
    (value.status !== "available" && value.status !== "planned") ||
    !Array.isArray(value.programs) ||
    value.programs.length === 0 ||
    value.programs.length > 50
  ) {
    throw new Error(`invalid FTN ${value.code} exam group`);
  }

  const programs = value.programs.map((program) =>
    boundedString(program, `${value.code} program`, 180),
  );
  if (new Set(programs).size !== programs.length) {
    throw new Error(`duplicate program in FTN ${value.code}`);
  }

  return {
    id: expectedId,
    code: value.code,
    officialName: boundedString(value.officialName, "exam name", 180),
    status: value.status,
    programs,
  };
}

function boundedString(value: unknown, field: string, maxLength: number) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > maxLength
  ) {
    throw new Error(`invalid ${field}`);
  }
  return value;
}

function officialFtnUrl(value: unknown, field: string) {
  const raw = boundedString(value, field, 240);
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "ftn.uns.ac.rs" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== ""
  ) {
    throw new Error(`invalid ${field}`);
  }
  return url.toString();
}

function isExamCode(value: unknown): value is FtnExamCode {
  return ftnExamCodes.includes(value as FtnExamCode);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
