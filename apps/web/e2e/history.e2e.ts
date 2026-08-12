import { expect, test } from "@playwright/test";
import {
  archivedSimulationContentRevision,
  archivedSimulationTaskRevisions,
  currentKbRevision,
} from "./simulation-revision-fixture";

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
const answerPartCounts = [4, 1, 1, 1, 2, 1, 2, 3, 5, 3];

test("a practice mistake survives reload and opens with its full context", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/en/tasks/kompleksni-brojevi/kb-001");
  await page.getByRole("textbox", { name: "t", exact: true }).fill("0");
  await page.getByRole("textbox", { name: "|z|", exact: true }).fill("0");
  await page.getByRole("textbox", { name: "Re z", exact: true }).fill("0");
  await page.getByRole("textbox", { name: "Im z", exact: true }).fill("0");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByText("Not quite", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show hint", exact: true }).click();
  const journal = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("do-indeksa-attempts") as string),
  );
  expect(journal.version).toBe(2);
  expect(journal.attempts).toHaveLength(1);
  expect(journal.attempts[0]).toMatchObject({
    taskId: "kb-001",
    transport: "graphql-standalone",
    ownerId: null,
    input: {
      outcome: "INCORRECT",
      helpLevel: 0,
      gradingKind: "AUTO",
    },
  });

  await page.goto("/en/history");
  await expect(
    page.getByRole("heading", { name: "History", exact: true }),
  ).toBeVisible();
  let attemptLink = page.getByRole("link", {
    name: "Open attempt for task kb-001",
  });
  await expect(attemptLink).toContainText("Task #kb-001");
  await expect(attemptLink).toContainText("With help");
  await page.reload();
  attemptLink = page.getByRole("link", {
    name: "Open attempt for task kb-001",
  });
  await expect(attemptLink).toContainText("Task #kb-001");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  const actions = page.getByRole("button", { name: "History actions" });
  await actions.click();
  const retry = page.getByRole("link", { name: "Retry recent mistakes" });
  await expect(retry).toHaveAttribute("href", /set=kb-001/);
  await expect(retry).toHaveAttribute("href", /practice=[0-9a-f-]{36}/);
  await actions.click();

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

test("hints stay metadata and an explicit solution reveal is journaled", async ({
  page,
}) => {
  await page.goto("/en/tasks/kompleksni-brojevi/kb-001");
  const firstAnswer = page.getByRole("textbox", { name: "t", exact: true });
  await firstAnswer.fill("0");
  await expect(page.getByTestId("task-workspace")).toHaveAttribute(
    "data-draft-state",
    "ready",
  );
  await page.getByRole("textbox", { name: "|z|", exact: true }).fill("0");
  await page.getByRole("textbox", { name: "Re z", exact: true }).fill("0");
  await page.getByRole("textbox", { name: "Im z", exact: true }).fill("0");
  await expect(firstAnswer).toHaveValue("0");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByText("Not quite", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show hint", exact: true }).click();
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await page
    .getByRole("button", { name: "Show full solution", exact: true })
    .click();

  const attempts = await page.evaluate(() => {
    const raw = localStorage.getItem("do-indeksa-attempts");
    return raw ? JSON.parse(raw).attempts : [];
  });
  expect(
    attempts.map(
      (entry: { input: { outcome: string; helpLevel: number } }) => ({
        outcome: entry.input.outcome,
        helpLevel: entry.input.helpLevel,
      }),
    ),
  ).toEqual([
    { outcome: "INCORRECT", helpLevel: 0 },
    { outcome: "SKIPPED", helpLevel: 3 },
  ]);
});

test("signed practice retries the same GraphQL attempt without REST", async ({
  page,
}) => {
  type PracticeInput = {
    id: string;
    standalone: {
      taskId: string;
      examPosition: number;
      taskRevision: string;
    };
    startedAt: string;
    submittedAt: string;
    activeDurationMs: number;
    answer: string;
    outcome: string;
    helpLevel: number;
    gradingKind: string;
  };
  const mutationInputs: PracticeInput[] = [];
  const restRequests: string[] = [];
  let saved = false;
  let journalReads = 0;

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
    restRequests.push(route.request().method());
    return route.fulfill({ status: 410 });
  });
  await page.route("**/graphql", async (route) => {
    const call = route.request().postDataJSON() as {
      operationName: string;
      variables: { input?: PracticeInput };
    };
    if (call.operationName === "AttemptJournal") {
      journalReads += 1;
      const input = mutationInputs.at(-1);
      await route.fulfill({
        json: {
          data: {
            attempts:
              saved && input
                ? [
                    {
                      id: input.id,
                      runItemId: null,
                      taskId: input.standalone.taskId,
                      examPosition: input.standalone.examPosition,
                      mode: "PRACTICE",
                      startedAt: input.startedAt,
                      submittedAt: input.submittedAt,
                      activeDurationMs: input.activeDurationMs,
                      answer: input.answer,
                      outcome: input.outcome,
                      helpLevel: input.helpLevel,
                      gradingKind: input.gradingKind,
                      earnedPoints: null,
                      maxPoints: null,
                      taskRevision: input.standalone.taskRevision,
                    },
                  ]
                : [],
          },
        },
      });
      return;
    }
    if (
      call.operationName !== "RecordPracticeAttempt" ||
      !call.variables.input
    ) {
      await route.fulfill({ status: 400 });
      return;
    }
    const input = call.variables.input;
    mutationInputs.push(input);
    if (mutationInputs.length === 1) {
      await route.fulfill({ status: 502 });
      return;
    }
    saved = true;
    await route.fulfill({
      json: { data: { recordAttempt: { id: input.id } } },
    });
  });

  await page.goto("/en/tasks/kompleksni-brojevi/kb-001");
  await expect.poll(() => journalReads).toBeGreaterThan(0);
  await page.getByRole("textbox", { name: "t", exact: true }).fill("0");
  await page.getByRole("textbox", { name: "|z|", exact: true }).fill("0");
  await page.getByRole("textbox", { name: "Re z", exact: true }).fill("0");
  await page.getByRole("textbox", { name: "Im z", exact: true }).fill("0");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect.poll(() => mutationInputs.length).toBe(1);
  await page.getByRole("button", { name: "Show hint", exact: true }).click();
  await page.waitForTimeout(100);
  expect(mutationInputs).toHaveLength(1);
  expect(mutationInputs[0]).toMatchObject({
    standalone: {
      taskId: "kb-001",
      examPosition: 1,
      taskRevision: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    },
    outcome: "INCORRECT",
    helpLevel: 0,
    gradingKind: "AUTO",
  });
  expect(JSON.parse(mutationInputs[0].answer)).toEqual(["0", "0", "0", "0"]);
  expect(mutationInputs[0].activeDurationMs).toBeGreaterThanOrEqual(0);

  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(() => mutationInputs.length).toBe(2);
  expect(mutationInputs[1].id).toBe(mutationInputs[0].id);
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("do-indeksa-attempts")),
    )
    .toBeNull();
  expect(restRequests).toEqual([]);
});

test("a signed-in user opens a synced attempt on a clean browser", async ({
  page,
}) => {
  const attemptId = "99c66cc7-4666-47e7-98b5-c91a7794a5e8";
  const revision = `sha256:${"b".repeat(64)}`;
  const archivedRevision =
    "sha256:f2a6cbf436042386c193131bbb5c103e2cdd0595713ae4d5ce2c94fa580b9903";
  const currentKbRevision =
    "sha256:390eefa973d8a3ea7bbcdfc9789de034413fc94c9c377936524b762a29b9216a";
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        id: "39ec4650-762d-437f-9917-c31ab167cb99",
        email: "portfolio@example.test",
        name: "Portfolio User",
      },
    }),
  );
  await page.route("**/graphql", async (route) => {
    const call = route.request().postDataJSON() as { operationName?: string };
    if (call.operationName === "HistoryRuns") {
      await route.fulfill({ json: { data: { runs: [] } } });
      return;
    }
    if (call.operationName === "CompletedSimulationArchive") {
      await route.fulfill({
        json: { data: { completedSimulationRuns: [] } },
      });
      return;
    }
    if (call.operationName !== "AttemptJournal") {
      await route.fulfill({ status: 400 });
      return;
    }
    await route.fulfill({
      json: {
        data: {
          attempts: [
            {
              id: attemptId,
              runItemId: null,
              taskId: "kb-001",
              examPosition: 1,
              mode: "PRACTICE",
              startedAt: "2026-07-12T09:59:50.000Z",
              submittedAt: "2026-07-12T10:00:00.000Z",
              activeDurationMs: 10_000,
              answer: JSON.stringify(["0", "0", "0", "0"]),
              outcome: "INCORRECT",
              helpLevel: 1,
              gradingKind: "AUTO",
              earnedPoints: null,
              maxPoints: null,
              taskRevision: archivedRevision,
            },
            {
              id: "13c66cc7-4666-47e7-98b5-c91a7794a5e8",
              runItemId: "13c66cc7-4666-47e7-88b5-c91a7794a5e8",
              taskId: "kv-001",
              examPosition: 2,
              mode: "DIAGNOSTIC",
              startedAt: "2026-07-12T10:00:30.000Z",
              submittedAt: "2026-07-12T10:01:00.000Z",
              activeDurationMs: 30_000,
              answer: JSON.stringify(["1"]),
              outcome: "PARTIAL",
              helpLevel: 0,
              gradingKind: "RUBRIC_SELF",
              earnedPoints: 3,
              maxPoints: 6,
              taskRevision: revision,
            },
            {
              id: "23c66cc7-4666-47e7-98b5-c91a7794a5e8",
              runItemId: null,
              taskId: "eks-001",
              examPosition: 3,
              mode: "PRACTICE",
              startedAt: "2026-07-12T10:01:30.000Z",
              submittedAt: "2026-07-12T10:02:00.000Z",
              activeDurationMs: 30_000,
              answer: null,
              outcome: "SKIPPED",
              helpLevel: 3,
              gradingKind: "AUTO",
              earnedPoints: null,
              maxPoints: null,
              taskRevision: revision,
            },
            {
              id: "33c66cc7-4666-47e7-98b5-c91a7794a5e8",
              runItemId: "33c66cc7-4666-47e7-88b5-c91a7794a5e8",
              taskId: "log-001",
              examPosition: 4,
              mode: "SIMULATION",
              startedAt: "2026-07-12T10:02:30.000Z",
              submittedAt: "2026-07-12T10:03:00.000Z",
              activeDurationMs: 30_000,
              answer: null,
              outcome: "UNGRADED",
              helpLevel: 0,
              gradingKind: "HUMAN",
              earnedPoints: null,
              maxPoints: 6,
              taskRevision: revision,
            },
          ],
        },
      },
    });
  });

  await page.goto("/en/history");
  await expect(page.getByTestId("history-page")).toHaveAttribute(
    "data-sync-status",
    "synced",
  );
  await expect(
    page.getByTestId("history-feed").locator(":scope > li"),
  ).toHaveCount(4);
  await expect(page.getByText("Partial", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open attempt for task kb-001" }),
  ).toContainText("With help");
  await expect(page.getByText("In review", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("do-indeksa-task-history")),
  ).toBeNull();

  await page
    .getByRole("link", { name: "Open attempt for task kv-001" })
    .click();
  await expect(
    page.getByText("Self-assessed rubric", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("3 / 6", { exact: true })).toBeVisible();
  await expect(page.getByTitle(revision)).toHaveText("bbbbbbbbbbbb");
  await expect(
    page.getByText(
      "This task changed after the attempt. The statement and solution below show the current version.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.goBack();

  await page
    .getByRole("link", { name: "Open attempt for task kb-001" })
    .click();
  await expect(page).toHaveURL(
    /\/en\/history\/tasks\/kompleksni-brojevi\/kb-001\?/,
  );
  const archivedUrl = new URL(page.url());
  expect(archivedUrl.searchParams.get("attempt")).toBe(attemptId);
  expect(archivedUrl.searchParams.get("revision")).toBe(archivedRevision);
  expect(archivedUrl.searchParams.has("account")).toBe(false);
  expect(archivedUrl.searchParams.has("answer")).toBe(false);
  await expect(page.getByText("10 sec", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Automatic check", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTitle(archivedRevision)).toHaveText("f2a6cbf43604");
  await expect(
    page.getByText(
      "The statement and solution match the immutable content revision recorded for this attempt.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "This task changed after the attempt. The statement and solution below show the current version.",
      { exact: true },
    ),
  ).toHaveCount(0);
  await expect(
    page
      .locator('section[aria-labelledby="answer-comparison-heading"] dd')
      .filter({ hasText: /^0$/ }),
  ).toHaveCount(4);

  archivedUrl.searchParams.set("revision", currentKbRevision);
  await page.goto(archivedUrl.toString());
  await expect(
    page.getByText(
      "This task changed after the attempt. The statement and solution below show the current version.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "The statement and solution match the immutable content revision recorded for this attempt.",
      { exact: true },
    ),
  ).toHaveCount(0);
});

test("a signed-in user opens a synced mock exam on a clean browser", async ({
  page,
}) => {
  const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
  const gradeRequests: Record<string, unknown>[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/content/simulation-grade")) {
      gradeRequests.push(request.postDataJSON() as Record<string, unknown>);
    }
  });
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        id: "39ec4650-762d-437f-9917-c31ab167cb99",
        email: "portfolio@example.test",
        name: "Portfolio User",
      },
    }),
  );
  await page.route("**/graphql", async (route) => {
    const call = route.request().postDataJSON() as { operationName?: string };
    if (call.operationName === "AttemptJournal") {
      await route.fulfill({ json: { data: { attempts: [] } } });
      return;
    }
    if (call.operationName === "HistoryRuns") {
      await route.fulfill({ json: { data: { runs: [] } } });
      return;
    }
    if (call.operationName !== "CompletedSimulationArchive") {
      await route.fulfill({ status: 400 });
      return;
    }
    await route.fulfill({
      json: {
        data: {
          completedSimulationRuns: [
            {
              id: runId,
              blueprintVersion: "ftn-p1:2026.1",
              contentRevision: archivedSimulationContentRevision,
              startedAt: "2026-08-10T10:00:00.000Z",
              deadlineAt: "2026-08-10T14:00:00.000Z",
              submittedAt: "2026-08-10T10:10:00.000Z",
              activeDurationMs: 600_000,
              items: taskIds.map((taskId, index) => ({
                taskId,
                examPosition: index + 1,
                topic: `topic-${index + 1}`,
                maxPoints: 6,
                taskRevision: archivedSimulationTaskRevisions[index],
                answer:
                  index === 0
                    ? JSON.stringify(Array(answerPartCounts[index]).fill("0"))
                    : index === 1
                      ? JSON.stringify(["1"])
                      : null,
                outcome:
                  index === 0
                    ? "INCORRECT"
                    : index === 1
                      ? "PARTIAL"
                      : "SKIPPED",
                gradingKind: index === 1 ? "RUBRIC_SELF" : "AUTO",
                earnedPoints: index === 0 ? 0 : index === 1 ? 3 : null,
              })),
            },
          ],
        },
      },
    });
  });

  await page.goto("/en/history?tab=variants");
  await expect(page.getByTestId("history-page")).toHaveAttribute(
    "data-sync-status",
    "synced",
  );
  await expect(page.getByText("3 / 60", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => {
      const raw = localStorage.getItem("do-indeksa-simulation");
      return raw ? JSON.parse(raw).state.history : null;
    }),
  ).toEqual([]);

  await page.getByRole("link", { name: "Open mock exam result" }).click();
  await expect(
    page.getByRole("heading", { name: "Your result", exact: true }),
  ).toBeVisible();
  const archivedUrl = new URL(page.url());
  expect(archivedUrl.searchParams.get("revisions")?.split(",")).toEqual(
    archivedSimulationTaskRevisions,
  );
  expect(archivedUrl.searchParams.has("account")).toBe(false);
  expect(archivedUrl.searchParams.has("answer")).toBe(false);
  await expect(page.getByText("You answered 2 of 10 tasks.")).toBeVisible();
  const partial = page
    .getByRole("heading", { name: "Partial credit", exact: true })
    .locator("../..");
  await expect(partial).toContainText("2");
  await expect(
    page.getByText(
      "The statements, expected answers and solutions below match the immutable task revisions recorded for this mock exam.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(/This mock exam used an older content revision/),
  ).toHaveCount(0);
  await expect
    .poll(() => gradeRequests.at(-1)?.taskRevisions)
    .toEqual([...archivedSimulationTaskRevisions]);
  await expect(page.locator("#answers tbody tr")).toHaveCount(10);

  const tamperedRevisions = [...archivedSimulationTaskRevisions];
  tamperedRevisions[0] = currentKbRevision;
  archivedUrl.searchParams.set("revisions", tamperedRevisions.join(","));
  await page.goto(archivedUrl.toString());
  await expect(
    page.getByText(/This mock exam used an older content revision/),
  ).toBeVisible();
  await expect(
    page.getByText(
      "The statements, expected answers and solutions below match the immutable task revisions recorded for this mock exam.",
      { exact: true },
    ),
  ).toHaveCount(0);
  await expect.poll(() => gradeRequests.at(-1)?.taskRevisions).toBeUndefined();
});

test("local detail rows stay isolated between accounts", async ({ page }) => {
  const userA = "a0209703-275b-4c6e-b815-25025b923ae8";
  const userB = "71c4bd20-7512-446a-bc6a-d95a7cb7d665";
  let signedOut = false;
  await page.addInitScript(
    ({ ownerA, ownerB }) => {
      const base = {
        slot: 1,
        source: "practice",
        outcome: "incorrect",
        answers: ["1"],
        helpLevel: 0,
        at: "2026-07-12T10:00:00.000Z",
      };
      localStorage.setItem(
        "do-indeksa-task-history",
        JSON.stringify({
          version: 2,
          entries: [
            {
              ...base,
              id: "b8b70648-4249-4474-bb6b-ef1b6db05f55",
              taskId: "kb-001",
              ownerId: ownerA,
            },
            {
              ...base,
              id: "81214e0d-5b5a-4ae9-bc71-636e39e76c64",
              taskId: "kv-001",
              slot: 2,
              ownerId: ownerB,
            },
          ],
        }),
      );
    },
    { ownerA: userA, ownerB: userB },
  );
  await page.route("**/api/v1/me", (route) =>
    signedOut
      ? route.fulfill({ status: 401 })
      : route.fulfill({
          json: {
            id: userB,
            email: "account-b@example.test",
            name: "Account B",
          },
        }),
  );
  await page.route("**/api/v1/auth/logout", (route) => {
    signedOut = true;
    return route.fulfill({ status: 204 });
  });
  await page.route("**/graphql", async (route) => {
    const call = route.request().postDataJSON() as { operationName?: string };
    await route.fulfill({
      json:
        call.operationName === "AttemptJournal"
          ? { data: { attempts: [] } }
          : { data: { runs: [] } },
    });
  });

  await page.goto("/en/history");

  await expect(
    page.getByTestId("history-feed").locator(":scope > li"),
  ).toHaveCount(1);
  await expect(page.getByTestId("history-feed")).toContainText("#kv-001");
  await expect(page.getByTestId("history-feed")).not.toContainText("#kb-001");

  await page
    .getByTestId("site-header")
    .locator("summary")
    .filter({ hasText: "Account B" })
    .click();
  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(
    page.getByRole("heading", { name: "History is empty" }),
  ).toBeVisible();
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
  const variantRow = page.getByRole("link", { name: "Open mock exam result" });
  await expect(variantRow).toBeVisible();
  await expect(variantRow).toContainText("0 / 60");
  await variantRow.click();

  await expect(
    page.getByRole("heading", { name: "Your result", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("You answered 0 of 10 tasks.")).toBeVisible();
  await expect(page.locator("#answers ol > li")).toHaveCount(10);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("do-indeksa-progress-outbox"),
    ),
  ).toBeNull();
});

test("empty mobile history has a recovery action and active navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/ru/history");

  await expect(
    page.getByRole("heading", { name: "История пуста" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Перейти к заданиям" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Меню" }).click();
  await expect(
    page.locator("#mobile-app-menu").getByRole("link", { name: "История" }),
  ).toHaveAttribute("aria-current", "page");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
