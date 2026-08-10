import { expect, test } from "@playwright/test";

const taskIds = [
  "kb-001",
  "kv-001",
  "eks-001",
  "log-001",
  "trig-001",
  "vek-001",
  "plan-001",
  "ster-001",
  "fun-001",
  "komb-001",
];
const answerPartCounts = [2, 1, 1, 1, 2, 1, 2, 3, 5, 3];

test("a practice mistake survives reload and opens with its full context", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/en/tasks/kompleksni-brojevi/kb-001");
  await page.getByRole("textbox", { name: "t", exact: true }).fill("0");
  await page.getByRole("textbox", { name: "|z|", exact: true }).fill("0");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByText("Not quite", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show hint", exact: true }).click();

  await page.goto("/en/history");
  await expect(
    page.getByRole("heading", { name: "History", exact: true }),
  ).toBeVisible();
  let attemptLink = page.getByRole("link", {
    name: "Open attempt for task kb-001",
  });
  await expect(attemptLink).toContainText("Position 1 · #kb-001");
  await expect(attemptLink).toContainText("Mistake");
  await page.reload();
  attemptLink = page.getByRole("link", {
    name: "Open attempt for task kb-001",
  });
  await expect(attemptLink).toContainText("Position 1 · #kb-001");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  const retry = page.getByRole("link", { name: "Start practice" });
  await expect(retry).toHaveAttribute("href", /set=kb-001/);
  await expect(retry).toHaveAttribute("href", /practice=[0-9a-f-]{36}/);

  await attemptLink.click();
  await expect(
    page.getByRole("heading", { name: "Position 1 · #kb-001" }),
  ).toBeVisible();
  await expect(
    page.getByText("1 hint was opened for this attempt.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Expected answer", { exact: true }),
  ).toBeVisible();
  await page.getByText("Worked solution", { exact: true }).click();
  await expect(page.getByText(/Napišimo kvadrat modula/)).toBeVisible();

  const solveAgain = page.getByRole("link", { name: "Solve again" });
  await expect(solveAgain).toHaveAttribute("href", /practice=[0-9a-f-]{36}/);
});

test("an archived mock exam can rebuild and open its trusted result", async ({
  page,
}) => {
  const finishedAt = Date.now() - 60_000;
  const history = {
    id: "00000000-0000-4000-8000-000000000050",
    blueprintVersion: "2026.1",
    startedAt: finishedAt - 15 * 60_000,
    finishedAt,
    durationMs: 15 * 60_000,
    timedOut: false,
    score: 0,
    maxPoints: 60,
    correctCount: 0,
    answeredCount: 0,
    taskIds,
    answers: answerPartCounts.map((count) => Array(count).fill("")),
    results: taskIds.map((taskId) => ({
      taskId,
      outcome: "unanswered",
      earnedPoints: 0,
      maxPoints: 6,
    })),
  };
  await page.addInitScript((entry) => {
    localStorage.setItem(
      "do-indeksa-simulation",
      JSON.stringify({ version: 5, state: { phase: null, history: [entry] } }),
    );
  }, history);

  await page.goto("/en/history?tab=variants");
  const variantRow = page
    .locator("tbody tr")
    .filter({ hasText: "P1 mock exam" });
  await expect(variantRow).toBeVisible();
  await expect(variantRow).toContainText("0 / 60");
  await page.locator('a[aria-label="Open mock exam result"]:visible').click();

  await expect(
    page.getByRole("heading", { name: "Your result", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("You answered 0 of 10 tasks.")).toBeVisible();
  await expect(page.locator("#answers ol > li")).toHaveCount(10);
});

test("empty mobile history has a recovery action and active navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/ru/history");

  await expect(
    page.getByRole("heading", { name: "Попыток заданий пока нет" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Выбрать задание" }),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("mobile-navigation")
      .getByRole("link", { name: "История" }),
  ).toHaveAttribute("aria-current", "page");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
