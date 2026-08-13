import type { Page } from "@playwright/test";

type StartRunInput = {
  id: string;
  kind: "PRACTICE";
  blueprintVersion: string;
  contentRevision: string;
  startedAt: string;
  items: Array<{
    id: string;
    taskId: string;
    examPosition: number;
    topic: string;
    answerPartCount: number;
    taskRevision: string;
  }>;
};

type RecordAttemptInput = {
  id: string;
  runItemId: string;
  startedAt: string;
  submittedAt: string;
  activeDurationMs?: number;
  answer?: string;
  outcome: "CORRECT" | "INCORRECT" | "SKIPPED";
  helpLevel: number;
  gradingKind: "AUTO";
};

type SubmitRunInput = {
  id: string;
  submittedAt: string;
  activeDurationMs: number;
};

type GraphQLCall = {
  operationName?: string;
  variables?: { input?: Record<string, unknown>; limit?: number };
};

export async function installPracticeRuntimeClaimFixture(
  page: Page,
  signedInOwnerId: string,
) {
  let ownerId: string | null = null;
  let started: StartRunInput | null = null;
  let recorded: RecordAttemptInput | null = null;
  let submitted: SubmitRunInput | null = null;
  let historyRequestCount = 0;
  const operations: string[] = [];

  await page.unroute("**/api/v1/me");
  await page.route("**/api/v1/me", (route) =>
    ownerId === null
      ? route.fulfill({ status: 401, body: "" })
      : route.fulfill({
          json: {
            id: ownerId,
            email: "portfolio@example.test",
            name: "Portfolio User",
          },
        }),
  );
  await page.route("**/api/v1/attempts", (route) =>
    route.fulfill({ status: 410 }),
  );
  await page.route("**/graphql", async (route) => {
    const call = route.request().postDataJSON() as GraphQLCall;
    const operationName = call.operationName;
    if (operationName) operations.push(operationName);

    if (operationName === "AttemptJournal") {
      await route.fulfill({
        json: { data: { attempts: attemptJournal(started, recorded) } },
      });
      return;
    }
    if (operationName === "HistoryRuns") {
      historyRequestCount += 1;
      await route.fulfill({
        json: {
          data: {
            runs:
              historyRequestCount === 1
                ? []
                : historyRuns(started, recorded, submitted),
            latestSubmittedDiagnostic: null,
          },
        },
      });
      return;
    }
    if (operationName === "CompletedSimulationArchive") {
      await route.fulfill({
        json: { data: { completedSimulationRuns: [] } },
      });
      return;
    }

    const input = call.variables?.input;
    if (operationName === "StartPracticeRun" && isRecord(input)) {
      started ??= input as StartRunInput;
      await route.fulfill({
        json: { data: { startRun: { id: started.id, status: "ACTIVE" } } },
      });
      return;
    }
    if (operationName === "CheckpointPracticeRun" && isRecord(input)) {
      const expectedVersion = input.expectedVersion;
      const currentOrdinal = input.currentOrdinal;
      if (
        typeof expectedVersion !== "number" ||
        typeof currentOrdinal !== "number"
      ) {
        await route.fulfill({ status: 400 });
        return;
      }
      await route.fulfill({
        json: {
          data: {
            checkpointRun: {
              version: expectedVersion + 1,
              currentOrdinal,
            },
          },
        },
      });
      return;
    }
    if (operationName === "RecordPracticeRunAttempt" && isRecord(input)) {
      recorded ??= input as RecordAttemptInput;
      await route.fulfill({
        json: { data: { recordAttempt: { id: recorded.id } } },
      });
      return;
    }
    if (operationName === "SubmitPracticeRun" && isRecord(input)) {
      submitted ??= input as SubmitRunInput;
      await route.fulfill({
        json: {
          data: { submitRun: { id: submitted.id, status: "SUBMITTED" } },
        },
      });
      return;
    }

    await route.fulfill({ status: 400 });
  });

  return {
    signIn() {
      ownerId = signedInOwnerId;
    },
    operationCount(operationName: string) {
      return operations.filter((entry) => entry === operationName).length;
    },
    snapshot() {
      return { started, recorded, submitted, historyRequestCount };
    },
  };
}

function attemptJournal(
  started: StartRunInput | null,
  recorded: RecordAttemptInput | null,
) {
  if (started === null || recorded === null) return [];
  const item = started.items.find(({ id }) => id === recorded.runItemId);
  if (item === undefined) return [];
  return [
    {
      id: recorded.id,
      runItemId: recorded.runItemId,
      taskId: item.taskId,
      examPosition: item.examPosition,
      mode: "PRACTICE",
      startedAt: recorded.startedAt,
      submittedAt: recorded.submittedAt,
      activeDurationMs: recorded.activeDurationMs ?? null,
      answer: recorded.answer ?? null,
      outcome: recorded.outcome,
      helpLevel: recorded.helpLevel,
      gradingKind: recorded.gradingKind,
      earnedPoints: null,
      maxPoints: null,
      taskRevision: item.taskRevision,
    },
  ];
}

function historyRuns(
  started: StartRunInput | null,
  recorded: RecordAttemptInput | null,
  submitted: SubmitRunInput | null,
) {
  if (started === null || submitted === null) return [];
  return [
    {
      id: started.id,
      kind: started.kind,
      status: "SUBMITTED",
      blueprintVersion: started.blueprintVersion,
      contentRevision: started.contentRevision,
      startedAt: started.startedAt,
      submittedAt: submitted.submittedAt,
      activeDurationMs: submitted.activeDurationMs,
      taskIds: started.items.map(({ taskId }) => taskId),
      itemCount: started.items.length,
      completedItemCount: recorded === null ? 0 : 1,
      correctItemCount: recorded?.outcome === "CORRECT" ? 1 : 0,
      earnedPoints: null,
      maxPoints: null,
    },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
