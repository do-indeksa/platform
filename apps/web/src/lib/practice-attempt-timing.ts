export type PracticeAttemptCursor = {
  startedAt: number;
  runActiveDurationMs: number;
};

export type PracticeAttemptTiming = {
  startedAt: number;
  submittedAt: number;
  activeDurationMs: number;
  runActiveDurationMs: number;
};

export function createPracticeAttemptTiming(
  cursor: PracticeAttemptCursor,
  observedAt: number,
  runActiveDurationMs: number,
  durationSource: "active" | "wall",
): PracticeAttemptTiming {
  const submittedAt = Math.max(Math.floor(observedAt), cursor.startedAt + 1);
  const currentRunActiveDurationMs = Math.max(
    Math.floor(runActiveDurationMs),
    cursor.runActiveDurationMs,
  );
  return {
    startedAt: cursor.startedAt,
    submittedAt,
    activeDurationMs:
      durationSource === "active"
        ? currentRunActiveDurationMs - cursor.runActiveDurationMs
        : submittedAt - cursor.startedAt,
    runActiveDurationMs: currentRunActiveDurationMs,
  };
}
