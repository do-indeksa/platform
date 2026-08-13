import type { Page } from "@playwright/test";
import {
  fixtureTaskSetRevision,
  loadBlueprintVersion,
  loadFixtureTasks,
  progressRunItemId,
  type E2EGraphQLCall,
} from "./diagnostic-cloud-fixture";

export const practiceRunId = "7ff78318-3436-4b4e-99b8-77ef34366ad3";
export const practiceOwnerId = "39ec4650-762d-437f-9917-c31ab167cb99";

export async function practiceCloudFixture() {
  const tasks = (await loadFixtureTasks()).slice(0, 3);
  const startedAt = new Date(Date.now() - 15 * 60_000).toISOString();
  const startedAtMs = Date.parse(startedAt);
  return {
    run: {
      id: practiceRunId,
      kind: "PRACTICE",
      status: "ACTIVE",
      blueprintVersion: await loadBlueprintVersion(),
      contentRevision: fixtureTaskSetRevision(tasks),
      startedAt,
      checkpoint: {
        version: 2,
        currentOrdinal: 2,
        activeDurationMs: 180_000,
        updatedAt: new Date(startedAtMs + 180_000).toISOString(),
        drafts: [
          {
            runItemId: progressRunItemId(practiceRunId, tasks[1].id),
            answer: JSON.stringify({
              version: 1,
              nextAttempt: 1,
              answers: Array.from(
                { length: tasks[1].answerPartCount },
                (_, index) => (index === 0 ? "cloud draft" : ""),
              ),
              helpLevel: 0,
            }),
          },
        ],
      },
      items: tasks.map((task, index) => ({
        id: progressRunItemId(practiceRunId, task.id),
        taskId: task.id,
        ordinal: index + 1,
        examPosition: task.slot,
        topic: task.topic,
        answerPartCount: task.answerPartCount,
        taskRevision: task.revision,
        recentAttempts: [],
      })),
    },
    tasks,
  };
}

export async function installPracticeCloudRoutes(
  page: Page,
  fixture: Awaited<ReturnType<typeof practiceCloudFixture>>,
  calls: E2EGraphQLCall[],
  options: { practiceIndex?: "active" | "offline" } = {},
): Promise<void> {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        id: practiceOwnerId,
        email: "portfolio@example.test",
        name: "Portfolio User",
      },
    }),
  );
  await page.route("**/api/v1/attempts", (route) =>
    route.fulfill({ status: 410 }),
  );
  await page.route("**/graphql", async (route) => {
    const call = route.request().postDataJSON() as E2EGraphQLCall;
    calls.push(call);
    if (call.operationName === "AttemptJournal") {
      await route.fulfill({ json: { data: { attempts: [] } } });
      return;
    }
    if (call.operationName === "CompletedSimulationArchive") {
      await route.fulfill({
        json: { data: { completedSimulationRuns: [] } },
      });
      return;
    }
    if (call.operationName === "HistoryRuns") {
      await route.fulfill({
        json: {
          data: { runs: [], latestSubmittedDiagnostic: null },
        },
      });
      return;
    }
    if (call.operationName === "DiagnosticRunIndex") {
      await route.fulfill({ json: { data: { runs: [] } } });
      return;
    }
    if (call.operationName === "SimulationRunIndex") {
      await route.fulfill({ json: { data: { runs: [] } } });
      return;
    }
    if (call.operationName === "PracticeRunIndex") {
      if (options.practiceIndex === "offline") {
        await route.fulfill({ status: 503, body: "" });
        return;
      }
      await route.fulfill({
        json: {
          data: {
            runs: [
              {
                id: practiceRunId,
                kind: "PRACTICE",
                status: "ACTIVE",
                startedAt: fixture.run.startedAt,
              },
            ],
          },
        },
      });
      return;
    }
    if (call.operationName === "PracticeCloudRun") {
      await route.fulfill({ json: { data: { run: fixture.run } } });
      return;
    }
    await route.fulfill({ status: 500 });
  });
}

export function localPracticeRuntimeFixture(
  fixture: Awaited<ReturnType<typeof practiceCloudFixture>>,
  draft: string,
) {
  const startedAt = Date.parse(fixture.run.startedAt);
  const checkpointUpdatedAt = Date.parse(fixture.run.checkpoint.updatedAt);
  return {
    version: 1,
    state: {
      runs: [
        {
          assignment: {
            runId: fixture.run.id,
            blueprintVersion: fixture.run.blueprintVersion,
            contentRevision: fixture.run.contentRevision,
            tasks: fixture.tasks,
          },
          runOwnerId: practiceOwnerId,
          startedAt,
          startedRemotely: true,
          checkpointVersion: fixture.run.checkpoint.version,
          checkpointRevision: fixture.run.checkpoint.version,
          syncedAttemptCounts: fixture.tasks.map(() => 0),
          currentIndex: 1,
          activeDurationMs: fixture.run.checkpoint.activeDurationMs,
          items: fixture.tasks.map((task, index) => ({
            taskId: task.id,
            attempts: [],
            draft:
              index === 1
                ? {
                    nextAttempt: 1,
                    answers: Array.from(
                      { length: task.answerPartCount },
                      (_, answerIndex) => (answerIndex === 0 ? draft : ""),
                    ),
                    helpLevel: 0,
                  }
                : null,
          })),
          checkpointDirty: false,
          checkpointFlight: null,
          phase: "active",
          submission: null,
          updatedAt: Math.max(startedAt, checkpointUpdatedAt),
        },
      ],
    },
  };
}
