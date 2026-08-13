import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DiagnosticGraphQLError,
  abandonDiagnosticCloudRun,
  uploadDiagnosticCloudRun,
} from "./diagnostic-cloud-client";
import type { DiagnosticProgressTask } from "./diagnostic-progress";
import type { PersistedDiagnosticState } from "./diagnostic-store";

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const ownerId = "39ec4650-762d-437f-9917-c31ab167cb99";
const startedAt = Date.parse("2026-08-10T10:00:00.000Z");
const tasks: DiagnosticProgressTask[] = Array.from(
  { length: 10 },
  (_, index) => ({
    id: `task-${index + 1}`,
    revision: `sha256:${((index + 1) % 10).toString().repeat(64)}`,
    slot: index + 1,
    examPosition: index + 1,
    topic: `topic-${index + 1}`,
    answerPartCount: 1,
  }),
);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("diagnostic cloud client", () => {
  it("uploads immutable attempts before a versioned draft checkpoint", async () => {
    const calls: GraphQLBody[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as GraphQLBody;
        calls.push(body);
        const input = body.variables.input as Record<string, unknown>;
        if (body.operationName === "StartRun") {
          return response({ startRun: { id: runId, status: "ACTIVE" } });
        }
        if (body.operationName === "RecordAttempt") {
          return response({ recordAttempt: { id: input.id } });
        }
        return response({
          checkpointRun: { version: 3, currentOrdinal: 3 },
        });
      }),
    );

    await expect(
      uploadDiagnosticCloudRun(
        {
          state: activeState(),
          tasks,
          blueprintVersion: "ftn-p1:2026.1",
          contentRevision: `sha256:${"f".repeat(64)}`,
        },
        () => true,
      ),
    ).resolves.toBe(3);

    expect(calls.map((call) => call.operationName)).toEqual([
      "StartRun",
      "RecordAttempt",
      "RecordAttempt",
      "CheckpointRun",
    ]);
    expect(calls[1].variables.input).toMatchObject({
      outcome: "CORRECT",
      answer: '["42"]',
    });
    expect(calls[2].variables.input).toMatchObject({ outcome: "SKIPPED" });
    expect(calls[2].variables.input).not.toHaveProperty("answer");
    expect(calls[3].variables.input).toMatchObject({
      id: runId,
      expectedVersion: 2,
      currentOrdinal: 3,
      drafts: [{ answer: '["draft"]' }],
    });
    expect(JSON.stringify(calls)).not.toMatch(
      /statement|solution|expectedAnswer|gradingRule/i,
    );
    expect(
      (calls[0].variables.input.items as Record<string, unknown>[]).every(
        (item) =>
          Object.keys(item).toSorted().join(",") ===
          "answerPartCount,examPosition,id,taskId,taskRevision,topic",
      ),
    ).toBe(true);
  });

  it("stops a lifecycle as soon as its owner generation changes", async () => {
    let current = true;
    const calls: GraphQLBody[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as GraphQLBody;
        calls.push(body);
        current = false;
        return response({ startRun: { id: runId, status: "ACTIVE" } });
      }),
    );

    await expect(
      uploadDiagnosticCloudRun(
        {
          state: activeState(),
          tasks,
          blueprintVersion: "ftn-p1:2026.1",
          contentRevision: `sha256:${"f".repeat(64)}`,
        },
        () => current,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toHaveLength(1);
  });

  it("preserves a coded GraphQL conflict for recovery logic", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response(null, [
          { message: "write conflict", extensions: { code: "CONFLICT" } },
        ]),
      ),
    );

    const error = await abandonDiagnosticCloudRun(runId).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(DiagnosticGraphQLError);
    expect(error).toMatchObject({ code: "CONFLICT" });
  });
});

type GraphQLBody = {
  operationName: string;
  variables: { input: Record<string, unknown> };
};

function activeState(): PersistedDiagnosticState {
  return {
    runId,
    runOwnerId: ownerId,
    checkpointVersion: 2,
    taskIds: tasks.map((task) => task.id),
    slots: tasks.map((task) => task.slot),
    answers: [["42"], [""], ["draft"], ...Array(7).fill([""])],
    outcomes: ["correct", "skipped", ...Array(8).fill(null)],
    completedAt: [
      startedAt + 60_000,
      startedAt + 120_000,
      ...Array(8).fill(null),
    ],
    phase: "running",
    currentIndex: 2,
    startedAt,
  };
}

function response(
  data: Record<string, unknown> | null,
  errors?: Record<string, unknown>[],
): Response {
  return new Response(JSON.stringify({ data, ...(errors ? { errors } : {}) }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
