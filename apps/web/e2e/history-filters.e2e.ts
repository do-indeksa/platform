import { expect, test } from "@playwright/test";

const dayMs = 24 * 60 * 60 * 1_000;

test("history filters are shareable, bounded, and responsive", async ({
  page,
}) => {
  const now = Date.now();
  const entries = [
    storedAttempt(
      "11111111-1111-4111-8111-111111111111",
      "kb-001",
      1,
      "incorrect",
      now - 60 * 60 * 1_000,
    ),
    storedAttempt(
      "22222222-2222-4222-8222-222222222222",
      "kv-001",
      2,
      "correct",
      now - 2 * 60 * 60 * 1_000,
    ),
    storedAttempt(
      "33333333-3333-4333-8333-333333333333",
      "trig-002",
      6,
      "skipped",
      now - 3 * dayMs,
    ),
    storedAttempt(
      "44444444-4444-4444-8444-444444444444",
      "log-001",
      3,
      "incorrect",
      now - 15 * dayMs,
    ),
  ];
  await page.addInitScript((historyEntries) => {
    localStorage.setItem(
      "do-indeksa-task-history",
      JSON.stringify({ version: 2, entries: historyEntries }),
    );
  }, entries);
  await page.route("**/api/v1/me", (route) => route.fulfill({ status: 401 }));

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/en/history");
  await expect(
    page.getByTestId("history-feed").locator(":scope > li"),
  ).toHaveCount(4);

  const subject = page.getByLabel("Exam");
  const period = page.getByLabel("Period");
  const difficulty = page.getByLabel("Difficulty");
  await subject.selectOption("p1");
  await difficulty.selectOption("easy");
  await expect(page).toHaveURL(/subject=p1&difficulty=easy$/);
  await expect(
    page.getByRole("link", { name: "Open attempt for task kb-001" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open attempt for task trig-002" }),
  ).toHaveCount(0);

  await period.selectOption("7d");
  await expect(page).toHaveURL(/subject=p1&period=7d&difficulty=easy$/);
  await page.reload();
  await expect(page.getByLabel("Exam")).toHaveValue("p1");
  await expect(page.getByLabel("Period")).toHaveValue("7d");
  await expect(page.getByLabel("Difficulty")).toHaveValue("easy");
  const filteredAttempt = page.getByRole("link", {
    name: "Open attempt for task kb-001",
  });
  await expect(filteredAttempt).toHaveAttribute(
    "href",
    /returnTo=%2Fhistory%3Fsubject%3Dp1%26period%3D7d%26difficulty%3Deasy/,
  );
  await filteredAttempt.click();
  await page.getByRole("link", { name: "Back to history" }).click();
  await expect(page).toHaveURL(/subject=p1&period=7d&difficulty=easy$/);

  await page.getByLabel("Difficulty").selectOption("hard");
  await expect(
    page.getByRole("heading", { name: "No matching activity" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page).toHaveURL(/\/en\/history$/);
  await expect(
    page.getByTestId("history-feed").locator(":scope > li"),
  ).toHaveCount(4);

  await page.goto("/en/history?tab=trainings");
  await expect(
    page.getByRole("heading", { name: "No matching activity" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page).toHaveURL(/\/en\/history$/);
  await expect(
    page.getByTestId("history-feed").locator(":scope > li"),
  ).toHaveCount(4);

  await page.setViewportSize({ width: 390, height: 1090 });
  await expect(page.getByTestId("history-filters")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.goto("/ru/history?period=7d&difficulty=easy");
  await expect(page.getByLabel("Период")).toHaveValue("7d");
  await expect(page.getByLabel("Сложность")).toHaveValue("easy");
  await page.goto("/history?period=7d&difficulty=easy");
  await expect(page.getByLabel("Period")).toHaveValue("7d");
  await expect(page.getByLabel("Težina")).toHaveValue("easy");
});

function storedAttempt(
  id: string,
  taskId: string,
  slot: number,
  outcome: "correct" | "incorrect" | "skipped",
  at: number,
) {
  return {
    id,
    taskId,
    slot,
    source: "practice",
    outcome,
    answers: ["1"],
    helpLevel: 0,
    at: new Date(at).toISOString(),
    ownerId: null,
  };
}
