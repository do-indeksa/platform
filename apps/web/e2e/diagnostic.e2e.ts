import { expect, test, type Page } from "./test";
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
    progress: localStorage.getItem("do-indeksa-progress-outbox"),
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
  const guestProgress = JSON.parse(persisted.progress as string) as {
    pending: { ownerId: string | null; run: { items: unknown[] } }[];
  };
  expect(guestProgress.pending).toHaveLength(1);
  expect(guestProgress.pending[0]).toMatchObject({
    ownerId: null,
    run: { id: runId, kind: "DIAGNOSTIC" },
  });
  expect(guestProgress.pending[0].run.items).toHaveLength(10);
  expect(persisted.progress).not.toMatch(/expected|solution/i);

  await page.getByRole("link", { name: "Start short practice" }).click();
  await expect(page).toHaveURL(/\/en\/tasks\/kvadratna-jednacina\/kv-002\?/);
  await expect(page.getByText("1 of 3 tasks", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Back to practice/ }),
  ).toHaveAttribute("href", "/en/prep");
});

test("an authenticated diagnostic persists one idempotent GraphQL lifecycle", async ({
  page,
}) => {
  type GraphQLCall = {
    operationName: string;
    variables: { input?: Record<string, unknown>; limit?: number };
  };
  const graphQLCalls: GraphQLCall[] = [];
  const attemptMethods: string[] = [];
  let authReads = 0;
  let historyReads = 0;
  let submitted = false;
  let submittedAt: string | null = null;
  let checkpointVersion = 0;

  await page.route("**/api/v1/me", (route) => {
    authReads += 1;
    return route.fulfill({
      json: {
        id: "39ec4650-762d-437f-9917-c31ab167cb99",
        email: "portfolio@example.test",
        name: "Portfolio User",
      },
    });
  });
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
              ? [
                  journalAttempt(
                    "c4f8fe8b-8898-4dc8-8e67-15837b1fdb91",
                    "kb-001",
                    1,
                    true,
                  ),
                  journalAttempt(
                    "89f60fb8-521a-48f6-becd-3ba25ef9898e",
                    "kv-001",
                    2,
                    false,
                  ),
                ]
              : [],
          },
        },
      });
      return;
    }
    if (call.operationName === "DiagnosticRunIndex") {
      await route.fulfill({ json: { data: { runs: [] } } });
      return;
    }
    if (call.operationName === "HistoryRuns") {
      historyReads += 1;
      const completedAt = submittedAt ?? "2026-08-10T10:10:00.000Z";
      await route.fulfill({
        json: {
          data: {
            runs: submitted
              ? [
                  {
                    id: runId,
                    kind: "DIAGNOSTIC",
                    status: "SUBMITTED",
                    blueprintVersion: "ftn-p1:2026.1",
                    contentRevision: `sha256:${"a".repeat(64)}`,
                    startedAt: "2026-08-10T10:00:00.000Z",
                    submittedAt: completedAt,
                    activeDurationMs: 600_000,
                    taskIds,
                    itemCount: 10,
                    completedItemCount: 10,
                    correctItemCount: 1,
                    earnedPoints: null,
                    maxPoints: null,
                  },
                ]
              : [],
            latestSubmittedDiagnosticRun: submitted
              ? { id: runId, submittedAt: completedAt }
              : null,
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
    if (call.operationName === "PrepPreferences") {
      await route.fulfill({ json: { data: { prepPreferences: null } } });
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
    if (call.operationName === "SubmitRun") {
      submitted = true;
      submittedAt = String(input.submittedAt);
    }
    await route.fulfill({
      json: {
        data: {
          [field]: {
            id: input.id,
            ...(field === "startRun" ? { status: "ACTIVE" } : {}),
            ...(field === "submitRun" ? { status: "SUBMITTED" } : {}),
          },
        },
      },
    });
  });

  await page.goto(runUrl);
  await answerFirstTask(page);
  await page.getByRole("textbox", { name: "m", exact: true }).fill("0");
  await page.getByRole("button", { name: "Submit answer" }).click();
  for (let position = 3; position <= 10; position++) {
    await page.getByRole("button", { name: "Skip this task" }).click();
  }

  await expect(page).toHaveURL(/\/en\/diagnostic\/result\?/);
  await expect
    .poll(
      () =>
        graphQLCalls.filter((call) => call.operationName === "SubmitRun")
          .length,
    )
    .toBe(1);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("do-indeksa-progress-outbox");
        return raw ? JSON.parse(raw).pending.length : 0;
      }),
    )
    .toBe(0);
  await expect.poll(() => historyReads).toBeGreaterThanOrEqual(2);

  const startCalls = graphQLCalls.filter(
    (call) => call.operationName === "StartRun",
  );
  const attemptCalls = graphQLCalls.filter(
    (call) => call.operationName === "RecordAttempt",
  );
  const checkpointCalls = graphQLCalls.filter(
    (call) => call.operationName === "CheckpointRun",
  );
  expect(startCalls.length).toBeGreaterThanOrEqual(1);
  expect(checkpointCalls.length).toBeGreaterThanOrEqual(1);
  expect(graphQLCalls.at(-1)?.operationName).toBe("SubmitRun");
  expect(startCalls[0].variables.input).toMatchObject({
    id: runId,
    kind: "DIAGNOSTIC",
    blueprintVersion: expect.stringMatching(/^ftn-p1:\d{4}\.\d+$/),
    contentRevision: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
  });
  const uniqueAttempts = new Map(
    attemptCalls.map((call) => [
      call.variables.input?.id,
      call.variables.input,
    ]),
  );
  expect([...uniqueAttempts.values()].map((input) => input?.outcome)).toEqual([
    "CORRECT",
    "INCORRECT",
    ...Array(8).fill("SKIPPED"),
  ]);
  expect(
    (startCalls[0].variables.input?.items as { taskRevision: string }[]).every(
      (item) => /^sha256:[a-f0-9]{64}$/.test(item.taskRevision),
    ),
  ).toBe(true);
  expect(
    checkpointCalls.map((call) => call.variables.input?.expectedVersion),
  ).toEqual(checkpointCalls.map((_, index) => index));
  expect(JSON.stringify(graphQLCalls)).not.toMatch(
    /statementHtml|solution|expectedAnswer|gradingRule/i,
  );
  expect(attemptMethods).toEqual([]);

  const mutationCount = graphQLCalls.length;
  const authReadsBeforeNavigation = authReads;
  const resultUrl = page.url();
  await page.getByRole("link", { name: "Study plan", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/prep$/);
  await expect(page.getByTestId("next-action")).toContainText(
    "Solve 3 tasks from position 2",
  );
  await expect(page.getByTestId("next-action")).not.toContainText(
    "Take the short diagnostic",
  );
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/history$/);
  await expect(page.getByTestId("history-page")).toHaveAttribute(
    "data-sync-status",
    "synced",
  );
  await page.getByRole("link", { name: "Trainings", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/history\?tab=trainings$/);
  await expect(page.getByText("P1 diagnostic", { exact: true })).toBeVisible();
  await expect(page.getByText("1/10", { exact: true })).toBeVisible();
  expect(authReads).toBe(authReadsBeforeNavigation);
  expect(graphQLCalls).toHaveLength(mutationCount);

  await page.goto(resultUrl, { waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", { name: "Your starting level" }),
  ).toBeVisible();
  expect(graphQLCalls).toHaveLength(mutationCount);
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

async function answerFirstTask(page: Page): Promise<void> {
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
}

function journalAttempt(
  id: string,
  taskId: string,
  slot: number,
  correct: boolean,
) {
  return {
    id,
    runItemId:
      slot === 1
        ? "15944dbd-61cb-4e13-9a2b-8e9cc1be3114"
        : "b6c0ed64-5000-48bb-b9d0-2a89dd4252cf",
    taskId,
    examPosition: slot,
    mode: "DIAGNOSTIC",
    startedAt: "2026-08-10T10:09:30.000Z",
    submittedAt: "2026-08-10T10:10:00.000Z",
    activeDurationMs: 30_000,
    answer: JSON.stringify([correct ? "1" : "0"]),
    outcome: correct ? "CORRECT" : "INCORRECT",
    helpLevel: 0,
    gradingKind: "AUTO",
    earnedPoints: null,
    maxPoints: null,
    taskRevision: `sha256:${"a".repeat(64)}`,
  };
}
