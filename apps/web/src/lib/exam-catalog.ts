import type { FtnCatalog, FtnExam, FtnExamCode } from "./guide-types";

export const MAX_EXAM_QUERY_LENGTH = 120;

export function parseExamQuery(value: string | string[] | undefined): string {
  const query = Array.isArray(value) ? value[0] : value;
  return (query ?? "").trim().slice(0, MAX_EXAM_QUERY_LENGTH);
}

export function filterFtnExams(
  catalog: FtnCatalog,
  localizedNames: Record<FtnExamCode, string>,
  query: string,
): FtnExam[] {
  const needles = queryTokens(query);
  if (!needles.length) return catalog.exams;

  const facultyTerms = [
    catalog.faculty.name,
    catalog.faculty.university,
    catalog.faculty.city,
    "FTN",
  ];

  return catalog.exams.filter((exam) => {
    const terms = [
      exam.code,
      exam.officialName,
      localizedNames[exam.code],
      ...facultyTerms,
      ...exam.programs,
    ].map(normalize);

    return needles.every((needle) =>
      terms.some((term) => term.includes(needle)),
    );
  });
}

export function examCatalogHref(query: string): string {
  const normalized = query.trim().slice(0, MAX_EXAM_QUERY_LENGTH);
  if (!normalized) return "/exams";
  const params = new URLSearchParams({ q: normalized });
  return `/exams?${params.toString()}`;
}

export function matchingFtnPrograms(exam: FtnExam, query: string): string[] {
  const needles = queryTokens(query);
  if (!needles.length) return [];
  return exam.programs.filter((program) => {
    const term = normalize(program);
    return needles.some((needle) => term.includes(needle));
  });
}

function queryTokens(value: string): string[] {
  return normalize(value).split(" ").filter(Boolean);
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("đ", "d")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
