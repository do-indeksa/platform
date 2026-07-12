"use client";

import { useState } from "react";
import type { Program } from "@/lib/guide";
import {
  BUDGET_THRESHOLD,
  EXAM_POINTS_MAX,
  GRADE_AVERAGE_MAX,
  GRADE_AVERAGE_MIN,
  SELF_FINANCED_THRESHOLD,
  schoolPoints,
  toHundredths,
  totalScore,
} from "@/lib/scoring";

const GRADE_LABELS = ["I razred", "II razred", "III razred", "IV razred"];

function formatPoints(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function parseInput(value: string): number {
  return Number(value.replace(",", "."));
}

function isGradeValid(value: number): boolean {
  return value >= GRADE_AVERAGE_MIN && value <= GRADE_AVERAGE_MAX;
}

export function ScoreCalculator({ programs }: { programs: Program[] }) {
  const [grades, setGrades] = useState<string[]>(Array(4).fill(""));
  const [examPoints, setExamPoints] = useState("");

  const parsedGrades = grades.map(parseInput);
  const parsedExam = parseInput(examPoints);
  const isComplete =
    grades.every((value) => value !== "" && isGradeValid(parseInput(value))) &&
    examPoints !== "" &&
    parsedExam >= 0 &&
    parsedExam <= EXAM_POINTS_MAX;

  const total = isComplete ? totalScore(parsedGrades, parsedExam) : undefined;

  return (
    <div className="space-y-8">
      <fieldset className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {GRADE_LABELS.map((label, i) => (
          <label key={label} className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600">{label}</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="npr. 4,85"
              value={grades[i]}
              onChange={(e) => setGrades(grades.with(i, e.target.value))}
              className="rounded-lg border border-zinc-300 p-2"
            />
          </label>
        ))}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600">Prijemni (0–60)</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="npr. 42"
            value={examPoints}
            onChange={(e) => setExamPoints(e.target.value)}
            className="rounded-lg border border-zinc-300 p-2"
          />
        </label>
      </fieldset>

      {total !== undefined && (
        <p className="rounded-lg bg-zinc-900 p-4 text-lg text-white">
          Uspeh iz škole:{" "}
          <strong>{formatPoints(schoolPoints(parsedGrades))}</strong> · Ukupno:{" "}
          <strong>{formatPoints(total)}</strong> / 100
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-300 text-left text-zinc-500">
              <th className="py-2 pr-4 font-medium">Studijski program</th>
              <th className="py-2 pr-4 font-medium">Budžet ’25</th>
              <th className="py-2 pr-4 font-medium">Budžet ’24</th>
              <th className="py-2 pr-4 font-medium">Samofin. ’25</th>
              {total !== undefined && (
                <th className="py-2 font-medium">Tvoj status</th>
              )}
            </tr>
          </thead>
          <tbody>
            {programs.map((program) => (
              <tr key={program.name} className="border-b border-zinc-100">
                <td className="py-2 pr-4">{program.name}</td>
                <td className="py-2 pr-4">
                  {cutoffCell(program, 2025, "budget")}
                </td>
                <td className="py-2 pr-4">
                  {cutoffCell(program, 2024, "budget")}
                </td>
                <td className="py-2 pr-4">
                  {cutoffCell(program, 2025, "selfFinanced")}
                </td>
                {total !== undefined && (
                  <td className="py-2">
                    <StatusBadge program={program} total={total} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function cutoffCell(
  program: Program,
  year: number,
  kind: "budget" | "selfFinanced",
): string {
  const value = program.cutoffs.find((cutoff) => cutoff.year === year)?.[kind];
  return value === undefined ? "—" : formatPoints(value);
}

function StatusBadge({ program, total }: { program: Program; total: number }) {
  const latest = program.cutoffs.find((cutoff) => cutoff.year === 2025);
  if (!latest) return <span className="text-zinc-400">—</span>;

  const points = toHundredths(total);
  if (
    points >= toHundredths(latest.budget) &&
    points >= toHundredths(BUDGET_THRESHOLD)
  ) {
    return <span className="font-medium text-green-700">✓ budžet</span>;
  }
  const selfFinanced = latest.selfFinanced ?? SELF_FINANCED_THRESHOLD;
  if (
    points >= toHundredths(selfFinanced) &&
    points >= toHundredths(SELF_FINANCED_THRESHOLD)
  ) {
    return <span className="font-medium text-amber-600">samofinansiranje</span>;
  }
  return <span className="text-zinc-400">ispod praga ’25</span>;
}
