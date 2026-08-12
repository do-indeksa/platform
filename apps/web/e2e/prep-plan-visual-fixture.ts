import type { Page } from "@playwright/test";

const OWNER_ID = "00000000-0000-4000-8000-000000000172";
const RUN_ID = "00000000-0000-4000-8000-000000000173";

const positions = [
  ["kb", 1],
  ["kv", 2],
  ["eks", 4],
  ["log", 3],
  ["trig", 5],
  ["vek", 6],
] as const;

export async function preparePrepPlanVisual(page: Page): Promise<void> {
  await page.addInitScript(
    ({ attempts, examDate }) => {
      localStorage.setItem(
        "do-indeksa-attempts",
        JSON.stringify({ version: 2, attempts }),
      );
      localStorage.setItem(
        "do-indeksa-prep-settings",
        JSON.stringify({
          version: 1,
          state: { goalPoints: 48, examDate },
        }),
      );
    },
    {
      attempts: positions.flatMap(([prefix, slot], positionIndex) =>
        [1, 2, 3].map((taskIndex) => ({
          taskId: `${prefix}-00${taskIndex}`,
          slot,
          correct: true,
          source: "diagnostic",
          helpLevel: 0,
          at: new Date(
            Date.UTC(2026, 7, 10, 9, positionIndex * 3 + taskIndex),
          ).toISOString(),
          transport: "graphql",
          runId: RUN_ID,
          ownerId: OWNER_ID,
        })),
      ),
      examDate: "2026-09-09",
    },
  );
}
