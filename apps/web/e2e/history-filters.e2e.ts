import { expect, test } from "@playwright/test";

const dayMs = 24 * 60 * 60 * 1_000;

test("task history filters are shareable, bounded, and responsive", async ({
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
      "trig-001",
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

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/en/history");
  await expect(page.getByText("Showing 4 of 4 attempts")).toBeVisible();

  const topic = page.getByLabel("Topic");
  const outcome = page.getByLabel("Result");
  const period = page.getByLabel("Period");
  await topic.selectOption("kompleksni-brojevi");
  await outcome.selectOption("incorrect");
  await expect(page).toHaveURL(/topic=kompleksni-brojevi&outcome=incorrect$/);
  await expect(
    page.getByRole("link", { name: "Open attempt for task kb-001" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open attempt for task kv-001" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Start practice" }),
  ).toHaveAttribute("href", /set=kb-001/);

  await topic.selectOption("");
  await period.selectOption("7d");
  await expect(page).toHaveURL(/outcome=incorrect&period=7d$/);
  await expect(
    page.getByRole("link", { name: "Open attempt for task log-001" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Result")).toHaveValue("incorrect");
  await expect(page.getByLabel("Period")).toHaveValue("7d");
  await expect(page.getByText("Showing 1 of 4 attempts")).toBeVisible();
  const filteredAttempt = page.getByRole("link", {
    name: "Open attempt for task kb-001",
  });
  await expect(filteredAttempt).toHaveAttribute(
    "href",
    /returnTo=%2Fhistory%3Foutcome%3Dincorrect%26period%3D7d/,
  );
  await filteredAttempt.click();
  await page.getByRole("link", { name: "Back to history" }).click();
  await expect(page).toHaveURL(/outcome=incorrect&period=7d$/);

  await page.getByLabel("Topic").selectOption("logaritmi");
  await expect(
    page.getByRole("heading", { name: "No attempts match these filters" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).last().click();
  await expect(page).toHaveURL(/\/en\/history$/);
  await expect(page.getByText("Showing 4 of 4 attempts")).toBeVisible();

  await page.setViewportSize({ width: 360, height: 800 });
  await expect(page.getByTestId("task-history-filters")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.goto("/ru/history?outcome=incorrect");
  await expect(page.getByLabel("Результат")).toHaveValue("incorrect");
  await page.goto("/history?outcome=incorrect");
  await expect(page.getByLabel("Rezultat")).toHaveValue("incorrect");
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
