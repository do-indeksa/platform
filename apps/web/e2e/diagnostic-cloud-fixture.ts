import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import { parse } from "yaml";

export const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
export const taskIds = [
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
export const runUrl = `/en/diagnostic/new?run=${runId}&set=${taskIds.join("%2C")}`;

export type E2EGraphQLCall = {
  operationName: string;
  variables: {
    id?: string;
    input?: Record<string, unknown>;
    limit?: number;
  };
};

type CloudFixture = Awaited<ReturnType<typeof cloudFixture>>;

export async function installCloudRoutes(
  page: Page,
  fixture: CloudFixture,
  mutationCalls: E2EGraphQLCall[],
): Promise<void> {
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
    if (call.operationName === "HistoryRuns") {
      await route.fulfill({
        json: {
          data: { runs: [], latestSubmittedDiagnosticRun: null },
        },
      });
      return;
    }
    if (call.operationName === "PracticeRunIndex") {
      await route.fulfill({ json: { data: { runs: [] } } });
      return;
    }
    if (call.operationName === "DiagnosticRunIndex") {
      await route.fulfill({
        json: {
          data: {
            runs: [
              {
                id: runId,
                kind: "DIAGNOSTIC",
                status: "ACTIVE",
                startedAt: fixture.run.startedAt,
              },
            ],
          },
        },
      });
      return;
    }
    if (call.operationName === "DiagnosticCloudRun") {
      await route.fulfill({ json: { data: { run: fixture.run } } });
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
    if (call.operationName === "RecordAttempt") {
      await route.fulfill({
        json: { data: { recordAttempt: { id: input.id } } },
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
    if (call.operationName === "AbandonRun") {
      await route.fulfill({
        json: { data: { abandonRun: { id: input.id, status: "ABANDONED" } } },
      });
      return;
    }
    if (call.operationName === "SubmitRun") {
      await route.fulfill({
        json: { data: { submitRun: { id: input.id, status: "SUBMITTED" } } },
      });
      return;
    }
    await route.fulfill({ status: 500 });
  });
}

export async function cloudFixture({
  completed,
  draft,
  checkpointVersion = 3,
}: {
  completed: number;
  draft: string[];
  checkpointVersion?: number;
}) {
  const tasks = await loadFixtureTasks();
  const blueprintVersion = await loadBlueprintVersion();
  const startedAt = "2026-08-10T10:00:00.000Z";
  const startedAtMs = Date.parse(startedAt);
  const items = tasks.map((task, index) => {
    const examPosition = index + 1;
    const itemId = progressRunItemId(runId, task.id);
    const submittedAt = new Date(
      startedAtMs + (index + 1) * 60_000,
    ).toISOString();
    const previousSubmittedAt =
      index === 0
        ? startedAt
        : new Date(startedAtMs + index * 60_000).toISOString();
    const answer =
      index === 0
        ? ["1", "3sqrt(2)", "3", "-3"]
        : Array<string>(task.answerPartCount).fill("0");
    return {
      id: itemId,
      taskId: task.id,
      ordinal: index + 1,
      examPosition,
      topic: task.topic,
      taskRevision: task.revision,
      recentAttempts:
        index < completed
          ? [
              {
                id: progressAttemptId(itemId),
                runItemId: itemId,
                taskId: task.id,
                examPosition,
                mode: "DIAGNOSTIC",
                startedAt: previousSubmittedAt,
                submittedAt,
                answer: JSON.stringify(answer),
                outcome: index === 0 ? "CORRECT" : "INCORRECT",
                helpLevel: 0,
                gradingKind: "AUTO",
                taskRevision: task.revision,
              },
            ]
          : [],
    };
  });
  return {
    tasks: tasks.map((task) => ({
      id: task.id,
      slot: task.slot,
      answerPartCount: task.answerPartCount,
    })),
    run: {
      id: runId,
      kind: "DIAGNOSTIC",
      status: "ACTIVE",
      blueprintVersion,
      contentRevision: fixtureTaskSetRevision(tasks),
      startedAt,
      checkpoint: {
        version: checkpointVersion,
        currentOrdinal: Math.min(completed + 1, items.length),
        activeDurationMs: 120_000,
        updatedAt: "2026-08-10T10:03:00.000Z",
        drafts:
          draft.length === 0
            ? []
            : [
                {
                  runItemId: items[completed].id,
                  answer: JSON.stringify(draft),
                },
              ],
      },
      items,
    },
  };
}

export type FixtureTask = {
  id: string;
  revision: string;
  slot: number;
  topic: string;
  answerPartCount: number;
};

export async function loadFixtureTasks(): Promise<FixtureTask[]> {
  const tasksRoot = path.resolve(process.cwd(), "../../content/tasks");
  const topicDirectories = await fs.readdir(tasksRoot, { withFileTypes: true });
  const byId = new Map<string, FixtureTask>();
  for (const topicDirectory of topicDirectories) {
    if (!topicDirectory.isDirectory()) continue;
    const directory = path.join(tasksRoot, topicDirectory.name);
    for (const file of await fs.readdir(directory)) {
      if (!file.endsWith(".md")) continue;
      const raw = await fs.readFile(path.join(directory, file), "utf8");
      const frontmatter = parseTaskFrontmatter(raw);
      if (!taskIds.includes(frontmatter.id)) continue;
      byId.set(frontmatter.id, {
        id: frontmatter.id,
        revision: `sha256:${createHash("sha256").update(raw).digest("hex")}`,
        slot: frontmatter.slot,
        topic: frontmatter.topic,
        answerPartCount: frontmatter.check.length,
      });
    }
  }
  return taskIds.map((taskId) => {
    const task = byId.get(taskId);
    if (!task) throw new Error(`missing diagnostic fixture task ${taskId}`);
    return task;
  });
}

function parseTaskFrontmatter(raw: string): {
  id: string;
  slot: number;
  topic: string;
  check: unknown[];
} {
  const closing = raw.indexOf("\n---", 4);
  if (!raw.startsWith("---\n") || closing < 0) {
    throw new Error("invalid task frontmatter");
  }
  const value: unknown = parse(raw.slice(4, closing));
  if (
    typeof value !== "object" ||
    value === null ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    !("slot" in value) ||
    typeof value.slot !== "number" ||
    !("topic" in value) ||
    typeof value.topic !== "string" ||
    !("check" in value) ||
    !Array.isArray(value.check)
  ) {
    throw new Error("invalid task metadata");
  }
  return {
    id: value.id,
    slot: value.slot,
    topic: value.topic,
    check: value.check,
  };
}

export async function loadBlueprintVersion(): Promise<string> {
  const raw = await fs.readFile(
    path.resolve(process.cwd(), "../../content/exams/ftn-p1/index.yaml"),
    "utf8",
  );
  const value: unknown = parse(raw);
  if (
    typeof value !== "object" ||
    value === null ||
    !("examId" in value) ||
    value.examId !== "ftn-p1" ||
    !("latestVersion" in value) ||
    typeof value.latestVersion !== "string"
  ) {
    throw new Error("invalid diagnostic blueprint index");
  }
  return `${value.examId}:${value.latestVersion}`;
}

export function fixtureTaskSetRevision(tasks: FixtureTask[]): string {
  const hash = createHash("sha256");
  for (const task of tasks) {
    hash.update(task.id);
    hash.update("\0");
    hash.update(task.revision);
    hash.update("\n");
  }
  return `sha256:${hash.digest("hex")}`;
}

export function progressRunItemId(parentRunId: string, taskId: string): string {
  return fixtureUuidV5(`run-item:${taskId}`, parentRunId);
}

function progressAttemptId(runItemId: string): string {
  return fixtureUuidV5("attempt:1", runItemId);
}

function fixtureUuidV5(name: string, namespace: string): string {
  const namespaceBytes = Buffer.from(namespace.replaceAll("-", ""), "hex");
  const bytes = createHash("sha1")
    .update(namespaceBytes)
    .update(name, "utf8")
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function localDiagnosticState(fixture: CloudFixture, draft: string[]) {
  const answers = fixture.tasks.map((task) =>
    Array<string>(task.answerPartCount).fill(""),
  );
  answers[0] = draft;
  return {
    runId,
    runOwnerId: "39ec4650-762d-437f-9917-c31ab167cb99",
    checkpointVersion: 1,
    taskIds: fixture.tasks.map((task) => task.id),
    slots: fixture.tasks.map((task) => task.slot),
    answers,
    outcomes: Array(10).fill(null),
    completedAt: Array(10).fill(null),
    phase: "running",
    currentIndex: 0,
    startedAt: Date.parse(fixture.run.startedAt),
  };
}
