import { expect, test } from "./test";

const TASK_IDS = Array.from({ length: 10 }, (_, index) => `task-${index + 1}`);

test("mock history shows an honest responsive score trend", async ({
  page,
}) => {
  const firstFinishedAt = Date.UTC(2026, 7, 1, 12);
  await page.addInitScript(
    ({ firstAt, taskIds }) => {
      const run = (
        id: string,
        score: number,
        day: number,
        answeredCount = taskIds.length,
      ) => {
        const correctCount = score / 6;
        const results = taskIds.map((taskId, index) => ({
          taskId,
          outcome:
            index >= answeredCount
              ? "unanswered"
              : index < correctCount
                ? "correct"
                : "incorrect",
          earnedPoints: index < correctCount ? 6 : 0,
          maxPoints: 6,
        }));
        const finishedAt = firstAt + day * 24 * 60 * 60 * 1_000;
        return {
          id,
          blueprintVersion: "2026.1",
          startedAt: finishedAt - 2 * 60 * 60 * 1_000,
          finishedAt,
          durationMs: 2 * 60 * 60 * 1_000,
          timedOut: false,
          score,
          maxPoints: 60,
          correctCount,
          answeredCount,
          taskIds,
          answers: taskIds.map(() => ["answer"]),
          results,
          ownerId: null,
        };
      };

      localStorage.setItem(
        "do-indeksa-simulation",
        JSON.stringify({
          version: 8,
          state: {
            phase: null,
            history: [
              run("00000000-0000-4000-8000-000000000014", 54, 4, 9),
              run("00000000-0000-4000-8000-000000000013", 30, 3),
              run("00000000-0000-4000-8000-000000000012", 36, 2),
              run("00000000-0000-4000-8000-000000000011", 18, 1),
            ],
          },
        }),
      );
    },
    { firstAt: firstFinishedAt, taskIds: TASK_IDS },
  );
  await page.route("**/api/v1/me", (route) => route.fulfill({ status: 401 }));
  await page.setViewportSize({ width: 360, height: 800 });

  await page.goto("/en/history?tab=variants");

  await page.getByRole("button", { name: "History actions" }).click();
  await page.getByRole("button", { name: "Score progress" }).click();

  const trend = page.getByTestId("variant-score-trend");
  await expect(
    trend.getByRole("heading", { name: "Score progress" }),
  ).toBeVisible();
  await expect(trend.getByText("30 / 60", { exact: true })).toBeVisible();
  await expect(trend.getByText("36 / 60", { exact: true })).toBeVisible();
  await expect(
    trend.locator('dd[aria-label="6 points lower than the previous result."]'),
  ).toHaveText("-6");
  await expect(trend.getByTestId("variant-score-trend-bar")).toHaveCount(3);
  await expect(trend.locator("ol li")).toHaveCount(3);
  await expect(trend.locator("ol")).toContainText("18 of 60 points");
  await expect(
    page
      .getByRole("link", { name: "Open mock exam result" })
      .first()
      .getByText("54 / 60", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(trend).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.goto("/history?tab=variants");
  await page.getByRole("button", { name: "Radnje istorije" }).click();
  await page.getByRole("button", { name: "Napredak bodova" }).click();
  await expect(
    page.getByRole("heading", { name: "Napredak bodova" }),
  ).toBeVisible();
  await page.goto("/ru/history?tab=variants");
  await page.getByRole("button", { name: "Действия с историей" }).click();
  await page.getByRole("button", { name: "Динамика баллов" }).click();
  await expect(
    page.getByRole("heading", { name: "Динамика баллов" }),
  ).toBeVisible();
});
