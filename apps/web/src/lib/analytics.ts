export const TASK_SOLVED_EVENT = "task-solved";

export type TaskSolvedSource = "practice" | "diagnostic" | "mock";
export type AnalyticsTracker = {
  track: (
    event: string,
    data?: Record<string, string | number | boolean>,
  ) => void;
};

type TaskSolvedInput = {
  source: TaskSolvedSource;
  position: number;
  helpLevel?: number;
};

const SOURCES = new Set<TaskSolvedSource>(["practice", "diagnostic", "mock"]);

export function trackTaskSolved(
  input: TaskSolvedInput,
  tracker: AnalyticsTracker | undefined = browserTracker(),
): boolean {
  if (
    !tracker ||
    !SOURCES.has(input.source) ||
    !isIntegerBetween(input.position, 1, 10) ||
    (input.helpLevel !== undefined && !isIntegerBetween(input.helpLevel, 0, 3))
  ) {
    return false;
  }

  try {
    tracker.track(TASK_SOLVED_EVENT, {
      source: input.source,
      position: input.position,
      ...(input.helpLevel === undefined ? {} : { helpLevel: input.helpLevel }),
    });
    return true;
  } catch {
    return false;
  }
}

function browserTracker(): AnalyticsTracker | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { umami?: AnalyticsTracker }).umami;
}

function isIntegerBetween(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}
