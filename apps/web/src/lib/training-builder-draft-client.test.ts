import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchServerTrainingBuilderDraft,
  parseServerTrainingBuilderDraft,
  saveServerTrainingBuilderDraft,
  TrainingBuilderDraftGraphQLError,
} from "./training-builder-draft-client";
import type { TrainingBuilderDraft } from "./training-builder";

const draft: TrainingBuilderDraft = {
  version: 1,
  blueprintVersion: "2026.1",
  quantities: { 10: 1, 1: 3, 4: 2 },
  difficulty: "balanced",
  onlyNew: true,
  shuffle: true,
  prioritizeMistakes: false,
};

const serverDraft = {
  blueprintVersion: "2026.1",
  quantities: [
    { examPosition: 1, quantity: 3 },
    { examPosition: 4, quantity: 2 },
    { examPosition: 10, quantity: 1 },
  ],
  difficulty: "BALANCED",
  onlyNew: true,
  shuffle: true,
  prioritizeMistakes: false,
  version: 7,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("training builder draft GraphQL client", () => {
  it("parses a complete bounded server draft", () => {
    expect(parseServerTrainingBuilderDraft(serverDraft)).toEqual({
      draft: {
        ...draft,
        quantities: { 1: 3, 4: 2, 10: 1 },
      },
      serverVersion: 7,
    });
  });

  it("rejects malformed server drafts", () => {
    for (const value of [
      null,
      { ...serverDraft, blueprintVersion: "ftn-p1:2026.1" },
      { ...serverDraft, quantities: null },
      {
        ...serverDraft,
        quantities: [
          { examPosition: 1, quantity: 1 },
          { examPosition: 1, quantity: 2 },
        ],
      },
      {
        ...serverDraft,
        quantities: [{ examPosition: 0, quantity: 1 }],
      },
      {
        ...serverDraft,
        quantities: [{ examPosition: 11, quantity: 1 }],
      },
      {
        ...serverDraft,
        quantities: [{ examPosition: 1, quantity: 0 }],
      },
      {
        ...serverDraft,
        quantities: [{ examPosition: 1, quantity: 11 }],
      },
      {
        ...serverDraft,
        quantities: [
          { examPosition: 1, quantity: 6 },
          { examPosition: 2, quantity: 5 },
        ],
      },
      { ...serverDraft, difficulty: "EXPERT" },
      { ...serverDraft, difficulty: "balanced" },
      { ...serverDraft, onlyNew: "yes" },
      { ...serverDraft, version: 0 },
      { ...serverDraft, version: 1.5 },
      { ...serverDraft, version: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
      expect(parseServerTrainingBuilderDraft(value)).toBeNull();
    }
  });

  it("reads nullable state and sends a sorted exact replacement", async () => {
    const calls: GraphQLCall[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const call = JSON.parse(init?.body as string) as GraphQLCall;
        calls.push(call);
        if (call.operationName === "TrainingBuilderDraft") {
          return Response.json({ data: { trainingBuilderDraft: null } });
        }
        return Response.json({
          data: { saveTrainingBuilderDraft: serverDraft },
        });
      }),
    );

    await expect(fetchServerTrainingBuilderDraft()).resolves.toBeNull();
    await expect(saveServerTrainingBuilderDraft(6, draft)).resolves.toEqual({
      draft: {
        ...draft,
        quantities: { 1: 3, 4: 2, 10: 1 },
      },
      serverVersion: 7,
    });
    expect(calls.map(({ operationName }) => operationName)).toEqual([
      "TrainingBuilderDraft",
      "SaveTrainingBuilderDraft",
    ]);
    expect(calls[1]?.variables).toEqual({
      input: {
        expectedVersion: 6,
        blueprintVersion: "2026.1",
        quantities: [
          { examPosition: 1, quantity: 3 },
          { examPosition: 4, quantity: 2 },
          { examPosition: 10, quantity: 1 },
        ],
        difficulty: "BALANCED",
        onlyNew: true,
        shuffle: true,
        prioritizeMistakes: false,
      },
    });
  });

  it("preserves coded conflicts and rejects malformed envelopes", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(
      Response.json({
        data: null,
        errors: [{ message: "changed", extensions: { code: "CONFLICT" } }],
      }),
    );
    const conflict = await saveServerTrainingBuilderDraft(1, draft).catch(
      (error: unknown) => error,
    );
    expect(conflict).toBeInstanceOf(TrainingBuilderDraftGraphQLError);
    expect(conflict).toMatchObject({ code: "CONFLICT" });

    for (const payload of [
      { data: { trainingBuilderDraft: null }, errors: { message: "bad" } },
      { data: {} },
      { data: { trainingBuilderDraft: { blueprintVersion: "2026.1" } } },
    ]) {
      fetchMock.mockResolvedValueOnce(Response.json(payload));
      await expect(fetchServerTrainingBuilderDraft()).rejects.toThrow();
    }
  });

  it("rejects invalid versions and non-success HTTP responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    await expect(saveServerTrainingBuilderDraft(-1, draft)).rejects.toThrow(
      "expected version",
    );
    await expect(fetchServerTrainingBuilderDraft()).rejects.toThrow(
      "status 503",
    );
  });
});

type GraphQLCall = {
  operationName: string;
  variables: Record<string, unknown>;
};
