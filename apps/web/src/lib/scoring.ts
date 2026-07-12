export const GRADE_AVERAGE_MIN = 2;
export const GRADE_AVERAGE_MAX = 5;
export const SCHOOL_POINTS_MAX = 40;
export const EXAM_POINTS_MAX = 60;
export const TOTAL_POINTS_MAX = 100;
export const BUDGET_THRESHOLD = 50.01;
export const SELF_FINANCED_THRESHOLD = 30.01;

export function schoolPoints(gradeAverages: number[]): number {
  return gradeAverages.reduce((sum, average) => sum + average, 0) * 2;
}

export function totalScore(
  gradeAverages: number[],
  examPoints: number,
): number {
  return schoolPoints(gradeAverages) + examPoints;
}

export const POINTS_PER_TASK = 6;

export function toHundredths(points: number): number {
  return Math.round(points * 100);
}

export function simulationScore(marks: (boolean | null)[]): number {
  return marks.filter(Boolean).length * POINTS_PER_TASK;
}
