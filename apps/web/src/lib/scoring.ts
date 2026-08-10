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

export function toHundredths(points: number): number {
  return Math.round(points * 100);
}

export function binaryTrainerEstimate(
  marks: (boolean | null)[],
  maxPointsByTask: number[],
): number {
  if (marks.length !== maxPointsByTask.length) {
    throw new Error("marks and task points must have equal lengths");
  }
  return marks.reduce(
    (total, mark, index) =>
      total + (mark === true ? maxPointsByTask[index] : 0),
    0,
  );
}
