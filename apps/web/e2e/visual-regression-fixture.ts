import { expect, type Page } from "@playwright/test";
import {
  cloudFixture,
  runId as diagnosticRunId,
  taskIds as diagnosticTaskIds,
} from "./diagnostic-cloud-fixture";
import { simulationRunId, simulationTaskIds } from "./simulation-cloud-fixture";

const FIXED_TIME = Date.parse("2026-08-11T10:00:00.000Z");
const DIAGNOSTIC_STORAGE_KEY = "do-indeksa-diagnostic";
const SIMULATION_STORAGE_KEY = "do-indeksa-simulation";
const CABINET_USER_ID = "00000000-0000-4000-8000-000000000152";
const CABINET_ATTEMPT_RUN_ID = "22222222-2222-4222-8222-222222222222";
const CABINET_SIMULATION_RUN_ID = "33333333-3333-4333-8333-333333333333";
const CABINET_SIMULATION_TASKS = [
  ["kb-001", "kompleksni-brojevi"],
  ["kv-001", "kvadratna-jednacina"],
  ["eks-001", "eksponencijalne-jednacine"],
  ["log-001", "logaritmi"],
  ["trig-001", "trigonometrija"],
  ["vek-001", "vektori"],
  ["plan-001", "planimetrija"],
  ["ster-001", "stereometrija"],
  ["fun-001", "funkcije"],
  ["komb-001", "kombinatorika"],
] as const;

export async function installCabinetVisualSession(page: Page): Promise<void> {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        id: CABINET_USER_ID,
        email: "polina@example.test",
        name: "Polina",
      },
    }),
  );
  await page.route("**/api/v1/attempts", (route) =>
    route.fulfill({ status: 410 }),
  );
  await page.route("**/graphql", async (route) => {
    const request = route.request().postDataJSON() as {
      operationName?: string;
      variables?: { input?: Record<string, unknown> };
    };
    const input = request.variables?.input;

    switch (request.operationName) {
      case "AttemptJournal":
        await route.fulfill({ json: { data: { attempts: [] } } });
        return;
      case "CompletedSimulationArchive":
        await route.fulfill({
          json: { data: { completedSimulationRuns: [] } },
        });
        return;
      case "SimulationRunIndex":
      case "DiagnosticRunIndex":
        await route.fulfill({ json: { data: { runs: [] } } });
        return;
      case "SimulationCloudRun":
      case "DiagnosticCloudRun":
        await route.fulfill({ json: { data: { run: null } } });
        return;
      case "StartRun":
        await route.fulfill({
          json: {
            data: {
              startRun: { id: input?.id, status: "ACTIVE" },
            },
          },
        });
        return;
      case "CheckpointRun":
        await route.fulfill({
          json: {
            data: {
              checkpointRun: {
                version: Number(input?.expectedVersion ?? 0) + 1,
                currentOrdinal: input?.currentOrdinal,
              },
            },
          },
        });
        return;
      default:
        await route.fulfill({ status: 500 });
    }
  });
}

export const diagnosticResultPath = `/diagnostic/result?run=${diagnosticRunId}&set=${diagnosticTaskIds.join("%2C")}`;
export const simulationRunPath = `/simulation/new?run=${simulationRunId}&version=2026.1&set=${simulationTaskIds.join("%2C")}`;

let diagnosticFixturePromise: ReturnType<typeof cloudFixture> | undefined;

export async function prepareCabinetPopulated(page: Page): Promise<void> {
  await page.route("**/graphql", async (route) => {
    const request = route.request().postDataJSON() as {
      operationName?: string;
    };
    if (request.operationName !== "CompletedSimulationArchive") {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: cabinetSimulationArchiveResponse() });
  });
  await page.evaluate(
    ({ ownerId, runId }) => {
      const attemptSeeds = [
        ["kb-001", 1, true],
        ["kb-002", 1, true],
        ["kb-003", 1, true],
        ["kv-001", 2, true],
        ["kv-002", 2, true],
        ["kv-003", 2, true],
        ["trig-001", 5, true],
        ["trig-002", 5, true],
        ["trig-003", 5, true],
        ["plan-001", 7, true],
        ["plan-002", 7, false],
        ["plan-003", 7, false],
        ["eks-001", 3, true],
        ["eks-002", 3, false],
        ["eks-001", 3, true],
      ] as const;
      const attempts = attemptSeeds.map(([taskId, slot, correct], index) => ({
        taskId,
        slot,
        correct,
        source: "practice",
        helpLevel: 0,
        at: `2026-05-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
        transport: "graphql",
        runId,
        ownerId,
      }));
      localStorage.setItem(
        "do-indeksa-attempts",
        JSON.stringify({ version: 2, attempts }),
      );
      localStorage.setItem(
        "do-indeksa-task-history",
        JSON.stringify({
          version: 2,
          entries: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              taskId: "kv-003",
              slot: 2,
              source: "practice",
              outcome: "correct",
              answers: ["1"],
              helpLevel: 0,
              at: "2026-05-16T12:00:00.000Z",
              ownerId,
            },
          ],
        }),
      );
    },
    { ownerId: CABINET_USER_ID, runId: CABINET_ATTEMPT_RUN_ID },
  );
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByTestId("cabinet-dashboard")).toHaveAttribute(
    "data-state",
    "populated",
  );
  await expect(page.getByText("42 / 60", { exact: true })).toBeVisible();
}

function cabinetSimulationArchiveResponse() {
  return {
    data: {
      completedSimulationRuns: [
        {
          id: CABINET_SIMULATION_RUN_ID,
          blueprintVersion: "ftn-p1:2026.1",
          contentRevision: `sha256:${"a".repeat(64)}`,
          startedAt: "2026-05-18T11:00:00.000Z",
          deadlineAt: "2026-05-18T15:00:00.000Z",
          submittedAt: "2026-05-18T12:00:00.000Z",
          activeDurationMs: 3_600_000,
          items: CABINET_SIMULATION_TASKS.map(([taskId, topic], index) => ({
            taskId,
            examPosition: index + 1,
            topic,
            maxPoints: 6,
            taskRevision: `sha256:${"b".repeat(64)}`,
            answer: JSON.stringify([String(index + 1)]),
            outcome: index < 7 ? "CORRECT" : "INCORRECT",
            gradingKind: "AUTO",
            earnedPoints: index < 7 ? 6 : 0,
          })),
        },
      ],
    },
  };
}

export async function prepareCabinetUnfinishedMock(page: Page): Promise<void> {
  await page.goto(simulationRunPath, { waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", { name: "Zadatak 1 od 10", exact: true }),
  ).toBeVisible();
  await page.evaluate((storageKey) => {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) throw new Error("missing simulation state");
    const persisted = JSON.parse(raw) as {
      state: {
        answers: string[][];
        skipped: boolean[];
        currentIndex: number;
        savedAt: number | null;
      };
    };
    for (let index = 0; index < 6; index += 1) {
      persisted.state.answers[index][0] = String(index + 1);
    }
    persisted.state.currentIndex = 6;
    persisted.state.savedAt = Date.now();
    localStorage.setItem(storageKey, JSON.stringify(persisted));
  }, SIMULATION_STORAGE_KEY);
  await page.goto("/cabinet", { waitUntil: "networkidle" });
  await expect(page.getByTestId("cabinet-dashboard")).toHaveAttribute(
    "data-state",
    "populated",
  );
  await expect(
    page.getByRole("heading", {
      name: "Nedovršen probni ispit",
      exact: true,
    }),
  ).toBeVisible();
}

export async function prepareDiagnosticResult(page: Page): Promise<void> {
  const fixture = await (diagnosticFixturePromise ??= cloudFixture({
    completed: 0,
    draft: [],
  }));
  const startedAt = FIXED_TIME - 20 * 60_000;
  const answers = fixture.tasks.map((task) =>
    Array<string>(task.answerPartCount).fill(""),
  );
  answers[0] = ["1", "3sqrt(2)", "3", "-3"];
  answers[1] = answers[1].map(() => "0");
  answers[2] = answers[2].map(() => "0");

  await page.evaluate(
    ({ storageKey, state }) => {
      localStorage.setItem(storageKey, JSON.stringify({ state, version: 3 }));
    },
    {
      storageKey: DIAGNOSTIC_STORAGE_KEY,
      state: {
        runId: diagnosticRunId,
        runOwnerId: null,
        checkpointVersion: 0,
        taskIds: fixture.tasks.map((task) => task.id),
        slots: fixture.tasks.map((task) => task.slot),
        answers,
        outcomes: [
          "correct",
          "incorrect",
          "incorrect",
          ...Array<string>(7).fill("skipped"),
        ],
        completedAt: fixture.tasks.map(
          (_, index) => startedAt + (index + 1) * 60_000,
        ),
        phase: "done",
        currentIndex: fixture.tasks.length - 1,
        startedAt,
      },
    },
  );
  await page.reload({ waitUntil: "networkidle" });
}

export async function prepareSimulationRubricReview(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Zadatak 1 od 10", exact: true }),
  ).toBeVisible();
  await expect.poll(() => readSimulationPhase(page)).toBe("running");

  await page.evaluate(
    ({ storageKey, submittedAt }) => {
      const raw = localStorage.getItem(storageKey);
      if (raw === null) throw new Error("missing simulation fixture state");
      const persisted = JSON.parse(raw) as {
        state: {
          answers: string[][];
          skipped: boolean[];
          phase: string;
          startedAt: number;
          endsAt: number;
          submittedAt: number | null;
          currentIndex: number;
          savedAt: number | null;
          timedOut: boolean;
          results: unknown[];
          review: unknown[];
          rubricScores: unknown[];
        };
      };
      const state = persisted.state;
      state.answers[0][0] = "0";
      state.skipped = state.answers.map((_, index) => index > 0);
      state.phase = "submitting";
      state.startedAt = submittedAt - 30 * 60_000;
      state.endsAt = state.startedAt + 240 * 60_000;
      state.submittedAt = submittedAt;
      state.currentIndex = state.answers.length - 1;
      state.savedAt = submittedAt;
      state.timedOut = false;
      state.results = [];
      state.review = [];
      state.rubricScores = [];
      localStorage.setItem(storageKey, JSON.stringify(persisted));
    },
    { storageKey: SIMULATION_STORAGE_KEY, submittedAt: FIXED_TIME },
  );
  await page.reload({ waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", {
      name: "Uporedi svoj pisani rad",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Zadatak 1 od 10", { exact: true }),
  ).toBeVisible();
}

export async function completeSimulationRubricReview(
  page: Page,
): Promise<void> {
  const scoring = page.getByRole("group", {
    name: "Potkrepljeni bodovi za postupak",
    exact: true,
  });
  for (let index = 0; index < simulationTaskIds.length; index += 1) {
    await scoring.getByRole("button", { name: "0", exact: true }).click();
    if (index < simulationTaskIds.length - 1) {
      await page
        .getByRole("button", { name: "Sledeći zadatak", exact: true })
        .click();
    }
  }
  await page
    .getByRole("button", {
      name: "Sačuvaj samoprocenu i prikaži rezultat",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/simulation\/result\?/);
  await expect(
    page.getByRole("heading", { name: "Tvoj rezultat", exact: true }),
  ).toBeVisible();
}

async function readSimulationPhase(page: Page): Promise<string | null> {
  return page.evaluate((storageKey) => {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return null;
    const persisted = JSON.parse(raw) as { state?: { phase?: unknown } };
    return typeof persisted.state?.phase === "string"
      ? persisted.state.phase
      : null;
  }, SIMULATION_STORAGE_KEY);
}
