import { expect, test, type Page } from "./test";

const STORAGE_KEY = "do-indeksa-practice-runtime";
const OWNER_A = "39ec4650-762d-437f-9917-c31ab167cb99";
const OWNER_B = "71c4bd20-7512-446a-bc6a-d95a7cb7d665";

test("builder order, drafts, attempts, and current task survive reload", async ({
  page,
}) => {
  await page.goto("/en/training/new");
  await page.getByRole("button", { name: /Start 5-task practice/ }).click();
  await expect(page).toHaveURL(/practice=[0-9a-f-]{36}&runtime=1$/);
  await expect(page.getByTestId("task-workspace")).toHaveAttribute(
    "data-runtime-state",
    "bound",
  );

  const startedUrl = new URL(page.url());
  const selectedTaskIds = startedUrl.searchParams.get("set")?.split(",") ?? [];
  const practiceId = startedUrl.searchParams.get("practice");
  expect(practiceId).toMatch(/^[0-9a-f-]{36}$/);
  expect(selectedTaskIds).toHaveLength(5);

  const initial = await readRuntime(page);
  expect(initial.assignment.tasks.map((task) => task.id)).toEqual(
    selectedTaskIds,
  );
  const slotCounts = Object.values(
    Object.groupBy(initial.assignment.tasks, (task) => String(task.slot)),
  )
    .map((group) => group?.length ?? 0)
    .toSorted();
  expect(slotCounts).toEqual([2, 3]);
  expect(JSON.stringify(initial.assignment)).not.toMatch(
    /statement|solution|expectedAnswer|gradingRule/i,
  );

  await page.getByRole("textbox").first().fill("durable answer");
  await expect
    .poll(async () => (await readRuntime(page)).items[0].draft?.answers[0])
    .toBe("durable answer");
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.getByTestId("task-workspace")).toHaveAttribute(
    "data-runtime-state",
    "bound",
  );
  await expect(page.getByRole("textbox").first()).toHaveValue("durable answer");

  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect.poll(async () => (await readRuntime(page)).currentIndex).toBe(1);
  const skipped = await readRuntime(page);
  expect(skipped.items[0]).toMatchObject({
    taskId: selectedTaskIds[0],
    draft: null,
    attempts: [{ number: 1, outcome: "skipped" }],
  });
  expect(await readStandaloneAttemptCount(page)).toBe(0);

  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.getByTestId("task-workspace")).toHaveAttribute(
    "data-runtime-state",
    "bound",
  );
  await expect(page).toHaveURL(
    new RegExp(`/tasks/.+/${selectedTaskIds[1]}\\?`),
  );
  await expect(page.locator("[data-task-rail-item]").first()).toHaveAttribute(
    "data-task-status",
    "skipped",
  );
  const validRuntimeUrl = page.url();

  const reordered = new URL(page.url());
  reordered.searchParams.set(
    "set",
    [selectedTaskIds[1], selectedTaskIds[0], ...selectedTaskIds.slice(2)].join(
      ",",
    ),
  );
  await page.goto(reordered.toString());
  await expect(page).toHaveURL(/\/en\/training\/new$/);

  await page.goto(validRuntimeUrl);
  await expect(page.getByTestId("task-workspace")).toHaveAttribute(
    "data-runtime-state",
    "bound",
  );
  await page.getByRole("link", { name: "Back to practice" }).click();
  await expect(page).toHaveURL(/\/en\/training\/new$/);
  await expect
    .poll(async () => (await readRuntime(page)).phase)
    .toBe("submitting");
  await page.reload();
  await expect
    .poll(async () => (await readRuntime(page)).phase)
    .toBe("submitting");
});

test("signed offline work remains local and clears on an owner change", async ({
  page,
}) => {
  await page.unroute("**/api/v1/me");
  const auth = await installMutableAuth(page);
  const graphQlCalls: string[] = [];
  await page.route("**/api/v1/attempts", (route) =>
    route.fulfill({ status: 410 }),
  );
  await page.route("**/graphql", async (route) => {
    const body = route.request().postDataJSON() as { operationName?: string };
    if (body.operationName) graphQlCalls.push(body.operationName);
    await route.fulfill({ status: 503, body: "" });
  });

  await page.goto("/en/training/new");
  await page.getByRole("button", { name: /Start 5-task practice/ }).click();
  await expect(page.getByTestId("task-workspace")).toHaveAttribute(
    "data-runtime-state",
    "bound",
  );
  const runtimeUrl = page.url();
  const nextTaskId = (await readRuntime(page)).assignment.tasks[1].id;

  await page.getByRole("textbox").first().fill("offline private draft");
  await expect
    .poll(async () => (await readRuntime(page)).items[0].draft?.answers[0])
    .toBe("offline private draft");
  await expect.poll(() => graphQlCalls.includes("StartPracticeRun")).toBe(true);
  const offline = await readRuntime(page);
  expect(offline.runOwnerId).toBe(OWNER_A);
  expect(offline.startedRemotely).toBe(false);

  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.getByRole("textbox").first()).toHaveValue(
    "offline private draft",
  );
  await expect(page.getByTestId("task-workspace")).toHaveAttribute(
    "data-runtime-state",
    "bound",
  );

  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect
    .poll(async () => (await readRuntime(page)).items[0].attempts[0]?.outcome)
    .toBe("skipped");
  await expect(page).toHaveURL(new RegExp(`/tasks/.+/${nextTaskId}\\?`));
  await page.getByRole("link", { name: "Back to practice" }).click();
  await expect(page).toHaveURL(/\/en\/training\/new$/);
  await expect
    .poll(async () => (await readRuntime(page)).phase)
    .toBe("submitting");

  auth.useOwner(OWNER_B);
  await page.goto(runtimeUrl);
  await expect(page).toHaveURL(/\/en\/training\/new$/);
  await expect
    .poll(async () => (await readRuntimeEnvelope(page)).state.runs)
    .toEqual([]);
  await expect(
    page.getByText("offline private draft", { exact: true }),
  ).toHaveCount(0);
});

test("a completed guest run is claimed and submitted exactly once after sign-in", async ({
  page,
}) => {
  await page.unroute("**/api/v1/me");
  let signedIn = false;
  await page.route("**/api/v1/me", (route) =>
    signedIn
      ? route.fulfill({
          json: {
            id: OWNER_A,
            email: "student@example.invalid",
            name: "Student",
          },
        })
      : route.fulfill({ status: 401, body: "" }),
  );
  await page.route("**/api/v1/attempts", (route) =>
    route.fulfill({ status: 410 }),
  );
  const operations: string[] = [];
  const journal: Array<Record<string, unknown>> = [];
  let firstTask: {
    id: string;
    slot: number;
    revision?: string;
  } | null = null;
  await page.route("**/graphql", async (route) => {
    const call = route.request().postDataJSON() as {
      operationName?: string;
      variables?: { input?: Record<string, unknown> };
    };
    const operation = call.operationName ?? "unknown";
    operations.push(operation);
    if (operation === "AttemptJournal") {
      await route.fulfill({ json: { data: { attempts: journal } } });
      return;
    }
    if (operation === "CompletedSimulationArchive") {
      await route.fulfill({
        json: { data: { completedSimulationRuns: [] } },
      });
      return;
    }
    if (operation === "HistoryRuns" || operation === "PracticeRunIndex") {
      await route.fulfill({ json: { data: { runs: [] } } });
      return;
    }
    const input = call.variables?.input ?? {};
    if (operation === "StartPracticeRun") {
      await route.fulfill({
        json: { data: { startRun: { id: input.id, status: "ACTIVE" } } },
      });
      return;
    }
    if (operation === "CheckpointPracticeRun") {
      await route.fulfill({
        json: {
          data: {
            checkpointRun: {
              version: Number(input.expectedVersion) + 1,
              currentOrdinal: input.currentOrdinal,
            },
          },
        },
      });
      return;
    }
    if (operation === "RecordPracticeRunAttempt") {
      if (firstTask === null)
        throw new Error("practice task metadata is missing");
      journal.push({
        id: input.id,
        runItemId: input.runItemId,
        taskId: firstTask.id,
        examPosition: firstTask.slot,
        mode: "PRACTICE",
        startedAt: input.startedAt,
        submittedAt: input.submittedAt,
        activeDurationMs: input.activeDurationMs ?? null,
        answer: input.answer ?? null,
        outcome: input.outcome,
        helpLevel: input.helpLevel,
        gradingKind: input.gradingKind,
        earnedPoints: null,
        maxPoints: null,
        taskRevision: firstTask.revision ?? null,
      });
      await route.fulfill({
        json: { data: { recordAttempt: { id: input.id } } },
      });
      return;
    }
    if (operation === "SubmitPracticeRun") {
      await route.fulfill({
        json: { data: { submitRun: { id: input.id, status: "SUBMITTED" } } },
      });
      return;
    }
    await route.fulfill({ status: 500, body: "" });
  });

  await page.goto("/en/training/new");
  await page.getByRole("button", { name: /Start 5-task practice/ }).click();
  const guest = await readRuntime(page);
  firstTask = guest.assignment.tasks[0];
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await page.getByRole("link", { name: "Back to practice" }).click();
  await expect
    .poll(async () => (await readRuntime(page)).phase)
    .toBe("submitting");

  await page.reload();
  await expect
    .poll(async () => (await readRuntime(page)).phase)
    .toBe("submitting");
  const canonicalId = (await readRuntime(page)).items[0].attempts[0]?.id;
  expect(canonicalId).toMatch(/^[0-9a-f-]{36}$/);

  signedIn = true;
  await page.reload();
  await expect
    .poll(async () => (await readRuntimeEnvelope(page)).state.runs)
    .toEqual([]);

  expect(operationCount(operations, "StartPracticeRun")).toBe(1);
  expect(operationCount(operations, "CheckpointPracticeRun")).toBe(1);
  expect(operationCount(operations, "RecordPracticeRunAttempt")).toBe(1);
  expect(operationCount(operations, "SubmitPracticeRun")).toBe(1);
  expect(operationCount(operations, "RecordPracticeAttempt")).toBe(0);
  expect(journal).toMatchObject([{ id: canonicalId, mode: "PRACTICE" }]);
});

async function installMutableAuth(page: Page) {
  let ownerId = OWNER_A;
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        id: ownerId,
        email: "student@example.invalid",
        name: "Student",
      },
    }),
  );
  return {
    useOwner(nextOwnerId: string) {
      ownerId = nextOwnerId;
    },
  };
}

async function readRuntime(page: Page): Promise<PersistedRun> {
  const envelope = await readRuntimeEnvelope(page);
  const run = envelope.state.runs[0];
  if (!run) throw new Error("persisted practice run is missing");
  return run;
}

async function readRuntimeEnvelope(page: Page): Promise<RuntimeEnvelope> {
  return page.evaluate((storageKey) => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) throw new Error("practice runtime storage is missing");
    return JSON.parse(raw) as RuntimeEnvelope;
  }, STORAGE_KEY);
}

async function readStandaloneAttemptCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("do-indeksa-attempts");
    if (raw === null) return 0;
    const parsed = JSON.parse(raw) as {
      attempts?: Array<{ transport?: string }>;
    };
    return (parsed.attempts ?? []).filter(
      ({ transport }) => transport === "graphql-standalone",
    ).length;
  });
}

type RuntimeEnvelope = {
  version: number;
  state: { runs: PersistedRun[] };
};

type PersistedRun = {
  assignment: {
    tasks: Array<{ id: string; slot: number; revision?: string }>;
  };
  runOwnerId: string | null;
  startedRemotely: boolean;
  phase: "active" | "submitting" | "abandoning";
  currentIndex: number;
  items: Array<{
    taskId: string;
    draft: { answers: string[] } | null;
    attempts: Array<{ id?: string; number: number; outcome: string }>;
  }>;
};

function operationCount(operations: readonly string[], expected: string) {
  return operations.filter((operation) => operation === expected).length;
}
