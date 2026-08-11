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

export const diagnosticResultPath = `/diagnostic/result?run=${diagnosticRunId}&set=${diagnosticTaskIds.join("%2C")}`;
export const simulationRunPath = `/simulation/new?run=${simulationRunId}&version=2026.1&set=${simulationTaskIds.join("%2C")}`;

let diagnosticFixturePromise: ReturnType<typeof cloudFixture> | undefined;

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
