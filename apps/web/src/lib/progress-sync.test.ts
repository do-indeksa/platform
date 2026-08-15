import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  progressAttemptId,
  progressRubricAttemptId,
  progressRunItemId,
  type CompletedProgressRun,
} from "./progress-run";

const mocks = vi.hoisted(() => ({
  acknowledgeGraphQLRun: vi.fn<(runId: string) => Promise<boolean>>(),
}));

vi.mock("./attempts-store", () => ({
  acknowledgeGraphQLRun: mocks.acknowledgeGraphQLRun,
}));

const STORAGE_KEY = "do-indeksa-progress-outbox";
const RECEIPT_STORAGE_KEY = "do-indeksa-progress-receipts";
const runId = "5ff78318-3436-4b4e-99b8-77ef34366ad3";
const userId = "39ec4650-762d-437f-9917-c31ab167cb99";

type GraphQLCall = {
  operationName: string;
  variables: { input: Record<string, unknown> };
};

function completedRun(id = runId): CompletedProgressRun {
  const startedAt = Date.UTC(2026, 7, 10, 10);
  const taskIds = [
    "kb-001",
    "kv-001",
    "log-001",
    "eks-001",
    "trig-001",
    "vek-001",
    "plan-001",
    "ster-001",
    "fun-001",
    "komb-001",
  ];
  return {
    id,
    kind: "DIAGNOSTIC",
    blueprintVersion: "diagnostic-v1",
    contentRevision: `sha256:${"a".repeat(64)}`,
    startedAt: new Date(startedAt).toISOString(),
    submittedAt: new Date(startedAt + 10 * 60_000).toISOString(),
    items: taskIds.map((taskId, index) => {
      const itemId = progressRunItemId(id, taskId);
      const skipped = index === 2;
      return {
        id: itemId,
        taskId,
        examPosition: index + 1,
        topic: `topic-${index + 1}`,
        answerPartCount: 1,
        taskRevision: `sha256:${String(index).repeat(64)}`,
        attempt: {
          id: progressAttemptId(itemId),
          startedAt: new Date(startedAt + index * 60_000).toISOString(),
          submittedAt: new Date(startedAt + (index + 1) * 60_000).toISOString(),
          ...(skipped ? {} : { answer: JSON.stringify([String(index)]) }),
          outcome: skipped ? ("SKIPPED" as const) : ("CORRECT" as const),
          helpLevel: 0,
          gradingKind: "AUTO" as const,
        },
      };
    }),
  };
}

function mockStorage(initial?: string) {
  const map = new Map<string, string>();
  if (initial) map.set(STORAGE_KEY, initial);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  });
  return map;
}

function mockGraphQL(
  respond: (call: GraphQLCall) => Response | Promise<Response> = success,
) {
  const calls: GraphQLCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const call = JSON.parse(init?.body as string) as GraphQLCall;
      calls.push(call);
      return respond(call);
    }),
  );
  return calls;
}

function success(call: GraphQLCall): Response {
  const input = call.variables.input;
  const field =
    call.operationName === "StartRun"
      ? "startRun"
      : call.operationName === "RecordAttempt"
        ? "recordAttempt"
        : "submitRun";
  return Response.json({
    data: {
      [field]: {
        id: input.id,
        ...(field === "submitRun" ? { status: "SUBMITTED" } : {}),
      },
    },
  });
}

function pending(map: Map<string, string>) {
  const raw = map.get(STORAGE_KEY);
  return raw
    ? (
        JSON.parse(raw) as {
          pending: { ownerId: string | null; run: CompletedProgressRun }[];
        }
      ).pending
    : [];
}

async function loadSync() {
  vi.resetModules();
  return import("./progress-sync");
}

beforeEach(() => {
  mocks.acknowledgeGraphQLRun.mockReset();
  mocks.acknowledgeGraphQLRun.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("progress outbox", () => {
  it("claims a guest run and sends the complete lifecycle in order", async () => {
    const map = mockStorage();
    const calls = mockGraphQL();
    const sync = await loadSync();
    const run = completedRun();

    expect(await sync.queueCompletedProgressRun(run)).toBe(true);
    expect(calls).toHaveLength(0);
    expect(pending(map)[0]).toMatchObject({
      ownerId: null,
      run: { id: runId },
    });

    await sync.syncProgress(userId);

    expect(calls.map((call) => call.operationName)).toEqual([
      "StartRun",
      ...Array(10).fill("RecordAttempt"),
      "SubmitRun",
    ]);
    expect(calls[0].variables.input).toMatchObject({
      id: runId,
      kind: "DIAGNOSTIC",
      blueprintVersion: "diagnostic-v1",
      contentRevision: expect.stringMatching(/^sha256:/),
    });
    expect(calls[0].variables.input.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ answerPartCount: 1 })]),
    );
    expect(calls[3].variables.input).toMatchObject({ outcome: "SKIPPED" });
    expect(calls[3].variables.input).not.toHaveProperty("answer");
    expect(JSON.stringify(calls)).not.toMatch(/expected|solution/i);
    expect(mocks.acknowledgeGraphQLRun).toHaveBeenCalledWith(runId);
    expect(pending(map)).toHaveLength(0);
    expect(sync.isProgressRunSynced(runId)).toBe(true);

    await sync.queueCompletedProgressRun(run);
    expect(calls).toHaveLength(12);
    expect(pending(map)).toHaveLength(0);
  });

  it("upgrades and sends the canonical deadline for a legacy simulation", async () => {
    mockStorage();
    const calls = mockGraphQL();
    const sync = await loadSync();
    const run = completedRun();
    run.kind = "SIMULATION";
    run.blueprintVersion = "ftn-p1:2026.1";
    for (const item of run.items) {
      delete item.answerPartCount;
      item.maxPoints = 6;
      if (item.attempt.outcome === "CORRECT") item.attempt.earnedPoints = 6;
    }

    expect(await sync.queueCompletedProgressRun(run)).toBe(true);
    await sync.syncProgress(userId);

    expect(calls[0]).toMatchObject({
      operationName: "StartRun",
      variables: {
        input: { deadlineAt: "2026-08-10T14:00:00.000Z" },
      },
    });
  });

  it("uploads a legacy queued run without inventing answer shape", async () => {
    mockStorage();
    const calls = mockGraphQL();
    const sync = await loadSync();
    const run = completedRun();
    for (const item of run.items) delete item.answerPartCount;

    expect(await sync.queueCompletedProgressRun(run)).toBe(true);
    await sync.syncProgress(userId);

    expect(calls[0].variables.input.items).toEqual(
      expect.arrayContaining([
        expect.not.objectContaining({ answerPartCount: expect.anything() }),
      ]),
    );
  });

  it("uploads the auto layer before a final rubric attempt", async () => {
    mockStorage();
    const calls = mockGraphQL();
    const sync = await loadSync();
    const run = completedRun();
    run.kind = "SIMULATION";
    run.blueprintVersion = "ftn-p1:2026.1";
    for (const candidate of run.items) {
      candidate.maxPoints = 6;
      candidate.answerPartCount = 1;
      candidate.attempt.startedAt = run.startedAt;
      candidate.attempt.submittedAt = run.submittedAt;
      if (candidate.attempt.outcome === "CORRECT") {
        candidate.attempt.earnedPoints = 6;
      }
    }
    const item = run.items[0];
    item.previousAttempt = {
      ...item.attempt,
      id: progressAttemptId(item.id),
      answer: '["wrong"]',
      outcome: "INCORRECT",
      gradingKind: "AUTO",
      earnedPoints: 0,
    };
    item.attempt = {
      ...item.previousAttempt,
      id: progressRubricAttemptId(item.id),
      outcome: "PARTIAL",
      gradingKind: "RUBRIC_SELF",
      earnedPoints: 3,
    };

    expect(await sync.queueCompletedProgressRun(run)).toBe(true);
    await sync.syncProgress(userId);

    expect(calls.slice(1, 3).map((call) => call.variables.input)).toMatchObject(
      [
        { id: progressAttemptId(item.id), gradingKind: "AUTO" },
        { id: progressRubricAttemptId(item.id), gradingKind: "RUBRIC_SELF" },
      ],
    );
  });

  it("retains a failed run and retries it idempotently", async () => {
    const map = mockStorage();
    let unavailable = true;
    const calls = mockGraphQL((call) =>
      unavailable ? new Response(null, { status: 503 }) : success(call),
    );
    const sync = await loadSync();
    await sync.syncProgress(userId);

    expect(await sync.queueCompletedProgressRun(completedRun())).toBe(true);
    expect(pending(map)).toHaveLength(1);
    expect(calls).toHaveLength(1);

    unavailable = false;
    await sync.syncProgress(userId);

    expect(calls).toHaveLength(13);
    expect(pending(map)).toHaveLength(0);
  });

  it("treats GraphQL errors as retryable failures", async () => {
    const map = mockStorage();
    mockGraphQL(() =>
      Response.json({ data: null, errors: [{ message: "unavailable" }] }),
    );
    const sync = await loadSync();
    await sync.syncProgress(userId);

    expect(await sync.queueCompletedProgressRun(completedRun())).toBe(true);
    expect(pending(map)).toHaveLength(1);
    expect(mocks.acknowledgeGraphQLRun).not.toHaveBeenCalled();
  });

  it("rejects malformed GraphQL error envelopes", async () => {
    const map = mockStorage();
    mockGraphQL((call) => {
      const response = success(call);
      return response.json().then((payload) =>
        Response.json({
          ...(payload as object),
          errors: { message: "malformed" },
        }),
      );
    });
    const sync = await loadSync();
    await sync.syncProgress(userId);

    expect(await sync.queueCompletedProgressRun(completedRun())).toBe(true);
    expect(pending(map)).toHaveLength(1);
    expect(mocks.acknowledgeGraphQLRun).not.toHaveBeenCalled();
  });

  it("keeps the outbox until the compatibility view is refreshed", async () => {
    const map = mockStorage();
    const calls = mockGraphQL();
    mocks.acknowledgeGraphQLRun
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const sync = await loadSync();
    await sync.syncProgress(userId);

    await sync.queueCompletedProgressRun(completedRun());
    expect(pending(map)).toHaveLength(1);

    await sync.syncProgress(userId);
    expect(calls).toHaveLength(24);
    expect(pending(map)).toHaveLength(0);
  });

  it("rejects invalid or conflicting snapshots", async () => {
    const map = mockStorage();
    mockGraphQL();
    const sync = await loadSync();
    const invalid = completedRun();
    invalid.items[0].attempt.answer = "x".repeat(8_193);

    expect(await sync.queueCompletedProgressRun(invalid)).toBe(false);
    expect(pending(map)).toHaveLength(0);

    const run = completedRun();
    expect(await sync.queueCompletedProgressRun(run)).toBe(true);
    const conflict = completedRun();
    conflict.items[0].attempt.outcome = "INCORRECT";
    expect(await sync.queueCompletedProgressRun(conflict)).toBe(false);
    expect(pending(map)[0].run.items[0].attempt.outcome).toBe("CORRECT");
  });

  it("clears account-bound progress on sign-out", async () => {
    const map = mockStorage();
    mockGraphQL(() => new Response(null, { status: 503 }));
    const sync = await loadSync();
    await sync.syncProgress(userId);
    await sync.queueCompletedProgressRun(completedRun());

    expect(pending(map)[0].ownerId).toBe(userId);
    sync.clearProgressSync();

    expect(pending(map)).toHaveLength(0);
  });

  it("invalidates the active owner when authentication data is malformed", async () => {
    const map = mockStorage();
    const calls = mockGraphQL(() => new Response(null, { status: 503 }));
    const sync = await loadSync();
    await sync.syncProgress(userId);
    await sync.queueCompletedProgressRun(completedRun());

    await sync.syncProgress("invalid-user-id");
    await sync.queueCompletedProgressRun(
      completedRun("b0e47478-813c-42f6-9256-e75f87081390"),
    );

    expect(calls).toHaveLength(1);
    expect(pending(map).map((entry) => entry.ownerId)).toEqual([userId, null]);
  });

  it("ignores malformed sync receipts", async () => {
    const map = mockStorage();
    map.set(
      RECEIPT_STORAGE_KEY,
      JSON.stringify({ version: 1, runIds: ["not-a-uuid"] }),
    );
    mockGraphQL();
    const sync = await loadSync();

    expect(sync.isProgressRunSynced(runId)).toBe(false);
    expect(await sync.queueCompletedProgressRun(completedRun())).toBe(true);
    expect(pending(map)).toHaveLength(1);
  });

  it("stops an in-flight lifecycle when the authenticated owner changes", async () => {
    const map = mockStorage();
    let resolveRequest: ((response: Response) => void) | undefined;
    const calls = mockGraphQL(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const sync = await loadSync();
    await sync.syncProgress(userId);

    const queued = sync.queueCompletedProgressRun(completedRun());
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    sync.clearProgressSync();
    resolveRequest?.(success(calls[0]));
    await queued;

    expect(calls).toHaveLength(1);
    expect(pending(map)).toHaveLength(0);
    expect(mocks.acknowledgeGraphQLRun).not.toHaveBeenCalled();
  });
});
