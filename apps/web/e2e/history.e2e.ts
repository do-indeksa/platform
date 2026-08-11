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

test("hints stay metadata and an explicit solution reveal is journaled", async ({
  page,
}) => {
  await page.goto("/en/tasks/kompleksni-brojevi/kb-001");
  await page.getByRole("textbox", { name: "t", exact: true }).fill("0");
  await page.getByRole("textbox", { name: "|z|", exact: true }).fill("0");
  await page.getByRole("textbox", { name: "Re z", exact: true }).fill("0");
  await page.getByRole("textbox", { name: "Im z", exact: true }).fill("0");
  await page.getByRole("button", { name: "Check", exact: true }).click();
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
                      taskId: input.standalone.taskId,
                      examPosition: input.standalone.examPosition,
                      mode: "PRACTICE",
                      submittedAt: input.submittedAt,
                      outcome: input.outcome,
                      helpLevel: input.helpLevel,
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
    page.getByRole("heading", { name: "Попыток заданий пока нет" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Выбрать задание" }),
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
