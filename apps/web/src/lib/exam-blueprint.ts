import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

const EXAM_ID = "ftn-p1";
const VERSION_PATTERN = /^\d{4}\.\d+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const TOPIC_PATTERN = /^[a-z0-9-]+$/;
const blueprintDir = path.join(
  process.cwd(),
  "..",
  "..",
  "content",
  "exams",
  EXAM_ID,
);

export type P1BlueprintSource = {
  role: "format" | "officialVariant";
  url: string;
  retrievedAt: string;
  sha256?: string;
};

export type P1BlueprintPosition = {
  number: number;
  topicSlugs: string[];
  maxPoints: number;
};

export type P1Blueprint = {
  examId: typeof EXAM_ID;
  version: string;
  year: number;
  status: "historical" | "current";
  durationMinutes: number;
  taskCount: number;
  maxPoints: number;
  grading: {
    methodGraded: boolean;
    partialCredit: boolean;
    binaryTrainerEstimateOfficial: boolean;
  };
  sources: P1BlueprintSource[];
  positions: P1BlueprintPosition[];
};

type P1BlueprintIndex = {
  examId: typeof EXAM_ID;
  latestVersion: string;
  versions: string[];
};

export async function getP1Blueprint(version?: string): Promise<P1Blueprint> {
  const index = await readIndex();
  const selected = version ?? index.latestVersion;
  if (!index.versions.includes(selected)) {
    throw new Error(`unknown ${EXAM_ID} blueprint version: ${selected}`);
  }
  const raw = await fs.readFile(
    path.join(blueprintDir, `${selected}.yaml`),
    "utf8",
  );
  const blueprint = parseBlueprint(parse(raw), selected);
  return blueprint;
}

export async function getP1BlueprintVersions(): Promise<{
  latestVersion: string;
  versions: string[];
}> {
  const { latestVersion, versions } = await readIndex();
  return { latestVersion, versions: [...versions] };
}

async function readIndex(): Promise<P1BlueprintIndex> {
  const raw = await fs.readFile(path.join(blueprintDir, "index.yaml"), "utf8");
  const value = record(parse(raw), "blueprint index");
  const examId = stringField(value, "examId", "blueprint index");
  if (examId !== EXAM_ID) throw new Error(`unsupported exam id: ${examId}`);
  const latestVersion = versionField(value, "latestVersion", "blueprint index");
  const versions = stringArray(value.versions, "blueprint index.versions");
  if (new Set(versions).size !== versions.length) {
    throw new Error("blueprint index contains duplicate versions");
  }
  for (const version of versions) assertVersion(version, "blueprint index");
  if (!versions.includes(latestVersion)) {
    throw new Error("latest blueprint version is not listed");
  }
  return { examId: EXAM_ID, latestVersion, versions };
}

function parseBlueprint(value: unknown, requestedVersion: string): P1Blueprint {
  const data = record(value, `blueprint ${requestedVersion}`);
  const examId = stringField(data, "examId", requestedVersion);
  if (examId !== EXAM_ID)
    throw new Error(`${requestedVersion}: invalid examId`);
  const version = versionField(data, "version", requestedVersion);
  if (version !== requestedVersion) {
    throw new Error(`${requestedVersion}: file and payload versions differ`);
  }
  const year = integerField(data, "year", requestedVersion, 2000, 2100);
  if (!version.startsWith(`${year}.`)) {
    throw new Error(`${requestedVersion}: year and version differ`);
  }
  const status = stringField(data, "status", requestedVersion);
  if (status !== "historical" && status !== "current") {
    throw new Error(`${requestedVersion}: invalid status`);
  }
  const durationMinutes = integerField(
    data,
    "durationMinutes",
    requestedVersion,
    1,
    24 * 60,
  );
  const taskCount = integerField(data, "taskCount", requestedVersion, 1, 100);
  const maxPoints = integerField(data, "maxPoints", requestedVersion, 1, 1000);
  const grading = parseGrading(data.grading, requestedVersion);
  const sources = arrayField(data, "sources", requestedVersion).map(
    (source, index) =>
      parseSource(source, `${requestedVersion}.sources[${index}]`),
  );
  if (!sources.some((source) => source.role === "format")) {
    throw new Error(`${requestedVersion}: format source is required`);
  }
  if (!sources.some((source) => source.role === "officialVariant")) {
    throw new Error(`${requestedVersion}: official variant source is required`);
  }
  const positions = arrayField(data, "positions", requestedVersion).map(
    (position, index) =>
      parsePosition(position, `${requestedVersion}.positions[${index}]`),
  );
  if (positions.length !== taskCount) {
    throw new Error(`${requestedVersion}: taskCount does not match positions`);
  }
  positions.forEach((position, index) => {
    if (position.number !== index + 1) {
      throw new Error(`${requestedVersion}: positions must be contiguous`);
    }
  });
  const pointsTotal = positions.reduce(
    (sum, position) => sum + position.maxPoints,
    0,
  );
  if (pointsTotal !== maxPoints) {
    throw new Error(
      `${requestedVersion}: position points do not total maxPoints`,
    );
  }
  return {
    examId: EXAM_ID,
    version,
    year,
    status,
    durationMinutes,
    taskCount,
    maxPoints,
    grading,
    sources,
    positions,
  };
}

function parseGrading(value: unknown, context: string): P1Blueprint["grading"] {
  const grading = record(value, `${context}.grading`);
  return {
    methodGraded: booleanField(grading, "methodGraded", context),
    partialCredit: booleanField(grading, "partialCredit", context),
    binaryTrainerEstimateOfficial: booleanField(
      grading,
      "binaryTrainerEstimateOfficial",
      context,
    ),
  };
}

function parseSource(value: unknown, context: string): P1BlueprintSource {
  const source = record(value, context);
  const role = stringField(source, "role", context);
  if (role !== "format" && role !== "officialVariant") {
    throw new Error(`${context}: invalid source role`);
  }
  const url = stringField(source, "url", context);
  if (!url.startsWith("https://"))
    throw new Error(`${context}: HTTPS URL required`);
  const retrievedAt = stringField(source, "retrievedAt", context);
  if (!DATE_PATTERN.test(retrievedAt)) {
    throw new Error(`${context}: invalid retrieval date`);
  }
  const sha256 = source.sha256;
  if (
    sha256 !== undefined &&
    (typeof sha256 !== "string" || !SHA256_PATTERN.test(sha256))
  ) {
    throw new Error(`${context}: invalid SHA-256`);
  }
  return { role, url, retrievedAt, ...(sha256 ? { sha256 } : {}) };
}

function parsePosition(value: unknown, context: string): P1BlueprintPosition {
  const position = record(value, context);
  const topicSlugs = stringArray(position.topicSlugs, `${context}.topicSlugs`);
  if (
    topicSlugs.length === 0 ||
    new Set(topicSlugs).size !== topicSlugs.length
  ) {
    throw new Error(`${context}: unique topic slugs are required`);
  }
  if (topicSlugs.some((slug) => !TOPIC_PATTERN.test(slug))) {
    throw new Error(`${context}: invalid topic slug`);
  }
  return {
    number: integerField(position, "number", context, 1, 100),
    topicSlugs,
    maxPoints: integerField(position, "maxPoints", context, 1, 1000),
  };
}

function record(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context}: object expected`);
  }
  return value as Record<string, unknown>;
}

function arrayField(
  value: Record<string, unknown>,
  field: string,
  context: string,
): unknown[] {
  const result = value[field];
  if (!Array.isArray(result))
    throw new Error(`${context}.${field}: array expected`);
  return result;
}

function stringField(
  value: Record<string, unknown>,
  field: string,
  context: string,
): string {
  const result = value[field];
  if (typeof result !== "string" || result.length === 0) {
    throw new Error(`${context}.${field}: non-empty string expected`);
  }
  return result;
}

function versionField(
  value: Record<string, unknown>,
  field: string,
  context: string,
): string {
  const version = stringField(value, field, context);
  assertVersion(version, context);
  return version;
}

function assertVersion(version: string, context: string): void {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`${context}: invalid blueprint version ${version}`);
  }
}

function stringArray(value: unknown, context: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${context}: string array expected`);
  }
  return [...value] as string[];
}

function integerField(
  value: Record<string, unknown>,
  field: string,
  context: string,
  min: number,
  max: number,
): number {
  const result = value[field];
  if (
    !Number.isInteger(result) ||
    (result as number) < min ||
    (result as number) > max
  ) {
    throw new Error(`${context}.${field}: integer out of range`);
  }
  return result as number;
}

function booleanField(
  value: Record<string, unknown>,
  field: string,
  context: string,
): boolean {
  const result = value[field];
  if (typeof result !== "boolean") {
    throw new Error(`${context}.${field}: boolean expected`);
  }
  return result;
}
