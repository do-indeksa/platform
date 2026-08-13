export type PracticeActiveClock = {
  read: () => number;
  pause: () => number;
  resume: () => number;
};

export function createPracticeActiveClock(
  initialDurationMs: number,
  initiallyActive: boolean,
  now: () => number = defaultNow,
): PracticeActiveClock {
  let durationMs = Math.max(0, Math.floor(initialDurationMs));
  let activeSince = initiallyActive ? now() : null;

  const read = () =>
    durationMs +
    (activeSince === null
      ? 0
      : Math.max(0, Math.floor(now() - activeSince)));

  return {
    read,
    pause: () => {
      durationMs = read();
      activeSince = null;
      return durationMs;
    },
    resume: () => {
      if (activeSince === null) activeSince = now();
      return durationMs;
    },
  };
}

function defaultNow(): number {
  return performance.now();
}
