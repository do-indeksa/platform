import { expect, test } from "@playwright/test";
import { analyticsEvents, installAnalyticsSpy } from "./analytics-spy";

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
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
const runUrl = `/en/diagnostic/new?run=${runId}&set=${taskIds.join("%2C")}`;

test("mobile diagnostic keeps skipped positions separate and starts focused practice", async ({
  page,
}) => {
  await installAnalyticsSpy(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(runUrl);

  await expect(page.getByTestId("site-header")).toHaveCount(0);
  await expect(
    page.getByText("Diagnostic · 1 of 10", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.getByRole("textbox", { name: "t", exact: true }).fill("1");
  await page
    .getByRole("textbox", { name: "|z|", exact: true })
    .fill("3sqrt(2)");
  await page.getByRole("textbox", { name: "Re z", exact: true }).fill("3");
  await page.getByRole("textbox", { name: "Im z", exact: true }).fill("-3");
  await page.getByRole("button", { name: "Submit answer" }).click();

  await expect(
    page.getByText("Diagnostic · 2 of 10", { exact: true }),
  ).toBeVisible();
  expect(await analyticsEvents(page)).toEqual([
    {
      event: "task-solved",
      data: { source: "diagnostic", position: 1 },
    },
  ]);
  await expect(page.getByText("Correct!", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Not quite", { exact: true })).toHaveCount(0);

  await page.getByRole("textbox", { name: "m", exact: true }).fill("0");
  await page.getByRole("button", { name: "Submit answer" }).click();
  await expect(
    page.getByText("Diagnostic · 3 of 10", { exact: true }),
  ).toBeVisible();

  for (let position = 3; position <= 10; position++) {
    await page.getByRole("button", { name: "Skip this task" }).click();
  }

  await expect(page).toHaveURL(/\/en\/diagnostic\/result\?/);
  await expect(page.getByTestId("site-header")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your starting level" }),
  ).toBeVisible();

  const confident = page
    .getByRole("heading", { name: "Confident" })
    .locator("..");
  const startHere = page
    .getByRole("heading", { name: "Start here" })
    .locator("..");
  const untested = page
    .getByRole("heading", { name: "Not tested" })
    .locator("..");
  await expect(confident).toContainText("Position 1");
  await expect(startHere).toContainText("Position 2");
  await expect(untested).toContainText("Position 3");
  await expect(untested).toContainText("Position 10");

  const persisted = await page.evaluate(() => ({
    diagnostic: localStorage.getItem("do-indeksa-diagnostic"),
    attempts: localStorage.getItem("do-indeksa-attempts"),
  }));
  expect(persisted.diagnostic).not.toContain("statementHtml");
  expect(persisted.diagnostic).not.toContain("solution");
  expect(persisted.diagnostic).not.toContain("expected");
  expect(
    JSON.parse(persisted.attempts as string).attempts.map(
      ({ taskId, correct }: { taskId: string; correct: boolean }) => ({
        taskId,
        correct,
      }),
    ),
  ).toEqual([
    { taskId: "kb-001", correct: true },
    { taskId: "kv-001", correct: false },
  ]);

  await page.getByRole("link", { name: "Start short practice" }).click();
  await expect(page).toHaveURL(/\/en\/tasks\/kvadratna-jednacina\/kv-002\?/);
  await expect(page.getByText("Task 1 of 3", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Exit task" })).toHaveAttribute(
    "href",
    "/en/prep",
  );
});

test("diagnostic checker bounds request bodies and disables caching", async ({
  request,
}) => {
  const checked = await request.post("/api/content/diagnostic-check", {
    data: {
      taskId: "kb-001",
      topic: "kompleksni-brojevi",
      answers: ["1", "3sqrt(2)", "3", "-3"],
    },
  });
  expect(checked.status()).toBe(200);
  expect(checked.headers()["cache-control"]).toBe("private, no-store");
  expect(await checked.json()).toEqual({ outcome: "correct" });

  const oversized = await request.post("/api/content/diagnostic-check", {
    data: {
      taskId: "kb-001",
      topic: "kompleksni-brojevi",
      answers: ["x".repeat(5_000)],
    },
  });
  expect(oversized.status()).toBe(413);
});

test("a fresh diagnostic request redirects to a canonical resumable URL", async ({
  page,
}) => {
  await page.goto(`/en/diagnostic/new?fresh=${crypto.randomUUID()}`);

  await expect(page).toHaveURL(/\/en\/diagnostic\/new\?run=[0-9a-f-]+&set=/);
  const url = new URL(page.url());
  expect(url.pathname).toBe("/en/diagnostic/new");
  expect(url.searchParams.get("run")).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  expect(url.searchParams.get("set")?.split(",")).toHaveLength(10);
  await expect(
    page.getByText("Diagnostic · 1 of 10", { exact: true }),
  ).toBeVisible();
});
