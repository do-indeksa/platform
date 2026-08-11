import type { Page } from "@playwright/test";
import {
  cloudFixture as diagnosticCloudFixture,
  type E2EGraphQLCall,
} from "./diagnostic-cloud-fixture";

export const simulationRunId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
export const simulationTaskIds = [
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
export const simulationRunUrl = `/en/simulation/new?run=${simulationRunId}&version=2026.1&set=${simulationTaskIds.join("%2C")}`;

export async function simulationCloudFixture({
  draft,
  currentOrdinal = 1,
  startedAt = new Date(Date.now() - 60_000).toISOString(),
}: {
  draft: string[];
  currentOrdinal?: number;
  startedAt?: string;
}) {
  const base = await diagnosticCloudFixture({ completed: 0, draft: [] });
  const items = base.run.items.map((item) => ({
    ...item,
    maxPoints: 6,
    recentAttempts: [] as Record<string, unknown>[],
  }));
  return {
    tasks: base.tasks,
    run: {
      ...base.run,
      kind: "SIMULATION",
      startedAt,
      deadlineAt: null,
      submittedAt: null,
      activeDurationMs: null,
      checkpoint: {
        version: 3,
        currentOrdinal,
        activeDurationMs: 60_000,
        updatedAt: new Date(Date.parse(startedAt) + 60_000).toISOString(),
        drafts:
          draft.length === 0
            ? []
            : [
                {
                  runItemId: items[0].id,
                  answer: JSON.stringify(draft),
                },
              ],
      },
      items,
    },
  };
}

export async function installSimulationCloudRoutes(
  page: Page,
  fixture: Awaited<ReturnType<typeof simulationCloudFixture>>,
  mutationCalls: E2EGraphQLCall[],
): Promise<void> {
  let active = true;
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        id: "39ec4650-762d-437f-9917-c31ab167cb99",
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
    if (call.operationName === "SimulationRunIndex") {
      await route.fulfill({
        json: {
          data: {
            runs: active
              ? [
                  {
                    id: simulationRunId,
                    kind: "SIMULATION",
                    status: "ACTIVE",
                    startedAt: fixture.run.startedAt,
                  },
                ]
              : [],
          },
        },
      });
      return;
    }
    if (call.operationName === "SimulationCloudRun") {
      await route.fulfill({
        json: { data: { run: active ? fixture.run : null } },
      });
      return;
    }

    mutationCalls.push(call);
    const input = call.variables.input as Record<string, unknown>;
    if (call.operationName === "StartRun") {
      await route.fulfill({
        json: { data: { startRun: { id: input.id, status: "ACTIVE" } } },
      });
      return;
    }
    if (call.operationName === "CheckpointRun") {
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
    if (call.operationName === "RecordAttempt") {
      await route.fulfill({
        json: { data: { recordAttempt: { id: input.id } } },
      });
      return;
    }
    if (call.operationName === "AbandonRun") {
      active = false;
      await route.fulfill({
        json: { data: { abandonRun: { id: input.id, status: "ABANDONED" } } },
      });
      return;
    }
    await route.fulfill({ status: 500 });
  });
}
