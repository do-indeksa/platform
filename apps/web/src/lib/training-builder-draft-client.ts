import {
  TRAINING_BUILDER_DRAFT_VERSION,
  TRAINING_BUILDER_MAX_TASKS,
  type TrainingBuilderDifficulty,
  type TrainingBuilderDraft,
} from "./training-builder";

const TRAINING_BUILDER_DRAFT_QUERY = `
  query TrainingBuilderDraft {
    trainingBuilderDraft {
      blueprintVersion
      quantities { examPosition quantity }
      difficulty
      onlyNew
      shuffle
      prioritizeMistakes
      version
    }
  }
`;

const SAVE_TRAINING_BUILDER_DRAFT_MUTATION = `
  mutation SaveTrainingBuilderDraft($input: SaveTrainingBuilderDraftInput!) {
    saveTrainingBuilderDraft(input: $input) {
      blueprintVersion
      quantities { examPosition quantity }
      difficulty
      onlyNew
      shuffle
      prioritizeMistakes
      version
    }
  }
`;

const blueprintVersionPattern = /^[0-9]{4}[.][0-9]+$/;

export type ServerTrainingBuilderDraft = {
  draft: TrainingBuilderDraft;
  serverVersion: number;
};

export class TrainingBuilderDraftGraphQLError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "TrainingBuilderDraftGraphQLError";
  }
}

export async function fetchServerTrainingBuilderDraft(
  signal?: AbortSignal,
): Promise<ServerTrainingBuilderDraft | null> {
  const value = await requestTrainingBuilderDraftGraphQL(
    "TrainingBuilderDraft",
    TRAINING_BUILDER_DRAFT_QUERY,
    {},
    "trainingBuilderDraft",
    signal,
  );
  if (value === null) return null;
  const parsed = parseServerTrainingBuilderDraft(value);
  if (parsed === null) {
    throw new Error("training builder draft query returned invalid data");
  }
  return parsed;
}

export async function saveServerTrainingBuilderDraft(
  expectedVersion: number,
  draft: TrainingBuilderDraft,
  signal?: AbortSignal,
): Promise<ServerTrainingBuilderDraft> {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    throw new Error("training builder draft expected version is invalid");
  }
  const quantities = Object.entries(draft.quantities)
    .map(([examPosition, quantity]) => ({
      examPosition: Number(examPosition),
      quantity,
    }))
    .toSorted((left, right) => left.examPosition - right.examPosition);
  const value = await requestTrainingBuilderDraftGraphQL(
    "SaveTrainingBuilderDraft",
    SAVE_TRAINING_BUILDER_DRAFT_MUTATION,
    {
      input: {
        expectedVersion,
        blueprintVersion: draft.blueprintVersion,
        quantities,
        difficulty: draft.difficulty.toUpperCase(),
        onlyNew: draft.onlyNew,
        shuffle: draft.shuffle,
        prioritizeMistakes: draft.prioritizeMistakes,
      },
    },
    "saveTrainingBuilderDraft",
    signal,
  );
  const parsed = parseServerTrainingBuilderDraft(value);
  if (parsed === null) {
    throw new Error("training builder draft mutation returned invalid data");
  }
  return parsed;
}

export function parseServerTrainingBuilderDraft(
  value: unknown,
): ServerTrainingBuilderDraft | null {
  if (
    !isRecord(value) ||
    typeof value.blueprintVersion !== "string" ||
    value.blueprintVersion.length > 16 ||
    !blueprintVersionPattern.test(value.blueprintVersion) ||
    !Array.isArray(value.quantities) ||
    value.quantities.length > 10 ||
    typeof value.difficulty !== "string" ||
    typeof value.onlyNew !== "boolean" ||
    typeof value.shuffle !== "boolean" ||
    typeof value.prioritizeMistakes !== "boolean" ||
    !Number.isSafeInteger(value.version) ||
    (value.version as number) < 1
  ) {
    return null;
  }
  const difficulty = parseServerDifficulty(value.difficulty);
  if (difficulty === null) return null;

  const quantities: Record<number, number> = {};
  let total = 0;
  for (const entry of value.quantities) {
    if (
      !isRecord(entry) ||
      !Number.isSafeInteger(entry.examPosition) ||
      (entry.examPosition as number) < 1 ||
      (entry.examPosition as number) > 10 ||
      !Number.isSafeInteger(entry.quantity) ||
      (entry.quantity as number) < 1 ||
      (entry.quantity as number) > TRAINING_BUILDER_MAX_TASKS ||
      quantities[entry.examPosition as number] !== undefined
    ) {
      return null;
    }
    total += entry.quantity as number;
    if (total > TRAINING_BUILDER_MAX_TASKS) return null;
    quantities[entry.examPosition as number] = entry.quantity as number;
  }

  return {
    draft: {
      version: TRAINING_BUILDER_DRAFT_VERSION,
      blueprintVersion: value.blueprintVersion,
      quantities,
      difficulty,
      onlyNew: value.onlyNew,
      shuffle: value.shuffle,
      prioritizeMistakes: value.prioritizeMistakes,
    },
    serverVersion: value.version as number,
  };
}

async function requestTrainingBuilderDraftGraphQL(
  operationName: string,
  query: string,
  variables: Record<string, unknown>,
  field: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch("/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal,
    body: JSON.stringify({ operationName, query, variables }),
  });
  if (!response.ok) {
    throw new Error(
      `training builder draft failed with status ${response.status}`,
    );
  }
  const payload: unknown = await response.json();
  if (!isRecord(payload)) {
    throw new Error("training builder draft returned an invalid response");
  }
  if (
    payload.errors !== undefined &&
    (!Array.isArray(payload.errors) || payload.errors.length > 0)
  ) {
    const first = Array.isArray(payload.errors) ? payload.errors[0] : null;
    const code =
      isRecord(first) &&
      isRecord(first.extensions) &&
      typeof first.extensions.code === "string"
        ? first.extensions.code
        : "GRAPHQL_ERROR";
    const message =
      isRecord(first) && typeof first.message === "string"
        ? first.message
        : "training builder draft request failed";
    throw new TrainingBuilderDraftGraphQLError(message, code);
  }
  if (!isRecord(payload.data) || !(field in payload.data)) {
    throw new Error("training builder draft returned an invalid response");
  }
  return payload.data[field];
}

function parseServerDifficulty(
  value: string,
): TrainingBuilderDifficulty | null {
  switch (value) {
    case "FOUNDATION":
      return "foundation";
    case "BALANCED":
      return "balanced";
    case "ADVANCED":
      return "advanced";
    default:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
