import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PracticeGraphQLError,
  abandonPracticeCloudRun,
  checkpointPracticeCloudRun,
  fetchLatestPracticeCloudRun,
  recordPracticeCloudAttempt,
  startPracticeCloudRun,
  submitPracticeCloudRun,
} from "./practice-cloud-client";
import { progressPracticeAttemptId, progressRunItemId } from "./progress-run";
import type {
  PracticeCloudAssignment,
  PracticeCloudCatalog,
} from "./practice-cloud-types";

const ownerId = "39ec4650-762d-437f-9917-c31ab167cb99";
const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const startedAt = Date.parse("2026-08-12T10:00:00.000Z");
const revision = (character: string) => `sha256:${character.repeat(64)}`;
const contentRevision =
  "sha256:86c961a236f6c615a8db24b074be906e217b222635badba9fb02dbe641c8012a";
const assignment: PracticeCloudAssignment = {
  runId,
  blueprintVersion: "ftn-p1:2026.1",
  contentRevision,
  tasks: [
    {
      id: "kb-001",
      revision: revision("a"),
      slot: 1,
      topic: "kompleksni-brojevi",
      answerPartCount: 2,
    },
    {
      id: "kb-002",
      revision: revision("b"),
      slot: 1,
      topic: "kompleksni-brojevi",
      answerPartCount: 1,
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("practice cloud client", () => {
  it("writes an immutable assignment, versioned draft, retry, and submission", async () => {
    const calls: GraphQLBody[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as GraphQLBody;
        calls.push(body);
        const input = body.variables.input as Record<string, unknown>;
        if (body.operationName === "StartPracticeRun") {
          return response({ startRun: { id: runId, status: "ACTIVE" } });
        }
        if (body.operationName === "CheckpointPracticeRun") {
          return response({
            checkpointRun: { version: 1, currentOrdinal: 1 },
          });
        }
        if (body.operationName === "RecordPracticeRunAttempt") {
          return response({ recordAttempt: { id: input.id } });
        }
        if (body.operationName === "SubmitPracticeRun") {
          return response({ submitRun: { id: runId, status: "SUBMITTED" } });
        }
        if (body.operationName === "AbandonPracticeRun") {
          return response({
            abandonRun: { id: runId, status: "ABANDONED" },
          });
        }
        throw new Error(`unexpected operation: ${body.operationName}`);
      }),
    );

    await startPracticeCloudRun(assignment, startedAt, () => true);
    await expect(
      checkpointPracticeCloudRun(
        assignment,
        {
          expectedVersion: 0,
          currentIndex: 0,
          activeDurationMs: 30_000,
          drafts: [
            {
              taskId: "kb-001",
              nextAttempt: 2,
              answers: ["1", "2"],
              helpLevel: 1,
            },
          ],
        },
        () => true,
      ),
    ).resolves.toBe(1);
    await recordPracticeCloudAttempt(
      assignment,
      {
        taskId: "kb-001",
        attemptNumber: 2,
        startedAt,
        submittedAt: startedAt + 60_000,
        activeDurationMs: 60_000,
        answers: ["1", "2"],
        outcome: "incorrect",
        helpLevel: 1,
      },
      () => true,
    );
    await submitPracticeCloudRun(
      runId,
      startedAt + 120_000,
      90_000,
      () => true,
    );
    await abandonPracticeCloudRun(runId, () => true);

    expect(calls.map((call) => call.operationName)).toEqual([
      "StartPracticeRun",
      "CheckpointPracticeRun",
      "RecordPracticeRunAttempt",
      "SubmitPracticeRun",
      "AbandonPracticeRun",
    ]);
    expect(calls[0].variables.input).toMatchObject({
      id: runId,
      kind: "PRACTICE",
      items: [
        {
          id: progressRunItemId(runId, "kb-001"),
          taskId: "kb-001",
          examPosition: 1,
          answerPartCount: 2,
        },
        {
          id: progressRunItemId(runId, "kb-002"),
          taskId: "kb-002",
          examPosition: 1,
          answerPartCount: 1,
        },
      ],
    });
    expect(calls[1].variables.input).toMatchObject({
      expectedVersion: 0,
      currentOrdinal: 1,
      drafts: [
        {
          runItemId: progressRunItemId(runId, "kb-001"),
          answer:
            '{"version":1,"nextAttempt":2,"answers":["1","2"],"helpLevel":1}',
        },
      ],
    });
    expect(calls[2].variables.input).toMatchObject({
      id: progressPracticeAttemptId(progressRunItemId(runId, "kb-001"), 2),
      answer: '["1","2"]',
      outcome: "INCORRECT",
      gradingKind: "AUTO",
    });
    expect(JSON.stringify(calls)).not.toMatch(
      /statement|solution|expectedAnswer|gradingRule/i,
    );
  });

  it("stops before every mutation when its owner generation changed", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(
      startPracticeCloudRun(assignment, startedAt, () => false),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      checkpointPracticeCloudRun(
        assignment,
        { expectedVersion: 0, currentIndex: 0, drafts: [] },
        () => false,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      recordPracticeCloudAttempt(
        assignment,
        {
          taskId: "kb-001",
          attemptNumber: 1,
          startedAt,
          submittedAt: startedAt + 60_000,
          answers: ["", ""],
          outcome: "skipped",
          helpLevel: 0,
        },
        () => false,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      abandonPracticeCloudRun(runId, () => false),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("discards an in-flight mutation result after the owner changes", async () => {
    let current = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        current = false;
        return response({ startRun: { id: runId, status: "ACTIVE" } });
      }),
    );

    await expect(
      startPracticeCloudRun(assignment, startedAt, () => current),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects malformed local operations before network access", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(
      recordPracticeCloudAttempt(
        assignment,
        {
          taskId: "kb-001",
          attemptNumber: 21,
          startedAt,
          submittedAt: startedAt + 60_000,
          answers: ["only one"],
          outcome: "incorrect",
          helpLevel: 0,
        },
        () => true,
      ),
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      checkpointPracticeCloudRun(
        assignment,
        {
          expectedVersion: 0,
          currentIndex: 0,
          drafts: [
            {
              taskId: "missing",
              nextAttempt: 1,
              answers: [""],
              helpLevel: 0,
            },
          ],
        },
        () => true,
      ),
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      startPracticeCloudRun(
        { ...assignment, contentRevision: revision("f") },
        startedAt,
        () => true,
      ),
    ).rejects.toBeInstanceOf(TypeError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves coded GraphQL conflicts for the coordinator", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response(null, [
          { message: "write conflict", extensions: { code: "CONFLICT" } },
        ]),
      ),
    );

    const error = await startPracticeCloudRun(
      assignment,
      startedAt,
      () => true,
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PracticeGraphQLError);
    expect(error).toMatchObject({ code: "CONFLICT" });
  });

  it("discovers the first current active practice and skips stale content", async () => {
    const staleRunId = "2fe0be1a-cda6-4885-b67b-d3db68c84f6b";
    const calls: GraphQLBody[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as GraphQLBody;
        calls.push(body);
        if (body.operationName === "PracticeRunIndex") {
          return response({
            runs: [
              {
                id: staleRunId,
                kind: "PRACTICE",
                status: "ACTIVE",
                startedAt: new Date(startedAt).toISOString(),
              },
              {
                id: runId,
                kind: "PRACTICE",
                status: "ACTIVE",
                startedAt: new Date(startedAt).toISOString(),
              },
            ],
          });
        }
        const requestedId = body.variables.id;
        const run = rawRun(requestedId as string);
        if (requestedId === staleRunId)
          run.items[0].taskRevision = revision("e");
        return response({ run });
      }),
    );
    const catalog: PracticeCloudCatalog = {
      blueprintVersion: assignment.blueprintVersion,
      tasks: assignment.tasks,
    };

    await expect(
      fetchLatestPracticeCloudRun(catalog, ownerId),
    ).resolves.toMatchObject({ runId, runOwnerId: ownerId });
    expect(calls.map((call) => call.operationName)).toEqual([
      "PracticeRunIndex",
      "PracticeCloudRun",
      "PracticeCloudRun",
    ]);
  });
});

type GraphQLBody = {
  operationName: string;
  variables: Record<string, unknown> & { input?: Record<string, unknown> };
};

function rawRun(id: string) {
  return {
    id,
    kind: "PRACTICE",
    status: "ACTIVE",
    blueprintVersion: assignment.blueprintVersion,
    contentRevision: assignment.contentRevision,
    startedAt: new Date(startedAt).toISOString(),
    checkpoint: null,
    items: assignment.tasks.map((task, index) => ({
      id: progressRunItemId(id, task.id),
      taskId: task.id,
      ordinal: index + 1,
      examPosition: task.slot,
      topic: task.topic,
      answerPartCount: task.answerPartCount,
      taskRevision: task.revision,
      recentAttempts: [],
    })),
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
