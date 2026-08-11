import { expect, test, type Page } from "@playwright/test";
import { parsePersistedSimulationState } from "../src/lib/simulation-persistence";

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const dynamicNavigationTimeout = 15_000;

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

const answerPartCounts = [4, 1, 1, 1, 2, 1, 2, 3, 5, 3];
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
  expect(activePayload.version).toBe(10);
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

  await expect(
    page.getByRole("heading", { name: "Compare your written work" }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByText("Task 1 of 10", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "3", exact: true }).click();
  await page.getByRole("button", { name: "Next task", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("main").getByText("Task 2 of 10", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "0", exact: true }).click();
  await page.getByRole("button", { name: "Next task", exact: true }).click();
  await page.getByRole("button", { name: "0", exact: true }).click();
  await page.getByRole("button", { name: "Next task", exact: true }).click();
  await page.getByRole("button", { name: "0", exact: true }).click();
  await page.getByRole("button", { name: "Next task", exact: true }).click();
  await page.getByRole("button", { name: "0", exact: true }).click();
  await page.getByRole("button", { name: "Next task", exact: true }).click();
  await page.getByRole("button", { name: "0", exact: true }).click();
  await page.getByRole("button", { name: "Next task", exact: true }).click();
  await page.getByRole("button", { name: "0", exact: true }).click();
  await page.getByRole("button", { name: "Next task", exact: true }).click();
  await page.getByRole("button", { name: "0", exact: true }).click();
  await page.getByRole("button", { name: "Next task", exact: true }).click();
  await page.getByRole("button", { name: "0", exact: true }).click();
  await page.getByRole("button", { name: "Next task", exact: true }).click();
  await page.getByRole("button", { name: "0", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Save self-check and view result",
      exact: true,
    })
    .click();

  await expect(page).toHaveURL(/\/en\/simulation\/result\?/, {
    timeout: dynamicNavigationTimeout,
  });
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
  const partial = page
    .getByRole("heading", { name: "Partial credit", exact: true })
    .locator("../..");
  const unanswered = page
    .getByRole("heading", { name: "Not answered", exact: true })
    .locator("../..");
  await expect(partial).toContainText("1");
  await expect(weak).toContainText(
    "No submitted answer was checked as incorrect.",
  );
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
    localStorage.getItem("do-indeksa-attempts"),
  );
  expect(attempts).toBeNull();
  const completedPayload = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("do-indeksa-simulation") as string),
  );
  expect(completedPayload.state.review).toHaveLength(10);
  expect(completedPayload.state.rubricScores).toEqual([3, ...Array(9).fill(0)]);
  expect(completedPayload.state.history[0].progress.items).toHaveLength(10);
  const progressOutbox = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("do-indeksa-progress-outbox") as string),
  );
  expect(progressOutbox.pending).toHaveLength(1);
  expect(progressOutbox.pending[0]).toMatchObject({
    ownerId: null,
    run: { kind: "SIMULATION", items: expect.any(Array) },
  });
  expect(progressOutbox.pending[0].run.items).toHaveLength(10);
  expect(progressOutbox.pending[0].run.items[0].attempt).toMatchObject({
    outcome: "PARTIAL",
    gradingKind: "RUBRIC_SELF",
    earnedPoints: 3,
  });
  expect(JSON.stringify(progressOutbox)).not.toMatch(
    /correctAnswer|expected|review|solution/i,
  );
  const taskHistory = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("do-indeksa-task-history") as string),
  );
  expect(taskHistory.entries).toHaveLength(9);
  expect(
    taskHistory.entries.some(
      ({ taskId }: { taskId: string }) =>
        taskId === activePayload.state.tasks[0].id,
    ),
  ).toBe(false);
});

test("an authenticated mock exam persists one idempotent GraphQL lifecycle", async ({
  page,
}) => {
  type GraphQLCall = {
    operationName: string;
    variables: { input?: Record<string, unknown>; limit?: number; id?: string };
  };
  const graphQLCalls: GraphQLCall[] = [];
  const attemptMethods: string[] = [];
  let submitted = false;
  let checkpointVersion = 0;

  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        id: "39ec4650-762d-437f-9917-c31ab167cb99",
        email: "portfolio@example.test",
        name: "Portfolio User",
      },
    }),
  );
  await page.route("**/api/v1/attempts", (route) => {
    attemptMethods.push(route.request().method());
    return route.fulfill({ status: 410 });
  });
  await page.route("**/graphql", async (route) => {
    const call = route.request().postDataJSON() as GraphQLCall;
    if (call.operationName === "AttemptJournal") {
      await route.fulfill({
        json: {
          data: {
            attempts: submitted
              ? [journalSimulationAttempt(currentTaskIds[0])]
              : [],
          },
        },
      });
      return;
    }
    if (call.operationName === "CompletedSimulationArchive") {
      await route.fulfill({
        json: { data: { completedSimulationRuns: [] } },
      });
      return;
    }
    if (call.operationName === "SimulationRunIndex") {
      await route.fulfill({ json: { data: { runs: [] } } });
      return;
    }
    if (call.operationName === "SimulationCloudRun") {
      await route.fulfill({ json: { data: { run: null } } });
      return;
    }
    graphQLCalls.push(call);
    const input = call.variables.input as Record<string, unknown>;
    if (call.operationName === "CheckpointRun") {
      expect(input.expectedVersion).toBe(checkpointVersion);
      checkpointVersion += 1;
      await route.fulfill({
        json: {
          data: {
            checkpointRun: {
              version: checkpointVersion,
              currentOrdinal: input.currentOrdinal,
            },
          },
        },
      });
      return;
    }
    const field =
      call.operationName === "StartRun"
        ? "startRun"
        : call.operationName === "RecordAttempt"
          ? "recordAttempt"
          : "submitRun";
    if (field === "submitRun") submitted = true;
    await route.fulfill({
      json: {
        data: {
          [field]: {
            id: input.id,
            ...(field === "startRun"
              ? { status: "ACTIVE" }
              : field === "submitRun"
                ? { status: "SUBMITTED" }
                : {}),
          },
        },
      },
    });
  });

  await page.goto(
    `/en/simulation/new?run=${runId}&version=2026.1&set=${currentTaskIds.join("%2C")}`,
  );
  await page.getByRole("textbox").first().fill("definitely-wrong");
  await expect
    .poll(() =>
      graphQLCalls.some(
        (call) =>
          call.operationName === "CheckpointRun" &&
          JSON.stringify(call.variables.input).includes("definitely-wrong"),
      ),
    )
    .toBe(true);
  expect(
    graphQLCalls.some((call) => call.operationName === "RecordAttempt"),
  ).toBe(false);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Finish and check", exact: true })
    .click();

  await completeRubricReview(page, Array(10).fill(0));

  await expect(page).toHaveURL(/\/en\/simulation\/result\?/, {
    timeout: dynamicNavigationTimeout,
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("do-indeksa-progress-outbox");
        return raw ? JSON.parse(raw).pending.length : 0;
      }),
    )
    .toBe(0);

  const operations = graphQLCalls.map((call) => call.operationName);
  const firstAttempt = operations.indexOf("RecordAttempt");
  expect(firstAttempt).toBeGreaterThan(0);
  expect(
    operations
      .slice(0, firstAttempt)
      .every(
        (operation) =>
          operation === "StartRun" || operation === "CheckpointRun",
      ),
  ).toBe(true);
  const attemptIndexes = operations.flatMap((operation, index) =>
    operation === "RecordAttempt" ? [index] : [],
  );
  const reviewCheckpoints = graphQLCalls
    .slice(firstAttempt)
    .filter((call) => call.operationName === "CheckpointRun");
  expect(reviewCheckpoints.length).toBeGreaterThan(0);
  expect(operations.lastIndexOf("CheckpointRun")).toBeLessThan(
    attemptIndexes[10],
  );
  expect(
    reviewCheckpoints.some((call) => {
      const drafts = call.variables.input?.drafts as
        { answer: string }[] | undefined;
      return drafts?.some((draft) => {
        const value = JSON.parse(draft.answer) as Record<string, unknown>;
        return value.version === 1 && value.rubricScore === 0;
      });
    }),
  ).toBe(true);
  expect(
    operations.filter((operation) => operation === "RecordAttempt"),
  ).toHaveLength(20);
  expect(operations.at(-1)).toBe("SubmitRun");
  const startCall = graphQLCalls.find(
    (call) => call.operationName === "StartRun",
  )!;
  expect(startCall.variables.input).toMatchObject({
    id: runId,
    kind: "SIMULATION",
    blueprintVersion: "ftn-p1:2026.1",
    contentRevision: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
  });
  expect(
    graphQLCalls
      .filter((call) => call.operationName === "RecordAttempt")
      .map((call) => call.variables.input?.outcome),
  ).toEqual([
    "INCORRECT",
    ...Array(9).fill("SKIPPED"),
    "INCORRECT",
    ...Array(9).fill("SKIPPED"),
  ]);
  expect(
    graphQLCalls
      .filter((call) => call.operationName === "RecordAttempt")
      .slice(10)
      .map((call) => call.variables.input?.gradingKind),
  ).toEqual(Array(10).fill("RUBRIC_SELF"));
  const startItems = startCall.variables.input?.items as {
    taskRevision: string;
    maxPoints: number;
  }[];
  expect(startItems).toHaveLength(10);
  expect(
    startItems.every(
      (item) =>
        /^sha256:[a-f0-9]{64}$/.test(item.taskRevision) && item.maxPoints > 0,
    ),
  ).toBe(true);
  expect(
    JSON.stringify(graphQLCalls.map((call) => call.variables)),
  ).not.toMatch(
    /correctAnswer|expectedAnswer|review|solution|statementHtml|gradingRule/i,
  );
  expect(attemptMethods).toEqual([]);

  const callCount = graphQLCalls.length;
  await page.reload({ waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", { name: "Your result", exact: true }),
  ).toBeVisible();
  expect(graphQLCalls).toHaveLength(callCount);
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

function journalSimulationAttempt(taskId: string) {
  return {
    id: "c4f8fe8b-8898-4dc8-8e67-15837b1fdb91",
    runItemId: "15944dbd-61cb-4e13-9a2b-8e9cc1be3114",
    taskId,
    examPosition: 1,
    mode: "SIMULATION",
    startedAt: "2026-08-10T10:09:30.000Z",
    submittedAt: "2026-08-10T10:10:00.000Z",
    activeDurationMs: 30_000,
    answer: JSON.stringify(["definitely-wrong"]),
    outcome: "INCORRECT",
    helpLevel: 0,
    gradingKind: "AUTO",
    earnedPoints: 0,
    maxPoints: 6,
    taskRevision: `sha256:${"a".repeat(64)}`,
  };
}

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
  await page.goto(
    `/en/simulation/new?run=${crypto.randomUUID()}&version=2026.1&set=${currentTaskIds.join("%2C")}`,
  );
  await expect(
    page.getByRole("heading", { name: "Task 1 of 10" }),
  ).toBeVisible();

  await page.getByRole("textbox").first().fill("saved-before-timeout");
  await expect(page.getByText(/^Saved at /)).toBeVisible();
  await page.clock.fastForward(4 * 60 * 60 * 1_000 + 1_000);

  await completeRubricReview(page, Array(10).fill(0));

  await expect(page).toHaveURL(/\/en\/simulation\/result\?/, {
    timeout: dynamicNavigationTimeout,
  });
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

async function completeRubricReview(
  page: Page,
  scores: readonly number[],
): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Compare your written work" }),
  ).toBeVisible();
  for (const [index, score] of scores.entries()) {
    await page
      .getByRole("button", { name: String(score), exact: true })
      .click();
    if (index < scores.length - 1) {
      await page
        .getByRole("button", { name: "Next task", exact: true })
        .click();
    }
  }
  await page
    .getByRole("button", {
      name: "Save self-check and view result",
      exact: true,
    })
    .click();
}
