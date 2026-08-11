import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SimulationGraphQLError,
  abandonSimulationCloudRun,
  uploadSimulationAutoGradeRun,
  uploadSimulationCloudRun,
} from "./simulation-cloud-client";
import {
  emptySimulationState,
  type PersistedSimulationState,
} from "./simulation-persistence";
import type {
  SimulationProgressItem,
  SimulationTaskView,
} from "./simulation-types";
import { buildSimulationAutoGradeRun } from "./simulation-progress";

const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const ownerId = "39ec4650-762d-437f-9917-c31ab167cb99";
const startedAt = Date.parse("2026-08-10T10:00:00.000Z");
const revision = (character: string) => `sha256:${character.repeat(64)}`;
const taskViews: SimulationTaskView[] = Array.from(
  { length: 10 },
  (_, index) => ({
    id: `task-${index + 1}`,
    revision: revision(((index + 1) % 10).toString()),
    slot: index + 1,
    examPosition: index + 1,
    maxPoints: 6,
    topic: `topic-${index + 1}`,
    topicName: `Topic ${index + 1}`,
    statementHtml: `<p>Private task ${index + 1}</p>`,
    fields: [{ kind: "value" }],
  }),
);
const tasks: SimulationProgressItem[] = taskViews.map((task) => ({
  taskId: task.id,
  taskRevision: task.revision,
  slot: task.slot,
  examPosition: task.examPosition,
  topic: task.topic,
  maxPoints: task.maxPoints,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("simulation cloud client", () => {
  it("uploads only a start and full versioned draft replacement", async () => {
    const calls: GraphQLBody[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as GraphQLBody;
        calls.push(body);
        if (body.operationName === "StartRun") {
          return response({ startRun: { id: runId, status: "ACTIVE" } });
        }
        return response({
          checkpointRun: { version: 3, currentOrdinal: 4 },
        });
      }),
    );

    await expect(
      uploadSimulationCloudRun(
        {
          state: activeState(),
          tasks,
          blueprintVersion: "ftn-p1:2026.1",
          contentRevision: revision("f"),
        },
        () => true,
      ),
    ).resolves.toBe(3);

    expect(calls.map((call) => call.operationName)).toEqual([
      "StartRun",
      "CheckpointRun",
    ]);
    expect(calls[0].variables.input).not.toHaveProperty("deadlineAt");
    expect(calls[1].variables.input).toMatchObject({
      id: runId,
      expectedVersion: 2,
      currentOrdinal: 4,
      drafts: [
        { answer: '["42"]' },
        { answer: '[""]' },
        { answer: '["draft"]' },
      ],
    });
    expect(JSON.stringify(calls)).not.toMatch(
      /Private task|statementHtml|solutionHtml|correctAnswer|gradingRule/i,
    );
    expect(
      (calls[0].variables.input.items as Record<string, unknown>[]).every(
        (item) =>
          Object.keys(item).toSorted().join(",") ===
          "examPosition,id,maxPoints,taskId,taskRevision,topic",
      ),
    ).toBe(true);
  });

  it("stops before checkpointing when the owner generation changes", async () => {
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
      uploadSimulationCloudRun(
        {
          state: activeState(),
          tasks,
          blueprintVersion: "ftn-p1:2026.1",
          contentRevision: revision("f"),
        },
        () => current,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toHaveLength(1);
  });

  it("uploads stable auto attempts without submitting the active run", async () => {
    const calls: GraphQLBody[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as GraphQLBody;
        calls.push(body);
        if (body.operationName === "StartRun") {
          return response({ startRun: { id: runId, status: "ACTIVE" } });
        }
        const input = body.variables.input;
        return response({ recordAttempt: { id: input.id } });
      }),
    );
    const state = {
      ...activeState(),
      phase: "submitting" as const,
      submittedAt: startedAt + 3 * 60_000,
    };
    const results = taskViews.map((task, index) => ({
      taskId: task.id,
      outcome: index === 1 ? ("unanswered" as const) : ("incorrect" as const),
      earnedPoints: 0,
      maxPoints: task.maxPoints,
    }));
    const run = buildSimulationAutoGradeRun(state, results);
    expect(run).not.toBeNull();

    await uploadSimulationAutoGradeRun(run!, () => true);

    expect(calls.map(({ operationName }) => operationName)).toEqual([
      "StartRun",
      ...Array(10).fill("RecordAttempt"),
    ]);
    expect(
      calls.some(({ operationName }) => operationName === "SubmitRun"),
    ).toBe(false);
    expect(
      calls
        .slice(1)
        .every(({ variables }) => variables.input.gradingKind === "AUTO"),
    ).toBe(true);
  });

  it("preserves coded GraphQL conflicts for explicit recovery", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response(null, [
          { message: "write conflict", extensions: { code: "CONFLICT" } },
        ]),
      ),
    );

    const error = await abandonSimulationCloudRun(runId).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(SimulationGraphQLError);
    expect(error).toMatchObject({ code: "CONFLICT" });
  });
});

type GraphQLBody = {
  operationName: string;
  variables: { input: Record<string, unknown> };
};

function activeState(): PersistedSimulationState {
  return {
    ...emptySimulationState(),
    runId,
    runOwnerId: ownerId,
    checkpointVersion: 2,
    blueprintVersion: "2026.1",
    contentRevision: revision("f"),
    tasks: taskViews,
    answers: [
      ["42"],
      [""],
      ["draft"],
      ...Array.from({ length: 7 }, () => [""]),
    ],
    skipped: [false, true, ...Array(8).fill(false)],
    phase: "running",
    startedAt,
    endsAt: startedAt + 240 * 60_000,
    currentIndex: 3,
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
