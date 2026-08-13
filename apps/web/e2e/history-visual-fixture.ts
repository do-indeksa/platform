import type { Page, Route } from "@playwright/test";
import {
  archivedSimulationContentRevision,
  archivedSimulationTaskRevisions,
} from "./simulation-revision-fixture";

const user = {
  id: "39ec4650-762d-437f-9917-c31ab167cb99",
  email: "portfolio@example.test",
  name: "Polina",
};

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
] as const;

const attempts = [
  attempt(1, "kb-001", 1, "2026-08-11T12:32:00.000Z", "CORRECT"),
  attempt(2, "kv-001", 2, "2026-08-11T12:28:00.000Z", "INCORRECT"),
  attempt(3, "eks-001", 3, "2026-05-11T14:45:00.000Z", "CORRECT"),
  attempt(4, "log-001", 4, "2026-05-10T11:12:00.000Z", "INCORRECT", 1),
  attempt(5, "trig-001", 5, "2026-05-09T18:03:00.000Z", "SKIPPED"),
  attempt(6, "vek-001", 6, "2026-05-08T16:55:00.000Z", "INCORRECT"),
];

const runs = [
  run(1, "2026-08-10T17:15:00.000Z", 10, 7),
  run(2, "2026-05-10T16:20:00.000Z", 8, 5),
  run(3, "2026-05-08T19:10:00.000Z", 6, 6),
  run(4, "2026-05-06T14:05:00.000Z", 10, 3),
  run(5, "2026-05-05T12:30:00.000Z", 8, 4),
];

const mocks = [
  mock(1, "2026-05-12T08:00:00.000Z", 42),
  mock(2, "2026-05-03T08:00:00.000Z", 48),
  mock(3, "2026-04-20T08:00:00.000Z", 30),
  mock(4, "2026-04-05T08:00:00.000Z", 36),
];

export async function installHistoryVisualFixture(
  page: Page,
  empty = false,
): Promise<void> {
  await installHistoryRoutes(page, { empty, degraded: false });
}

export async function installHistoryDegradedVisualFixture(
  page: Page,
): Promise<void> {
  await installHistoryRoutes(page, { empty: false, degraded: true });
}

async function installHistoryRoutes(
  page: Page,
  {
    empty,
    degraded,
  }: {
    empty: boolean;
    degraded: boolean;
  },
): Promise<void> {
  await page.route("**/api/v1/me", (route) => route.fulfill({ json: user }));
  await page.route("**/graphql", async (route) => {
    const body = route.request().postDataJSON() as { operationName?: string };
    if (degraded && body.operationName === "AttemptJournal") {
      await route.fulfill({
        status: 503,
        json: { errors: [{ message: "offline" }] },
      });
      return;
    }
    await fulfillGraphQL(route, body.operationName, empty);
  });
}

async function fulfillGraphQL(
  route: Route,
  operationName: string | undefined,
  empty: boolean,
): Promise<void> {
  if (operationName === "AttemptJournal") {
    await route.fulfill({
      json: { data: { attempts: empty ? [] : attempts } },
    });
    return;
  }
  if (operationName === "HistoryRuns") {
    await route.fulfill({
      json: {
        data: {
          runs: empty ? [] : runs,
          latestSubmittedDiagnostic: null,
        },
      },
    });
    return;
  }
  if (operationName === "CompletedSimulationArchive") {
    await route.fulfill({
      json: { data: { completedSimulationRuns: empty ? [] : mocks } },
    });
    return;
  }
  await route.fulfill({ status: 400 });
}

function attempt(
  index: number,
  taskId: string,
  examPosition: number,
  submittedAt: string,
  outcome: "CORRECT" | "INCORRECT" | "SKIPPED",
  helpLevel = 0,
) {
  return {
    id: id("1", index),
    runItemId: null,
    taskId,
    examPosition,
    mode: "PRACTICE",
    startedAt: new Date(Date.parse(submittedAt) - 12 * 60_000).toISOString(),
    submittedAt,
    activeDurationMs: 12 * 60_000,
    answer: outcome === "SKIPPED" ? null : JSON.stringify(["0"]),
    outcome,
    helpLevel,
    gradingKind: "AUTO",
    earnedPoints: null,
    maxPoints: null,
    taskRevision: null,
  };
}

function run(
  index: number,
  submittedAt: string,
  itemCount: number,
  correct: number,
) {
  return {
    id: id("2", index),
    kind: index === 1 ? "DIAGNOSTIC" : "PRACTICE",
    status: "SUBMITTED",
    blueprintVersion: "ftn-p1:2026.1",
    contentRevision: archivedSimulationContentRevision,
    startedAt: new Date(Date.parse(submittedAt) - 45 * 60_000).toISOString(),
    submittedAt,
    activeDurationMs: 45 * 60_000,
    taskIds: taskIds.slice(0, itemCount),
    itemCount,
    completedItemCount: itemCount,
    correctItemCount: correct,
    earnedPoints: null,
    maxPoints: null,
  };
}

function mock(index: number, submittedAt: string, score: number) {
  const correctCount = score / 6;
  const startedAt = new Date(Date.parse(submittedAt) - 2 * 60 * 60_000);
  return {
    id: id("3", index),
    blueprintVersion: "ftn-p1:2026.1",
    contentRevision: archivedSimulationContentRevision,
    startedAt: startedAt.toISOString(),
    deadlineAt: new Date(startedAt.getTime() + 4 * 60 * 60_000).toISOString(),
    submittedAt,
    activeDurationMs: 2 * 60 * 60_000,
    items: taskIds.map((taskId, itemIndex) => {
      const correct = itemIndex < correctCount;
      return {
        taskId,
        examPosition: itemIndex + 1,
        topic: `topic-${itemIndex + 1}`,
        maxPoints: 6,
        taskRevision: archivedSimulationTaskRevisions[itemIndex],
        answer: JSON.stringify([correct ? "1" : "0"]),
        outcome: correct ? "CORRECT" : "INCORRECT",
        gradingKind: "AUTO",
        earnedPoints: correct ? 6 : 0,
      };
    }),
  };
}

function id(prefix: string, index: number): string {
  return `${prefix}0000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}
