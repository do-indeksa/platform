import { expect, test } from "@playwright/test";
import { parsePersistedSimulationState } from "../src/lib/simulation-persistence";

const currentTaskIds = [
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
const taskCandidates = [
  ["kb-001", "kb-002", "kb-003"],
  ["kv-001", "kv-002", "kv-003"],
  ["eks-001", "eks-002", "eks-003"],
  ["log-001", "log-002", "log-003"],
  ["trig-001", "trig-002", "trig-003"],
  ["vek-001", "vek-002", "vek-003"],
  ["plan-001", "plan-002", "plan-003"],
  ["ster-001", "ster-002", "ster-003"],
  ["fun-001", "fun-002", "fun-003"],
  ["komb-001", "komb-002", "komb-003"],
];

test("mobile mock exam persists answers and reports a partial result honestly", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/en/simulation");

  await expect(
    page.getByRole("heading", { name: "Mock exam", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Start mock exam", exact: true })
    .click();

  await expect(page).toHaveURL(
    /\/en\/simulation\/new\?run=[0-9a-f-]+&version=2026\.1&set=/,
  );
  await expect(page.getByTestId("site-header")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Task 1 of 10" }),
  ).toBeVisible();
  await expect(page.getByRole("timer")).toContainText("04:00:");
  await expect(page.getByText("Expected answer", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("View worked solution", { exact: true }),
  ).toHaveCount(0);
  const directResult = await page.request.get(
    page.url().replace("/simulation/new", "/simulation/result"),
  );
  expect(directResult.status()).toBe(200);
  expect(await directResult.text()).not.toContain("correctAnswerHtml");

  const firstAnswer = page.getByRole("textbox").first();
  await firstAnswer.fill("definitely-wrong");
  await expect(page.getByText(/^Saved at /)).toBeVisible();
  const persistedBeforeReload = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("do-indeksa-simulation") as string),
  );
  expect(persistedBeforeReload.state.answers[0][0]).toBe("definitely-wrong");
  expect(
    parsePersistedSimulationState(persistedBeforeReload.state).answers[0][0],
  ).toBe("definitely-wrong");
  await page.reload();

  await expect(
    page.getByRole("heading", { name: "Task 1 of 10" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox").first()).toHaveValue(
    "definitely-wrong",
  );

  const canonicalUrl = new URL(page.url());
  const canonicalTaskIds = canonicalUrl.searchParams.get("set")!.split(",");
  const changedTaskIds = canonicalTaskIds.map((taskId, index) =>
    taskCandidates[index].find((candidate) => candidate !== taskId)!,
  );
  const changedUrl = new URL(canonicalUrl);
  changedUrl.searchParams.set("set", changedTaskIds.join(","));
  await page.goto(changedUrl.toString());
  await expect
    .poll(() => new URL(page.url()).searchParams.get("set"))
    .toBe(canonicalTaskIds.join(","));
  await expect(page.getByRole("textbox").first()).toHaveValue(
    "definitely-wrong",
  );

  const activePayload = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("do-indeksa-simulation") as string),
  );
  expect(activePayload.version).toBe(5);
  expect(activePayload.state.review).toEqual([]);
  expect(
    activePayload.state.tasks.every(
      (task: Record<string, unknown>) =>
        !("solutionHtml" in task) &&
        !("correctAnswerHtml" in task) &&
        !("check" in task),
    ),
  ).toBe(true);

  await page
    .getByRole("button", { name: "Save and continue", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Task 2 of 10" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Task 3 of 10" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Finish", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("9 tasks are still unanswered.");
  await expect(dialog).toContainText("1 of them was marked as skipped.");
  await dialog
    .getByRole("button", { name: "Finish and check", exact: true })
    .click();

  await expect(page).toHaveURL(/\/en\/simulation\/result\?/);
  await expect(
    page.getByRole("heading", { name: "Your result", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("You answered 1 of 10 tasks.")).toBeVisible();
  await expect(page.getByText("Score", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Correct", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Time", { exact: true })).toBeVisible();
  await expect(page.getByText("Change", { exact: true })).toBeVisible();

  const weak = page
    .getByRole("heading", { name: "Needs practice", exact: true })
    .locator("../..");
  const unanswered = page
    .getByRole("heading", { name: "Not answered", exact: true })
    .locator("../..");
  await expect(weak).toContainText("1");
  await expect(unanswered).toContainText("2, 3, 4, 5, 6, 7, 8, 9, 10");
  await expect(
    page.getByRole("link", { name: "Practise weak positions", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View errors", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try another variant", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#answers ol > li")).toHaveCount(10);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  const attempts = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("do-indeksa-attempts") as string),
  );
  expect(
    attempts.attempts.map(
      ({ taskId, correct }: { taskId: string; correct: boolean }) => ({
        taskId,
        correct,
      }),
    ),
  ).toEqual([{ taskId: activePayload.state.tasks[0].id, correct: false }]);
  const completedPayload = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("do-indeksa-simulation") as string),
  );
  expect(completedPayload.state.review).toHaveLength(10);
});

test("mock checker bounds bodies and returns only grading outcomes", async ({
  request,
}) => {
  const checked = await request.post("/api/content/simulation-grade", {
    data: {
      blueprintVersion: "2026.1",
      taskIds: currentTaskIds,
      answers: answerPartCounts.map((count) => Array(count).fill("")),
    },
  });
  expect(checked.status()).toBe(200);
  expect(checked.headers()["cache-control"]).toBe("private, no-store");
  const payload = await checked.json();
  expect(payload.results).toHaveLength(10);
  expect(payload.review).toHaveLength(10);
  expect(payload.review[0]).toEqual(
    expect.objectContaining({
      taskId: "kb-001",
      correctAnswer: expect.any(String),
      solution: expect.any(String),
    }),
  );
  expect(JSON.stringify(payload.review)).not.toContain("solutionHtml");
  expect(
    payload.results.every(
      (result: Record<string, unknown>) =>
        result.outcome === "unanswered" &&
        !("solution" in result) &&
        !("expected" in result),
    ),
  ).toBe(true);

  const wrongType = await request.post("/api/content/simulation-grade", {
    headers: { "Content-Type": "text/plain" },
    data: "{}",
  });
  expect(wrongType.status()).toBe(415);

  const oversized = await request.post("/api/content/simulation-grade", {
    data: { padding: "x".repeat(33_000) },
  });
  expect(oversized.status()).toBe(413);
});

test("a fresh mock request redirects to a frozen resumable URL", async ({
  page,
}) => {
  await page.goto(`/en/simulation/new?fresh=${crypto.randomUUID()}`);

  await expect(page).toHaveURL(
    /\/en\/simulation\/new\?run=[0-9a-f-]+&version=2026\.1&set=/,
  );
  const url = new URL(page.url());
  expect(url.searchParams.get("run")).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  expect(url.searchParams.get("version")).toBe("2026.1");
  expect(url.searchParams.get("set")?.split(",")).toHaveLength(10);
  await expect(
    page.getByRole("heading", { name: "Task 1 of 10" }),
  ).toBeVisible();
});

test("the time limit submits saved answers without losing the attempt", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-08-10T10:00:00Z") });
  await page.goto(`/en/simulation/new?fresh=${crypto.randomUUID()}`);
  await expect(
    page.getByRole("heading", { name: "Task 1 of 10" }),
  ).toBeVisible();

  await page.getByRole("textbox").first().fill("saved-before-timeout");
  await expect(page.getByText(/^Saved at /)).toBeVisible();
  await page.clock.fastForward(4 * 60 * 60 * 1_000 + 1_000);

  await expect(page).toHaveURL(/\/en\/simulation\/result\?/);
  await expect(
    page.getByText(
      "The time limit expired, so the attempt was submitted with the answers saved at that moment.",
      { exact: true },
    ),
  ).toBeVisible();
  const persisted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("do-indeksa-simulation") as string),
  );
  expect(persisted.state.phase).toBe("done");
  expect(persisted.state.timedOut).toBe(true);
  expect(persisted.state.answers[0][0]).toBe("saved-before-timeout");
});
