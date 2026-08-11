import { expect, test } from "@playwright/test";

const USER_A = "a0209703-275b-4c6e-b815-25025b923ae8";
const USER_B = "71c4bd20-7512-446a-bc6a-d95a7cb7d665";
const ACTIVE_SIMULATION = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const ACTIVE_DIAGNOSTIC = "8d04f81d-4435-4f7f-b314-2fe16334f0cf";
const ARCHIVED_SIMULATION = "99c66cc7-4666-47e7-98b5-c91a7794a5e8";
const REVISION = `sha256:${"a".repeat(64)}`;
const DIAGNOSTIC_TASKS = [
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

test("foreign learning runtimes stay hidden and clear before account B renders", async ({
  page,
}) => {
  const startedAt = Date.now() - 60_000;
  let releaseIdentity: () => void = () => {};
  const identityReady = new Promise<void>((resolve) => {
    releaseIdentity = resolve;
  });

  await page.addInitScript(
    ({
      activeDiagnostic,
      activeSimulation,
      archivedSimulation,
      diagnosticTasks,
      ownerId,
      revision,
      started,
    }) => {
      const task = {
        id: "kb-001",
        revision,
        slot: 1,
        examPosition: 1,
        maxPoints: 6,
        topic: "kompleksni-brojevi",
        topicName: "Complex numbers",
        statementHtml: "<p>Private active task</p>",
        fields: [{ kind: "value" }],
      };
      const history = {
        id: archivedSimulation,
        blueprintVersion: "2026.1",
        startedAt: started - 60_000,
        finishedAt: started,
        durationMs: 60_000,
        timedOut: false,
        score: 0,
        maxPoints: 6,
        correctCount: 0,
        answeredCount: 1,
        taskIds: [task.id],
        answers: [["private archived answer"]],
        results: [
          {
            taskId: task.id,
            outcome: "incorrect",
            earnedPoints: 0,
            maxPoints: 6,
          },
        ],
        ownerId,
      };
      localStorage.setItem(
        "do-indeksa-simulation",
        JSON.stringify({
          version: 8,
          state: {
            runId: activeSimulation,
            runOwnerId: ownerId,
            blueprintVersion: "2026.1",
            contentRevision: revision,
            tasks: [task],
            answers: [["private active answer"]],
            skipped: [false],
            phase: "running",
            startedAt: started,
            endsAt: started + 4 * 60 * 60 * 1_000,
            submittedAt: null,
            currentIndex: 0,
            savedAt: started,
            timedOut: false,
            results: [],
            review: [],
            history: [history],
          },
        }),
      );
      localStorage.setItem(
        "do-indeksa-diagnostic",
        JSON.stringify({
          version: 2,
          state: {
            runId: activeDiagnostic,
            runOwnerId: ownerId,
            taskIds: diagnosticTasks,
            slots: Array.from({ length: 10 }, (_, index) => index + 1),
            answers: diagnosticTasks.map((_, index) =>
              index === 0 ? ["private diagnostic answer"] : [""],
            ),
            outcomes: Array(10).fill(null),
            completedAt: Array(10).fill(null),
            phase: "running",
            currentIndex: 0,
            startedAt: started,
          },
        }),
      );
    },
    {
      activeDiagnostic: ACTIVE_DIAGNOSTIC,
      activeSimulation: ACTIVE_SIMULATION,
      archivedSimulation: ARCHIVED_SIMULATION,
      diagnosticTasks: DIAGNOSTIC_TASKS,
      ownerId: USER_A,
      revision: REVISION,
      started: startedAt,
    },
  );
  await page.route("**/api/v1/me", async (route) => {
    await identityReady;
    await route.fulfill({
      json: {
        id: USER_B,
        email: "account-b@example.test",
        name: "Account B",
      },
    });
  });
  await page.route("**/graphql", async (route) => {
    const call = route.request().postDataJSON() as { operationName?: string };
    await route.fulfill({
      json:
        call.operationName === "AttemptJournal"
          ? { data: { attempts: [] } }
          : { data: { completedSimulationRuns: [] } },
    });
  });

  await page.goto("/en");
  await expect(page.getByTestId("continue-run")).toHaveCount(0);

  releaseIdentity();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const simulation = JSON.parse(
          localStorage.getItem("do-indeksa-simulation") as string,
        ).state;
        const diagnostic = JSON.parse(
          localStorage.getItem("do-indeksa-diagnostic") as string,
        ).state;
        return {
          simulation: {
            runId: simulation.runId,
            runOwnerId: simulation.runOwnerId,
            answers: simulation.answers,
            history: simulation.history,
          },
          diagnostic: {
            runId: diagnostic.runId,
            runOwnerId: diagnostic.runOwnerId,
            answers: diagnostic.answers,
          },
        };
      }),
    )
    .toEqual({
      simulation: {
        runId: null,
        runOwnerId: null,
        answers: [],
        history: [expect.objectContaining({ ownerId: USER_A })],
      },
      diagnostic: { runId: null, runOwnerId: null, answers: [] },
    });

  await page.goto("/en/history?tab=variants");
  await expect(
    page.getByRole("heading", { name: "No completed mock exams yet" }),
  ).toBeVisible();
  await expect(page.getByText("private archived answer")).toHaveCount(0);
});
